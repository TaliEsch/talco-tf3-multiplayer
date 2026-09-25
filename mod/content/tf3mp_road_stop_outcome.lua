-- Read-only qualification of a saved, uncertain simple road Stop outcome.
-- This never sends a command or infers a stop from an entity-number range.
local M = {}
local function fail() error("outcome unavailable", 0) end
local function native(v) return type(v) == "table" or type(v) == "userdata" end
local function integer(v) return type(v) == "number" and v == v and v ~= math.huge
  and v ~= -math.huge and v == math.floor(v) and math.abs(v) <= 9007199254740991 end
local function entity(v) return integer(v) and v > 0 and v <= 2147483647 end
local function finite(v) return type(v) == "number" and v == v
  and v ~= math.huge and v ~= -math.huge end
local function dense(v, limit)
  if type(v) ~= "table" or getmetatable(v) ~= nil or #v > limit then return false end
  local count = 0
  for key in pairs(v) do
    count = count + 1
    if type(key) ~= "number" or key ~= math.floor(key) or key < 1 or key > #v then return false end
  end
  return count == #v
end
local function component(api, id, name)
  local kind = api.type.ComponentType[name]
  if kind == nil then fail() end
  return api.engine.getComponent(id, kind)
end
local function geometry(edge)
  if not native(edge) then fail() end
  local out = {missingFields={}}
  local function field(value, key)
    local ok, result = pcall(function() return value[key] end)
    return ok and result or nil
  end
  for _, key in ipairs({"node0", "node1"}) do
    local value = field(edge, key)
    if entity(value) then out[key] = value
    else table.insert(out.missingFields, key) end
  end
  local distance = field(edge, "distance")
  if finite(distance) and distance > 0 then out.distance = distance
  else table.insert(out.missingFields, "distance") end
  for _, key in ipairs({"position0", "position1", "tangent0", "tangent1"}) do
    local value = field(edge, key)
    local x, y, z = native(value) and field(value, "x"),
      native(value) and field(value, "y"), native(value) and field(value, "z")
    if finite(x) and finite(y) and finite(z) then out[key] = {x, y, z}
    else table.insert(out.missingFields, key) end
  end
  return out
end
local function probe(api, request, progress)
  progress.stage = "request"
  if type(request) ~= "table" or getmetatable(request) ~= nil then fail() end
  local allowed = {nonce=true, companyEntity=true, originalEdgeEntity=true, model=true,
    param=true, left=true, priorBalance=true, expectedBalance=true, expectedUpdateCount=true,
    phase=true}
  local fields = 0
  for key in pairs(request) do if not allowed[key] then fail() end; fields = fields + 1 end
  if (fields ~= 9 and fields ~= 10) or (request.phase ~= nil and request.phase ~= "source"
    and request.phase ~= "outcome_diagnostic") or type(request.nonce) ~= "string" or #request.nonce ~= 32
    or not request.nonce:match("^[0-9a-f]+$") or not entity(request.companyEntity)
    or not entity(request.originalEdgeEntity) or type(request.model) ~= "string"
    or #request.model < 5 or #request.model > 1024 or type(request.left) ~= "boolean"
    or type(request.param) ~= "number" or request.param < 0 or request.param > 1
    or not integer(request.priorBalance) or not integer(request.expectedBalance)
    or request.expectedBalance < 0 or request.priorBalance <= request.expectedBalance
    or not integer(request.expectedUpdateCount) or request.expectedUpdateCount < 0 then fail() end
  progress.stage = "world_identity"
  local world = api.engine.util.getWorld()
  if not integer(world) then fail() end
  progress.stage = "world_company"
  if api.engine.util.getPlayer() ~= request.companyEntity then fail() end
  progress.stage = "world_original_road"
  local originalIdPresent = api.engine.entityExists(request.originalEdgeEntity)
  if type(originalIdPresent) ~= "boolean" then fail() end
  progress.stage = "world_clock"
  local speed, time = component(api, world, "GAME_SPEED"), component(api, world, "GAME_TIME")
  if not native(speed) or speed.speedup ~= 0 or not native(time)
    or not integer(time.updateCount) or time.updateCount < 0
    or (request.phase ~= "source" and time.updateCount ~= request.expectedUpdateCount) then fail() end
  progress.stage = "world_balance"
  local balance = api.engine.util.finance.getPlayersBalance(request.companyEntity)
  if not integer(balance) or balance < 0
    or (request.phase ~= "source" and balance ~= request.expectedBalance) then fail() end
  progress.stage = "model"
  local modelId = api.res.modelRep.find(request.model)
  if not integer(modelId) or modelId < 0 or modelId > 2147483647 then fail() end
  local kinds = api.type.enum and api.type.enum.EdgeObjectType
  local side = kinds and (request.left and kinds.STOP_LEFT or kinds.STOP_RIGHT)
  if side == nil then fail() end
  progress.stage = "street_map"
  local street = api.engine.system and api.engine.system.streetSystem
  local map = street and street.getEdgeObject2EdgeMap()
  if type(map) ~= "table" then fail() end
  local entries, candidates, stop, edgeId = 0, 0, nil, nil
  for objectId, roadId in pairs(map) do
    entries = entries + 1
    if entries > 500000 or not entity(objectId) or not entity(roadId) then fail() end
    local object = component(api, objectId, "EDGE_OBJECT")
    if native(object) and type(object.param) == "number"
      and math.abs(object.param - request.param) <= 0.000001 then
      local owner = component(api, objectId, "PLAYER_OWNED")
      if native(owner) and owner.player == request.companyEntity then
        local models = component(api, objectId, "MODEL_INSTANCE_LIST")
        if native(models) and dense(models.fatInstances, 64) then
          for _, instance in ipairs(models.fatInstances) do
            if native(instance) and instance.modelId == modelId then
              progress.stage = "attachment"
              if api.engine.entityExists(objectId) ~= true or api.engine.entityExists(roadId) ~= true
                or street.getEdgeForEdgeObject(objectId) ~= roadId then fail() end
              local edge = component(api, roadId, "BASE_EDGE")
              if not native(edge) or not dense(edge.objects, 64) then fail() end
              local attached = 0
              for _, pair in ipairs(edge.objects) do
                if not dense(pair, 2) or #pair ~= 2 then fail() end
                if pair[1] == objectId and pair[2] == side then attached = attached + 1 end
              end
              if attached ~= 1 then fail() end
              candidates, stop, edgeId = candidates + 1, objectId, roadId
              break
            end
          end
        end
      end
    end
  end
  progress.stage = "unique"
  if request.phase == "source" then
    if not originalIdPresent or candidates ~= 0 then fail() end
    local original = component(api, request.originalEdgeEntity, "BASE_EDGE")
    if not native(original) or not dense(original.objects, 0) then fail() end
    progress.stage = "source_geometry"
    return {code="source_diagnostic", nonce=request.nonce,
      originalEdgeEntity=request.originalEdgeEntity, originalRoad=geometry(original),
      matchingStops=0, companyEntity=request.companyEntity,
      balance=balance, updateCount=time.updateCount}
  end
  if candidates ~= 1 then fail() end
  if request.phase == "outcome_diagnostic" then
    progress.stage = "outcome_geometry"
    local original = originalIdPresent and component(api, request.originalEdgeEntity, "BASE_EDGE") or nil
    return {code="outcome_diagnostic", nonce=request.nonce, stopEntity=stop,
      stopRoadEntity=edgeId, stopRoad=geometry(component(api, edgeId, "BASE_EDGE")),
      originalIdPresent=originalIdPresent, originalIdIsRoad=native(original),
      originalRoad=native(original) and geometry(original) or nil,
      companyEntity=request.companyEntity, balance=balance,
      updateCount=request.expectedUpdateCount, matchingStops=1}
  end
  -- A present original ID is acceptable only when it is the road carrying
  -- this verified stop. Its meaning after save/load needs separate evidence.
  progress.stage = "original_road_conflict"
  if originalIdPresent and edgeId ~= request.originalEdgeEntity then fail() end
  return {code="observed", nonce=request.nonce, stopEntity=stop, edgeEntity=edgeId,
    companyEntity=request.companyEntity, balance=request.expectedBalance,
    updateCount=request.expectedUpdateCount, originalIdPresent=originalIdPresent,
    chargedCost=request.priorBalance - request.expectedBalance}
end
function M.probe(api, request)
  local progress = {stage="request"}
  local ok, result = pcall(probe, api, request, progress)
  if ok then return result end
  return {code="unknown", nonce=type(request) == "table" and request.nonce or "", stage=progress.stage}
end

-- Independent, targeted readback while an ordered action remains held. The
-- engine execution receipt supplies IDs, but this query reads the live world
-- through the GUI API and never sends a construction command.
function M.probeOrdered(api, request)
  local progress = {stage="request"}
  local function inspect()
    if type(request) ~= "table" or getmetatable(request) ~= nil then fail() end
    local allowed = {schemaVersion=true, kind=true, nonce=true, requestId=true,
      hostSequence=true, company=true, sourceRoad=true, road=true, stop=true,
      update=true, balance=true, charge=true}
    local fields = 0
    for key in pairs(request) do if not allowed[key] then fail() end; fields = fields + 1 end
    if fields ~= 12 or request.schemaVersion ~= 1
      or request.kind ~= "ordered_road_readback_request"
      or type(request.nonce) ~= "string" or #request.nonce ~= 32
      or not request.nonce:match("^[0-9a-f]+$")
      or not entity(request.requestId) or not entity(request.hostSequence)
      or not entity(request.company) or not entity(request.sourceRoad)
      or not entity(request.road) or not entity(request.stop)
      or request.sourceRoad == request.road
      or not integer(request.update) or request.update < 0
      or not integer(request.balance) or request.balance < 0
      or not integer(request.charge) or request.charge < 1 then fail() end
    progress.stage = "clock"
    local world = api.engine.util.getWorld()
    local speed = component(api, world, "GAME_SPEED")
    local time = component(api, world, "GAME_TIME")
    if not native(speed) or speed.speedup ~= 0
      or not native(time) or time.updateCount ~= request.update
      or api.engine.util.getPlayer() ~= request.company then fail() end
    progress.stage = "balance"
    if api.engine.util.finance.getPlayersBalance(request.company) ~= request.balance then fail() end
    progress.stage = "source_road"
    local sourcePresent = api.engine.entityExists(request.sourceRoad)
    if type(sourcePresent) ~= "boolean" then fail() end
    if sourcePresent and native(component(api, request.sourceRoad, "BASE_EDGE")) then fail() end
    progress.stage = "stop"
    if api.engine.entityExists(request.stop) ~= true then fail() end
    local object = component(api, request.stop, "EDGE_OBJECT")
    local owner = component(api, request.stop, "PLAYER_OWNED")
    if not native(object) or not native(owner) or owner.player ~= request.company then fail() end
    progress.stage = "attachment"
    local street = api.engine.system and api.engine.system.streetSystem
    if not street or street.getEdgeForEdgeObject(request.stop) ~= request.road then fail() end
    local road = component(api, request.road, "BASE_EDGE")
    if not native(road) or not dense(road.objects, 64) then fail() end
    local attached = 0
    for _, pair in ipairs(road.objects) do
      if not dense(pair, 2) or #pair ~= 2 then fail() end
      if pair[1] == request.stop then attached = attached + 1 end
    end
    if attached ~= 1 then fail() end
    return {schemaVersion=1, kind="ordered_road_readback_receipt", code="observed",
      nonce=request.nonce, requestId=request.requestId, hostSequence=request.hostSequence,
      company=request.company, sourceRoad=request.sourceRoad, road=request.road,
      stop=request.stop, update=request.update, balance=request.balance,
      charge=request.charge}
  end
  local ok, result = pcall(inspect)
  if ok then return result end
  return {schemaVersion=1, kind="ordered_road_readback_receipt", code="unknown",
    nonce=type(request)=="table" and request.nonce or "",
    requestId=type(request)=="table" and request.requestId or 0,
    stage=progress.stage}
end
return M
