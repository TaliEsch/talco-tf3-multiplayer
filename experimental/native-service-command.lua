-- Engine-side bounded road-service experiment.  NOT registered in the mod or a
-- network endpoint.  It creates one fresh two-stop line and separately assigns
-- one already-owned road vehicle.  It never transfers ownership, creates a
-- shared company, executes remote/native text, retries, or compensates.
--
-- api/cmd.d.tl documents that engine-state callbacks are immediate.  A missing
-- callback is therefore unknown: its consumed saved latch and phase2CompanyFault
-- remain set.  This has not been exercised in a disposable TF3 save.  In
-- particular, this readback does not demonstrate road-path reachability beyond
-- the line-system problem state, vehicle movement, service income, or operating
-- expense attribution.
local M = {}

local function entity(v)
  return type(v) == "number" and v == math.floor(v) and v > 0 and v <= 2147483647
end

local function exactKeys(t, allowed, count)
  local seen = 0
  for key in pairs(t) do assert(allowed[key], "UNEXPECTED_FIELD"); seen = seen + 1 end
  assert(seen == count, "INVALID_INTENT")
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
  assert(type(binding.lineName) == "string" and #binding.lineName > 0 and #binding.lineName <= 64,
    "LINE_NAME_INVALID")
end

local function stationIndex(group, stationEntity)
  local groupComponent = api.engine.getComponent(group, api.type.ComponentType.STATION_GROUP)
  assert(groupComponent and #groupComponent.stations > 0, "STATION_GROUP_MISSING")
  for index, candidate in ipairs(groupComponent.stations) do
    if candidate == stationEntity then return index - 1 end
  end
  error("STATION_NOT_IN_GROUP")
end

-- A supplied stop is an existing target-owned station, not a caller-provided
-- group/index/terminal.  Terminal selection is fresh engine data, constrained
-- to that station and verified as ROAD before the command boundary.
local function preparedStop(stationEntity, targetCompany)
  assert(entity(stationEntity) and api.engine.entityExists(stationEntity), "STATION_MISSING")
  assert(owner(stationEntity) == targetCompany, "STATION_OWNER_CHANGED")
  assert(api.engine.getComponent(stationEntity, api.type.ComponentType.STATION), "STATION_COMPONENT_MISSING")
  local group = api.engine.system.stationGroupSystem.getStationGroup(stationEntity)
  assert(entity(group) and api.engine.entityExists(group), "STATION_GROUP_MISSING")
  return {stationEntity = stationEntity, stationGroup = group, station = stationIndex(group, stationEntity)}
end

local function assertDepotAndVehicle(binding)
  assert(entity(binding.depotEntity) and api.engine.entityExists(binding.depotEntity), "DEPOT_MISSING")
  assert(owner(binding.depotEntity) == binding.targetCompany, "DEPOT_OWNER_CHANGED")
  local depot = api.engine.getComponent(binding.depotEntity, api.type.ComponentType.VEHICLE_DEPOT)
  assert(depot and depot.carrier == api.type["enum"].Carrier.ROAD, "DEPOT_NOT_ROAD")
  assert(entity(binding.vehicleEntity) and api.engine.entityExists(binding.vehicleEntity), "VEHICLE_MISSING")
  assert(owner(binding.vehicleEntity) == binding.targetCompany, "VEHICLE_OWNER_CHANGED")
  local vehicle = api.engine.getComponent(binding.vehicleEntity, api.type.ComponentType.TRANSPORT_VEHICLE)
  assert(vehicle and vehicle.carrier == api.type["enum"].Carrier.ROAD, "VEHICLE_NOT_ROAD")
  return vehicle
end

local function makeLine(stops)
  local line = api.type.Line.new()
  line.stops = {}
  for _, selected in ipairs(stops) do
    local stop = api.type.Line.Stop.new()
    stop.stationGroup = selected.stationGroup
    stop.station = selected.station
    stop.terminal = -1
    stop.alternativeTerminals = {}
    table.insert(line.stops, stop)
  end
  local assignments = api.engine.system.lineSystem.getBestLineAssignment(-1, line, true)
  assert(#assignments == 2, "TERMINAL_ASSIGNMENT_MISSING")
  for index, assignment in ipairs(assignments) do
    assert(assignment and assignment.station == stops[index].station and assignment.terminal >= 0,
      "ROAD_TERMINAL_UNAVAILABLE")
    local carriers = api.engine.system.stationGroupSystem.getCarriers(
      stops[index].stationGroup, assignment.station, assignment.terminal)[1]
    local road = false
    for _, carrier in ipairs(carriers or {}) do
      if carrier == api.type["enum"].Carrier.ROAD then road = true end
    end
    assert(road, "STOP_NOT_ROAD")
    line.stops[index].station = assignment.station
    line.stops[index].terminal = assignment.terminal
  end
  return line
end

local function assertActualLine(lineEntity, binding, expected)
  assert(entity(lineEntity) and api.engine.entityExists(lineEntity), "MISSING_NEW_LINE")
  assert(owner(lineEntity) == binding.targetCompany, "LINE_OWNER_CHANGED")
  local name = api.engine.getComponent(lineEntity, api.type.ComponentType.NAME)
  assert(name and name.name == binding.lineName, "LINE_NAME_CHANGED")
  local line = api.engine.getComponent(lineEntity, api.type.ComponentType.LINE)
  assert(line and #line.stops == 2, "LINE_CONFIGURATION_CHANGED")
  for index, stop in ipairs(line.stops) do
    local expectedStop = expected[index]
    assert(stop.stationGroup == expectedStop.stationGroup and stop.station == expectedStop.station
      and stop.terminal == expectedStop.terminal, "LINE_STOP_CHANGED")
    local carriers = api.engine.system.stationGroupSystem.getCarriers(stop.stationGroup, stop.station, stop.terminal)[1]
    local road = false
    for _, carrier in ipairs(carriers or {}) do
      if carrier == api.type["enum"].Carrier.ROAD then road = true end
    end
    assert(road, "LINE_STOP_NOT_ROAD")
  end
  for _, problem in ipairs(api.engine.system.lineSystem.getProblemLines(binding.targetCompany)) do
    if problem[1] == lineEntity then
      assert(problem[2] == api.type["enum"].LineProblem.NOTHING, "LINE_PATH_UNVERIFIED")
    end
  end
end

local function assertConsent(consent, intent, binding)
  assert(consent and consent.kind == "native_service_create_and_assign" and consent.confirmed == true,
    "EXPLICIT_CONSENT_REQUIRED")
  assert(consent.originalCompany == binding.originalCompany and consent.targetCompany == binding.targetCompany
    and consent.depotEntity == binding.depotEntity and consent.vehicleEntity == binding.vehicleEntity
    and consent.stationA == intent.stationA and consent.stationB == intent.stationB
    and consent.lineName == binding.lineName, "CONSENT_CHANGED")
end

local function recheck(intent, binding)
  assertCompanies(binding)
  held()
  local vehicle = assertDepotAndVehicle(binding)
  local first = preparedStop(intent.stationA, binding.targetCompany)
  local second = preparedStop(intent.stationB, binding.targetCompany)
  assert(first.stationEntity ~= second.stationEntity, "DISTINCT_STATIONS_REQUIRED")
  return vehicle, {first, second}
end

-- State is a GameScriptState supporting get/set.  Each engine mutation has an
-- independent saved latch.  The shared phase fault is persisted before each
-- sendCommand and only a complete synchronous readback may clear it.
function M.execute(state, intent, binding, consent)
  assert(type(intent) == "table", "INVALID_INTENT")
  exactKeys(intent, {stationA = true, stationB = true}, 2)
  assertConsent(consent, intent, binding)
  local current = state:get()
  assert(current and not current.phase2CompanyFault and not current.nativeServiceLineAttempted,
    "ATTEMPT_ALREADY_CONSUMED")
  local vehicle, selected = recheck(intent, binding)
  assert(vehicle.depot == binding.depotEntity, "VEHICLE_NOT_AT_TARGET_DEPOT")
  local line = makeLine(selected)
  local linesBefore = {}
  for _, lineEntity in ipairs(api.engine.system.lineSystem.getLines()) do linesBefore[lineEntity] = true end
  local receipt = {outcome = "unknown", code = "ENGINE_OUTCOME_UNKNOWN", originalCompany = binding.originalCompany,
    targetCompany = binding.targetCompany, depotEntity = binding.depotEntity, vehicleEntity = binding.vehicleEntity,
    stationA = intent.stationA, stationB = intent.stationB, lineName = binding.lineName}
  current.nativeServiceLineAttempted = true
  current.phase2CompanyFault = true -- Shared barrier is saved before the line-create command.
  current.nativeServiceReceipt = receipt
  state:set(current)
  local callbackSeen, callbackOpen = false, true
  local ok = pcall(function()
    api.cmd.sendCommand(api.cmd.makeLineCreateCmd(binding.lineName, api.type.Vec3f.new(0.15, 0.45, 0.85),
      binding.targetCompany, line), function(data, success, resultEntities)
      if not callbackOpen or callbackSeen then return end
      callbackSeen = true
      if not success then receipt.code = "NATIVE_LINE_REJECTED_OUTCOME_UNKNOWN"; return end
      local lineEntity = data and data.resultEntity
      assert(entity(lineEntity) and not linesBefore[lineEntity] and api.engine.entityExists(lineEntity),
        "MISSING_FRESH_LINE")
      assert(#(resultEntities or {}) == 1 and resultEntities[1][1] == lineEntity, "LINE_RESULT_MISSING")
      assertActualLine(lineEntity, binding, line.stops)
      receipt.lineEntity = lineEntity
      receipt.lineOutcome = "verified"
    end)
  end)
  callbackOpen = false -- Late engine callbacks cannot alter this receipt.
  if not ok or not callbackSeen or receipt.lineOutcome ~= "verified" then
    current.nativeServiceReceipt = receipt
    state:set(current)
    return receipt
  end
  current.nativeServiceReceipt = receipt
  state:set(current)

  -- Assignment is a distinct command and distinct permanently consumed attempt.
  -- Keep the shared fault latched between the commands: only this in-flight
  -- continuation may proceed, and failures while preparing assignment remain
  -- a durable company-wide stop after a partial line creation.
  current = state:get()
  assert(current and current.phase2CompanyFault == true and current.nativeServiceLineAttempted
    and not current.nativeServiceAssignmentAttempted and current.nativeServiceReceipt
    and current.nativeServiceReceipt.lineEntity == receipt.lineEntity,
    "ASSIGNMENT_ATTEMPT_ALREADY_CONSUMED")
  local refreshed
  vehicle, refreshed = recheck(intent, binding)
  assert(vehicle.depot == binding.depotEntity, "VEHICLE_NOT_AT_TARGET_DEPOT")
  assert(refreshed[1].stationGroup == selected[1].stationGroup and refreshed[1].station == selected[1].station
    and refreshed[2].stationGroup == selected[2].stationGroup and refreshed[2].station == selected[2].station,
    "STATION_BINDING_CHANGED")
  assertActualLine(receipt.lineEntity, binding, line.stops)
  current.nativeServiceAssignmentAttempted = true
  current.phase2CompanyFault = true -- Shared barrier is saved before vehicle assignment.
  state:set(current)
  callbackSeen, callbackOpen = false, true
  ok = pcall(function()
    api.cmd.sendCommand(api.cmd.makeVehicleSetLineCmd(binding.vehicleEntity, receipt.lineEntity, 0),
      function(_, success)
        if not callbackOpen or callbackSeen then return end
        callbackSeen = true
        if not success then receipt.code = "NATIVE_ASSIGNMENT_REJECTED_OUTCOME_UNKNOWN"; return end
        local actual = assertDepotAndVehicle(binding)
        assert(actual.line == receipt.lineEntity and actual.stopIndex >= 0, "VEHICLE_LINE_CHANGED")
        assertActualLine(receipt.lineEntity, binding, line.stops)
        receipt.assignmentOutcome = "verified"
        receipt.outcome = "verified"
        receipt.code = "NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED"
      end)
  end)
  callbackOpen = false -- Late engine callbacks cannot turn an unknown into success.
  if not ok or not callbackSeen or receipt.assignmentOutcome ~= "verified" then
    receipt.outcome = "unknown"
    if receipt.code == "NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED" then receipt.code = "ENGINE_OUTCOME_UNKNOWN" end
  else
    current.phase2CompanyFault = false
  end
  current.nativeServiceReceipt = receipt
  state:set(current)
  return receipt
end

return M
