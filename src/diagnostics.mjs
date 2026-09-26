export function diagnosticLogger(stream = process.stdout) {
  return (record) => {
    const allowed = new Set(["level", "event", "kind", "code", "hash", "supported", "modId", "revision", "contentFiles", "manifestSha256", "executableFiles", "readyForControlledLoadReview", "bytes", "sha256", "port", "sessionId", "playerId", "hostSequence", "scheduledUpdate", "counter", "tickCount", "updateCount", "status"]);
    const safe = { timestamp: new Date().toISOString() };
    if (record.event === "join_save_transfer_progress") {
      if (["downloading", "verifying", "verified"].includes(record.phase)) safe.phase = record.phase;
      if (Number.isSafeInteger(record.receivedBytes) && record.receivedBytes >= 0
        && Number.isSafeInteger(record.totalBytes) && record.totalBytes >= 1
        && record.totalBytes <= 2147483648 && record.receivedBytes <= record.totalBytes) {
        safe.receivedBytes = record.receivedBytes;
        safe.totalBytes = record.totalBytes;
      }
    }
    if (record.event === "join_save_prepared" && typeof record.saveName === "string"
      && /^tf3mp_disposable_[a-f0-9]{32}$/.test(record.saveName)) safe.saveName = record.saveName;
    // Local artifact identities are part of the launcher protocol, not secrets.
    // Keep them scoped and bounded instead of allowing arbitrary diagnostic data.
    if (record.event === "road_stop_replay_workflow") {
      if (typeof record.recordId === "string" && /^[a-f0-9]{32}$/.test(record.recordId)) safe.recordId = record.recordId;
      if (typeof record.caseDigest === "string" && /^[a-f0-9]{64}$/.test(record.caseDigest)) safe.caseDigest = record.caseDigest;
      if (typeof record.issues === "string" && Buffer.byteLength(record.issues, "utf8") <= 2048
        && record.issues.split("_").length <= 24
        && record.issues.split("_").every(token => /^[A-Za-z][A-Za-z0-9]{0,95}$/.test(token))) safe.issues = record.issues;
    }
    if (record.event === "local_cancel_stop_terminal_diagnostic") {
      const counterNames = ["factoryHits", "admissionHits", "correlatedHits", "callbackHits",
        "sendReturnHits", "marshalerReturnHits", "postSendBodyCorrelatedHits", "droppedCandidates"];
      if (record.counterDeltas && typeof record.counterDeltas === "object"
        && counterNames.every(name => /^\d{1,20}$/.test(record.counterDeltas[name] ?? "")))
        safe.counterDeltas = Object.fromEntries(counterNames.map(name => [name, record.counterDeltas[name]]));
      for (const name of ["entity", "company", "expectedInvocation", "claimedInvocation",
        "claimedEntity", "latestEntity", "latestStopped", "latestValid", "latestCallbackValid",
        "latestPostSendBodyValid", "latestCorrelatedAdmissionInvocation",
        "latestSendReturnInvocation", "latestPostSendBodyInvocation"])
        if (Number.isSafeInteger(record[name])) safe[name] = record[name];
      if (["disabled", "armed", "claimed", "completed", "expired", "revoked", "failed"].includes(record.armState))
        safe.armState = record.armState;
    }
    if (["host_cancelled_stop_permit_ready", "host_cancelled_stop_native_terminal"].includes(record.event)) {
      for (const name of ["entity", "permitDeadlineUnix"])
        if (Number.isSafeInteger(record[name]) && record[name] >= 0) safe[name] = record[name];
      for (const name of ["expectedInvocation", "claimedInvocation", "correlatedHitsDelta",
        "callbackHitsDelta", "marshalerReturnHitsDelta"])
        if (typeof record[name] === "string" && /^\d{1,20}$/.test(record[name])) safe[name] = record[name];
      if (["disabled", "armed", "claimed", "completed", "expired", "revoked", "failed"].includes(record.armState))
        safe.armState = record.armState;
      for (const name of ["callbackResultZero", "sendReturn", "postSendBody"])
        if (typeof record[name] === "boolean") safe[name] = record[name];
    }
    if (["host_cancelled_stop_native_confirmed", "host_cancelled_stop_completed",
      "multiplayer_cancelled_stop_completed"].includes(record.event)) {
      for (const name of ["entity", "company", "observedStopFlag", "observedUpdateCount",
        "observedRevision", "observedTickCount", "callbackResult", "marshalerResult",
        "callbackThread", "admissionThread"])
        if (Number.isSafeInteger(record[name]) && record[name] >= 0) safe[name] = record[name];
      for (const name of ["nativeInvocation", "matchedDispatchDelta", "matchedCompletionDelta"])
        if (typeof record[name] === "string" && /^\d{1,20}$/.test(record[name])) safe[name] = record[name];
      if (typeof record.stateHash === "string" && /^[a-f0-9]{64}$/.test(record.stateHash))
        safe.stateHash = record.stateHash;
      for (const name of ["sendReturn", "postSendBody", "singleGameStopVerified"])
        if (typeof record[name] === "boolean") safe[name] = record[name];
    }
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
    // These fields are only exposed for the bounded Host/Join Stop evidence
    // events. Never serialize a raw receipt, snapshot, path, or error object.
    const stopEvidenceEvents=new Set(['peer_checkpoint_ready','peer_command_applied','peer_barrier_released',
      'session_divergence',
      'engine_operation_receipt','engine_checkpoint_evidence','engine_execution_evidence',
      'engine_operation_fault','command_proposed','host_action_clock']);
    if(stopEvidenceEvents.has(record.event)){
      if(record.event==='session_divergence')
        for(const field of ['buildHash','modManifestHash'])
          if(typeof record[field]==='string'&&/^[a-f0-9]{64}$/.test(record[field]))safe[field]=record[field];
      for(const field of ['roundId','operationId','role','operation','phase','fault'])
        if(typeof record[field]==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(record[field]))safe[field]=record[field];
      for(const field of ['checkpointHash','stateHash','expectedHash','observedHash'])
        if(typeof record[field]==='string'&&/^[a-f0-9]{64}$/.test(record[field]))safe[field]=record[field];
      for(const field of ['entity','ownerCompanyEntity','releaseUpdate','admissionUpdate',
        'scheduleLeadUpdates','unavailableCount','expectedUpdate','observedUpdate',
        'hostUpdateCount','peerUpdateCount'])
        if(Number.isSafeInteger(record[field])&&record[field]>=0&&record[field]<=2147483647)safe[field]=record[field];
      for(const field of ['held','stopped','comparisonReady'])
        if(typeof record[field]==='boolean')safe[field]=record[field];
    }
    for (const [key, value] of Object.entries(record)) {
      if (allowed.has(key) && ["string", "number", "boolean"].includes(typeof value)) safe[key] = value;
    }
    stream.write(`${JSON.stringify(safe)}\n`);
  };
}
