import { sha256Canonical } from "./canonical.mjs";

// Engine-independent contract, NOT a TF3 command adapter or network endpoint.
// Quote/snapshot/result records must be produced by a trusted engine adapter.
// Never accept client assertions about costs, ownership or proposal side effects.
const entity = n => Number.isSafeInteger(n) && n > 0 && n <= 2147483647;
const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const money = n => Number.isSafeInteger(n);
const digest = s => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
function requireThat(ok, code) {
  if (!ok) throw Object.assign(new Error(code), { code });
}
function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === keys.split(",").sort().join(",");
}

export function makeDepotPlacementPlan(input, policy) {
  requireThat(exact(input, "requestId,x,y,z,yaw"), "INVALID_PLACEMENT");
  requireThat(typeof input.requestId === "string" && /^[0-9a-f]{32}$/.test(input.requestId), "INVALID_REQUEST_ID");
  requireThat(entity(policy?.originalCompany) && entity(policy?.targetCompany)
    && policy.originalCompany !== policy.targetCompany, "SEPARATE_COMPANY_REQUIRED");
  // TF3 resource identities can be namespace-qualified, unlike filesystem paths.
  // This validates syntax only; the live adapter must resolve the exact resource
  // in constructionRep and restrict it to the supported road depot.
  requireThat(typeof policy.resource === "string" && policy.resource.length <= 256
    && /^(?:[a-zA-Z0-9_-]+::\/)?[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.con$/.test(policy.resource), "INVALID_DEPOT_RESOURCE");
  requireThat(policy.soloDisposableTest === true, "SOLO_DISPOSABLE_TEST_REQUIRED");
  requireThat(money(policy.maxCost) && policy.maxCost > 0 && digest(policy.checkpointHash), "INVALID_PLACEMENT_POLICY");
  requireThat(uint(policy.issuedTick) && uint(policy.expiresTick)
    && policy.expiresTick > policy.issuedTick && policy.expiresTick - policy.issuedTick <= 300, "INVALID_EXPIRY");
  requireThat([input.x, input.y, input.z, input.yaw].every(Number.isFinite)
    && Math.abs(input.x) <= 100000 && Math.abs(input.y) <= 100000 && Math.abs(input.z) <= 10000
    && input.yaw >= -Math.PI && input.yaw <= Math.PI, "INVALID_PLACEMENT");
  // Resource/companies/budget come from host policy, not the placement request.
  return Object.freeze({ schemaVersion: 1, kind: "depot_placement", ...input,
    resource: policy.resource, originalCompany: policy.originalCompany, targetCompany: policy.targetCompany,
    maxCost: policy.maxCost, checkpointHash: policy.checkpointHash,
    issuedTick: policy.issuedTick, expiresTick: policy.expiresTick });
}

export function validateDepotQuote(plan, quote, snapshot) {
  requireThat(exact(snapshot, "tickCount,checkpointHash,originalCompany,targetCompany,originalBalance,targetBalance,soloDisposableTest"), "INVALID_SNAPSHOT");
  requireThat(uint(snapshot.tickCount) && snapshot.tickCount >= plan.issuedTick && snapshot.tickCount < plan.expiresTick, "EXPIRED_PLACEMENT");
  requireThat(snapshot.checkpointHash === plan.checkpointHash && snapshot.originalCompany === plan.originalCompany
    && snapshot.targetCompany === plan.targetCompany && snapshot.soloDisposableTest === true, "PLACEMENT_CONTEXT_CHANGED");
  requireThat(money(snapshot.originalBalance) && money(snapshot.targetBalance), "BALANCE_UNAVAILABLE");
  requireThat(exact(quote, "planHash,proposalHash,constructionOwner,payer,cost,constructionCount,depotCount,removedEntityCount,externalNetworkEditCount,collisionCount,errorCount,warningCount"), "INVALID_QUOTE");
  requireThat(quote.planHash === sha256Canonical(plan) && digest(quote.proposalHash), "QUOTE_PLAN_MISMATCH");
  requireThat(quote.constructionOwner === plan.targetCompany && quote.payer === plan.targetCompany, "WRONG_OWNER_OR_PAYER");
  requireThat(quote.constructionCount === 1 && quote.depotCount === 1
    && quote.removedEntityCount === 0 && quote.externalNetworkEditCount === 0
    && quote.collisionCount === 0 && quote.errorCount === 0 && quote.warningCount === 0, "UNSAFE_PROPOSAL");
  requireThat(money(quote.cost) && quote.cost > 0 && quote.cost <= plan.maxCost, "COST_OUT_OF_BOUNDS");
  requireThat(snapshot.targetBalance >= quote.cost, "INSUFFICIENT_TARGET_FUNDS");
  return Object.freeze({ planHash: quote.planHash, proposalHash: quote.proposalHash, cost: quote.cost });
}

// Call immediately before execution against a freshly generated engine quote.
// A changed price OR proposal requires a new visible confirmation, not auto-accept.
export function revalidateDepotConfirmation(plan, confirmation, quote, snapshot) {
  const fresh = validateDepotQuote(plan, quote, snapshot);
  requireThat(exact(confirmation, "planHash,proposalHash,cost")
    && sha256Canonical(fresh) === sha256Canonical(confirmation), "CONFIRMATION_CHANGED");
  return fresh;
}

// Compare balances within the same engine callback as the command. Normal
// simulation income between snapshots would make attribution ambiguous.
// Failure after submission is UNKNOWN, never permission to rebuild/refund.
export function verifyDepotPlacementResult(plan, confirmation, before, result) {
  requireThat(confirmation?.planHash === sha256Canonical(plan) && digest(confirmation.proposalHash)
    && money(confirmation.cost) && confirmation.cost > 0 && confirmation.cost <= plan.maxCost, "INVALID_CONFIRMATION");
  requireThat(exact(before, "originalBalance,targetBalance") && money(before.originalBalance)
    && money(before.targetBalance) && before.targetBalance >= confirmation.cost, "INVALID_BEFORE_BALANCES");
  requireThat(exact(result, "requestId,proposalHash,commandSucceeded,constructionEntity,depotEntity,constructionOwner,depotOwner,payer,originalBalance,targetBalance,newConstruction,newDepot")
    && result.requestId === plan.requestId && result.proposalHash === confirmation.proposalHash
    && result.commandSucceeded === true && result.newConstruction === true && result.newDepot === true
    && entity(result.constructionEntity) && entity(result.depotEntity)
    && result.constructionEntity !== result.depotEntity
    && ![plan.originalCompany, plan.targetCompany].includes(result.constructionEntity)
    && ![plan.originalCompany, plan.targetCompany].includes(result.depotEntity)
    && result.constructionOwner === plan.targetCompany && result.depotOwner === plan.targetCompany
    && result.payer === plan.targetCompany && money(result.originalBalance) && money(result.targetBalance)
    && result.originalBalance === before.originalBalance
    && result.targetBalance === before.targetBalance - confirmation.cost, "PLACEMENT_OUTCOME_UNKNOWN");
  return Object.freeze({ requestId: plan.requestId, outcome: "verified", constructionEntity: result.constructionEntity,
    depotEntity: result.depotEntity, companyEntity: plan.targetCompany, cost: confirmation.cost });
}
