import net from "node:net";
import { randomUUID } from "node:crypto";
import { DEFAULT_BIND, DEFAULT_PORT, HELLO_TIMEOUT_MS, MAX_OUTBOUND_BYTES_PER_PEER, MAX_PENDING_CONNECTIONS, MAX_REQUESTS_PER_SECOND, MAX_SESSION_MESSAGES, MAX_STRING_LENGTH } from "./constants.mjs";
import { FrameDecoder, decodeFrame, encodeFrame, makeBody } from "./protocol.mjs";
import { HostAuthority, ProtocolError } from "./lockstep.mjs";
import { SessionCoordinator } from "./session-coordinator.mjs";

export function startHost({ secret, sessionId = randomUUID(), bind = DEFAULT_BIND, port = DEFAULT_PORT, buildHash, modManifestHash, requiredSave = null, expiresAt = null, getUpdateCount = () => 0, resolveEntityOwner = () => null, admissionAllowed = () => true, logger = () => {}, legacyModelRelay = false }) {
  if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())) throw new RangeError("session expiry must be a future Unix timestamp in milliseconds");
  const authority = new HostAuthority({ sessionId, buildHash, modManifestHash, resolveEntityOwner });
  const peers = new Set();
  const sessionSeen = new Set();
  let pendingConnections = 0;
  let serverSequence = 0;
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
  const coordinator = new SessionCoordinator({ broadcast: (kind, payload) => {
    broadcast(kind, payload); logger({ level: kind === "session_halted" ? "warn" : "info", event: kind, code: payload.code, hostSequence: payload.hostSequence });
  } });
  const server = net.createServer((socket) => {
    if (expiresAt !== null && Date.now() > expiresAt) { logger({ level: "warn", event: "expired_connection_rejected" }); socket.destroy(); return; }
    if (pendingConnections >= MAX_PENDING_CONNECTIONS) { socket.destroy(); return; }
    pendingConnections++;
    socket.setNoDelay(true);
    socket.setTimeout(HELLO_TIMEOUT_MS, () => { if (!peer.player) socket.destroy(); });
    const peer = { socket, player: null, pending: true, ready: requiredSave === null, decoder: new FrameDecoder(), count: 0, window: Date.now(), lastSequence: -1, seen: new Set() };
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
            if (!admissionAllowed()) throw new ProtocolError("VEHICLE_TEST_ACTIVE", "host is running a local-only vehicle test");
            if (expiresAt !== null && now >= expiresAt) throw new ProtocolError("SESSION_EXPIRED", "join deadline passed");
            if (body.kind === "diagnostic_hello") {
              if (body.playerId !== null || Object.keys(body.payload).length !== 0) throw new ProtocolError("BAD_DIAGNOSTIC", "empty diagnostic hello required");
              peer.diagnostic = true;
              // Keep diagnostic sockets in the pending budget. They are not players.
              socket.setTimeout(15_000);
              send(socket, "diagnostic_ready", { save: requiredSave, modManifestHash, gameplayVerified: false });
              logger({ level: "info", event: "diagnostic_connected", gameplayVerified: false });
              continue;
            }
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
          if (["participant_ready", "participant_heartbeat", "command_prepared", "command_applied"].includes(body.kind)) {
            if (!peer.ready) throw new ProtocolError("SAVE_REQUIRED", "verify the save first");
            if (body.kind === "participant_ready") coordinator.ready(peer.player.playerId, body.payload);
            if (body.kind === "participant_heartbeat") coordinator.heartbeat(peer.player.playerId, body.payload);
            if (body.kind === "command_prepared") coordinator.prepared(peer.player.playerId, body.payload, getUpdateCount());
            if (body.kind === "command_applied") coordinator.applied(peer.player.playerId, body.payload);
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
          else if (body.kind === "test") {
            if (Object.keys(body.payload).length !== 1 || typeof body.payload.value !== "string"
                || body.payload.value.length < 1 || body.payload.value.length > MAX_STRING_LENGTH) {
              throw new ProtocolError("BAD_TEST_MESSAGE", `test value must be a 1..${MAX_STRING_LENGTH} character string`);
            }
            send(socket, "test_echo", { value: body.payload.value }, peer.player.playerId);
          }
          else if (body.kind === "action_request" || body.kind === "speed_request") {
            try {
              if (!peer.ready) throw new ProtocolError("SAVE_REQUIRED", "authoritative save must be verified before gameplay requests");
              if (!legacyModelRelay) coordinator.beforeCommand(getUpdateCount());
              const accepted = authority.accept({ ...body.payload, messageId: body.messageId }, getUpdateCount(), peer.player.playerId);
              if (legacyModelRelay) broadcast("command_accepted", { command: accepted });
              else coordinator.propose(accepted, getUpdateCount());
              logger({ level: "info", event: legacyModelRelay ? "command_accepted" : "command_proposed", playerId: peer.player.playerId, hostSequence: accepted.hostSequence, scheduledUpdate: accepted.scheduledUpdate });
            } catch (error) {
              if (!(error instanceof ProtocolError)) throw error;
              send(socket, "command_rejected", { requestMessageId: body.messageId, code: error.code }, peer.player.playerId);
              logger({ level: "info", event: "command_rejected", playerId: peer.player.playerId, code: error.code });
            }
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
      if (peer.player) { coordinator.disconnected(peer.player.playerId); authority.remove(peer.player.playerId); broadcast("peer_left", { playerId: peer.player.playerId }); }
    });
    socket.on("error", () => {});
  });
  server.maxConnections = MAX_PENDING_CONNECTIONS + 4;
  const coordinationTimer = setInterval(() => coordinator.poll(getUpdateCount()), 250);
  coordinationTimer.unref();
  server.on("close", () => clearInterval(coordinationTimer));
  server.listen(port, bind);
  return { server, authority, sessionId, coordinator,
    beginCoordination(checkpoint) {
      if ([...peers].some(p => p.player && !p.ready)) throw new ProtocolError("SAVE_REQUIRED", "all participants must verify the save");
      coordinator.prepare(authority.players(), checkpoint);
    } };
}
