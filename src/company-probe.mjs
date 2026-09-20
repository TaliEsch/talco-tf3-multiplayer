import { parseFlatDataFile } from "./userdata-ipc.mjs";
const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
export function parseCompanyReceipt(source, nonce, requestId, companyEntity) {
  const p = parseFlatDataFile(source);
  if (Object.keys(p).sort().join(",") !== "companyEntity,kind,newCompanyEntity,nonce,outcome,requestId,schemaVersion,tickCount,updateCount"
      || p.schemaVersion !== 1 || p.kind !== "company_receipt" || p.nonce !== nonce || !/^[0-9a-f]{32}$/.test(p.nonce)
      || p.requestId !== requestId || !uint(p.requestId) || p.requestId < 1 || p.companyEntity !== companyEntity
      || ![p.companyEntity, p.newCompanyEntity, p.tickCount, p.updateCount].every(uint)
      || !["created", "command_failed", "already_attempted", "expired", "company_changed", "handler_failed"].includes(p.outcome)
      || (p.outcome === "created" && (p.newCompanyEntity === 0 || p.newCompanyEntity === p.companyEntity))) throw new TypeError("invalid company receipt");
  return p;
}
