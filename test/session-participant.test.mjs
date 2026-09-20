import test from "node:test";
import assert from "node:assert/strict";
import { SessionParticipant } from "../src/session-participant.mjs";
const checkpointHash = "a".repeat(64), stateHash = "b".repeat(64), roundId = "round";
const companies = new Map([["a", 10], ["b", 11]]);
const command = () => ({ protocolVersion: 2, hostSequence: 1, scheduledUpdate: 108, originPlayerId: "a", targetCompanyEntity: 10, targetEntity: 20, commandType: "vehicle.setRunning", payload: { running: false }, clientSequence: 1, requestMessageId: "request" });
function fixture() {
  let update = 100, now = 0, owner = 10, applies = 0, closes = 0, held = false;
  const sent = [], halted = [];
  const adapter = { checkpoint: () => ({ checkpointHash, updateCount: 100 }), updateCount: () => update, owner: () => owner,
    apply: () => { applies++; return { updateCount: update, stateHash }; }, halt: code => halted.push(code),
    hold: () => { held = true; }, release: () => { held = false; }, barrierState: () => ({ held, updateCount: update }) };
  const p = new SessionParticipant({ playerId: "a", companies, adapter, send: (kind, payload) => sent.push({ kind, payload }), disconnect: () => closes++, now: () => now });
  const start = () => {
    p.receive("coordination_prepare", { roundId, checkpointHash, updateCount: 100, players: [...companies].map(([playerId, companyEntity]) => ({ playerId, companyEntity })) });
    p.receive("coordination_ready", { roundId, checkpointHash, updateCount: 100 });
  };
  return { p, start, adapter, sent, halted, setUpdate: u => { update = u; }, setTime: t => { now = t; }, setOwner: o => { owner = o; }, get applies() { return applies; }, get closes() { return closes; },
    prepare: () => p.receive("command_prepare", { roundId, command: command() }), commit: () => p.receive("command_commit", { roundId, command: command() }) };
}
test("participant executes once only after matching commit at exact update", () => {
  const f = fixture(); f.start(); f.prepare(); f.p.poll(); assert.equal(f.applies, 0);
  f.commit(); f.setUpdate(107); f.p.poll(); assert.equal(f.applies, 0);
  f.setUpdate(108); f.p.poll(); f.p.poll(); assert.equal(f.applies, 1);
  assert.equal(f.sent.filter(e => e.kind === "command_applied").length, 1);
  f.p.receive("command_completed", { roundId, hostSequence: 1, updateCount: 108, stateHash });
  assert.equal(f.p.phase, "running"); assert.equal(f.p.fault, null);
});
for (const mode of ["missing", "conflict", "duplicate", "late", "owner", "clock", "disconnect", "timeout", "host-halt"]) test(`participant fails closed: ${mode}`, () => {
  const f = fixture(); f.start(); f.prepare();
  if (mode === "missing") { f.setUpdate(108); f.p.poll(); }
  if (mode === "conflict") { const c = command(); c.payload.running = true; f.p.receive("command_commit", { roundId, command: c }); }
  if (mode === "duplicate") { f.commit(); f.commit(); }
  if (mode === "late") { f.commit(); f.setUpdate(109); f.p.poll(); }
  if (mode === "owner") { f.commit(); f.setOwner(11); f.setUpdate(108); f.p.poll(); }
  if (mode === "clock") { f.setUpdate(99); f.p.poll(); }
  if (mode === "disconnect") f.p.receive("session_ended", {});
  if (mode === "timeout") { f.setTime(10000); f.commit(); }
  if (mode === "host-halt") f.p.receive("session_halted", { roundId });
  assert.equal(f.p.phase, "halted"); assert.equal(f.applies, 0); assert.equal(f.closes, 1);
  f.setUpdate(108); f.commit(); f.p.poll(); assert.equal(f.applies, 0); assert.equal(f.halted.length, 1);
});
test("uncertain engine outcome never retries", () => {
  const f = fixture(); f.start(); f.prepare(); f.commit(); let calls = 0;
  f.adapter.apply = () => { calls++; throw new Error("possibly mutated"); };
  f.setUpdate(108); f.p.poll(); f.p.poll(); f.commit();
  assert.equal(calls, 1); assert.equal(f.p.phase, "halted");
  assert.equal(f.sent.some(e => e.kind === "command_applied"), false);
});
test("checkpoint mismatch rejects before readiness; roster cannot be trusted from host alone", () => {
  const f = fixture(); f.adapter.checkpoint = () => ({ checkpointHash: "c".repeat(64), updateCount: 100 }); f.start();
  assert.equal(f.p.fault, "CHECKPOINT_MISMATCH"); assert.equal(f.sent.length, 0);
});
test("host heartbeats preserve paused session but cannot extend a command deadline", () => {
  const f = fixture(); f.start(); f.prepare();
  for (const t of [5000, 10000, 14999]) { f.setTime(t); f.p.receive("coordination_heartbeat", { roundId }); f.p.poll(); }
  assert.equal(f.p.phase, "prepared"); f.setTime(15000); f.commit(); assert.equal(f.p.fault, "PARTICIPANT_TIMEOUT");
});
test("completion mismatch or crossing completion barrier halts without retry", () => {
  for (const mismatch of [true, false]) {
    const f = fixture(); f.start(); f.prepare(); f.commit(); f.setUpdate(108); f.p.poll();
    if (mismatch) f.p.receive("command_completed", { roundId, hostSequence: 1, updateCount: 108, stateHash: "c".repeat(64) });
    else { f.setUpdate(109); f.p.poll(); }
    assert.equal(f.p.phase, "halted"); assert.equal(f.applies, 1);
  }
});

test("no readiness acknowledgment without an explicit confirmed engine hold", () => {
  const f = fixture(); f.adapter.hold = () => {}; f.start();
  assert.equal(f.p.fault, "ENGINE_BARRIER_NOT_CONFIRMED");
  assert.equal(f.sent.length, 0); assert.equal(f.applies, 0);
});

test("engine hold must survive until matching host completion", () => {
  const f = fixture(); f.start(); f.prepare(); f.commit(); f.setUpdate(108); f.p.poll();
  f.adapter.release(); f.p.poll();
  assert.equal(f.p.fault, "ENGINE_BARRIER_NOT_CONFIRMED"); assert.equal(f.applies, 1);
  f.p.receive("command_completed", { roundId, hostSequence: 1, updateCount: 108, stateHash });
  assert.equal(f.p.phase, "halted");
});

test("failed release cannot report a running participant", () => {
  const f = fixture(); f.adapter.release = () => {}; f.start();
  assert.equal(f.p.fault, "ENGINE_BARRIER_NOT_CONFIRMED");
});

test("post-apply clock drift is caught before an applied receipt is sent", () => {
  const f = fixture(); f.start(); f.prepare(); f.commit();
  f.adapter.apply = () => { f.setUpdate(109); return { updateCount: 108, stateHash }; };
  f.setUpdate(108); f.p.poll();
  assert.equal(f.p.fault, "ENGINE_BARRIER_NOT_CONFIRMED");
  assert.equal(f.sent.some(e => e.kind === "command_applied"), false);
});

for (const method of ["hold", "checkpoint", "release", "barrierState"]) test(`async ${method} cannot satisfy the synchronous engine contract`, () => {
  const f = fixture(); f.adapter[method] = () => Promise.resolve({ held: true, updateCount: 100, checkpointHash });
  f.start(); assert.equal(f.p.fault, "ASYNC_ENGINE_ADAPTER_UNSUPPORTED");
  assert.equal(f.applies, 0);
});

test("an asynchronous apply is unknown and never retried", () => {
  const f = fixture(); f.start(); f.prepare(); f.commit(); let calls = 0;
  f.adapter.apply = () => { calls++; return Promise.resolve({ updateCount: 108, stateHash }); };
  f.setUpdate(108); f.p.poll(); f.p.poll();
  assert.equal(f.p.fault, "ASYNC_ENGINE_ADAPTER_UNSUPPORTED"); assert.equal(calls, 1);
  assert.equal(f.sent.some(e => e.kind === "command_applied"), false);
});

test("failed action hold prevents mutation even after a valid commit", () => {
  const f = fixture(); f.start(); f.prepare(); f.commit();
  f.adapter.hold = () => {}; f.setUpdate(108); f.p.poll();
  assert.equal(f.p.fault, "ENGINE_BARRIER_NOT_CONFIRMED"); assert.equal(f.applies, 0);
});

test("failed completion release stays halted after one application", () => {
  const f = fixture(); f.start(); f.prepare(); f.commit(); f.setUpdate(108); f.p.poll();
  f.adapter.release = () => {};
  f.p.receive("command_completed", { roundId, hostSequence: 1, updateCount: 108, stateHash });
  assert.equal(f.p.fault, "ENGINE_BARRIER_NOT_CONFIRMED"); assert.equal(f.applies, 1);
});

test("rejected asynchronous adapter result is contained without reopening participant", async () => {
  const f = fixture(); f.adapter.hold = () => Promise.reject(new Error("delayed failure"));
  f.start(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.p.fault, "ASYNC_ENGINE_ADAPTER_UNSUPPORTED");
  assert.equal(f.sent.length, 0); assert.equal(f.applies, 0);
});
