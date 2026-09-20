import { parseFlatDataFile } from "./userdata-ipc.mjs";
const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const fields = ["schemaVersion", "kind", "nonce", "requestId", "outcome", "tickCount", "updateCount", "companyEntity", "newCompanyEntity"];
for (const prefix of ["original", "created"]) for (const suffix of ["Balance", "Known", "Negative", "Assets", "Vehicles", "Lines"]) fields.push(prefix + suffix);
export function parseCompanyInspection(source, nonce, requestId, companyEntity) {
  const p = parseFlatDataFile(source);
  if (Object.keys(p).sort().join(",") !== [...fields].sort().join(",") || p.schemaVersion !== 1 || p.kind !== "company_inspection"
      || p.nonce !== nonce || !/^[0-9a-f]{32}$/.test(p.nonce) || p.requestId !== requestId || !uint(requestId) || requestId < 1
      || ![p.companyEntity, p.newCompanyEntity, p.tickCount, p.updateCount].every(uint)
      || !["inspected", "no_test_company", "company_missing", "company_changed", "read_failed"].includes(p.outcome)) throw new TypeError("invalid company inspection");
  for (const prefix of ["original", "created"]) {
    if (![0, 1].includes(p[prefix + "Known"]) || ![0, 1].includes(p[prefix + "Negative"])
        || !Number.isSafeInteger(p[prefix + "Balance"]) || p[prefix + "Balance"] < 0
        || (p[prefix + "Known"] === 0 && p[prefix + "Balance"] !== 0)
        || (p[prefix + "Balance"] === 0 && p[prefix + "Negative"] !== 0)
        || !["Assets", "Vehicles", "Lines"].every(suffix => uint(p[prefix + suffix]))) throw new TypeError("invalid company statistics");
  }
  if (p.outcome === "inspected" && (p.companyEntity !== companyEntity || p.newCompanyEntity === p.companyEntity || p.newCompanyEntity === 0)) throw new TypeError("company identity mismatch");
  return p;
}
export function companyInspectionRows(p) {
  if (p.outcome !== "inspected") return [];
  return ["original", "created"].map(prefix => ({ companyEntity: prefix === "original" ? p.companyEntity : p.newCompanyEntity,
    balanceKnown: p[prefix + "Known"] === 1, balance: (p[prefix + "Negative"] ? -1 : 1) * p[prefix + "Balance"],
    assetCount: p[prefix + "Assets"], vehicleCount: p[prefix + "Vehicles"], lineCount: p[prefix + "Lines"] }));
}
