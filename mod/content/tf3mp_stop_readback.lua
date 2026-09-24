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
  local kind = api and api.type and api.type.ComponentType and api.type.ComponentType[name]
  if not entity(id) or kind == nil then fail() end
  return api.engine.getComponent(id, kind)
end

local function clock(api, stage)
  stage("clockLookup")
  local world = api.engine.util.getWorld()
  stage("clockIdentity")
  -- Engine-owned world handles are not placed-asset IDs. The public contract is
  -- integer, with no positive/int32 restriction. Forward the returned handle
  -- unchanged, as the working bridge does; never accept it from a request.
  if not safeint(world) then fail() end
  stage("clockComponents")
  -- Native API namespaces need not be Lua tables. Match the working bridge's
  -- named constant access; validate the returned data, not the binding wrapper.
  local types = api.type and api.type.ComponentType
  local speedType, timeType = types and types.GAME_SPEED, types and types.GAME_TIME
  if speedType == nil or timeType == nil then fail() end
  -- All native calls are protected by collect's pcall. Callable bindings need
  -- not report Lua type "function"; missing/throwing calls still fail closed.
  local speed = api.engine.getComponent(world, speedType)
  local time = api.engine.getComponent(world, timeType)
  stage("clockPaused")
  if not native(speed) or speed.speedup ~= 0 then fail() end
  stage("clockValues")
  if not native(time) or not clockint(time.tickCount) or not clockint(time.updateCount) then fail() end
  return time.updateCount, time.tickCount
end

local function resource(v)
  local function start(byte) return byte and ((byte >= 48 and byte <= 57) or (byte >= 65 and byte <= 90) or (byte >= 97 and byte <= 122) or byte == 95) end
  local function rest(byte) return start(byte) or byte == 46 or byte == 45 end
  if type(v) ~= "string" or #v == 0 or #v > 1024 then fail() end
  -- TF3's placed road stop reports the base-game resource namespace as ::/.
  -- Keep the namespace marker intact; validate only the path that follows it.
  local path = v:sub(1,3) == "::/" and v:sub(4) or v
  if #path == 0 or path:sub(1,1) == "/" or path:sub(-1) == "/" or path:find("//",1,true) then fail() end
  for part in path:gmatch("[^/]+") do
    if not start(string.byte(part, 1)) then fail() end
    for index = 2, #part do if not rest(string.byte(part, index)) then fail() end end
  end
  return v
end

local function resourceStage(v)
  if v == nil then return "constructionResourceNil" end
  if type(v) ~= "string" then return "constructionResourceType" end
  if #v == 0 then return "constructionResourceEmpty" end
  return "constructionResourceSyntax"
end

-- The installed API exposes rendered model instances separately from the edge
-- object's optional construction name. Copy only one unambiguous model identity;
-- this is diagnostic evidence and cannot authorize a SimpleProposal replay.
local function modelDiagnostic(api, candidate)
  local models = component(api, candidate, "MODEL_INSTANCE_LIST")
  if not native(models) or not dense(models.fatInstances, 8) or #models.fatInstances ~= 1
    or not dense(models.thinInstances, 8) or #models.thinInstances ~= 0 then return nil end
  local model = models.fatInstances[1]
  if not native(model) or not safeint(model.modelId) or model.modelId < 0 or model.modelId > MAX_INT then return nil end
  local rep = api.res and api.res.modelRep
  if rep == nil then return nil end
  local name = rep.getName(model.modelId)
  if type(name) ~= "string" or name:sub(-4) ~= ".mdl" then return nil end
  resource(name)
  return {modelId=model.modelId, modelResourceName=name}
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

local function transform(matrix)
  local out = {}
  -- Match stock gui/debug_panel/make_entity_debug_panel.tl: m:cols(k - 1).
  -- The installed type comment says 1..4, but stock callers use 0..3 and use
  -- column 3 for translation. Do not call column 4 or fabricate a missing one.
  for col = 0, 3 do
    local vector = matrix:cols(col)
    if not native(vector) or not finite(vector.x) or not finite(vector.y) or not finite(vector.z) or not finite(vector.w) then fail() end
    local i = col * 4
    out[i + 1], out[i + 2], out[i + 3], out[i + 4] = vector.x, vector.y, vector.z, vector.w
  end
  return out
end

local function isStopOnEdge(api, edge, candidate)
  if not native(edge) or not dense(edge.objects, 64) then return false end
  local enum = api.type and api.type.enum and api.type.enum.EdgeObjectType
  if enum == nil or enum.STOP_LEFT == nil or enum.STOP_RIGHT == nil then fail() end
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

-- Probe the declared factory on the already verified road. It creates a
-- proposal value only; this diagnostic never submits or modifies it.
local function replacementProbe(api, edgeId)
  local ok, result = pcall(function()
    local proposalUtil = api.engine.util.proposal
    if proposalUtil == nil or proposalUtil.replaceSegment == nil then return {code="factoryMissing"} end
    local proposal = proposalUtil.replaceSegment(edgeId)
    if not native(proposal) or not native(proposal.proposal) then return {code="factoryNil"} end
    local street = proposal.proposal
    local added, removed, objects = street.addedSegments, street.removedSegments, street.edgeObjectsToAdd
    if type(added) ~= "table" or type(removed) ~= "table" or type(objects) ~= "table"
      or #added > 64 or #removed > 64 or #objects > 64 then return {code="shapeUnavailable"} end
    local first = added[1]
    local firstId = first and first.entity
    local firstObjects = first and first.comp and first.comp.objects
    local removedId = removed[1] and removed[1].entity
    if firstId ~= nil and (not safeint(firstId) or firstId < -MAX_INT or firstId > MAX_INT) then return {code="shapeUnavailable"} end
    if removedId ~= nil and not entity(removedId) then return {code="shapeUnavailable"} end
    if firstObjects ~= nil and (type(firstObjects) ~= "table" or #firstObjects > 64) then return {code="shapeUnavailable"} end
    return {code="shape", added=#added, removed=#removed, edgeObjects=#objects,
      firstAddedEntity=firstId or 0, firstAddedObjectCount=firstObjects and #firstObjects or 0,
      firstRemovedEntity=removedId or 0}
  end)
  if not ok or type(result) ~= "table" then return {code="factoryFailed"} end
  return result
end

local function collect(api, request, stage)
  stage("request")
  if not exactRequest(request) then fail() end
  stage("clock")
  local updateCount, tickCount = clock(api, stage)
  stage("streetApi")
  if not api.engine.system or not api.engine.system.streetSystem then fail() end
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
  local transf = transform(object.transf)
  local constructionValue = object.edgeObjectConstruction
  stage(resourceStage(constructionValue))
  if constructionValue == nil then
    local ok, diagnostic = pcall(modelDiagnostic, api, candidate)
    if ok and diagnostic ~= nil then
      return {code="unavailable", field="constructionResourceNil", modelId=diagnostic.modelId,
        modelResourceName=diagnostic.modelResourceName}
    end
  end
  local validResource, construction = pcall(resource, constructionValue)
  if not validResource then
    -- Copy only a bounded string from this already verified, owned stop. The
    -- panel stores it as hex for diagnosis; it is never a replay recipe.
    if type(constructionValue) == "string" and #constructionValue > 0 and #constructionValue <= 1024 then
      return {code="unavailable", field="constructionResourceSyntax", constructionResourceValue=constructionValue}
    end
    fail()
  end
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
  local modelOk, model = pcall(modelDiagnostic, api, candidate)
  return {code="readback", json=json, replacementProbe=replacementProbe(api, edgeId),
    modelId=modelOk and model and model.modelId or nil,
    modelResourceName=modelOk and model and model.modelResourceName or nil}
end

local function copyApply(proposal, results, observationId, stage)
  stage("applyShape")
  if not entity(observationId) or observationId > 16 or not native(proposal) then fail() end
  local street = proposal.proposal
  local objects = street and street.edgeObjectsToAdd
  stage("applyObjects")
  if type(objects) ~= "table" or objects[1] == nil or objects[2] ~= nil then fail() end
  local edgeObject = objects[1]
  stage("applyOptions")
  if not native(edgeObject) or edgeObject.category ~= 0 or not entity(edgeObject.playerEntity)
    or type(edgeObject.oneWay) ~= "boolean" or type(edgeObject.name) ~= "string" or #edgeObject.name > 1024 then fail() end
  stage("applyResults")
  if type(results) ~= "table" then fail() end
  local out, seen, ended = {}, {}, false
  -- Use the stock mission's indexed access rather than a native table's length
  -- or metatable. Never retain the table, and cap access even for a proxy.
  for index = 1, 65 do
    local id = results[index]
    if id == nil then
      ended = true
    else
      if ended or index > 64 or not entity(id) or seen[id] then fail() end
      seen[id], out[index] = true, id
    end
  end
  if #out == 0 then
    -- The native roadside-stop apply can return an empty result vector. The
    -- public Proposal.EdgeObject declares its own resulting entity (type.d.tl).
    -- Copy that exact positive ID, never a guessed replacement or a world scan.
    -- collect() still requires the actual owned stop and its road membership.
    stage("applyStopEntity")
    local id = edgeObject.resultEntity
    if not entity(id) then fail() end
    out[1] = id
  end
  return {observationId=observationId, companyEntity=edgeObject.playerEntity, resultEntities=out,
    oneWay=edgeObject.oneWay, name=edgeObject.name}
end

function M.copyApply(proposal, results, observationId)
  local field = "applyShape"
  local ok, value = pcall(copyApply, proposal, results, observationId, function(name) field = name end)
  if ok then return value end
  return {code="unavailable", field=field}
end

-- Copy only the original road and owner from one normal builder preview.
function M.copyPreview(proposal, observationId)
  local ok, value = pcall(function()
    if not entity(observationId) or observationId > 16 or not native(proposal) or not native(proposal.proposal) then fail() end
    local street = proposal.proposal
    if type(street.removedSegments) ~= "table" or #street.removedSegments ~= 1
      or type(street.addedSegments) ~= "table" or #street.addedSegments ~= 1
      or type(street.edgeObjectsToAdd) ~= "table" or #street.edgeObjectsToAdd ~= 1 then fail() end
    local edge, object = street.removedSegments[1], street.edgeObjectsToAdd[1]
    if not native(edge) or not native(object) or not entity(edge.entity)
      or not entity(object.playerEntity) or object.category ~= 0 then fail() end
    return {observationId=observationId, edgeEntity=edge.entity, companyEntity=object.playerEntity}
  end)
  if ok then return value end
  return nil
end

-- Read-only pre-click qualification. The factory value never leaves this call.
function M.preActionProbe(api, request)
  local ok, value = pcall(function()
    if type(request) ~= "table" or getmetatable(request) ~= nil then fail() end
    local count = 0
    for key in pairs(request) do
      if key ~= "nonce" and key ~= "observationId" and key ~= "edgeEntity" and key ~= "companyEntity" then fail() end
      count = count + 1
    end
    if count ~= 4 or type(request.nonce) ~= "string" or #request.nonce ~= 32
      or not request.nonce:match("^[a-f0-9]+$") or not entity(request.observationId)
      or request.observationId > 16 or not entity(request.edgeEntity) or not entity(request.companyEntity) then fail() end
    local updateCount = clock(api, function() end)
    if api.engine.util.getPlayer() ~= request.companyEntity
      or api.engine.entityExists(request.companyEntity) ~= true
      or api.engine.entityExists(request.edgeEntity) ~= true
      or not native(component(api, request.companyEntity, "PLAYER")) then fail() end
    local edge = component(api, request.edgeEntity, "BASE_EDGE")
    if not native(edge) or not dense(edge.objects, 64) or #edge.objects ~= 0 then fail() end
    local probe = replacementProbe(api, request.edgeEntity)
    if probe.code ~= "shape" or probe.added ~= 1 or probe.removed ~= 1 or probe.edgeObjects ~= 0
      or probe.firstAddedEntity ~= -1 or probe.firstAddedObjectCount ~= 0
      or probe.firstRemovedEntity ~= request.edgeEntity then fail() end
    return {code="shape", nonce=request.nonce, observationId=request.observationId,
      edgeEntity=request.edgeEntity, companyEntity=request.companyEntity, updateCount=updateCount,
      added=1, removed=1, temporaryEdgeEntity=-1, firstAddedObjectCount=0}
  end)
  if ok then return value end
  return {code="unavailable"}
end

function M.collect(api, request)
  local field = "request"
  local ok, value = pcall(collect, api, request, function(name) field = name end)
  if ok and type(value) == "table" and value.code == "readback" and type(value.json) == "string" and #value.json <= MAX_JSON then return value end
  if ok and type(value) == "table" and value.code == "unavailable" and value.field == "constructionResourceNil"
    and safeint(value.modelId) and value.modelId >= 0 and value.modelId <= MAX_INT
    and type(value.modelResourceName) == "string" then return value end
  if ok and type(value) == "table" and value.code == "unavailable" and value.field == "constructionResourceSyntax"
    and type(value.constructionResourceValue) == "string" and #value.constructionResourceValue > 0
    and #value.constructionResourceValue <= 1024 then return value end
  return {code="unavailable", field=field}
end
return M
