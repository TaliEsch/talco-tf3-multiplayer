-- Engine-side modular-terminal placement experiment. NOT registered in the mod
-- or a network endpoint. A trusted caller must authenticate and bind both
-- companies, session/action/consent, and this disposable-save placement intent.
-- It never funds, transfers ownership, quotes a price, retries, or injects GUI
-- userdata. The public declarations say ConstructionEntity.params are passed to
-- the update function; this adapter uses only the immediately evaluated
-- ConstructionResult.params, without copying it or retaining it after prepare.
-- Its evaluator cost is deliberately not a price, funds check, or debit claim.
local M = {}

local RESOURCE_SUFFIX = "/street/modular_street_station/modular_terminal.con"
local MAX_MONEY = 9007199254740991

local function entity(v)
  return type(v) == "number" and v == math.floor(v) and v > 0 and v <= 2147483647
end
local function money(v)
  return type(v) == "number" and v == v and v == math.floor(v) and v >= 0 and v <= MAX_MONEY
end
local function finite(v, bound)
  return type(v) == "number" and v == v and math.abs(v) <= bound
end
local function identifier(v)
  return type(v) == "string" and #v > 0 and #v <= 64 and v:match("^[A-Za-z0-9_-]+$") ~= nil
end
local function exactKeys(t, allowed, count)
  local seen = 0
  for key in pairs(t) do assert(allowed[key], "UNEXPECTED_FIELD"); seen = seen + 1 end
  assert(seen == count, "INVALID_INTENT")
end
local function exactCollectionSize(value, expected)
  if type(value) ~= "table" then return false end
  local count = 0
  for _ in pairs(value) do
    count = count + 1
    if count > expected then return false end
  end
  return count == expected
end
local function balance(company)
  local value = api.engine.util.finance.getPlayersBalance(company)
  assert(money(value), "BALANCE_UNAVAILABLE")
  return value
end
local function held()
  local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED)
  assert(speed and speed.speedup == 0, "HELD_ENGINE_REQUIRED")
end
local function owner(id)
  local value = api.engine.getComponent(id, api.type.ComponentType.PLAYER_OWNED)
  assert(value and entity(value.player), "OWNER_UNAVAILABLE")
  return value.player
end
local function assertCompanies(binding)
  assert(type(binding) == "table" and entity(binding.originalCompany) and entity(binding.targetCompany)
    and binding.originalCompany ~= binding.targetCompany, "SEPARATE_COMPANY_REQUIRED")
  assert(api.engine.util.getPlayer() == binding.originalCompany, "ORIGINAL_COMPANY_CHANGED")
  for _, company in ipairs({binding.originalCompany, binding.targetCompany}) do
    assert(api.engine.entityExists(company)
      and api.engine.getComponent(company, api.type.ComponentType.PLAYER) ~= nil, "COMPANY_MISSING")
  end
end

local function stationSlot(binding)
  assert(entity(binding.slot) and (binding.slot == 1 or binding.slot == 2), "STATION_SLOT_REQUIRED")
  return binding.slot
end

-- This is intentionally synchronous: evaluator result userdata is assigned
-- directly into ConstructionEntity.params and is never copied into a saved
-- receipt, returned to the caller, or used from the callback.
function M.prepare(intent, binding)
  assert(type(intent) == "table" and type(binding) == "table", "INVALID_INTENT")
  exactKeys(intent, {x=true, y=true, z=true, yaw=true, resource=true, seed=true}, 6)
  assert(entity(intent.seed) and finite(intent.x, 100000) and finite(intent.y, 100000)
    and finite(intent.z, 10000) and finite(intent.yaw, math.pi), "INVALID_POSITION")
  assert(type(intent.resource) == "string" and #intent.resource <= 256
    and intent.resource == binding.resource and intent.resource:sub(-#RESOURCE_SUFFIX) == RESOURCE_SUFFIX,
    "RESOURCE_NOT_APPROVED")
  assertCompanies(binding)
  stationSlot(binding)
  held()
  local resourceId = api.res.constructionRep.find(intent.resource)
  assert(resourceId ~= -1 and api.res.constructionRep.getName(resourceId) == intent.resource, "RESOURCE_CHANGED")
  local params = api.engine.util.construction.getGlobalConstructionParams()
  assert(type(params) == "table", "GLOBAL_PARAMETERS_UNAVAILABLE")
  params.platforms = 1
  -- templateIndex is a distinct evaluator argument: never put it in params.
  local result = api.engine.util.construction.getConstructionResult(intent.resource, 0, params)
  assert(result and type(result.params) == "table" and type(result.params.modules) == "table",
    "RESULT_PARAMS_UNAVAILABLE")
  assert(exactCollectionSize(result.params.modules, 3) and exactCollectionSize(result.subconstructions, 2),
    "UNEXPECTED_TERMINAL_RESULT")
  -- The evaluator is prepared exactly like the first-party passenger path. It
  -- does not receive seed. Preserve a native-returned seed only when it already
  -- equals the bound intent; otherwise append this documented plain-table input
  -- for ConstructionEntity without replacing evaluator modules or reserved keys.
  if result.params.seed == nil then result.params.seed = intent.seed
  else assert(result.params.seed == intent.seed, "RESULT_SEED_CHANGED") end
  local c, s = math.cos(intent.yaw), math.sin(intent.yaw)
  local construction = api.type.SimpleProposal.ConstructionEntity.new()
  construction.fileName = intent.resource
  construction.params = result.params
  construction.playerEntity = binding.targetCompany
  construction.name = "TalCo disposable modular terminal"
  construction.autoFillSlots = false
  construction.transf = api.type.Mat4f.new(api.type.Vec4f.new(c,s,0,0),
    api.type.Vec4f.new(-s,c,0,0), api.type.Vec4f.new(0,0,1,0),
    api.type.Vec4f.new(intent.x,intent.y,intent.z,1))
  local proposal = api.type.SimpleProposal.new()
  proposal.constructionsToAdd = {construction}
  proposal.constructionsToRemove = {}
  proposal.old2new = {}
  local context = api.type.Context.new()
  context.player = binding.targetCompany
  return api.cmd.makeWorldBuildProposalCmd(proposal, context, false, true, false)
end

local function assertConsent(intent, binding, consent)
  assert(type(consent) == "table" and consent.kind == "native_station_charge" and consent.confirmed == true,
    "EXPLICIT_CONSENT_REQUIRED")
  assert(identifier(binding.sessionId) and entity(binding.actionId) and identifier(binding.consentId),
    "ACTION_CORRELATION_REQUIRED")
  assert(consent.sessionId == binding.sessionId and consent.actionId == binding.actionId
    and consent.consentId == binding.consentId, "CONSENT_ACTION_CHANGED")
  assert(consent.originalCompany == binding.originalCompany and consent.targetCompany == binding.targetCompany
    and consent.slot == binding.slot, "CONSENT_COMPANY_CHANGED")
  for _, key in ipairs({"x", "y", "z", "yaw", "resource", "seed"}) do
    assert(consent[key] == intent[key], "CONSENT_PLACEMENT_CHANGED")
  end
end

local function consumed(current, slot)
  if slot == 1 then return current.nativeStationSlot1Attempted == true end
  return current.nativeStationSlot2Attempted == true
end
local function consume(current, slot)
  if slot == 1 then current.nativeStationSlot1Attempted = true else current.nativeStationSlot2Attempted = true end
end
local function recordReceipt(current, slot, receipt)
  if slot == 1 then current.nativeStationSlot1Receipt = receipt
  else current.nativeStationSlot2Receipt = receipt end
  current.nativeStationReceipt = receipt
end
local function entities(component)
  local result = {}
  for _, id in ipairs(api.engine.getEntitiesWithComponent(component)) do result[id] = true end
  return result
end
local function preservesExisting(before, component)
  local after = entities(component)
  for id in pairs(before) do if not after[id] then return false end end
  return true
end

-- State is a GameScriptState supporting get/set. Slots 1 and 2 are the only
-- permitted placements, each has a one-attempt save-persistent latch. Any
-- unknown outcome preserves the company-wide fault for every later action.
function M.execute(state, intent, binding, consent)
  local slot = stationSlot(binding)
  assertConsent(intent, binding, consent)
  local current = state:get()
  assert(type(current) == "table" and not current.phase2CompanyFault and not consumed(current, slot),
    "ATTEMPT_ALREADY_CONSUMED")
  local firstReceipt = nil
  if slot == 2 then
    firstReceipt = current.nativeStationSlot1Receipt
    assert(type(firstReceipt) == "table" and firstReceipt.outcome == "verified"
      and firstReceipt.originalCompany == binding.originalCompany and firstReceipt.targetCompany == binding.targetCompany
      and firstReceipt.sessionId == binding.sessionId, "SLOT1_VERIFIED_BINDING_REQUIRED")
  end
  local command = M.prepare(intent, binding)
  local beforeOriginal, beforeTarget = balance(binding.originalCompany), balance(binding.targetCompany)
  local constructionsBefore = entities(api.type.ComponentType.CONSTRUCTION)
  local stationsBefore = entities(api.type.ComponentType.STATION)
  local receipt = {outcome="unknown", code="ENGINE_OUTCOME_UNKNOWN", slot=slot,
    originalCompany=binding.originalCompany, targetCompany=binding.targetCompany,
    sessionId=binding.sessionId, actionId=binding.actionId, consentId=binding.consentId,
    resource=intent.resource, originalBefore=beforeOriginal, targetBefore=beforeTarget}
  consume(current, slot)
  current.phase2CompanyFault = true -- Unknown company-wide fault is saved before send.
  recordReceipt(current, slot, receipt)
  state:set(current) -- Persist consume-before-send; never replay this slot automatically.
  local callbackSeen, callbackOpen = false, true
  local ok = pcall(function()
    api.cmd.sendCommand(command, function(data, success, resultEntities)
      if not callbackOpen or callbackSeen then return end
      callbackSeen = true
      receipt.originalAfter, receipt.targetAfter = balance(binding.originalCompany), balance(binding.targetCompany)
      if not success then receipt.code = "NATIVE_REJECTED_OUTCOME_UNKNOWN"; return end
      local constructionId = nil
      for _, pair in ipairs(resultEntities or {}) do
        local id = pair[1]
        if api.engine.getComponent(id, api.type.ComponentType.CONSTRUCTION) ~= nil then
          assert(constructionId == nil, "UNEXPECTED_CONSTRUCTION")
          constructionId = id
        end
      end
      assert(entity(constructionId) and not constructionsBefore[constructionId]
        and api.engine.entityExists(constructionId), "MISSING_CONSTRUCTION")
      local construction = api.engine.getComponent(constructionId, api.type.ComponentType.CONSTRUCTION)
      assert(construction and construction.fileName == intent.resource and owner(constructionId) == binding.targetCompany,
        "CONSTRUCTION_OWNER_CHANGED")
      assert(#construction.stations == 1, "UNEXPECTED_STATION_COUNT")
      local stationId = construction.stations[1]
      assert(entity(stationId) and not stationsBefore[stationId] and api.engine.entityExists(stationId)
        and owner(stationId) == binding.targetCompany
        and api.engine.getComponent(stationId, api.type.ComponentType.STATION) ~= nil, "STATION_OWNER_CHANGED")
      if firstReceipt then
        assert(constructionId ~= firstReceipt.constructionEntity and stationId ~= firstReceipt.stationEntity,
          "SLOT2_DISTINCT_STATION_REQUIRED")
      end
      local charged = data and data.resultProposalData and data.resultProposalData.costs
      assert(money(charged) and charged > 0 and beforeTarget >= charged
        and receipt.originalAfter == beforeOriginal and receipt.targetAfter == beforeTarget - charged
        and receipt.targetAfter >= 0, "DEBIT_NOT_VERIFIED")
      assert(preservesExisting(constructionsBefore, api.type.ComponentType.CONSTRUCTION)
        and preservesExisting(stationsBefore, api.type.ComponentType.STATION), "EXISTING_MEMBERSHIP_CHANGED")
      receipt.constructionEntity, receipt.stationEntity, receipt.chargedCost = constructionId, stationId, charged
      receipt.constructionOwner, receipt.stationOwner = binding.targetCompany, binding.targetCompany
      receipt.outcome, receipt.code = "verified", "NATIVE_STATION_ACCOUNTING_VERIFIED"
    end)
  end)
  callbackOpen = false -- A late callback cannot revive an unknown result.
  if not ok or not callbackSeen or receipt.outcome ~= "verified" then
    receipt.outcome = "unknown"
    if receipt.code == "NATIVE_STATION_ACCOUNTING_VERIFIED" then receipt.code = "ENGINE_OUTCOME_UNKNOWN" end
  end
  -- Re-read persisted state: do not overwrite a concurrent company fault or
  -- clear the fault based on a stale table after the callback boundary.
  local saved = state:get()
  assert(type(saved) == "table" and consumed(saved, slot), "STATE_UNAVAILABLE")
  if receipt.outcome == "verified" then saved.phase2CompanyFault = false
  else saved.phase2CompanyFault = true end
  recordReceipt(saved, slot, receipt)
  local persisted = pcall(function() state:set(saved) end)
  if not persisted then
    -- Never hand a caller a verified receipt that failed to become durable.
    receipt.outcome, receipt.code = "unknown", "STATE_PERSIST_FAILED"
    saved.phase2CompanyFault = true
    recordReceipt(saved, slot, receipt)
    pcall(function() state:set(saved) end)
  end
  return receipt
end

return M
