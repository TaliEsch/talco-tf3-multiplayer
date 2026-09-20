-- Passive, synchronous Proposal -> copied JSON diagnostic. Never submit, clone,
-- retain native objects, or replay a proposal. Only copied strings leave collect.
-- Mat4f's public declaration documents column access through cols(matrix, 1..4).
-- That accessor may be unavailable in a restricted GUI callback; pcall below turns
-- that condition into the fixed `matrix` unsupported result, without retaining text.
local M = {}

local MAX_RECORDS, MAX_BYTES, MAX_TEXT = 64, 256 * 1024, 1024

local FAILURE, NULL = {}, {}
local function bad(field) error({ tag = FAILURE, field = field }, 0) end
local function finite(v, field)
  if type(v) ~= "number" or v ~= v or v == math.huge or v == -math.huge then bad(field) end
  return v == 0 and 0 or v
end
local function int(v, field)
  v = finite(v, field)
  if v ~= math.floor(v) or v < -2147483648 or v > 2147483647 then bad(field) end
  return v
end
local function owner(v, field)
  v = int(v, field); if v <= 0 then bad(field) end; return v
end
local function bool(v, field) if type(v) ~= "boolean" then bad(field) end; return v end
local function text(v, field)
  if type(v) ~= "string" or #v > MAX_TEXT or v:find("\0", 1, true) then bad(field) end
  return v
end
local function array(v, field)
  if type(v) ~= "table" or #v > MAX_RECORDS then bad(field) end
  local count, key = 0, nil
  while true do
    key = next(v, key); if key == nil then break end
    count = count + 1
    if count > MAX_RECORDS or type(key) ~= "number" or key < 1 or key > #v or key ~= math.floor(key) then bad(field) end
  end
  if count ~= #v then bad(field) end
  return v
end
local function enum(v, record, field, a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p)
  if v == nil or record == nil then bad(field) end
  for _, name in ipairs({a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p}) do
    local expected = record[name]
    if expected ~= nil and v == expected then return name end
  end
  bad(field)
end
local function vec3(v, field) return { finite(v.x, field), finite(v.y, field), finite(v.z, field) } end
local function matrix(v, enums)
  if type(v) ~= "userdata" and type(v) ~= "table" then bad("matrix") end
  local out = {}
  -- Public type.d.tl specifies cols(matrix, colIndex), colIndex 1..4.  It is a
  -- read-only value accessor, used because the documented index base is absent.
  for col = 1, 4 do
    local ok, c = pcall(function() return enums.Mat4f.cols(v, col) end)
    if not ok or c == nil then bad("matrix") end
    out[#out + 1] = finite(c.x, "matrix")
    out[#out + 1] = finite(c.y, "matrix")
    out[#out + 1] = finite(c.z, "matrix")
    out[#out + 1] = finite(c.w, "matrix")
  end
  return out
end
local function map(v, field, value)
  if type(v) ~= "table" then bad(field) end
  local out, count, key = {}, 0, nil
  while true do
    key = next(v, key); if key == nil then break end
    count = count + 1; if count > MAX_RECORDS then bad(field) end
    out[#out + 1] = { int(key, field), value(v[key], field) }
  end
  table.sort(out, function(a, b) return a[1] < b[1] end)
  return out
end
local function enum_map(v, field, record)
  if type(v) ~= "table" then bad(field) end
  local out, count, key = {}, 0, nil
  while true do
    key = next(v, key); if key == nil then break end
    count = count + 1; if count > MAX_RECORDS then bad(field) end
    out[#out + 1] = { enum(key, record, field, "PERSON", "CARGO", "CAR", "BUS", "TRUCK", "TRAM", "ELECTRIC_TRAM", "TRAIN", "ELECTRIC_TRAIN", "AIRCRAFT", "SHIP", "SMALL_AIRCRAFT", "SMALL_SHIP", "HELICOPTER", "TRAM_TRACK", "ELECTRIC_TRAM_TRACK"), bool(v[key], field) }
  end
  table.sort(out, function(a, b) return a[1] < b[1] end)
  return out
end
local function entity_list(v, field)
  v = array(v, field); local out = {}; for x = 1, #v do out[x] = int(v[x], field) end; return out
end
local function lane(v, enums)
  local modes = enum_map(v.transportModes, "transportModes", enums.TransportMode)
  return { speed = finite(v.speed, "lane"), width = finite(v.width, "lane"), height = finite(v.height, "lane"), forward = bool(v.forward, "lane"), transportModes = modes, offset = finite(v.offset, "lane") }
end
local function edge(v, enums)
  if enum(v.roadType, enums.RoadType, "roadType", "STREET", "TRACK") ~= "STREET" then bad("roadType") end
  local objects = array(v.objects, "objects"); local copiedObjects = {}
  for x = 1, #objects do local q = array(objects[x], "objects"); if #q ~= 2 then bad("objects") end; copiedObjects[x] = { int(q[1], "objects"), enum(q[2], enums.EdgeObjectType, "objects", "STOP_LEFT", "STOP_RIGHT", "SIGNAL") } end
  local function lanes(a) a = array(a, "lanes"); local o = {}; for x = 1, #a do o[x] = lane(a[x], enums) end; return o end
  local decorations = array(v.edgeDecorations, "decorations"); local copiedDecorations = {}
  for x = 1, #decorations do local q = array(decorations[x], "decorations"); if #q ~= 2 then bad("decorations") end; copiedDecorations[x] = { int(q[1], "decorations"), bool(q[2], "decorations") } end
  return { type = enum(v.type, enums.BaseEdgeType, "edgeType", "NORMAL", "BRIDGE", "TUNNEL"), typeIndex = int(v.typeIndex, "typeIndex"), objects = copiedObjects, laneConfigs = lanes(v.laneConfigs), roadDevelopmentLocked = bool(v.roadDevelopmentLocked, "roadDevelopmentLocked"), node0 = int(v.node0, "node0"), node1 = int(v.node1, "node1"), position0 = vec3(v.position0, "position0"), position1 = vec3(v.position1, "position1"), tangent0 = vec3(v.tangent0, "tangent0"), tangent1 = vec3(v.tangent1, "tangent1"), laneConfig = lanes(v.laneConfig), edgeDecorations = copiedDecorations, distance = finite(v.distance, "distance"), roadType = enum(v.roadType, enums.RoadType, "roadType", "STREET", "TRACK"), roadTemplate = text(v.roadTemplate, "roadTemplate"), roadStyle = text(v.roadStyle, "roadStyle") }
end
local function precedence(v, enums)
  -- Copy an observed primitive code without guessing YES/NO/AUTO meanings.
  -- Diagnostic capture is not permission to cast an arbitrary code on replay.
  if type(v) == "number" then return { nativeCode = int(v, "precedence") } end
  return enum(v, enums.PrecedencePreference, "precedence", "YES", "NO", "AUTO")
end
local function segment(v, enums)
  if int(v.type, "segmentType") ~= 0 then bad("segmentType") end
  local emission, owned = NULL, NULL
  if v.emissionEmitter ~= nil then emission = { position = vec3(v.emissionEmitter.position, "emission"), radius = finite(v.emissionEmitter.radius, "emission"), noisePower = finite(v.emissionEmitter.noisePower, "emission"), pollutionPower = finite(v.emissionEmitter.pollutionPower, "emission") } end
  if v.playerOwned ~= nil then owned = { player = owner(v.playerOwned.player, "playerOwned") } end
  return { entity = int(v.entity, "segmentEntity"), comp = edge(v.comp, enums), type = 0, streetEdge = { precedenceNode0 = precedence(v.streetEdge.precedenceNode0, enums), precedenceNode1 = precedence(v.streetEdge.precedenceNode1, enums) }, emissionEmitter = emission, playerOwned = owned }
end
local function node(v) return { entity = int(v.entity, "nodeEntity"), comp = { position = vec3(v.comp.position, "nodePosition") } } end
local function nodeConfig(v, enums)
  local c = v.comp
  -- Read all three together: one bounded diagnostic identifies every mismatch,
  -- without printing native values or silently coercing nil/numeric flags.
  local function readFlag(name)
    local ok, value = pcall(function() return c[name] end)
    if not ok then return nil, "error" end
    if type(value) == "boolean" then return value, value and "true" or "false" end
    if type(value) == "number" then
      if value == 0 then return value, "zero" end
      if value == 1 then return value, "one" end
    end
    local kind = type(value)
    if kind ~= "nil" and kind ~= "number" and kind ~= "string" and kind ~= "table" and kind ~= "userdata" then kind = "other" end
    return value, kind
  end
  local slip, slipKind = readFlag("doubleSlipSwitch")
  local lanesModified, lanesKind = readFlag("userModifiedLaneConnections")
  local lightsModified, lightsKind = readFlag("userModifiedTrafficLightStates")
  if type(slip) ~= "boolean" or (type(lanesModified) ~= "boolean" and lanesKind ~= "nil") or type(lightsModified) ~= "boolean" then
    bad("nodeFlagsD" .. slipKind .. "L" .. lanesKind .. "T" .. lightsKind)
  end
  local lanes, lights = {}, {}
  local connections = array(c.laneConnections, "nodeConfigLanes")
  for i = 1, #connections do
    local q = connections[i]
    lanes[i] = { segment0=int(q.segment0,"nodeConfigLanes"), lane0=int(q.lane0,"nodeConfigLanes"), segment1=int(q.segment1,"nodeConfigLanes"), lane1=int(q.lane1,"nodeConfigLanes"), withRoad=bool(q.withRoad,"nodeConfigLanes"), withTram=bool(q.withTram,"nodeConfigLanes") }
  end
  local states = array(c.trafficLightConfig.states, "nodeConfigLights")
  for i = 1, #states do
    local q = states[i]
    lights[i] = { lockedLanes=entity_list(q.lockedLanes,"nodeConfigLights"), duration=finite(q.duration,"nodeConfigLights"), minDuration=finite(q.minDuration,"nodeConfigLights"), canSkip=bool(q.canSkip,"nodeConfigLights") }
  end
  return { entity=int(v.entity,"nodeConfigEntity"), comp={laneConnections=lanes,
    crosswalks=entity_list(c.crosswalks,"nodeConfigCrosswalks"),
    trafficLightPreference=enum(c.trafficLightPreference,enums.TrafficLightPreference,"nodeConfigPreference","YES","NO","AUTO"),
    trafficLightConfig={states=lights,trafficLightType=int(c.trafficLightConfig.trafficLightType,"nodeConfigLights")},
    doubleSlipSwitch=slip,
    userModifiedLaneConnections=lanesModified == nil and NULL or lanesModified,
    userModifiedTrafficLightStates=lightsModified } }
end
local function json_string(v)
  local out = { '"' }; for x = 1, #v do local b = string.byte(v, x); if b == 34 then out[#out + 1] = '\\"' elseif b == 92 then out[#out + 1] = "\\\\" elseif b == 8 then out[#out + 1] = "\\b" elseif b == 12 then out[#out + 1] = "\\f" elseif b == 10 then out[#out + 1] = "\\n" elseif b == 13 then out[#out + 1] = "\\r" elseif b == 9 then out[#out + 1] = "\\t" elseif b < 32 then out[#out + 1] = string.format("\\u%04x", b) else out[#out + 1] = string.char(b) end end; out[#out + 1] = '"'; return table.concat(out)
end
local function add(pieces, v)
  pieces.bytes = pieces.bytes + #v
  if pieces.bytes > MAX_BYTES then bad("output") end
  pieces[#pieces + 1] = v
end
local function encode(v, pieces)
  if v == NULL then add(pieces, "null"); return end
  local t = type(v)
  if t == "nil" then add(pieces, "null") elseif t == "boolean" then add(pieces, v and "true" or "false") elseif t == "number" then local rendered = string.format("%.17g", finite(v, "number")):gsub(",", "."); add(pieces, rendered) elseif t == "string" then add(pieces, json_string(v)) elseif t == "table" then
    local n, isArray = #v, true; for k in pairs(v) do if type(k) ~= "number" or k < 1 or k > n or k ~= math.floor(k) then isArray = false; break end end
    if isArray then add(pieces, "["); for x = 1, n do if x > 1 then add(pieces, ",") end; encode(v[x], pieces) end; add(pieces, "]") else add(pieces, "{"); local keys = {}; for k in pairs(v) do keys[#keys + 1] = k end; table.sort(keys); for x = 1, #keys do if x > 1 then add(pieces, ",") end; add(pieces, json_string(keys[x])); add(pieces, ":"); encode(v[keys[x]], pieces) end; add(pieces, "}") end
  else bad("jsonType") end
end
local function capture(proposal, enums, resolveModelName)
  if not proposal or not enums then bad("proposal") end
  local s = proposal.proposal
  if s == nil then bad("street") end
  local toAdd = array(proposal.toAdd, "toAdd"); if #toAdd ~= 0 then bad("toAdd") end
  local ncAdd, ncRemove = array(s.nodeConfigsToAdd, "nodeConfigsAddShape"), entity_list(s.nodeConfigsToRemove, "nodeConfigsRemoveShape")
  local copiedConfigs = {}; for i = 1, #ncAdd do copiedConfigs[i] = nodeConfig(ncAdd[i], enums) end
  local terrain = proposal.terrain and proposal.terrain.baseHeightMod; if not terrain or int(terrain.width, "terrain") ~= 0 or int(terrain.height, "terrain") ~= 0 then bad("terrain") end
  local function segments(a, field) a = array(a, field); local o = {}; for x = 1, #a do o[x] = segment(a[x], enums) end; return o end
  local function nodes(a, field) a = array(a, field); local o = {}; for x = 1, #a do o[x] = node(a[x]) end; return o end
  local add, remove = segments(s.addedSegments, "addedSegments"), segments(s.removedSegments, "removedSegments")
  local objects = array(s.edgeObjectsToAdd, "edgeObjects"); if #add == 0 or #remove == 0 or #objects ~= 1 then bad("variant") end
  local q = objects[1]; if int(q.category, "category") ~= 0 then bad("category") end
  local copiedObject = { resultEntity = int(q.resultEntity, "resultEntity"), category = 0, modelInstance = { modelId = int(q.modelInstance.modelId, "modelId"), transf0 = matrix(q.modelInstance.transf0, enums), transf = matrix(q.modelInstance.transf, enums), transformator = int(q.modelInstance.transformator, "transformator") }, playerEntity = owner(q.playerEntity, "playerEntity"), left = bool(q.left, "left") }; if copiedObject.modelInstance.modelId < 0 then bad("modelId") end
  local copied = { schemaVersion = 1, builderId = "streetTerminalBuilder", proposal = {
    street = { addedNodes = nodes(s.addedNodes, "addedNodes"), removedNodes = nodes(s.removedNodes, "removedNodes"),
      addedSegments = add, removedSegments = remove, edgeObjectsToAdd = { copiedObject },
      new2oldEdgeObjects = map(s.new2oldEdgeObjects, "new2oldEdgeObjects", entity_list),
      old2newEdgeObjects = map(s.old2newEdgeObjects, "old2newEdgeObjects", entity_list),
      nodeConfigsToAdd = copiedConfigs, nodeConfigsToRemove = ncRemove },
    toRemove = entity_list(proposal.toRemove, "toRemove"), old2new = map(proposal.old2new, "old2new", int), toAdd = {},
    terrain = { baseHeightMod = { x0 = int(terrain.x0, "terrain"), y0 = int(terrain.y0, "terrain"), width = 0, height = 0 } }
  } }
  local pieces = { bytes = 0 }; encode(copied, pieces); local output = table.concat(pieces)
  local resourceName = nil
  if resolveModelName ~= nil then
    if type(resolveModelName) ~= "function" then bad("modelResource") end
    resourceName = text(resolveModelName(copiedObject.modelInstance.modelId), "modelResource")
    if #resourceName == 0 or resourceName:sub(-4) ~= ".mdl" or resourceName:sub(1,1) == "/"
      or resourceName:find("//",1,true) or resourceName:find("\\",1,true) then bad("modelResource") end
    for part in resourceName:gmatch("[^/]+") do
      if not part:match("^[A-Za-z0-9][A-Za-z0-9_.%-]*$") then bad("modelResource") end
    end
  end
  return output, resourceName
end

-- A diagnostic pass over all independent fields, not a substitute for capture.
-- A bad sibling never prevents inspection of later siblings. Native getters are
-- individually protected; only fixed field paths/type names leave this function.
local function inspectShape(proposal, apiTypes)
  local issues, reads, limited, issueBytes = {}, 0, false, 0
  local function issue(path, kind)
    if #issues >= 23 then limited = true; return end
    local token = path:sub(1, 78) .. kind
    if issueBytes + #token + 1 > 1900 then limited = true; return end
    issueBytes = issueBytes + #token + 1
    issues[#issues + 1] = token
  end
  local function kind(v)
    local t = type(v)
    if t == "nil" then return "Nil" elseif t == "table" then return "Table" elseif t == "userdata" then return "Userdata"
    elseif t == "number" then return "Number" elseif t == "boolean" then return "Boolean" elseif t == "string" then return "String" end
    return "Other"
  end
  local function access(parent, key, path, inspect)
    reads = reads + 1
    if reads > 4096 or #issues >= 23 then limited = true; return end
    local ok, value = pcall(function() return parent[key] end)
    if not ok then issue(path,"GetterError"); return end
    local checked = pcall(inspect, value, path)
    if not checked then issue(path,"InspectionError") end
  end
  local function record(v,p,fields)
    if type(v) ~= "table" and type(v) ~= "userdata" then issue(p,kind(v)); return end
    for _,field in ipairs(fields) do access(v,field[1],p .. field[1],field[2]) end
  end
  local function check(fn)
    return function(v,p) if not pcall(fn,v,p) then issue(p,kind(v)) end end
  end
  local number, integer, boolean, stringValue = check(finite), check(int), check(bool), check(text)
  local function optionalBoolean(v,p) if v ~= nil then boolean(v,p) end end
  local function vector(item)
    return function(v,p)
      if not pcall(array,v,p) then issue(p,kind(v)); return end
      for i=1,#v do access(v,i,p .. string.format("%d",i),item) end
    end
  end
  local function enumValue(v,p) if v == nil then issue(p,"Nil") end end
  local function vec(v,p) record(v,p,{{"x",number},{"y",number},{"z",number}}) end
  local function pairsOf(a,b)
    return vector(function(v,p)
      if type(v) ~= "table" or #v ~= 2 then issue(p,kind(v)); return end
      access(v,1,p .. "First",a); access(v,2,p .. "Second",b)
    end)
  end
  local function nativeMap(item)
    return function(v,p)
      if type(v) ~= "table" then issue(p,kind(v)); return end
      local count,key=0,nil
      while true do
        key=next(v,key); if key==nil then break end
        count=count+1; if count>64 then issue(p,"Limit"); break end
        -- Never turn arbitrary keys into diagnostic strings.
        integer(key,p .. "Key"); access(v,key,p .. "Value" .. string.format("%d",count),item)
      end
    end
  end
  local function modeMap(v,p)
    if type(v) ~= "table" then issue(p,kind(v)); return end
    local count,key=0,nil
    while true do
      key=next(v,key); if key==nil then break end
      count=count+1; if count>64 then issue(p,"Limit"); break end
      access(v,key,p .. "Mode" .. string.format("%d",count),boolean)
    end
  end
  local function laneShape(v,p) record(v,p,{{"speed",number},{"width",number},{"height",number},{"forward",boolean},{"transportModes",modeMap},{"offset",number}}) end
  local function edgeShape(v,p) record(v,p,{
    {"type",enumValue},{"typeIndex",integer},{"objects",pairsOf(integer,enumValue)},
    {"laneConfigs",vector(laneShape)},{"roadDevelopmentLocked",boolean},{"node0",integer},{"node1",integer},
    {"position0",vec},{"position1",vec},{"tangent0",vec},{"tangent1",vec},{"laneConfig",vector(laneShape)},
    {"edgeDecorations",pairsOf(integer,boolean)},{"distance",number},{"roadType",enumValue},{"roadTemplate",stringValue},{"roadStyle",stringValue}}) end
  local function segmentShape(v,p) record(v,p,{{"entity",integer},{"type",integer},{"comp",edgeShape},
    {"streetEdge",function(x,q) record(x,q,{{"precedenceNode0",enumValue},{"precedenceNode1",enumValue}}) end},
    {"emissionEmitter",function(x,q) if x~=nil then record(x,q,{{"position",vec},{"radius",number},{"noisePower",number},{"pollutionPower",number}}) end end},
    {"playerOwned",function(x,q) if x~=nil then record(x,q,{{"player",integer}}) end end}}) end
  local function nodeShape(v,p) record(v,p,{{"entity",integer},{"comp",function(x,q) record(x,q,{{"position",vec}}) end}}) end
  local function configShape(v,p) record(v,p,{{"entity",integer},{"comp",function(x,q) record(x,q,{
    {"laneConnections",vector(function(y,r) record(y,r,{{"segment0",integer},{"lane0",integer},{"segment1",integer},{"lane1",integer},{"withRoad",boolean},{"withTram",boolean}}) end)},
    {"crosswalks",vector(integer)},{"trafficLightPreference",enumValue},
    {"trafficLightConfig",function(y,r) record(y,r,{{"trafficLightType",integer},{"states",vector(function(z,s) record(z,s,{{"lockedLanes",vector(integer)},{"duration",number},{"minDuration",number},{"canSkip",boolean}}) end)}}) end},
    {"doubleSlipSwitch",boolean},{"userModifiedLaneConnections",optionalBoolean},{"userModifiedTrafficLightStates",boolean}}) end}}) end
  local function matrixShape(v,p)
    if type(v)~="table" and type(v)~="userdata" then issue(p,kind(v)); return end
    for col=1,4 do
      local ok,c=pcall(function() return apiTypes.Mat4f.cols(v,col) end)
      if not ok then issue(p .. "Column" .. string.format("%d",col),"GetterError")
      else record(c,p .. "Column" .. string.format("%d",col),{{"x",number},{"y",number},{"z",number},{"w",number}}) end
    end
  end
  record(proposal,"",{
    {"proposal",function(v,p) record(v,"road",{{"addedNodes",vector(nodeShape)},{"removedNodes",vector(nodeShape)},
      {"addedSegments",vector(segmentShape)},{"removedSegments",vector(segmentShape)},
      {"nodeConfigsToAdd",vector(configShape)},{"nodeConfigsToRemove",vector(integer)},
      {"edgeObjectsToAdd",vector(function(x,q) record(x,q,{{"resultEntity",integer},{"category",integer},{"playerEntity",integer},{"left",boolean},
        {"modelInstance",function(y,r) record(y,r,{{"modelId",integer},{"transf0",matrixShape},{"transf",matrixShape},{"transformator",integer}}) end}}) end)},
      {"new2oldEdgeObjects",nativeMap(vector(integer))},{"old2newEdgeObjects",nativeMap(vector(integer))}}) end},
    {"toAdd",vector(function()end)},{"toRemove",vector(integer)},{"old2new",nativeMap(integer)},
    {"terrain",function(v,p) record(v,p,{{"baseHeightMod",function(x,q) record(x,q,{{"x0",integer},{"y0",integer},{"width",integer},{"height",integer}}) end}}) end}})
  if limited then issues[#issues+1]="InspectionLimit" end
  return table.concat(issues,"_")
end

function M.collect(proposal, apiTypes, resolveModelName)
  local shapeOk, issues = pcall(inspectShape, proposal, apiTypes)
  if not shapeOk then issues = "InspectionError" end
  local ok, result, resourceName = pcall(function()
    -- Type.enum contains the enum groups; Mat4f is directly under Type.
    -- Missing/undeclared runtime groups fail as unsupported, never guessed.
    if type(apiTypes) ~= "table" or type(apiTypes.enum) ~= "table" then bad("enumNamespace") end
    local groups = apiTypes.enum
    local hasPrecedence, precedenceGroup = pcall(function() return groups.PrecedencePreference end)
    if not hasPrecedence then precedenceGroup = nil end
    return capture(proposal, {
      BaseEdgeType = groups.BaseEdgeType, RoadType = groups.RoadType,
      EdgeObjectType = groups.EdgeObjectType, TransportMode = groups.TransportMode,
      PrecedencePreference = precedenceGroup, TrafficLightPreference = groups.TrafficLightPreference, Mat4f = apiTypes.Mat4f,
    }, resolveModelName)
  end)
  if ok and issues == "" then return { code = "captured", json = result, modelResourceName = resourceName } end
  -- A foreign error value can itself have throwing field access. Never inspect
  -- it outside protection, format it, or export its text.
  local recognized, field = pcall(function()
    if type(result) == "table" and result.tag == FAILURE then return result.field end
    return nil
  end)
  local first = recognized and type(field) == "string" and field or "proposal"
  if issues == "" then issues = "Capture" .. first end
  return { code = "unsupported", field = first, issues = issues }
end

function M.toHex(json)
  if type(json) ~= "string" or #json == 0 or #json > MAX_BYTES then return nil end
  return (json:gsub(".", function(c) return string.format("%02x", string.byte(c)) end))
end

return M
