-- Prepare a TF3 SimpleProposal for one stop on an untouched road. This module
-- constructs a command value only; it never sends or executes that command.
local M = {}
local REJECT = {}
local function fail() error(REJECT, 0) end
local function integer(v) return type(v) == "number" and v == math.floor(v) and v >= -2147483647 and v <= 2147483647 end
local function entity(v) return integer(v) and v > 0 end
local function native(v) return type(v) == "table" or type(v) == "userdata" end
local function array(v, count)
  if type(v) ~= "table" or getmetatable(v) ~= nil or #v ~= count then return false end
  local n = 0
  for k in pairs(v) do
    n = n + 1
    if not integer(k) or k < 1 or k > count then return false end
  end
  return n == count
end
local function resource(v)
  if type(v) ~= "string" or #v < 5 or #v > 1024 or v:sub(-4) ~= ".mdl"
    or v:find("\\", 1, true) or v:find("//", 1, true) or v:find("..", 1, true) then fail() end
  local path = v:sub(1, 3) == "::/" and v:sub(4) or v
  if not path:match("^[A-Za-z0-9_][A-Za-z0-9_./-]*$") then fail() end
  return v
end

local function prepare(api, input, progress)
  progress.stage = "input"
  if not native(api) or not native(api.type) or not native(api.engine) or not native(api.cmd)
    or type(input) ~= "table" or getmetatable(input) ~= nil then fail() end
  local allowed = {edgeEntity=true, companyEntity=true, param=true, left=true, oneWay=true, model=true, name=true}
  local count = 0
  for key in pairs(input) do if not allowed[key] then fail() end; count = count + 1 end
  if count ~= 7 or not entity(input.edgeEntity) or not entity(input.companyEntity)
    or type(input.param) ~= "number" or input.param ~= input.param or input.param < 0 or input.param > 1
    or type(input.left) ~= "boolean" or type(input.oneWay) ~= "boolean"
    or type(input.name) ~= "string" or #input.name > 1024 or input.name:find("\0", 1, true) then fail() end
  resource(input.model)
  progress.stage = "world"
  local types = api.type.ComponentType
  if not native(types) or types.PLAYER == nil or types.BASE_EDGE == nil or types.GAME_SPEED == nil then fail() end
  if api.engine.entityExists(input.edgeEntity) ~= true or api.engine.entityExists(input.companyEntity) ~= true then fail() end
  if not native(api.engine.getComponent(input.companyEntity, types.PLAYER)) then fail() end
  local edge = api.engine.getComponent(input.edgeEntity, types.BASE_EDGE)
  if not native(edge) or not array(edge.objects, 0) then fail() end
  if not entity(edge.node0) or not entity(edge.node1) or edge.node0 == edge.node1 then fail() end
  local world = api.engine.util.getWorld()
  local speed = api.engine.getComponent(world, types.GAME_SPEED)
  if not native(speed) or speed.speedup ~= 0 then fail() end
  progress.stage = "model"
  local rep = api.res and api.res.modelRep
  if not native(rep) then fail() end
  local modelId = rep.find(input.model)
  if not integer(modelId) or modelId < 0 then fail() end
  -- The repository lookup accepts the UI's ::/ alias. The proposal
  -- converter expects the relative resource name without that prefix.
  local modelName = input.model:sub(1, 3) == "::/" and input.model:sub(4) or input.model
  resource(modelName)

  progress.stage = "factory"
  local factory = api.engine.util.proposal
  if not native(factory) or factory.replaceSegment == nil then fail() end
  progress.stage = "factoryCall"
  local replacement = factory.replaceSegment(input.edgeEntity)
  if not native(replacement) or not native(replacement.proposal) then fail() end
  local street = replacement.proposal
  progress.stage = "factoryAddedSegments"
  if not array(street.addedSegments, 1) then fail() end
  progress.stage = "factoryRemovedSegments"
  if not array(street.removedSegments, 1) then fail() end
  progress.stage = "factoryAddedNodes"
  if not array(street.addedNodes, 0) then fail() end
  progress.stage = "factoryRemovedNodes"
  if not array(street.removedNodes, 0) then fail() end
  progress.stage = "factoryEdgeObjects"
  if not array(street.edgeObjectsToAdd, 0) then fail() end
  progress.stage = "factoryNodeConfigsAdd"
  if not array(street.nodeConfigsToAdd, 2) then fail() end
  progress.stage = "factoryNodeConfigsRemove"
  if not array(street.nodeConfigsToRemove, 2) then fail() end
  local removedConfigs = {}
  for _, id in ipairs(street.nodeConfigsToRemove) do
    if (id ~= edge.node0 and id ~= edge.node1) or removedConfigs[id] then fail() end
    removedConfigs[id] = true
  end
  local addedConfigs = {}
  for _, config in ipairs(street.nodeConfigsToAdd) do
    if not native(config) or not removedConfigs[config.entity] or addedConfigs[config.entity]
      or not native(config.comp) then fail() end
    addedConfigs[config.entity] = true
  end
  if not addedConfigs[edge.node0] or not addedConfigs[edge.node1] then fail() end
  progress.stage = "factoryFirstSegment"
  local added, removed = street.addedSegments[1], street.removedSegments[1]
  if not native(added) or not native(removed) or added.entity ~= -1 or removed.entity ~= input.edgeEntity
    or not native(added.comp) or not array(added.comp.objects, 0) then fail() end

  progress.stage = "constructor"
  local simple = api.type.SimpleProposal.new()
  local simpleStreet = api.type.SimpleStreetProposal.new()
  local object = api.type.SimpleStreetProposal.EdgeObject.new()
  if not native(simple) or not native(simpleStreet) or not native(object) then fail() end
  object.edgeEntity, object.param, object.oneWay = added.entity, input.param, input.oneWay
  object.left, object.model, object.playerEntity, object.name = input.left, modelName, input.companyEntity, input.name
  simpleStreet.edgesToAdd, simpleStreet.edgesToRemove = {added}, {input.edgeEntity}
  simpleStreet.edgeObjectsToAdd = {object}
  simpleStreet.nodeConfigsToAdd = street.nodeConfigsToAdd
  simpleStreet.nodeConfigsToRemove = street.nodeConfigsToRemove
  simple.streetProposal = simpleStreet
  local context = api.type.Context.new()
  if not native(context) then fail() end
  context.player = input.companyEntity

  progress.stage = "command"
  local command = api.cmd.makeWorldBuildProposalCmd(simple, context, false, true, false)
  if command == nil then fail() end
  return {code="prepared", command=command, edgeEntity=input.edgeEntity, companyEntity=input.companyEntity,
    temporaryEdgeEntity=added.entity, limitations={"not_sent", "not_engine_verified"}}
end

function M.prepare(api, input)
  local progress = {stage="input"}
  local ok, result = pcall(prepare, api, input, progress)
  if ok then return result end
  if result == REJECT then return {code="rejected", stage=progress.stage} end
  return {code="unknown", stage=progress.stage}
end

return M
