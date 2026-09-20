-- Engine-side command factory. NOT registered in the mod or a network endpoint.
-- The caller must authenticate/bind the company, check a fresh held engine state,
-- obtain explicit native-charge consent. execute persists its own send latch.
-- prepare only constructs a command. execute is a local disposable-save adapter,
-- not a network endpoint; its consent must be supplied by the trusted caller.
-- It never funds, retries, transfers ownership or rewrites balances.
local M = {}
local function integer(v)
  return type(v) == "number" and v == math.floor(v) and v > 0 and v <= 2147483647
end
local function finite(v, bound)
  return type(v) == "number" and v == v and math.abs(v) <= bound
end

function M.prepare(intent, binding)
  assert(type(intent) == "table" and type(binding) == "table", "INVALID_INTENT")
  local allowed = {x=true,y=true,z=true,yaw=true,resource=true,seed=true}
  local count = 0
  for key in pairs(intent) do assert(allowed[key], "UNEXPECTED_FIELD"); count = count + 1 end
  assert(count == 6 and integer(intent.seed), "INVALID_INTENT")
  assert(integer(binding.originalCompany) and integer(binding.targetCompany)
    and binding.originalCompany ~= binding.targetCompany, "SEPARATE_COMPANY_REQUIRED")
  assert(api.engine.util.getPlayer() == binding.originalCompany, "ORIGINAL_COMPANY_CHANGED")
  for _, company in ipairs({binding.originalCompany,binding.targetCompany}) do
    assert(api.engine.entityExists(company)
      and api.engine.getComponent(company,api.type.ComponentType.PLAYER) ~= nil, "COMPANY_MISSING")
  end
  local speed = api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_SPEED)
  assert(speed and speed.speedup == 0, "HELD_ENGINE_REQUIRED")
  assert(finite(intent.x,100000) and finite(intent.y,100000)
    and finite(intent.z,10000) and finite(intent.yaw,math.pi), "INVALID_POSITION")
  assert(type(intent.resource) == "string" and #intent.resource <= 256
    and intent.resource == binding.resource
    and intent.resource:match("/road/road_depot/road_depot%.con$"), "RESOURCE_NOT_APPROVED")
  local resourceId = api.res.constructionRep.find(intent.resource)
  assert(resourceId ~= -1 and api.res.constructionRep.getName(resourceId) == intent.resource,
    "RESOURCE_CHANGED")
  local params = {}
  for _, parameter in ipairs(api.res.constructionRep.get(resourceId).params) do
    assert(type(parameter.key) == "string" and type(parameter.defaultIndex) == "number", "INVALID_DEFAULT")
    params[parameter.key] = parameter.defaultIndex
  end
  params.seed = intent.seed
  local c,s = math.cos(intent.yaw),math.sin(intent.yaw)
  local construction = api.type.SimpleProposal.ConstructionEntity.new()
  construction.fileName = intent.resource
  construction.params = params
  construction.playerEntity = binding.targetCompany
  construction.name = "TalCo disposable test depot"
  construction.autoFillSlots = false
  construction.transf = api.type.Mat4f.new(api.type.Vec4f.new(c,s,0,0),
    api.type.Vec4f.new(-s,c,0,0),api.type.Vec4f.new(0,0,1,0),
    api.type.Vec4f.new(intent.x,intent.y,intent.z,1))
  local proposal = api.type.SimpleProposal.new()
  proposal.constructionsToAdd = {construction}
  proposal.constructionsToRemove = {}
  proposal.old2new = {}
  local context = api.type.Context.new()
  context.player = binding.targetCompany
  -- Native validation stays enabled. No ignored errors, no free-cost flag,
  -- no GUI proposal userdata. Insufficient-funds behavior requires live proof.
  return api.cmd.makeWorldBuildProposalCmd(proposal,context,false,true,false)
end

local function balance(company)
  local v = api.engine.util.finance.getPlayersBalance(company)
  assert(finite(v,9007199254740991) and v == math.floor(v), "BALANCE_UNAVAILABLE")
  return v
end
local function entities(component)
  local result = {}
  for _, id in ipairs(api.engine.getEntitiesWithComponent(component)) do result[id] = true end
  return result
end
local function sameEntities(before,component)
  local seen = 0
  for _, id in ipairs(api.engine.getEntitiesWithComponent(component)) do
    if not before[id] then return false end
    seen = seen + 1
  end
  local count = 0
  for _ in pairs(before) do count = count + 1 end
  return count == seen
end
local function preservesExisting(before,component)
  local after = entities(component)
  for id in pairs(before) do if not after[id] then return false end end
  return true
end

local function identifier(v)
  return type(v) == "string" and #v > 0 and #v <= 64 and v:match("^[A-Za-z0-9_-]+$") ~= nil
end
local function sameConsent(intent, binding, consent)
  assert(type(consent) == "table" and consent.kind == "native_charge" and consent.confirmed == true,
    "EXPLICIT_CONSENT_REQUIRED")
  assert(consent.sessionId == binding.sessionId and consent.actionId == binding.actionId,
    "CONSENT_ACTION_CHANGED")
  assert(identifier(consent.consentId) and consent.consentId == binding.consentId,
    "CONSENT_EVENT_CHANGED")
  assert(consent.originalCompany == binding.originalCompany and consent.targetCompany == binding.targetCompany,
    "CONSENT_COMPANY_CHANGED")
  for _, key in ipairs({"x","y","z","yaw","resource","seed"}) do
    assert(consent[key] == intent[key], "CONSENT_PLACEMENT_CHANGED")
  end
end

-- This is an engine-state-only adapter. The public engine-state contract says
-- commands and callbacks are immediate. One diagnostic attempt stays consumed
-- per disposable save; separate unfunded/funded stages are not enabled here.
function M.execute(state,intent,binding,consent)
  assert(type(binding) == "table" and identifier(binding.sessionId) and integer(binding.actionId)
    and identifier(binding.consentId), "ACTION_CORRELATION_REQUIRED")
  sameConsent(intent,binding,consent)
  local current = state:get()
  assert(type(current) == "table", "STATE_UNAVAILABLE")
  -- An unconfirmed mutation is a company-wide stop, not merely a barrier that
  -- another caller can evade by choosing a new action id. This shared latch is
  -- also used by the funding adapter and remains set for every unknown outcome.
  assert(not current.phase2CompanyFault, "COMPANY_PHASE2_FAULT")
  assert(not current.nativeDepotAttempted, "ATTEMPT_ALREADY_CONSUMED")
  local command = M.prepare(intent,binding)
  local beforeOriginal,beforeTarget = balance(binding.originalCompany),balance(binding.targetCompany)
  local constructions = entities(api.type.ComponentType.CONSTRUCTION)
  local depots = entities(api.type.ComponentType.VEHICLE_DEPOT)
  local receipt = {outcome="unknown",code="ENGINE_OUTCOME_UNKNOWN",
    originalBefore=beforeOriginal,targetBefore=beforeTarget,
    originalCompany=binding.originalCompany,targetCompany=binding.targetCompany,
    sessionId=binding.sessionId,actionId=binding.actionId,consentId=binding.consentId,
    resource=intent.resource}
  current.nativeDepotAttempted = true
  current.nativeDepotReceipt = receipt
  current.phase2CompanyFault = true
  state:set(current) -- Persist BEFORE send; never automatically reset this latch.
  local callbackSeen = false
  local callbackOpen = true
  local ok = pcall(function()
    api.cmd.sendCommand(command,function(data,success,resultEntities)
      if not callbackOpen or callbackSeen then return end
      callbackSeen = true
      local saved = state:get()
      if not saved or not saved.nativeDepotAttempted then return end
      receipt.originalAfter = balance(binding.originalCompany)
      receipt.targetAfter = balance(binding.targetCompany)
      if not success then
        -- These measurements do not cover terrain or edits to existing entities.
        -- They are not proof of a complete no-op or WHY the command was rejected.
        if receipt.originalAfter == beforeOriginal and receipt.targetAfter == beforeTarget
          and sameEntities(constructions,api.type.ComponentType.CONSTRUCTION)
          and sameEntities(depots,api.type.ComponentType.VEHICLE_DEPOT) then
          receipt.outcome="unknown"; receipt.code="NATIVE_REJECTION_REASON_UNVERIFIED"
          receipt.observedBalancesAndMembershipUnchanged=true
        end
        saved.nativeDepotReceipt=receipt; state:set(saved)
        return
      end
      local constructionId = nil
      local created = resultEntities or data.resultEntities
      assert(type(created) == "table", "MISSING_RESULT_ENTITIES")
      for _, pair in ipairs(created) do
        local id = pair[1]
        if api.engine.getComponent(id,api.type.ComponentType.CONSTRUCTION) ~= nil then
          assert(constructionId == nil and not constructions[id], "UNEXPECTED_CONSTRUCTION")
          constructionId = id
        end
      end
      assert(constructionId ~= nil, "MISSING_CONSTRUCTION")
      local construction = api.engine.getComponent(constructionId,api.type.ComponentType.CONSTRUCTION)
      local owner = api.engine.getComponent(constructionId,api.type.ComponentType.PLAYER_OWNED)
      assert(construction.fileName == intent.resource and owner and owner.player == binding.targetCompany,
        "CONSTRUCTION_OWNER_CHANGED")
      assert(#construction.depots == 1, "UNEXPECTED_DEPOT_COUNT")
      local depotId = construction.depots[1]
      local depot = api.engine.getComponent(depotId,api.type.ComponentType.VEHICLE_DEPOT)
      local depotOwner = api.engine.getComponent(depotId,api.type.ComponentType.PLAYER_OWNED)
      assert(depot and not depots[depotId] and depotOwner and depotOwner.player == binding.targetCompany,
        "DEPOT_OWNER_CHANGED")
      -- The public component query can prove this limited membership property,
      -- not terrain, network edits, or mutations to existing entities.
      assert(preservesExisting(constructions,api.type.ComponentType.CONSTRUCTION)
        and preservesExisting(depots,api.type.ComponentType.VEHICLE_DEPOT), "EXISTING_MEMBERSHIP_CHANGED")
      local charged = data.resultProposalData.costs
      assert(finite(charged,9007199254740991) and charged > 0 and charged == math.floor(charged),
        "COST_UNAVAILABLE")
      assert(receipt.originalAfter == beforeOriginal and receipt.targetAfter == beforeTarget-charged
        and receipt.targetAfter >= 0, "DEBIT_NOT_VERIFIED")
      receipt.constructionEntity=constructionId; receipt.depotEntity=depotId
      receipt.constructionOwner=owner.player; receipt.depotOwner=depotOwner.player
      receipt.constructionMembershipPreserved=true; receipt.depotMembershipPreserved=true
      receipt.chargedCost=charged; receipt.outcome="verified"; receipt.code="NATIVE_BUILD_ACCOUNTING_VERIFIED"
      saved.nativeDepotReceipt=receipt; saved.phase2CompanyFault=false; state:set(saved)
    end)
  end)
  callbackOpen = false -- A late callback cannot revive a terminal unknown result.
  if not ok or not callbackSeen then
    local saved = state:get()
    if saved and saved.nativeDepotAttempted then
      receipt.outcome="unknown"; receipt.code=ok and "ENGINE_CALLBACK_MISSING" or "ENGINE_SEND_FAILED"
      saved.nativeDepotReceipt=receipt
      saved.phase2CompanyFault=true -- Includes failure while persisting a success.
      state:set(saved)
    end
  end
  return receipt
end

return M
