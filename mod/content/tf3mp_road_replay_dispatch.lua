-- LOCAL DISPOSABLE-SAVE ONLY. Entry point for one copied
-- roadside-stop replay.  This is deliberately not a remote endpoint: it
-- accepts only a fully copied, bounded request and composes the local replay
-- modules supplied by the caller.
local M = {}

local MAX_INT, MAX_SAFE = 2147483647, 9007199254740991
local MAX_DEPTH, MAX_NODES, MAX_BYTES = 32, 20000, 1024 * 1024
local REQUEST_KEYS = {
  schemaVersion=true, kind=true, nonce=true, requestId=true, issuedTick=true,
  expiresTick=true, confirmed=true, caseDigest=true, capture=true,
  modelResource=true, targetCompany=true, sessionId=true, actionId=true,
  consentId=true,
}
local RESULT_CODES = {
  EXPLICIT_REPLAY_CONSENT_REQUIRED=true, STATE_UNAVAILABLE=true,
  REPLAY_CONSUMED_OR_COMPANY_UNKNOWN=true, REPLAY_PREPARATION_UNQUALIFIED=true,
  ENGINE_OUTCOME_UNKNOWN=true, CONSUME_PERSISTENCE_UNKNOWN=true,
  ENGINE_CALLBACK_MISSING=true, ENGINE_SEND_FAILED=true,
  ROAD_STOP_OWNER_AND_DEBIT_OBSERVED=true,
}
local function finiteInteger(v, maximum)
  return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge
    and v == math.floor(v) and v >= 0 and v <= maximum
end

local function positiveInt32(v)
  return finiteInteger(v, MAX_INT) and v > 0
end

local function plainData(value)
  local seen, budget = {}, {nodes=0, bytes=0}
  local function add(n)
    budget.bytes = budget.bytes + n
    return budget.bytes <= MAX_BYTES
  end
  local function visit(v, depth)
    if depth > MAX_DEPTH then return false end
    budget.nodes = budget.nodes + 1
    if budget.nodes > MAX_NODES then return false end
    local kind = type(v)
    if kind == "nil" then return true end
    if kind == "boolean" then return add(1) end
    if kind == "number" then return v == v and v ~= math.huge and v ~= -math.huge and add(8) end
    if kind == "string" then return add(#v + 8) end
    if kind ~= "table" or getmetatable(v) ~= nil or seen[v] then return false end
    seen[v] = true
    if not add(16) then return false end
    for key, item in pairs(v) do
      -- Lua table keys cannot be nil; supporting only scalar keys also keeps
      -- copied input distinct from arbitrary native object graphs.
      local keyKind = type(key)
      if keyKind ~= "string" and keyKind ~= "number" then return false end
      if not visit(key, depth + 1) or not visit(item, depth + 1) then return false end
    end
    return true
  end
  local ok, valid = pcall(visit, value, 0)
  return ok and valid == true
end

local function exactRequest(request)
  if type(request) ~= "table" or getmetatable(request) ~= nil or not plainData(request) then return false end
  local count = 0
  for key in pairs(request) do
    if type(key) ~= "string" or not REQUEST_KEYS[key] then return false end
    count = count + 1
  end
  if count ~= 14 then return false end
  if request.schemaVersion ~= 1 or request.kind ~= "native_road_stop_replay"
    or type(request.nonce) ~= "string" or #request.nonce ~= 32
    or request.nonce:match("^[a-f0-9]+$") == nil
    or not positiveInt32(request.requestId)
    or not finiteInteger(request.issuedTick, MAX_INT) or not finiteInteger(request.expiresTick, MAX_INT)
    or request.expiresTick <= request.issuedTick or request.expiresTick - request.issuedTick > 300
    or request.confirmed ~= 1
    or type(request.caseDigest) ~= "string" or #request.caseDigest ~= 64
    or request.caseDigest:match("^[a-f0-9]+$") == nil
    or type(request.capture) ~= "table" or type(request.modelResource) ~= "table"
    or not positiveInt32(request.targetCompany)
    or request.sessionId ~= request.nonce or request.actionId ~= request.requestId
    or request.consentId ~= "replay_" .. request.requestId then return false end
  return true
end

local function clock(api)
  local ok, tick, update = pcall(function()
    -- TF3 native bindings may be callable proxies rather than Lua functions.
    -- The protected calls below still reject missing or throwing bindings.
    local world = api.engine.util.getWorld()
    if not finiteInteger(world, MAX_INT) then error("world") end -- world entity 0 is valid.
    local gameTime = api.engine.getComponent(world, api.type.ComponentType.GAME_TIME)
    if (type(gameTime) ~= "table" and type(gameTime) ~= "userdata")
      or not finiteInteger(gameTime.tickCount, MAX_SAFE) or not finiteInteger(gameTime.updateCount, MAX_SAFE) then error("clock") end
    return gameTime.tickCount, gameTime.updateCount
  end)
  if not ok then return nil end
  return tick, update
end

local function enginePlayerIsTarget(api, target)
  local ok, player = pcall(function()
    return api.engine.util.getPlayer()
  end)
  return ok and player == target
end

local function receipt(request, tick, update, code, outcome, observed)
  local result = {schemaVersion=1, kind="native_road_stop_replay_receipt", nonce=request.nonce,
    requestId=request.requestId, tickCount=tick, updateCount=update, code=code, outcome=outcome}
  if type(observed) == "table" and positiveInt32(observed.stopEntity)
    and type(observed.chargedCost) == "number" and observed.chargedCost == math.floor(observed.chargedCost)
    and observed.chargedCost > 0 and observed.chargedCost <= MAX_SAFE then
    result.stopEntity, result.chargedCost = observed.stopEntity, observed.chargedCost
  end
  return result
end

local function terminalResult(value)
  if type(value) ~= "table" or type(value.outcome) ~= "string" or not RESULT_CODES[value.code] then return false end
  if value.outcome == "verified" then
    return value.code == "ROAD_STOP_OWNER_AND_DEBIT_OBSERVED" and positiveInt32(value.stopEntity)
      and type(value.chargedCost) == "number" and value.chargedCost == math.floor(value.chargedCost)
      and value.chargedCost > 0 and value.chargedCost <= MAX_SAFE
  end
  if value.outcome == "rejected" then
    return value.code == "EXPLICIT_REPLAY_CONSENT_REQUIRED" or value.code == "STATE_UNAVAILABLE"
      or value.code == "REPLAY_CONSUMED_OR_COMPANY_UNKNOWN" or value.code == "REPLAY_PREPARATION_UNQUALIFIED"
  end
  return value.outcome == "unknown" and (value.code == "ENGINE_OUTCOME_UNKNOWN"
    or value.code == "CONSUME_PERSISTENCE_UNKNOWN" or value.code == "ENGINE_CALLBACK_MISSING"
    or value.code == "ENGINE_SEND_FAILED")
end

function M.dispatch(state, request, api, dependencies)
  -- All admission checks precede state:get, preparation, and command submission.
  if not exactRequest(request) then
    return {schemaVersion=1, kind="native_road_stop_replay_receipt", nonce="", requestId=0,
      tickCount=0, updateCount=0, code="INVALID_REQUEST", outcome="rejected"}
  end
  local tick, update = clock(api)
  if tick == nil then return receipt(request, 0, 0, "ENGINE_TIME_UNAVAILABLE", "rejected") end
  if tick < request.issuedTick or tick > request.expiresTick then
    return receipt(request, tick, update, "REQUEST_OUTSIDE_WINDOW", "rejected")
  end
  if not enginePlayerIsTarget(api, request.targetCompany) then
    return receipt(request, tick, update, "TARGET_COMPANY_CHANGED", "rejected")
  end
  if type(dependencies) ~= "table" or type(dependencies.execute) ~= "table"
    or type(dependencies.execute.execute) ~= "function" or type(dependencies.prepare) ~= "table"
    or type(dependencies.prepare.prepare) ~= "function" or type(dependencies.preflight) ~= "table"
    or type(dependencies.preflight.verify) ~= "function" or type(dependencies.rebuild) ~= "table"
    or type(dependencies.rebuild.rebuild) ~= "function" or type(dependencies.results) ~= "table"
    or type(dependencies.results.before) ~= "function" or type(dependencies.results.after) ~= "function" then
    return receipt(request, tick, update, "DEPENDENCY_UNAVAILABLE", "rejected")
  end

  local approved = {capture=request.capture, modelResource=request.modelResource,
    targetCompany=request.targetCompany, caseDigest=request.caseDigest, sessionId=request.sessionId,
    actionId=request.actionId, consentId=request.consentId}
  local consent = {confirmed=true, kind="native_road_stop_replay", request=approved}
  local function prepare(capture, modelResource, targetCompany)
    return dependencies.prepare.prepare(capture, modelResource, targetCompany, api,
      dependencies.rebuild, dependencies.preflight)
  end
  local ok, observed = pcall(dependencies.execute.execute, state, approved, consent, api, prepare, dependencies.results)
  local finalTick, finalUpdate = clock(api)
  if finalTick == nil then finalTick, finalUpdate = tick, update end
  if not ok then return receipt(request, finalTick, finalUpdate, "DISPATCH_FAILED", "unknown") end
  if not terminalResult(observed) then
    return receipt(request, finalTick, finalUpdate, "ENGINE_OUTCOME_UNKNOWN", "unknown")
  end
  return receipt(request, finalTick, finalUpdate, observed.code, observed.outcome, observed)
end

function M.handle(state, request)
  return M.dispatch(state, request, api, {
    execute=ug_require("tf3mp_status_1::/tf3mp_road_replay_execute.lua"),
    prepare=ug_require("tf3mp_status_1::/tf3mp_road_replay_prepare.lua"),
    preflight=ug_require("tf3mp_status_1::/tf3mp_road_replay_preflight.lua"),
    rebuild=ug_require("tf3mp_status_1::/tf3mp_road_replay_rebuild.lua"),
    results=ug_require("tf3mp_status_1::/tf3mp_road_replay_result.lua"),
  })
end
return M
