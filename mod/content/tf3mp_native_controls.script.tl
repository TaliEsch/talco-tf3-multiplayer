local react = ug_require "::/gui/main/react.lua" as React
local builtin = ug_require "::/gui/main/builtin.lua" as Builtin
local entity_window_util = ug_require "::/gui/entity_window/entity_window_util.tl" as EntityWindowUtil
local manager_window = ug_require "::/gui/line_vehicle_mgmt/manager_window.tl" as ManagerWindow

-- GUI-only restriction state. A missing helper/failed lease does NOT release it.
-- Explicit matching release is diagnostic-only; multiplayer recovery will need
-- its own verified checkpoint transition. This is not a global command veto.
local owner = ""
local blocked = false
local installed = false
local originalManagers : integer = 0
local readyChecks : integer = 0
local function arm(nonce : string) : boolean
  if not installed or #nonce ~= 32 or not string.match(nonce, "^[0-9a-f]+$") then return false end
  if blocked then return owner == nonce end
  owner = nonce
  blocked = true
  readyChecks = 0
  return true
end
local function pollReady(nonce : string) : boolean
  if not installed or not blocked or owner ~= nonce then return false end
  if originalManagers ~= 0 then readyChecks = 0; return false end
  readyChecks = math.min(readyChecks + 1, 2) as integer
  return readyChecks == 2
end
local function release(nonce : string) : boolean
  if not blocked or owner ~= nonce then return false end
  blocked = false
  owner = ""
  readyChecks = 0
  return true
end

local function copyButtons(source : {EntityWindowUtil.ActionBarButton}) : {EntityWindowUtil.ActionBarButton}
  local result : {EntityWindowUtil.ActionBarButton} = {}
  for _, button in ipairs(source or {}) do
    local fields : table = {}
    for key, value in pairs(button as table) do fields[key] = value end
    local copy = fields as EntityWindowUtil.ActionBarButton
    if button.tag == "entityWindow.vehicle.startStop" then
      local onClick = button.onClick
      local onValueChange = button.onValueChange
      -- Always wrap, even while unlocked: a previously rendered callback must
      -- consult the current latch, not a captured boolean.
      if onClick then copy.onClick = function() if not blocked then onClick() end end end
      if onValueChange then copy.onValueChange = function(value : boolean) if not blocked then onValueChange(value) end end end
    end
    result[#result + 1] = copy
  end
  return result
end

local GuardedActionBar = react.RegisterRecipe("Tf3MpGuardedActionBar", function(params : EntityWindowUtil.ActionButtonBarParams) : TreeNodeId
  -- CallOriginalRecipe returns a recipe node, not a builtin layout root.
  -- Every registered wrapper needs its own layout, including unlocked paths.
  return builtin.BoxLayout { children = { react.CallOriginalRecipe(entity_window_util.ActionButtonBar, {
    primaryButtons = copyButtons(params.primaryButtons),
    secondaryButtons = copyButtons(params.secondaryButtons),
    nextUpFocusRef = params.nextUpFocusRef,
  }) } }
end)

-- Keep original hooks in a stable child recipe. Do not conditionally call the
-- original function within the guard's hook sequence.
local OriginalManager = react.RegisterRecipe("Tf3MpOriginalManager", function(params : ToolReactUtil.ToolWindowParamPayload<ManagerWindow.ManagerToolParam>) : TreeNodeId
  -- Count from first render, not just onMount: a pending original subtree must
  -- also prevent acknowledgement. Aborted/unmatched lifecycles fail closed.
  local tracked = react.useRefLazy(function() : boolean
    originalManagers = originalManagers + 1
    return true
  end) as ReactRefT<boolean>
  react.onUnmount(function()
    if tracked:get() then
      tracked:set(false)
      originalManagers = originalManagers - 1
    end
  end)
  return builtin.BoxLayout { children = { react.CallOriginalRecipe(manager_window.ManagerWindowContent, params) } }
end)
local GuardedManager = react.RegisterRecipe("Tf3MpGuardedManager", function(params : ToolReactUtil.ToolWindowParamPayload<ManagerWindow.ManagerToolParam>) : TreeNodeId
  local restricted = react.useState(blocked) as ReactStateT<boolean>
  react.onStep(function() if restricted:old() ~= blocked then restricted:set(blocked) end end)
  if blocked or restricted:old() then
    return builtin.BoxLayout { children = {
      builtin.TextView { text = "Native vehicle management is restricted during the TalCo control test. Use the MP vehicle controls. Release the test explicitly in the launcher." },
    } }
  end
  return builtin.BoxLayout { children = { OriginalManager(params) } }
end)

local function install(replacementApi : ReactReplacementApi)
  replacementApi.ReplaceRecipe(entity_window_util.ActionButtonBar, GuardedActionBar)
  replacementApi.ReplaceRecipe(manager_window.ManagerWindowContent, GuardedManager)
  installed = true
end

return { install = install, arm = arm, release = release, pollReady = pollReady }
