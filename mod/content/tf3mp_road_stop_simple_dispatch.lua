-- Disposable-save engine acceptance probe for the observed TF3 road recipe.
-- This is not network admission or host ordering. The existing one-use replay
-- executor persists its consume latch before this command can be sent.
local M = {}
local function integer(v, max) return type(v) == "number" and v == math.floor(v) and v >= 0 and v <= max end
local function entity(v) return integer(v, 2147483647) and v > 0 end
local function nonce(v) return type(v) == "string" and #v == 32 and v:match("^[a-f0-9]+$") ~= nil end
local function exact(value, fields)
  if type(value) ~= "table" or getmetatable(value) ~= nil then return false end
  local count = 0
  for key in pairs(value) do if not fields[key] then return false end; count = count + 1 end
  local expected = 0
  for _ in pairs(fields) do expected = expected + 1 end
  return count == expected
end
local REQUEST = {schemaVersion=true,kind=true,nonce=true,requestId=true,issuedTick=true,
  expiresTick=true,confirmed=true,caseDigest=true,capture=true,modelResource=true,
  targetCompany=true,sessionId=true,actionId=true,consentId=true}
local INPUT = {edgeEntity=true,companyEntity=true,param=true,left=true,oneWay=true,model=true,name=true}
local RESOURCE = {resourceName=true}
local RESULTS = {EXPLICIT_REPLAY_CONSENT_REQUIRED=true,STATE_UNAVAILABLE=true,
  REPLAY_CONSUMED_OR_COMPANY_UNKNOWN=true,REPLAY_PREPARATION_UNQUALIFIED=true,
  ENGINE_OUTCOME_UNKNOWN=true,CONSUME_PERSISTENCE_UNKNOWN=true,
  ENGINE_CALLBACK_MISSING=true,ENGINE_SEND_FAILED=true,
  ROAD_STOP_OWNER_AND_DEBIT_OBSERVED=true}
local BEFORE_STAGES = {input=true,held=true,road=true,model=true,
  roster_binding=true,roster_shape=true,roster_players=true,balances=true}
local AFTER_STAGES = {result_shape=true,result_hold=true,result_player=true,
  result_road=true,result_model=true,result_cost=true,
  result_balances=true,result_entities=true,result_stop=true,result_attachment=true}
local function valid(request)
  if not exact(request, REQUEST) or request.schemaVersion ~= 1
    or request.kind ~= "native_road_stop_simple_probe" or not nonce(request.nonce)
    or not entity(request.requestId) or not integer(request.issuedTick,2147483647)
    or not integer(request.expiresTick,2147483647) or request.expiresTick <= request.issuedTick
    or request.expiresTick - request.issuedTick > 300 or request.confirmed ~= 1
    or type(request.caseDigest) ~= "string" or #request.caseDigest ~= 64
    or request.caseDigest:match("^[a-f0-9]+$") == nil
    or not exact(request.capture,INPUT) or not exact(request.modelResource,RESOURCE)
    or not entity(request.targetCompany) or request.sessionId ~= request.nonce
    or request.actionId ~= request.requestId or request.consentId ~= "simple_" .. request.requestId then return false end
  local input = request.capture
  return entity(input.edgeEntity) and input.companyEntity == request.targetCompany
    and type(input.param) == "number" and input.param == input.param
    and input.param >= 0 and input.param <= 1 and type(input.left) == "boolean"
    and type(input.oneWay) == "boolean" and type(input.name) == "string"
    and #input.name <= 1024 and input.name:find("\0",1,true) == nil
    and type(input.model) == "string" and #input.model <= 1024
    and input.model == request.modelResource.resourceName
end
local function clock(api)
  local world = api.engine.util.getWorld()
  if not integer(world,2147483647) then error("world") end
  local time = api.engine.getComponent(world,api.type.ComponentType.GAME_TIME)
  if (type(time) ~= "table" and type(time) ~= "userdata")
    or not integer(time.tickCount,9007199254740991)
    or not integer(time.updateCount,9007199254740991) then error("clock") end
  return time.tickCount,time.updateCount
end
local function receipt(request,tick,update,code,outcome,observed)
  local result={schemaVersion=1,kind="native_road_stop_simple_receipt",nonce=request.nonce,
    requestId=request.requestId,tickCount=tick,updateCount=update,code=code,outcome=outcome}
  if outcome == "verified" and type(observed) == "table" and entity(observed.stopEntity)
    and integer(observed.chargedCost,9007199254740991) and observed.chargedCost > 0 then
    result.stopEntity,result.chargedCost=observed.stopEntity,observed.chargedCost
  end
  if code == "BEFORE_SNAPSHOT_UNQUALIFIED" and type(observed) == "table"
    and BEFORE_STAGES[observed.stage] then result.stage = observed.stage end
  if code == "ENGINE_OUTCOME_UNKNOWN" and type(observed) == "table"
    and AFTER_STAGES[observed.stage] then result.stage = observed.stage end
  return result
end
function M.dispatch(state,request,api,deps)
  if not valid(request) then
    return {schemaVersion=1,kind="native_road_stop_simple_receipt",nonce="",requestId=0,
      tickCount=0,updateCount=0,code="INVALID_REQUEST",outcome="rejected"}
  end
  local ok,tick,update=pcall(clock,api)
  if not ok then return receipt(request,0,0,"ENGINE_TIME_UNAVAILABLE","rejected") end
  if tick < request.issuedTick or tick > request.expiresTick then
    return receipt(request,tick,update,"REQUEST_OUTSIDE_WINDOW","rejected") end
  if api.engine.util.getPlayer() ~= request.targetCompany then
    return receipt(request,tick,update,"TARGET_COMPANY_CHANGED","rejected") end
  local current=state:get()
  local companies={request.targetCompany}
  local binding=current and current.coordinationBinding
  if type(binding)=="table" and binding.nonce ~= nil then
    if binding.nonce ~= request.nonce then
      return receipt(request,tick,update,"BEFORE_SNAPSHOT_UNQUALIFIED","rejected",{stage="roster_binding"})
    end
    companies=binding.companies
  end
  local pre=current and current.roadStopPreActionReceipt
  if type(pre) ~= "table" or pre.nonce ~= request.nonce or pre.code ~= "shape"
    or pre.commandCode ~= "prepared" or pre.companyEntity ~= request.targetCompany
    or pre.edgeEntity ~= request.capture.edgeEntity or pre.updateCount ~= update then
    return receipt(request,tick,update,"PREACTION_EVIDENCE_MISSING","rejected") end
  if type(deps) ~= "table" or type(deps.execute) ~= "table" or type(deps.execute.execute) ~= "function"
    or type(deps.prepare) ~= "table" or type(deps.prepare.prepare) ~= "function"
    or type(deps.results) ~= "table" or type(deps.results.before) ~= "function"
    or type(deps.results.after) ~= "function" then
    return receipt(request,tick,update,"DEPENDENCY_UNAVAILABLE","rejected") end
  -- Expose only a bounded pre-send stage. A rejected read-only snapshot must
  -- never consume the one-use command latch or submit a native command.
  local beforeOk,before=pcall(deps.results.before,api,request.capture,companies)
  if not beforeOk or type(before) ~= "table" or before.code ~= "observed" then
    return receipt(request,tick,update,"BEFORE_SNAPSHOT_UNQUALIFIED","rejected",before)
  end
  local approved={capture=request.capture,modelResource=request.modelResource,
    targetCompany=request.targetCompany,caseDigest=request.caseDigest,
    sessionId=request.sessionId,actionId=request.actionId,consentId=request.consentId}
  local consent={confirmed=true,kind="native_road_stop_replay",request=approved}
  local function prepare(input,resource,company)
    if resource.resourceName ~= input.model or company ~= input.companyEntity then return nil end
    return deps.prepare.prepare(api,input)
  end
  local results={before=function(input,resource,company)
    if resource.resourceName ~= input.model or company ~= input.companyEntity then return nil end
    return deps.results.before(api,input,companies)
  end,after=function(before,input,resource,company,_,data,success,entities)
    if resource.resourceName ~= input.model or company ~= input.companyEntity then return nil end
    return deps.results.after(api,before,input,data,success,entities)
  end}
  local ran,observed=pcall(deps.execute.execute,state,approved,consent,api,prepare,results)
  local clockOk,finalTick,finalUpdate=pcall(clock,api)
  if not clockOk then finalTick,finalUpdate=tick,update end
  if not ran or type(observed) ~= "table" or not RESULTS[observed.code]
    or (observed.outcome ~= "verified" and observed.outcome ~= "rejected" and observed.outcome ~= "unknown") then
    return receipt(request,finalTick,finalUpdate,"ENGINE_OUTCOME_UNKNOWN","unknown") end
  if observed.outcome == "verified" and (observed.code ~= "ROAD_STOP_OWNER_AND_DEBIT_OBSERVED"
    or not entity(observed.stopEntity) or not integer(observed.chargedCost,9007199254740991)
    or observed.chargedCost <= 0) then
    return receipt(request,finalTick,finalUpdate,"ENGINE_OUTCOME_UNKNOWN","unknown") end
  return receipt(request,finalTick,finalUpdate,observed.code,observed.outcome,observed)
end
function M.handle(state,request)
  return M.dispatch(state,request,api,{
    execute=ug_require("tf3mp_status_1::/tf3mp_road_replay_execute.lua"),
    prepare=ug_require("tf3mp_status_1::/tf3mp_road_stop_simple_prepare.lua"),
    results=ug_require("tf3mp_status_1::/tf3mp_road_stop_simple_result.lua")})
end
return M
