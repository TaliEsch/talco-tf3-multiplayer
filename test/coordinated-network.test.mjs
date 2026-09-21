import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { startHost } from "../src/host.mjs";
import { connectClient } from "../src/client.mjs";
import { SessionParticipant } from "../src/session-participant.mjs";
const secret = "a".repeat(64), buildHash = "b".repeat(64), modManifestHash = "c".repeat(64), checkpointHash = "d".repeat(64), stateHash = "e".repeat(64);
async function until(predicate) {
  for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 5)); }
  assert.fail("coordination socket test timed out");
}
async function fixture(count, { requireReleaseAck = false } = {}) {
  let update = 100;
  const owners = new Map(), clients = [];
  const host = startHost({ secret, buildHash, modManifestHash, port: 0, getUpdateCount: () => update, resolveEntityOwner: e => owners.get(e) ?? null, requireReleaseAck });
  await once(host.server, "listening");
  try {
    for (let i = 0; i < count; i++) {
      const c = { messages: [], player: null }; clients.push(c);
      c.connection = connectClient({ secret, sessionId: host.sessionId, port: host.server.address().port, displayName: `Synthetic ${i}`, buildHash, modManifestHash,
        onMessage(m) { c.messages.push(m); if (m.kind === "admitted") c.player = m.payload.player; c.forward?.(m); } });
      await until(() => c.player);
      // Synthetic engine bindings. Real TF3 company creation is not exercised.
      host.authority.bindCompanyEntity(c.player.playerId, 1000 + i);
      owners.set(2000 + i, 1000 + i);
    }
  } catch (e) { for (const c of clients) c.connection?.socket.destroy(); host.server.close(); throw e; }
  const request = (seq = 1) => clients[0].connection.send("action_request", { clientSequence: seq, commandType: "vehicle.setRunning",
    originPlayerId: clients[0].player.playerId, targetCompanyEntity: 1000, targetEntity: 2000, payload: { running: false } });
  return { host, clients, request, setUpdate: u => { update = u; },
    async prepare() {
      host.beginCoordination({ checkpointHash, updateCount: 100 });
      await until(() => clients.every(c => c.messages.some(m => m.kind === "coordination_prepare")));
      clients.forEach((c, i) => c.connection.send("participant_ready", { roundId: host.coordinator.roundId, checkpointHash, updateCount: 100, companyEntity: 1000 + i }));
      await until(() => clients.every(c => c.messages.some(m => m.kind === "coordination_ready")));
    },
    async close() { for (const c of clients) c.connection.socket.destroy(); await new Promise(r => host.server.close(r)); },
  };
}
for (const count of [2, 4]) test(`${count} socket participants coordinate prepare/commit/apply without legacy relay`, async () => {
  const f = await fixture(count);
  try {
    f.request();
    await until(() => f.clients[0].messages.some(m => m.kind === "command_rejected"));
    assert.equal(f.clients[0].messages.find(m => m.kind === "command_rejected").payload.code, "COORDINATION_NOT_READY");
    await f.prepare(); f.request(2);
    await until(() => f.clients.every(c => c.messages.some(m => m.kind === "command_prepare")));
    const command = f.clients[0].messages.find(m => m.kind === "command_prepare").payload.command;
    assert.equal(f.clients.some(c => c.messages.some(m => m.kind === "command_accepted" || m.kind === "command_commit")), false);
    for (const c of f.clients) c.connection.send("command_prepared", { roundId: f.host.coordinator.roundId, hostSequence: command.hostSequence, scheduledUpdate: command.scheduledUpdate, updateCount: 100 });
    await until(() => f.clients.every(c => c.messages.some(m => m.kind === "command_commit")));
    f.setUpdate(command.scheduledUpdate);
    for (const c of f.clients) c.connection.send("command_applied", { roundId: f.host.coordinator.roundId, hostSequence: command.hostSequence, updateCount: command.scheduledUpdate, stateHash });
    await until(() => f.clients.every(c => c.messages.some(m => m.kind === "command_completed")));
    assert.equal(f.host.coordinator.phase, "running");
    assert.throws(() => f.host.beginCoordination({ checkpointHash, updateCount: 100 }), /cannot restart/);
  } finally { await f.close(); }
});
test("disconnect during preparation halts other participants and blocks subsequent actions", async () => {
  const f = await fixture(2);
  try {
    await f.prepare(); f.request();
    await until(() => f.clients[0].messages.some(m => m.kind === "command_prepare"));
    f.clients[1].connection.socket.destroy();
    await until(() => f.clients[0].messages.some(m => m.kind === "session_halted"));
    assert.equal(f.clients[0].messages.find(m => m.kind === "session_halted").payload.code, "PARTICIPANT_DISCONNECTED");
    f.request(2);
    await until(() => f.clients[0].messages.some(m => m.kind === "command_rejected"));
    assert.equal(f.clients[0].messages.some(m => m.kind === "command_commit"), false);
  } finally { await f.close(); }
});
test("different state hashes halt the coordinated socket session", async () => {
  const f = await fixture(2);
  try {
    await f.prepare(); f.request();
    await until(() => f.clients.every(c => c.messages.some(m => m.kind === "command_prepare")));
    const command = f.clients[0].messages.find(m => m.kind === "command_prepare").payload.command;
    for (const c of f.clients) c.connection.send("command_prepared", { roundId: f.host.coordinator.roundId, hostSequence: command.hostSequence, scheduledUpdate: command.scheduledUpdate, updateCount: 100 });
    await until(() => f.clients.every(c => c.messages.some(m => m.kind === "command_commit")));
    f.clients.forEach((c, i) => c.connection.send("command_applied", { roundId: f.host.coordinator.roundId, hostSequence: command.hostSequence, updateCount: command.scheduledUpdate, stateHash: i ? "f".repeat(64) : stateHash }));
    await until(() => f.clients[0].messages.some(m => m.kind === "session_halted"));
    assert.equal(f.host.coordinator.phase, "halted");
    assert.equal(f.clients[0].messages.some(m => m.kind === "command_completed"), false);
  } finally { await f.close(); }
});

test("production socket coordination waits for every participant release receipt", async () => {
  const f = await fixture(2, { requireReleaseAck: true });
  try {
    f.host.coordinator.setResumeSpeed(2);
    f.host.beginCoordination({ checkpointHash, updateCount: 100 });
    await until(() => f.clients.every(c => c.messages.some(m => m.kind === "coordination_prepare")));
    f.clients.forEach((c, i) => c.connection.send("participant_ready", { roundId: f.host.coordinator.roundId, checkpointHash, updateCount: 100, companyEntity: 1000 + i }));
    await until(() => f.clients.every(c => c.messages.some(m => m.kind === "coordination_ready")));
    assert.equal(f.host.coordinator.phase, "awaiting_release");
    const receipt = { roundId: f.host.coordinator.roundId, hostSequence: 0, releaseUpdate: 100, updateCount: 100, speedup: 2 };
    f.clients[0].connection.send("participant_released", receipt);
    await until(() => f.host.coordinator.phase === "awaiting_release");
    f.clients[1].connection.send("participant_released", receipt);
    await until(() => f.host.coordinator.phase === "running");
  } finally { await f.close(); }
});

function attachParticipants(f) {
  const companies = new Map(f.clients.map((c, i) => [c.player.playerId, 1000 + i]));
  return f.clients.map(c => {
    const model = { update: 100, running: true, applied: 0, halt: null, held: false };
    const participant = new SessionParticipant({ playerId: c.player.playerId, companies,
      send: (kind, payload) => c.connection.send(kind, payload), disconnect: () => c.connection.socket.destroy(),
      adapter: { checkpoint: () => ({ checkpointHash, updateCount: 100 }), updateCount: () => model.update,
        owner: () => 1000,
        hold: () => { model.held = true; }, release: () => { model.held = false; },
        barrierState: () => ({ held: model.held, updateCount: model.update }),
        apply: command => { model.running = command.payload.running; model.applied++; return { updateCount: model.update, stateHash }; },
        halt: code => { model.halt = code; } } });
    c.forward = m => {
      if (m.kind.startsWith("coordination_") || ["command_prepare", "command_commit", "command_completed", "session_halted", "session_ended", "transport_error", "error", "peer_left"].includes(m.kind)) participant.receive(m.kind, m.payload);
    };
    return { participant, model };
  });
}
for (const count of [2, 4]) test(`${count} real-socket participant adapters complete consecutive exact-update commands`, async () => {
  const f = await fixture(count);
  try {
    const models = attachParticipants(f);
    f.host.beginCoordination({ checkpointHash, updateCount: 100 });
    await until(() => models.every(m => m.participant.phase === "running"));
    for (let sequence = 1; sequence <= 2; sequence++) {
      f.request(sequence);
      await until(() => models.every(m => m.participant.phase === "committed"));
      const command = f.clients[0].messages.filter(m => m.kind === "command_commit").at(-1).payload.command;
      assert.equal(models.every(m => m.model.applied === sequence - 1), true);
      f.setUpdate(command.scheduledUpdate);
      for (const m of models) { m.model.update = command.scheduledUpdate; m.participant.poll(); }
      await until(() => models.every(m => m.participant.phase === "running"));
      assert.equal(models.every(m => m.model.applied === sequence && m.model.running === false && m.model.halt === null), true);
      assert.equal(f.host.coordinator.phase, "running");
    }
  } finally { await f.close(); }
});
test("participant socket disconnect after commit cancels undelivered model execution", async () => {
  const f = await fixture(2);
  try {
    const models = attachParticipants(f);
    f.host.beginCoordination({ checkpointHash, updateCount: 100 });
    await until(() => models.every(m => m.participant.phase === "running")); f.request();
    await until(() => models.every(m => m.participant.phase === "committed"));
    f.clients[1].connection.socket.destroy();
    await until(() => models.every(m => m.participant.phase === "halted"));
    for (const m of models) { m.model.update = 108; m.participant.poll(); assert.equal(m.model.applied, 0); }
  } finally { await f.close(); }
});
