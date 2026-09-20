-- Bounded, engine-side read-only observation of the verified disposable road
-- service.  This is deliberately not a command adapter: it only copies scalar
-- evidence into saved state after the native service adapter has succeeded.
local M = {}

local MAX_INT, MAX_SAFE = 2147483647, 9007199254740991
local REQUEST_KEYS = { schemaVersion=true, kind=true, nonce=true, requestId=true,
  action=true, originalCompany=true, targetCompany=true, vehicleEntity=true,
  lineEntity=true, issuedTick=true, expiresTick=true }
local KNOWN = {
  HELD_ENGINE_REQUIRED=true, CLOCK_UNAVAILABLE=true, REQUEST_OUTSIDE_WINDOW=true,
  ORIGINAL_COMPANY_CHANGED=true, COMPANY_MISSING=true, COMPANY_PHASE2_FAULT=true,
  SERVICE_RECEIPT_UNVERIFIED=true, SERVICE_RECEIPT_CHANGED=true,
  BOUND_ENTITY_MISSING=true, TARGET_OWNERSHIP_CHANGED=true, VEHICLE_LINE_CHANGED=true,
  TWO_STOP_LINE_REQUIRED=true, INVALID_LINE_STOP=true, INVALID_VISIT_HISTORY=true,
  INVALID_VISITED_STOP=true, ACCOUNT_BALANCE_UNAVAILABLE=true,
  OBSERVATION_ALREADY_STARTED=true, OBSERVATION_NOT_STARTED=true,
  OBSERVATION_ALREADY_FINISHED=true, OBSERVATION_BINDING_CHANGED=true,
  SIMULATION_DID_NOT_ADVANCE=true, OBSERVED_ROUTE_CHANGED=true,
  INTERVAL_BALANCE_UNAVAILABLE=true, STATE_UNAVAILABLE=true, STATE_PERSIST_FAILED=true,
}

local function integer(v, maximum) return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge and v == math.floor(v) and v >= 0 and v <= maximum end
local function entity(v) return integer(v, MAX_INT) and v > 0 end
local function scalar(v) return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge and v == math.floor(v) and math.abs(v) <= MAX_SAFE end
local function fail(code) error(code, 0) end

local function exactRequest(request)
  if type(request) ~= "table" or getmetatable(request) ~= nil then return false end
  local count = 0
  for key in pairs(request) do if type(key) ~= "string" or not REQUEST_KEYS[key] then return false end; count = count + 1 end
  return count == 11 and request.schemaVersion == 1 and request.kind == "phase2_service_observation"
    and type(request.nonce) == "string" and #request.nonce == 32 and request.nonce:match("^[a-f0-9]+$") ~= nil
    and integer(request.requestId, MAX_INT) and request.requestId > 0
    and (request.action == "start" or request.action == "end")
    and entity(request.originalCompany) and entity(request.targetCompany) and request.originalCompany ~= request.targetCompany
    and entity(request.vehicleEntity) and entity(request.lineEntity)
    and integer(request.issuedTick, MAX_INT) and integer(request.expiresTick, MAX_INT)
    and request.expiresTick >= request.issuedTick and request.expiresTick - request.issuedTick <= 300
end

local function clock()
  local world = api.engine.util.getWorld()
  local value = api.engine.getComponent(world, api.type.ComponentType.GAME_TIME)
  if not value or not integer(value.tickCount, MAX_INT) or not integer(value.updateCount, MAX_INT) or not integer(value.gameTime, MAX_SAFE) then fail("CLOCK_UNAVAILABLE") end
  return value
end
local function held()
  local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED)
  if not speed or speed.speedup ~= 0 then fail("HELD_ENGINE_REQUIRED") end
end
local function owner(id)
  local value = api.engine.getComponent(id, api.type.ComponentType.PLAYER_OWNED)
  if not value or not entity(value.player) then fail("TARGET_OWNERSHIP_CHANGED") end
  return value.player
end
local function binding(request)
  return { originalCompany=request.originalCompany, targetCompany=request.targetCompany,
    vehicleEntity=request.vehicleEntity, lineEntity=request.lineEntity }
end
local function sameBinding(a, b)
  return type(a) == "table" and a.originalCompany == b.originalCompany and a.targetCompany == b.targetCompany
    and a.vehicleEntity == b.vehicleEntity and a.lineEntity == b.lineEntity
end

local function copiedStops(line)
  if not line or line.stops == nil or #line.stops ~= 2 then fail("TWO_STOP_LINE_REQUIRED") end
  local result = {}
  for index, stop in ipairs(line.stops) do
    if not entity(stop.stationGroup) or not integer(stop.station, MAX_INT) or not integer(stop.terminal, MAX_INT) then fail("INVALID_LINE_STOP") end
    result[index] = {stationGroup=stop.stationGroup, station=stop.station, terminal=stop.terminal}
  end
  return result
end
local function copiedVisitedStops(vehicle)
  if not vehicle or vehicle.visitedStops == nil or #vehicle.visitedStops > 2 then fail("INVALID_VISIT_HISTORY") end
  local result = {}
  for index, stop in ipairs(vehicle.visitedStops) do
    if not integer(stop, 1) then fail("INVALID_VISITED_STOP") end
    result[index] = stop
  end
  return result
end
local function visitedMask(stops)
  local first, second = false, false
  for _, stop in ipairs(stops) do
    if stop == 0 then first = true else second = true end
  end
  return (first and 1 or 0) + (second and 2 or 0)
end

local function verifiedReceipt(current, b)
  if current.phase2CompanyFault == true then fail("COMPANY_PHASE2_FAULT") end
  local service = current.nativeServiceReceipt
  if type(service) ~= "table" or current.nativeServiceLineAttempted ~= true or current.nativeServiceAssignmentAttempted ~= true
    or service.outcome ~= "verified" or service.code ~= "NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED"
    or service.lineOutcome ~= "verified" or service.assignmentOutcome ~= "verified" then fail("SERVICE_RECEIPT_UNVERIFIED") end
  if service.originalCompany ~= b.originalCompany or service.targetCompany ~= b.targetCompany
    or service.vehicleEntity ~= b.vehicleEntity or service.lineEntity ~= b.lineEntity then fail("SERVICE_RECEIPT_CHANGED") end
  if not entity(service.depotEntity) or not entity(service.stationA) or not entity(service.stationB) then fail("SERVICE_RECEIPT_UNVERIFIED") end
  return service
end
local function savedRoute(line, service)
  local stops = copiedStops(line)
  for index, expected in ipairs({service.stationA, service.stationB}) do
    local group = api.engine.getComponent(stops[index].stationGroup, api.type.ComponentType.STATION_GROUP)
    if not group or group.stations == nil or group.stations[stops[index].station + 1] ~= expected then fail("SERVICE_RECEIPT_CHANGED") end
  end
  return stops
end

local function snapshot(current, b)
  local service = verifiedReceipt(current, b)
  for _, id in ipairs({b.originalCompany, b.targetCompany, b.vehicleEntity, b.lineEntity, service.depotEntity, service.stationA, service.stationB}) do
    if not api.engine.entityExists(id) then fail("BOUND_ENTITY_MISSING") end
  end
  if api.engine.util.getPlayer() ~= b.originalCompany then fail("ORIGINAL_COMPANY_CHANGED") end
  if not api.engine.getComponent(b.originalCompany, api.type.ComponentType.PLAYER) or not api.engine.getComponent(b.targetCompany, api.type.ComponentType.PLAYER) then fail("COMPANY_MISSING") end
  local vehicle, line = api.engine.getComponent(b.vehicleEntity, api.type.ComponentType.TRANSPORT_VEHICLE), api.engine.getComponent(b.lineEntity, api.type.ComponentType.LINE)
  if owner(b.vehicleEntity) ~= b.targetCompany or owner(b.lineEntity) ~= b.targetCompany then fail("TARGET_OWNERSHIP_CHANGED") end
  if owner(service.depotEntity) ~= b.targetCompany or owner(service.stationA) ~= b.targetCompany or owner(service.stationB) ~= b.targetCompany then fail("TARGET_OWNERSHIP_CHANGED") end
  if not vehicle or vehicle.line ~= b.lineEntity then fail("VEHICLE_LINE_CHANGED") end
  local now = clock()
  local windowStart = math.max(now.gameTime - api.util.getDefaultYearDuration(), 0)
  local net = api.engine.util.finance.calculateBalance({b.vehicleEntity}, windowStart, now.gameTime, true)
  if not scalar(net) then fail("ACCOUNT_BALANCE_UNAVAILABLE") end
  if not integer(vehicle.stopIndex, 1) then fail("VEHICLE_LINE_CHANGED") end
  return { originalCompany=b.originalCompany, targetCompany=b.targetCompany, vehicleEntity=b.vehicleEntity, lineEntity=b.lineEntity,
    vehicleOwner=owner(b.vehicleEntity), lineOwner=owner(b.lineEntity), depotOwner=owner(service.depotEntity), stationAOwner=owner(service.stationA), stationBOwner=owner(service.stationB), gameTime=now.gameTime, tickCount=now.tickCount,
    updateCount=now.updateCount, stopIndex=vehicle.stopIndex, stops=savedRoute(line, service), visitedStops=copiedVisitedStops(vehicle),
    accountNetWindowStart=windowStart, accountNetWindowEnd=now.gameTime, accountNet=net }
end

local function receipt(request, outcome, code, now, raw)
  local result = {schemaVersion=1, kind="phase2_service_observation_receipt", nonce=request.nonce, requestId=request.requestId,
    action=request.action, outcome=outcome, code=code, originalCompany=request.originalCompany, targetCompany=request.targetCompany,
    vehicleEntity=request.vehicleEntity, lineEntity=request.lineEntity, issuedTick=request.issuedTick, expiresTick=request.expiresTick,
    tickCount=now and now.tickCount or 0, updateCount=now and now.updateCount or 0, gameTime=now and now.gameTime or 0,
    startGameTime=0, startUpdateCount=0, endGameTime=0, endUpdateCount=0, accountNetWindowStart=0,
    accountNetWindowEnd=0, accountNet=0, intervalNet=0, intervalMaintenanceVehicle=0,
    intervalMaintenanceInfrastructure=0, intervalMaintenanceOther=0, intervalMaintenanceVehicleMaintenance=0,
    startVisitedMask=0, endVisitedMask=0, startStopIndex=0, endStopIndex=0}
  raw = raw or {}
  result.startGameTime=raw.startGameTime or 0; result.startUpdateCount=raw.startUpdateCount or 0
  result.endGameTime=raw.endGameTime or 0; result.endUpdateCount=raw.endUpdateCount or 0
  result.accountNetWindowStart=raw.accountNetWindowStart or 0; result.accountNetWindowEnd=raw.accountNetWindowEnd or 0
  result.accountNet=raw.accountNet or 0; result.intervalNet=raw.intervalNet or 0
  result.intervalMaintenanceVehicle=raw.intervalMaintenanceVehicle or 0; result.intervalMaintenanceInfrastructure=raw.intervalMaintenanceInfrastructure or 0
  result.intervalMaintenanceOther=raw.intervalMaintenanceOther or 0; result.intervalMaintenanceVehicleMaintenance=raw.intervalMaintenanceVehicleMaintenance or 0
  result.startVisitedMask=raw.startVisitedMask or 0; result.endVisitedMask=raw.endVisitedMask or 0
  result.startStopIndex=raw.startStopIndex or 0; result.endStopIndex=raw.endStopIndex or 0
  return result
end

local function capture(state, request)
  local current = state:get()
  if type(current) ~= "table" then fail("STATE_UNAVAILABLE") end
  local previous = current.nativeServiceObservationReceipt
  if type(previous) == "table" and previous.nonce == request.nonce and previous.requestId == request.requestId and previous.action == request.action then return previous end
  held()
  local now = clock()
  if now.tickCount < request.issuedTick or now.tickCount > request.expiresTick then fail("REQUEST_OUTSIDE_WINDOW") end
  local b = binding(request)
  local observation = current.nativeServiceObservation
  if request.action == "start" then
    if observation ~= nil and (type(observation) ~= "table" or next(observation) ~= nil) then fail("OBSERVATION_ALREADY_STARTED") end
    local start = snapshot(current, b)
    local result = receipt(request, "raw_start_captured", "RAW_START_CAPTURED", start, {startGameTime=start.gameTime, startUpdateCount=start.updateCount, accountNetWindowStart=start.accountNetWindowStart, accountNetWindowEnd=start.accountNetWindowEnd, accountNet=start.accountNet, startVisitedMask=visitedMask(start.visitedStops), startStopIndex=start.stopIndex})
    current.nativeServiceObservation = {nonce=request.nonce, binding=b, phase="started", start=start}
    current.nativeServiceObservationReceipt = result
    local saved = pcall(function() state:set(current) end); if not saved then fail("STATE_PERSIST_FAILED") end
    return result
  end
  if type(observation) ~= "table" or observation.phase == nil or observation.start == nil then fail("OBSERVATION_NOT_STARTED") end
  if observation.phase == "finished" then fail("OBSERVATION_ALREADY_FINISHED") end
  if observation.phase ~= "started" or observation.nonce ~= request.nonce or not sameBinding(observation.binding, b) then fail("OBSERVATION_BINDING_CHANGED") end
  local ending = snapshot(current, b)
  local start = observation.start
  if ending.gameTime <= start.gameTime or ending.updateCount <= start.updateCount then fail("SIMULATION_DID_NOT_ADVANCE") end
  for index, stop in ipairs(ending.stops) do local initial = start.stops[index]; if not initial or initial.stationGroup ~= stop.stationGroup or initial.station ~= stop.station or initial.terminal ~= stop.terminal then fail("OBSERVED_ROUTE_CHANGED") end end
  local intervalNet = api.engine.util.finance.calculateBalance({b.vehicleEntity}, start.gameTime, ending.gameTime, true)
  local maintenance = api.type.JournalEntry.Maintenance
  local intervalMaintenanceVehicle = api.engine.util.finance.calculateBalance({b.vehicleEntity}, start.gameTime, ending.gameTime, true, maintenance.VEHICLE)
  local intervalMaintenanceInfrastructure = api.engine.util.finance.calculateBalance({b.vehicleEntity}, start.gameTime, ending.gameTime, true, maintenance.INFRASTRUCTURE)
  local intervalMaintenanceOther = api.engine.util.finance.calculateBalance({b.vehicleEntity}, start.gameTime, ending.gameTime, true, maintenance.OTHER)
  local intervalMaintenanceVehicleMaintenance = api.engine.util.finance.calculateBalance({b.vehicleEntity}, start.gameTime, ending.gameTime, true, maintenance.VEHICLE_MAINTENANCE)
  if not scalar(intervalNet) or not scalar(intervalMaintenanceVehicle) or not scalar(intervalMaintenanceInfrastructure) or not scalar(intervalMaintenanceOther) or not scalar(intervalMaintenanceVehicleMaintenance) then fail("INTERVAL_BALANCE_UNAVAILABLE") end
  local result = receipt(request, "raw_end_captured", "RAW_END_CAPTURED", ending, {startGameTime=start.gameTime, startUpdateCount=start.updateCount, endGameTime=ending.gameTime, endUpdateCount=ending.updateCount, accountNetWindowStart=ending.accountNetWindowStart, accountNetWindowEnd=ending.accountNetWindowEnd, accountNet=ending.accountNet, intervalNet=intervalNet, intervalMaintenanceVehicle=intervalMaintenanceVehicle, intervalMaintenanceInfrastructure=intervalMaintenanceInfrastructure, intervalMaintenanceOther=intervalMaintenanceOther, intervalMaintenanceVehicleMaintenance=intervalMaintenanceVehicleMaintenance, startVisitedMask=visitedMask(start.visitedStops), endVisitedMask=visitedMask(ending.visitedStops), startStopIndex=start.stopIndex, endStopIndex=ending.stopIndex})
  current.nativeServiceObservation = {nonce=request.nonce, binding=b, phase="finished", start=start, ending=ending, intervalNet=intervalNet, intervalMaintenanceVehicle=intervalMaintenanceVehicle, intervalMaintenanceInfrastructure=intervalMaintenanceInfrastructure, intervalMaintenanceOther=intervalMaintenanceOther, intervalMaintenanceVehicleMaintenance=intervalMaintenanceVehicleMaintenance}
  current.nativeServiceObservationReceipt = result
  local saved = pcall(function() state:set(current) end); if not saved then fail("STATE_PERSIST_FAILED") end
  return result
end

function M.handle(state, param)
  if not exactRequest(param) then return receipt({nonce="", requestId=0, action="", originalCompany=0, targetCompany=0, vehicleEntity=0, lineEntity=0, issuedTick=0, expiresTick=0}, "rejected", "INVALID_REQUEST", nil) end
  local before = nil
  local ok, value = pcall(function() before = clock(); return capture(state, param) end)
  if ok then return value end
  local code = KNOWN[value] and value or "OBSERVATION_UNAVAILABLE"
  local nowOk, now = pcall(clock); if not nowOk then now = before end
  return receipt(param, "rejected", code, now)
end
return M
