-- EXPERIMENTAL / UNREGISTERED.  Creates a command value only; never sends it.
local M = {}
local REJECT = {}
local function fail() error(REJECT, 0) end
local function integer(v) return type(v) == "number" and v == math.floor(v) and v >= -2147483648 and v <= 2147483647 end
local function prepare(capture, modelResource, targetCompany, api, rebuild, preflight, components)
  if type(capture) ~= "table" or type(modelResource) ~= "table" or not integer(modelResource.modelId) or type(modelResource.resourceName) ~= "string" or modelResource.resourceName == "" or not integer(targetCompany) or targetCompany <= 0 or type(api) ~= "table" or type(rebuild) ~= "table" or type(rebuild.rebuild) ~= "function" or type(preflight) ~= "table" or type(preflight.verify) ~= "function" then fail() end
  local street = capture.proposal and capture.proposal.street
  local object = street and street.edgeObjectsToAdd and street.edgeObjectsToAdd[1]
  if type(object) ~= "table" or object.playerEntity ~= targetCompany or type(object.modelInstance) ~= "table" or not integer(object.modelInstance.modelId) or object.modelInstance.modelId < 0 or modelResource.modelId ~= object.modelInstance.modelId then fail() end
  local proof = preflight.verify(capture, api, targetCompany)
  if type(proof) ~= "table" or proof.code ~= "unregistered_preflight_checked" or type(proof.proof) ~= "table" or type(proof.proof.removedSegments) ~= "table" then fail() end
  if not api.res or not api.res.modelRep or type(api.res.modelRep.getName) ~= "function" or type(api.res.modelRep.find) ~= "function" then fail() end
  local id = object.modelInstance.modelId
  if api.res.modelRep.getName(id) ~= modelResource.resourceName or api.res.modelRep.find(modelResource.resourceName) ~= id then fail() end
  if not api.type then fail() end
  components = components or {} -- wrappers may provide all initialized components
  if type(components) ~= "table" then fail() end
  -- New wrapper only: never add qualification data to api.type itself.
  local function typeField(name, optional)
    local ok, value = pcall(function() return api.type[name] end)
    if not ok then if optional then return nil end; fail() end
    return value
  end
  local types = {Proposal=typeField("Proposal"), Context=typeField("Context"), NodeAndEntity=typeField("NodeAndEntity"), SegmentAndEntity=typeField("SegmentAndEntity"), Vec3f=typeField("Vec3f"), Vec4f=typeField("Vec4f"), Mat4f=typeField("Mat4f"), GridVec2f=typeField("GridVec2f", true), enum=typeField("enum"), qualifiedPrecedenceValues={}}
  local seenPrecedence = {}
  for _, segment in ipairs(proof.proof.removedSegments) do
    if type(segment) ~= "table" then fail() end
    for _, value in ipairs({segment.precedenceNode0, segment.precedenceNode1}) do
      if not integer(value) then fail() end
      if not seenPrecedence[value] then seenPrecedence[value] = true; types.qualifiedPrecedenceValues[#types.qualifiedPrecedenceValues + 1] = value end
    end
  end
  if #types.qualifiedPrecedenceValues == 0 or #types.qualifiedPrecedenceValues > 3 then fail() end
  local rebuilt = rebuild.rebuild(capture, types, components)
  if type(rebuilt) ~= "table" or rebuilt.code ~= "unregistered" or rebuilt.proposal == nil then fail() end
  if not types.Context or type(types.Context.new) ~= "function" or not api.cmd or type(api.cmd.makeWorldBuildProposalCmd) ~= "function" then fail() end
  local context = types.Context.new(); if context == nil then fail() end
  context.player = targetCompany
  local command = api.cmd.makeWorldBuildProposalCmd(rebuilt.proposal, context, false, true, false)
  if command == nil then fail() end
  return {code="prepared", command=command, context=context, limitations={"not_sent","factory_only_no_funds_enforcement","no_replay_or_postcondition_proof"}}
end
function M.prepare(capture, modelResource, targetCompany, api, rebuild, preflight, components)
  local ok, result = pcall(prepare, capture, modelResource, targetCompany, api, rebuild, preflight, components)
  if ok then return result end
  if type(result) == "table" and rawequal(result, REJECT) then return {code="rejected"} end
  return {code="unknown"}
end
return M
