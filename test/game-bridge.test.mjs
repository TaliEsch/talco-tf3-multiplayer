import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startGameBridge, parseTelemetry, parseEngineReceipt } from "../src/game-bridge.mjs";
import { diagnosticLogger } from "../src/diagnostics.mjs";

const sample = (nonce, counter) => `function data() return {schemaVersion=1,kind="telemetry",nonce="${nonce}",counter=${counter},tickCount=123,updateCount=90,} end`;
const receipt = (nonce, requestId) => `function data() return {schemaVersion=1,kind="engine_receipt",nonce="${nonce}",requestId=${requestId},tickCount=124,updateCount=91,} end`;
const lua = fields => `function data() return {${Object.entries(fields).map(([k, v]) => `${k}=${JSON.stringify(v)},`).join("")} } end`;
test("bridge reads optional engine observations without allowing them to enable gameplay", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-observation-"));
  const directory = path.join(root, "tf3mp_status_1");
  const events = [];
  const bridge = await startGameBridge({ directory, intervalMs: 10, logger: e => events.push(e) });
  try {
    await writeFile(path.join(directory, "telemetry.lua"), sample(bridge.nonce, 1));
    await waitFor(() => bridge.connected);
    assert.equal(bridge.engineObservation.available, false);
    await waitFor(() => events.some(e => e.event === "engine_observation_unavailable"));
    assert.equal(events.find(e => e.event === "engine_observation_unavailable").code, "OBSERVATION_FILE_MISSING");
    await writeFile(path.join(directory, "engine_observation.lua"), lua({ schemaVersion: 1, kind: "engine_observation", nonce: bridge.nonce,
      counter: 1, tickCount: 123, updateCount: 90, speedup: 0, companyEntity: 7, balance: 50, balanceKnown: 1, balanceNegative: 1 }));
    await waitFor(() => bridge.engineObservation.available);
    assert.equal(bridge.engineObservation.sample.companyEntity, 7);
    assert.equal(bridge.engineObservation.gameplayVerified, false);
    assert.equal(events.filter(e => e.event === "engine_observation_unavailable").length, 1);
    assert.match(await readFile(path.join(directory, "bridge.lua"), "utf8"), /mode = "telemetry"/);
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("bridge condition timed out");
}

for (const scheduled of [false, true]) test(`local vehicle bridge (${scheduled ? "scheduled" : "immediate"}) is opt-in, single-enable and cleans up`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-vehicle-bridge-"));
  const directory = path.join(root, "tf3mp_status_1"), events = [];
  const bridge = await startGameBridge({ directory, intervalMs: 10, logger: event => events.push(event) });
  try {
    assert.match(await readFile(path.join(directory, "bridge.lua"), "utf8"), /mode = "telemetry"/);
    await assert.rejects(bridge.enableVehicleTest(), /BRIDGE_OFFLINE/);
    await writeFile(path.join(directory, "telemetry.lua"), sample(bridge.nonce, 1));
    await waitFor(() => bridge.connected);
    await bridge.enableVehicleTest({ scheduled });
    assert.equal(events.find(e => e.event === "vehicle_test_enabled").code, scheduled ? "SCHEDULED_LOCAL_TEST" : "IMMEDIATE_LOCAL_TEST");
    assert.match(await readFile(path.join(directory, "bridge.lua"), "utf8"), /mode = "vehicle_test"/);
    await assert.rejects(bridge.enableVehicleTest(), /VEHICLE_TEST_BUSY/);
    await assert.rejects(bridge.requestEngineProbe(), /ENGINE_PROBE_BUSY/);
    await writeFile(path.join(directory, "vehicle_intent.lua"), lua({ schemaVersion: 1, kind: "vehicle_intent", nonce: bridge.nonce, requestId: 1, entity: 42, stopFlag: 1 }));
    await waitFor(() => events.some(e => e.event === "vehicle_test_inspecting"));
    const base = { schemaVersion: 1, kind: "vehicle_receipt", nonce: bridge.nonce, actionId: 1, entity: 42, company: 7, localPlayer: 7, revision: 1, stopFlag: 1, tickCount: 123 };
    await writeFile(path.join(directory, "vehicle_receipt.lua"), lua({ ...base, phase: "inspect", hostSequence: 0, scheduledUpdate: 0, updateCount: 90, outcome: "inspected" }));
    await waitFor(() => events.some(e => e.event === "vehicle_test_accepted"));
    const target = scheduled ? 150 : 0;
    assert.match(await readFile(path.join(directory, "vehicle_command.lua"), "utf8"), new RegExp(`scheduledUpdate = ${target},`));
    await writeFile(path.join(directory, "vehicle_receipt.lua"), lua({ ...base, phase: "commit", hostSequence: 1, scheduledUpdate: target, updateCount: scheduled ? target : 93, outcome: "applied" }));
    await waitFor(() => events.some(e => e.event === "vehicle_test_applied"));
    await bridge.disableVehicleTest();
    assert.match(await readFile(path.join(directory, "bridge.lua"), "utf8"), /mode = "telemetry"/);
    assert.ok(events.some(e => e.event === "vehicle_test_disabled"));
    await assert.rejects(bridge.enableVehicleTest(), /VEHICLE_TEST_BUSY/);
  } finally { await bridge.close(); }
  try {
    for (const name of ["bridge.lock", "bridge.lua", "vehicle_command.lua", "vehicle_intent.lua", "vehicle_receipt.lua"]) {
      await assert.rejects(readFile(path.join(directory, name)), { code: "ENOENT" });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("engine receipt rejects another session/request, negative clocks, extra fields and Lua code", () => {
  const nonce = "a".repeat(32);
  assert.equal(parseEngineReceipt(receipt(nonce, 1), nonce, 1).updateCount, 91);
  for (const invalid of [receipt("b".repeat(32), 1), receipt(nonce, 2),
    receipt(nonce, 1).replace("tickCount=124", "tickCount=-1"),
    receipt(nonce, 1).replace("tickCount=124", 'extra="value",tickCount=124'),
    receipt(nonce, 1) + ';os.execute("bad")']) {
    assert.throws(() => parseEngineReceipt(invalid, nonce, 1));
  }
});

test("engine probe requires live telemetry, is single-flight, and only accepts its matching receipt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-engine-"));
  const directory = path.join(root, "tf3mp_status_1");
  const events = [];
  const bridge = await startGameBridge({ directory, intervalMs: 10, logger: event => events.push(event.event) });
  try {
    await assert.rejects(bridge.requestEngineProbe(), /BRIDGE_OFFLINE/);
    await writeFile(path.join(directory, "telemetry.lua"), sample(bridge.nonce, 1));
    await waitFor(() => bridge.connected);
    const requestId = await bridge.requestEngineProbe();
    assert.match(await readFile(path.join(directory, "engine_request.lua"), "utf8"), /kind = "engine_probe"/);
    await assert.rejects(bridge.requestEngineProbe(), /ENGINE_PROBE_BUSY/);
    await writeFile(path.join(directory, "engine_receipt.lua"), receipt(bridge.nonce, requestId + 1));
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(events.includes("engine_probe_succeeded"), false);
    await writeFile(path.join(directory, "engine_receipt.lua"), receipt(bridge.nonce, requestId));
    await waitFor(() => events.includes("engine_probe_succeeded"));
    await assert.rejects(readFile(path.join(directory, "engine_request.lua")), { code: "ENOENT" });
    assert.equal(await bridge.requestEngineProbe(), requestId + 1);
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
  await assert.rejects(bridge.requestEngineProbe(), /BRIDGE_OFFLINE/);
});

test("engine probe times out without claiming success and removes its mailbox", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-engine-timeout-"));
  const directory = path.join(root, "tf3mp_status_1");
  const events = [];
  const bridge = await startGameBridge({ directory, intervalMs: 10, probeTimeoutMs: 50, logger: event => events.push(event.event) });
  try {
    await writeFile(path.join(directory, "telemetry.lua"), sample(bridge.nonce, 1));
    await waitFor(() => bridge.connected);
    await bridge.requestEngineProbe();
    await waitFor(() => events.includes("engine_probe_timeout"));
    assert.equal(events.includes("engine_probe_succeeded"), false);
    await assert.rejects(readFile(path.join(directory, "engine_request.lua")), { code: "ENOENT" });
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});

test("bridge acknowledges fresh game telemetry, rejects replay, disconnects, and releases ownership", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-bridge-"));
  const directory = path.join(root, "tf3mp_status_1");
  const events = [];
  const bridge = await startGameBridge({ directory, intervalMs: 10, staleMs: 80, logger: event => events.push(event.event) });
  try {
    await assert.rejects(startGameBridge({ directory }), { code: "EEXIST" });
    await writeFile(path.join(directory, "telemetry.lua"), sample(bridge.nonce, 1));
    for (let attempt = 0; attempt < 100 && !bridge.connected; attempt++) await new Promise(r => setTimeout(r, 10));
    assert.equal(bridge.connected, true);
    assert.deepEqual(bridge.clock, { tickCount: 123, updateCount: 90 });
    assert.match(await readFile(path.join(directory, "ack.lua"), "utf8"), /counter = 1/);
    await new Promise(r => setTimeout(r, 120));
    assert.equal(bridge.connected, false);
    assert.ok(events.includes("bridge_disconnected"));
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});

test("bridge parser rejects stale sessions and Lua code", () => {
  const nonce = "a".repeat(32);
  assert.throws(() => parseTelemetry(sample("b".repeat(32), 0), nonce));
  assert.throws(() => parseTelemetry(sample(nonce, 0) + ';os.execute("bad")', nonce));
  assert.throws(() => parseTelemetry(sample(nonce, -1), nonce));
});

test("diagnostics never serialize nested payloads or credentials", () => {
  let output = "";
  const log = diagnosticLogger({ write: text => { output += text; } });
  log({ event: "message", kind: "admitted", secret: "credential", payload: { secret: "nested", displayName: "private" }, bind: "192.168.0.1" });
  assert.equal(output.includes("credential"), false);
  assert.equal(output.includes("nested"), false);
  assert.equal(output.includes("private"), false);
  assert.equal(output.includes("192.168"), false);
});
