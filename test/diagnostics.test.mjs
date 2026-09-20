import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticLogger } from "../src/diagnostics.mjs";

test("station template diagnostic receipts retain approved scalar fields and redact raw evidence", () => {
  let output = "";
  const nonce = "a".repeat(32);
  diagnosticLogger({ write: text => { output += text; } })({
    event: "station_template_receipt", requestId: 3, paramsPresent: 1, modulesPresent: 1,
    moduleCount: 4, subconstructionCount: 2, costKnown: 1, cost: 100, templateIndex: 0,
    platforms: 1, nonce, raw: `receipt-${nonce}`, payload: { nonce }, error: new Error(`failed-${nonce}`)
  });
  const record = JSON.parse(output);
  assert.deepEqual(Object.fromEntries(Object.entries(record).filter(([key]) => key !== "timestamp")), {
    event: "station_template_receipt", requestId: 3, paramsPresent: 1, modulesPresent: 1,
    moduleCount: 4, subconstructionCount: 2, costKnown: 1, cost: 100, templateIndex: 0, platforms: 1
  });
  assert.equal(output.includes(nonce), false);
  assert.equal(output.includes("receipt-"), false);
  assert.equal(output.includes("failed-"), false);
});

test("purchase diagnostics preserve ownership and signed balance evidence but not model paths or nonce", () => {
  let output = "";
  diagnosticLogger({write:text=>{output+=text;}})({event:'phase2_vehicle_result',outcome:'verified',
    targetCompany:20,depotEntity:31,vehicleEntity:32,vehicleOwner:20,depotOwner:20,chargedCost:100,
    originalBefore:5000,originalBeforeNegative:0,originalAfter:5000,originalAfterNegative:0,
    targetBefore:1000,targetBeforeNegative:0,targetAfter:900,targetAfterNegative:0,
    model:'private::/example.mdl',nonce:'secret',balances:{private:'no'}});
  const record=JSON.parse(output);
  assert.equal(record.targetAfter,900);
  assert.equal(record.targetAfterNegative,0);
  assert.equal(record.outcome,'verified');
  assert.equal(record.vehicleOwner,20);
  assert.equal(record.model,undefined);
  assert.equal(record.nonce,undefined);
  assert.equal(record.balances,undefined);
});
