-- Local replay preflight. Read-only evidence gate for a copied capture.
-- It deliberately does not construct or submit a Proposal. Input must first
-- pass the strict copied-capture schema. This is not full checkpoint verification.
local M = {}
local MAX = 64
local REJECT, UNKNOWN = {}, {}
local function fail() error(REJECT, 0) end
local function unknown() error(UNKNOWN, 0) end
local function native(v) return type(v) == "table" or type(v) == "userdata" end
local function finite(v) return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge end
local function integer(v) return finite(v) and v == math.floor(v) and v >= -2147483648 and v <= 2147483647 end
local function nativeCode(v)
  if type(v) ~= "table" or not integer(v.nativeCode) then fail() end
  for key in pairs(v) do if key ~= "nativeCode" then fail() end end
  return v.nativeCode
end
local function array(v)
  if type(v) ~= "table" or #v > MAX then return false end
  for k in pairs(v) do if type(k) ~= "number" or k < 1 or k > #v or k ~= math.floor(k) then return false end end
  return true
end
local function equalVec(actual, copied)
  return native(actual) and array(copied) and #copied == 3 and finite(copied[1]) and finite(copied[2]) and finite(copied[3]) and actual.x == copied[1] and actual.y == copied[2] and actual.z == copied[3]
end
local function enum(api, group, name)
  local v = type(api) == "table" and api.type and api.type.enum and api.type.enum[group] and api.type.enum[group][name]
  if v == nil then fail() end
  return v
end
local function tryComponent(api, entity, kind)
  if not integer(entity) or entity < 0 or (entity == 0 and kind ~= "GAME_SPEED")
    or not api.engine or type(api.engine.getComponent) ~= "function" or not api.type or not api.type.ComponentType then fail() end
  local ok, value = pcall(api.engine.getComponent, entity, api.type.ComponentType[kind])
  if not ok then unknown() end
  return value
end
local function component(api, entity, kind)
  local value = tryComponent(api, entity, kind)
  if value == nil then fail() end
  return value
end
local function sameLane(api, actual, copied)
  if not native(actual) or type(copied) ~= "table" or actual.speed ~= copied.speed or actual.width ~= copied.width or actual.height ~= copied.height or actual.forward ~= copied.forward or actual.offset ~= copied.offset or not array(copied.transportModes) then return false end
  local count = 0
  for _, pair in ipairs(copied.transportModes) do
    if not array(pair) or #pair ~= 2 or type(pair[1]) ~= "string" or actual.transportModes[enum(api, "TransportMode", pair[1])] ~= pair[2] then return false end
    count = count + 1
  end
  local actualCount = 0; for _ in pairs(actual.transportModes) do actualCount = actualCount + 1 end
  return actualCount == count
end
local function sameLanes(api, actual, copied)
  if not native(actual) or not array(copied) or #actual ~= #copied then return false end
  for i = 1, #copied do if not sameLane(api, actual[i], copied[i]) then return false end end
  return true
end
local function samePairs(actual, copied, convert)
  if not native(actual) or not array(copied) or #actual ~= #copied then return false end
  for i = 1, #copied do
    local a, c = actual[i], copied[i]
    if not array(a) or not array(c) or #a ~= 2 or #c ~= 2 or a[1] ~= c[1] or a[2] ~= convert(c[2]) then return false end
  end
  return true
end
local function sameEdge(api, actual, copied)
  if not native(actual) or type(copied) ~= "table" then return false end
  if actual.type ~= enum(api, "BaseEdgeType", copied.type) or actual.typeIndex ~= copied.typeIndex or actual.roadDevelopmentLocked ~= copied.roadDevelopmentLocked or actual.node0 ~= copied.node0 or actual.node1 ~= copied.node1 or not equalVec(actual.position0, copied.position0) or not equalVec(actual.position1, copied.position1) or not equalVec(actual.tangent0, copied.tangent0) or not equalVec(actual.tangent1, copied.tangent1) or actual.distance ~= copied.distance or actual.roadType ~= enum(api, "RoadType", copied.roadType) or actual.roadTemplate ~= copied.roadTemplate or actual.roadStyle ~= copied.roadStyle then return false end
  return samePairs(actual.objects, copied.objects, function(name) return enum(api, "EdgeObjectType", name) end) and sameLanes(api, actual.laneConfigs, copied.laneConfigs) and sameLanes(api, actual.laneConfig, copied.laneConfig) and samePairs(actual.edgeDecorations, copied.edgeDecorations, function(v) return v end)
end
local function sameOptional(api, entity, kind, copied, fields)
  local actual = tryComponent(api, entity, kind)
  if copied == nil then return actual == nil end
  if actual == nil or type(copied) ~= "table" then return false end
  for name, check in pairs(fields) do if not check(actual[name], copied[name]) then return false end end
  return true
end
local function verify(capture, api, targetCompany)
  if type(capture) ~= "table" or capture.schemaVersion ~= 1 or capture.builderId ~= "streetTerminalBuilder" or not integer(targetCompany) or targetCompany <= 0 then fail() end
  if not api.engine or not api.engine.util or type(api.engine.util.getWorld) ~= "function" then fail() end
  local ok, world = pcall(api.engine.util.getWorld); if not ok then unknown() end
  local gameSpeed = component(api, world, "GAME_SPEED")
  if not native(gameSpeed) or gameSpeed.speedup ~= 0 then fail() end
  component(api, targetCompany, "PLAYER")
  local proposal, street = capture.proposal, capture.proposal and capture.proposal.street
  if type(proposal) ~= "table" or type(street) ~= "table" or not array(street.removedSegments) or #street.removedSegments == 0 or not array(street.removedNodes) then fail() end
  if not array(street.edgeObjectsToAdd) or #street.edgeObjectsToAdd ~= 1 or street.edgeObjectsToAdd[1].playerEntity ~= targetCompany then fail() end
  local seenSegments, seenNodes, proof = {}, {}, {removedSegments={}, removedNodes={}}
  for i, copied in ipairs(street.removedSegments) do
    if type(copied) ~= "table" or not integer(copied.entity) or copied.entity <= 0 or seenSegments[copied.entity] or type(copied.comp) ~= "table" then fail() end
    seenSegments[copied.entity] = true
    local edge = component(api, copied.entity, "BASE_EDGE")
    if not sameEdge(api, edge, copied.comp) then fail() end
    local streetEdge = component(api, copied.entity, "BASE_EDGE_STREET")
    if not sameOptional(api, copied.entity, "EMISSION_EMITTER", copied.emissionEmitter, {position=equalVec,radius=function(a,b)return a==b end,noisePower=function(a,b)return a==b end,pollutionPower=function(a,b)return a==b end}) or not sameOptional(api, copied.entity, "PLAYER_OWNED", copied.playerOwned, {player=function(a,b)return a==b end}) then fail() end
    -- The installed public enum namespace has no PrecedencePreference.  Only a
    -- separately captured numeric native code can be compared without guessing.
    if not native(streetEdge) or type(copied.streetEdge) ~= "table"
      or streetEdge.precedenceNode0 ~= nativeCode(copied.streetEdge.precedenceNode0)
      or streetEdge.precedenceNode1 ~= nativeCode(copied.streetEdge.precedenceNode1) then fail() end
    -- Values stay opaque native values; no numeric/string precedence inference.
    proof.removedSegments[i] = {entity=copied.entity, precedenceNode0=streetEdge.precedenceNode0, precedenceNode1=streetEdge.precedenceNode1}
  end
  for i, copied in ipairs(street.removedNodes) do
    if type(copied) ~= "table" or type(copied.comp) ~= "table" or not integer(copied.entity) or copied.entity <= 0 or seenNodes[copied.entity] then fail() end
    seenNodes[copied.entity] = true
    local node = component(api, copied.entity, "BASE_NODE")
    if not equalVec(node.position, copied.comp.position) then fail() end
    proof.removedNodes[i] = copied.entity
  end
  -- Node configuration changes must remain on the captured road's endpoints.
  -- Never use this narrow stop replay to edit an unrelated crossing.
  if not array(street.nodeConfigsToAdd) or not array(street.nodeConfigsToRemove) then fail() end
  local endpoints, additions, removals = {}, {}, {}
  for _, segment in ipairs(street.removedSegments) do
    endpoints[segment.comp.node0], endpoints[segment.comp.node1] = true, true
  end
  for _, config in ipairs(street.nodeConfigsToAdd) do
    if type(config) ~= "table" or not integer(config.entity) or config.entity <= 0
      or not endpoints[config.entity] or additions[config.entity] then fail() end
    additions[config.entity] = true
    component(api, config.entity, "BASE_NODE")
  end
  for _, entity in ipairs(street.nodeConfigsToRemove) do
    if not integer(entity) or entity <= 0 or not endpoints[entity] or removals[entity]
      or seenNodes[entity] then fail() end
    removals[entity] = true
    component(api, entity, "BASE_NODE")
    component(api, entity, "BASE_NODE_CONFIG")
  end
  -- The copied model id/resource identity and a future construction's semantics
  -- cannot be proved from a baseline removed edge.  This is only a read check.
  return {code="unregistered_preflight_checked", proof=proof, limitations={"symbolic_precedence_capture_unqualified_without_native_codes","new_stop_model_resource_unverified","no_execution_authorization"}}
end

function M.verify(capture, api, targetCompany)
  local ok, result = pcall(verify, capture, api, targetCompany)
  if ok then return result end
  if type(result) == "table" and rawequal(result, REJECT) then return {code="unregistered_preflight_rejected"} end
  -- Includes protected native getter errors and arbitrary foreign error values.
  return {code="unregistered_preflight_unknown"}
end

return M
