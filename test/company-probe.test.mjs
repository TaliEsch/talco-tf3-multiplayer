import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseCompanyReceipt } from "../src/company-probe.mjs";
import { startGameBridge } from "../src/game-bridge.mjs";
const nonce = "a".repeat(32);
const lua = p => `function data() return {${Object.entries(p).map(([k,v]) => `${k}=${JSON.stringify(v)},`).join("")} } end`;
const result = overrides => ({ schemaVersion: 1, kind: "company_receipt", nonce, requestId: 1, companyEntity: 7,
  newCompanyEntity: 8, tickCount: 102, updateCount: 51, outcome: "created", ...overrides });
async function until(predicate) { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 5)); } assert.fail("company test timed out"); }
test("company receipt is fixed-schema, session-bound and requires a distinct created entity", () => {
  assert.equal(parseCompanyReceipt(lua(result()), nonce, 1, 7).newCompanyEntity, 8);
  for (const p of [{ nonce: "b".repeat(32) }, { requestId: 2 }, { companyEntity: 9 }, { newCompanyEntity: 7 }, { newCompanyEntity: 0 }, { outcome: "unknown" }, { extra: 1 }])
    assert.throws(() => parseCompanyReceipt(lua(result(p)), nonce, 1, 7));
});
for (const outcome of ["created", "already_attempted", "timeout"]) test(`company bridge is opt-in, single-attempt, isolated and cleans request: ${outcome}`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-company-")), directory = path.join(root, "tf3mp_status_1"), events = [];
  const bridge = await startGameBridge({ directory, intervalMs: 5, companyTimeoutMs: outcome === "timeout" ? 150 : 30000, logger: e => events.push(e) });
  try {
    await assert.rejects(bridge.requestCompanyTest(), /OBSERVATION_REQUIRED/);
    const sample = { schemaVersion: 1, kind: "engine_observation", nonce: bridge.nonce, counter: 1, tickCount: 100, updateCount: 50,
      speedup: 1, companyEntity: 7, balanceKnown: 1, balanceNegative: 0, balance: 100 };
    await writeFile(path.join(directory, "engine_observation.lua"), lua(sample));
    await writeFile(path.join(directory, "telemetry.lua"), lua({ schemaVersion: 1, kind: "telemetry", nonce: bridge.nonce, counter: 1, tickCount: 100, updateCount: 50 }));
    await until(() => bridge.engineObservation.available);
    await assert.rejects(readFile(path.join(directory, "company_request.lua")), { code: "ENOENT" });
    await bridge.requestCompanyTest();
    assert.match(await readFile(path.join(directory, "company_request.lua"), "utf8"), /expiresTick = 400/);
    assert.match(await readFile(path.join(directory, "bridge.lua"), "utf8"), /mode = "company_test"/);
    await assert.rejects(bridge.requestCompanyTest(), /COMPANY_TEST_BUSY_OR_USED/);
    await assert.rejects(bridge.enableVehicleTest(), /VEHICLE_TEST_BUSY/);
    await assert.rejects(bridge.requestEngineProbe(), /ENGINE_PROBE_BUSY/);
    if (outcome !== "timeout") await writeFile(path.join(directory, "company_receipt.lua"), lua(result({ nonce: bridge.nonce, outcome, newCompanyEntity: outcome === "created" ? 8 : 0 })));
    await until(() => events.some(e => e.event === "company_test_result"));
    assert.equal(events.find(e => e.event === "company_test_result").code, outcome === "timeout" ? "OUTCOME_UNKNOWN_DO_NOT_RETRY" : outcome);
    await assert.rejects(readFile(path.join(directory, "company_request.lua")), { code: "ENOENT" });
    await assert.rejects(bridge.requestCompanyTest(), /COMPANY_TEST_BUSY_OR_USED/);
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});
test("company source latches before creation and never executes from saved update state", async () => {
  const source = await readFile(new URL("../mod/content/tf3mp_status.script.tl", import.meta.url), "utf8");
  const region = source.slice(source.indexOf("local function companyEvent"), source.indexOf("local ret :"));
  assert.ok(region.indexOf("current.companyTestAttempted = true\n  state:set(current)") < region.indexOf("api.cmd.sendCommand"));
  assert.match(region, /if current.companyTestAttempted == true then/);
  const updater = source.slice(source.indexOf("  update = function"), source.indexOf("  handleEvent = function"));
  assert.doesNotMatch(updater, /companyEvent\(|makeGameAddPlayerCmd/);
});
