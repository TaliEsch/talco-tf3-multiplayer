import test from "node:test";
import assert from "node:assert/strict";
import { CommandQueue, HostAuthority } from "../src/lockstep.mjs";
import { PROTOCOL_VERSION } from "../src/constants.mjs";

const map = () => new Map([["a", 1]]);
const command = (hostSequence = 1, scheduledUpdate = 10) => ({
  protocolVersion: PROTOCOL_VERSION, hostSequence, scheduledUpdate,
  originPlayerId: "a", targetCompanyEntity: 1, targetEntity: null,
  commandType: "simulation.speed", payload: { speedup: 1 }, clientSequence: hostSequence,
});
const code = expected => error => error.code === expected;

test("overdue command faults the queue permanently instead of executing late", () => {
  const queue = new CommandQueue();
  queue.enqueue(command(), map());
  assert.throws(() => queue.due(11), code("LATE_COMMAND"));
  assert.equal(queue.pendingCount, 1);
  assert.equal(queue.fault, "LATE_COMMAND");
  assert.throws(() => queue.due(10), code("LATE_COMMAND"));
  assert.throws(() => queue.enqueue(command(2, 20), map()), code("LATE_COMMAND"));
});

test("missing sequence at deadline faults without partially draining a batch", () => {
  const queue = new CommandQueue();
  queue.enqueue(command(1), map());
  queue.enqueue(command(3), map());
  assert.deepEqual(queue.due(9), []);
  assert.throws(() => queue.due(10), code("SEQUENCE_GAP"));
  assert.equal(queue.pendingCount, 2);
});

test("an out-of-order command arriving before deadline remains valid", () => {
  const queue = new CommandQueue();
  queue.enqueue(command(2), map());
  assert.deepEqual(queue.due(9), []);
  queue.enqueue(command(1), map());
  assert.deepEqual(queue.due(10).map(value => value.hostSequence), [1, 2]);
  assert.deepEqual(queue.due(10), []);
});

test("commands received after the update's drain phase are rejected", () => {
  const queue = new CommandQueue();
  queue.due(10);
  assert.throws(() => queue.enqueue(command(), map()), code("LATE_COMMAND"));
});

test("conflicting duplicate host sequences stop the queue", () => {
  const queue = new CommandQueue();
  queue.enqueue(command(), map());
  assert.equal(queue.enqueue(command(), map()), false);
  assert.throws(() => queue.enqueue({ ...command(), payload: { speedup: 4 } }, map()), code("SEQUENCE_CONFLICT"));
});

test("backward clocks and unsafe clocks fail closed", () => {
  for (const invalid of [-1, NaN, Infinity, 2.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => new CommandQueue().due(invalid), code("BAD_CLOCK"));
  }
  const queue = new CommandQueue();
  queue.due(10);
  assert.throws(() => queue.due(9), code("BAD_CLOCK"));
});

test("bounded queue and inconsistent host schedule fail closed", () => {
  const queue = new CommandQueue({ maxPending: 1 });
  queue.enqueue(command(), map());
  assert.throws(() => queue.enqueue(command(2, 11), map()), code("QUEUE_LIMIT"));
  const inconsistent = new CommandQueue();
  inconsistent.enqueue(command(2, 10), map());
  assert.throws(() => inconsistent.enqueue(command(1, 11), map()), code("SCHEDULE_ORDER"));
});

test("queue snapshots payloads rather than trusting mutable caller objects", () => {
  const queue = new CommandQueue();
  const original = command();
  queue.enqueue(original, map());
  original.scheduledUpdate = 9;
  original.payload.speedup = 4;
  const [accepted] = queue.due(10);
  assert.equal(accepted.payload.speedup, 1);
  assert.equal(Object.isFrozen(accepted.payload), true);
});

test("company mapping and entity ownership are checked again at dispatch", () => {
  for (const change of ["company", "owner"]) {
    const queue = new CommandQueue();
    const players = map();
    let owner = 1;
    queue.enqueue({ ...command(), commandType: "vehicle.setRunning", targetEntity: 7, payload: { running: false } }, players, () => owner);
    if (change === "company") players.set("a", 2);
    else owner = 2;
    assert.throws(() => queue.due(10), code("AUTH_RECHECK_FAILED"));
    assert.equal(queue.pendingCount, 1);
  }
  assert.throws(() => new CommandQueue().enqueue(command(), new Map([["a", null]])), code("AUTH_RECHECK_FAILED"));
});

test("host rejects fractional scheduling and snapshots accepted payloads", () => {
  const options = { sessionId: "test", buildHash: "a".repeat(64), modManifestHash: "b".repeat(64) };
  assert.throws(() => new HostAuthority({ ...options, leadUpdates: 8.5 }), RangeError);
  const host = new HostAuthority(options);
  const player = host.admit({ ...options, displayName: "A" });
  host.bindCompanyEntity(player.playerId, 1);
  const request = { messageId: "1", clientSequence: 1, originPlayerId: player.playerId,
    targetCompanyEntity: 1, commandType: "simulation.speed", payload: { speedup: 1 } };
  const accepted = host.accept(request, 0, player.playerId);
  request.payload.speedup = 4;
  assert.equal(accepted.payload.speedup, 1);
  assert.throws(() => host.accept({ ...request, messageId: "2", clientSequence: 2 }, Number.MAX_SAFE_INTEGER, player.playerId), code("BAD_CLOCK"));
});

test("two model queues agree at exact updates despite differing arrival order", () => {
  const left = new CommandQueue(), right = new CommandQueue();
  const commands = [command(1, 10), command(2, 10), command(3, 12)];
  for (const value of commands) left.enqueue(value, map());
  for (const value of [...commands].reverse()) right.enqueue(value, map());
  for (let update = 0; update <= 12; update++) assert.deepEqual(left.due(update), right.due(update));
  assert.equal(left.pendingCount, 0);
  assert.equal(right.pendingCount, 0);
});
