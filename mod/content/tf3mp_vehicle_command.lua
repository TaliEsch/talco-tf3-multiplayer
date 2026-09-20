-- Road-vehicle purchase adapter.  This intentionally diverges from the
-- experimental copy: every post-send write reloads saved state so a callback
-- cannot restore a stale latch or clear a newer company fault.
local M = {}

local function entity(v) return type(v) == "number" and v == math.floor(v) and v > 0 and v <= 2147483647 end
local function money(v) return type(v) == "number" and v == v and v == math.floor(v) and math.abs(v) <= 9007199254740991 end
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
local function owner(id)
  local value = api.engine.getComponent(id, api.type.ComponentType.PLAYER_OWNED)
  assert(value and entity(value.player), "OWNER_UNAVAILABLE")
  return value.player
end
local function held()
  local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED)
  assert(speed and speed.speedup == 0, "HELD_ENGINE_REQUIRED")
end
local function entities(component)
  local result = {}; for _, id in ipairs(api.engine.getEntitiesWithComponent(component)) do result[id] = true end; return result
end
local function assertCompanies(binding)
  assert(type(binding) == "table" and entity(binding.originalCompany) and entity(binding.targetCompany)
    and binding.originalCompany ~= binding.targetCompany, "SEPARATE_COMPANY_REQUIRED")
  assert(api.engine.util.getPlayer() == binding.originalCompany, "ORIGINAL_COMPANY_CHANGED")
  for _, company in ipairs({ binding.originalCompany, binding.targetCompany }) do
    assert(api.engine.entityExists(company) and api.engine.getComponent(company, api.type.ComponentType.PLAYER), "COMPANY_MISSING")
  end
end
local function freshConfig(intent, binding)
  assert(type(intent) == "table", "INVALID_INTENT")
  exactKeys(intent, { model = true }, 1)
  assert(type(intent.model) == "string" and #intent.model > 0 and #intent.model <= 256
    and intent.model == binding.modelResource, "MODEL_NOT_APPROVED")
  local modelId = api.res.modelRep.find(intent.model)
  assert(modelId ~= -1 and api.res.modelRep.getName(modelId) == intent.model, "MODEL_CHANGED")
  local model = api.res.modelRep.get(modelId); local metadata = model and model.metadata and model.metadata.transportVehicle
  assert(metadata and metadata.carrier == api.type["enum"].Carrier.ROAD, "NOT_ROAD_MODEL")
  local price = model.metadata.cost and model.metadata.cost.price
  assert(money(price) and price > 0 and balance(binding.targetCompany) >= price, "INSUFFICIENT_TARGET_FUNDS")
  local gameTime = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME)
  assert(gameTime and money(gameTime.gameTime) and gameTime.gameTime >= 0, "GAME_TIME_UNAVAILABLE")
  local part = api.type.VehiclePart.new(); part.modelId = modelId; part.reversed = false; part.compartment2loadConfig = {}; part.color = api.type.Vec3f.new(1, 1, 1)
  for _ = 1, #metadata.compartments do local load = api.type.LoadConfig.new(); load.loadConfigIndex = 0; table.insert(part.compartment2loadConfig, load) end
  local transport = api.type.TransportVehiclePart.new(); transport.part = part; transport.purchaseTime = gameTime.gameTime; transport.autoLoadConfig = {}
  for _ = 1, #metadata.compartments do table.insert(transport.autoLoadConfig, true) end
  local config = api.type.TransportVehicleConfig.new(); config.vehicles = { transport }; config.vehicleGroups = { 1 }; config.muFileNames = {}
  return config, modelId, price
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
    local load = config.vehicles[1].part.compartment2loadConfig[i]
    if not load or load.loadConfigIndex ~= 0 or config.vehicles[1].autoLoadConfig[i] ~= true then return false end
  end
  return true
end
local function assertDepot(binding)
  assert(entity(binding.depotEntity) and api.engine.entityExists(binding.depotEntity), "DEPOT_MISSING")
  assert(owner(binding.depotEntity) == binding.targetCompany, "DEPOT_OWNER_CHANGED")
  local depot = api.engine.getComponent(binding.depotEntity, api.type.ComponentType.VEHICLE_DEPOT)
  assert(depot and depot.carrier == api.type["enum"].Carrier.ROAD, "DEPOT_NOT_ROAD")
end
function M.prepare(intent, binding)
  assertCompanies(binding); held(); assertDepot(binding)
  local config, modelId, price = freshConfig(intent, binding)
  return api.cmd.makeVehicleBuyCmd(binding.targetCompany, binding.depotEntity, config), price, modelId
end
function M.execute(state, intent, binding, consent)
  assert(type(consent) == "table" and consent.kind == "native_vehicle_charge" and consent.confirmed == true
    and consent.originalCompany == binding.originalCompany and consent.targetCompany == binding.targetCompany
    and consent.depotEntity == binding.depotEntity and consent.model == intent.model, "EXPLICIT_CONSENT_REQUIRED")
  local current = state:get()
  assert(current and not current.nativeVehicleAttempted and not current.phase2CompanyFault, "ATTEMPT_ALREADY_CONSUMED")
  local command, price, modelId = M.prepare(intent, binding)
  local beforeOriginal, beforeTarget = balance(binding.originalCompany), balance(binding.targetCompany)
  local vehiclesBefore = entities(api.type.ComponentType.TRANSPORT_VEHICLE)
  local receipt = { outcome = "unknown", code = "ENGINE_OUTCOME_UNKNOWN", originalCompany = binding.originalCompany,
    targetCompany = binding.targetCompany, depotEntity = binding.depotEntity, model = intent.model,
    originalBefore = beforeOriginal, targetBefore = beforeTarget }
  current.nativeVehicleAttempted = true; current.phase2CompanyFault = true; current.nativeVehicleReceipt = receipt; state:set(current)
  local callbackSeen, callbackOpen = false, true
  local ok = pcall(function()
    api.cmd.sendCommand(command, function(data, success, resultEntities)
      if not callbackOpen or callbackSeen then return end; callbackSeen = true
      local saved = state:get(); if not saved or not saved.nativeVehicleAttempted then return end
      receipt.originalAfter = balance(binding.originalCompany); receipt.targetAfter = balance(binding.targetCompany)
      if not success then receipt.code = "NATIVE_REJECTED_OUTCOME_UNKNOWN"; saved.nativeVehicleReceipt = receipt; state:set(saved); return end
      local vehicleEntity = data and data.resultVehicleEntity
      assert(entity(vehicleEntity) and not vehiclesBefore[vehicleEntity] and api.engine.entityExists(vehicleEntity), "MISSING_NEW_VEHICLE")
      assert(owner(vehicleEntity) == binding.targetCompany, "VEHICLE_OWNER_CHANGED")
      local vehicle = api.engine.getComponent(vehicleEntity, api.type.ComponentType.TRANSPORT_VEHICLE)
      assert(vehicle and vehicle.carrier == api.type["enum"].Carrier.ROAD and vehicle.depot == binding.depotEntity
        and sameConfiguration(vehicle.transportVehicleConfig, modelId), "VEHICLE_CONFIGURATION_CHANGED")
      assert(#(resultEntities or {}) == 1 and resultEntities[1][1] == vehicleEntity, "VEHICLE_RESULT_MISSING")
      assert(receipt.originalAfter == beforeOriginal and receipt.targetAfter == beforeTarget - price and receipt.targetAfter >= 0, "DEBIT_NOT_VERIFIED")
      receipt.vehicleEntity = vehicleEntity; receipt.vehicleOwner = owner(vehicleEntity); receipt.depotOwner = owner(binding.depotEntity)
      receipt.chargedCost = beforeTarget - receipt.targetAfter; receipt.outcome = "verified"; receipt.code = "NATIVE_VEHICLE_ACCOUNTING_VERIFIED"
      saved.nativeVehicleReceipt = receipt; saved.phase2CompanyFault = false; state:set(saved)
    end)
  end)
  callbackOpen = false
  if not ok or not callbackSeen then
    local saved = state:get(); if saved and saved.nativeVehicleAttempted then
      receipt.outcome = "unknown"; receipt.code = ok and "ENGINE_CALLBACK_MISSING" or "ENGINE_SEND_FAILED"
      saved.nativeVehicleReceipt = receipt; saved.phase2CompanyFault = true; state:set(saved)
    end
  end
  return receipt
end
return M
