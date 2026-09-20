import test from "node:test";
import assert from "node:assert/strict";
import { sha256Canonical } from "../src/canonical.mjs";
import { makeDepotPlacementPlan, validateDepotQuote, revalidateDepotConfirmation, verifyDepotPlacementResult } from "../src/depot-placement.mjs";

function fixture() {
  const input = { requestId: "a".repeat(32), x: 100, y: 200, z: 10, yaw: 0 };
  const policy = { originalCompany: 3141, targetCompany: 55652, resource: "test/road_depot.con",
    soloDisposableTest: true, maxCost: 20000, checkpointHash: "b".repeat(64), issuedTick: 100, expiresTick: 200 };
  const plan = makeDepotPlacementPlan(input, policy);
  const quote = { planHash: sha256Canonical(plan), proposalHash: "c".repeat(64), constructionOwner: 55652, payer: 55652,
    cost: 10000, constructionCount: 1, depotCount: 1, removedEntityCount: 0, externalNetworkEditCount: 0,
    collisionCount: 0, errorCount: 0, warningCount: 0 };
  const snapshot = { tickCount: 101, checkpointHash: policy.checkpointHash, originalCompany: 3141, targetCompany: 55652,
    originalBalance: 40000000, targetBalance: 20000, soloDisposableTest: true };
  const before = { originalBalance: 40000000, targetBalance: 20000 };
  const result = { requestId: plan.requestId, proposalHash: quote.proposalHash, commandSucceeded: true,
    constructionEntity: 60000, depotEntity: 60001, constructionOwner: 55652, depotOwner: 55652, payer: 55652,
    originalBalance: 40000000, targetBalance: 10000, newConstruction: true, newDepot: true };
  return { input, policy, plan, quote, snapshot, before, result };
}

test("scalar viewer estimate cannot authorize construction even with sufficient funds", () => {
  const f = fixture();
  const estimate = {status: 'preview_estimate', cost: 10000, critical: false,
    errorCount: 0, warningCount: 0, buildReady: false};
  assert.throws(() => validateDepotQuote(f.plan, estimate, f.snapshot), /INVALID_QUOTE/);
  assert.throws(() => revalidateDepotConfirmation(f.plan, {}, estimate, f.snapshot), /INVALID_QUOTE/);
});
test("placement preserves namespace-qualified resource identity without allowing filesystem traversal", () => {
  const f = fixture();
  const resource = "base::/depots/road/road_depot/road_depot.con";
  assert.equal(makeDepotPlacementPlan(f.input, {...f.policy, resource}).resource, resource);
  for (const resource of ["base::/../road.con", "base:://road.con", "C:/road.con", "base::/road.con.lua", "base::/road\\depot.con", "https://road.con"])
    assert.throws(() => makeDepotPlacementPlan(f.input, {...f.policy, resource}), /INVALID_DEPOT_RESOURCE/);
});
test("direct placement binds quote, construction ownership and payer to the second company", () => {
  const f = fixture();
  const confirmed = validateDepotQuote(f.plan, f.quote, f.snapshot);
  assert.deepEqual(revalidateDepotConfirmation(f.plan, confirmed, f.quote, f.snapshot), confirmed);
  assert.equal(verifyDepotPlacementResult(f.plan, confirmed, f.before, f.result).companyEntity, 55652);
  assert.ok(Object.isFrozen(f.plan));
});
test("placement request cannot supply a resource, company, budget or executable parameters", () => {
  const f = fixture();
  for (const extra of [{ resource: "other.con" }, { targetCompany: 3141 }, { maxCost: 1 }, { params: {} }]) {
    assert.throws(() => makeDepotPlacementPlan({ ...f.input, ...extra }, f.policy), /INVALID_PLACEMENT/);
  }
});
test("invalid coordinates, company sharing, unsafe resource paths and expiry are rejected", () => {
  const f = fixture();
  for (const x of [NaN, Infinity, 100001, "10"]) assert.throws(() => makeDepotPlacementPlan({ ...f.input, x }, f.policy));
  for (const change of [{ targetCompany: 3141 }, { soloDisposableTest: false }, { resource: "../depot.con" },
    { resource: "/depot.con" }, { maxCost: 0 }, { expiresTick: 401 }]) {
    assert.throws(() => makeDepotPlacementPlan(f.input, { ...f.policy, ...change }));
  }
});
test("zero-balance company cannot build; missing balance is not treated as unlimited money", () => {
  const f = fixture();
  for (const targetBalance of [0, 9999, null, Infinity]) {
    assert.throws(() => validateDepotQuote(f.plan, f.quote, { ...f.snapshot, targetBalance }));
  }
});
test("quote rejects destructive, colliding, mixed, warned or incorrectly owned proposals", () => {
  const f = fixture();
  for (const change of [{ removedEntityCount: 1 }, { externalNetworkEditCount: 1 }, { collisionCount: 1 },
    { errorCount: 1 }, { warningCount: 1 }, { constructionCount: 2 }, { depotCount: 0 },
    { constructionOwner: 3141 }, { payer: 3141 }, { cost: -1 }, { cost: 20001 }, { cost: 0 }]) {
    assert.throws(() => validateDepotQuote(f.plan, { ...f.quote, ...change }, f.snapshot));
  }
});
test("confirmation expires and cannot cross saves, companies or remote admission", () => {
  const f = fixture();
  for (const change of [{ tickCount: 99 }, { tickCount: 200 }, { checkpointHash: "d".repeat(64) },
    { targetCompany: 3141 }, { originalCompany: 10 }, { soloDisposableTest: false }]) {
    assert.throws(() => validateDepotQuote(f.plan, f.quote, { ...f.snapshot, ...change }));
  }
});
test("moved placement, changed cost or changed proposal requires new confirmation", () => {
  const f = fixture(), confirmed = validateDepotQuote(f.plan, f.quote, f.snapshot);
  for (const change of [{ cost: 9000 }, { proposalHash: "d".repeat(64) }]) {
    assert.throws(() => revalidateDepotConfirmation(f.plan, confirmed, { ...f.quote, ...change }, f.snapshot), /CONFIRMATION_CHANGED/);
  }
  assert.throws(() => validateDepotQuote({ ...f.plan, x: 101 }, f.quote, f.snapshot), /QUOTE_PLAN_MISMATCH/);
});
test("result verifies both entity owners, newness and isolated exact cost attribution", () => {
  const f = fixture(), confirmed = validateDepotQuote(f.plan, f.quote, f.snapshot);
  for (const change of [{ commandSucceeded: false }, { constructionOwner: 3141 }, { depotOwner: 3141 },
    { payer: 3141 }, { originalBalance: 39990000 }, { targetBalance: 20000 }, { targetBalance: 9999 },
    { newConstruction: false }, { newDepot: false }, { depotEntity: 60000 }, { depotEntity: 3141 },
    { requestId: "e".repeat(32) }, { proposalHash: "e".repeat(64) }]) {
    assert.throws(() => verifyDepotPlacementResult(f.plan, confirmed, f.before, { ...f.result, ...change }), /PLACEMENT_OUTCOME_UNKNOWN/);
  }
});
