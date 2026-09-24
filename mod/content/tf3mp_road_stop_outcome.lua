-- Read-only qualification of a saved, uncertain simple road Stop outcome.
-- This never sends a command or infers a stop from an entity-number range.
local M = {}
local function fail() error("outcome unavailable", 0) end
local function native(v) return type(v) == "table" or type(v) == "userdata" end
local function integer(v) return type(v) == "number" and v == v and v ~= math.huge
  and v ~= -math.huge and v == math.floor(v) and math.abs(v) <= 9007199254740991 end
local function entity(v) return integer(v) and v > 0 and v <= 2147483647 end
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
local function probe(api, request, progress)
  progress.stage = "request"
  if type(request) ~= "table" or getmetatable(request) ~= nil then fail() end
  local allowed = {nonce=true, companyEntity=true, originalEdgeEntity=true, model=true,
    param=true, left=true, priorBalance=true, expectedBalance=true, expectedUpdateCount=true}
  local fields = 0
  for key in pairs(request) do if not allowed[key] then fail() end; fields = fields + 1 end
  if fields ~= 9 or type(request.nonce) ~= "string" or #request.nonce ~= 32
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
    or time.updateCount ~= request.expectedUpdateCount then fail() end
  progress.stage = "world_balance"
  if api.engine.util.finance.getPlayersBalance(request.companyEntity) ~= request.expectedBalance then fail() end
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
  if candidates ~= 1 then fail() end
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
return M
