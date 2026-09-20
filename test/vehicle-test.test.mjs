import test from "node:test";
import assert from "node:assert/strict";
import { createVehicleTest, parseVehicleIntent, parseVehicleReceipt } from "../src/vehicle-test.mjs";

const nonce = "a".repeat(32);
const lua = value => `function data() return { ${Object.entries(value).map(([k, v]) => `${k} = ${typeof v === "string" ? JSON.stringify(v) : v},`).join(" ")} } end`;
function fixture(scheduled = false, leadUpdates = 60, heldUpdate = null, onHeldApplied = async () => {}) {
  const files = new Map(), events = [], writes = [];
  let now = 1000, connected = true, updateCount = 100;
  const controller = createVehicleTest({ nonce, scheduled, leadUpdates, heldUpdate, onHeldApplied, timeoutMs: 1000, now: () => now,
    read: async name => { if (!files.has(name)) throw new Error("ENOENT"); return lua(files.get(name)); },
    publish: async (name, fields) => { files.set(name, fields); writes.push({ ...fields }); },
    remove: async name => files.delete(name), clock: () => ({ tickCount: 500, updateCount }),
    connected: () => connected, logger: e => events.push(e) });
  const intent = (overrides = {}) => files.set("vehicle_intent.lua", { schemaVersion: 1, kind: "vehicle_intent", nonce, requestId: 1, entity: 42, stopFlag: 1, ...overrides });
  const receipt = (overrides = {}) => {
    const cmd = files.get("vehicle_command.lua");
    files.set("vehicle_receipt.lua", { schemaVersion: cmd.schemaVersion, kind: "vehicle_receipt", nonce, actionId: cmd.actionId, entity: 42,
      company: 7, localPlayer: 7, revision: 12, stopFlag: 1, tickCount: 500,
      updateCount: cmd.phase === "commit" ? 101 : 100,
      phase: cmd.phase, hostSequence: cmd.hostSequence, scheduledUpdate: cmd.scheduledUpdate,
      outcome: cmd.phase === "commit" ? "applied" : "inspected", ...overrides });
  };
  return { controller, files, writes, events, intent, receipt,
    setTime: v => { now = v; }, setConnected: v => { connected = v; }, setUpdate: v => { updateCount = v; } };
}

test("vehicle intent parser rejects foreign sessions, extra fields and invalid values", () => {
  const good = { schemaVersion: 1, kind: "vehicle_intent", nonce, requestId: 1, entity: 42, stopFlag: 1 };
  assert.equal(parseVehicleIntent(lua(good), nonce).entity, 42);
  for (const bad of [{ nonce: "b".repeat(32) }, { entity: -1 }, { stopFlag: 2 }, { command: "anything" }, { requestId: 0 }]) {
    assert.throws(() => parseVehicleIntent(lua({ ...good, ...bad }), nonce));
  }
});

test("held vehicle uses v2, applies once at existing barrier and then stops accepting input", async () => {
  let applied = 0;
  const f = fixture(true, 40, 100, async () => { applied++; });
  f.intent(); await f.controller.poll();
  assert.equal(f.writes.at(-1).schemaVersion, 2); assert.equal(f.writes.at(-1).scheduledUpdate, 100);
  f.receipt(); await f.controller.poll(); assert.equal(f.writes.at(-1).scheduledUpdate, 100);
  f.receipt({ updateCount: 100 }); await f.controller.poll();
  assert.equal(applied, 1); assert.equal(f.events.at(-1).event, "vehicle_test_applied");
  f.intent({ requestId: 2 }); await f.controller.poll(); assert.equal(f.writes.length, 2);
});

test("held vehicle cannot accept legacy success or allow release after a lost hold", async () => {
  let applied = 0;
  const f = fixture(true, 40, 100, async () => { applied++; });
  f.intent(); await f.controller.poll(); f.receipt({ schemaVersion: 1 }); await f.controller.poll();
  assert.equal(f.writes.length, 1);
  f.receipt(); await f.controller.poll(); f.setUpdate(101); f.receipt({ updateCount: 100 }); await f.controller.poll();
  assert.equal(applied, 0); assert.equal(f.events.at(-1).code, "HOLD_LOST");
});

test("held receipt failure never authorizes release or retries an action", async () => {
  for (const wrong of [{ outcome: "hold_lost" }, { updateCount: 101 }, { company: 8 }, { stopFlag: 0 }]) {
    let applied = 0; const f = fixture(true, 40, 100, async () => { applied++; });
    f.intent(); await f.controller.poll(); f.receipt(); await f.controller.poll();
    f.receipt({ updateCount: 100, ...wrong }); await f.controller.poll();
    assert.equal(applied, 0); assert.equal(f.controller.faulted, true);
    f.intent({ requestId: 2 }); await f.controller.poll(); assert.equal(f.writes.length, 2);
  }
});

test("immediate vehicle action needs inspection, host approval and observed postcondition", async () => {
  const f = fixture(); f.intent();
  await f.controller.poll();
  assert.equal(f.writes.at(-1).phase, "inspect");
  await f.controller.poll(); assert.equal(f.writes.length, 1);
  f.receipt(); await f.controller.poll();
  assert.equal(f.writes.at(-1).phase, "commit");
  assert.equal(f.writes.at(-1).scheduledUpdate, 0);
  assert.equal(f.events.at(-1).code, "IMMEDIATE_LOCAL_TEST");
  assert.equal(f.writes.at(-1).company, 7);
  f.receipt(); await f.controller.poll();
  assert.equal(f.events.at(-1).event, "vehicle_test_applied");
  assert.equal(f.controller.busy, false);
  await f.controller.poll(); assert.equal(f.writes.length, 2, "same intent is never replayed");
});

test("receipt parser rejects incorrect shape and identity", async () => {
  const f = fixture(); f.intent(); await f.controller.poll(); f.receipt();
  const good = f.files.get("vehicle_receipt.lua");
  assert.equal(parseVehicleReceipt(lua(good), nonce, 1, 42).outcome, "inspected");
  for (const bad of [{ actionId: 2 }, { entity: 43 }, { nonce: "b".repeat(32) }, { outcome: "pending" }, { revision: -1 }, { execute: 1 }]) {
    assert.throws(() => parseVehicleReceipt(lua({ ...good, ...bad }), nonce, 1, 42));
  }
});

test("foreign ownership cannot publish commit", async () => {
  for (const wrong of [{ company: 8 }, { outcome: "not_owner" }, { outcome: "missing" }]) {
    const f = fixture(); f.intent(); await f.controller.poll(); f.receipt(wrong); await f.controller.poll();
    assert.equal(f.writes.length, 1);
    assert.equal(f.events.at(-1).event, "vehicle_test_rejected");
  }
});

test("inspection waits for lagging telemetry; stale or overflowing clocks reject", async () => {
  const f = fixture(); f.intent(); await f.controller.poll(); f.receipt({ updateCount: 105 });
  await f.controller.poll(); assert.equal(f.writes.length, 1);
  f.setUpdate(105); await f.controller.poll(); assert.equal(f.writes.at(-1).scheduledUpdate, 0);
  for (const [update, receipt] of [[131, {}], [2147483640, { updateCount: 2147483640 }], [100, { tickCount: 2147483600 }]]) {
    const g = fixture(); g.intent(); await g.controller.poll(); g.setUpdate(update); g.receipt(receipt);
    await g.controller.poll(); assert.equal(g.writes.length, 1); assert.equal(g.events.at(-1).event, "vehicle_test_rejected");
  }
});

test("uncertain or invalid execution faults the local controller and never retries", async () => {
  for (const wrong of [{ updateCount: 99 }, { updateCount: 701 }, { tickCount: 499 }, { tickCount: 1701 }, { stopFlag: 0 }, { company: 8 }, { revision: 13 }, { outcome: "late" }]) {
    const f = fixture(); f.intent(); await f.controller.poll(); f.receipt(); await f.controller.poll();
    f.receipt(wrong); await f.controller.poll();
    assert.equal(f.controller.faulted, true);
    assert.equal(f.events.at(-1).event, "vehicle_test_rejected");
    f.intent({ requestId: 2 }); await f.controller.poll(); assert.equal(f.writes.length, 2);
  }
  for (const disconnect of [false, true]) {
    const f = fixture(); f.intent(); await f.controller.poll(); f.receipt(); await f.controller.poll();
    if (disconnect) f.setConnected(false); else f.setTime(2001);
    await f.controller.poll(); assert.equal(f.controller.faulted, true);
    assert.equal(f.files.has("vehicle_command.lua"), false);
  }
});

test("closing controller prevents subsequent work", async () => {
  const f = fixture(); await f.controller.close(); f.intent(); await f.controller.poll();
  assert.equal(f.writes.length, 0);
});

test("queued receipt is progress, not execution, and is logged once", async () => {
  const f = fixture(); f.intent(); await f.controller.poll(); f.receipt(); await f.controller.poll();
  f.receipt({ outcome: "queued", updateCount: 110 });
  await f.controller.poll(); await f.controller.poll();
  assert.equal(f.controller.busy, true);
  assert.equal(f.events.filter(e => e.event === "vehicle_test_queued").length, 1);
  assert.equal(f.events.some(e => e.event === "vehicle_test_applied"), false);
  f.receipt(); await f.controller.poll();
  assert.equal(f.events.at(-1).event, "vehicle_test_applied");
});

test("handoff failures terminate with explicit engine reason", async () => {
  for (const outcome of ["no_inspection", "bad_schedule", "runtime_reset", "handler_failed"]) {
    const f = fixture(); f.intent(); await f.controller.poll(); f.receipt(); await f.controller.poll();
    f.receipt({ outcome }); await f.controller.poll();
    assert.equal(f.events.at(-1).code, outcome);
    assert.equal(f.controller.faulted, true);
  }
});

test("scheduled local vehicle mode keeps authority target and requires exact receipt", async () => {
  const f = fixture(true); f.intent(); await f.controller.poll(); f.receipt(); await f.controller.poll();
  assert.equal(f.writes.at(-1).scheduledUpdate, 160);
  assert.equal(f.events.at(-1).code, "SCHEDULED_LOCAL_TEST");
  f.receipt({ updateCount: 160 }); await f.controller.poll();
  assert.equal(f.events.at(-1).event, "vehicle_test_applied");
  for (const override of [{ updateCount: 159 }, { updateCount: 161 }, { outcome: "early", updateCount: 159 }, { outcome: "late", updateCount: 161 }]) {
    const g = fixture(true); g.intent(); await g.controller.poll(); g.receipt(); await g.controller.poll();
    g.receipt(override); await g.controller.poll();
    assert.equal(g.events.at(-1).event, "vehicle_test_rejected");
    assert.equal(g.controller.faulted, true);
    assert.equal(g.events.some(e => e.event === "vehicle_test_applied"), false);
  }
});

for (const lead of [20, 40, 60]) {
  for (const outcome of ["applied", "early", "late", "expired", "not_owner", "changed", "command_failed"]) {
    test(`vehicle failure matrix: lead ${lead}, ${outcome}`, async () => {
      const f = fixture(true, lead); f.intent(); await f.controller.poll(); f.receipt(); await f.controller.poll();
      assert.equal(f.writes.at(-1).scheduledUpdate, 100 + lead);
      const delta = outcome === "early" ? -1 : outcome === "late" ? 1 : 0;
      f.receipt({ outcome, updateCount: 100 + lead + delta }); await f.controller.poll();
      assert.equal(f.events.at(-1).event, outcome === "applied" ? "vehicle_test_applied" : "vehicle_test_rejected");
      assert.equal(f.controller.faulted, outcome !== "applied");
    });
  }
}

test("extra clicks are dropped, not applied after the active request", async () => {
  const f = fixture(true, 20); f.intent(); await f.controller.poll();
  f.intent({ requestId: 2, stopFlag: 0 }); f.receipt(); await f.controller.poll();
  assert.equal(f.events.some(e => e.event === "vehicle_test_input_ignored"), true);
  assert.equal(f.writes.at(-1).stopFlag, 1);
  f.receipt({ updateCount: 120 }); await f.controller.poll(); await f.controller.poll();
  assert.equal(f.writes.length, 2);
});

test("clock reset and missing paused-game receipt fail closed", async () => {
  for (const reset of [true, false]) {
    const f = fixture(true); f.intent(); await f.controller.poll(); f.receipt(); await f.controller.poll();
    if (reset) f.setUpdate(99); else f.setTime(2001);
    await f.controller.poll();
    assert.equal(f.events.at(-1).code, reset ? "CLOCK_RESET" : "OUTCOME_UNKNOWN");
    assert.equal(f.controller.faulted, true);
  }
});

test("disable cancels future requests without falsely claiming delivered work was recalled", async () => {
  for (const commit of [false, true]) {
    const f = fixture(true); f.intent(); await f.controller.poll();
    if (commit) { f.receipt(); await f.controller.poll(); }
    await f.controller.cancel();
    assert.equal(f.controller.faulted, true);
    assert.equal(f.files.has("vehicle_command.lua"), false);
    assert.equal(f.events.some(e => e.code === (commit ? "CANCEL_REQUESTED_OUTCOME_UNKNOWN" : "CANCELLED_BEFORE_APPROVAL")), true);
    const count = f.writes.length;
    f.intent({ requestId: 2 }); await f.controller.poll(); assert.equal(f.writes.length, count);
  }
});

test("unsupported vehicle lead values cannot construct a controller", () => {
  for (const lead of [0, 8, 19, 21, 600, 60.1, "20", NaN]) assert.throws(() => fixture(true, lead), /BAD_VEHICLE_LEAD/);
});
