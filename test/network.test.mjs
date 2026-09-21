import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { startHost } from "../src/host.mjs";
import { connectClient } from "../src/client.mjs";
import { HostAuthority } from "../src/lockstep.mjs";

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
