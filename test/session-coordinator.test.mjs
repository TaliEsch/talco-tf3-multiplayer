import test from "node:test";
import assert from "node:assert/strict";
import { SessionCoordinator } from "../src/session-coordinator.mjs";
const checkpointHash = "a".repeat(64), stateHash = "b".repeat(64);
const players = [0, 1].map(i => ({ playerId: `p${i}`, companyEntity: 100 + i }));
function setup(count = 2) {
  let time = 0;
  const events = [], roster = Array.from({ length: count }, (_, i) => ({ playerId: `p${i}`, companyEntity: 100 + i }));
  const c = new SessionCoordinator({ now: () => time, timeoutMs: 1000, heartbeatMs: 2000, broadcast: (kind, payload) => events.push({ kind, payload }) });
  c.prepare(roster, { checkpointHash, updateCount: 100 });
  const ready = () => roster.forEach(p => c.ready(p.playerId, { roundId: c.roundId, updateCount: 100, checkpointHash, companyEntity: p.companyEntity }));
  const command = { hostSequence: 1, scheduledUpdate: 160, payload: { running: false } };
  const prepared = (id, overrides = {}) => c.prepared(id, { roundId: c.roundId, hostSequence: 1, scheduledUpdate: 160, updateCount: 100, ...overrides }, 100);
  const applied = (id, overrides = {}) => c.applied(id, { roundId: c.roundId, hostSequence: 1, updateCount: 160, stateHash, ...overrides });
  return { c, events, roster, ready, command, prepared, applied, setTime: t => { time = t; } };
}
for (const count of [2, 4]) test(`${count} participant barrier needs all ready, prepared and matching applied receipts`, () => {
  const f = setup(count);
  assert.throws(() => f.c.beforeCommand(100), /all participants/);
  f.ready(); assert.equal(f.c.phase, "running");
  f.c.propose(f.command, 100); f.command.payload.running = true;
  for (let i = 0; i < count - 1; i++) f.prepared(`p${i}`);
  assert.equal(f.events.some(e => e.kind === "command_commit"), false);
  f.prepared(`p${count - 1}`);
  assert.equal(f.events.find(e => e.kind === "command_commit").payload.command.payload.running, false);
  for (let i = 0; i < count - 1; i++) f.applied(`p${i}`);
  assert.equal(f.c.phase, "awaiting_applied");
  assert.throws(() => f.c.beforeCommand(160), /one outstanding/);
  f.applied(`p${count - 1}`); assert.equal(f.c.phase, "running");
  assert.equal(f.events.filter(e => e.kind === "command_completed").length, 1);
});
test("unverified companies or duplicate users cannot seal roster", () => {
  for (const roster of [[players[0]], [{ ...players[0], companyEntity: null }, players[1]], [players[0], players[0]]]) {
    const c = new SessionCoordinator(); assert.throws(() => c.prepare(roster, { updateCount: 100, checkpointHash }), /verified companies/);
  }
});
test("checkpoint mismatch halts permanently", () => {
  const f = setup();
  assert.throws(() => f.c.ready("p0", { roundId: f.c.roundId, updateCount: 101, checkpointHash, companyEntity: 100 }), /CHECKPOINT_MISMATCH/);
  assert.equal(f.c.divergence, null);
  assert.equal(f.c.phase, "halted"); assert.throws(() => f.ready(), /new session/);
  assert.throws(() => f.c.prepare(players, { checkpointHash, updateCount: 100 }), /cannot restart/);
});
test("a valid differing checkpoint keeps bounded immutable evidence before halting", () => {
  const f = setup(), observedHash = "c".repeat(64), roundId = f.c.roundId;
  assert.throws(() => f.c.ready("p0", { roundId, updateCount: 100, checkpointHash: observedHash, companyEntity: 100 }), /CHECKPOINT_MISMATCH/);
  assert.deepEqual(f.c.divergence, { kind: "checkpoint", roundId, updateCount: 100,
    hostSequence: 0, playerId: "p0", companyEntity: 100,
    expectedHash: checkpointHash, expectedSource: "operator_baseline",
    expectedPlayerId: null, expectedCompanyEntity: null, observedHash });
  const copy = f.c.divergence; copy.observedHash = checkpointHash;
  assert.equal(f.c.divergence.observedHash, observedHash);
  assert.throws(() => f.c.ready("p1", { roundId, updateCount: 100, checkpointHash, companyEntity: 101 }),
    error => error.code === "SESSION_HALTED");
  assert.equal(f.c.divergence.observedHash, observedHash);
});
for (const bad of [{ updateCount: 159 }, { updateCount: 161 }, { hostSequence: 2 }, { stateHash: "bad" }, { extra: true }]) test(`invalid applied receipt halts: ${JSON.stringify(bad)}`, () => {
  const f = setup(); f.ready(); f.c.propose(f.command, 100); f.prepared("p0"); f.prepared("p1");
  assert.throws(() => f.applied("p0", bad), /INVALID_APPLIED_ACK/);
  assert.equal(f.c.phase, "halted");
});
test("state mismatch after execution halts future commands without claiming rollback", () => {
  const f = setup(); f.ready(); f.c.propose(f.command, 100); f.prepared("p0"); f.prepared("p1"); f.applied("p0");
  assert.throws(() => f.applied("p1", { stateHash: "c".repeat(64) }), /STATE_MISMATCH/);
  assert.deepEqual(f.c.divergence, { kind: "state", roundId: f.c.roundId,
    updateCount: 160, hostSequence: 1, playerId: "p1", companyEntity: 101,
    expectedHash: stateHash, expectedSource: "participant", expectedPlayerId: "p0",
    expectedCompanyEntity: 100, observedHash: "c".repeat(64) });
  assert.throws(() => f.c.beforeCommand(160), /new session/);
  assert.equal(f.events.at(-1).kind, "session_halted");
});
test("missing preparation, ack timeout, heartbeat loss and disconnect halt", () => {
  const f = setup(); f.ready(); f.c.propose(f.command, 100); f.c.poll(160);
  assert.equal(f.events.at(-1).payload.code, "PREPARE_DEADLINE_MISSED");
  const g = setup(); g.setTime(1001); g.c.poll(100);
  assert.equal(g.events.at(-1).payload.code, "COORDINATION_TIMEOUT");
  const h = setup(); h.ready(); h.setTime(2001); h.c.poll(100);
  assert.equal(h.events.at(-1).payload.code, "HEARTBEAT_TIMEOUT");
  const j = setup(); j.ready(); j.c.disconnected("p0");
  assert.equal(j.events.at(-1).payload.code, "PARTICIPANT_DISCONNECTED");
});
test("foreign round, forged identity and backwards clocks halt", () => {
  for (const [id, payload] of [["foreign", { updateCount: 100 }], ["p0", { updateCount: 99 }], ["p0", { roundId: "foreign", updateCount: 100 }]]) {
    const f = setup(); f.ready();
    assert.throws(() => f.c.heartbeat(id, { roundId: f.c.roundId, ...payload }));
    assert.equal(f.c.phase, "halted");
  }
});

test("late acknowledgments cannot beat the timer poll and revive expired barriers", () => {
  const f = setup(); f.ready(); f.c.propose(f.command, 100); f.setTime(1001);
  assert.throws(() => f.prepared("p0"), /new session/);
  assert.equal(f.c.phase, "halted");
  assert.equal(f.events.some(e => e.kind === "command_commit"), false);
  const g = setup(); g.ready(); g.c.propose(g.command, 100); g.prepared("p0"); g.prepared("p1"); g.setTime(1001);
  assert.throws(() => g.applied("p0"), /new session/);
  assert.equal(g.events.some(e => e.kind === "command_completed"), false);
});
