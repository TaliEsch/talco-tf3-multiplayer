import { parseFlatDataFile } from "./userdata-ipc.mjs";
const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
export const FINANCE_BALANCES = ["originalBefore", "originalCredit", "originalAfter", "targetBefore", "targetCredit", "targetAfter"];
export function parseFinanceReceipt(source, nonce, requestId, companyEntity) {
  const p = parseFlatDataFile(source);
  const fields = ["schemaVersion", "kind", "nonce", "requestId", "companyEntity", "newCompanyEntity", "tickCount", "updateCount", "outcome", "stage"];
  for (const name of FINANCE_BALANCES) fields.push(name, name + "Negative");
  if (Object.keys(p).sort().join(",") !== fields.sort().join(",") || p.schemaVersion !== 1 || p.kind !== "finance_receipt"
      || p.nonce !== nonce || !/^[0-9a-f]{32}$/.test(p.nonce) || p.requestId !== requestId || !uint(requestId) || requestId < 1
      || p.companyEntity !== companyEntity || ![p.companyEntity, p.newCompanyEntity, p.tickCount, p.updateCount].every(uint)
      || ![0, 1, 2].includes(p.stage)
      || !["passed", "already_attempted", "no_test_company", "expired", "company_changed", "balance_unavailable", "credit_unknown", "debit_unknown", "handler_failed"].includes(p.outcome)) throw new TypeError("invalid finance receipt");
  const balances = {};
  for (const name of FINANCE_BALANCES) {
    if (!Number.isSafeInteger(p[name]) || p[name] < 0 || ![0, 1].includes(p[name + "Negative"]) || (p[name] === 0 && p[name + "Negative"] !== 0)) throw new TypeError("invalid finance balance");
    balances[name] = (p[name + "Negative"] ? -1 : 1) * p[name];
  }
  if (p.outcome === "passed" && (p.stage !== 2 || p.newCompanyEntity === 0 || p.newCompanyEntity === companyEntity
      || !Number.isSafeInteger(balances.targetBefore + 1000)
      || balances.targetCredit !== balances.targetBefore + 1000 || balances.targetAfter !== balances.targetBefore
      || balances.originalCredit !== balances.originalBefore || balances.originalAfter !== balances.originalBefore)) throw new TypeError("finance postconditions failed");
  return { ...p, balances };
}
