import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseScheduledReceipt, startGameBridge } from "../src/game-bridge.mjs";
import { parseFlatDataFile } from "../src/userdata-ipc.mjs";

const nonce = "a".repeat(32);
const receipt = (n, id, actual, outcome, target = 150) => `function data() return {schemaVersion=1,kind="scheduled_receipt",nonce="${n}",requestId=${id},tickCount=500,updateCount=${actual},scheduledUpdate=${target},outcome="${outcome}",} end`;
const telemetry = n => `function data() return {schemaVersion=1,kind="telemetry",nonce="${n}",counter=1,tickCount=100,updateCount=90,} end`;
async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)); }
  assert.fail("timing probe condition timed out");
}

test("scheduled receipt requires exact update for success and correlated session/id/target", () => {
  assert.equal(parseScheduledReceipt(receipt(nonce, 1, 150, "applied"), nonce, 1, 150).outcome, "applied");
  for (const source of [receipt(nonce, 1, 149, "applied"), receipt(nonce, 1, 151, "applied"),
    receipt("b".repeat(32), 1, 150, "applied"), receipt(nonce, 2, 150, "applied"),
    receipt(nonce, 1, 151, "applied", 151), receipt(nonce, 1, 150, "pending"),
    receipt(nonce, 1, 150, "applied") + ';os.execute("bad")']) {
    assert.throws(() => parseScheduledReceipt(source, nonce, 1, 150));
  }
});

test("scheduled receipt validates missed-deadline and reset outcomes", () => {
  assert.equal(parseScheduledReceipt(receipt(nonce, 1, 151, "late"), nonce, 1, 150).outcome, "late");
  assert.equal(parseScheduledReceipt(receipt(nonce, 1, 20, "clock_reset"), nonce, 1, 150).outcome, "clock_reset");
  assert.throws(() => parseScheduledReceipt(receipt(nonce, 1, 150, "late"), nonce, 1, 150));
  assert.throws(() => parseScheduledReceipt(receipt(nonce, 1, 150, "clock_reset"), nonce, 1, 150));
});

for (const [outcome, actual, expected] of [["applied", 150, "timing_probe_succeeded"], ["late", 151, "timing_probe_failed"], ["clock_reset", 20, "timing_probe_failed"]]) {
  test(`synthetic scheduled exchange reports ${outcome} honestly`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-timing-"));
    const directory = path.join(root, "tf3mp_status_1");
    const events = [];
    const bridge = await startGameBridge({ directory, intervalMs: 10, logger: event => events.push(event) });
    try {
      await writeFile(path.join(directory, "telemetry.lua"), telemetry(bridge.nonce));
      await waitFor(() => bridge.connected);
      const requestId = await bridge.requestEngineProbe({ scheduled: true });
      const request = parseFlatDataFile(await readFile(path.join(directory, "engine_request.lua"), "utf8"));
      assert.equal(request.kind, "scheduled_probe");
      assert.equal(request.scheduledUpdate, 150);
      await writeFile(path.join(directory, "engine_receipt.lua"), receipt(bridge.nonce, requestId, actual, outcome));
      await waitFor(() => events.some(e => e.event === expected));
      const result = events.find(e => e.event === expected);
      assert.equal(result.scheduledUpdate, 150);
      assert.equal(result.updateCount, actual);
      assert.equal(result.code, outcome);
      assert.equal(events.some(e => e.event === "engine_probe_succeeded"), false);
      await assert.rejects(readFile(path.join(directory, "engine_request.lua")), { code: "ENOENT" });
    } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
  });
}

test("a paused/nonresponding timing probe times out; invalid lead never publishes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-timing-timeout-"));
  const directory = path.join(root, "tf3mp_status_1");
  const events = [];
  const bridge = await startGameBridge({ directory, intervalMs: 10, scheduledTimeoutMs: 50, logger: e => events.push(e.event) });
  try {
    await writeFile(path.join(directory, "telemetry.lua"), telemetry(bridge.nonce));
    await waitFor(() => bridge.connected);
    for (const leadUpdates of [0, -1, 601, 8.5, NaN]) await assert.rejects(bridge.requestEngineProbe({ scheduled: true, leadUpdates }), /BAD_SCHEDULE/);
    await assert.rejects(readFile(path.join(directory, "engine_request.lua")), { code: "ENOENT" });
    await bridge.requestEngineProbe({ scheduled: true });
    await waitFor(() => events.includes("timing_probe_timeout"));
    assert.equal(events.includes("timing_probe_succeeded"), false);
    await assert.rejects(readFile(path.join(directory, "engine_request.lua")), { code: "ENOENT" });
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});

test("previous-session startup telemetry is ignored quietly", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-stale-sample-"));
  const directory = path.join(root, "tf3mp_status_1");
  const events = [];
  const bridge = await startGameBridge({ directory, intervalMs: 5, logger: e => events.push(e.event) });
  try {
    await writeFile(path.join(directory, "telemetry.lua"), telemetry(nonce));
    await new Promise(r => setTimeout(r, 40));
    assert.equal(bridge.connected, false);
    assert.equal(events.includes("bridge_sample_rejected"), false);
    await writeFile(path.join(directory, "telemetry.lua"), telemetry(bridge.nonce));
    await waitFor(() => bridge.connected);
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});
