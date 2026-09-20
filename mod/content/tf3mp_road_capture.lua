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
local function segment(v, enums)
  if int(v.type, "segmentType") ~= 0 then bad("segmentType") end
  local emission, owned = NULL, NULL
  if v.emissionEmitter ~= nil then emission = { position = vec3(v.emissionEmitter.position, "emission"), radius = finite(v.emissionEmitter.radius, "emission"), noisePower = finite(v.emissionEmitter.noisePower, "emission"), pollutionPower = finite(v.emissionEmitter.pollutionPower, "emission") } end
  if v.playerOwned ~= nil then owned = { player = owner(v.playerOwned.player, "playerOwned") } end
  return { entity = int(v.entity, "segmentEntity"), comp = edge(v.comp, enums), type = 0, streetEdge = { precedenceNode0 = enum(v.streetEdge.precedenceNode0, enums.PrecedencePreference, "precedence", "YES", "NO", "AUTO"), precedenceNode1 = enum(v.streetEdge.precedenceNode1, enums.PrecedencePreference, "precedence", "YES", "NO", "AUTO") }, emissionEmitter = emission, playerOwned = owned }
end
local function node(v) return { entity = int(v.entity, "nodeEntity"), comp = { position = vec3(v.comp.position, "nodePosition") } } end
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
local function capture(proposal, enums)
  if not proposal or not enums then bad("proposal") end
  local s = proposal.proposal
  if s == nil then bad("street") end
  local toAdd = array(proposal.toAdd, "toAdd"); if #toAdd ~= 0 then bad("toAdd") end
  local ncAdd, ncRemove = array(s.nodeConfigsToAdd, "nodeConfigs"), array(s.nodeConfigsToRemove, "nodeConfigs"); if #ncAdd ~= 0 or #ncRemove ~= 0 then bad("nodeConfigs") end
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
      nodeConfigsToAdd = {}, nodeConfigsToRemove = {} },
    toRemove = entity_list(proposal.toRemove, "toRemove"), old2new = map(proposal.old2new, "old2new", int), toAdd = {},
    terrain = { baseHeightMod = { x0 = int(terrain.x0, "terrain"), y0 = int(terrain.y0, "terrain"), width = 0, height = 0 } }
  } }
  local pieces = { bytes = 0 }; encode(copied, pieces); local output = table.concat(pieces); return output
end

function M.collect(proposal, apiTypes)
  local ok, result = pcall(function()
    -- Type.enum contains the enum groups; Mat4f is directly under Type.
    -- Missing/undeclared runtime groups fail as unsupported, never guessed.
    if type(apiTypes) ~= "table" or type(apiTypes.enum) ~= "table" then bad("enumNamespace") end
    local groups = apiTypes.enum
    return capture(proposal, {
      BaseEdgeType = groups.BaseEdgeType, RoadType = groups.RoadType,
      EdgeObjectType = groups.EdgeObjectType, TransportMode = groups.TransportMode,
      PrecedencePreference = groups.PrecedencePreference, Mat4f = apiTypes.Mat4f,
    })
  end)
  if ok then return { code = "captured", json = result } end
  -- A foreign error value can itself have throwing field access. Never inspect
  -- it outside protection, format it, or export its text.
  local recognized, field = pcall(function()
    if type(result) == "table" and result.tag == FAILURE then return result.field end
    return nil
  end)
  return { code = "unsupported", field = recognized and type(field) == "string" and field or "proposal" }
end

function M.toHex(json)
  if type(json) ~= "string" or #json == 0 or #json > MAX_BYTES then return nil end
  return (json:gsub(".", function(c) return string.format("%02x", string.byte(c)) end))
end

return M
