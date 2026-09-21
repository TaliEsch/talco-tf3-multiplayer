-- Bounded read-only evidence for a road stop returned by a native proposal.
-- This module deliberately does not submit commands, mutate components, or persist.
local M = {}

local MAX_INT, MAX_SAFE, MAX_JSON = 2147483647, 9007199254740991, 64 * 1024
local REJECT = {}
local function fail() error(REJECT, 0) end
local function finite(v) return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge end
local function safeint(v) return finite(v) and v == math.floor(v) and v >= -MAX_SAFE and v <= MAX_SAFE end
local function entity(v) return safeint(v) and v > 0 and v <= MAX_INT end
local function clockint(v) return safeint(v) and v >= 0 and v <= MAX_INT end
local function native(v) return type(v) == "table" or type(v) == "userdata" end

local function dense(v, limit)
  if type(v) ~= "table" or getmetatable(v) ~= nil or #v > limit then return false end
  local count = 0
  for k in pairs(v) do
    count = count + 1
    if type(k) ~= "number" or k ~= math.floor(k) or k < 1 or k > #v then return false end
  end
  return count == #v
end

local function exactRequest(request)
  if type(request) ~= "table" or getmetatable(request) ~= nil then return false end
  local allowed = {schemaVersion=true, nonce=true, observationId=true, companyEntity=true, resultEntities=true, oneWay=true, name=true}
  local count = 0
  for key in pairs(request) do
    if type(key) ~= "string" or not allowed[key] then return false end
    count = count + 1
  end
  if count ~= 7 or request.schemaVersion ~= 1 or type(request.nonce) ~= "string" or #request.nonce ~= 32
    or request.nonce:match("^[a-f0-9]+$") == nil or not entity(request.observationId)
    or not entity(request.companyEntity) or type(request.oneWay) ~= "boolean" or type(request.name) ~= "string" or #request.name > 1024
    or not dense(request.resultEntities, 64) or #request.resultEntities < 1 then return false end
  local seen = {}
  for _, id in ipairs(request.resultEntities) do
    if not entity(id) or seen[id] then return false end
    seen[id] = true
  end
  return true
end

local function component(api, id, name)
  local types = api and api.type and api.type.ComponentType
  if not entity(id) or type(types) ~= "table" or types[name] == nil
    or not api.engine or type(api.engine.getComponent) ~= "function" then fail() end
  return api.engine.getComponent(id, types[name])
end

local function clock(api)
  if not api or not api.engine or not api.engine.util or type(api.engine.util.getWorld) ~= "function" then fail() end
  local world = api.engine.util.getWorld()
  if not safeint(world) or world < 0 or world > MAX_INT or not api.type
    or type(api.type.ComponentType) ~= "table" or api.type.ComponentType.GAME_SPEED == nil
    or api.type.ComponentType.GAME_TIME == nil or type(api.engine.getComponent) ~= "function" then fail() end
  -- World entity zero is valid, unlike ordinary result and company entities.
  local speed = api.engine.getComponent(world, api.type.ComponentType.GAME_SPEED)
  local time = api.engine.getComponent(world, api.type.ComponentType.GAME_TIME)
  if not native(speed) or speed.speedup ~= 0 or not native(time)
    or not clockint(time.tickCount) or not clockint(time.updateCount) then fail() end
  return time.updateCount, time.tickCount
end

local function resource(v)
  local function start(byte) return byte and ((byte >= 48 and byte <= 57) or (byte >= 65 and byte <= 90) or (byte >= 97 and byte <= 122) or byte == 95) end
  local function rest(byte) return start(byte) or byte == 46 or byte == 45 end
  if type(v) ~= "string" or #v == 0 or #v > 1024 or v:sub(1,1) == "/" or v:sub(-1) == "/" or v:find("//",1,true) then fail() end
  for part in v:gmatch("[^/]+") do
    if not start(string.byte(part, 1)) then fail() end
    for index = 2, #part do if not rest(string.byte(part, index)) then fail() end end
  end
  return v
end

local function jsonString(v)
  return '"' .. v:gsub('[%z\1-\31\\"]', function(c)
    local b = string.byte(c)
    if c == '"' then return '\\"' end
    if c == "\\" then return "\\\\" end
    if c == "\b" then return "\\b" end
    if c == "\f" then return "\\f" end
    if c == "\n" then return "\\n" end
    if c == "\r" then return "\\r" end
    if c == "\t" then return "\\t" end
    return string.format("\\u%04x", b)
  end) .. '"'
end

local function jsonNumber(v)
  if not finite(v) then fail() end
  -- Lua's numeric conversion observes the process locale; JSON always uses a dot.
  return string.format("%.17g", v):gsub(",", ".")
end

local function taggedParams(root)
  local seen, nodes = {}, 0
  local function visit(v, depth)
    nodes = nodes + 1
    if nodes > 256 or depth > 4 then fail() end
    local kind = type(v)
    if kind == "boolean" then return {kind="boolean", value=v} end
    if kind == "number" and finite(v) and (v ~= math.floor(v) or safeint(v)) then return {kind="number", value=v} end
    if kind == "string" and #v <= 1024 then return {kind="string", value=v} end
    if kind ~= "table" or getmetatable(v) ~= nil or seen[v] then fail() end
    seen[v] = true
    local entries, count = {}, 0
    for key, value in pairs(v) do
      count = count + 1
      if count > 64 then fail() end
      local keyType = type(key)
      if keyType == "string" then
        if #key == 0 or #key > 128 or not key:match("^[A-Za-z0-9_]+$") then fail() end
      elseif keyType == "number" then
        if not safeint(key) then fail() end
      else fail() end
      entries[count] = {keyType=keyType, key=key, value=visit(value, depth + 1)}
    end
    table.sort(entries, function(a, b)
      if a.keyType ~= b.keyType then return a.keyType == "number" end
      return a.key < b.key
    end)
    return {kind="table", entries=entries}
  end
  if type(root) ~= "table" then fail() end
  return visit(root, 0)
end

local function encodeTag(tag)
  if tag.kind == "table" then
    local parts = {}
    for i, entry in ipairs(tag.entries) do
      parts[i] = '{"keyType":' .. jsonString(entry.keyType) .. ',"key":'
        .. (entry.keyType == "number" and jsonNumber(entry.key) or jsonString(entry.key))
        .. ',"value":' .. encodeTag(entry.value) .. '}'
    end
    return '{"kind":"table","entries":[' .. table.concat(parts, ",") .. ']}'
  end
  local value = tag.kind == "string" and jsonString(tag.value) or tag.kind == "number" and jsonNumber(tag.value) or tostring(tag.value)
  return '{"kind":' .. jsonString(tag.kind) .. ',"value":' .. value .. '}'
end

local function transform(api, matrix)
  if not api or not api.type or not api.type.Mat4f or type(api.type.Mat4f.cols) ~= "function" then fail() end
  local out = {}
  for col = 1, 4 do
    local vector = api.type.Mat4f.cols(matrix, col)
    if not native(vector) or not finite(vector.x) or not finite(vector.y) or not finite(vector.z) or not finite(vector.w) then fail() end
    local i = (col - 1) * 4
    out[i + 1], out[i + 2], out[i + 3], out[i + 4] = vector.x, vector.y, vector.z, vector.w
  end
  return out
end

local function isStopOnEdge(api, edge, candidate)
  if not native(edge) or not dense(edge.objects, 64) then return false end
  local enum = api.type and api.type.enum and api.type.enum.EdgeObjectType
  if type(enum) ~= "table" or enum.STOP_LEFT == nil or enum.STOP_RIGHT == nil then fail() end
  local matches, stop, left = 0, false, false
  for _, item in ipairs(edge.objects) do
    if not dense(item, 2) or #item ~= 2 or not entity(item[1]) then return false end
    if item[1] == candidate then
      matches = matches + 1
      stop, left = item[2] == enum.STOP_LEFT or item[2] == enum.STOP_RIGHT, item[2] == enum.STOP_LEFT
    end
  end
  return matches == 1 and stop, left
end

local function collect(api, request, stage)
  stage("request")
  if not exactRequest(request) then fail() end
  stage("clock")
  local updateCount, tickCount = clock(api)
  stage("streetApi")
  if not api.engine or not api.engine.system or not api.engine.system.streetSystem
    or type(api.engine.system.streetSystem.getEdgeForEdgeObject) ~= "function"
    or type(api.engine.entityExists) ~= "function" then fail() end
  local candidate, object = nil, nil
  for _, id in ipairs(request.resultEntities) do
    stage("resultEntity")
    if api.engine.entityExists(id) ~= true then fail() end
    local edgeObject = component(api, id, "EDGE_OBJECT")
    local owned = component(api, id, "PLAYER_OWNED")
    if edgeObject ~= nil then
      stage("ownerOrAmbiguousResult")
      if not native(owned) or owned.player ~= request.companyEntity then fail() end
      if candidate ~= nil then fail() end
      candidate, object = id, edgeObject
    end
  end
  stage("stopPlacement")
  if candidate == nil or not native(object) or not finite(object.param) or object.param < 0 or object.param > 1 then fail() end
  stage("attachedEdge")
  local edgeId = api.engine.system.streetSystem.getEdgeForEdgeObject(candidate)
  if not entity(edgeId) or api.engine.entityExists(edgeId) ~= true then fail() end
  local edge = component(api, edgeId, "BASE_EDGE")
  local stop, left = isStopOnEdge(api, edge, candidate)
  if edge == nil or not stop then fail() end
  stage("transform")
  local transf = transform(api, object.transf)
  stage("constructionResource")
  local construction = resource(object.edgeObjectConstruction)
  stage("params")
  local params = taggedParams(object.params)
  stage("encoding")
  local values = {}
  for i = 1, 16 do values[i] = jsonNumber(transf[i]) end
  local json = '{"schemaVersion":1,"kind":"road_stop_readback","nonce":' .. jsonString(request.nonce)
    .. ',"observationId":' .. jsonNumber(request.observationId) .. ',"companyEntity":' .. jsonNumber(request.companyEntity)
    .. ',"updateCount":' .. jsonNumber(updateCount) .. ',"tickCount":' .. jsonNumber(tickCount)
    .. ',"stopEntity":' .. jsonNumber(candidate) .. ',"edgeEntity":' .. jsonNumber(edgeId) .. ',"param":' .. jsonNumber(object.param)
    .. ',"oneWay":' .. tostring(request.oneWay) .. ',"name":' .. jsonString(request.name) .. ',"left":' .. tostring(left)
    .. ',"transform":[' .. table.concat(values, ",") .. '],"constructionResource":' .. jsonString(construction)
    .. ',"params":' .. encodeTag(params) .. '}'
  if #json > MAX_JSON then fail() end
  return {code="readback", json=json}
end

local function copyApply(proposal, results, observationId)
  if not entity(observationId) or observationId > 16 or not native(proposal) then fail() end
  local street = proposal.proposal
  local objects = street and street.edgeObjectsToAdd
  if not dense(objects, 1) or #objects ~= 1 then fail() end
  local edgeObject = objects[1]
  if not native(edgeObject) or edgeObject.category ~= 0 or not entity(edgeObject.playerEntity)
    or type(edgeObject.oneWay) ~= "boolean" or type(edgeObject.name) ~= "string" or #edgeObject.name > 1024 then fail() end
  if not dense(results, 64) or #results < 1 then fail() end
  local out, seen = {}, {}
  for index, id in ipairs(results) do
    if not entity(id) or seen[id] then fail() end
    seen[id], out[index] = true, id
  end
  return {observationId=observationId, companyEntity=edgeObject.playerEntity, resultEntities=out,
    oneWay=edgeObject.oneWay, name=edgeObject.name}
end

function M.copyApply(proposal, results, observationId)
  local ok, value = pcall(copyApply, proposal, results, observationId)
  if ok then return value end
  return {}
end

function M.collect(api, request)
  local field = "request"
  local ok, value = pcall(collect, api, request, function(name) field = name end)
  if ok and type(value) == "table" and value.code == "readback" and type(value.json) == "string" and #value.json <= MAX_JSON then return value end
  return {code="unavailable", field=field}
end
return M
