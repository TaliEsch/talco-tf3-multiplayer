import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseFinanceReceipt, FINANCE_BALANCES } from "../src/finance-probe.mjs";
import { startGameBridge } from "../src/game-bridge.mjs";
const nonce = "a".repeat(32);
const lua = p => `function data() return {${Object.entries(p).map(([k,v]) => `${k}=${JSON.stringify(v)},`).join("")} } end`;
function receipt(overrides = {}) {
  const p = { schemaVersion: 1, kind: "finance_receipt", nonce, requestId: 1, companyEntity: 7, newCompanyEntity: 8,
    tickCount: 100, updateCount: 50, outcome: "passed", stage: 2,
    originalBefore: 10000, originalCredit: 10000, originalAfter: 10000, targetBefore: 0, targetCredit: 1000, targetAfter: 0 };
  for (const name of FINANCE_BALANCES) p[name + "Negative"] = 0;
  return { ...p, ...overrides };
}
test("finance success requires exact company-specific credit and debit postconditions", () => {
  assert.equal(parseFinanceReceipt(lua(receipt()), nonce, 1, 7).balances.targetCredit, 1000);
  for (const bad of [{ originalCredit: 9999 }, { originalAfter: 9999 }, { targetCredit: 2000 }, { targetAfter: 1 }, { stage: 1 },
    { newCompanyEntity: 7 }, { newCompanyEntity: 0 }, { companyEntity: 9 }, { requestId: 2 }, { nonce: "b".repeat(32) },
    { extra: 1 }, { targetAfterNegative: 1 }]) assert.throws(() => parseFinanceReceipt(lua(receipt(bad)), nonce, 1, 7));
});
test("finance parser preserves signed balances and does not treat an unknown stage as success", () => {
  const p = receipt({ targetBefore: 500, targetBeforeNegative: 1, targetCredit: 500, targetAfter: 500, targetAfterNegative: 1 });
  assert.equal(parseFinanceReceipt(lua(p), nonce, 1, 7).balances.targetBefore, -500);
  assert.equal(parseFinanceReceipt(lua(receipt({ outcome: "credit_unknown", stage: 0 })), nonce, 1, 7).outcome, "credit_unknown");
});
async function until(predicate) { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 5)); } assert.fail("finance bridge timeout"); }
for (const outcome of ["passed", "credit_unknown", "debit_unknown", "already_attempted", "timeout"]) test(`finance helper is explicitly armed, bounded and never retries: ${outcome}`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-finance-")), directory = path.join(root, "tf3mp_status_1"), events = [];
  const bridge = await startGameBridge({ directory, intervalMs: 5, companyTimeoutMs: outcome === "timeout" ? 150 : 30000, logger: e => events.push(e) });
  try {
    await assert.rejects(bridge.requestCompanyTest({ finance: true }), /OBSERVATION_REQUIRED/);
    await writeFile(path.join(directory, "telemetry.lua"), lua({ schemaVersion: 1, kind: "telemetry", nonce: bridge.nonce, counter: 1, tickCount: 100, updateCount: 50 }));
    await writeFile(path.join(directory, "engine_observation.lua"), lua({ schemaVersion: 1, kind: "engine_observation", nonce: bridge.nonce, counter: 1, tickCount: 100, updateCount: 50,
      speedup: 1, companyEntity: 7, balance: 10000, balanceKnown: 1, balanceNegative: 0 }));
    await until(() => bridge.engineObservation.available);
    await assert.rejects(readFile(path.join(directory, "company_request.lua")), { code: "ENOENT" });
    await bridge.requestCompanyTest({ finance: true });
    const request = await readFile(path.join(directory, "company_request.lua"), "utf8");
    assert.match(request, /kind = "finance_probe"/); assert.doesNotMatch(request, /amount|balance/);
    await assert.rejects(bridge.requestCompanyTest({ finance: true }), /COMPANY_TEST_BUSY_OR_USED/);
    await assert.rejects(bridge.requestCompanyTest(), /COMPANY_TEST_BUSY_OR_USED/);
    await assert.rejects(bridge.enableVehicleTest(), /VEHICLE_TEST_BUSY/);
    if (outcome !== "timeout") await writeFile(path.join(directory, "finance_receipt.lua"), lua(receipt({ nonce: bridge.nonce, outcome })));
    await until(() => events.some(e => e.event === "finance_test_result"));
    assert.equal(events.find(e => e.event === "finance_test_result").code, outcome === "timeout" ? "OUTCOME_UNKNOWN_DO_NOT_RETRY" : outcome);
    assert.equal(events.filter(e => e.event === "finance_test_balances").length, outcome === "passed" ? 2 : 0);
    await assert.rejects(readFile(path.join(directory, "company_request.lua")), { code: "ENOENT" });
    await assert.rejects(bridge.requestCompanyTest({ finance: true }), /COMPANY_TEST_BUSY_OR_USED/);
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});
test("finance engine flow gates debit on exact successful credit and persists attempt before mutation", async () => {
  const source = await readFile(new URL("../mod/content/tf3mp_status.script.tl", import.meta.url), "utf8");
  const region = source.slice(source.indexOf("local function financeEvent"), source.indexOf("local ret :"));
  assert.ok(region.indexOf('current.financeTestAttempted = true') < region.indexOf('bookTestEntry(target, 1000)'));
  assert.ok(region.indexOf('if originalCredit ~= originalBefore or targetCredit ~= targetBefore + 1000 then return nil end') < region.indexOf('bookTestEntry(target, -1000)'));
  assert.match(source, /if amount ~= 1000 and amount ~= -1000 then return false end/);
  assert.doesNotMatch(region, /makeVehicle|makeEntitySetPlayer|setPlayer/);
});
