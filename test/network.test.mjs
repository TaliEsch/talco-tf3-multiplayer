import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { startHost } from "../src/host.mjs";
import { connectClient } from "../src/client.mjs";
import { HostAuthority } from "../src/lockstep.mjs";
import { connectHostLocalParticipant } from "../src/host-local-participant.mjs";
import {createTwoCompanyHostCapture} from '../src/two-company-host-capture.mjs';
import {createHostRosterCapture} from '../src/host-roster-capture.mjs';

const BUILD = "b".repeat(64);
const MODS = "c".repeat(64);
const SECRET = "0123456789abcdef0123456789abcdef";

test("local vehicle experiment blocks remote admission", { timeout: 5000 }, async () => {
  const instance = startHost({ legacyModelRelay: true, secret: SECRET, sessionId: "local-vehicle-only", port: 0, buildHash: BUILD, modManifestHash: MODS, admissionAllowed: () => false });
  await once(instance.server, "listening");
  let handle;
  try {
    const code = await new Promise((resolve, reject) => {
      handle = connectClient({ secret: SECRET, sessionId: instance.sessionId, port: instance.server.address().port, displayName: "Client", buildHash: BUILD, modManifestHash: MODS,
        onMessage(message) {
          if (message.kind === "admitted") reject(new Error("remote client admitted during local test"));
          if (message.kind === "error") resolve(message.payload.code);
          if (message.kind === "transport_error") reject(new Error(message.payload.code));
        } });
    });
    assert.equal(code, "VEHICLE_TEST_ACTIVE");
    assert.equal(instance.authority.players().length, 0);
  } finally { await shutdown(instance.server, handle ? [handle.socket] : []); }
});

test("different executable hashes are rejected before admission or save transfer", { timeout: 5000 }, async () => {
  const instance = startHost({ legacyModelRelay: true, secret: SECRET, sessionId: "version-mismatch", port: 0, buildHash: BUILD, modManifestHash: MODS });
  await once(instance.server, "listening");
  let handle;
  const received = [];
  try {
    const code = await new Promise((resolve, reject) => {
      handle = connectClient({ secret: SECRET, sessionId: "version-mismatch", port: instance.server.address().port, displayName: "Client", buildHash: "d".repeat(64), modManifestHash: MODS,
        onMessage(message) {
          received.push(message.kind);
          if (message.kind === "error") resolve(message.payload.code);
          if (message.kind === "transport_error") reject(new Error(message.payload.code));
        },
      });
    });
    assert.equal(code, "BUILD_MISMATCH");
    assert.equal(received.includes("admitted"), false);
    assert.equal(instance.authority.players().length, 0);
  } finally { await shutdown(instance.server, handle ? [handle.socket] : []); }
});

async function shutdown(server, sockets = []) {
  const socketClosures = sockets.filter((socket) => !socket.destroyed).map((socket) => once(socket, "close"));
  for (const socket of sockets) socket.destroy();
  await Promise.all(socketClosures);
  server.close();
  server.unref();
}

async function until(predicate) {
  for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.fail("local participant test timed out");
}

test("authenticated company claim remains unbound until TF3 roster proof", async () => {
  const events = [];
  const save = {bytes: 12, sha256: "a".repeat(64)};
  const instance = startHost({secret: SECRET, sessionId: "company-claim", port: 0,
    buildHash: BUILD, modManifestHash: MODS, requiredSave: save, logger: event => events.push(event)});
  await once(instance.server, "listening");
  let client;
  try {
    client = connectClient({secret: SECRET, sessionId: instance.sessionId,
      port: instance.server.address().port, displayName: "Join", buildHash: BUILD, modManifestHash: MODS,
      onMessage(message, context) {
        if(message.kind === "admitted") context.send("save_ready", save);
        if(message.kind === "session_ready") context.send("company_claim", {companyEntity: 55652});
      }});
    await until(() => events.some(event => event.event === "peer_company_claim"));
    const claim = instance.companyClaims();
    assert.equal(claim.length, 1);
    assert.equal(claim[0].playerId, client.playerId);
    assert.equal(claim[0].companyEntity, 55652);
    assert.equal(instance.authority.players()[0].companyEntity, null);
    assert.equal(events.find(event => event.event === "peer_company_claim").engineVerified, false);
  } finally { await shutdown(instance.server, client ? [client.socket] : []); }
});

test("host-local actions use the authenticated client authority path and share host ordering", async () => {
  const instance = startHost({ legacyModelRelay: true, secret: SECRET, sessionId: "host-local-order", port: 0,
    buildHash: BUILD, modManifestHash: MODS, getUpdateCount: () => 50, resolveEntityOwner: entity => entity === 71 ? 101 : entity === 72 ? 102 : null });
  await once(instance.server, "listening");
  const localMessages = [], remoteMessages = [];
  const engineBinding = Object.freeze({ source: "injected-test-binding" });
  let local, remote;
  try {
    local = connectHostLocalParticipant({ host: instance, displayName: "Host", engineBinding,
      createAdapter: input => ({ receive() {}, poll() {}, close() {}, binding: input.engineBinding }),
      onMessage: message => localMessages.push(message) });
    remote = connectClient({ secret: SECRET, sessionId: instance.sessionId, port: instance.server.address().port,
      displayName: "Remote", buildHash: BUILD, modManifestHash: MODS, onMessage: message => remoteMessages.push(message) });
    await until(() => local.ready && remote.playerId);
    const localPlayer = localMessages.find(message => message.kind === "admitted").payload.player;
    instance.authority.bindCompanyEntity(localPlayer.playerId, 101);
    instance.authority.bindCompanyEntity(remote.playerId, 102);
    local.connection.send("action_request", { clientSequence: 0, commandType: "vehicle.setRunning", originPlayerId: localPlayer.playerId,
      targetCompanyEntity: 101, targetEntity: 71, payload: { running: false }, requestedUpdate: 0 });
    await until(() => localMessages.some(message => message.kind === "command_accepted"));
    remote.send("action_request", { clientSequence: 0, commandType: "vehicle.setRunning", originPlayerId: remote.playerId,
      targetCompanyEntity: 102, targetEntity: 72, payload: { running: true }, requestedUpdate: 0 });
    await until(() => remoteMessages.filter(message => message.kind === "command_accepted").length === 2);
    const accepted = remoteMessages.filter(message => message.kind === "command_accepted").map(message => message.payload.command);
    assert.deepEqual(accepted.map(command => command.originPlayerId), [localPlayer.playerId, remote.playerId]);
    assert.deepEqual(accepted.map(command => command.hostSequence), [1, 2]);
    assert.equal(local.adapter.binding, engineBinding);
  } finally {
    await local?.close();
    await shutdown(instance.server, remote ? [remote.socket] : []);
  }
});

test("host-local adapter attachment is a coordination gate and its closure removes the participant", async () => {
  const instance = startHost({ secret: SECRET, sessionId: "host-local-lifecycle", port: 0, buildHash: BUILD, modManifestHash: MODS });
  await once(instance.server, "listening");
  let resolveAdapter;
  const localMessages = [];
  const local = connectHostLocalParticipant({ host: instance, displayName: "Host", engineBinding: Object.freeze({ native: true }),
    createAdapter: () => new Promise(resolve => { resolveAdapter = resolve; }), onMessage: message => localMessages.push(message) });
  try {
    await until(() => localMessages.some(message => message.kind === "admitted"));
    const player = localMessages.find(message => message.kind === "admitted").payload.player;
    instance.authority.bindCompanyEntity(player.playerId, 101);
    assert.throws(() => instance.beginCoordination({ checkpointHash: "d".repeat(64), updateCount: 100 }), error => error.code === "LOCAL_ENGINE_BINDING_REQUIRED");
    resolveAdapter({ receive() {}, poll() {}, close() {} });
    await until(() => local.ready);
    await local.close();
    await until(() => instance.authority.players().length === 0);
  } finally {
    await local.close();
    await new Promise(resolve => instance.server.close(resolve));
  }
});

test("host-local admission callback cannot race the pending adapter coordination gate", async () => {
  const instance = startHost({ secret: SECRET, sessionId: "host-local-admission-race", port: 0, buildHash: BUILD, modManifestHash: MODS });
  await once(instance.server, "listening");
  let resolveAdapter, callbackError;
  const local = connectHostLocalParticipant({ host: instance, displayName: "Host", engineBinding: Object.freeze({ native: true }),
    createAdapter: () => new Promise(resolve => { resolveAdapter = resolve; }),
    onMessage: message => {
      if (message.kind !== "admitted") return;
      try { instance.beginCoordination({ checkpointHash: "d".repeat(64), updateCount: 100 }); }
      catch (error) { callbackError = error; }
    } });
  try {
    await until(() => callbackError);
    assert.equal(callbackError.code, "LOCAL_ENGINE_BINDING_REQUIRED");
    resolveAdapter({ receive() {}, poll() {}, close() {} });
    await until(() => local.ready);
  } finally {
    await local.close();
    await new Promise(resolve => instance.server.close(resolve));
  }
});

test("host-local closes an engine adapter that resolves after transport teardown", async () => {
  const instance = startHost({ secret: SECRET, sessionId: "host-local-late-adapter", port: 0, buildHash: BUILD, modManifestHash: MODS });
  await once(instance.server, "listening");
  let resolveAdapter, closed = 0;
  const local = connectHostLocalParticipant({ host: instance, displayName: "Host", engineBinding: Object.freeze({ native: true }),
    createAdapter: () => new Promise(resolve => { resolveAdapter = resolve; }) });
  try {
    await until(() => typeof resolveAdapter === "function");
    await local.close();
    resolveAdapter({ receive() {}, poll() {}, close() { closed++; } });
    await local.attachment;
    assert.equal(closed, 1);
    assert.equal(local.ready, false);
  } finally {
    await local.close();
    await new Promise(resolve => instance.server.close(resolve));
  }
});

test("host-local production attachment waits for authenticated capture roster", async () => {
  const requiredSave={bytes:12,sha256:'e'.repeat(64)};
  const instance=startHost({secret:SECRET,sessionId:'host-local-capture',port:0,
    buildHash:BUILD,modManifestHash:MODS,getUpdateCount:()=>100,requiredSave});
  await once(instance.server,'listening');
  let local,remote,received=[];
  try {
    local=connectHostLocalParticipant({host:instance,displayName:'Host',engineBinding:{native:true},
      deferAdapterUntilCapture:true,verifiedSave:requiredSave,createAdapter:input=>{
        assert.deepEqual([...input.companies.values()],[101,102]);
        return {receive(kind){received.push(kind);},poll(){},close(){}};
      }});
    assert.equal(typeof local.attachment.then,'function');
    remote=connectClient({secret:SECRET,sessionId:instance.sessionId,port:instance.server.address().port,
      displayName:'Remote',buildHash:BUILD,modManifestHash:MODS,onMessage:(message,context)=>{
        if(message.kind==='admitted')context.send('save_ready',requiredSave);
        if(message.kind==='session_ready')context.send('company_claim',{companyEntity:102});
      }});
    await until(()=>local.connection.playerId&&remote.playerId&&instance.companyClaims().length===1);
    assert.equal(local.ready,false);
    assert.throws(()=>instance.beginCoordination({updateCount:100,checkpointHash:'d'.repeat(64)}),{code:'LOCAL_ENGINE_BINDING_REQUIRED'});
    const bridge={connected:true,engineObservation:{available:true,sample:{speedup:0,companyEntity:101,updateCount:100}},
      async discoverHostCompanyPair(){return {hostCompanyEntity:101,secondCompanyEntity:102,updateCount:100};}};
    const capture=createTwoCompanyHostCapture({host:instance,bridge,nativeGate:{ready:true},hostLocal:local});
    assert.equal((await capture.start()).remoteCompanyEntity,102);
    await local.attachment;
    assert.equal(local.ready,true);
    assert.equal(received[0],'coordination_capture');
  } finally {
    await local?.close();
    remote?.socket.destroy();
    await new Promise(resolve=>instance.server.close(resolve));
  }
});

test("four-company socket roster attaches the Host's deferred adapter with the inspected identities", async () => {
  const requiredSave={bytes:12,sha256:'e'.repeat(64)};
  const instance=startHost({secret:SECRET,sessionId:'host-local-four-roster',port:0,
    buildHash:BUILD,modManifestHash:MODS,getUpdateCount:()=>100,requiredSave});
  await once(instance.server,'listening');
  let local,attachedCompanies;
  const received=[];
  const remotes=[];
  try {
    local=connectHostLocalParticipant({host:instance,displayName:'Host',engineBinding:{native:true},
      deferAdapterUntilCapture:true,verifiedSave:requiredSave,createAdapter:input=>{
        attachedCompanies=[...input.companies.values()];
        return {receive(kind){received.push(kind);},poll(){},close(){}};
      }});
    for(const companyEntity of [102,103,104]){
      const remote=connectClient({secret:SECRET,sessionId:instance.sessionId,
        port:instance.server.address().port,displayName:`Company ${companyEntity}`,
        buildHash:BUILD,modManifestHash:MODS,onMessage:(message,context)=>{
          if(message.kind==='admitted')context.send('save_ready',requiredSave);
          if(message.kind==='session_ready')context.send('company_claim',{companyEntity});
        }});
      remotes.push(remote);
    }
    await until(()=>local.connection.playerId&&instance.authority.players().length===4
      &&instance.companyClaims().length===3);
    const bridge={connected:true,engineObservation:{available:true,
      sample:{speedup:0,companyEntity:101,updateCount:100}},
      async discoverHostCompanyRoster(companies){
        assert.deepEqual(companies,[101,102,103,104]);
        return {outcome:'verified',companies,hostCompanyEntity:101,updateCount:100};
      }};
    const capture=createHostRosterCapture({host:instance,bridge,nativeGate:{ready:true},hostLocal:local});
    const result=await capture.start();
    await local.attachment;
    assert.deepEqual(result.players.map(player=>player.companyEntity),[101,102,103,104]);
    assert.deepEqual(attachedCompanies,[101,102,103,104]);
    assert.deepEqual(instance.authority.players().map(player=>player.companyEntity),[101,102,103,104]);
    assert.equal(local.ready,true);
    assert.equal(received[0],'coordination_capture');
  } finally {
    await local?.close();
    for(const remote of remotes)remote.socket.destroy();
    await new Promise(resolve=>instance.server.close(resolve));
  }
});

test("host-local polling serializes real adapter work and fails closed on an adapter fault", async () => {
  const instance = startHost({ secret: SECRET, sessionId: "host-local-poll-failure", port: 0, buildHash: BUILD, modManifestHash: MODS });
  await once(instance.server, "listening");
  let polls = 0, closing = 0;
  const local = connectHostLocalParticipant({ host: instance, displayName: "Host", engineBinding: Object.freeze({ native: true }), pollIntervalMs: 10,
    createAdapter: () => ({ receive() {}, poll() { polls++; return Promise.reject(new Error("native IPC gone")); }, async close() { closing++; } }) });
  try {
    await until(() => polls === 1 && instance.authority.players().length === 0);
    await local.close();
    assert.equal(polls, 1);
    assert.equal(closing, 1);
    assert.equal(local.ready, false);
  } finally {
    await local.close();
    await new Promise(resolve => instance.server.close(resolve));
  }
});

test("host-local transport connects through the host's explicit loopback bind address", async () => {
  const instance = startHost({ secret: SECRET, sessionId: "host-local-explicit-bind", bind: "127.0.0.2", port: 0,
    buildHash: BUILD, modManifestHash: MODS });
  await once(instance.server, "listening");
  const local = connectHostLocalParticipant({ host: instance, displayName: "Host", engineBinding: Object.freeze({ native: true }),
    createAdapter: () => ({ receive() {}, poll() {}, close() {} }) });
  try { await until(() => local.ready); }
  finally {
    await local.close();
    await new Promise(resolve => instance.server.close(resolve));
  }
});

test("host-local registration cannot claim a remote participant and verifies the authoritative save", async () => {
  const requiredSave = Object.freeze({ bytes: 42, sha256: "e".repeat(64) });
  const instance = startHost({ secret: SECRET, sessionId: "host-local-save", port: 0, buildHash: BUILD, modManifestHash: MODS, requiredSave });
  await once(instance.server, "listening");
  const remote = connectClient({ secret: SECRET, sessionId: instance.sessionId, port: instance.server.address().port,
    displayName: "Remote", buildHash: BUILD, modManifestHash: MODS });
  let local;
  try {
    await until(() => remote.playerId);
    assert.throws(() => instance.registerLocalParticipant(remote.playerId, { receive() {} }), error => error.code === "LOCAL_ENGINE_BINDING_REQUIRED");
    local = connectHostLocalParticipant({ host: instance, displayName: "Host", engineBinding: Object.freeze({ native: true }),
      verifiedSave: requiredSave, createAdapter: () => ({ receive() {}, poll() {}, close() {} }) });
    await until(() => local.ready);
    instance.authority.bindCompanyEntity(remote.playerId, 101);
    instance.authority.bindCompanyEntity(local.connection.playerId, 102);
    assert.throws(() => instance.beginCoordination({ checkpointHash: "d".repeat(64), updateCount: 100 }), error => error.code === "SAVE_REQUIRED");
    remote.send("save_ready", requiredSave);
    await until(() => {
      try { instance.beginCoordination({ checkpointHash: "d".repeat(64), updateCount: 100 }); return true; }
      catch { return false; }
    });
  } finally {
    await local?.close();
    remote.socket.destroy();
    await new Promise(resolve => instance.server.close(resolve));
  }
});

test("authenticated client is admitted and exchanges test message", async () => {
  const instance = startHost({ legacyModelRelay: true, secret: SECRET, sessionId: "test-session", port: 0, buildHash: BUILD, modManifestHash: MODS });
  await once(instance.server, "listening");
  const port = instance.server.address().port;
  let handle;
  const result = new Promise((resolve, reject) => {
    handle = connectClient({ secret: SECRET, sessionId: "test-session", port, displayName: "Alice", buildHash: BUILD, modManifestHash: MODS, onMessage: (message, context) => {
      if (message.kind === "admitted") context.send("test", { value: "ping" });
      if (message.kind === "test_echo") resolve(message.payload.value);
      if (message.kind === "error") reject(new Error(message.payload.code));
    } });
  });
  assert.equal(await result, "ping");
  await shutdown(instance.server, [handle.socket]);
});

test('road Stop remains rejected on the live Host until its engine adapter exists',async()=>{
  const instance=startHost({legacyModelRelay:true,secret:SECRET,sessionId:'road-engine-gate',
    port:0,buildHash:BUILD,modManifestHash:MODS});
  await once(instance.server,'listening');
  let handle;
  const result=new Promise((resolve,reject)=>{
    handle=connectClient({secret:SECRET,sessionId:instance.sessionId,
      port:instance.server.address().port,displayName:'Alice',buildHash:BUILD,modManifestHash:MODS,
      onMessage(message,context){
        if(message.kind==='admitted')context.send('action_request',{clientSequence:0,
          commandType:'road.stop.place',originPlayerId:message.payload.player.playerId,
          targetCompanyEntity:3141,targetEntity:53417,
          payload:{edgeEntity:53417,companyEntity:3141,param:0.5,left:true,
            oneWay:false,model:'::/stations/street/small_stops/small_mid.mdl',name:'TalCo Road Stop'}});
        if(message.kind==='command_rejected')resolve(message.payload.code);
        if(message.kind==='command_accepted'||message.kind==='command_prepare')reject(new Error('road action escaped engine gate'));
        if(message.kind==='error')reject(new Error(message.payload.code));
      }});
  });
  try{assert.equal(await result,'ROAD_STOP_ENGINE_UNAVAILABLE');}
  finally{await shutdown(instance.server,[handle.socket]);}
});

test('production Host admits a bounded road Stop to coordinator ordering',async()=>{
  const instance=startHost({secret:SECRET,sessionId:'road-production-admission',
    port:0,buildHash:BUILD,modManifestHash:MODS,getUpdateCount:()=>50});
  await once(instance.server,'listening');
  let handle;
  const proposed=new Promise((resolve,reject)=>{
    instance.coordinator.beforeCommand=()=>{};
    instance.coordinator.propose=command=>resolve(command);
    handle=connectClient({secret:SECRET,sessionId:instance.sessionId,
      port:instance.server.address().port,displayName:'Alice',buildHash:BUILD,modManifestHash:MODS,
      onMessage(message,context){
        if(message.kind==='admitted'){
          instance.authority.bindCompanyEntity(message.payload.player.playerId,3141);
          context.send('action_request',{clientSequence:1,commandType:'road.stop.place',
            originPlayerId:message.payload.player.playerId,targetCompanyEntity:3141,
            targetEntity:53417,payload:{edgeEntity:53417,companyEntity:3141,
              param:0.5,left:true,oneWay:false,
              model:'::/stations/street/small_stops/small_mid.mdl',name:'TalCo Road Stop'}});
        }
        if(message.kind==='command_rejected'||message.kind==='error')reject(new Error(message.payload.code));
      }});
  });
  try{
    const command=await proposed;
    assert.equal(command.commandType,'road.stop.place');
    assert.equal(command.targetCompanyEntity,3141);
    assert.equal(command.hostSequence,1);
    assert.ok(command.scheduledUpdate>50);
  }finally{await shutdown(instance.server,[handle.socket]);}
});

test("authenticated socket subscribers observe signed coordination frames with stable ordered fanout", async () => {
  const instance = startHost({ secret: SECRET, sessionId: "subscriber-session", port: 0, buildHash: BUILD, modManifestHash: MODS });
  await once(instance.server, "listening");
  const primary = [], observed = [], order = [], late = [];
  let handle, peer, primaryContext, observerContext, removeStable;
  const admitted = new Set();
  let started = false;
  const maybeStart = () => {
    if (started || admitted.size !== 2) return;
    started = true;
    for (const [playerId, companyEntity] of admitted) instance.authority.bindCompanyEntity(playerId, companyEntity);
    instance.beginCoordination({ checkpointHash: "d".repeat(64), updateCount: 100 });
  };
  try {
    await new Promise((resolve, reject) => {
      handle = connectClient({ secret: SECRET, sessionId: instance.sessionId, port: instance.server.address().port, displayName: "Subscriber", buildHash: BUILD, modManifestHash: MODS,
        onMessage(message, context) {
          primary.push(message.kind); order.push(`primary:${message.kind}`);
          if (message.kind === "admitted") { primaryContext = context; admitted.add([message.payload.player.playerId, 101]); maybeStart(); }
          if (message.kind === "coordination_prepare") resolve();
          if (message.kind === "error") reject(new Error(message.payload.code));
        } });
      handle.subscribe((message, context) => {
        observed.push({ kind: message.kind, playerId: context.playerId }); observerContext = context; order.push(`observer:${message.kind}`);
        if (message.kind === "coordination_prepare") {
          removeStable();
          handle.subscribe(lateObserver);
          throw new Error("observer failure is isolated");
        }
      });
      const lateObserver = message => late.push(message.kind);
      removeStable = handle.subscribe(message => { if (message.kind === "coordination_prepare") order.push(`stable:${message.kind}`); });
      peer = connectClient({ secret: SECRET, sessionId: instance.sessionId, port: instance.server.address().port, displayName: "Peer", buildHash: BUILD, modManifestHash: MODS,
        onMessage(message) {
          if (message.kind === "admitted") { admitted.add([message.payload.player.playerId, 102]); maybeStart(); }
          if (message.kind === "error") reject(new Error(message.payload.code));
        } });
    });
    assert.equal(primary.includes("admitted"), true);
    assert.equal(observed.some(message => message.kind === "coordination_prepare"), true);
    assert.equal(observed.find(message => message.kind === "coordination_prepare").playerId, handle.playerId);
    assert.equal(primaryContext, observerContext);
    assert.equal(order.indexOf("primary:coordination_prepare") < order.indexOf("observer:coordination_prepare"), true);
    assert.equal(order.includes("stable:coordination_prepare"), true);
    assert.deepEqual(late, []);
    const unsubscribe = handle.subscribe(() => assert.fail("unsubscribed observer ran"));
    unsubscribe();
    assert.throws(() => handle.subscribe(null), /INVALID_MESSAGE_SUBSCRIBER/);
  } finally {
    await shutdown(instance.server, [handle, peer].filter(Boolean).map(connection => connection.socket));
  }
  assert.equal(observed.some(message => message.kind === "session_ended"), false);
  assert.deepEqual(late, []);
  assert.throws(() => handle.subscribe(() => {}), /CLIENT_CONNECTION_CLOSED/);
});

test("test-message payload is strictly bounded", async () => {
  const instance = startHost({ legacyModelRelay: true, secret: SECRET, sessionId: "bad-test-session", port: 0, buildHash: BUILD, modManifestHash: MODS });
  await once(instance.server, "listening");
  const port = instance.server.address().port;
  let handle;
  const result = new Promise((resolve) => {
    handle = connectClient({ secret: SECRET, sessionId: "bad-test-session", port, displayName: "Alice", buildHash: BUILD, modManifestHash: MODS, onMessage: (message, context) => {
      if (message.kind === "admitted") context.send("test", { value: "", extra: true });
      if (message.kind === "error") resolve(message.payload.code);
    } });
  });
  assert.equal(await result, "BAD_TEST_MESSAGE");
  await shutdown(instance.server, [handle.socket]);
});

test("rejected action is machine-readable and does not disconnect the peer", async () => {
  const instance = startHost({ legacyModelRelay: true, secret: SECRET, sessionId: "reject-session", port: 0, buildHash: BUILD, modManifestHash: MODS });
  await once(instance.server, "listening");
  const port = instance.server.address().port;
  let handle;
  let admittedPlayerId;
  let rejectionSeen = false;
  const result = new Promise((resolve, reject) => {
    handle = connectClient({ secret: SECRET, sessionId: "reject-session", port, displayName: "Alice", buildHash: BUILD, modManifestHash: MODS, onMessage: (message, context) => {
      if (message.kind === "admitted") {
        admittedPlayerId = message.payload.player.playerId;
        instance.authority.bindCompanyEntity(admittedPlayerId, 101);
        context.send("action_request", {
          clientSequence: 0,
          commandType: "vehicle.setRunning",
          originPlayerId: admittedPlayerId,
          payload: { running: false },
          requestedUpdate: 0,
          targetEntity: 99,
          targetCompanyEntity: 101,
        });
      }
      if (message.kind === "command_rejected") {
        rejectionSeen = message.payload.code === "OWNERSHIP_UNAVAILABLE";
        context.send("test", { value: "still-connected" });
      }
      if (message.kind === "test_echo") resolve(message.payload.value);
      if (message.kind === "error" || message.kind === "transport_error") reject(new Error(message.payload.code));
    } });
  });
  assert.equal(await result, "still-connected");
  assert.equal(rejectionSeen, true);
  await shutdown(instance.server, [handle.socket]);
});

test("owned vehicle and speed requests traverse the authoritative host relay", async () => {
  let owner = null;
  const instance = startHost({ legacyModelRelay: true,
    secret: SECRET,
    sessionId: "command-session",
    port: 0,
    buildHash: BUILD,
    modManifestHash: MODS,
    getUpdateCount: () => 50,
    resolveEntityOwner: (entity) => entity === 77 ? 101 : null,
  });
  await once(instance.server, "listening");
  const port = instance.server.address().port;
  let handle;
  const accepted = [];
  const result = new Promise((resolve, reject) => {
    handle = connectClient({ secret: SECRET, sessionId: "command-session", port, displayName: "Alice", buildHash: BUILD, modManifestHash: MODS, onMessage: (message, context) => {
      if (message.kind === "admitted") {
        owner = message.payload.player.playerId;
        instance.authority.bindCompanyEntity(owner, 101);
        context.send("action_request", {
          clientSequence: 0,
          commandType: "vehicle.setRunning",
          originPlayerId: owner,
          payload: { running: false },
          requestedUpdate: 0,
          targetEntity: 77,
          targetCompanyEntity: 101,
        });
      }
      if (message.kind === "command_accepted") {
        accepted.push(message.payload.command);
        if (accepted.length === 1) {
          context.send("speed_request", {
            clientSequence: 1,
            commandType: "simulation.speed",
            originPlayerId: owner,
            payload: { speedup: 2 },
            requestedUpdate: 0,
            targetCompanyEntity: 101,
          });
        } else resolve(accepted);
      }
      if (message.kind === "error" || message.kind === "transport_error" || message.kind === "command_rejected") {
        reject(new Error(message.payload.code));
      }
    } });
  });
  const commands = await result;
  assert.deepEqual(commands.map((command) => command.commandType), ["vehicle.setRunning", "simulation.speed"]);
  assert.deepEqual(commands.map((command) => command.hostSequence), [1, 2]);
  assert.deepEqual(commands.map((command) => command.scheduledUpdate), [58, 58]);
  assert.equal(commands[0].payload.running, false);
  assert.equal(commands[1].payload.speedup, 2);
  await shutdown(instance.server, [handle.socket]);
});

test('host waits for exact engine owner proof and prevents action overtaking',{timeout:5000},async()=>{
  let releaseProof,inspectionStarted;
  const inspecting=new Promise(resolve=>{inspectionStarted=resolve;});
  const instance=startHost({legacyModelRelay:true,secret:SECRET,sessionId:'owner-proof',port:0,
    buildHash:BUILD,modManifestHash:MODS,getUpdateCount:()=>50,
    inspectVehicleOwner:()=>new Promise(resolve=>{releaseProof=resolve;inspectionStarted();})});
  await once(instance.server,'listening');
  let handle,playerId;
  const messages=[];
  try{
    handle=connectClient({secret:SECRET,sessionId:instance.sessionId,port:instance.server.address().port,
      displayName:'Alice',buildHash:BUILD,modManifestHash:MODS,onMessage(message,context){
        if(message.kind==='admitted'){
          playerId=message.payload.player.playerId;
          instance.authority.bindCompanyEntity(playerId,101);
          context.send('action_request',{clientSequence:0,commandType:'vehicle.setRunning',originPlayerId:playerId,
            targetCompanyEntity:101,targetEntity:77,payload:{running:false}});
        }
        if(['command_accepted','command_rejected'].includes(message.kind))messages.push(message);
      }});
    await inspecting;
    handle.send('action_request',{clientSequence:1,commandType:'vehicle.setRunning',originPlayerId:playerId,
      targetCompanyEntity:101,targetEntity:77,payload:{running:true}});
    for(let i=0;i<100&&!messages.some(m=>m.payload.code==='COMMAND_ADMISSION_BUSY');i++)await new Promise(r=>setTimeout(r,5));
    assert.equal(messages.some(m=>m.payload.code==='COMMAND_ADMISSION_BUSY'),true);
    releaseProof({outcome:'found',entity:77,company:101,issuedUpdate:50,updateCount:50,paused:true});
    for(let i=0;i<100&&!messages.some(m=>m.kind==='command_accepted');i++)await new Promise(r=>setTimeout(r,5));
    assert.equal(messages.find(m=>m.kind==='command_accepted')?.payload.command.hostSequence,1);
  }finally{await shutdown(instance.server,handle?[handle.socket]:[]);}
});

test('host rejects stale owner proof before assigning a sequence',{timeout:5000},async()=>{
  const instance=startHost({legacyModelRelay:true,secret:SECRET,sessionId:'stale-owner-proof',port:0,
    buildHash:BUILD,modManifestHash:MODS,getUpdateCount:()=>51,
    inspectVehicleOwner:async()=>({outcome:'found',entity:77,company:101,issuedUpdate:50,updateCount:50,paused:true})});
  await once(instance.server,'listening');
  let handle;
  try{
    const code=await new Promise((resolve,reject)=>{
      handle=connectClient({secret:SECRET,sessionId:instance.sessionId,port:instance.server.address().port,
        displayName:'Alice',buildHash:BUILD,modManifestHash:MODS,onMessage(message,context){
          if(message.kind==='admitted'){
            const playerId=message.payload.player.playerId;
            instance.authority.bindCompanyEntity(playerId,101);
            context.send('action_request',{clientSequence:0,commandType:'vehicle.setRunning',originPlayerId:playerId,
              targetCompanyEntity:101,targetEntity:77,payload:{running:false}});
          }
          if(message.kind==='command_rejected')resolve(message.payload.code);
          if(message.kind==='command_accepted')reject(new Error('stale owner proof accepted'));
        }});
    });
    assert.equal(code,'OWNERSHIP_UNAVAILABLE');
  }finally{await shutdown(instance.server,handle?[handle.socket]:[]);}
});

test('host admits a bounded running owner proof through the authenticated action path',{timeout:5000},async()=>{
  const instance=startHost({legacyModelRelay:true,secret:SECRET,sessionId:'moving-owner-proof',port:0,
    buildHash:BUILD,modManifestHash:MODS,getUpdateCount:()=>54,
    inspectVehicleOwner:async()=>({outcome:'found',entity:77,company:101,issuedUpdate:50,updateCount:52,paused:false})});
  await once(instance.server,'listening');
  let handle;
  try{
    const accepted=await new Promise((resolve,reject)=>{
      handle=connectClient({secret:SECRET,sessionId:instance.sessionId,port:instance.server.address().port,
        displayName:'Alice',buildHash:BUILD,modManifestHash:MODS,onMessage(message,context){
          if(message.kind==='admitted'){
            const playerId=message.payload.player.playerId;
            instance.authority.bindCompanyEntity(playerId,101);
            context.send('action_request',{clientSequence:0,commandType:'vehicle.setRunning',originPlayerId:playerId,
              targetCompanyEntity:101,targetEntity:77,payload:{running:false}});
          }
          if(message.kind==='command_accepted')resolve(message.payload.command);
          if(message.kind==='command_rejected')reject(new Error(message.payload.code));
        }});
    });
    assert.equal(accepted.targetEntity,77);
    assert.equal(accepted.hostSequence,1);
  }finally{await shutdown(instance.server,handle?[handle.socket]:[]);}
});

test("fifth compatible player is rejected", () => {
  const authority = new HostAuthority({ sessionId: "s", buildHash: BUILD, modManifestHash: MODS });
  for (let i = 0; i < 4; i++) authority.admit({ displayName: `${i}`, buildHash: BUILD, modManifestHash: MODS });
  assert.throws(() => authority.admit({ displayName: "5", buildHash: BUILD, modManifestHash: MODS }), (e) => e.code === "SESSION_FULL");
});

test("gameplay requests remain blocked until client verifies host save", async () => {
  let owner = null;
  const requiredSave = { bytes: 1234, sha256: "d".repeat(64) };
  const instance = startHost({ legacyModelRelay: true,
    secret: SECRET, sessionId: "save-gate", port: 0, buildHash: BUILD,
    modManifestHash: MODS, requiredSave,
    resolveEntityOwner: (entity) => entity === 7 ? owner : null,
  });
  await once(instance.server, "listening");
  const port = instance.server.address().port;
  let handle, rejected = false;
  const result = new Promise((resolve, reject) => {
    handle = connectClient({ secret: SECRET, sessionId: "save-gate", port, displayName: "Alice", buildHash: BUILD, modManifestHash: MODS, onMessage: (message, context) => {
      if (message.kind === "admitted") {
        owner = message.payload.player.playerId;
        instance.authority.bindCompanyEntity(owner, 101);
        context.send("action_request", { clientSequence: 0, commandType: "vehicle.setRunning", originPlayerId: owner, payload: { running: false }, requestedUpdate: 0, targetEntity: 7, targetCompanyEntity: 101 });
      }
      if (message.kind === "command_rejected") { rejected = message.payload.code === "SAVE_REQUIRED"; context.send("save_ready", requiredSave); }
      if (message.kind === "session_ready") resolve(message.payload.saveSha256);
      if (message.kind === "error" || message.kind === "transport_error") reject(new Error(message.payload.code));
    } });
  });
  assert.equal(await result, requiredSave.sha256);
  assert.equal(rejected, true);
  await shutdown(instance.server, [handle.socket]);
});

test("host rejects an already-expired session", () => {
  assert.throws(() => startHost({ legacyModelRelay: true, secret: SECRET, sessionId: "expired", port: 0, buildHash: BUILD, modManifestHash: MODS, expiresAt: Date.now() - 1 }), /future Unix timestamp/);
});

test("diagnostic-only client never joins the player roster or sends gameplay", { timeout: 5000 }, async () => {
  const instance=startHost({legacyModelRelay:true,secret:SECRET,sessionId:'diagnostic-only',port:0,buildHash:BUILD,modManifestHash:MODS,admissionAllowed:()=>false});
  await once(instance.server,'listening');
  let handle;
  try{
    await new Promise((resolve,reject)=>{
      handle=connectClient({secret:SECRET,sessionId:instance.sessionId,port:instance.server.address().port,displayName:'Ignored',buildHash:BUILD,modManifestHash:MODS,diagnosticOnly:true,onMessage:(message,context)=>{
        if(message.kind==='diagnostic_ready'){assert.equal(context.playerId,null);context.send('diagnostic_ping',{challenge:'a'.repeat(32)});}
        else if(message.kind==='diagnostic_pong'){assert.equal(context.playerId,null);resolve();}
        else if(message.kind==='transport_error'||message.kind==='error')reject(new Error(message.payload.code));
      }});
    });
    assert.equal(instance.authority.players().length,0);
    assert.throws(()=>handle.send('test',{value:'must not send'}),/DIAGNOSTIC_ONLY/);
  }finally{await shutdown(instance.server,handle?[handle.socket]:[]);}
});
