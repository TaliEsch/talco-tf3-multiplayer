-- Read-only modular-terminal template diagnostic.  This ordinary ug_require
-- module publishes only the scalar snapshot returned by inspect().  In particular it
-- never constructs a proposal, changes a company, or sends a command.
--
-- pcall handles ordinary Lua errors; Native assertions may abort before Lua error handling and are not catchable.
local M = {}

local RESOURCE_SUFFIX = "/street/modular_street_station/modular_terminal.con"
local MAX_RESOURCE_NAMES = 8192
local MAX_RESULT_ITEMS = 256
local MAX_SAFE_INTEGER = 9007199254740991

local function snapshot(code, paramsPresent, modulesPresent, moduleCount,
  subconstructionCount, costKnown, cost)
  -- This is the only table that crosses this module boundary.  Keep it scalar:
  -- do not return evaluator params, result userdata, or caught error objects.
  return {
    code = code,
    paramsPresent = paramsPresent or 0,
    modulesPresent = modulesPresent or 0,
    moduleCount = moduleCount or 0,
    subconstructionCount = subconstructionCount or 0,
    costKnown = costKnown or 0,
    cost = cost or 0,
    templateIndex = 0,
    platforms = 1,
  }
end

local function unsignedSafeInteger(value)
  return type(value) == "number" and value == value and value >= 0
    and value == math.floor(value) and value <= MAX_SAFE_INTEGER
end

-- This only counts keys; it never copies keys, values, params, or userdata.
-- The 257th item is detected as a failure rather than reported as a truncated
-- count, so no returned count claims to be the full collection when it is not.
local function boundedCollectionCount(value)
  if value == nil then return 0, 0 end
  local count = 0
  for _ in pairs(value) do
    count = count + 1
    if count > MAX_RESULT_ITEMS then return nil, nil end
  end
  return 1, count
end

local function resolveTerminalResource()
  local names = api.res.constructionRep.getAll()
  if names == nil then return nil end
  local selected = nil
  local count = 0
  for _, name in pairs(names) do
    count = count + 1
    if count > MAX_RESOURCE_NAMES or type(name) ~= "string" then return nil end
    if name:sub(-#RESOURCE_SUFFIX) == RESOURCE_SUFFIX then
      if selected ~= nil then return nil end
      selected = name
    end
  end
  return selected
end

local function readTramDefault(resourceId)
  local description = api.res.constructionRep.get(resourceId)
  if description == nil or description.params == nil then return nil, false end
  local count = 0
  for _, parameter in pairs(description.params) do
    count = count + 1
    if count > MAX_RESULT_ITEMS or parameter == nil then return nil, false end
    if parameter.key == "tramTrack" then
      -- The stock definition may intentionally omit defaultIndex.  In that
      -- case preserve the GUI's absent value rather than fabricating one.
      if parameter.defaultIndex == nil then return nil, true end
      if unsignedSafeInteger(parameter.defaultIndex) then return parameter.defaultIndex, true end
      return nil, false
    end
  end
  -- Some installed resource representations omit the shared tram metadata;
  -- that is an absent GUI value, not permission to invent a tram selection.
  return nil, true
end

function M.inspect()
  local failureCode = "RESOURCE_LOOKUP_FAILED"
  local ok, result = pcall(function()
    local resource = resolveTerminalResource()
    if resource == nil then return snapshot(failureCode) end
    local resourceId = api.res.constructionRep.find(resource)
    if type(resourceId) ~= "number" or resourceId == -1
      or api.res.constructionRep.getName(resourceId) ~= resource then
      return snapshot(failureCode)
    end

    -- These are the only known menu selections for the passenger template.
    -- Do not copy a generic parameter table or expand evaluator output params.
    failureCode = "PARAMETER_METADATA_FAILED"
    local tramDefault, metadataOk = readTramDefault(resourceId)
    if not metadataOk then return snapshot(failureCode) end
    failureCode = "GLOBAL_PARAMETERS_FAILED"
    local params = api.engine.util.construction.getGlobalConstructionParams()
    if params == nil then return snapshot(failureCode) end
    -- The native evaluator receives templateIndex as its second argument.
    -- Match the stock GUI: do not also insert it into the parameter table.
    -- Duplicating native-reserved keys can assert in lua::Table::Put.
    params.platforms = 1
    if tramDefault ~= nil then params.tramTrack = tramDefault end

    failureCode = "TEMPLATE_EVALUATION_FAILED"
    local constructionResult = api.engine.util.construction.getConstructionResult(resource, 0, params)
    if constructionResult == nil then return snapshot(failureCode) end
    failureCode = "RESULT_INSPECTION_FAILED"
    local paramsPresent = constructionResult.params ~= nil and 1 or 0
    local modulesPresent, moduleCount = 0, 0
    if paramsPresent == 1 then
      modulesPresent, moduleCount = boundedCollectionCount(constructionResult.params.modules)
      if modulesPresent == nil then return snapshot(failureCode) end
    end
    local _, subconstructionCount = boundedCollectionCount(constructionResult.subconstructions)
    if subconstructionCount == nil then return snapshot(failureCode) end
    local costKnown, cost = 0, 0
    if unsignedSafeInteger(constructionResult.cost) then
      costKnown, cost = 1, constructionResult.cost
    end
    return snapshot("TEMPLATE_EVALUATED", paramsPresent, modulesPresent, moduleCount,
      subconstructionCount, costKnown, cost)
  end)
  if not ok then return snapshot(failureCode) end
  -- The protected body itself returns a scalar snapshot for every expected path.
  if type(result) ~= "table" then return snapshot("PROBE_FAILED") end
  return result
end

return M
