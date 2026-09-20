-- Local disposable-save adapter, not a remote command endpoint.
-- The caller must validate the copied schema and checkpoint before dispatch.
-- Engine-state commands have immediate callbacks; late callbacks remain unknown.
local M = {}
local attempted = false -- also fail closed if persisting the consume latch fails
local function identifier(v)
  return type(v) == "string" and #v > 0 and #v <= 64 and v:match("^[A-Za-z0-9_-]+$") ~= nil
end
local function positive(v)
  return type(v) == "number" and v == math.floor(v) and v > 0 and v <= 2147483647
end
local function same(a,b,budget,depth)
  budget.n = budget.n + 1
  if budget.n > 20000 or depth > 32 or type(a) ~= type(b) then return false end
  if type(a) == "number" then return a == a and a ~= math.huge and a ~= -math.huge and a == b end
  if type(a) == "string" then return #a <= 262144 and a == b end
  if type(a) == "boolean" or type(a) == "nil" then return a == b end
  if type(a) ~= "table" or getmetatable(a) ~= nil or getmetatable(b) ~= nil then return false end
  local countA,countB = 0,0
  for k,v in pairs(a) do
    countA = countA + 1
    if countA > 20000 or (type(k) ~= "string" and type(k) ~= "number")
      or not same(v,b[k],budget,depth+1) then return false end
  end
  for _ in pairs(b) do countB = countB + 1; if countB > 20000 then return false end end
  return countA == countB
end
local function correlation(request)
  return type(request) == "table" and identifier(request.sessionId) and identifier(request.consentId)
    and positive(request.actionId) and positive(request.targetCompany)
    and type(request.caseDigest) == "string" and #request.caseDigest == 64
    and request.caseDigest:match("^[a-f0-9]+$") ~= nil
end
local function receipt(request,code,outcome)
  return {code=code,outcome=outcome,caseDigest=request.caseDigest,
    sessionId=request.sessionId,actionId=request.actionId,consentId=request.consentId,
    targetCompany=request.targetCompany}
end

function M.execute(state,request,consent,api,prepare,results)
  local valid,approved = pcall(function()
    return correlation(request) and type(consent) == "table" and consent.confirmed == true
      and consent.kind == "native_road_stop_replay"
      and same(request,consent.request,{n=0},0)
  end)
  if not valid or not approved then return {code="EXPLICIT_REPLAY_CONSENT_REQUIRED",outcome="rejected"} end
  local ok,current = pcall(function() return state:get() end)
  if not ok or type(current) ~= "table" then return receipt(request,"STATE_UNAVAILABLE","rejected") end
  if attempted or current.nativeRoadReplayAttempted or current.phase2CompanyFault then
    return receipt(request,"REPLAY_CONSUMED_OR_COMPANY_UNKNOWN","rejected")
  end
  local prepared,before
  ok = pcall(function()
    prepared = prepare(request.capture,request.modelResource,request.targetCompany)
    assert(type(prepared) == "table" and prepared.code == "prepared" and prepared.command ~= nil)
    before = results.before(request.capture,request.modelResource,request.targetCompany,api)
    assert(type(before) == "table" and before.code == "observed")
  end)
  if not ok then return receipt(request,"REPLAY_PREPARATION_UNQUALIFIED","rejected") end
  local result = receipt(request,"ENGINE_OUTCOME_UNKNOWN","unknown")
  attempted = true
  current.nativeRoadReplayAttempted = true
  current.phase2CompanyFault = true
  current.nativeRoadReplayReceipt = result
  ok = pcall(function() state:set(current) end)
  if not ok then return receipt(request,"CONSUME_PERSISTENCE_UNKNOWN","unknown") end
  local callbackOpen,callbackSeen = true,false
  local sent = pcall(function()
    api.cmd.sendCommand(prepared.command,function(data,success,resultEntities)
      if not callbackOpen or callbackSeen then return end
      callbackSeen = true
      local observed = results.after(before,request.capture,request.modelResource,request.targetCompany,api,data,success,resultEntities)
      if type(observed) ~= "table" or observed.code ~= "verified"
        or not positive(observed.stopEntity) or type(observed.chargedCost) ~= "number"
        or observed.chargedCost ~= math.floor(observed.chargedCost)
        or observed.chargedCost <= 0 or observed.chargedCost > 9007199254740991 then return end
      local saved = state:get()
      assert(saved and saved.nativeRoadReplayAttempted and saved.phase2CompanyFault)
      -- Copy only bounded evidence, never callback data or native objects.
      local verified = receipt(request,"ROAD_STOP_OWNER_AND_DEBIT_OBSERVED","verified")
      verified.stopEntity,verified.chargedCost = observed.stopEntity,observed.chargedCost
      verified.fundsEnforcementVerified = false
      verified.replayAcceptanceVerified = false
      verified.gameplayVerified = false
      saved.nativeRoadReplayReceipt = verified
      -- Keep the company latch until the complete replay acceptance verifier
      -- checks the rest of the world. Limited stop/debit evidence cannot clear it.
      state:set(saved)
      result = verified
    end)
  end)
  callbackOpen = false
  if not sent or not callbackSeen then
    result = receipt(request,sent and "ENGINE_CALLBACK_MISSING" or "ENGINE_SEND_FAILED","unknown")
    pcall(function()
      local saved = state:get()
      saved.nativeRoadReplayReceipt = result; saved.phase2CompanyFault = true; state:set(saved)
    end)
  end
  return result
end
return M
