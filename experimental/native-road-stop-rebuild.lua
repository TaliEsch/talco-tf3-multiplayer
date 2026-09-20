-- EXPERIMENTAL / UNREGISTERED.  This module only rehydrates copied diagnostic
-- data into public Proposal records.  It never sends a command or otherwise
-- submits/mutates the world.  Callers must deliberately choose any later use.
local M = {}

local MAX = 64
local function fail() error("ROAD_STOP_REBUILD_UNQUALIFIED", 0) end
local function call0(record)
  if type(record) ~= "table" or type(record.new) ~= "function" then fail() end
  local ok, value = pcall(record.new)
  if not ok or value == nil then fail() end
  return value
end
local function call(record, ...)
  if type(record) ~= "table" or type(record.new) ~= "function" then fail() end
  local ok, value = pcall(record.new, ...)
  if not ok or value == nil then fail() end
  return value
end
local function finite(v) return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge end
local function integer(v) return finite(v) and v == math.floor(v) and v >= -2147483648 and v <= 2147483647 end
local function array(v)
  if type(v) ~= "table" or #v > MAX then return false end
  local count = 0
  for key in pairs(v) do
    count = count + 1
    if count > MAX or type(key) ~= "number" or key < 1 or key > #v or key ~= math.floor(key) then return false end
  end
  return count == #v
end
local function number(v) if not finite(v) then fail() end return v == 0 and 0 or v end
local function int(v) if not integer(v) then fail() end return v end
local function owner(v) v = int(v); if v <= 0 then fail() end; return v end
local function bool(v) if type(v) ~= "boolean" then fail() end return v end
local function string_(v) if type(v) ~= "string" or #v > 1024 or v:find("\0", 1, true) then fail() end return v end
local function enum(enums, group, name)
  local value = type(enums) == "table" and type(enums[group]) == "table" and enums[group][name]
  if value == nil then fail() end
  return value
end
local function named(enums, group, name, allowed)
  if type(name) ~= "string" or not allowed[name] then fail() end
  return enum(enums, group, name)
end
local function list(v, build)
  if not array(v) then fail() end
  local out = {}; for i = 1, #v do out[i] = build(v[i]) end; return out
end
local function vec3(types, value)
  if not array(value) or #value ~= 3 then fail() end
  return call(types.Vec3f, number(value[1]), number(value[2]), number(value[3]))
end
local function mat4(types, value)
  if not array(value) or #value ~= 16 then fail() end
  local cols = {}
  for column = 1, 4 do
    local i = (column - 1) * 4
    cols[column] = call(types.Vec4f, number(value[i + 1]), number(value[i + 2]), number(value[i + 3]), number(value[i + 4]))
  end
  return call(types.Mat4f, cols[1], cols[2], cols[3], cols[4])
end
local function map(v, build)
  if not array(v) then fail() end
  local out = {}
  for _, pair in ipairs(v) do
    if not array(pair) or #pair ~= 2 then fail() end
    local key = int(pair[1]); if out[key] ~= nil then fail() end
    out[key] = build(pair[2])
  end
  return out
end
local modes = { PERSON=true, CARGO=true, CAR=true, BUS=true, TRUCK=true, TRAM=true, ELECTRIC_TRAM=true, TRAIN=true, ELECTRIC_TRAIN=true, AIRCRAFT=true, SHIP=true, SMALL_AIRCRAFT=true, SMALL_SHIP=true, HELICOPTER=true, TRAM_TRACK=true, ELECTRIC_TRAM_TRACK=true }
local function lane(enums, v)
  if type(v) ~= "table" then fail() end
  local out = { speed=number(v.speed), width=number(v.width), height=number(v.height), forward=bool(v.forward), offset=number(v.offset), transportModes={} }
  if not array(v.transportModes) then fail() end
  for _, pair in ipairs(v.transportModes) do
    if not array(pair) or #pair ~= 2 then fail() end
    local key = named(enums, "TransportMode", pair[1], modes)
    if out.transportModes[key] ~= nil then fail() end
    out.transportModes[key] = bool(pair[2])
  end
  return out
end
local function edge(types, components, enums, v, initialized)
  if type(v) ~= "table" then fail() end
  -- Stock track_builder.tl writes SegmentAndEntity.new().comp directly.
  local out = initialized or call0(components.BaseEdge)
  out.type = named(enums, "BaseEdgeType", v.type, {NORMAL=true,BRIDGE=true,TUNNEL=true})
  out.typeIndex = int(v.typeIndex)
  out.objects = list(v.objects, function(pair)
    if not array(pair) or #pair ~= 2 then fail() end
    return {int(pair[1]), named(enums, "EdgeObjectType", pair[2], {STOP_LEFT=true,STOP_RIGHT=true,SIGNAL=true})}
  end)
  out.laneConfigs = list(v.laneConfigs, function(x) return lane(enums, x) end)
  out.roadDevelopmentLocked = bool(v.roadDevelopmentLocked)
  out.node0, out.node1 = int(v.node0), int(v.node1)
  out.position0, out.position1 = vec3(types, v.position0), vec3(types, v.position1)
  out.tangent0, out.tangent1 = vec3(types, v.tangent0), vec3(types, v.tangent1)
  out.laneConfig = list(v.laneConfig, function(x) return lane(enums, x) end)
  out.edgeDecorations = list(v.edgeDecorations, function(pair)
    if not array(pair) or #pair ~= 2 then fail() end; return {int(pair[1]), bool(pair[2])}
  end)
  out.distance = number(v.distance)
  out.roadType = named(enums, "RoadType", v.roadType, {STREET=true})
  out.roadTemplate, out.roadStyle = string_(v.roadTemplate), string_(v.roadStyle)
  return out
end
local function segment(types, components, enums, v)
  if type(v) ~= "table" or int(v.type) ~= 0 or type(v.streetEdge) ~= "table" then fail() end
  local out = call0(types.SegmentAndEntity)
  out.entity, out.comp, out.type = int(v.entity), edge(types, components, enums, v.comp, out.comp), 0
  local street = call0(components.BaseEdgeStreet)
  street.precedenceNode0 = named(enums, "PrecedencePreference", v.streetEdge.precedenceNode0, {YES=true,NO=true,AUTO=true})
  street.precedenceNode1 = named(enums, "PrecedencePreference", v.streetEdge.precedenceNode1, {YES=true,NO=true,AUTO=true})
  out.streetEdge = street
  -- Constructors may initialize optional components; absence must survive too.
  out.emissionEmitter, out.playerOwned = nil, nil
  if v.emissionEmitter ~= nil then
    local source = v.emissionEmitter; if type(source) ~= "table" then fail() end
    local emission = call0(components.EmissionEmitter)
    emission.position, emission.radius = vec3(types, source.position), number(source.radius)
    emission.noisePower, emission.pollutionPower = number(source.noisePower), number(source.pollutionPower)
    out.emissionEmitter = emission
  end
  if v.playerOwned ~= nil then
    if type(v.playerOwned) ~= "table" then fail() end
    local owned = call0(components.PlayerOwned); owned.player = owner(v.playerOwned.player); out.playerOwned = owned
  end
  return out
end
local function node(types, components, v)
  if type(v) ~= "table" or type(v.comp) ~= "table" then fail() end
  local out = call0(types.NodeAndEntity)
  -- Stock NodeAndEntity wrappers also initialize this component.
  local base = out.comp or call0(components.BaseNode)
  out.entity, base.position, out.comp = int(v.entity), vec3(types, v.comp.position), base
  return out
end
local function edgeObject(types, v)
  if type(v) ~= "table" or int(v.category) ~= 0 or type(v.modelInstance) ~= "table" then fail() end
  local model = v.modelInstance; local id = int(model.modelId); if id < 0 then fail() end
  -- ModelInstance and Proposal.EdgeObject have no public constructors in type.d.tl;
  -- these are their documented record fields, intentionally structural.
  return {resultEntity=int(v.resultEntity), category=0, modelInstance={modelId=id, transf0=mat4(types, model.transf0), transf=mat4(types, model.transf), transformator=int(model.transformator)}, playerEntity=owner(v.playerEntity), left=bool(v.left)}
end

local function rebuild(capture, types, components)
  -- Unregistered: this is data preparation only, never an execution path.
  if type(capture) ~= "table" or capture.schemaVersion ~= 1 or capture.builderId ~= "streetTerminalBuilder" then fail() end
  if type(types) ~= "table" or type(components) ~= "table" then fail() end
  local enums, proposalData = types.enum, capture.proposal
  if type(proposalData) ~= "table" or type(proposalData.street) ~= "table" then fail() end
  local s = proposalData.street
  if not array(proposalData.toAdd) or #proposalData.toAdd ~= 0 or not array(s.nodeConfigsToAdd) or #s.nodeConfigsToAdd ~= 0 or not array(s.nodeConfigsToRemove) or #s.nodeConfigsToRemove ~= 0 then fail() end
  local terrain = proposalData.terrain and proposalData.terrain.baseHeightMod
  if type(terrain) ~= "table" or int(terrain.width) ~= 0 or int(terrain.height) ~= 0 then fail() end
  local proposal = call0(types.Proposal)
  proposal.proposal = {
    addedNodes=list(s.addedNodes, function(v) return node(types, components, v) end),
    removedNodes=list(s.removedNodes, function(v) return node(types, components, v) end),
    addedSegments=list(s.addedSegments, function(v) return segment(types, components, enums, v) end),
    removedSegments=list(s.removedSegments, function(v) return segment(types, components, enums, v) end),
    edgeObjectsToAdd=list(s.edgeObjectsToAdd, function(v) return edgeObject(types, v) end),
    new2oldEdgeObjects=map(s.new2oldEdgeObjects, function(v) return list(v, int) end),
    old2newEdgeObjects=map(s.old2newEdgeObjects, function(v) return list(v, int) end),
    nodeConfigsToAdd={}, nodeConfigsToRemove={}
  }
  if #proposal.proposal.addedSegments == 0 or #proposal.proposal.removedSegments == 0 or #proposal.proposal.edgeObjectsToAdd ~= 1 then fail() end
  proposal.toRemove = list(proposalData.toRemove, int)
  proposal.old2new = map(proposalData.old2new, int)
  proposal.toAdd = {}
  proposal.terrain = {baseHeightMod=call(types.GridVec2f, int(terrain.x0), int(terrain.y0), 0, 0)}
  return {code="unregistered", proposal=proposal}
end

function M.rebuild(capture, types, components)
  -- Setter/getter exceptions can contain native internals. Export no raw error.
  local ok, result = pcall(rebuild, capture, types, components)
  if not ok then fail() end
  return result
end

return M
