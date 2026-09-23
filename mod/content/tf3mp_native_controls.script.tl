local react = ug_require "::/gui/main/react.lua" as React
local builtin = ug_require "::/gui/main/builtin.lua" as Builtin
local entity_window_util = ug_require "::/gui/entity_window/entity_window_util.tl" as EntityWindowUtil
local vehicle_window = ug_require "::/gui/entity_window/vehicle/vehicle.tl" as any
local manager_window = ug_require "::/gui/line_vehicle_mgmt/manager_window.tl" as ManagerWindow

-- GUI-only restriction state. A missing helper/failed lease does NOT release it.
-- Explicit matching release is diagnostic-only; multiplayer recovery will need
-- its own verified checkpoint transition. This is not a global command veto.
local owner = ""
local blocked = false
local installed = false
local originalManagers : integer = 0
local readyChecks : integer = 0
local stopEntity : integer = 0
local stopDeadlineUnix : integer = 0
local stopInvocation = ""
local stopReadyChecks : integer = 0
local stopReady = false
local stopUsed = false
local stopEverUsed = false
local stopClickDiagnostic = "none"
local activeVehicleWindows : {integer : integer} = {}
local function clearStopPermit() : nil
  stopEntity = 0
  stopDeadlineUnix = 0
  stopInvocation = ""
  stopReadyChecks = 0
  stopReady = false
  stopUsed = false
end
local function stopDiagnostic() : table
  local windows = 0
  for _, count in pairs(activeVehicleWindows) do windows = windows + count end
  return { entity = stopEntity, deadlineUnix = stopDeadlineUnix,
    ready = stopReady and 1 or 0, used = stopUsed and 1 or 0,
    everUsed = stopEverUsed and 1 or 0, windows = windows,
    click = stopClickDiagnostic }
end
local function soleTargetWindow() : boolean
  local total = 0
  for entity, count in pairs(activeVehicleWindows) do
    if count > 0 then
      if entity ~= stopEntity then return false end
      total = total + count
    end
  end
  return total == 1
end
local function stopPermitCurrent() : boolean
  return blocked and stopEntity > 0 and stopReady and not stopUsed and not stopEverUsed
    and os.time() <= stopDeadlineUnix and soleTargetWindow()
end
local function armSingleStop(nonce : string, entity : integer, invocation : string, deadlineUnix : integer) : boolean
  local now = os.time()
  if not blocked or owner ~= nonce or stopEverUsed or stopEntity ~= 0
    or entity < 1 or entity > 2147483647 or not string.match(invocation, "^[1-9][0-9]*$")
    or deadlineUnix <= now or deadlineUnix > now + 4 then return false end
  stopEntity = entity
  stopInvocation = invocation
  stopDeadlineUnix = deadlineUnix
  stopReadyChecks = 0
  stopReady = false
  stopClickDiagnostic = "none"
  return true
end
local function pollSingleStopReady(nonce : string, entity : integer, invocation : string) : boolean
  if not blocked or owner ~= nonce or stopEntity ~= entity or stopInvocation ~= invocation
    or stopUsed or stopEverUsed or os.time() > stopDeadlineUnix then
    clearStopPermit()
    return false
  end
  if not soleTargetWindow() then stopReadyChecks = 0; return false end
  stopReadyChecks = math.min(stopReadyChecks + 1, 2) as integer
  stopReady = stopReadyChecks == 2
  return stopReady
end
local function revokeSingleStop(nonce : string) : boolean
  if not blocked or owner ~= nonce then return false end
  clearStopPermit()
  return true
end
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
  clearStopPermit()
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
      if onClick then copy.onClick = function()
        if not blocked then onClick() end
        if blocked then stopClickDiagnostic = "guarded_click" end
        local permitOk, permitted = pcall(stopPermitCurrent)
        if not permitOk then stopClickDiagnostic = "permit_error"; return end
        if blocked then stopClickDiagnostic = permitted and "permit_yes" or "permit_no" end
        -- Replacement callbacks have no translation helper. The qualified
        -- English UI must match exactly; other locales remain blocked.
        local labelOk, isStop = pcall(function() : boolean return button.description == "Stop" end)
        if not labelOk then stopClickDiagnostic = "label_error"; return end
        if blocked and permitted and isStop then
          stopClickDiagnostic = "reading_vehicle"
          local vehicleOk, vehicle = pcall(function() : any
            return api.engine.getComponent(stopEntity, api.type.ComponentType.TRANSPORT_VEHICLE) as Engine.Component.TransportVehicle
          end)
          if not vehicleOk then stopClickDiagnostic = "vehicle_read_error"; return end
          if vehicle and not vehicle.userStopped then
            stopUsed = true
            stopEverUsed = true
            stopReady = false
            stopClickDiagnostic = "submitted"
            onClick()
          else
            stopClickDiagnostic = "vehicle_not_moving"
          end
        elseif blocked then
          stopClickDiagnostic = permitted and "not_stop" or "permit_not_current"
        end
      end end
      if onValueChange then copy.onValueChange = function(value : boolean) if not blocked then onValueChange(value) end end end
    end
    result[#result + 1] = copy
  end
  return result
end

local OriginalVehicle = react.RegisterRecipe("Tf3MpOriginalVehicle", function(params : IEntityWindowParam) : TreeNodeId
  local entity = params.keyEntity
  local tracked = react.useRefLazy(function() : boolean
    activeVehicleWindows[entity] = (activeVehicleWindows[entity] or 0) + 1
    return true
  end) as ReactRefT<boolean>
  react.onUnmount(function()
    if tracked:get() then
      tracked:set(false)
      activeVehicleWindows[entity] = math.max(0, (activeVehicleWindows[entity] or 1) - 1) as integer
    end
  end)
  return builtin.BoxLayout { children = { react.CallOriginalRecipe(vehicle_window, params) } }
end)
local GuardedVehicle = react.RegisterRecipe("Tf3MpGuardedVehicle", function(params : IEntityWindowParam) : TreeNodeId
  local restricted = react.useState(stopEntity) as ReactStateT<integer>
  react.onStep(function() if restricted:old() ~= stopEntity then restricted:set(stopEntity) end end)
  if (stopEntity ~= 0 or restricted:old() ~= 0) and params.keyEntity ~= stopEntity then
    return builtin.BoxLayout { children = {} }
  end
  return builtin.BoxLayout { children = { OriginalVehicle(params) } }
end)

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
  replacementApi.ReplaceRecipe(vehicle_window, GuardedVehicle)
  replacementApi.ReplaceRecipe(manager_window.ManagerWindowContent, GuardedManager)
  installed = true
end

return { install = install, arm = arm, release = release, pollReady = pollReady,
  armSingleStop = armSingleStop, pollSingleStopReady = pollSingleStopReady,
  revokeSingleStop = revokeSingleStop, stopDiagnostic = stopDiagnostic }
