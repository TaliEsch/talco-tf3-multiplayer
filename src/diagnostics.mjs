export function diagnosticLogger(stream = process.stdout) {
  return (record) => {
    const allowed = new Set(["level", "event", "kind", "code", "hash", "supported", "modId", "revision", "contentFiles", "manifestSha256", "executableFiles", "readyForControlledLoadReview", "bytes", "sha256", "port", "sessionId", "playerId", "hostSequence", "scheduledUpdate", "counter", "tickCount", "updateCount", "status"]);
    const safe = { timestamp: new Date().toISOString() };
    allowed.add("validation");
    allowed.add("recommended");
    allowed.add("gameplayVerified");
    allowed.add("leadUpdates");
    allowed.add("speedup");
    allowed.add("heldUpdate");
    allowed.add("companyEntity");
    allowed.add("newCompanyEntity");
    for(const field of ['planHash','originalCompany','fundingAmount'])allowed.add(field);
    for (const field of ["requestId", "paramsPresent", "modulesPresent", "moduleCount", "subconstructionCount", "costKnown", "cost", "templateIndex", "platforms"]) allowed.add(field);
    for (const field of ["balanceKnown", "balance", "assetCount", "vehicleCount", "lineCount"]) allowed.add(field);
    for (const field of ["beforeBalance", "creditedBalance", "afterBalance"]) allowed.add(field);
    for (const field of ["outcome", "targetCompany", "depotEntity", "constructionEntity", "vehicleEntity",
      "vehicleOwner", "depotOwner", "chargedCost", "amount", "originalBefore", "originalAfter", "targetBefore", "targetAfter",
      "originalBeforeNegative", "originalAfterNegative", "targetBeforeNegative", "targetAfterNegative"]) allowed.add(field);
    for (const field of ["slot", "stationEntity", "stationOwner", "constructionOwner", "lineEntity", "lineOwner",
      "stationA", "stationB", "stationAOwner", "stationBOwner", "constructionMembershipPreserved", "stationMembershipPreserved"]) allowed.add(field);
    for (const [key, value] of Object.entries(record)) {
      if (allowed.has(key) && ["string", "number", "boolean"].includes(typeof value)) safe[key] = value;
    }
    stream.write(`${JSON.stringify(safe)}\n`);
  };
}
