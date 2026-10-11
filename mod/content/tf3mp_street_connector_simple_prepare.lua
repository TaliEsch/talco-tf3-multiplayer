-- Prepare one bounded public SimpleStreetProposal for a three-arm street junction.
-- This module never submits the command. Its dependency snapshot is for the
-- execution guard to compare again immediately before sending.
local M = {}
local REJECT = {}
local function fail() error(REJECT, 0) end
local function native(v) return type(v) == "table" or type(v) == "userdata" end
local function finite(v) return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge end
local function integer(v) return finite(v) and v == math.floor(v) and v > -2147483648 and v < 2147483648 end
local function positive(v) return integer(v) and v > 0 end
local function exact(v, keys)
  if type(v) ~= "table" or getmetatable(v) ~= nil then return false end
  local count = 0
  for k in pairs(v) do if not keys[k] then return false end; count = count + 1 end
  local expected = 0; for _ in pairs(keys) do expected = expected + 1 end
  return count == expected
end
local function array(v, n)
  if type(v) ~= "table" or getmetatable(v) ~= nil or #v ~= n then return false end
  local count = 0
  for k in pairs(v) do if not integer(k) or k < 1 or k > n then return false end; count = count + 1 end
  return count == n
end
local function nativeList(v, limit)
  return native(v) and #v <= limit
end
local function vec(v)
  if not array(v, 3) then return false end
  for i = 1, 3 do if not finite(v[i]) or math.abs(v[i]) > 1000000 then return false end end
  return true
end
local function resource(v, suffix)
  return type(v) == "string" and #v > #suffix + 3 and #v <= 256
    and v:sub(1, 25) == "::/infrastructure/street/"
    and v:sub(-#suffix) == suffix and not v:find("..", 1, true)
    and not v:find("//", 4, true) and not v:find("\\", 1, true)
    and v:sub(4):match("^[A-Za-z0-9_./-]+$") ~= nil
end
local function call(record, ...)
  if not native(record) or type(record.new) ~= "function" then fail() end
  local value = record.new(...)
  if not native(value) then fail() end
  return value
end
local function xyz(api, v)
  return call(api.type.Vec3f, v[1], v[2], v[3])
end
local function position(v)
  if not native(v) then fail() end
  if finite(v.x) and finite(v.y) and finite(v.z) then return {v.x, v.y, v.z} end
  if vec(v) then return {v[1], v[2], v[3]} end
  fail()
end
local function same(a, b)
  for i = 1, 3 do if a[i] ~= b[i] then return false end end
  return true
end
local function distanceSquared(a, b)
  local sum = 0
  for i = 1, 3 do local d = a[i] - b[i]; sum = sum + d * d end
  return sum
end
local function revision(api, id)
  local r = api.engine.getRevision(id)
  if not native(r) or not native(r.num) then fail() end
  local num = {}
  for i = 1, 3 do if not integer(r.num[i]) or r.num[i] < 0 then fail() end; num[i] = r.num[i] end
  return {entity=id, num=num}
end
local function sameLanes(actual, expected)
  if not native(actual) or not native(expected) or #actual ~= #expected or #actual < 1 or #actual > 16 then return false end
  for i, lane in ipairs(actual) do
    local source = expected[i]
    if not native(lane) or not native(source) then return false end
    for _, key in ipairs({"speed", "width", "height", "forward", "offset"}) do
      if lane[key] ~= source[key] then return false end
    end
    if not native(lane.transportModes) or not native(source.transportModes) then return false end
    for key, enabled in pairs(lane.transportModes) do if source.transportModes[key] ~= enabled then return false end end
    for key, enabled in pairs(source.transportModes) do if lane.transportModes[key] ~= enabled then return false end end
  end
  return true
end
local function defaultNodeConfig(config, auto)
  if config == nil then return true end
  if not native(config) or config.userModifiedLaneConnections == true
    or config.userModifiedTrafficLightStates == true or config.doubleSlipSwitch == true
    or config.trafficLightPreference ~= auto or not native(config.trafficLightConfig)
    or config.trafficLightConfig.trafficLightType ~= -1
    or not nativeList(config.trafficLightConfig.states, 0)
    or not native(config.laneConnections) or not native(config.crosswalks) then return false end
  for _, pair in ipairs(config.laneConnections) do
    if not native(pair) or pair.withRoad ~= true or pair.withTram ~= false
      or not positive(pair.segment0) or not positive(pair.segment1)
      or pair.segment0 == pair.segment1 then return false end
  end
  if config.userModifiedLaneConnections ~= nil and type(config.userModifiedLaneConnections) ~= "boolean" then return false end
  if config.userModifiedTrafficLightStates ~= nil and type(config.userModifiedTrafficLightStates) ~= "boolean" then return false end
  if config.doubleSlipSwitch ~= nil and type(config.doubleSlipSwitch) ~= "boolean" then return false end
  return true
end
local function incident(api, id, progress)
  progress.stage = "map_call"
  local map = api.engine.system.streetSystem.getNode2SegmentMap()
  progress.stage = "map_shape"
  if not native(map) then fail() end
  progress.stage = "row_shape"
  local list = map[id]
  if type(list) ~= "table" or #list > 16 then fail() end
  local out, seen = {}, {}
  local count = 0
  progress.stage = "row_keys"
  for k in pairs(list) do
    count = count + 1
    if not integer(k) or k < 1 or k > #list then fail() end
  end
  if count ~= #list then fail() end
  for _, edge in ipairs(list) do
    progress.stage = "edge_id"
    if not positive(edge) or seen[edge] or #out >= 16 then fail() end
    progress.stage = "edge_exists"
    if api.engine.entityExists(edge) ~= true then fail() end
    seen[edge] = true; out[#out + 1] = edge
  end
  table.sort(out)
  return out
end
local function fingerprint(input)
  local parts = {input.schemaVersion, input.companyEntity, input.removedNode,
    input.removedEdges[1], input.removedEdges[2]}
  for _, node in ipairs(input.nodes) do
    parts[#parts + 1] = node.entity
    for _, v in ipairs(node.position) do parts[#parts + 1] = string.format("%.17g", v) end
  end
  for _, edge in ipairs(input.segments) do
    for _, key in ipairs({"entity", "node0", "node1"}) do parts[#parts + 1] = edge[key] end
    for _, key in ipairs({"tangent0", "tangent1"}) do
      for _, v in ipairs(edge[key]) do parts[#parts + 1] = string.format("%.17g", v) end
    end
    parts[#parts + 1], parts[#parts + 2] = edge.roadTemplate, edge.roadStyle
  end
  return table.concat(parts, "|")
end
local function prepare(api, input, progress, inspectOnly)
  progress.stage = "input"
  if not native(api) or not native(api.type) or not native(api.engine) or not native(api.cmd)
    or not exact(input, {schemaVersion=true, companyEntity=true, nodes=true, segments=true, removedNode=true, removedEdges=true})
    or input.schemaVersion ~= 1 or not positive(input.companyEntity) or not positive(input.removedNode)
    or not array(input.nodes, 2) or not array(input.segments, 4) or not array(input.removedEdges, 2) then fail() end
  local nodes = input.nodes
  for i, id in ipairs({-1, -5}) do
    if not exact(nodes[i], {entity=true, position=true}) or nodes[i].entity ~= id or not vec(nodes[i].position) then fail() end
  end
  local segments = input.segments
  for i, id in ipairs({-2, -4, -6, -7}) do
    local s = segments[i]
    if not exact(s, {entity=true, node0=true, node1=true, tangent0=true, tangent1=true, roadTemplate=true, roadStyle=true})
      or s.entity ~= id or not integer(s.node0) or not integer(s.node1) or s.node0 == s.node1
      or not vec(s.tangent0) or not vec(s.tangent1)
      or not resource(s.roadTemplate, ".street_template") or not resource(s.roadStyle, ".street") then fail() end
  end
  local oldB, oldC = input.removedEdges[1], input.removedEdges[2]
  if not positive(oldB) or not positive(oldC) or oldB == oldC or oldB == input.removedNode or oldC == input.removedNode then fail() end
  local A, B, C = segments[1].node0, segments[2].node1, segments[3].node0
  if not positive(A) or not positive(B) or not positive(C) or A == B or A == C or B == C
    or A == input.removedNode or B == input.removedNode or C == input.removedNode
    or input.companyEntity == input.removedNode or input.companyEntity == A
    or input.companyEntity == B or input.companyEntity == C
    or oldB == A or oldB == B or oldB == C or oldC == A or oldC == B or oldC == C
    or oldB == input.companyEntity or oldC == input.companyEntity
    or segments[1].node1 ~= -1 or segments[2].node0 ~= -1
    or segments[3].node1 ~= -5 or segments[4].node0 ~= -5 or segments[4].node1 ~= -1 then fail() end
  for _, spec in ipairs(segments) do
    local zero = {0, 0, 0}
    if distanceSquared(spec.tangent0, zero) < 0.000001 or distanceSquared(spec.tangent1, zero) < 0.000001 then fail() end
  end

  progress.stage = "component_types"
  local t = api.type.ComponentType
  if not native(t) or t.PLAYER == nil or t.GAME_SPEED == nil or t.BASE_EDGE == nil
    or t.BASE_EDGE_STREET == nil or t.BASE_NODE == nil or t.PLAYER_OWNED == nil
    or t.BASE_NODE_CONFIG == nil then fail() end
  local engine = api.engine
  local ids = {input.removedNode, A, B, C, oldB, oldC}
  progress.stage = "entities"
  if engine.entityExists(input.companyEntity) ~= true then fail() end
  for _, id in ipairs(ids) do if engine.entityExists(id) ~= true then fail() end end
  progress.stage = "company_component"
  if not native(engine.getComponent(input.companyEntity, t.PLAYER)) then fail() end
  progress.stage = "game_speed"
  local world = engine.util.getWorld()
  local speed = engine.getComponent(world, t.GAME_SPEED)
  if not native(speed) or (speed.speedup ~= 0 and (not inspectOnly
    or speed.speedup ~= 1 and speed.speedup ~= 2 and speed.speedup ~= 4)) then fail() end
  local oldEdges = {}
  for i, id in ipairs({oldB, oldC}) do
    progress.stage = "old_edge_shape"
    local edge = engine.getComponent(id, t.BASE_EDGE)
    local street = engine.getComponent(id, t.BASE_EDGE_STREET)
    if not native(edge) or not native(street) or not nativeList(edge.objects, 0)
      or not nativeList(edge.edgeDecorations, 0) or edge.roadDevelopmentLocked ~= false
      or edge.typeIndex ~= -1 or edge.laneConfig ~= nil
      or edge.node0 ~= (i == 1 and input.removedNode or C)
      or edge.node1 ~= (i == 1 and B or input.removedNode) then fail() end
    progress.stage = "old_edge_emission"
    if t.EMISSION_EMITTER == nil or engine.getComponent(id, t.EMISSION_EMITTER) ~= nil then fail() end
    -- This recipe replaces the two public approaches; only the new spur is
    -- company-owned. An owned approach would require a different recipe.
    progress.stage = "old_edge_owner"
    if engine.getComponent(id, t.PLAYER_OWNED) ~= nil then fail() end
    oldEdges[i] = {edge=edge, street=street}
  end
  progress.stage = "precedence"
  if oldEdges[1].street.precedenceNode0 == nil or oldEdges[1].street.precedenceNode1 == nil
    or oldEdges[1].street.precedenceNode0 ~= oldEdges[1].street.precedenceNode1
    or oldEdges[1].street.precedenceNode0 ~= oldEdges[2].street.precedenceNode0
    or oldEdges[1].street.precedenceNode0 ~= oldEdges[2].street.precedenceNode1 then fail() end
  progress.stage = "node_components"
  local oldNode = engine.getComponent(input.removedNode, t.BASE_NODE)
  if not native(oldNode) or not native(oldNode.position) then fail() end
  local currentPositions = {}
  for _, id in ipairs({A, B, C}) do
    local n = engine.getComponent(id, t.BASE_NODE)
    if not native(n) then fail() end
    currentPositions[id] = position(n.position)
  end
  local oldPosition = position(oldNode.position)
  progress.stage = "geometry"
  for _, node in ipairs(nodes) do
    if distanceSquared(node.position, oldPosition) > 300 * 300 then fail() end
  end
  for _, spec in ipairs(segments) do
    if distanceSquared(spec.tangent0, {0, 0, 0}) < 0.000001
      or distanceSquared(spec.tangent1, {0, 0, 0}) < 0.000001
      or distanceSquared(spec.tangent0, {0, 0, 0}) > 300 * 300
      or distanceSquared(spec.tangent1, {0, 0, 0}) > 300 * 300 then fail() end
  end
  local expectedPositions = {
    position(oldEdges[1].edge.position0), position(oldEdges[1].edge.position1),
    position(oldEdges[2].edge.position0), position(oldEdges[2].edge.position1)
  }
  if not same(expectedPositions[1], oldPosition) or not same(expectedPositions[2], currentPositions[B])
    or not same(expectedPositions[3], currentPositions[C]) or not same(expectedPositions[4], oldPosition) then fail() end
  progress.stage = "traffic_enum"
  local configAuto = api.type.enum and api.type.enum.TrafficLightPreference
    and api.type.enum.TrafficLightPreference.AUTO
  if configAuto == nil then fail() end
  progress.stage = "node_config"
  for _, id in ipairs({input.removedNode, A, B, C}) do
    if not defaultNodeConfig(engine.getComponent(id, t.BASE_NODE_CONFIG), configAuto) then fail() end
  end
  progress.stage = "topology"
  local incidents = {}
  for _, id in ipairs({input.removedNode, A, B, C}) do incidents[#incidents + 1] = {node=id, edges=incident(api, id, progress)} end
  if #incidents[1].edges ~= 2 or incidents[1].edges[1] ~= math.min(oldB, oldC)
    or incidents[1].edges[2] ~= math.max(oldB, oldC) then fail() end
  for _, pair in ipairs({{B, oldB}, {C, oldC}}) do
    local list = pair[1] == B and incidents[3].edges or incidents[4].edges
    local found = false; for _, id in ipairs(list) do if id == pair[2] then found = true end end
    if not found then fail() end
  end
  -- This measured recipe has one retained spur at A and one continuing
  -- street beyond each replaced public approach at B and C.
  progress.stage = "node_config_topology"
  if #incidents[2].edges ~= 1 or #incidents[3].edges ~= 2 or #incidents[4].edges ~= 2 then fail() end
  local continuingB = incidents[3].edges[1] == oldB and incidents[3].edges[2] or incidents[3].edges[1]
  local continuingC = incidents[4].edges[1] == oldC and incidents[4].edges[2] or incidents[4].edges[1]
  progress.stage = "template_bindings"
  local rep = api.res and api.res.streetTemplateRep
  local enums = api.type.enum
  if not native(rep) or not native(enums) or not native(enums.BaseEdgeType)
    or not native(enums.RoadType) or enums.BaseEdgeType.NORMAL == nil or enums.RoadType.STREET == nil then fail() end
  local templates = {}
  progress.stage = "source_streets"
  for _, i in ipairs({2, 3, 4}) do
    local source = oldEdges[i == 2 and 1 or 2].edge
    if segments[i].roadTemplate ~= source.roadTemplate or segments[i].roadStyle ~= source.roadStyle then fail() end
  end
  local spurMatched = false
  local retainedSpur, retainedEdge
  local function matchesSpur(edge, pref, owner, id)
    progress.stage = "spur_edge"
    if not native(edge) then return false end
    progress.stage = "street"
    if not native(pref) then return false end
    progress.stage = "owner_type"
    if not native(owner) then return false end
    progress.stage = "owner"
    if owner.player ~= input.companyEntity then return false end
    progress.stage = "spur_topology"
    if not positive(edge.node0) or not positive(edge.node1) or edge.node0 == edge.node1
      or edge.node0 ~= A and edge.node1 ~= A then return false end
    progress.stage = "objects"
    if not nativeList(edge.objects, 0) then return false end
    progress.stage = "decorations"
    if not nativeList(edge.edgeDecorations, 0) then return false end
    progress.stage = "type_index"
    if edge.typeIndex ~= -1 then return false end
    progress.stage = "lane_config"
    if edge.laneConfig ~= nil then return false end
    progress.stage = "development_lock"
    if type(edge.roadDevelopmentLocked) ~= "boolean" then return false end
    progress.stage = "emitter"
    if engine.getComponent(id, t.EMISSION_EMITTER) ~= nil then return false end
    progress.stage = "template"
    if type(edge.roadTemplate) ~= "string" or #edge.roadTemplate == 0 or #edge.roadTemplate > 256 then return false end
    progress.stage = "style"
    if type(edge.roadStyle) ~= "string" or #edge.roadStyle == 0 or #edge.roadStyle > 256 then return false end
    progress.stage = "precedence0"
    if pref.precedenceNode0 == nil then return false end
    progress.stage = "precedence1"
    if pref.precedenceNode1 == nil then return false end
    return true
  end
  local ownedCount = 0
  for _, id in ipairs(incidents[2].edges) do
    local edge = engine.getComponent(id, t.BASE_EDGE)
    local pref = engine.getComponent(id, t.BASE_EDGE_STREET)
    local owner = engine.getComponent(id, t.PLAYER_OWNED)
    if native(owner) and owner.player == input.companyEntity then ownedCount = ownedCount + 1 end
    if matchesSpur(edge, pref, owner, id) then
      spurMatched = true
      retainedEdge = edge
      retainedSpur = {entity=id, node0=edge.node0, node1=edge.node1,
        roadDevelopmentLocked=edge.roadDevelopmentLocked,
        roadTemplate=edge.roadTemplate, roadStyle=edge.roadStyle,
        precedenceNode0=pref.precedenceNode0, precedenceNode1=pref.precedenceNode1}
    end
  end
  if ownedCount > 1 then progress.stage = "spur_unique" end
  if ownedCount ~= 1 then fail() end
  if not spurMatched then fail() end
  for i, s in ipairs(segments) do
    progress.stage = "template_resource"
    local templateId = rep.find(s.roadTemplate)
    if not integer(templateId) or templateId < 0 then fail() end
    local template = rep.get(templateId)
    if not native(template) or template.streetStyle ~= s.roadStyle or template.roadType ~= enums.RoadType.STREET
      or not native(template.laneConfigs) or #template.laneConfigs == 0 or #template.laneConfigs > 16
      or not nativeList(template.defaultEdgeDecorations, 0) then fail() end
    templates[i] = template
  end
  progress.stage = "template_lanes"
  for i, source in ipairs(oldEdges) do
    local template = templates[i == 1 and 2 or 3]
    if source.edge.type ~= enums.BaseEdgeType.NORMAL or source.edge.roadType ~= enums.RoadType.STREET
      or not sameLanes(source.edge.laneConfigs, template.laneConfigs) then fail() end
  end
  progress.stage = "spur_resource"
  local retainedTemplateId = rep.find(retainedSpur.roadTemplate)
  if not integer(retainedTemplateId) or retainedTemplateId < 0 then fail() end
  local retainedTemplate = rep.get(retainedTemplateId)
  if not native(retainedTemplate) or retainedTemplate.streetStyle ~= retainedSpur.roadStyle
    or retainedTemplate.roadType ~= enums.RoadType.STREET
    or not native(retainedTemplate.laneConfigs) or #retainedTemplate.laneConfigs == 0
    or #retainedTemplate.laneConfigs > 16 then fail() end
  progress.stage = "spur_lanes"
  if retainedEdge.type ~= enums.BaseEdgeType.NORMAL or retainedEdge.roadType ~= enums.RoadType.STREET
    or not sameLanes(retainedEdge.laneConfigs, retainedTemplate.laneConfigs) then fail() end
  progress.stage = "node_config_lanes"
  for _, template in ipairs(templates) do if #template.laneConfigs < 3 then fail() end end
  if #retainedTemplate.laneConfigs < 3 then fail() end
  for _, role in ipairs({{B, continuingB}, {C, continuingC}}) do
    local edge = engine.getComponent(role[2], t.BASE_EDGE)
    local street = engine.getComponent(role[2], t.BASE_EDGE_STREET)
    if not native(edge) or not native(street)
      or edge.node0 ~= role[1] and edge.node1 ~= role[1]
      or edge.type ~= enums.BaseEdgeType.NORMAL or edge.roadType ~= enums.RoadType.STREET
      or not native(edge.laneConfigs) or #edge.laneConfigs < 3 or #edge.laneConfigs > 16 then fail() end
  end
  progress.stage = "dependencies"
  local dependencies = {revisions={}, incidents=incidents, fingerprint=fingerprint(input), spur=retainedSpur}
  local seen = {}
  for _, id in ipairs(ids) do
    if not seen[id] then dependencies.revisions[#dependencies.revisions + 1] = revision(api, id); seen[id] = true end
  end
  for _, node in ipairs(incidents) do
    for _, id in ipairs(node.edges) do
      if not seen[id] then dependencies.revisions[#dependencies.revisions + 1] = revision(api, id); seen[id] = true end
    end
  end
  if inspectOnly then return {code="inspected", companyEntity=input.companyEntity,
    removedNode=input.removedNode, removedEdges={oldB, oldC}, dependencies=dependencies} end
  progress.stage = "simple_new"
  local simple = call(api.type.SimpleProposal)
  progress.stage = "street_new"
  local street = call(api.type.SimpleStreetProposal)
  local nodesToAdd, edgesToAdd = {}, {}
  progress.stage = "street_remove_lists"
  street.nodesToRemove, street.edgesToRemove = {input.removedNode}, {oldB, oldC}
  street.edgeObjectsToAdd, street.edgeObjectsToRemove = {}, {}
  street.node2rcType = {}
  -- The observed StreetProposal replaces endpoint configs as well as edges.
  -- All five new configs use the same native defaults and road lane pair.
  local function pair(a, b)
    return {segment0=a, lane0=1, segment1=b, lane1=2, withRoad=true, withTram=false}
  end
  local configSpecs = {
    {A, {-2, retainedSpur.entity}, {pair(-2, retainedSpur.entity), pair(retainedSpur.entity, -2)}},
    {-1, {-2}, {pair(-7, -2), pair(-2, -7), pair(-7, -4),
      pair(-2, -4), pair(-4, -7), pair(-4, -2)}},
    {B, {}, {pair(-4, continuingB), pair(continuingB, -4)}},
    {-5, {}, {pair(-7, -6), pair(-6, -7)}},
    {C, {}, {pair(-6, continuingC), pair(continuingC, -6)}}
  }
  -- Generate unapplied native lane rows. Keep their proposals alive through
  -- command construction, since the rows may be backed by those proposals.
  local generated, lanePairs = {}, {}
  progress.stage = "lane_generator_available"
  local generator = api.engine.util.proposal
  progress.stage = "lane_generator_record"
  if not native(generator) then fail() end
  progress.stage = "lane_generator_callable"
  local replaceSegment = generator.replaceSegment
  if replaceSegment == nil then fail() end
  for generation = 1, 4 do
    progress.stage = "lane_generator_" .. generation
    local value = replaceSegment(oldB)
    if not native(value) or not native(value.proposal) then fail() end
    generated[generation] = value
    local s = value.proposal
    progress.stage = "lane_generator_shape_" .. generation
    for _, key in ipairs({"addedNodes", "removedNodes", "edgeObjectsToAdd"}) do
      if not nativeList(s[key], 0) or #s[key] ~= 0 then fail() end
    end
    if not nativeList(s.addedSegments, 1) or #s.addedSegments ~= 1
      or not nativeList(s.removedSegments, 1) or #s.removedSegments ~= 1
      or not nativeList(s.nodeConfigsToAdd, 2) or #s.nodeConfigsToAdd ~= 2
      or not nativeList(s.nodeConfigsToRemove, 2) or #s.nodeConfigsToRemove ~= 2
      or s.addedSegments[1].entity ~= -1 or s.removedSegments[1].entity ~= oldB then fail() end
    local byEntity, removed = {}, {}
    for _, id in ipairs(s.nodeConfigsToRemove) do
      if (id ~= input.removedNode and id ~= B) or removed[id] then fail() end
      removed[id] = true
    end
    for _, config in ipairs(s.nodeConfigsToAdd) do
      if not native(config) or not removed[config.entity] or byEntity[config.entity]
        or not native(config.comp) or not nativeList(config.comp.laneConnections, 2)
        or #config.comp.laneConnections ~= 2 then fail() end
      byEntity[config.entity] = config
    end
    for _, id in ipairs({input.removedNode, B}) do
      local config = byEntity[id]
      if not config then fail() end
      local rows = config.comp.laneConnections
      local other = id == input.removedNode and oldC or continuingB
      for _, row in ipairs(rows) do
        if not native(row) or row.lane0 ~= 1 or row.lane1 ~= 2
          or row.withRoad ~= true or row.withTram ~= false
          or not ((row.segment0 == -1 and row.segment1 == other)
            or (row.segment0 == other and row.segment1 == -1)) then fail() end
      end
      if rows[1].segment0 ~= rows[2].segment1 or rows[1].segment1 ~= rows[2].segment0 then fail() end
      lanePairs[#lanePairs + 1] = {rows[1], rows[2]}
    end
  end
  local nextPair = 1
  for configIndex, spec in ipairs(configSpecs) do
    local expected, nativeRows = spec[3], {}
    for offset = 1, #expected, 2 do
      local pairRows = lanePairs[nextPair]
      nextPair = nextPair + 1
      if not pairRows then fail() end
      for side = 1, 2 do
        local row, target = pairRows[side], expected[offset + side - 1]
        progress.stage = "config_" .. configIndex .. "_lane_remap_" .. (offset + side - 1)
        row.segment0 = target.segment0
        row.segment1 = target.segment1
        for _, field in ipairs({"segment0", "lane0", "segment1", "lane1", "withRoad", "withTram"}) do
          if row[field] ~= target[field] then fail() end
        end
        nativeRows[offset + side - 1] = row
      end
    end
    spec.nativeRows = nativeRows
  end
  if nextPair ~= 8 then fail() end
  local configsToAdd = {}
  for i, spec in ipairs(configSpecs) do
    local stage = "config_" .. i .. "_"
    progress.stage = stage .. "new"
    local config = call(api.type.BaseNodeLaneConnectionAndEntity)
    progress.stage = stage .. "comp_read"
    if not native(config.comp) or config.comp.userModifiedLaneConnections ~= nil then fail() end
    local comp = config.comp
    progress.stage = stage .. "lights_new"
    local lights = call(api.type.TrafficLightConfig)
    progress.stage = stage .. "crosswalks"
    comp.crosswalks = spec[2]
    progress.stage = stage .. "lane_connections"
    comp.laneConnections = spec.nativeRows
    progress.stage = stage .. "lane_readback"
    local actual = comp.laneConnections
    if not nativeList(actual, 6) or #actual ~= #spec[3] then fail() end
    for j, expected in ipairs(spec[3]) do
      local row = actual[j]
      if not native(row) then fail() end
      for _, field in ipairs({"segment0", "lane0", "segment1", "lane1", "withRoad", "withTram"}) do
        if row[field] ~= expected[field] then fail() end
      end
    end
    progress.stage = stage .. "double_slip"
    comp.doubleSlipSwitch = false
    progress.stage = stage .. "light_preference"
    comp.trafficLightPreference = configAuto
    progress.stage = stage .. "light_states"
    lights.states = {}
    progress.stage = stage .. "light_type"
    lights.trafficLightType = -1
    progress.stage = stage .. "lights_assign"
    comp.trafficLightConfig = lights
    progress.stage = stage .. "modified_states"
    comp.userModifiedTrafficLightStates = false
    progress.stage = stage .. "entity"
    config.entity = spec[1]
    progress.stage = stage .. "comp_assign"
    config.comp = comp
    configsToAdd[i] = config
  end
  progress.stage = "node_config_assign"
  street.nodeConfigsToAdd, street.nodeConfigsToRemove = configsToAdd, {A, B, C}
  if not nativeList(street.nodeConfigsToAdd, 5) or #street.nodeConfigsToAdd ~= 5
    or not nativeList(street.nodeConfigsToRemove, 3) or #street.nodeConfigsToRemove ~= 3 then fail() end
  for i, spec in ipairs(nodes) do
    progress.stage = "node_new"
    local node = call(api.type.NodeAndEntity)
    progress.stage = "node_entity"
    node.entity = spec.entity
    progress.stage = "node_component"
    node.comp = node.comp or call(api.engine.Component.BaseNode)
    progress.stage = "node_position"
    node.comp.position = xyz(api, spec.position)
    nodesToAdd[i] = node
  end
  for i, spec in ipairs(segments) do
    progress.stage = "segment_new"
    local segment = call(api.type.SegmentAndEntity)
    progress.stage = "segment_component"
    local edge = segment.comp or call(api.engine.Component.BaseEdge)
    progress.stage = "segment_identity"
    segment.entity, segment.type = spec.entity, 0
    progress.stage = "edge_type"
    edge.type, edge.typeIndex = enums.BaseEdgeType.NORMAL, -1
    progress.stage = "edge_lists"
    edge.objects, edge.edgeDecorations = {}, {}
    progress.stage = "edge_lanes"
    edge.laneConfigs = templates[i].laneConfigs
    progress.stage = "edge_lock"
    edge.roadDevelopmentLocked = false
    progress.stage = "edge_nodes"
    edge.node0, edge.node1 = spec.node0, spec.node1
    local p0 = spec.node0 == -1 and nodes[1].position or spec.node0 == -5 and nodes[2].position or currentPositions[spec.node0]
    local p1 = spec.node1 == -1 and nodes[1].position or spec.node1 == -5 and nodes[2].position or currentPositions[spec.node1]
    progress.stage = "edge_positions"
    edge.position0, edge.position1 = xyz(api, p0), xyz(api, p1)
    progress.stage = "edge_tangents"
    edge.tangent0, edge.tangent1 = xyz(api, spec.tangent0), xyz(api, spec.tangent1)
    progress.stage = "edge_distance_type"
    edge.distance, edge.roadType = 0, enums.RoadType.STREET
    progress.stage = "edge_resource"
    edge.roadTemplate, edge.roadStyle = spec.roadTemplate, spec.roadStyle
    progress.stage = "segment_component_assign"
    segment.comp = edge
    progress.stage = "street_component"
    local precedence = segment.streetEdge or call(api.engine.Component.BaseEdgeStreet)
    progress.stage = "street_precedence"
    precedence.precedenceNode0 = oldEdges[1].street.precedenceNode0
    precedence.precedenceNode1 = oldEdges[1].street.precedenceNode0
    progress.stage = "street_component_assign"
    segment.streetEdge = precedence
    progress.stage = "optional_clear"
    segment.emissionEmitter, segment.playerOwned = nil, nil
    if i == 1 then
      -- Borrow the freshly validated native component without modifying it.
      -- No PlayerOwned constructor binding has been established in TF3.
      progress.stage = "owner_source"
      local owner = engine.getComponent(retainedSpur.entity, t.PLAYER_OWNED)
      if not native(owner) or owner.player ~= input.companyEntity then fail() end
      progress.stage = "owner_assign"
      segment.playerOwned = owner
    end
    edgesToAdd[i] = segment
  end
  progress.stage = "street_add_lists"
  street.nodesToAdd, street.edgesToAdd = nodesToAdd, edgesToAdd
  progress.stage = "street_add_readback"
  if not nativeList(street.nodesToAdd, 2) or #street.nodesToAdd ~= 2
    or not nativeList(street.edgesToAdd, 4) or #street.edgesToAdd ~= 4 then fail() end
  for i, spec in ipairs(nodes) do if street.nodesToAdd[i].entity ~= spec.entity then fail() end end
  for i, spec in ipairs(segments) do if street.edgesToAdd[i].entity ~= spec.entity then fail() end end
  progress.stage = "street_proposal_assign"
  simple.streetProposal = street
  progress.stage = "context_new"
  local context = call(api.type.Context)
  progress.stage = "context_player"
  context.player = input.companyEntity
  progress.stage = "command"
  local command = api.cmd.makeWorldBuildProposalCmd(simple, context, false, true, false)
  if command == nil or #generated ~= 4 then fail() end
  return {code="prepared", command=command, companyEntity=input.companyEntity,
    removedNode=input.removedNode, removedEdges={oldB, oldC}, dependencies=dependencies,
    limitations={"not_sent", "not_engine_verified", "dependency_recheck_required"}}
end

local function revalidate(api, input, dependencies, progress, requireHeld)
  progress.stage = "dependencies"
  if not native(api) or not native(api.engine) or type(input) ~= "table"
    or not native(dependencies) or type(dependencies.fingerprint) ~= "string"
    or not array(input.nodes, 2) or not array(input.segments, 4)
    or not array(input.removedEdges, 2) or fingerprint(input) ~= dependencies.fingerprint
    or not native(dependencies.spur) or not positive(dependencies.spur.entity)
    or not positive(dependencies.spur.node0) or not positive(dependencies.spur.node1)
    or type(dependencies.spur.roadDevelopmentLocked) ~= "boolean"
    or type(dependencies.spur.roadTemplate) ~= "string" or #dependencies.spur.roadTemplate == 0
    or #dependencies.spur.roadTemplate > 256
    or type(dependencies.spur.roadStyle) ~= "string" or #dependencies.spur.roadStyle == 0
    or #dependencies.spur.roadStyle > 256
    or dependencies.spur.precedenceNode0 == nil or dependencies.spur.precedenceNode1 == nil
    or type(dependencies.revisions) ~= "table" or #dependencies.revisions < 7
    or #dependencies.revisions > 64 or type(dependencies.incidents) ~= "table"
    or #dependencies.incidents ~= 4 then fail() end
  local engine = api.engine
  local t = api.type and api.type.ComponentType
  if not native(t) or t.PLAYER == nil or t.GAME_SPEED == nil or t.BASE_EDGE == nil
    or t.BASE_EDGE_STREET == nil or t.PLAYER_OWNED == nil then fail() end
  local speed = engine.getComponent(engine.util.getWorld(), t.GAME_SPEED)
  if not native(speed) or (speed.speedup ~= 0 and (requireHeld
    or speed.speedup ~= 1 and speed.speedup ~= 2 and speed.speedup ~= 4))
    or engine.entityExists(input.companyEntity) ~= true
    or not native(engine.getComponent(input.companyEntity, t.PLAYER)) then fail() end
  for _, expected in ipairs(dependencies.revisions) do
    if not native(expected) or not positive(expected.entity) or not array(expected.num, 3)
      or engine.entityExists(expected.entity) ~= true then fail() end
    local current = revision(api, expected.entity)
    for i = 1, 3 do if current.num[i] ~= expected.num[i] then fail() end end
  end
  for i, expected in ipairs(dependencies.incidents) do
    local wanted = i == 1 and input.removedNode or i == 2 and input.segments[1].node0
      or i == 3 and input.segments[2].node1 or input.segments[3].node0
    if not native(expected) or expected.node ~= wanted or type(expected.edges) ~= "table" then fail() end
    local current = incident(api, wanted, progress)
    if #current ~= #expected.edges then fail() end
    for j, id in ipairs(current) do if id ~= expected.edges[j] then fail() end end
  end
  for i, id in ipairs(input.removedEdges) do
    local edge = engine.getComponent(id, t.BASE_EDGE)
    local street = engine.getComponent(id, t.BASE_EDGE_STREET)
    if not native(edge) or not native(street) or engine.getComponent(id, t.PLAYER_OWNED) ~= nil
      or edge.node0 ~= (i == 1 and input.removedNode or input.segments[3].node0)
      or edge.node1 ~= (i == 1 and input.segments[2].node1 or input.removedNode) then fail() end
  end
  local spur = false
  for _, id in ipairs(dependencies.incidents[2].edges) do
    local owner = engine.getComponent(id, t.PLAYER_OWNED)
    local edge = engine.getComponent(id, t.BASE_EDGE)
    local street = engine.getComponent(id, t.BASE_EDGE_STREET)
    if id == dependencies.spur.entity
      and native(owner) and owner.player == input.companyEntity and native(edge) and native(street)
      and edge.node0 == dependencies.spur.node0 and edge.node1 == dependencies.spur.node1
      and edge.roadTemplate == dependencies.spur.roadTemplate
      and edge.roadStyle == dependencies.spur.roadStyle
      and street.precedenceNode0 == dependencies.spur.precedenceNode0
      and street.precedenceNode1 == dependencies.spur.precedenceNode1
      and edge.roadDevelopmentLocked == dependencies.spur.roadDevelopmentLocked then spur = true end
  end
  if not spur then fail() end
  return {code="ready", dependencies=dependencies}
end

function M.revalidate(api, input, dependencies, requireHeld)
  local progress = {stage="dependencies"}
  local ok, result = pcall(revalidate, api, input, dependencies, progress, requireHeld ~= false)
  if ok then return result end
  if result == REJECT then return {code="rejected", stage=progress.stage} end
  return {code="unknown", stage=progress.stage}
end

function M.sameIntent(input, dependencies)
  local ok, value = pcall(function()
    return type(input) == "table" and native(dependencies)
      and type(dependencies.fingerprint) == "string"
      and fingerprint(input) == dependencies.fingerprint
  end)
  return ok and value == true
end

-- Existing road anchors are authorized by a company-owned incident street,
-- not by ownership on the BaseNode itself. No proposal is constructed here.
local function inspectAnchorOwner(api, nodeId, companyId, progress)
  progress.stage = "input"
  if not native(api) or not native(api.engine) or not native(api.type)
    or not positive(nodeId) or not positive(companyId) or nodeId == companyId then fail() end
  local engine = api.engine
  local types = api.type.ComponentType
  if not native(types) or types.BASE_NODE == nil or types.BASE_EDGE == nil
    or types.BASE_EDGE_STREET == nil or types.PLAYER_OWNED == nil
    or types.PLAYER == nil then fail() end
  progress.stage = "node"
  if engine.entityExists(nodeId) ~= true then fail() end
  progress.stage = "company"
  if engine.entityExists(companyId) ~= true then fail() end
  progress.stage = "node_component"
  if not native(engine.getComponent(nodeId, types.BASE_NODE)) then fail() end
  progress.stage = "company_component"
  if not native(engine.getComponent(companyId, types.PLAYER)) then fail() end
  progress.stage = "node_revision"
  local nodeRevision = revision(api, nodeId)
  progress.stage = "incidents"
  local edges = incident(api, nodeId, progress)
  local owned = false
  for _, edgeId in ipairs(edges) do
    progress.stage = "incident_edge"
    local edge = engine.getComponent(edgeId, types.BASE_EDGE)
    if not native(edge) or edge.node0 ~= nodeId and edge.node1 ~= nodeId then fail() end
    progress.stage = "incident_street"
    local street = engine.getComponent(edgeId, types.BASE_EDGE_STREET)
    if not native(street) then fail() end
    progress.stage = "incident_owner"
    local owner = engine.getComponent(edgeId, types.PLAYER_OWNED)
    if owner ~= nil then
      if not native(owner) or not positive(owner.player) or owner.player ~= companyId then fail() end
      owned = true
    end
  end
  return {code=owned and "owned" or "not_owner", owner=owned,
    nodeEntity=nodeId, companyEntity=companyId, revision=nodeRevision.num}
end

function M.inspectAnchorOwner(api, nodeId, companyId)
  local progress = {stage="input"}
  local ok, result = pcall(inspectAnchorOwner, api, nodeId, companyId, progress)
  if ok then return result end
  if result == REJECT then return {code="rejected", stage=progress.stage} end
  return {code="unknown", stage=progress.stage}
end

function M.prepare(api, input)
  local progress = {stage="input"}
  local ok, result = pcall(prepare, api, input, progress)
  if ok then return result end
  if result == REJECT then return {code="rejected", stage=progress.stage} end
  -- Private game log only: distinguish native proposal conversion failures.
  -- Never serialize exception text into authoritative operation receipts.
  local stage = progress.stage
  if type(result) == "string" and (stage == "command"
    or type(stage) == "string" and stage:match("^config_[1-5]_lane_connections$")) then
    local prefix = stage == "command" and "TF3MP_CONNECTOR_COMMAND_EXCEPTION "
      or "TF3MP_CONNECTOR_CONFIG_EXCEPTION " .. stage .. " "
    pcall(print, prefix .. result:sub(1, 512):gsub("[%c]", " "))
  end
  return {code="unknown", stage=progress.stage}
end

function M.inspect(api, input)
  local progress = {stage="input"}
  local ok, result = pcall(prepare, api, input, progress, true)
  if ok then return result end
  if result == REJECT then return {code="rejected", stage=progress.stage} end
  return {code="unknown", stage=progress.stage}
end

return M
