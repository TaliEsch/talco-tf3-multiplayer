-- Local replay result. Read-only receipt evidence for one normal
-- curb-stop replay.  This module never sends commands or changes engine state.
local M = {}
local REJECT = {}
local MAX_PLAYERS, MAX_EDGE_OBJECTS, MAX_RESULTS, MAX_CAPTURE = 64, 100000, 64, 64

local function fail() error(REJECT, 0) end
local function finite(v) return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge end
local function integer(v) return finite(v) and v == math.floor(v) and v >= -2147483648 and v <= 2147483647 end
local function safeInteger(v) return finite(v) and v == math.floor(v) and v >= -9007199254740991 and v <= 9007199254740991 end
local function entity(v) return integer(v) and v > 0 end
local function array(v, limit)
  if type(v) ~= "table" or #v > limit then return false end
  local count = 0
  for k in pairs(v) do
    count = count + 1
    if count > limit or type(k) ~= "number" or k < 1 or k > #v or k ~= math.floor(k) then return false end
  end
  return count == #v
end
local function get(api, id, kind)
  local component = api and api.type and api.type.ComponentType and api.type.ComponentType[kind]
  if (not entity(id) and not (kind == "GAME_SPEED" and id == 0)) or component == nil or not api.engine or type(api.engine.getComponent) ~= "function" then fail() end
  return api.engine.getComponent(id, component)
end
local function paused(api)
  if not api or not api.engine or not api.engine.util or type(api.engine.util.getWorld) ~= "function" then fail() end
  local world = api.engine.util.getWorld()
  if not entity(world) and world ~= 0 then fail() end
  local speed = get(api, world, "GAME_SPEED")
  if type(speed) ~= "table" and type(speed) ~= "userdata" then fail() end
  return speed.speedup == 0
end
local function balance(api, company)
  if not api or not api.engine or not api.engine.util or not api.engine.util.finance or type(api.engine.util.finance.getPlayersBalance) ~= "function" then fail() end
  local value = api.engine.util.finance.getPlayersBalance(company)
  if not safeInteger(value) then fail() end
  return value
end
local function copiedStop(capture, modelResource, target)
  if type(capture) ~= "table" or capture.schemaVersion ~= 1 or capture.builderId ~= "streetTerminalBuilder"
    or type(modelResource) ~= "table" or type(modelResource.resourceName) ~= "string" or #modelResource.resourceName == 0 or #modelResource.resourceName > 1024
    or not entity(target) then fail() end
  local street = capture.proposal and capture.proposal.street
  local objects = street and street.edgeObjectsToAdd
  if not array(objects, MAX_CAPTURE) or #objects ~= 1 then fail() end
  local stop = objects[1]
  local model = type(stop) == "table" and stop.modelInstance
  if type(model) ~= "table" or stop.playerEntity ~= target or not integer(model.modelId) or model.modelId < 0
    or modelResource.modelId ~= model.modelId or not array(model.transf, 16) or #model.transf ~= 16 then fail() end
  for i = 1, 16 do if not finite(model.transf[i]) then fail() end end
  local removed = street.removedSegments
  if not array(removed, MAX_CAPTURE) or #removed == 0 then fail() end
  local removedIds = {}
  for _, segment in ipairs(removed) do
    if type(segment) ~= "table" or not entity(segment.entity) or removedIds[segment.entity] then fail() end
    removedIds[segment.entity] = true
  end
  return model.modelId, model.transf, removedIds
end
local function modelIdentity(api, id, resource)
  local rep = api and api.res and api.res.modelRep
  if not rep or type(rep.find) ~= "function" or type(rep.getName) ~= "function" then fail() end
  return rep.find(resource) == id and rep.getName(id) == resource
end
local function members(api, kind, limit)
  if not api or not api.engine or type(api.engine.getEntitiesWithComponent) ~= "function" or not api.type or not api.type.ComponentType then fail() end
  local list = api.engine.getEntitiesWithComponent(api.type.ComponentType[kind])
  if not array(list, limit) then fail() end
  local out = {}
  for _, id in ipairs(list) do if not entity(id) or out[id] then fail() end; out[id] = true end
  return out
end
local function sameTransform(api, actual, copied)
  if not api or not api.type or not api.type.Mat4f or type(api.type.Mat4f.cols) ~= "function" then fail() end
  for col = 1, 4 do
    local vector = api.type.Mat4f.cols(actual, col)
    if (type(vector) ~= "table" and type(vector) ~= "userdata") then return false end
    local i = (col - 1) * 4
    if vector.x ~= copied[i + 1] or vector.y ~= copied[i + 2] or vector.z ~= copied[i + 3] or vector.w ~= copied[i + 4] then return false end
  end
  return true
end
local function matchingStop(api, id, target, modelId, transf)
  local owned = get(api, id, "PLAYER_OWNED")
  if (type(owned) ~= "table" and type(owned) ~= "userdata") or owned.player ~= target then return false end
  local instances = get(api, id, "MODEL_INSTANCE_LIST")
  local fat = instances and instances.fatInstances
  if not array(fat, MAX_CAPTURE) then return false end
  local matches = 0
  for _, instance in ipairs(fat) do
    if (type(instance) ~= "table" and type(instance) ~= "userdata") then return false end
    if instance.modelId == modelId and sameTransform(api, instance.transf, transf) then matches = matches + 1 end
  end
  return matches == 1
end
local function observe(capture, modelResource, target, api)
  local modelId, transf, removed = copiedStop(capture, modelResource, target)
  if not modelIdentity(api, modelId, modelResource.resourceName) or not paused(api) then fail() end
  local players, edges = members(api, "PLAYER", MAX_PLAYERS), members(api, "EDGE_OBJECT", MAX_EDGE_OBJECTS)
  if not players[target] then fail() end
  local balances = {}
  for id in pairs(players) do balances[id] = balance(api, id) end
  -- Snapshot data contains only Lua scalars/tables; no component userdata escapes.
  return {code="observed", targetCompany=target, modelId=modelId, resourceName=modelResource.resourceName,
    transform={table.unpack(transf)}, players=players, balances=balances, edgeObjects=edges, removedSegments=removed, paused=true}
end
function M.before(capture, modelResource, targetCompany, api)
  local ok, result = pcall(observe, capture, modelResource, targetCompany, api)
  if ok then return result end
  return {code="unknown"}
end

local function verify(before, capture, modelResource, target, api, data, success, resultEntities)
  if type(before) ~= "table" or before.code ~= "observed" or before.targetCompany ~= target
    or before.resourceName ~= (modelResource and modelResource.resourceName) or before.paused ~= true
    or type(before.transform) ~= "table" or type(before.players) ~= "table" or type(before.balances) ~= "table" or type(before.edgeObjects) ~= "table" or type(before.removedSegments) ~= "table" then fail() end
  local modelId, transf, removed = copiedStop(capture, modelResource, target)
  if before.modelId ~= modelId or not modelIdentity(api, modelId, modelResource.resourceName) or not paused(api) or success ~= true then fail() end
  if #before.transform ~= 16 then fail() end
  for i = 1, 16 do if before.transform[i] ~= transf[i] then fail() end end
  for id in pairs(removed) do if not before.removedSegments[id] then fail() end end
  for id in pairs(before.removedSegments) do if not removed[id] then fail() end end
  if not array(resultEntities, MAX_RESULTS) or #resultEntities == 0 then fail() end
  local resultIds = {}
  for _, pair in ipairs(resultEntities) do
    -- Public cmd declaration defines each entry as {entity, revision}, never a map.
    if not array(pair, 2) or #pair ~= 2 or not entity(pair[1]) or not integer(pair[2]) or pair[2] < 0 or resultIds[pair[1]] then fail() end
    resultIds[pair[1]] = true
  end
  if (type(data) ~= "table" and type(data) ~= "userdata") or (type(data.resultProposalData) ~= "table" and type(data.resultProposalData) ~= "userdata") then fail() end
  local cost = data.resultProposalData.costs
  if not safeInteger(cost) or cost <= 0 then fail() end
  local afterEdges = members(api, "EDGE_OBJECT", MAX_EDGE_OBJECTS)
  local afterPlayers = members(api, "PLAYER", MAX_PLAYERS)
  for id in pairs(before.players) do if not afterPlayers[id] then fail() end end
  for id in pairs(afterPlayers) do if not before.players[id] then fail() end end
  local new, newCount = nil, 0
  for id in pairs(afterEdges) do if not before.edgeObjects[id] then new, newCount = id, newCount + 1 end end
  if newCount ~= 1 or not resultIds[new] then fail() end
  for id in pairs(before.edgeObjects) do if not afterEdges[id] then fail() end end
  if not matchingStop(api, new, target, modelId, transf) then fail() end
  local seen = 0
  for id, prior in pairs(before.balances) do
    if not entity(id) or not safeInteger(prior) then fail() end
    local current = balance(api, id)
    if id == target then
      if current ~= prior - cost or current < 0 then fail() end
    elseif current ~= prior then fail() end
    seen = seen + 1
  end
  if seen == 0 or before.balances[target] == nil then fail() end
  for id in pairs(removed) do if get(api, id, "BASE_EDGE") ~= nil then fail() end end
  return {code="verified", stopEntity=new, chargedCost=cost, targetCompany=target,
    limitations={"road_stop_ownership_and_debit_only","not_funds_enforcement","not_worldsync","not_service_verification"}}
end
function M.after(before, capture, modelResource, targetCompany, api, data, success, resultEntities)
  local ok, result = pcall(verify, before, capture, modelResource, targetCompany, api, data, success, resultEntities)
  if ok then return result end
  return {code="unknown"}
end
return M
