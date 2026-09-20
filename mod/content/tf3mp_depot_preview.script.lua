-- Read-only native TF3 preview. Runtime qualification remains outstanding.
-- No game commands, userdata IPC, resource edits or company switching.
-- Copy only scalar display data during the native callback. Never retain its
-- Proposal/ProposalData arguments or treat viewer costs as authority to build.
local M = {}
local function integer(n)
  return type(n) == "number" and n == math.floor(n) and n > 0 and n <= 2147483647
end
local function finite(n, bound)
  return type(n) == "number" and n == n and math.abs(n) <= bound
end

function M.create(request)
  assert(integer(request.originalCompany) and integer(request.targetCompany)
    and request.originalCompany ~= request.targetCompany, "SEPARATE_COMPANY_REQUIRED")
  assert(finite(request.x, 100000) and finite(request.y, 100000)
    and finite(request.z, 10000) and finite(request.yaw, math.pi), "INVALID_PLACEMENT")
  assert(type(request.resource) == "string" and #request.resource <= 256, "INVALID_RESOURCE")
  -- Resolve against the actual repository, never assume an archive filename is
  -- the runtime resource identifier. Only the stock road-depot suffix is allowed.
  assert(request.resource:match("/road/road_depot/road_depot%.con$"), "ROAD_DEPOT_REQUIRED")
  local resourceId = api.res.constructionRep.find(request.resource)
  assert(resourceId ~= -1, "RESOURCE_NOT_INSTALLED")
  assert(api.res.constructionRep.getName(resourceId) == request.resource, "RESOURCE_CHANGED")
  local desc = api.res.constructionRep.get(resourceId)
  local parameters = {}
  for _, parameter in ipairs(desc.params) do
    assert(type(parameter.key) == "string" and type(parameter.defaultIndex) == "number", "UNSUPPORTED_DEFAULT_PARAMETER")
    parameters[parameter.key] = parameter.defaultIndex
  end
  -- Engine construction parameters include a seed in addition to selectable
  -- resource parameters. Native proposal processing asserts if it is absent.
  -- Keep this read-only preview reproducible without touching the global RNG.
  parameters.seed = 1
  -- Copy all intent values; UI edits require a new preview instance.
  local original, target = request.originalCompany, request.targetCompany
  local resource = request.resource
  local c, s = math.cos(request.yaw), math.sin(request.yaw)
  local transform = api.type.Mat4f.new(
    api.type.Vec4f.new(c, s, 0, 0), api.type.Vec4f.new(-s, c, 0, 0),
    api.type.Vec4f.new(0, 0, 1, 0), api.type.Vec4f.new(request.x, request.y, request.z, 1))
  local construction = api.type.SimpleProposal.ConstructionEntity.new()
  construction.fileName = resource
  construction.params = parameters
  construction.transf = transform
  construction.name = "TalCo disposable test depot"
  construction.playerEntity = target
  construction.autoFillSlots = false
  local simple = api.type.SimpleProposal.new()
  simple.constructionsToAdd = {construction}
  simple.constructionsToRemove = {}
  simple.old2new = {}
  local closed = false
  local waitingSamples = 0
  local result = {status = "awaiting_preview", buildReady = false}
  local instance = {}
  -- Stable callback/parameter identity avoids recreating the native preview on
  -- each 0.5-second observation render.
  local viewerParameters = {simpleProposal = simple, entityForRefundableContext = target,
    proposalId = "talco-depot," .. tostring(target) .. "," .. tostring(request.placementId),
    onCreateProposalData = function(data)
      if closed then return end
      -- Matches the first-party bridge_and_tunnel.tl callback: read the first
      -- argument immediately. Return primitives only, never native references.
      -- This is an estimate, NOT independently verified target-company pricing.
      result = {status = "quote_unavailable", code = "PREVIEW_DATA_UNAVAILABLE", buildReady = false}
      local ok, cost, critical, errors, warnings = pcall(function()
        return data.costs, data.errorState.critical,
          #data.errorState.messages, #data.errorState.warnings
      end)
      if ok and finite(cost, 9007199254740991) and cost == math.floor(cost)
        and type(critical) == "boolean" and finite(errors, 10000) and finite(warnings, 10000) then
        result = {status = "preview_estimate", cost = cost, critical = critical,
          errorCount = errors, warningCount = warnings, buildReady = false}
      end
    end}

  function instance.refresh()
    if closed then return end
    if result.status == "awaiting_preview" then
      waitingSamples = waitingSamples + 1
      if waitingSamples >= 30 then
        result = {status = "quote_unavailable", code = "PREVIEW_CALLBACK_TIMEOUT", buildReady = false}
      end
    end
  end

  function instance.viewerParams()
    assert(not closed, "PREVIEW_CLOSED")
    return viewerParameters
  end

  function instance.snapshot()
    local copy = {}
    for key, value in pairs(result) do copy[key] = value end
    return copy
  end

  function instance.close()
    closed = true
    result = {status = "closed", buildReady = false}
  end
  function instance.isClosed() return closed end
  return instance
end

-- Caller must mount a fresh recipe identity for each changed placement. This
-- component is deliberately not registered as an always-on game-bar plugin.
-- The future guided Phase 2 entry supplies a validated plan, and closes it when
-- leaving that stage. No temporary native construction restrictions are added.
function M.registerRecipe()
  local react = ug_require "::/gui/main/react.lua"
  local builtin = ug_require "::/gui/main/builtin.lua"
  local engineReact = ug_require "::/gui/main/engine_react_util.tl"
  local gameGlobals = ug_require "::/gui/main/game_react_globals.tl"
  local function action(preview)
    return function()
      local children = {}
      if preview and not preview.isClosed() then
        children[1] = builtin.ProposalViewer(preview.viewerParams())
      end
      return builtin.ActionDescriptor{children=children}
    end
  end
  local PreviewTool = react.RegisterTool{
    name="TalCoReadOnlyDepotPreview",
    push=function(ctx,param)
      param.control.context=ctx
      ctx.setActionFn(action(param.preview))
    end,
    pop=function(_,param) param.control.context=nil end,
    shelve=function() end,
  }
  return react.RegisterRecipe("TalCoDepotPreview", function(params)
    local holder = react.useRefLazy(function() return {} end)
    if holder:get().placementId ~= params.placementId then
      if holder:get().preview then holder:get().preview.close() end
      local ok, preview = pcall(M.create, params)
      holder:set({placementId = params.placementId, preview = ok and preview or nil})
    end
    local preview = holder:get().preview
    local tool = react.useRefLazy(function() return {active=false,context=nil,preview=nil} end)
    react.onStep(function()
      local state=tool:get()
      if not preview then return end
      local stack=gameGlobals.getDefaultToolStackApi()
      if not stack then return end
      if not state.active then
        state.active=true
        stack.push(PreviewTool,"tf3mp-depot-preview",{control=state,preview=preview},true)
        state.preview=preview
      elseif state.context and state.preview ~= preview then
        state.context.setActionFn(action(preview))
        state.preview=preview
      end
    end)
    local observed = engineReact.useStepStateTimer(function()
      if not preview then return {status = "preview_unavailable", buildReady = false} end
      preview.refresh()
      return preview.snapshot()
    end, 0.5)
    react.onUnmount(function()
      if preview then preview.close() end
      local state=tool:get()
      local stack=gameGlobals.getDefaultToolStackApi()
      if stack and state.active then stack.pop(PreviewTool,"tf3mp-depot-preview") end
      state.active=false
    end)
    local sample = observed:old()
    local text = "Depot preview unavailable.\nNo construction or spending occurred."
    if sample and sample.status == "preview_estimate" then
      text = "Preview estimate: " .. tostring(sample.cost)
        .. "\nErrors: " .. tostring(sample.errorCount) .. "; warnings: " .. tostring(sample.warningCount)
        .. "\nTarget-company price is not verified.\nBuilding and funding remain disabled."
      if sample.critical then text = text .. "\nPlacement has a critical error." end
    elseif sample and (sample.status == "awaiting_preview" or sample.status == "awaiting_requote") then
      text = "Preparing read-only depot preview..."
    elseif sample and sample.status == "quote_unavailable" then
      text = "Preview price unavailable: " .. tostring(sample.code)
        .. "\nNothing was built or charged."
    end
    -- World-action nodes must never be attached to layout children.
    return builtin.BoxLayout {orientation = builtin.type.Orientation.Vertical,
      children = {builtin.TextView {text = text}}}
  end)
end

return M
