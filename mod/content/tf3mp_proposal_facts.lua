-- Passive proposal-field qualification for the ordinary street-terminal event.
-- It reads a fixed, documented subset synchronously and returns JSON primitives
-- only.  It never retains Proposal/ProposalData/result userdata or event tables.
local M = {}

local MAX_ITEMS = 64
local MAX_SAFE_INTEGER = 9007199254740991
local MAX_ENTITY = 2147483647

local function fixed(code, field)
  if field ~= nil then
    return '{"schemaVersion":1,"code":"' .. code .. '","field":"' .. field .. '"}'
  end
  return '{"schemaVersion":1,"code":"' .. code .. '"}'
end

local function integer(value, minimum, maximum)
  return type(value) == "number" and value == value and value % 1 == 0
    and value >= minimum and value <= maximum
end

local function failure(code, field)
  if code == "bounds" then return fixed("bounds", field) end
  return fixed("unavailable", field)
end

-- Declared proposal vectors must be ordinary, short array tables.  Do not treat
-- an absent vector as empty: that would make an unsupported native shape appear
-- to be a harmless proposal.
local function boundedArray(value)
  if type(value) ~= "table" then return nil, "unavailable" end
  local count = #value
  if count > MAX_ITEMS then return nil, "bounds" end
  return count, nil
end

local function adoptOwner(owner, candidate)
  if not integer(candidate, 1, MAX_ENTITY) then return nil end
  if owner == 0 then return candidate end
  if owner == candidate then return owner end
  return nil
end

local function collectFacts(proposal, data, result, onField)
  -- This per-call scalar label is never exported unless a known field is
  -- unavailable or exceeds its bound. Exception text is never exported.
  local field = "street"; onField(field)
  local street = proposal.proposal
  if street == nil then return failure("unavailable", field) end
  field = "addedNodes"; onField(field)
  local addedNodes, code = boundedArray(street.addedNodes)
  if addedNodes == nil then return failure(code, field) end
  field = "addedSegments"; onField(field)
  local addedSegments, code = boundedArray(street.addedSegments)
  if addedSegments == nil then return failure(code, field) end
  field = "removedNodes"; onField(field)
  local removedNodes, code = boundedArray(street.removedNodes)
  if removedNodes == nil then return failure(code, field) end
  field = "removedSegments"; onField(field)
  local removedSegments, code = boundedArray(street.removedSegments)
  if removedSegments == nil then return failure(code, field) end
  field = "edgeObjects"; onField(field)
  local edgeObjects, code = boundedArray(street.edgeObjectsToAdd)
  if edgeObjects == nil then return failure(code, field) end
  field = "constructions"; onField(field)
  local constructions, code = boundedArray(proposal.toAdd)
  if constructions == nil then return failure(code, field) end
  field = "removals"; onField(field)
  local removals, code = boundedArray(proposal.toRemove)
  if removals == nil then return failure(code, field) end

  local resultCount = 0
  if result ~= nil then
    field = "resultCount"; onField(field)
    resultCount, code = boundedArray(result)
    if resultCount == nil then return failure(code, field) end
  end

  field = "cost"; onField(field)
  local cost = data.costs
  if not integer(cost, 0, MAX_SAFE_INTEGER) then return failure("unavailable", field) end
  field = "critical"; onField(field)
  local errorState = data.errorState
  if errorState == nil then return failure("unavailable", field) end
  local critical = errorState.critical
  if type(critical) ~= "boolean" then return failure("unavailable", field) end

  field = "ownerCompany"; onField(field)
  local ownerCompany = 0
  for index = 1, edgeObjects do
    ownerCompany = adoptOwner(ownerCompany, street.edgeObjectsToAdd[index].playerEntity)
    if ownerCompany == nil then return failure("unavailable", field) end
  end
  for index = 1, constructions do
    ownerCompany = adoptOwner(ownerCompany, proposal.toAdd[index].playerEntity)
    if ownerCompany == nil then return failure("unavailable", field) end
  end

  return '{"schemaVersion":1,"code":"readable","addedNodes":' .. tostring(addedNodes)
    .. ',"addedSegments":' .. tostring(addedSegments)
    .. ',"removedNodes":' .. tostring(removedNodes)
    .. ',"removedSegments":' .. tostring(removedSegments)
    .. ',"edgeObjects":' .. tostring(edgeObjects)
    .. ',"constructions":' .. tostring(constructions)
    .. ',"removals":' .. tostring(removals)
    .. ',"resultCount":' .. tostring(resultCount)
    .. ',"cost":' .. tostring(cost)
    .. ',"critical":' .. tostring(critical)
    .. ',"ownerCompany":' .. tostring(ownerCompany) .. '}'
end

function M.collect(proposal, data, result)
  local activeField = "street"
  local ok, facts = pcall(function()
    return collectFacts(proposal, data, result, function(field) activeField = field end)
  end)
  if not ok or type(facts) ~= "string" then return fixed("unavailable", activeField) end
  return facts
end

return M
