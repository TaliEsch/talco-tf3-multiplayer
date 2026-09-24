-- Read-only postcondition for one guarded SimpleStreetProposal stop command.
-- No native object survives either call; an uncertain callback remains unknown.
local M = {}
local function fail() error("road stop result unavailable", 0) end
local function native(v) return type(v) == "table" or type(v) == "userdata" end
local function integer(v) return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge
  and v == math.floor(v) and math.abs(v) <= 9007199254740991 end
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
local function roster(api, list, company, progress)
  progress.stage = "roster_shape"
  if not dense(list, 4) or #list < 1 then fail() end
  local players = {}
  progress.stage = "roster_players"
  for _, id in ipairs(list) do
    if not entity(id) or players[id] or api.engine.entityExists(id) ~= true
      or not native(component(api, id, "PLAYER")) then fail() end
    players[id] = true
  end
  if not players[company] then fail() end
  return players
end
local function balance(api, company)
  local amount = api.engine.util.finance.getPlayersBalance(company)
  if not integer(amount) then fail() end
  return amount
end
local function held(api)
  local world = api.engine.util.getWorld()
  if not integer(world) or world < 0 or world > 2147483647 then fail() end
  local speed = component(api, world, "GAME_SPEED")
  local time = component(api, world, "GAME_TIME")
  if not native(speed) or speed.speedup ~= 0 or not native(time)
    or not integer(time.updateCount) or time.updateCount < 0 then fail() end
  return time.updateCount
end
local function snapshot(api, input, companies, progress)
  progress.stage = "input"
  if type(input) ~= "table" or getmetatable(input) ~= nil or not entity(input.edgeEntity)
    or not entity(input.companyEntity) or type(input.model) ~= "string"
    or type(input.left) ~= "boolean" or type(input.param) ~= "number" or input.param ~= input.param
    or input.param < 0 or input.param > 1 then fail() end
  progress.stage = "held"
  local update = held(api)
  progress.stage = "road"
  if api.engine.util.getPlayer() ~= input.companyEntity or api.engine.entityExists(input.edgeEntity) ~= true then fail() end
  local edge = component(api, input.edgeEntity, "BASE_EDGE")
  if not native(edge) or not dense(edge.objects, 0) then fail() end
  progress.stage = "model"
  local model = api.res.modelRep.find(input.model)
  if not integer(model) or model < 0 or model > 2147483647 then fail() end
  local players = roster(api, companies, input.companyEntity, progress)
  local balances = {}
  progress.stage = "balances"
  for company in pairs(players) do balances[company] = balance(api, company) end
  return {code="observed", updateCount=update, companyEntity=input.companyEntity,
    edgeEntity=input.edgeEntity, model=input.model, modelId=model, left=input.left,
    param=input.param, players=players, balances=balances}
end
function M.before(api, input, companies)
  local progress = {stage="input"}
  local ok, value = pcall(snapshot, api, input, companies, progress)
  if ok then return value end
  return {code="unknown", stage=progress.stage}
end
local function verify(api, before, input, data, success, resultEntities, progress)
  progress.stage = "result_shape"
  if type(before) ~= "table" or before.code ~= "observed" or success ~= true
    or before.companyEntity ~= input.companyEntity or before.edgeEntity ~= input.edgeEntity
    or before.model ~= input.model or before.left ~= input.left or before.param ~= input.param
    or not dense(resultEntities, 64) then fail() end
  progress.stage = "result_hold"
  if held(api) ~= before.updateCount then fail() end
  progress.stage = "result_player"
  if api.engine.util.getPlayer() ~= input.companyEntity then fail() end
  progress.stage = "result_road"
  if api.engine.entityExists(input.edgeEntity) ~= false then fail() end
  progress.stage = "result_model"
  if api.res.modelRep.find(input.model) ~= before.modelId then fail() end
  progress.stage = "result_cost"
  local proposal = native(data) and data.resultProposalData
  local cost = native(proposal) and proposal.costs
  if not integer(cost) or cost <= 0 then fail() end
  progress.stage = "result_balances"
  for id in pairs(before.players) do
    if api.engine.entityExists(id) ~= true or not native(component(api, id, "PLAYER")) then fail() end
  end
  for id, prior in pairs(before.balances) do
    local current = balance(api, id)
    if id == input.companyEntity then
      if current ~= prior - cost or current < 0 then fail() end
    elseif current ~= prior then fail() end
  end
  progress.stage = "result_entities"
  local stop, count, affected = nil, 0, {}
  for _, pair in ipairs(resultEntities) do
    if not dense(pair, 2) or #pair ~= 2 or not entity(pair[1])
      or not integer(pair[2]) or pair[2] < 0 or affected[pair[1]] then fail() end
    local id = pair[1]
    affected[id] = true
    if native(component(api, id, "EDGE_OBJECT")) then stop, count = id, count + 1 end
  end
  if count == 0 then
    -- TF3 may omit the new object from the callback's changed-entity vector.
    -- Its completed Proposal exposes the exact resulting edge-object entity.
    -- Never infer an ID from a world scan or accept a contradictory callback.
    local completed = native(data) and data.proposal
    local street = native(completed) and completed.streetProposal
    local objects = native(street) and street.edgeObjectsToAdd
    if not dense(objects, 1) or #objects ~= 1 or not native(objects[1])
      or not entity(objects[1].resultEntity) or affected[objects[1].resultEntity]
      or api.engine.entityExists(objects[1].resultEntity) ~= true
      or not native(component(api, objects[1].resultEntity, "EDGE_OBJECT")) then fail() end
    stop, count = objects[1].resultEntity, 1
  end
  if count ~= 1 then fail() end
  progress.stage = "result_stop"
  local owner = component(api, stop, "PLAYER_OWNED")
  local edgeObject = component(api, stop, "EDGE_OBJECT")
  local models = component(api, stop, "MODEL_INSTANCE_LIST")
  if not native(owner) or owner.player ~= input.companyEntity or not native(edgeObject)
    or type(edgeObject.param) ~= "number" or math.abs(edgeObject.param - input.param) > 0.000001
    or not native(models) or not dense(models.fatInstances, 64) then fail() end
  local modelCount = 0
  for _, instance in ipairs(models.fatInstances) do
    if not native(instance) then fail() end
    if instance.modelId == before.modelId then modelCount = modelCount + 1 end
  end
  if modelCount ~= 1 then fail() end
  progress.stage = "result_attachment"
  local street = api.engine.system and api.engine.system.streetSystem
  local road = street and street.getEdgeForEdgeObject(stop)
  if not entity(road) or road == input.edgeEntity or api.engine.entityExists(road) ~= true then fail() end
  local edge = component(api, road, "BASE_EDGE")
  local enum = api.type.enum and api.type.enum.EdgeObjectType
  local side = enum and (input.left and enum.STOP_LEFT or enum.STOP_RIGHT)
  if not native(edge) or not dense(edge.objects, 64) or side == nil then fail() end
  local attached = 0
  for _, pair in ipairs(edge.objects) do
    if not dense(pair, 2) or #pair ~= 2 then fail() end
    if pair[1] == stop and pair[2] == side then attached = attached + 1 end
  end
  if attached ~= 1 then fail() end
  return {code="verified", stopEntity=stop, edgeEntity=road, chargedCost=cost,
    companyEntity=input.companyEntity, updateCount=before.updateCount}
end
function M.after(api, before, input, data, success, resultEntities)
  local progress = {stage="result_shape"}
  local ok, value = pcall(verify, api, before, input, data, success, resultEntities, progress)
  if ok then return value end
  return {code="unknown",stage=progress.stage}
end
return M
