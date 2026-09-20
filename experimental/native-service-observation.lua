-- Read-only native service observation experiment.  NOT registered in the
-- mod, a UI, userdata exchange, or a network endpoint. It sends no command and
-- retains only copied Lua scalars in GameScript state. It is not TF3-run.
--
-- The first-party GUI creates ChartConfig with api.type.ChartConfig.new() and
-- sets count before calling finance.getAccountChart. This collector follows
-- that public pattern but deliberately does not turn chart values into a
-- claimed revenue/expense receipt: chart cost sign is not declared by Teal.
local M = {}

local function entity(v)
  return type(v) == "number" and v == math.floor(v) and v > 0 and v <= 2147483647
end

local function scalar(v)
  return type(v) == "number" and v == v and math.abs(v) <= 9007199254740991
end

local function exactBinding(binding)
  assert(type(binding) == "table", "INVALID_BINDING")
  local count = 0
  for key in pairs(binding) do
    assert(key == "targetCompany" or key == "vehicleEntity" or key == "lineEntity", "UNEXPECTED_BINDING_FIELD")
    count = count + 1
  end
  assert(count == 3 and entity(binding.targetCompany) and entity(binding.vehicleEntity) and entity(binding.lineEntity),
    "INVALID_BINDING")
end

local function copiedStops(line)
  assert(line and #line.stops == 2, "TWO_STOP_LINE_REQUIRED")
  local stops = {}
  for index, stop in ipairs(line.stops) do
    assert(entity(stop.stationGroup) and type(stop.station) == "number" and stop.station == math.floor(stop.station)
      and type(stop.terminal) == "number" and stop.terminal == math.floor(stop.terminal), "INVALID_LINE_STOP")
    stops[index] = { stationGroup = stop.stationGroup, station = stop.station, terminal = stop.terminal }
  end
  return stops
end

local function copiedSeries(chart)
  assert(chart and type(chart.series) == "table" and #chart.series <= 8, "ACCOUNT_CHART_UNAVAILABLE")
  local output = {}
  for seriesIndex, series in ipairs(chart.series) do
    assert(type(series) == "table" and type(series[1]) == "table" and type(series[2]) == "table"
      and #series[1] == #series[2] and #series[1] <= 64, "INVALID_ACCOUNT_CHART")
    local x, y = {}, {}
    for pointIndex, value in ipairs(series[1]) do assert(scalar(value), "INVALID_CHART_X"); x[pointIndex] = value end
    for pointIndex, value in ipairs(series[2]) do assert(scalar(value), "INVALID_CHART_Y"); y[pointIndex] = value end
    output[seriesIndex] = { x = x, y = y }
  end
  return output
end

local function copiedVisitedStops(vehicle)
  local output = {}
  assert(vehicle.visitedStops and #vehicle.visitedStops <= 2, "INVALID_VISIT_HISTORY")
  for index, stopIndex in ipairs(vehicle.visitedStops or {}) do
    assert(type(stopIndex) == "number" and stopIndex == math.floor(stopIndex) and stopIndex >= 0 and stopIndex < 2,
      "INVALID_VISITED_STOP")
    output[index] = stopIndex
  end
  return output
end

local function snapshot(binding)
  exactBinding(binding)
  for _, id in ipairs({ binding.targetCompany, binding.vehicleEntity, binding.lineEntity }) do
    assert(api.engine.entityExists(id), "BOUND_ENTITY_MISSING")
  end
  local vehicleOwner = api.engine.getComponent(binding.vehicleEntity, api.type.ComponentType.PLAYER_OWNED)
  local lineOwner = api.engine.getComponent(binding.lineEntity, api.type.ComponentType.PLAYER_OWNED)
  local vehicle = api.engine.getComponent(binding.vehicleEntity, api.type.ComponentType.TRANSPORT_VEHICLE)
  local line = api.engine.getComponent(binding.lineEntity, api.type.ComponentType.LINE)
  assert(vehicleOwner and lineOwner and vehicleOwner.player == binding.targetCompany and lineOwner.player == binding.targetCompany,
    "TARGET_OWNERSHIP_CHANGED")
  assert(vehicle and vehicle.line == binding.lineEntity, "VEHICLE_LINE_CHANGED")
  local clock = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME)
  assert(clock and scalar(clock.gameTime) and scalar(clock.updateCount), "CLOCK_UNAVAILABLE")

  -- This is the same documented constructor/use shape as the shipped finance
  -- charts: constructor plus its 16-year count, then direct asset account
  -- chart. The entity-window vehicle/line source sets chartsYearsToDisplay=16.
  local config = api.type.ChartConfig.new()
  config.count = 16
  local chart = api.engine.util.finance.getAccountChart(binding.vehicleEntity, config)
  local windowStart = math.max(clock.gameTime - api.util.getDefaultYearDuration(), 0)
  local net = api.engine.util.finance.calculateBalance({ binding.vehicleEntity }, windowStart, clock.gameTime, true)
  assert(scalar(net), "ACCOUNT_BALANCE_UNAVAILABLE")
  return {
    targetCompany = binding.targetCompany,
    vehicleEntity = binding.vehicleEntity,
    lineEntity = binding.lineEntity,
    vehicleOwner = vehicleOwner.player,
    lineOwner = lineOwner.player,
    gameTime = clock.gameTime,
    updateCount = clock.updateCount,
    stops = copiedStops(line),
    visitedStops = copiedVisitedStops(vehicle),
    accountChartSeries = copiedSeries(chart),
    accountNetWindowStart = windowStart,
    accountNetWindowEnd = clock.gameTime,
    accountNet = net,
  }
end

local function sameBinding(a, b)
  return a and b and a.targetCompany == b.targetCompany and a.vehicleEntity == b.vehicleEntity and a.lineEntity == b.lineEntity
end

-- Capture a scalar-only start observation. This does not arm, schedule, pause,
-- mutate, or authorise any native action.
function M.captureStart(state, binding)
  local current = state:get() or {}
  assert(current.nativeServiceObservation == nil, "OBSERVATION_ALREADY_STARTED")
  local start = snapshot(binding)
  current.nativeServiceObservation = { binding = { targetCompany = binding.targetCompany, vehicleEntity = binding.vehicleEntity,
    lineEntity = binding.lineEntity }, start = start }
  state:set(current)
  return { outcome = "raw_start_captured", start = start }
end

-- Capture an end observation and exact direct-vehicle-account journal totals
-- across the observed game-time interval. The public category-filter result is
-- retained as raw evidence only: its declaration does not say whether income
-- entries remain included when a maintenance type is supplied. It therefore
-- cannot be subtracted from the net as a proven revenue/expense split.
function M.captureEnd(state, binding)
  local current = state:get() or {}
  local observation = current.nativeServiceObservation
  assert(observation and sameBinding(observation.binding, binding), "OBSERVATION_BINDING_CHANGED")
  local ending = snapshot(binding)
  assert(ending.gameTime > observation.start.gameTime and ending.updateCount > observation.start.updateCount,
    "SIMULATION_DID_NOT_ADVANCE")
  for index, stop in ipairs(ending.stops) do
    local initial = observation.start.stops[index]
    assert(initial and initial.stationGroup == stop.stationGroup and initial.station == stop.station
      and initial.terminal == stop.terminal, "OBSERVED_ROUTE_CHANGED")
  end
  local intervalNet = api.engine.util.finance.calculateBalance({ binding.vehicleEntity }, observation.start.gameTime,
    ending.gameTime, true)
  local intervalVehicleMaintenance = api.engine.util.finance.calculateBalance({ binding.vehicleEntity }, observation.start.gameTime,
    ending.gameTime, true, api.type.JournalEntry.Maintenance.VEHICLE)
  assert(scalar(intervalNet) and scalar(intervalVehicleMaintenance), "INTERVAL_BALANCE_UNAVAILABLE")
  local result = { outcome = "unverified_accounting_category_scope",
    accountingSource = "raw_vehicle_account_net_and_category_filter",
    start = observation.start, ending = ending, intervalNet = intervalNet,
    intervalVehicleMaintenance = intervalVehicleMaintenance }
  current.nativeServiceObservation = { binding = observation.binding, result = result }
  state:set(current)
  return result
end

return M
