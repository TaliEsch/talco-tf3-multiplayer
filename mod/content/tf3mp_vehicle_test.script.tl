local react = ug_require "::/gui/main/react.lua" as React
local builtin = ug_require "::/gui/main/builtin.lua" as Builtin
local vehicle_eow = ug_require "::/gui/entity_window/vehicle/vehicle_eow.script.tl" as VehicleEow
local lastRequest : integer = 0

local Tf3MpVehicleTest = react.RegisterPluginRecipe(vehicle_eow.VehicleEowExtensionPoint, "Tf3MpVehicleTest", function(params : VehicleEow.VehicleWidgetPluginParams) : TreeNodeId
  local status = react.useState("Local vehicle test. Enable in Debug; use a disposable save.") as ReactStateT<string>
  local function selectForCoordinator() : nil
    local ok = pcall(function()
      if not vehicle_eow.isPlayerOwned(params) then status:set("Select a vehicle owned by your company."); return end
      local exists = false
      for _, name in ipairs(app.getAllUserdata("tf3mp_status_1")) do if name == "bridge" or name == "bridge.lua" then exists = true end end
      if not exists then return end
      local config = app.loadUserdata("tf3mp_status_1", "bridge")
      if config.schemaVersion ~= 1 or config.mode ~= "telemetry" or type(config.nonce) ~= "string" or type(config.selectionId) ~= "string" then
        status:set("Start the coordinated test in launcher Debug first."); return
      end
      if #config.nonce ~= 32 or not string.match(config.nonce as string, "^[0-9a-f]+$") or #config.selectionId ~= 32 or not string.match(config.selectionId as string, "^[0-9a-f]+$") then return end
      app.saveUserdata("tf3mp_status_1", "coordinator_selection", {schemaVersion = 1, nonce = config.nonce, selectionId = config.selectionId, entity = params.entityId})
      status:set("Vehicle selected. This click makes no gameplay change; follow the launcher.")
    end)
    if not ok then status:set("Selection unavailable. Check launcher Debug.") end
    return nil
  end
  local function request(stopFlag : integer) : nil
    -- Only a regular click callback uses userdata, never an engine-state timer.
    local ok = pcall(function()
      if not vehicle_eow.isPlayerOwned(params) then status:set("Only your own vehicles can be tested."); return end
      local exists = false
      for _, name in ipairs(app.getAllUserdata("tf3mp_status_1")) do
        if name == "bridge" or name == "bridge.lua" then exists = true end
      end
      if not exists then status:set("Start Host and enable the vehicle test in Debug."); return end
      local config = app.loadUserdata("tf3mp_status_1", "bridge")
      if config.schemaVersion ~= 1 or config.mode ~= "vehicle_test" or type(config.nonce) ~= "string" then
        status:set("Enable the local vehicle test in launcher Debug first."); return
      end
      local nonce = config.nonce as string
      if #nonce ~= 32 or not string.match(nonce, "^[0-9a-f]+$") then return end
      -- GUI clicks produce intent only. No optimistic/native vehicle command.
      lastRequest = lastRequest + 1
      app.saveUserdata("tf3mp_status_1", "vehicle_intent", { schemaVersion = 1, kind = "vehicle_intent", nonce = nonce,
        requestId = lastRequest, entity = params.entityId, stopFlag = stopFlag })
      status:set("Sent. Wait for the result in launcher Debug; one request at a time.")
    end)
    if not ok then status:set("Vehicle test unavailable. Check launcher Debug.") end
    return nil
  end
  return builtin.BoxLayout {
    orientation = builtin.type.Orientation.Vertical,
    children = {
      builtin.TextView { text = status:old() },
      builtin.Button { content = builtin.BoxLayout { children = { builtin.TextView { text = "Use for sync test" } } }, onClick = selectForCoordinator },
      builtin.Button { content = builtin.BoxLayout { children = { builtin.TextView { text = "MP test Stop" } } }, onClick = function() request(1) end },
      builtin.Button { content = builtin.BoxLayout { children = { builtin.TextView { text = "MP test Start" } } }, onClick = function() request(0) end },
    },
  }
end)

return { Tf3MpVehicleTest = Tf3MpVehicleTest }
