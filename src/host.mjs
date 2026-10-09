import net from "node:net";
import { randomUUID } from "node:crypto";
import { DEFAULT_BIND, DEFAULT_PORT, HELLO_TIMEOUT_MS, MAX_OUTBOUND_BYTES_PER_PEER, MAX_PENDING_CONNECTIONS, MAX_REQUESTS_PER_SECOND, MAX_SESSION_MESSAGES, MAX_STRING_LENGTH } from "./constants.mjs";
import { FrameDecoder, decodeFrame, encodeFrame, makeBody } from "./protocol.mjs";
import { HostAuthority, ProtocolError } from "./lockstep.mjs";
import {ownerProofClockCurrent} from './vehicle-owner-proof.mjs';
import { SessionCoordinator } from "./session-coordinator.mjs";
import { connectClient } from "./client.mjs";

export function startHost({ secret, sessionId = randomUUID(), bind = DEFAULT_BIND, port = DEFAULT_PORT, buildHash, modManifestHash, requiredSave = null, expiresAt = null, getUpdateCount = () => 0, resolveEntityOwner = () => null, inspectVehicleOwner = null, inspectRoadPreflight = null, admissionAllowed = () => true, logger = () => {}, legacyModelRelay = false, requireReleaseAck = true, soloStopTest = false, leadUpdates, coordinationTimeoutMs }) {
  if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())) throw new RangeError("session expiry must be a future Unix timestamp in milliseconds");
  if(inspectVehicleOwner!==null&&typeof inspectVehicleOwner!=='function')throw new TypeError('INVALID_VEHICLE_OWNER_INSPECTOR');
  if(inspectRoadPreflight!==null&&typeof inspectRoadPreflight!=='function')throw new TypeError('INVALID_ROAD_PREFLIGHT_INSPECTOR');
  const authority = new HostAuthority({ sessionId, buildHash, modManifestHash, resolveEntityOwner,
    ...(leadUpdates===undefined?{}:{leadUpdates}) });
  const peers = new Set();
  // Entries are created only by connectLocalParticipant below.  A loopback
  // socket alone is not proof that the host game has a bound engine adapter.
  const localParticipants = new Map();
  const pendingLocalPlayerIds = new Set();
  let pendingLocalConnections = 0;
  const sessionSeen = new Set();
  let pendingConnections = 0;
  let serverSequence = 0;
  let actionAdmissionPending = false;
  const send = (socket, kind, payload, playerId = null) => {
    if (socket.destroyed) return false;
    const frame = encodeFrame(secret, makeBody({ kind, sequence: ++serverSequence, sessionId, playerId, payload }));
    if (socket.writableLength + frame.length > MAX_OUTBOUND_BYTES_PER_PEER) {
      logger({ level: "warn", event: "peer_error", code: "OUTBOUND_BACKPRESSURE" });
      socket.destroy();
      return false;
    }
    return socket.write(frame);
  };
  const broadcast = (kind, payload) => { for (const peer of peers) if (peer.player) send(peer.socket, kind, payload, peer.player.playerId); };
  const coordinator = new SessionCoordinator({ requireReleaseAck, soloStopTest,
    ...(coordinationTimeoutMs===undefined?{}:{timeoutMs:coordinationTimeoutMs}),
    broadcast: (kind, payload) => {
    broadcast(kind, payload);
    if (kind === "session_halted" && coordinator.divergence)
      logger({ level: "warn", event: "session_divergence", sessionId, buildHash,
        modManifestHash, ...coordinator.divergence });
    logger({ level: kind === "session_halted" ? "warn" : "info", event: kind, code: payload.code, hostSequence: payload.hostSequence });
  } });
  const server = net.createServer((socket) => {
    if (expiresAt !== null && Date.now() > expiresAt) { logger({ level: "warn", event: "expired_connection_rejected" }); socket.destroy(); return; }
    if (pendingConnections >= MAX_PENDING_CONNECTIONS) { socket.destroy(); return; }
    pendingConnections++;
    socket.setNoDelay(true);
    socket.setTimeout(HELLO_TIMEOUT_MS, () => { if (!peer.player) socket.destroy(); });
    const peer = { socket, player: null, pending: true, ready: requiredSave === null, companyClaim: null, clockUpdateCount: null, decoder: new FrameDecoder(), count: 0, window: Date.now(), lastSequence: -1, seen: new Set() };
    peers.add(peer);
    socket.on("data", (chunk) => {
      try {
        for (const frame of peer.decoder.push(chunk)) {
          const body = decodeFrame(secret, frame);
          const now = Date.now();
          if (now - peer.window >= 1000) { peer.window = now; peer.count = 0; }
          if (++peer.count > MAX_REQUESTS_PER_SECOND) throw new ProtocolError("RATE_LIMIT", "too many requests");
          if (body.sessionId !== sessionId || body.sequence <= peer.lastSequence || peer.seen.has(body.messageId) || sessionSeen.has(body.messageId)) throw new ProtocolError("REPLAY", "stale or duplicate message");
          if (sessionSeen.size >= MAX_SESSION_MESSAGES) throw new ProtocolError("SESSION_MESSAGE_LIMIT", "session message budget exhausted");
          peer.lastSequence = body.sequence; peer.seen.add(body.messageId);
          sessionSeen.add(body.messageId);
          if (peer.diagnostic) {
            if (body.playerId !== null || body.kind !== "diagnostic_ping" || Object.keys(body.payload).join(",") !== "challenge" || !/^[0-9a-f]{32}$/.test(body.payload.challenge)) {
              throw new ProtocolError("DIAGNOSTIC_ONLY", "diagnostic connections cannot join or send gameplay commands");
            }
            send(socket, "diagnostic_pong", { challenge: body.payload.challenge });
            logger({ level: "info", event: "diagnostic_ping_succeeded" });
            continue;
          }
          if (!peer.player) {
            if (body.kind === "diagnostic_hello") {
              if (body.playerId !== null || Object.keys(body.payload).length !== 0) throw new ProtocolError("BAD_DIAGNOSTIC", "empty diagnostic hello required");
              peer.diagnostic = true;
              // Keep diagnostic sockets in the pending budget. They are not players.
              socket.setTimeout(15_000);
              send(socket, "diagnostic_ready", { save: requiredSave, modManifestHash, gameplayVerified: false });
              logger({ level: "info", event: "diagnostic_connected", gameplayVerified: false });
              continue;
            }
            if (!admissionAllowed()) throw new ProtocolError("VEHICLE_TEST_ACTIVE", "host is running a local-only vehicle test");
            if (expiresAt !== null && now >= expiresAt) throw new ProtocolError("SESSION_EXPIRED", "join deadline passed");
            if (body.kind !== "hello") throw new ProtocolError("HELLO_REQUIRED", "first message must be hello");
            if (coordinator.locked) throw new ProtocolError("ROSTER_LOCKED", "new participants require a new session");
            peer.player = authority.admit(body.payload);
            peer.pending = false;
            pendingConnections--;
            socket.setTimeout(0);
            send(socket, "admitted", { player: peer.player, players: authority.players(), save: requiredSave }, peer.player.playerId);
            broadcast("peer_joined", { player: peer.player });
            logger({ level: "info", event: "peer_admitted", playerId: peer.player.playerId });
            continue;
          }
          if (body.playerId !== peer.player.playerId) throw new ProtocolError("IDENTITY_MISMATCH", "message player ID differs");
          if (["participant_ready", "participant_heartbeat", "command_prepared", "command_applied", "participant_released"].includes(body.kind)) {
            if (!peer.ready) throw new ProtocolError("SAVE_REQUIRED", "verify the save first");
            if (body.kind === "participant_ready") {
              coordinator.ready(peer.player.playerId, body.payload);
              peer.clockUpdateCount=body.payload.updateCount;
              logger({level:'info',event:'peer_checkpoint_ready',playerId:peer.player.playerId,
                roundId:body.payload.roundId,updateCount:body.payload.updateCount,
                checkpointHash:body.payload.checkpointHash,companyEntity:body.payload.companyEntity,
                gameplayVerified:false});
            }
            if (body.kind === "participant_heartbeat") {
              coordinator.heartbeat(peer.player.playerId, body.payload);
              peer.clockUpdateCount=body.payload.updateCount;
            }
            if (body.kind === "command_prepared") {
              coordinator.prepared(peer.player.playerId, body.payload, getUpdateCount());
              peer.clockUpdateCount=body.payload.updateCount;
            }
            if (body.kind === "command_applied") {
              coordinator.applied(peer.player.playerId, body.payload);
              peer.clockUpdateCount=body.payload.updateCount;
              logger({level:'info',event:'peer_command_applied',playerId:peer.player.playerId,
                roundId:body.payload.roundId,hostSequence:body.payload.hostSequence,
                updateCount:body.payload.updateCount,stateHash:body.payload.stateHash,
                gameplayVerified:false});
            }
            if (body.kind === "participant_released") {
              coordinator.released(peer.player.playerId, body.payload);
              peer.clockUpdateCount=body.payload.updateCount;
              logger({level:'info',event:'peer_barrier_released',playerId:peer.player.playerId,
                roundId:body.payload.roundId,hostSequence:body.payload.hostSequence,
                releaseUpdate:body.payload.releaseUpdate,updateCount:body.payload.updateCount,
                gameplayVerified:false});
            }
            continue;
          }
          if (body.kind === "save_ready") {
            const keys = Object.keys(body.payload).sort();
            if (!requiredSave || keys.join(",") !== "bytes,sha256" || body.payload.bytes !== requiredSave.bytes || body.payload.sha256 !== requiredSave.sha256) {
              throw new ProtocolError("SAVE_MISMATCH", "client did not verify the authoritative save");
            }
            peer.ready = true;
            send(socket, "session_ready", { saveSha256: requiredSave.sha256 }, peer.player.playerId);
            logger({ level: "info", event: "peer_save_ready", playerId: peer.player.playerId, sha256: requiredSave.sha256 });
          }
          else if (body.kind === "company_claim") {
            // A signed claim is a lobby proposal, not engine ownership proof.
            // Capture must independently inspect every proposed entity in TF3,
            // and each participant's bindSession rechecks its own local player.
            if (!requiredSave || !peer.ready || localParticipants.has(peer.player.playerId)
              || coordinator.locked || peer.companyClaim !== null
              || Object.keys(body.payload).join(",") !== "companyEntity"
              || !Number.isSafeInteger(body.payload.companyEntity)
              || body.payload.companyEntity < 1 || body.payload.companyEntity > 2147483647)
              throw new ProtocolError("INVALID_COMPANY_CLAIM", "one saved remote company proposal is allowed before capture");
            peer.companyClaim = body.payload.companyEntity;
            logger({ level: "info", event: "peer_company_claim", playerId: peer.player.playerId,
              companyEntity: peer.companyClaim, engineVerified: false });
          }
          else if (body.kind === "test") {
            if (Object.keys(body.payload).length !== 1 || typeof body.payload.value !== "string"
                || body.payload.value.length < 1 || body.payload.value.length > MAX_STRING_LENGTH) {
              throw new ProtocolError("BAD_TEST_MESSAGE", `test value must be a 1..${MAX_STRING_LENGTH} character string`);
            }
            send(socket, "test_echo", { value: body.payload.value }, peer.player.playerId);
          }
          else if (body.kind === "action_request" || body.kind === "speed_request") {
            if(body.kind==='speed_request'&&body.payload?.commandType!=='simulation.speed'){
              send(socket,'command_rejected',{requestMessageId:body.messageId,code:'BAD_COMMAND_ENVELOPE'},peer.player.playerId);
              continue;
            }
            // Legacy relay has no engine-held construction boundary. The
            // production coordinator requires every participant to prepare,
            // execute and report the road postcondition before release.
            if(legacyModelRelay&&body.payload?.commandType==='road.stop.place'){
              send(socket,'command_rejected',{requestMessageId:body.messageId,code:'ROAD_STOP_ENGINE_UNAVAILABLE'},peer.player.playerId);
              continue;
            }
            if(actionAdmissionPending){
              send(socket,"command_rejected",{requestMessageId:body.messageId,code:'COMMAND_ADMISSION_BUSY'},peer.player.playerId);
              continue;
            }
            actionAdmissionPending=true;
            // Keep one host-wide admission in flight while the engine provides
            // its target-specific ownership receipt. Control traffic continues
            // to flow; a second action cannot overtake this one.
            void (async()=>{
              try {
                if (!peer.ready) throw new ProtocolError("SAVE_REQUIRED", "authoritative save must be verified before gameplay requests");
                const admissionRound=coordinator.roundId;
                const admissionPlayer=peer.player;
                const admissionCompany=authority.players().find(p=>p.playerId===admissionPlayer.playerId)?.companyEntity;
                const assertAdmissionContext=()=>{
                  if(socket.destroyed||!peer.ready||peer.player!==admissionPlayer
                    ||coordinator.roundId!==admissionRound
                    ||!authority.players().some(p=>p.playerId===admissionPlayer.playerId
                      &&p.companyEntity===admissionCompany))
                    throw new ProtocolError('COORDINATION_NOT_READY','admission participant or round changed');
                };
                const admissionDeadline=Date.now()+Math.min(coordinator.timeoutMs,coordinator.heartbeatMs);
                // Heartbeats and the Host observation arrive independently.
                // Wait for a real Host sample, never promote its clock to a peer's.
                // Keep the original coordinator checks and one admission in flight.
                const admissionUpdate=async(initialUpdate=getUpdateCount())=>{
                  let update=initialUpdate;
                  const ahead=()=>[...peers].some(member=>member.player
                    &&member.clockUpdateCount!==null&&member.clockUpdateCount>update);
                  const startedAt=Date.now();
                  let waited=false;
                  while(!legacyModelRelay&&coordinator.phase==='running'
                    &&!socket.destroyed&&Number.isSafeInteger(update)&&update>=0
                    &&ahead()&&Date.now()<admissionDeadline){
                    if(!waited)logger({level:'info',event:'host_action_clock_wait',
                      roundId:coordinator.roundId,hostUpdateCount:update});
                    waited=true;
                    await new Promise(resolve=>setTimeout(resolve,25));
                    update=getUpdateCount();
                  }
                  if(waited)logger({level:'info',event:'host_action_clock_wait_finished',
                    roundId:coordinator.roundId,hostUpdateCount:update,
                    durationMs:Date.now()-startedAt,caughtUp:!ahead()});
                  if(!legacyModelRelay&&Date.now()>=admissionDeadline){
                    coordinator.halt('CLOCK_MISMATCH');
                    throw new ProtocolError('CLOCK_MISMATCH','Host observation did not qualify within the admission budget');
                  }
                  return update;
                };
                const observedHostUpdate=!legacyModelRelay?getUpdateCount():null;
                if(!legacyModelRelay){
                  for(const member of peers)if(member.player&&member.clockUpdateCount!==null)
                    logger({level:'info',event:'host_action_clock',roundId:coordinator.roundId,
                      playerId:member.player.playerId,hostUpdateCount:observedHostUpdate,
                      peerUpdateCount:member.clockUpdateCount});
                }
                const entryHostUpdate=!legacyModelRelay?await admissionUpdate(observedHostUpdate):null;
                assertAdmissionContext();
                let verifiedOwner;
                let verifiedRoad;
                if(body.kind==='action_request'&&body.payload?.commandType==='vehicle.setRunning'&&inspectVehicleOwner!==null){
                  const request=body.payload;
                  const boundPlayer=authority.players().find(p=>p.playerId===peer.player.playerId);
                  if(request.originPlayerId!==peer.player.playerId
                    ||request.targetCompanyEntity!==boundPlayer?.companyEntity
                    ||!Number.isSafeInteger(request.targetEntity)||request.targetEntity<1)
                    throw new ProtocolError('NOT_OWNER','vehicle request identity or target is invalid');
                  if(!request.payload||typeof request.payload!=='object'||Array.isArray(request.payload)
                    ||typeof request.payload.running!=='boolean'
                    ||Object.keys(request.payload).some(key=>key!=='running'))
                    throw new ProtocolError('BAD_RUNNING_STATE','vehicle request payload is invalid');
                  if(!legacyModelRelay)coordinator.beforeCommand(entryHostUpdate);
                  let proof;
                  try{proof=await inspectVehicleOwner({targetEntity:request.targetEntity,
                    targetCompanyEntity:request.targetCompanyEntity});}
                  catch{throw new ProtocolError('OWNERSHIP_UNAVAILABLE','engine owner inspection did not complete');}
                  if(socket.destroyed||!authority.players().some(p=>p.playerId===peer.player.playerId)
                    ||proof?.entity!==request.targetEntity||proof?.company!==request.targetCompanyEntity
                    ||proof?.outcome!=='found')
                    throw new ProtocolError('OWNERSHIP_UNAVAILABLE','engine owner receipt is stale or mismatched');
                  verifiedOwner=proof;
                }
                if(body.kind==='action_request'&&body.payload?.commandType==='road.stop.place'){
                  if(inspectRoadPreflight===null)
                    throw new ProtocolError('ROAD_PREFLIGHT_UNAVAILABLE','read-only TF3 road inspection is required');
                  const request=body.payload;
                  const boundPlayer=authority.players().find(p=>p.playerId===peer.player.playerId);
                  if(request.originPlayerId!==peer.player.playerId
                    ||request.targetCompanyEntity!==boundPlayer?.companyEntity
                    ||!Number.isSafeInteger(request.targetEntity)||request.targetEntity<1)
                    throw new ProtocolError('NOT_OWNER','road request identity or company is invalid');
                  if(!legacyModelRelay)coordinator.beforeCommand(entryHostUpdate);
                  try{verifiedRoad=await inspectRoadPreflight({entity:request.targetEntity,
                    company:request.targetCompanyEntity});}
                  catch{throw new ProtocolError('ROAD_PREFLIGHT_UNAVAILABLE','TF3 road inspection did not complete');}
                  if(socket.destroyed||!authority.players().some(p=>p.playerId===peer.player.playerId
                    &&p.companyEntity===request.targetCompanyEntity)
                    ||verifiedRoad?.entity!==request.targetEntity
                    ||verifiedRoad?.company!==request.targetCompanyEntity
                    ||verifiedRoad?.outcome!=='found'
                    ||verifiedRoad.ownerCompany!==0
                      &&verifiedRoad.ownerCompany!==request.targetCompanyEntity)
                    throw new ProtocolError('ROAD_PREFLIGHT_UNAVAILABLE','road receipt is stale or mismatched');
                }
                // One sampled update drives authority acceptance and proposal.
                const hostUpdate=legacyModelRelay?getUpdateCount():await admissionUpdate();
                assertAdmissionContext();
                if(verifiedRoad!==undefined
                  &&!ownerProofClockCurrent({issuedUpdate:verifiedRoad.issuedUpdate,
                    receiptUpdate:verifiedRoad.updateCount,hostUpdate,paused:verifiedRoad.paused}))
                  throw new ProtocolError('ROAD_PREFLIGHT_UNAVAILABLE','road receipt is stale');
                if(verifiedOwner!==undefined){
                  if(!ownerProofClockCurrent({issuedUpdate:verifiedOwner.issuedUpdate,
                    receiptUpdate:verifiedOwner.updateCount,hostUpdate,paused:verifiedOwner.paused}))
                    throw new ProtocolError('OWNERSHIP_UNAVAILABLE','engine owner receipt is stale');
                  verifiedOwner=verifiedOwner.company;
                }
                if (!legacyModelRelay) coordinator.beforeCommand(hostUpdate);
                const accepted = authority.accept({ ...body.payload, messageId: body.messageId }, hostUpdate,
                  peer.player.playerId,verifiedOwner);
                if (legacyModelRelay) broadcast("command_accepted", { command: accepted });
                else coordinator.propose(accepted, hostUpdate);
                logger({ level: "info", event: legacyModelRelay ? "command_accepted" : "command_proposed",
                  playerId: peer.player.playerId, roundId:coordinator.roundId,hostSequence: accepted.hostSequence,
                  admissionUpdate:hostUpdate,scheduledUpdate:accepted.scheduledUpdate,
                  scheduleLeadUpdates:accepted.scheduledUpdate-hostUpdate });
              } catch (error) {
                const code=error instanceof ProtocolError?error.code:'OWNERSHIP_UNAVAILABLE';
                send(socket, "command_rejected", { requestMessageId: body.messageId, code }, peer.player.playerId);
                logger({ level: "info", event: "command_rejected", playerId: peer.player.playerId, code });
              } finally {actionAdmissionPending=false;}
            })();
          } else throw new ProtocolError("UNEXPECTED_KIND", "message kind not accepted from client");
        }
      } catch (error) {
        const code = error instanceof ProtocolError ? error.code : "BAD_MESSAGE";
        try { send(socket, "error", { code, message: error.message }, peer.player?.playerId ?? null); } catch {}
        logger({ level: "warn", event: "peer_error", code });
        socket.destroy();
      }
    });
    socket.on("close", () => {
      peers.delete(peer);
      if (peer.pending) { peer.pending = false; pendingConnections--; }
      if (peer.player) { localParticipants.delete(peer.player.playerId); coordinator.disconnected(peer.player.playerId); authority.remove(peer.player.playerId); broadcast("peer_left", { playerId: peer.player.playerId }); logger({level:"warn",event:"peer_left",playerId:peer.player.playerId}); }
    });
    socket.on("error", () => {});
  });
  server.maxConnections = MAX_PENDING_CONNECTIONS + 4;
  const coordinationTimer = setInterval(() => coordinator.poll(getUpdateCount()), 250);
  coordinationTimer.unref();
  server.on("close", () => clearInterval(coordinationTimer));
  server.listen(port, bind);
  const localEndpoint = () => {
    if (!server.listening) throw new Error("HOST_NOT_LISTENING");
    const address = server.address();
    if (!address || typeof address === "string" || !Number.isSafeInteger(address.port)) throw new Error("HOST_LOCAL_ENDPOINT_UNAVAILABLE");
    const host = address.address === "0.0.0.0" ? "127.0.0.1" : address.address === "::" ? "::1" : address.address;
    return { host, port: address.port };
  };
  const ensureCaptureReady=()=>{
    if ([...peers].some(p => p.player && !p.ready)) throw new ProtocolError("SAVE_REQUIRED", "all participants must verify the save");
    if (pendingLocalConnections !== 0 || pendingLocalPlayerIds.size !== 0
      || [...localParticipants.values()].some(attachment => attachment.attached !== true && attachment.captureReady !== true)) {
      throw new ProtocolError("LOCAL_ENGINE_BINDING_REQUIRED", "host-local capture adapter must be registered before coordination");
    }
  };
  return { server, authority, sessionId, coordinator,
    ensureCaptureReady,
    companyClaims() { return [...peers].filter(peer => peer.player && peer.companyClaim !== null)
      .map(peer => Object.freeze({ playerId: peer.player.playerId, companyEntity: peer.companyClaim })); },
    // This is deliberately a real authenticated loopback client: local host
    // actions enter the same decoder, identity, save, authority and coordinator
    // branches as remote actions.  The wrapper in host-local-participant.mjs
    // supplies the mandatory engine-binding/adapter lifecycle.
    connectLocalTransport({ displayName, onMessage = () => {} }) {
      if (typeof displayName !== "string" || typeof onMessage !== "function") throw new TypeError("INVALID_LOCAL_TRANSPORT_OPTIONS");
      pendingLocalConnections++;
      let admittedPlayerId = null, settled = false;
      const settlePendingConnection = () => {
        if (!settled) { settled = true; pendingLocalConnections--; }
      };
      return connectClient({ secret, sessionId, ...localEndpoint(), displayName, buildHash, modManifestHash,
        onMessage(message, context) {
          if (message.kind === "admitted" && typeof message.payload?.player?.playerId === "string") {
            admittedPlayerId = message.payload.player.playerId;
            pendingLocalPlayerIds.add(admittedPlayerId);
            settlePendingConnection();
          } else if (message.kind === "session_ended") {
            settlePendingConnection();
            if (admittedPlayerId) pendingLocalPlayerIds.delete(admittedPlayerId);
          }
          onMessage(message, context);
        } });
    },
    registerLocalParticipant(playerId, attachment) {
      if (typeof playerId !== "string" || !authority.players().some(player => player.playerId === playerId)
        || !pendingLocalPlayerIds.has(playerId) || !attachment || typeof attachment.receive !== "function") throw new ProtocolError("LOCAL_ENGINE_BINDING_REQUIRED", "admitted host participant needs an injected engine adapter");
      if (localParticipants.has(playerId)) throw new ProtocolError("LOCAL_ENGINE_BINDING_REQUIRED", "host participant is already registered");
      pendingLocalPlayerIds.delete(playerId);
      localParticipants.set(playerId, attachment);
      return () => localParticipants.delete(playerId);
    },
    beginCoordination(checkpoint) {
      if ([...peers].some(p => p.player && !p.ready)) throw new ProtocolError("SAVE_REQUIRED", "all participants must verify the save");
      if (pendingLocalConnections !== 0 || pendingLocalPlayerIds.size !== 0
        || [...localParticipants.values()].some(attachment => attachment.attached !== true)) {
        throw new ProtocolError("LOCAL_ENGINE_BINDING_REQUIRED", "host-local engine adapter must attach before coordination");
      }
      coordinator.prepare(authority.players(), checkpoint);
    },
    beginCapture({updateCount}) {
      ensureCaptureReady();
      coordinator.capture(authority.players(), {updateCount});
    } };
}
