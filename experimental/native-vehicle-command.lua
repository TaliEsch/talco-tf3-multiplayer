-- Engine-side road-vehicle purchase factory. NOT registered in the mod or a network endpoint.
-- A trusted caller must bind identity/session consent before
-- calling execute; this adapter rechecks native ownership immediately before it
-- creates and sends the command.  It never transfers ownership, funds an
-- account, retries, or compensates an unknown purchase.
--
-- Public TF3 definitions document makeVehicleBuyCmd and its synchronous engine
-- callback. For Buy, first-party collectVehicleData totals model cost.price;
-- makeSingleVehicle reads that cost from model metadata. This adapter is limited
-- to one model, not arbitrary multi-unit configurations or modify/sale valuation.
-- This adapter reads that fresh one-part price itself, checks target funds while
-- held, and requires the exact same observed debit. It accepts no client price.
-- Native rejection semantics still require disposable-save qualification. GUI
-- code builds load-config entries from transport-vehicle metadata and assigns
-- purchase time/auto-load flags immediately before buying; this adapter creates
-- the same bounded one-part shape from fresh model metadata. It remains
-- unqualified for live use until one disposable-save run verifies native output.
local M = {}

local function entity(v)
  return type(v) == "number" and v == math.floor(v) and v > 0 and v <= 2147483647
end

local function money(v)
  return type(v) == "number" and v == v and v == math.floor(v) and math.abs(v) <= 9007199254740991
end

local function exactKeys(t, allowed, count)
  local seen = 0
  for key in pairs(t) do assert(allowed[key], "UNEXPECTED_FIELD"); seen = seen + 1 end
  assert(seen == count, "INVALID_INTENT")
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

local function freshConfig(intent, binding)
  assert(type(intent) == "table" and type(binding) == "table", "INVALID_INTENT")
  exactKeys(intent, {model = true}, 1)
  assert(type(intent.model) == "string" and #intent.model > 0 and #intent.model <= 256
    and intent.model == binding.modelResource, "MODEL_NOT_APPROVED")
  local modelId = api.res.modelRep.find(intent.model)
  assert(modelId ~= -1 and api.res.modelRep.getName(modelId) == intent.model, "MODEL_CHANGED")
  local model = api.res.modelRep.get(modelId)
  local metadata = model and model.metadata and model.metadata.transportVehicle
  assert(metadata and metadata.carrier == api.type["enum"].Carrier.ROAD, "NOT_ROAD_MODEL")
  local price = model.metadata.cost and model.metadata.cost.price
  assert(money(price) and price > 0, "PURCHASE_PRICE_UNAVAILABLE")
  assert(balance(binding.targetCompany) >= price, "INSUFFICIENT_TARGET_FUNDS")
  local gameTime = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME)
  assert(gameTime and money(gameTime.gameTime) and gameTime.gameTime >= 0, "GAME_TIME_UNAVAILABLE")
  local vehiclePart = api.type.VehiclePart.new()
  vehiclePart.modelId = modelId
  vehiclePart.reversed = false
  vehiclePart.compartment2loadConfig = {}
  for _, _ in ipairs(metadata.compartments) do
    local loadConfig = api.type.LoadConfig.new()
    loadConfig.loadConfigIndex = 0
    table.insert(vehiclePart.compartment2loadConfig, loadConfig)
  end
  vehiclePart.color = api.type.Vec3f.new(1, 1, 1)
  local transportPart = api.type.TransportVehiclePart.new()
  transportPart.part = vehiclePart
  transportPart.purchaseTime = gameTime.gameTime
  transportPart.autoLoadConfig = {}
  for _, _ in ipairs(metadata.compartments) do table.insert(transportPart.autoLoadConfig, true) end
  local config = api.type.TransportVehicleConfig.new()
  config.vehicles = {transportPart}
  config.vehicleGroups = {1}
  config.muFileNames = {}
  return config, modelId, price
end

local function assertDepot(binding, depotEntity)
  assert(entity(depotEntity) and api.engine.entityExists(depotEntity), "DEPOT_MISSING")
  assert(owner(depotEntity) == binding.targetCompany, "DEPOT_OWNER_CHANGED")
  local depot = api.engine.getComponent(depotEntity, api.type.ComponentType.VEHICLE_DEPOT)
  assert(depot and depot.carrier == api.type["enum"].Carrier.ROAD, "DEPOT_NOT_ROAD")
end

local function sameConfiguration(config, modelId)
  local model = api.res.modelRep.get(modelId)
  local metadata = model and model.metadata and model.metadata.transportVehicle
  local gameTime = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME)
  if not metadata then return false end
  if not (gameTime and money(gameTime.gameTime) and config and #config.vehicles == 1 and #config.vehicleGroups == 1
    and config.vehicleGroups[1] == 1 and #config.muFileNames == 0
    and config.vehicles[1].part and config.vehicles[1].part.modelId == modelId
    and config.vehicles[1].part.reversed == false
    and #config.vehicles[1].part.compartment2loadConfig == #metadata.compartments
    and #config.vehicles[1].autoLoadConfig == #metadata.compartments
    and config.vehicles[1].purchaseTime == gameTime.gameTime) then return false end
  for i, _ in ipairs(metadata.compartments) do
    local loadConfig = config.vehicles[1].part.compartment2loadConfig[i]
    if not loadConfig or loadConfig.loadConfigIndex ~= 0 or config.vehicles[1].autoLoadConfig[i] ~= true then
      return false
    end
  end
  return true
end

local function entities(component)
  local result = {}
  for _, id in ipairs(api.engine.getEntitiesWithComponent(component)) do result[id] = true end
  return result
end

-- Builds a fresh, one-part road configuration only after all native ownership
-- and paused-engine checks.  The caller must never cache this config across an
-- approval boundary.
function M.prepare(intent, binding)
  assertCompanies(binding)
  held()
  assertDepot(binding, binding.depotEntity)
  local config, _, price = freshConfig(intent, binding)
  return api.cmd.makeVehicleBuyCmd(binding.targetCompany, binding.depotEntity, config), price
end

-- State is a GameScriptState supporting get/set.  The saved latch is consumed
-- before sendCommand, including failures and missing/late callbacks.
function M.execute(state, intent, binding, consent)
  assert(consent and consent.kind == "native_vehicle_charge" and consent.confirmed == true,
    "EXPLICIT_CONSENT_REQUIRED")
  assert(consent.originalCompany == binding.originalCompany and consent.targetCompany == binding.targetCompany
    and consent.depotEntity == binding.depotEntity and consent.model == intent.model, "CONSENT_CHANGED")
  local current = state:get()
  assert(current and not current.nativeVehicleAttempted and not current.phase2CompanyFault, "ATTEMPT_ALREADY_CONSUMED")
  -- prepare is deliberately immediately before the consumed send boundary: it
  -- rechecks company, depot, carrier, engine hold, and resource identity.
  local command, price = M.prepare(intent, binding)
  local modelId = api.res.modelRep.find(intent.model)
  local beforeOriginal, beforeTarget = balance(binding.originalCompany), balance(binding.targetCompany)
  local vehiclesBefore = entities(api.type.ComponentType.TRANSPORT_VEHICLE)
  local receipt = {outcome = "unknown", code = "ENGINE_OUTCOME_UNKNOWN",
    originalCompany = binding.originalCompany, targetCompany = binding.targetCompany,
    depotEntity = binding.depotEntity, model = intent.model,
    originalBefore = beforeOriginal, targetBefore = beforeTarget}
  current.nativeVehicleAttempted = true
  current.phase2CompanyFault = true -- Shared terminal barrier: unknown must block every later Phase 2 action.
  current.nativeVehicleReceipt = receipt
  state:set(current) -- Persist consume-before-send; this attempt can never be replayed automatically.
  local callbackSeen, callbackOpen = false, true
  local ok = pcall(function()
    api.cmd.sendCommand(command, function(data, success, resultEntities)
      if not callbackOpen or callbackSeen then return end
      callbackSeen = true
      receipt.originalAfter = balance(binding.originalCompany)
      receipt.targetAfter = balance(binding.targetCompany)
      if not success then receipt.code = "NATIVE_REJECTED_OUTCOME_UNKNOWN"; return end
      local vehicleEntity = data and data.resultVehicleEntity
      assert(entity(vehicleEntity) and not vehiclesBefore[vehicleEntity]
        and api.engine.entityExists(vehicleEntity), "MISSING_NEW_VEHICLE")
      assert(owner(vehicleEntity) == binding.targetCompany, "VEHICLE_OWNER_CHANGED")
      local vehicle = api.engine.getComponent(vehicleEntity, api.type.ComponentType.TRANSPORT_VEHICLE)
      assert(vehicle and vehicle.carrier == api.type["enum"].Carrier.ROAD
        and vehicle.depot == binding.depotEntity
        and sameConfiguration(vehicle.transportVehicleConfig, modelId), "VEHICLE_CONFIGURATION_CHANGED")
      -- The command result and observed entity must agree.  Do not use a callback
      -- alone as a receipt, and reject extra/foreign result vehicle identities.
      assert(#(resultEntities or {}) == 1, "UNEXPECTED_RESULT_ENTITY")
      assert(resultEntities[1][1] == vehicleEntity, "VEHICLE_RESULT_MISSING")
      assert(receipt.originalAfter == beforeOriginal and receipt.targetAfter == beforeTarget - price
        and receipt.targetAfter >= 0, "DEBIT_NOT_VERIFIED")
      receipt.vehicleEntity = vehicleEntity
      receipt.chargedCost = beforeTarget - receipt.targetAfter
      receipt.outcome = "verified"
      receipt.code = "NATIVE_VEHICLE_ACCOUNTING_VERIFIED"
    end)
  end)
  callbackOpen = false -- A late callback cannot turn an unknown attempt into success.
  if not ok or not callbackSeen then receipt.outcome = "unknown"; receipt.code = "ENGINE_OUTCOME_UNKNOWN" end
  if receipt.outcome == "verified" then current.phase2CompanyFault = false end
  current.nativeVehicleReceipt = receipt
  state:set(current)
  return receipt
end

return M
