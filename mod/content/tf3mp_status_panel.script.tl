local react = ug_require "::/gui/main/react.lua" as React
local builtin = ug_require "::/gui/main/builtin.lua" as Builtin
local engine_react_util = ug_require "::/gui/main/engine_react_util.tl" as EngineReactUtil
local game_bar_widgets = ug_require "::/gui/game_bar/game_bar_widgets.tl" as GameBarWidgets
local game_react_globals = ug_require "::/gui/main/game_react_globals.tl" as GameReactGlobals
local native_controls = ug_require "tf3mp_status_1::/tf3mp_native_controls.script.tl" as table
local record Tf3MpCaptureEncoding
  toHex : function(string) : string
end
local roadCapture = ug_require "tf3mp_status_1::/tf3mp_road_capture.lua" as Tf3MpCaptureEncoding

local record Tf3MpPanelState
  tickCount : integer
  updateCount : integer
end

-- Engine-state timers run with restricted APIs. Keep this callback read-only:
-- app userdata access here causes TF3 to reload the entire UI repeatedly.
local bridgeNonce = ""
local bridgeCounter : integer = 0
local lastAck : integer = -1
local missedAcks : integer = 0
local bridgeFailed = false
local stepCount : integer = 0
local placementRouteChecked = false
local placementRouteSteps : integer = 0
local placementRouteAttempts : integer = 0

-- Same regular GUI callback context as the already-working receipt reads.
-- No recursive dispatch from a game-script guiUpdate; no world mutation.
local function checkPlacementRoute() : nil
  if placementRouteChecked then return nil end
  placementRouteSteps = placementRouteSteps + 1
  if placementRouteSteps % 60 ~= 0 then return nil end
  placementRouteAttempts = placementRouteAttempts + 1
  if placementRouteAttempts == 1 then
    pcall(function()
      log.message("{\"event\":\"native_placement_observer_ready\",\"observerRevision\":7,\"limitPerStage\":8,\"passive\":true,\"gameplayVerified\":false}")
    end)
  end
  local ok, value = pcall(function() : any
    return api.gui.fireGuiScriptEvent("tf3mp_placement_observer", "tf3mp_placement_observer_selftest", {})
  end)
  local delivered = false
  if ok and type(value) == "table" then
    local ack = value as table
    delivered = ack.kind == "placement_observer_ack" and ack.observerRevision == 7 and ack.passive == true
  end
  -- Positive control: the established status read, not a gameplay request.
  -- Retry only these read-only diagnostics; never retry uncertain mutations.
  local controlOk, controlValue = pcall(function() : any
    return api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_status", {})
  end)
  local controlDelivered = false
  if controlOk and type(controlValue) == "table" then
    local control = controlValue as table
    controlDelivered = type(control.status) == "string"
  end
  placementRouteChecked = delivered or placementRouteAttempts >= 12
  pcall(function()
    log.message("{\"event\":\"native_placement_observer_selftest\",\"observerRevision\":7,\"delivered\":" .. tostring(delivered)
      .. ",\"attempt\":" .. tostring(placementRouteAttempts) .. ",\"final\":" .. tostring(placementRouteChecked)
      .. ",\"returnType\":\"" .. type(value) .. "\",\"controlDelivered\":" .. tostring(controlDelivered)
      .. ",\"callSucceeded\":" .. tostring(ok) .. ",\"synthetic\":true,\"passive\":true,\"gameplayVerified\":false}")
  end)
  return nil
end
local lastProbe : integer = 0
local probeReported : integer = 0
local probeFailed = false
local probeResult = "diagnostics"
local vehiclePhaseKey = ""
local vehicleDiscoverySent : integer = 0
local companyProbeSent : integer = 0
local phase2FundingSent : integer = 0
local phase2FundingReported : integer = 0
local phase2DepotSent : integer = 0
local phase2DepotReported : integer = 0
local phase2VehicleSent : integer = 0
local phase2VehicleReported : integer = 0
local phase2StationSent : integer = 0
local phase2StationReported : integer = 0
local phase2ServiceSent : integer = 0
local phase2ServiceReported : integer = 0
local phase2ServiceObservationSent : integer = 0
local phase2ServiceObservationReported : integer = 0
local stationProbeSent : integer = 0
local stationProbeReported : integer = 0
local companyProbeReported : integer = 0
local companyInspectionSent : integer = 0
local rosterInspectionSent : integer = 0
-- Per-session replay barrier. Set before the command is submitted, including
-- if the command path throws, so a road-stop construction is never retried.
local roadReplaySent : integer = 0
local roadReplayReported : integer = 0
local pausePhaseSent = ""
local snapshotSent : integer = 0
local haltSent : integer = 0
local watchdogSent : integer = 0
local coordinationSent = ""
local bindingSent = ""
local preparationSent = ""
local executionSent = ""
local pendingExecution : table = {}
local pendingCheckpoint : table = {}
local checkpointSent = ""
local releaseSent = ""
local pendingPauseDelivery : table = {}
-- GUI-only pending delivery, never stored in GameScriptState or a save.
local pendingVehicleDelivery : table = {}

-- USERDATA EXCHANGE BEGIN: only invoked by the protected regular onStep callback.
local captureSteps : integer = 0
local captureDisabled = false
local captureReported : table = {}
local function exchangeRoadCapture() : nil
  if captureDisabled or (captureReported.create and captureReported.apply) then return nil end
  captureSteps = captureSteps + 1
  if captureSteps % 60 ~= 0 then return nil end
  local response = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_status", {})
  if type(response) ~= "table" then return nil end
  local current = response as table
  for _, stage in ipairs({ "create", "apply" }) do
    local value : any = current.roadCaptureCreate
    if stage == "apply" then value = current.roadCaptureApply end
    if not captureReported[stage] and type(value) == "table" then
      -- Diagnostic writes are bounded and never retried after an uncertain IO result.
      captureReported[stage] = true
      local captured = value as table
      if captured.code == "captured" and type(captured.json) == "string" and #captured.json > 0 and #captured.json <= 262144
        and type(captured.sequence) == "number" and captured.sequence % 1 == 0 and captured.sequence >= 1 and captured.sequence <= 16
        and type(captured.modelResourceName) == "string" and #captured.modelResourceName > 0 and #captured.modelResourceName <= 1024 then
        local hex = roadCapture.toHex(captured.json)
        if type(hex) ~= "string" or #hex > 524288 then return nil end
        local modelNameHex = roadCapture.toHex(captured.modelResourceName)
        if type(modelNameHex) ~= "string" or #modelNameHex > 2048 then return nil end
        app.saveUserdata("tf3mp_status_1", "road_capture_" .. stage, {
          schemaVersion = 2, observerRevision = 7, kind = "native_road_stop_capture",
          stage = stage, sequence = captured.sequence, captureHex = hex, modelNameHex = modelNameHex,
        })
        log.message("{\"event\":\"native_road_capture_saved\",\"stage\":\"" .. stage .. "\",\"observerRevision\":7,\"gameplayVerified\":false}")
      else
        local field = "callback"
        if type(captured.field) == "string" and #captured.field <= 64 and captured.field:match("^[A-Za-z0-9]+$") then field = captured.field end
        log.message("{\"event\":\"native_road_capture_unsupported\",\"stage\":\"" .. stage .. "\",\"field\":\"" .. field .. "\",\"observerRevision\":7,\"gameplayVerified\":false}")
        if type(captured.issues) == "string" and #captured.issues > 0 and #captured.issues <= 2048 and captured.issues:match("^[A-Za-z0-9_]+$")
          and type(captured.sequence) == "number" and captured.sequence % 1 == 0 and captured.sequence >= 1 and captured.sequence <= 16 then
          app.saveUserdata("tf3mp_status_1", "road_capture_diagnostic_" .. stage, {
            schemaVersion = 1, kind = "road_capture_diagnostic", stage = stage,
            sequence = captured.sequence, issues = captured.issues,
          })
          log.message("{\"event\":\"native_road_capture_diagnostic\",\"stage\":\"" .. stage .. "\",\"issues\":\"" .. captured.issues .. "\",\"gameplayVerified\":false}")
        end
      end
    end
  end
  return nil
end
local preActionSent : table = {}
local preActionFinished = false
local preActionSteps : integer = 0
local preActionPolls : integer = 0
local function exchangeRoadPreAction() : nil
  if preActionFinished or #bridgeNonce ~= 32 or missedAcks > 10 or lastAck < 0 then return nil end
  preActionSteps = preActionSteps + 1
  if preActionSteps % 60 ~= 0 then return nil end
  if preActionSent.observationId == nil then
    local response = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_status", {}) as table
    if type(response) ~= "table" or type(response.roadStopPreActionCandidate) ~= "table" then return nil end
    local candidate = response.roadStopPreActionCandidate as table
    if type(candidate.observationId) ~= "number" or candidate.observationId % 1 ~= 0
      or candidate.observationId < 1 or candidate.observationId > 16
      or type(candidate.edgeEntity) ~= "number" or candidate.edgeEntity % 1 ~= 0
      or candidate.edgeEntity < 1 or candidate.edgeEntity > 2147483647
      or type(candidate.companyEntity) ~= "number" or candidate.companyEntity % 1 ~= 0
      or candidate.companyEntity < 1 or candidate.companyEntity > 2147483647 then
      preActionFinished = true
      return nil
    end
    preActionSent = {nonce=bridgeNonce, observationId=candidate.observationId,
      edgeEntity=candidate.edgeEntity, companyEntity=candidate.companyEntity}
    -- Build 40396 omits modelInstance from the preview. These synthetic
    -- stop fields were observed after an ordinary placement on this save.
    -- The probe only constructs a command value; it cannot submit one.
    preActionSent.model = "::/stations/street/small_stops/small_mid.mdl"
    preActionSent.left = true
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs",
      "tf3mp_engine_bridge", "tf3mp_road_preaction_probe", preActionSent))
    return nil
  end
  preActionPolls = preActionPolls + 1
  if preActionPolls > 30 then preActionFinished = true; return nil end
  local response = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_road_preaction_probe", {})
  if type(response) ~= "table" then return nil end
  local receipt = response as table
  if receipt.nonce ~= preActionSent.nonce or receipt.observationId ~= preActionSent.observationId then return nil end
  preActionFinished = true
  if receipt.code == "shape" and receipt.edgeEntity == preActionSent.edgeEntity
    and receipt.companyEntity == preActionSent.companyEntity
    and type(receipt.updateCount) == "number" and receipt.updateCount % 1 == 0
    and receipt.updateCount >= 0 and receipt.updateCount <= 2147483647
    and receipt.added == 1 and receipt.removed == 1
    and receipt.temporaryEdgeEntity == -1 and receipt.firstAddedObjectCount == 0 then
    local saved : table = {
      schemaVersion=1, kind="road_stop_preaction_probe", nonce=preActionSent.nonce,
      observationId=preActionSent.observationId, code="shape", edgeEntity=receipt.edgeEntity,
      companyEntity=receipt.companyEntity, updateCount=receipt.updateCount,
      added=1, removed=1, temporaryEdgeEntity=-1, firstAddedObjectCount=0,
    }
    if receipt.commandCode == "prepared" or receipt.commandCode == "rejected"
      or receipt.commandCode == "unknown" or receipt.commandCode == "notRequested" then
      saved.commandCode = receipt.commandCode
    end
    if receipt.commandStage == "none" or receipt.commandStage == "input"
      or receipt.commandStage == "world" or receipt.commandStage == "model"
      or receipt.commandStage == "factory" or receipt.commandStage == "constructor"
      or receipt.commandStage == "command" then saved.commandStage = receipt.commandStage end
    app.saveUserdata("tf3mp_status_1", "road_stop_preaction_probe", saved)
  else
    local saved : table = {
      schemaVersion=1, kind="road_stop_preaction_probe", nonce=preActionSent.nonce,
      observationId=preActionSent.observationId, code="unavailable",
    }
    if receipt.field == "request" or receipt.field == "clock" or receipt.field == "player"
      or receipt.field == "road" or receipt.field == "replacement" or receipt.field == "commandInput"
      or receipt.field == "preparerLookup" or receipt.field == "preparerCall"
      or receipt.field == "preparerResult" then saved.field = receipt.field end
    app.saveUserdata("tf3mp_status_1", "road_stop_preaction_probe", saved)
  end
  return nil
end

local stopReadbackSent : table = {}
local stopReadbackFinished = false
local stopReadbackSteps : integer = 0
local stopReadbackPolls : integer = 0
local function exchangeStopReadback() : nil
  if stopReadbackFinished or #bridgeNonce ~= 32 or missedAcks > 10 or lastAck < 0 then return nil end
  stopReadbackSteps = stopReadbackSteps + 1
  if stopReadbackSteps % 60 ~= 0 then return nil end
  if stopReadbackSent.observationId == nil then
    local response = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_status", {}) as table
    if type(response) ~= "table" or type(response.roadStopReadbackCandidate) ~= "table" then return nil end
    local candidate = response.roadStopReadbackCandidate as table
    if candidate.code == "unavailable" then
      local field = "applyShape"
      if candidate.field == "applyObjects" or candidate.field == "applyOptions" or candidate.field == "applyResults" or candidate.field == "applyStopEntity" then field = candidate.field as string end
      stopReadbackFinished = true
      log.message("{\"event\":\"native_stop_readback\",\"code\":\"APPLY_READBACK_UNAVAILABLE\",\"field\":\"" .. field .. "\",\"gameplayVerified\":false}")
      return nil
    end
    if type(candidate.observationId) ~= "number" or candidate.observationId < 1 or candidate.observationId > 16 or candidate.observationId % 1 ~= 0
      or type(candidate.companyEntity) ~= "number" or candidate.companyEntity < 1 or candidate.companyEntity > 2147483647 or candidate.companyEntity % 1 ~= 0
      or type(candidate.oneWay) ~= "boolean" or type(candidate.name) ~= "string" or #candidate.name > 1024
      or type(candidate.resultEntities) ~= "table" or #candidate.resultEntities < 1 or #candidate.resultEntities > 64 then
      stopReadbackFinished = true
      log.message("{\"event\":\"native_stop_readback\",\"code\":\"INVALID_APPLY_RESULT\",\"gameplayVerified\":false}")
      return nil
    end
    local ids : table = {}
    local seen : table = {}
    local count : integer = 0
    for key, entity in pairs(candidate.resultEntities) do
      count = count + 1
      if type(key) ~= "number" or key % 1 ~= 0 or key < 1 or key > #candidate.resultEntities
        or type(entity) ~= "number" or entity % 1 ~= 0 or entity < 1 or entity > 2147483647 or seen[entity] then error("READBACK_INVALID_IDS") end
      seen[entity] = true; ids[key] = entity
    end
    if count ~= #candidate.resultEntities then error("READBACK_INVALID_IDS") end
    stopReadbackSent = { schemaVersion = 1, nonce = bridgeNonce, observationId = candidate.observationId, companyEntity = candidate.companyEntity, resultEntities = ids, oneWay = candidate.oneWay, name = candidate.name }
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_stop_readback", stopReadbackSent))
    return nil
  end
  if stopReadbackSent.nonce ~= bridgeNonce then stopReadbackFinished = true; return nil end
  stopReadbackPolls = stopReadbackPolls + 1
  if stopReadbackPolls > 30 then
    stopReadbackFinished = true
    log.message("{\"event\":\"native_stop_readback\",\"code\":\"READBACK_TIMEOUT\",\"gameplayVerified\":false}")
    return nil
  end
  local response = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_stop_readback", {})
  if type(response) ~= "table" then return nil end
  local receipt = response as table
  if receipt.nonce ~= stopReadbackSent.nonce or receipt.observationId ~= stopReadbackSent.observationId then return nil end
  stopReadbackFinished = true
  if receipt.code ~= "readback" or type(receipt.json) ~= "string" or #receipt.json < 1 or #receipt.json > 65536 then
    local field = "receipt"
    if type(receipt.field) == "string" and #receipt.field <= 32 and receipt.field:match("^[A-Za-z]+$") then field = receipt.field end
    if field == "constructionResourceNil" and type(receipt.modelId) == "number" and receipt.modelId % 1 == 0
      and receipt.modelId >= 0 and receipt.modelId <= 2147483647
      and type(receipt.modelResourceName) == "string" and #receipt.modelResourceName > 4 and #receipt.modelResourceName <= 1024 then
      local modelNameHex = roadCapture.toHex(receipt.modelResourceName)
      if type(modelNameHex) == "string" and #modelNameHex <= 2048 then
        app.saveUserdata("tf3mp_status_1", "road_stop_model_diagnostic", {
          schemaVersion = 1, kind = "road_stop_model_diagnostic", nonce = stopReadbackSent.nonce,
          observationId = stopReadbackSent.observationId, modelId = receipt.modelId,
          modelNameHex = modelNameHex,
        })
      end
    end
    if field == "constructionResourceSyntax" and type(receipt.constructionResourceValue) == "string"
      and #receipt.constructionResourceValue > 0 and #receipt.constructionResourceValue <= 1024 then
      local valueHex = roadCapture.toHex(receipt.constructionResourceValue)
      if type(valueHex) == "string" and #valueHex <= 2048 then
        app.saveUserdata("tf3mp_status_1", "road_stop_construction_diagnostic", {
          schemaVersion = 1, kind = "road_stop_construction_diagnostic", nonce = stopReadbackSent.nonce,
          observationId = stopReadbackSent.observationId, valueHex = valueHex,
        })
      end
    end
    log.message("{\"event\":\"native_stop_readback\",\"code\":\"READBACK_UNAVAILABLE\",\"field\":\"" .. field .. "\",\"gameplayVerified\":false}")
    return nil
  end
  local hex = roadCapture.toHex(receipt.json)
  if type(hex) ~= "string" or #hex > 131072 then error("READBACK_INVALID_ENCODING") end
  app.saveUserdata("tf3mp_status_1", "road_stop_readback", {
    schemaVersion = 1, kind = "road_stop_readback", nonce = stopReadbackSent.nonce,
    observationId = stopReadbackSent.observationId, snapshotHex = hex,
  })
  if type(receipt.modelId) == "number" and receipt.modelId % 1 == 0 and receipt.modelId >= 0 and receipt.modelId <= 2147483647
    and type(receipt.modelResourceName) == "string" and #receipt.modelResourceName > 4 and #receipt.modelResourceName <= 1024 then
    local modelNameHex = roadCapture.toHex(receipt.modelResourceName)
    if type(modelNameHex) == "string" and #modelNameHex <= 2048 then
      app.saveUserdata("tf3mp_status_1", "road_stop_model_diagnostic", {
        schemaVersion = 1, kind = "road_stop_model_diagnostic", nonce = stopReadbackSent.nonce,
        observationId = stopReadbackSent.observationId, modelId = receipt.modelId,
        modelNameHex = modelNameHex,
      })
    end
  end
  local probeCode = receipt.replacementProbeCode
  if type(probeCode) == "string"
    and (probeCode == "factoryMissing" or probeCode == "factoryNil" or probeCode == "factoryFailed"
      or probeCode == "shapeUnavailable" or probeCode == "sourceMissing") then
    app.saveUserdata("tf3mp_status_1", "road_stop_replacement_probe", {
      schemaVersion = 1, kind = "road_stop_replacement_probe", nonce = stopReadbackSent.nonce,
      observationId = stopReadbackSent.observationId, code = probeCode,
    })
  elseif probeCode == "shape"
    and type(receipt.replacementAdded) == "number" and receipt.replacementAdded % 1 == 0 and receipt.replacementAdded >= 0 and receipt.replacementAdded <= 64
    and type(receipt.replacementRemoved) == "number" and receipt.replacementRemoved % 1 == 0 and receipt.replacementRemoved >= 0 and receipt.replacementRemoved <= 64
    and type(receipt.replacementEdgeObjects) == "number" and receipt.replacementEdgeObjects % 1 == 0 and receipt.replacementEdgeObjects >= 0 and receipt.replacementEdgeObjects <= 64
    and type(receipt.replacementFirstEntity) == "number" and receipt.replacementFirstEntity % 1 == 0
    and receipt.replacementFirstEntity >= -2147483647 and receipt.replacementFirstEntity <= 2147483647
    and type(receipt.replacementFirstObjectCount) == "number" and receipt.replacementFirstObjectCount % 1 == 0
    and receipt.replacementFirstObjectCount >= 0 and receipt.replacementFirstObjectCount <= 64 then
    app.saveUserdata("tf3mp_status_1", "road_stop_replacement_probe", {
      schemaVersion = 1, kind = "road_stop_replacement_probe", nonce = stopReadbackSent.nonce,
      observationId = stopReadbackSent.observationId, code = "shape", added = receipt.replacementAdded,
      removed = receipt.replacementRemoved, edgeObjects = receipt.replacementEdgeObjects,
      firstAddedEntity = receipt.replacementFirstEntity, firstAddedObjectCount = receipt.replacementFirstObjectCount,
    })
  else
    app.saveUserdata("tf3mp_status_1", "road_stop_replacement_probe", {
      schemaVersion = 1, kind = "road_stop_replacement_probe", nonce = stopReadbackSent.nonce,
      observationId = stopReadbackSent.observationId, code = "bridgeMissing",
    })
  end
  log.message("{\"event\":\"native_stop_readback\",\"code\":\"COPIED_PLACED_OBJECT_ONLY\",\"gameplayVerified\":false}")
  return nil
end
local function flushRoadCapture() : nil
  if not preActionFinished then
    local probeOk = pcall(exchangeRoadPreAction)
    if not probeOk then preActionFinished = true end
  end
  if not stopReadbackFinished then
    local readbackOk = pcall(exchangeStopReadback)
    if not readbackOk then
      stopReadbackFinished = true
      pcall(function() log.message("{\"event\":\"native_stop_readback\",\"code\":\"READBACK_FAILED\",\"gameplayVerified\":false}") end)
    end
  end
  if captureDisabled then return nil end
  local ok = pcall(exchangeRoadCapture)
  if not ok then
    captureDisabled = true
    pcall(function() log.message("{\"event\":\"native_road_capture_io_failed\",\"observerRevision\":7,\"gameplayVerified\":false}") end)
  end
  return nil
end

-- Temporary GUI diagnostic only: this does not restrict construction or provide
-- a multiplayer authority boundary. Never set GameSpeedPause (it can resume).
local controlFlags : table = {}
local controlOriginal : any = nil
local controlOwned = false
local controlNonce = ""
local controlFinished = false
local controlSent = ""
local function restoreSpeedControls() : nil
  if controlOwned then
    if controlFlags.GameSpeedControl == true then controlFlags.GameSpeedControl = controlOriginal end
    controlOwned = false
  end
  controlFinished = true
  return nil
end

local function userdataExists(name : string) : boolean
  for _, file in ipairs(app.getAllUserdata("tf3mp_status_1")) do
    if file == name or file == name .. ".lua" then return true end
  end
  return false
end

-- The dispatcher validates again, but never forward userdata-derived tables
-- until they have passed this bounded plain-data copy. This rejects native
-- objects, metatables, cycles and aliases as well as oversized object graphs.
local function copyRoadReplayData(value : any) : any
  local seen : table = {}
  local nodes : integer = 0
  local bytes : integer = 0
  local function addBytes(count : integer) : boolean
    bytes = bytes + count
    return bytes <= 1048576
  end
  local function visit(item : any, depth : integer) : any
    if depth > 32 then error("road replay depth") end
    nodes = nodes + 1
    if nodes > 20000 then error("road replay nodes") end
    local kind = type(item)
    if kind == "nil" then return nil end
    if kind == "boolean" then if not addBytes(1) then error("road replay bytes") end; return item end
    if kind == "number" then
      if item ~= item or item == math.huge or item == -math.huge or not addBytes(8) then error("road replay number") end
      return item
    end
    if kind == "string" then if not addBytes(#item + 8) then error("road replay bytes") end; return item end
    if kind ~= "table" or getmetatable(item) ~= nil or seen[item] then error("road replay data") end
    seen[item] = true
    if not addBytes(16) then error("road replay bytes") end
    local copied : table = {}
    for key, child in pairs(item) do
      local keyKind = type(key)
      if keyKind ~= "string" and keyKind ~= "number" then error("road replay key") end
      copied[visit(key, depth + 1)] = visit(child, depth + 1)
    end
    return copied
  end
  return visit(value, 0)
end

local function exchangeNativeRoadStopReplay() : nil
  -- This function is called only from exchangeTelemetry, in the protected
  -- regular GUI callback; userdata must never be accessed from a timer.
  if missedAcks > 10 or lastAck < 0 or not userdataExists("bridge") or not userdataExists("native_road_stop_replay_request") then return nil end
  local config = app.loadUserdata("tf3mp_status_1", "bridge")
  if config.mode ~= "company_test" or config.nonce ~= bridgeNonce then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "native_road_stop_replay_request")
  if request.schemaVersion ~= 1 or request.kind ~= "native_road_stop_replay" or request.nonce ~= bridgeNonce or request.confirmed ~= 1 then return nil end
  if type(request.requestId) ~= "number" or request.requestId < 1 or request.requestId > 2147483647 or request.requestId % 1 ~= 0 then return nil end
  local requestId = request.requestId as integer
  if requestId > roadReplaySent then
    local payload = copyRoadReplayData(request) as table
    -- The narrow schema fields are checked before consuming. The engine owns
    -- exact replay-case admission and independently repeats the deep check.
    if payload.schemaVersion ~= 1 or payload.kind ~= "native_road_stop_replay" or payload.nonce ~= bridgeNonce
      or payload.requestId ~= requestId or payload.confirmed ~= 1 then return nil end
    roadReplaySent = requestId -- Consume before send; never retry uncertain delivery.
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_native_road_stop_replay", payload))
  end
  if requestId ~= roadReplaySent or roadReplayReported == roadReplaySent then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_native_road_stop_replay", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.kind ~= "native_road_stop_replay_receipt" or receipt.nonce ~= bridgeNonce or receipt.requestId ~= roadReplaySent then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.kind == "native_road_stop_replay_receipt" and item.nonce == bridgeNonce and item.requestId == roadReplaySent then receipt = item; break end
      end
    end
  end
  if receipt.schemaVersion ~= 1 or receipt.kind ~= "native_road_stop_replay_receipt" or receipt.nonce ~= bridgeNonce or receipt.requestId ~= roadReplaySent then return nil end
  local result : table = { schemaVersion=1, kind="native_road_stop_replay_receipt", nonce=bridgeNonce, requestId=roadReplaySent }
  for _, field in ipairs({ "tickCount", "updateCount" }) do
    local numberValue = receipt[field]
    if type(numberValue) ~= "number" or numberValue < 0 or numberValue > 9007199254740991 or numberValue % 1 ~= 0 then return nil end
    result[field] = numberValue
  end
  if type(receipt.code) ~= "string" or #receipt.code < 1 or #receipt.code > 128 or not string.match(receipt.code as string, "^[A-Z_]+$") then return nil end
  if type(receipt.outcome) ~= "string" or #receipt.outcome < 1 or #receipt.outcome > 32 or not string.match(receipt.outcome as string, "^[a-z_]+$") then return nil end
  result.code = receipt.code; result.outcome = receipt.outcome
  if receipt.stopEntity ~= nil or receipt.chargedCost ~= nil then
    if type(receipt.stopEntity) ~= "number" or receipt.stopEntity < 1 or receipt.stopEntity > 2147483647 or receipt.stopEntity % 1 ~= 0
      or type(receipt.chargedCost) ~= "number" or receipt.chargedCost < 1 or receipt.chargedCost > 9007199254740991 or receipt.chargedCost % 1 ~= 0 then return nil end
    result.stopEntity = receipt.stopEntity; result.chargedCost = receipt.chargedCost
  end
  app.saveUserdata("tf3mp_status_1", "native_road_stop_replay_receipt", result)
  roadReplayReported = roadReplaySent
  return nil
end

local function exchangeHalt() : nil
  if not userdataExists("halt_request") or missedAcks > 10 then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "halt_request")
  if request.schemaVersion ~= 1 or request.kind ~= "halt_request" or request.nonce ~= bridgeNonce then return nil end
  for _, key in ipairs({ "requestId", "companyEntity", "issuedTick", "expiresTick" }) do
    local v = request[key]
    if type(v) ~= "number" or v < 0 or v > 2147483647 or v % 1 ~= 0 then return nil end
  end
  if request.requestId < 1 or request.expiresTick ~= request.issuedTick + 300 then return nil end
  if request.requestId > haltSent then
    haltSent = request.requestId as integer -- Consume before delivery; no retry.
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_halt", {
      schemaVersion = 1, kind = "halt_request", nonce = bridgeNonce, requestId = haltSent,
      companyEntity = request.companyEntity, issuedTick = request.issuedTick, expiresTick = request.expiresTick,
    }))
  end
  if request.requestId ~= haltSent then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_halt_receipt", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.kind ~= "halt_receipt" then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.kind == "halt_receipt" and item.nonce == bridgeNonce and item.requestId == haltSent then receipt = item; break end
      end
    end
  end
  if receipt.schemaVersion ~= 1 or receipt.kind ~= "halt_receipt" or receipt.nonce ~= bridgeNonce or receipt.requestId ~= haltSent then return nil end
  local result : table = { schemaVersion = 1, kind = "halt_receipt", nonce = bridgeNonce }
  for _, key in ipairs({ "requestId", "companyEntity", "tickCount", "updateCount", "speedup" }) do
    local v = receipt[key]
    if type(v) ~= "number" or v < 0 or v > 2147483647 or v % 1 ~= 0 then return nil end
    result[key] = v
  end
  if receipt.outcome ~= "halted" and receipt.outcome ~= "expired" and receipt.outcome ~= "context_changed" and receipt.outcome ~= "already_attempted" and receipt.outcome ~= "outcome_unknown" then return nil end
  result.outcome = receipt.outcome
  app.saveUserdata("tf3mp_status_1", "halt_receipt", result)
  return nil
end

local function exchangeBinding() : nil
  if missedAcks <= 10 and lastAck >= 0 and bindingSent == "" and userdataExists("coordination_request") then
    local request = app.loadUserdata("tf3mp_status_1", "coordination_request")
    if request.schemaVersion ~= 1 or request.nonce ~= bridgeNonce or request.operation ~= "bindSession" then return nil end
    if type(request.playerCount) ~= "number" or request.playerCount < 2 or request.playerCount > 4 or request.playerCount % 1 ~= 0 then return nil end
    local payload : table = { schemaVersion = 1, nonce = bridgeNonce, operation = "bindSession", playerCount = request.playerCount }
    for _, key in ipairs({ "roundId", "operationId", "localPlayerId" }) do
      if type(request[key]) ~= "string" or #request[key] < 1 or #request[key] > 128 or not string.match(request[key] as string, "^[A-Za-z0-9_.:-]+$") then return nil end
      payload[key] = request[key]
    end
    for i = 1, request.playerCount as integer do
      local playerKey = "player" .. tostring(i)
      local companyKey = "company" .. tostring(i)
      local player = request[playerKey]
      local company = request[companyKey]
      if type(player) ~= "string" or #player < 1 or #player > 128 or not string.match(player as string, "^[A-Za-z0-9_.:-]+$") then return nil end
      if type(company) ~= "number" or company < 0 or company > 2147483647 or company % 1 ~= 0 then return nil end
      payload[playerKey] = player; payload[companyKey] = company
    end
    local count : integer = 0
    for key, _ in pairs(request) do if payload[key] == nil then return nil end; count = count + 1 end
    if count ~= 7 + 2 * request.playerCount then return nil end
    bindingSent = request.operationId as string
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_bind_session", payload))
  end
  if bindingSent == "" or coordinationSent ~= "" then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_binding_receipt", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.operationId ~= bindingSent then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.nonce == bridgeNonce and item.operationId == bindingSent then receipt = item; break end
      end
    end
  end
  if receipt.schemaVersion ~= 1 or receipt.nonce ~= bridgeNonce or receipt.operationId ~= bindingSent or receipt.operation ~= "bindSession" or receipt.status ~= "ok" then return nil end
  if type(receipt.roundId) ~= "string" or #receipt.roundId < 1 or #receipt.roundId > 128 or not string.match(receipt.roundId as string, "^[A-Za-z0-9_.:-]+$") then return nil end
  if type(receipt.held) ~= "boolean" or type(receipt.updateCount) ~= "number" or receipt.updateCount < 0 or receipt.updateCount > 2147483647 or receipt.updateCount % 1 ~= 0 then return nil end
  app.saveUserdata("tf3mp_status_1", "coordination_receipt", {
    schemaVersion = 1, nonce = bridgeNonce, operationId = bindingSent, roundId = receipt.roundId,
    operation = "bindSession", status = "ok", updateCount = receipt.updateCount, held = receipt.held,
  })
  return nil
end

local function dispatchCheckpointAtUpdate() : nil
  if pendingCheckpoint.nonce == nil then return nil end
  local request = pendingCheckpoint
  local clock = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
  if clock.updateCount < request.updateCount - 1 then return nil end
  pendingCheckpoint = {}
  if missedAcks > 10 or lastAck < 0 or coordinationSent ~= "" or not userdataExists("bridge") or not userdataExists("coordination_request") then return nil end
  local config = app.loadUserdata("tf3mp_status_1", "bridge")
  if config.mode ~= "watchdog_test" or config.nonce ~= bridgeNonce or request.nonce ~= bridgeNonce then return nil end
  local live = app.loadUserdata("tf3mp_status_1", "coordination_request")
  local count : integer = 0
  for key, value in pairs(live) do if request[key] ~= value then return nil end; count = count + 1 end
  if count ~= (request.checkpointHash == nil and 6 or 7) then return nil end
  api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_hold_checkpoint", request))
  return nil
end

local function exchangeCheckpoint() : nil
  if missedAcks <= 10 and lastAck >= 0 and checkpointSent == "" and userdataExists("coordination_request") then
    local request = app.loadUserdata("tf3mp_status_1", "coordination_request")
    if request.schemaVersion ~= 1 or request.nonce ~= bridgeNonce or request.operation ~= "holdCheckpoint" then return nil end
    local payload : table = { schemaVersion = 1, nonce = bridgeNonce, operation = "holdCheckpoint" }
    for _, key in ipairs({ "roundId", "operationId" }) do
      if type(request[key]) ~= "string" or #request[key] < 1 or #request[key] > 128 or not string.match(request[key] as string, "^[A-Za-z0-9_.:-]+$") then return nil end
      payload[key] = request[key]
    end
    if type(request.updateCount) ~= "number" or request.updateCount < 0 or request.updateCount > 2147483647 or request.updateCount % 1 ~= 0 then return nil end
    if request.checkpointHash ~= nil and (type(request.checkpointHash) ~= "string" or #request.checkpointHash ~= 64 or not string.match(request.checkpointHash as string, "^[0-9a-f]+$")) then return nil end
    payload.updateCount = request.updateCount; payload.checkpointHash = request.checkpointHash
    local count : integer = 0
    for key, _ in pairs(request) do if payload[key] == nil then return nil end; count = count + 1 end
    if count ~= (request.checkpointHash == nil and 6 or 7) then return nil end
    checkpointSent = request.operationId as string
    pendingCheckpoint = payload
  end
  if checkpointSent == "" or preparationSent ~= "" or coordinationSent ~= "" then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_checkpoint_receipt", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.operationId ~= checkpointSent then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.nonce == bridgeNonce and item.operationId == checkpointSent then receipt = item; break end
      end
    end
  end
  if receipt.schemaVersion ~= 1 or receipt.nonce ~= bridgeNonce or receipt.operationId ~= checkpointSent or receipt.operation ~= "holdCheckpoint" then return nil end
  if type(receipt.roundId) ~= "string" or #receipt.roundId < 1 or #receipt.roundId > 128 or not string.match(receipt.roundId as string, "^[A-Za-z0-9_.:-]+$") then return nil end
  if (receipt.status ~= "ok" and receipt.status ~= "unknown") or type(receipt.held) ~= "boolean" then return nil end
  if type(receipt.updateCount) ~= "number" or receipt.updateCount < 0 or receipt.updateCount > 2147483647 or receipt.updateCount % 1 ~= 0 then return nil end
  local result : table = { schemaVersion = 1, nonce = bridgeNonce, operationId = checkpointSent, roundId = receipt.roundId,
    operation = "holdCheckpoint", status = receipt.status, updateCount = receipt.updateCount, held = receipt.held }
  if receipt.status == "ok" then
    if receipt.snapshotVersion ~= 2 or type(receipt.companyCount) ~= "number" or receipt.companyCount < 2 or receipt.companyCount > 4 or receipt.companyCount % 1 ~= 0 then return nil end
    result.snapshotVersion = 2; result.companyCount = receipt.companyCount
    for i = 1, receipt.companyCount as integer do
      local entity = receipt["company" .. tostring(i)]
      local balance = receipt["balance" .. tostring(i)]
      local negative = receipt["negative" .. tostring(i)]
      if type(entity) ~= "number" or entity < 0 or entity > 2147483647 or entity % 1 ~= 0 then return nil end
      if type(balance) ~= "number" or balance < 0 or balance > 9007199254740991 or balance % 1 ~= 0 or (negative ~= 0 and negative ~= 1) then return nil end
      result["company" .. tostring(i)] = entity; result["balance" .. tostring(i)] = balance; result["negative" .. tostring(i)] = negative
    end
    for _, domain in ipairs({ "townsGrowth", "economy", "topology", "vehicles", "companies", "linesServices", "rngHiddenState" }) do
      local status, digest = receipt[domain .. "Status"], receipt[domain .. "Hash"]
      if type(status) ~= "string" or type(digest) ~= "string" then return nil end
      if status == "observed" then
        if #digest ~= 64 or not string.match(digest, "^[0-9a-f]+$") then return nil end
      elseif (status == "unavailable" or status == "unsupported" or status == "read_failed") and digest == status then
        -- Explicit blind spot/failure is part of the hashed checkpoint state.
      else return nil end
      result[domain .. "Status"] = status; result[domain .. "Hash"] = digest
    end
  end
  app.saveUserdata("tf3mp_status_1", "coordination_receipt", result)
  return nil
end

local function exchangeRelease() : nil
  if not userdataExists("coordination_request") then return nil end
  local liveRequest = app.loadUserdata("tf3mp_status_1", "coordination_request")
  if liveRequest.operation ~= "release" or liveRequest.nonce ~= bridgeNonce then return nil end
  if missedAcks <= 10 and lastAck >= 0 and releaseSent ~= liveRequest.operationId and coordinationSent == "" then
    local request = app.loadUserdata("tf3mp_status_1", "coordination_request")
    if request.schemaVersion ~= 1 or request.nonce ~= bridgeNonce or request.operation ~= "release" then return nil end
    local payload : table = { schemaVersion = 1, nonce = bridgeNonce, operation = "release" }
    for _, key in ipairs({ "roundId", "operationId" }) do
      if type(request[key]) ~= "string" or #request[key] < 1 or #request[key] > 128 or not string.match(request[key] as string, "^[A-Za-z0-9_.:-]+$") then return nil end
      payload[key] = request[key]
    end
    if type(request.updateCount) ~= "number" or request.updateCount < 0 or request.updateCount > 2147483647 or request.updateCount % 1 ~= 0 then return nil end
    payload.updateCount = request.updateCount
    local expectedCount : integer = 6
    if request.speedup ~= nil then
      if request.speedup ~= 1 and request.speedup ~= 2 and request.speedup ~= 4 then return nil end
      payload.speedup = request.speedup
      expectedCount = 7
    end
    local count : integer = 0
    for key, _ in pairs(request) do if payload[key] == nil then return nil end; count = count + 1 end
    if count ~= expectedCount then return nil end
    releaseSent = request.operationId as string
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_release_checkpoint", payload))
  end
  if releaseSent == "" or coordinationSent ~= "" then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_release_receipt", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.operationId ~= releaseSent then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.nonce == bridgeNonce and item.operationId == releaseSent then receipt = item; break end
      end
    end
  end
  if receipt.schemaVersion ~= 1 or receipt.nonce ~= bridgeNonce or receipt.operationId ~= releaseSent or receipt.operation ~= "release" then return nil end
  if type(receipt.roundId) ~= "string" or #receipt.roundId < 1 or #receipt.roundId > 128 or not string.match(receipt.roundId as string, "^[A-Za-z0-9_.:-]+$") then return nil end
  if (receipt.status ~= "ok" and receipt.status ~= "unknown") or type(receipt.held) ~= "boolean" then return nil end
  if type(receipt.updateCount) ~= "number" or receipt.updateCount < 0 or receipt.updateCount > 2147483647 or receipt.updateCount % 1 ~= 0 then return nil end
  local result : table = {
    schemaVersion = 1, nonce = bridgeNonce, operationId = releaseSent, roundId = receipt.roundId,
    operation = "release", status = receipt.status, updateCount = receipt.updateCount, held = receipt.held,
  }
  if liveRequest.speedup ~= nil then
    if type(receipt.speedup) ~= "number" then return nil end
    result.speedup = receipt.speedup
  end
  app.saveUserdata("tf3mp_status_1", "coordination_receipt", result)
  return nil
end

local function exchangePreparation() : nil
  if not userdataExists("coordination_request") then return nil end
  local liveRequest = app.loadUserdata("tf3mp_status_1", "coordination_request")
  if liveRequest.operation ~= "prepare" or liveRequest.nonce ~= bridgeNonce then return nil end
  if missedAcks <= 10 and lastAck >= 0 and preparationSent ~= liveRequest.operationId and coordinationSent == "" then
    local request = app.loadUserdata("tf3mp_status_1", "coordination_request")
    if request.schemaVersion ~= 1 or request.nonce ~= bridgeNonce or request.operation ~= "prepare" or request.protocolVersion ~= 2 or request.commandType ~= "vehicle.setRunning" or type(request.running) ~= "boolean" then return nil end
    local payload : table = { schemaVersion = 1, nonce = bridgeNonce, operation = "prepare", protocolVersion = 2, commandType = "vehicle.setRunning", running = request.running }
    for _, key in ipairs({ "roundId", "operationId", "originPlayerId", "requestMessageId" }) do
      if type(request[key]) ~= "string" or #request[key] < 1 or #request[key] > 128 or not string.match(request[key] as string, "^[A-Za-z0-9_.:-]+$") then return nil end
      payload[key] = request[key]
    end
    for _, key in ipairs({ "hostSequence", "scheduledUpdate", "companyEntity", "entity", "clientSequence" }) do
      local value = request[key]
      if type(value) ~= "number" or value < 0 or value > 2147483647 or value % 1 ~= 0 then return nil end
      payload[key] = value
    end
    if request.hostSequence < 1 or request.clientSequence < 1 then return nil end
    local count : integer = 0
    for key, _ in pairs(request) do if payload[key] == nil then return nil end; count = count + 1 end
    if count ~= 15 then return nil end
    preparationSent = request.operationId as string
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_prepare_command", payload))
  end
  if preparationSent == "" or coordinationSent ~= "" then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_preparation_receipt", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.operationId ~= preparationSent then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.nonce == bridgeNonce and item.operationId == preparationSent then receipt = item; break end
      end
    end
  end
  if receipt.schemaVersion ~= 1 or receipt.nonce ~= bridgeNonce or receipt.operationId ~= preparationSent or receipt.operation ~= "prepare" then return nil end
  if type(receipt.roundId) ~= "string" or #receipt.roundId < 1 or #receipt.roundId > 128 or not string.match(receipt.roundId as string, "^[A-Za-z0-9_.:-]+$") then return nil end
  if (receipt.status ~= "ok" and receipt.status ~= "unknown") or type(receipt.held) ~= "boolean" then return nil end
  for _, key in ipairs({ "updateCount", "ownerCompanyEntity" }) do
    local value = receipt[key]
    if type(value) ~= "number" or value < 0 or value > 2147483647 or value % 1 ~= 0 then return nil end
  end
  app.saveUserdata("tf3mp_status_1", "coordination_receipt", {
    schemaVersion = 1, nonce = bridgeNonce, operationId = preparationSent, roundId = receipt.roundId,
    operation = "prepare", status = receipt.status, updateCount = receipt.updateCount, held = receipt.held, ownerCompanyEntity = receipt.ownerCompanyEntity,
  })
  return nil
end

local function dispatchExecutionAtUpdate() : nil
  if pendingExecution.nonce == nil then return nil end
  local request = pendingExecution
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_execution_barrier", {})
  if type(value) ~= "table" then return nil end
  local barrier = value as table
  if barrier.operationId ~= request.operationId then
    local checked : integer = 0
    for _, candidate in pairs(barrier) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.operationId == request.operationId and item.nonce == bridgeNonce then barrier = item; break end
      end
    end
  end
  if barrier.phase ~= "held" or barrier.operationId ~= request.operationId or barrier.nonce ~= bridgeNonce
    or barrier.roundId ~= request.roundId or barrier.hostSequence ~= request.hostSequence
    or barrier.scheduledUpdate ~= request.scheduledUpdate then return nil end
  local clock = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
  pendingExecution = {} -- No retry, including exceptions or uncertain delivery.
  if clock.updateCount ~= request.scheduledUpdate then return nil end
  if missedAcks > 10 or lastAck < 0 or coordinationSent ~= "" or not userdataExists("bridge") or not userdataExists("coordination_request") then return nil end
  local config = app.loadUserdata("tf3mp_status_1", "bridge")
  if config.mode ~= "watchdog_test" or config.nonce ~= bridgeNonce or request.nonce ~= bridgeNonce then return nil end
  local live = app.loadUserdata("tf3mp_status_1", "coordination_request")
  local count : integer = 0
  for key, value in pairs(live) do if request[key] ~= value then return nil end; count = count + 1 end
  if count ~= 15 then return nil end
  api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_execute_command", request))
  return nil
end

local function exchangeExecution() : nil
  if not userdataExists("coordination_request") then return nil end
  local liveRequest = app.loadUserdata("tf3mp_status_1", "coordination_request")
  if liveRequest.operation ~= "executeHeld" or liveRequest.nonce ~= bridgeNonce then return nil end
  if missedAcks <= 10 and lastAck >= 0 and executionSent ~= liveRequest.operationId and coordinationSent == "" then
    local request = app.loadUserdata("tf3mp_status_1", "coordination_request")
    if request.schemaVersion ~= 1 or request.nonce ~= bridgeNonce or request.operation ~= "executeHeld" or request.protocolVersion ~= 2 or request.commandType ~= "vehicle.setRunning" or type(request.running) ~= "boolean" then return nil end
    local payload : table = { schemaVersion = 1, nonce = bridgeNonce, operation = "executeHeld", protocolVersion = 2, commandType = "vehicle.setRunning", running = request.running }
    for _, key in ipairs({ "roundId", "operationId", "originPlayerId", "requestMessageId" }) do
      if type(request[key]) ~= "string" or #request[key] < 1 or #request[key] > 128 or not string.match(request[key] as string, "^[A-Za-z0-9_.:-]+$") then return nil end
      payload[key] = request[key]
    end
    for _, key in ipairs({ "hostSequence", "scheduledUpdate", "companyEntity", "entity", "clientSequence" }) do
      local value = request[key]
      if type(value) ~= "number" or value < 0 or value > 2147483647 or value % 1 ~= 0 then return nil end
      payload[key] = value
    end
    if request.hostSequence < 1 or request.clientSequence < 1 then return nil end
    local count : integer = 0
    for key, _ in pairs(request) do if payload[key] == nil then return nil end; count = count + 1 end
    if count ~= 15 then return nil end
    executionSent = request.operationId as string
    pendingExecution = payload -- Transient GUI delivery, never persisted executable work.
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_arm_execution_hold", payload))
  end
  if executionSent == "" or coordinationSent ~= "" then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_execution_receipt", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.operationId ~= executionSent then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.nonce == bridgeNonce and item.operationId == executionSent then receipt = item; break end
      end
    end
  end
  if receipt.schemaVersion ~= 1 or receipt.nonce ~= bridgeNonce or receipt.operationId ~= executionSent or receipt.operation ~= "executeHeld" then return nil end
  if type(receipt.roundId) ~= "string" or #receipt.roundId < 1 or #receipt.roundId > 128 or not string.match(receipt.roundId as string, "^[A-Za-z0-9_.:-]+$") then return nil end
  if (receipt.status ~= "ok" and receipt.status ~= "unknown") or type(receipt.held) ~= "boolean" then return nil end
  if type(receipt.updateCount) ~= "number" or receipt.updateCount < 0 or receipt.updateCount > 2147483647 or receipt.updateCount % 1 ~= 0 then return nil end
  local payload : table = {schemaVersion = 1, nonce = bridgeNonce, operationId = executionSent, roundId = receipt.roundId,
    operation = "executeHeld", status = receipt.status, updateCount = receipt.updateCount, held = receipt.held}
  if receipt.status == "ok" then
    for _, key in ipairs({ "snapshotVersion", "hostSequence", "entity", "ownerCompanyEntity", "stopFlag", "balance", "negative" }) do
      local number = receipt[key]
      if type(number) ~= "number" or number < 0 or number > 9007199254740991 or number % 1 ~= 0 then return nil end
      payload[key] = number
    end
  end
  app.saveUserdata("tf3mp_status_1", "coordination_receipt", payload)
  return nil
end

local function exchangeCoordinationHalt() : nil
  if missedAcks <= 10 and lastAck >= 0 and coordinationSent == "" and userdataExists("coordination_request") then
    local request = app.loadUserdata("tf3mp_status_1", "coordination_request")
    local count : integer = 0
    for key, _ in pairs(request) do
      if key ~= "schemaVersion" and key ~= "nonce" and key ~= "roundId" and key ~= "operationId" and key ~= "operation" then return nil end
      count = count + 1
    end
    if count ~= 5 or request.schemaVersion ~= 1 or request.nonce ~= bridgeNonce or request.operation ~= "halt" then return nil end
    for _, key in ipairs({ "roundId", "operationId" }) do
      if type(request[key]) ~= "string" or #request[key] < 1 or #request[key] > 128 or not string.match(request[key] as string, "^[A-Za-z0-9_.:-]+$") then return nil end
    end
    coordinationSent = request.operationId as string -- No retry after uncertain event delivery.
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_coordination", {
      schemaVersion = 1, nonce = bridgeNonce, roundId = request.roundId, operationId = coordinationSent, operation = "halt",
    }))
  end
  if coordinationSent == "" then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_coordination_receipt", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.operationId ~= coordinationSent then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.nonce == bridgeNonce and item.operationId == coordinationSent then receipt = item; break end
      end
    end
  end
  if receipt.schemaVersion ~= 1 or receipt.nonce ~= bridgeNonce or receipt.operationId ~= coordinationSent or receipt.operation ~= "halt" then return nil end
  if type(receipt.roundId) ~= "string" or #receipt.roundId < 1 or #receipt.roundId > 128 or not string.match(receipt.roundId as string, "^[A-Za-z0-9_.:-]+$") then return nil end
  if receipt.status ~= "ok" and receipt.status ~= "unknown" then return nil end
  if type(receipt.held) ~= "boolean" or type(receipt.updateCount) ~= "number" or receipt.updateCount < 0 or receipt.updateCount > 2147483647 or receipt.updateCount % 1 ~= 0 then return nil end
  app.saveUserdata("tf3mp_status_1", "coordination_receipt", {
    schemaVersion = 1, nonce = bridgeNonce, operationId = coordinationSent, roundId = receipt.roundId,
    operation = "halt", status = receipt.status, updateCount = receipt.updateCount, held = receipt.held,
  })
  return nil
end

local function exchangeWatchdog() : nil
  -- Helper loss blocks ALL new arm/renew delivery, not read-only evidence of
  -- an already armed engine lease. Its autonomous stop must remain observable.
  if missedAcks <= 10 and lastAck >= 0 and userdataExists("watchdog_request") then
    local request = app.loadUserdata("tf3mp_status_1", "watchdog_request")
    if request.schemaVersion ~= 1 or request.kind ~= "watchdog_request" or request.nonce ~= bridgeNonce then return nil end
    if request.phase ~= "arm" and request.phase ~= "renew" then return nil end
    for _, key in ipairs({ "requestId", "companyEntity", "issuedTick", "expiresTick" }) do
      local value = request[key]
      if type(value) ~= "number" or value < 0 or value > 2147483647 or value % 1 ~= 0 then return nil end
    end
    if request.requestId < 1 or request.expiresTick ~= request.issuedTick + 100 then return nil end
    if request.requestId > watchdogSent then
      watchdogSent = request.requestId as integer -- Consume before dispatch, never retry.
      api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_watchdog", {
        schemaVersion = 1, kind = "watchdog_request", nonce = bridgeNonce, phase = request.phase,
        requestId = watchdogSent, companyEntity = request.companyEntity, issuedTick = request.issuedTick, expiresTick = request.expiresTick,
      }))
    end
  end
  if watchdogSent < 1 then return nil end
  -- Keep observing after the helper removes the arm file. Removal is not disarm.
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_watchdog_receipt", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.kind ~= "watchdog_receipt" then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.kind == "watchdog_receipt" and item.nonce == bridgeNonce and item.requestId == watchdogSent then receipt = item; break end
      end
    end
  end
  if receipt.schemaVersion ~= 1 or receipt.kind ~= "watchdog_receipt" or receipt.nonce ~= bridgeNonce or receipt.requestId ~= watchdogSent then return nil end
  local result : table = { schemaVersion = 1, kind = "watchdog_receipt", nonce = bridgeNonce }
  for _, key in ipairs({ "requestId", "companyEntity", "issuedTick", "expiresTick", "lastTick", "tickCount", "updateCount", "speedup" }) do
    local n = receipt[key]
    if type(n) ~= "number" or n < 0 or n > 2147483647 or n % 1 ~= 0 then return nil end
    result[key] = n
  end
  if receipt.phase ~= "active" and receipt.phase ~= "stopping" and receipt.phase ~= "stopped" then return nil end
  if receipt.outcome ~= "armed" and receipt.outcome ~= "renewed" and receipt.outcome ~= "outcome_unknown" and receipt.outcome ~= "handler_failed" and receipt.outcome ~= "halted" then return nil end
  if receipt.reason ~= "none" and receipt.reason ~= "expired" and receipt.reason ~= "clock_reset" and receipt.reason ~= "context_changed" then return nil end
  result.phase = receipt.phase; result.outcome = receipt.outcome; result.reason = receipt.reason
  app.saveUserdata("tf3mp_status_1", "watchdog_receipt", result)
  return nil
end

local function exchangeSpeedControls() : nil
  if not userdataExists("bridge") or not userdataExists("control_request") or missedAcks > 10 then
    if controlOwned then restoreSpeedControls() end
    return nil
  end
  local config = app.loadUserdata("tf3mp_status_1", "bridge")
  local request = app.loadUserdata("tf3mp_status_1", "control_request")
  if request.schemaVersion ~= 1 or request.kind ~= "control_request" or request.nonce ~= bridgeNonce
    or config.nonce ~= bridgeNonce or #bridgeNonce ~= 32
    or (request.phase ~= "acquire" and request.phase ~= "release") then
    if controlOwned then restoreSpeedControls() end
    return nil
  end
  if controlNonce ~= bridgeNonce then
    restoreSpeedControls()
    controlNonce = bridgeNonce
    controlFinished = false
    controlSent = ""
  end
  local flags = game_react_globals.getDisableFeatures() as table
  local outcome = "unavailable"
  if request.phase == "release" then
    if controlOwned and flags == controlFlags and flags.GameSpeedControl == true then
      restoreSpeedControls()
      if native_controls.release(bridgeNonce) then outcome = "released" else outcome = "conflict" end
    elseif controlSent == "release:released" then
      return nil
    else
      restoreSpeedControls()
      outcome = "conflict"
    end
  elseif controlOwned then
    if flags ~= controlFlags or flags.GameSpeedControl ~= true or flags.GameSpeedPause == true then
      restoreSpeedControls()
      outcome = "conflict"
    else
      if native_controls.pollReady(bridgeNonce) then outcome = "acquired"
      elseif controlSent == "acquire:acquired" then restoreSpeedControls(); outcome = "conflict"
      else return nil end -- No receipt until the original manager has unmounted.
    end
  elseif not controlFinished then
    controlFinished = true -- Never reacquire after a failure in this helper.
    local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
    if speed.speedup ~= 0 or flags.GameSpeedControl == true or flags.GameSpeedPause == true then
      outcome = "conflict"
    else
      controlFlags = flags
      controlOriginal = flags.GameSpeedControl
      controlOwned = true -- Own before changing so protected cleanup can restore.
      flags.GameSpeedControl = true
      if game_react_globals.getDisableFeatures() == flags and flags.GameSpeedControl == true and native_controls.arm(bridgeNonce) then return nil -- Wait for native-view transition acknowledgement.
      else restoreSpeedControls() end
    end
  else
    return nil
  end
  local key = request.phase .. ":" .. outcome
  if key ~= controlSent then
    app.saveUserdata("tf3mp_status_1", "control_receipt", {
      schemaVersion = 1, kind = "control_receipt", nonce = bridgeNonce, phase = request.phase, outcome = outcome,
    })
    controlSent = key
  end
  return nil
end

local stopPermitSeen = ""
local stopPermitReceiptSent = false
local function exchangeSingleStopPermit() : nil
  if not controlOwned or controlSent ~= "acquire:acquired" or missedAcks > 10
    or not userdataExists("stop_permit_request") then
    native_controls.revokeSingleStop(bridgeNonce)
    stopPermitSeen = ""
    stopPermitReceiptSent = false
    return nil
  end
  local request = app.loadUserdata("tf3mp_status_1", "stop_permit_request")
  if request.schemaVersion ~= 1 or request.kind ~= "stop_permit_request"
    or request.nonce ~= bridgeNonce or type(request.entity) ~= "number"
    or request.entity < 1 or request.entity > 2147483647 or request.entity % 1 ~= 0
    or type(request.invocation) ~= "string" or not string.match(request.invocation, "^[1-9][0-9]*$")
    or type(request.deadlineUnix) ~= "number" or request.deadlineUnix % 1 ~= 0
    or request.deadlineUnix <= os.time() or request.deadlineUnix > os.time() + 4 then
    native_controls.revokeSingleStop(bridgeNonce)
    stopPermitSeen = ""
    return nil
  end
  local key = request.entity .. ":" .. request.invocation
  if stopPermitSeen ~= key then
    native_controls.revokeSingleStop(bridgeNonce)
    stopPermitSeen = key
    stopPermitReceiptSent = false
    if not native_controls.armSingleStop(bridgeNonce, request.entity, request.invocation, request.deadlineUnix) then return nil end
  end
  if not stopPermitReceiptSent and native_controls.pollSingleStopReady(bridgeNonce, request.entity, request.invocation) then
    app.saveUserdata("tf3mp_status_1", "stop_permit_receipt", {
      schemaVersion = 1, kind = "stop_permit_receipt", nonce = bridgeNonce,
      entity = request.entity, invocation = request.invocation, ready = 1,
    })
    stopPermitReceiptSent = true
  end
  local diagnostic = native_controls.stopDiagnostic()
  app.saveUserdata("tf3mp_status_1", "stop_permit_diagnostic", {
    schemaVersion = 1, kind = "stop_permit_diagnostic", nonce = bridgeNonce,
    entity = request.entity, invocation = request.invocation,
    click = diagnostic.click, ready = diagnostic.ready, used = diagnostic.used,
    everUsed = diagnostic.everUsed, windows = diagnostic.windows,
    deadlineUnix = diagnostic.deadlineUnix, sampleUnix = os.time(),
  })
  return nil
end

local function dispatchVehicleAtUpdate() : nil
  if pendingVehicleDelivery.nonce == nil then return nil end
  local request = pendingVehicleDelivery
  local clock = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
  -- GUI commands execute on the next simulation step. This timing assumption
  -- is experimental: the engine rejects both early and late actual arrival.
  if clock.updateCount < request.scheduledUpdate - 1 and clock.tickCount <= request.expiresTick then return nil end
  pendingVehicleDelivery = {} -- Consume before I/O or dispatch; no retries.
  if missedAcks > 10 or not userdataExists("bridge") or not userdataExists("vehicle_command") then return nil end
  local config = app.loadUserdata("tf3mp_status_1", "bridge")
  if config.mode ~= "vehicle_test" or config.nonce ~= request.nonce or request.nonce ~= bridgeNonce then return nil end
  local live = app.loadUserdata("tf3mp_status_1", "vehicle_command")
  for key, value in pairs(request) do
    if live[key] ~= value then return nil end
  end
  api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_vehicle_command", request))
  return nil
end

local function exchangeVehicleDiscovery() : nil
  if not userdataExists("vehicle_discovery_request") then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "vehicle_discovery_request")
  if request.schemaVersion ~= 1 or request.kind ~= "vehicle_discovery_request" or request.nonce ~= bridgeNonce then return nil end
  for _, key in ipairs({ "requestId", "company" }) do
    local value = request[key]
    if type(value) ~= "number" or value < 0 or value > 2147483647 or value % 1 ~= 0 then return nil end
  end
  if request.requestId < 1 then return nil end
  if request.entity ~= nil and (type(request.entity) ~= "number" or request.entity < 1
    or request.entity > 2147483647 or request.entity % 1 ~= 0) then return nil end
  if request.requestId > vehicleDiscoverySent then
    vehicleDiscoverySent = request.requestId as integer
    local event : table = {
      schemaVersion = 1, kind = "vehicle_discovery_request", nonce = bridgeNonce,
      requestId = vehicleDiscoverySent, company = request.company,
    }
    if request.entity ~= nil then event.entity = request.entity end
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_discover_vehicle", event))
  end
  if request.requestId ~= vehicleDiscoverySent then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_vehicle_discovery", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.schemaVersion ~= 1 or receipt.kind ~= "vehicle_discovery_receipt" or receipt.nonce ~= bridgeNonce
    or receipt.requestId ~= vehicleDiscoverySent or receipt.company ~= request.company then return nil end
  if request.entity ~= nil and receipt.outcome == "found" and receipt.entity ~= request.entity then return nil end
  local result : table = { schemaVersion = 1, kind = "vehicle_discovery_receipt", nonce = bridgeNonce,
    requestId = vehicleDiscoverySent, outcome = receipt.outcome }
  if receipt.outcome ~= "found" and receipt.outcome ~= "missing" and receipt.outcome ~= "not_owner" then return nil end
  for _, key in ipairs({ "company", "entity", "revision", "stopFlag", "tickCount", "updateCount" }) do
    local numberValue = receipt[key]
    if type(numberValue) ~= "number" or numberValue < 0 or numberValue > 2147483647 or numberValue % 1 ~= 0 then return nil end
    result[key] = numberValue
  end
  if receipt.stopFlag ~= 0 and receipt.stopFlag ~= 1 then return nil end
  app.saveUserdata("tf3mp_status_1", "vehicle_discovery_receipt", result)
  return nil
end

local function exchangeVehicleTest() : nil
  if not userdataExists("vehicle_command") then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "vehicle_command")
  if (request.schemaVersion ~= 1 and request.schemaVersion ~= 2) or request.kind ~= "vehicle_command" or request.nonce ~= bridgeNonce then return nil end
  if request.phase ~= "inspect" and request.phase ~= "commit" then return nil end
  local eventParam : table = { schemaVersion = request.schemaVersion, kind = "vehicle_command", nonce = bridgeNonce, phase = request.phase }
  for _, key in ipairs({ "actionId", "entity", "stopFlag", "company", "revision", "hostSequence", "scheduledUpdate", "expiresTick" }) do
    local value = request[key]
    if type(value) ~= "number" or value < 0 or value > 2147483647 or value % 1 ~= 0 then return nil end
    eventParam[key] = value
  end
  local phaseKey = tostring(request.actionId) .. ":" .. (request.phase as string)
  if phaseKey ~= vehiclePhaseKey then
    vehiclePhaseKey = phaseKey -- Mark before dispatch; uncertain sends are not retried.
    if request.phase == "commit" and request.scheduledUpdate > 0 then
      pendingVehicleDelivery = eventParam
    else
      api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_vehicle_command", eventParam))
    end
  end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_vehicle_receipt", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.kind ~= "vehicle_receipt" then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.kind == "vehicle_receipt" and item.nonce == bridgeNonce and item.actionId == request.actionId then receipt = item; break end
      end
    end
  end
  if receipt.schemaVersion ~= request.schemaVersion or receipt.kind ~= "vehicle_receipt" or receipt.nonce ~= bridgeNonce or receipt.actionId ~= request.actionId or receipt.phase ~= request.phase then return nil end
  local result : table = { schemaVersion = receipt.schemaVersion, kind = "vehicle_receipt", nonce = bridgeNonce, phase = receipt.phase }
  for _, key in ipairs({ "actionId", "entity", "stopFlag", "company", "localPlayer", "revision", "hostSequence", "scheduledUpdate", "tickCount", "updateCount" }) do
    local numberValue = receipt[key]
    if type(numberValue) ~= "number" or numberValue < 0 or numberValue > 2147483647 or numberValue % 1 ~= 0 then return nil end
    result[key] = numberValue
  end
  if type(receipt.outcome) ~= "string" or not string.match(receipt.outcome as string, "^[a-z_]+$") then return nil end
  result.outcome = receipt.outcome
  app.saveUserdata("tf3mp_status_1", "vehicle_receipt", result)
  return nil
end

local function exchangeEngineProbe() : nil
  if not userdataExists("engine_request") then
    if lastProbe > probeReported then probeResult = "test ended / see launcher" end
    return nil
  end
  local request = app.loadUserdata("tf3mp_status_1", "engine_request")
  if request.schemaVersion ~= 1 or (request.kind ~= "engine_probe" and request.kind ~= "scheduled_probe") or request.nonce ~= bridgeNonce or type(request.requestId) ~= "number" then return nil end
  local requestId = request.requestId as number
  if requestId < 1 or requestId > 2147483647 or requestId % 1 ~= 0 then return nil end
  local scheduled = request.kind == "scheduled_probe"
  if scheduled then
    if type(request.scheduledUpdate) ~= "number" then return nil end
    local target = request.scheduledUpdate as number
    if target < 1 or target > 2147483647 or target % 1 ~= 0 then return nil end
  end
  if requestId > lastProbe then
    -- Mark before dispatch: an uncertain failure must never cause duplicate sends.
    lastProbe = requestId as integer
    local eventParam : table = { schemaVersion = 1, nonce = bridgeNonce, requestId = lastProbe }
    if scheduled then eventParam.scheduledUpdate = request.scheduledUpdate end
    probeResult = scheduled and "timing test pending" or "engine test pending"
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_engine_probe", eventParam))
  end
  if requestId ~= lastProbe or probeReported == lastProbe then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_engine_receipt", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  local expectedKind = scheduled and "scheduled_receipt" or "engine_receipt"
  -- Some GUI event dispatchers collect per-script return values. Accept only
  -- our exact receipt, whether direct or one level inside that result table.
  if receipt.kind ~= expectedKind then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.kind == expectedKind and item.nonce == bridgeNonce and item.requestId == lastProbe then
          receipt = item
          break
        end
      end
    end
  end
  if receipt.schemaVersion == 1 and receipt.kind == expectedKind and receipt.nonce == bridgeNonce and receipt.requestId == lastProbe then
    if type(receipt.tickCount) ~= "number" or type(receipt.updateCount) ~= "number" then return nil end
    local result : table = {
      schemaVersion = 1, kind = expectedKind, nonce = bridgeNonce,
      requestId = lastProbe, tickCount = receipt.tickCount, updateCount = receipt.updateCount,
    }
    if scheduled then
      if receipt.scheduledUpdate ~= request.scheduledUpdate or (receipt.outcome ~= "applied" and receipt.outcome ~= "late" and receipt.outcome ~= "clock_reset") then return nil end
      result.scheduledUpdate = receipt.scheduledUpdate
      result.outcome = receipt.outcome
      probeResult = receipt.outcome == "applied" and "timing test passed" or "timing test missed deadline"
    else
      probeResult = "engine test passed"
    end
    app.saveUserdata("tf3mp_status_1", "engine_receipt", result)
    probeReported = lastProbe
  end
  return nil
end

local function exchangeStationTemplate() : nil
  if not userdataExists("station_template_request") then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "station_template_request")
  if request.schemaVersion ~= 1 or request.kind ~= "station_template_probe" or request.nonce ~= bridgeNonce then return nil end
  if type(request.requestId) ~= "number" or request.requestId < 1 or request.requestId > 2147483647 or request.requestId % 1 ~= 0 then return nil end
  if request.requestId > stationProbeSent then
    stationProbeSent = request.requestId as integer
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_station_template_probe", request))
  end
  if stationProbeReported == stationProbeSent then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_station_template", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.kind ~= "station_template_receipt" then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.kind == "station_template_receipt" and item.nonce == bridgeNonce and item.requestId == stationProbeSent then receipt = item; break end
      end
    end
  end
  if receipt.kind ~= "station_template_receipt" or receipt.nonce ~= bridgeNonce or receipt.requestId ~= stationProbeSent then return nil end
  app.saveUserdata("tf3mp_status_1", "station_template_receipt", receipt)
  stationProbeReported = stationProbeSent
  return nil
end

local function exchangePhase2Depot() : nil
  if not userdataExists("phase2_depot_request") then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "phase2_depot_request")
  if request.schemaVersion ~= 1 or request.kind ~= "phase2_depot" or request.nonce ~= bridgeNonce or request.confirmed ~= 1 then return nil end
  if type(request.requestId) ~= "number" or request.requestId < 1 or request.requestId > 2147483647 or request.requestId % 1 ~= 0 then return nil end
  if request.requestId > phase2DepotSent then
    phase2DepotSent = request.requestId as integer -- Consume before dispatch; never retry.
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_phase2_depot", request))
  end
  if phase2DepotReported == phase2DepotSent then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_phase2_depot", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.kind ~= "phase2_depot_receipt" then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.kind == "phase2_depot_receipt" and item.nonce == bridgeNonce and item.requestId == phase2DepotSent then receipt = item; break end
      end
    end
  end
  if receipt.kind ~= "phase2_depot_receipt" or receipt.nonce ~= bridgeNonce or receipt.requestId ~= phase2DepotSent then return nil end
  app.saveUserdata("tf3mp_status_1", "phase2_depot_receipt", receipt)
  phase2DepotReported = phase2DepotSent
  return nil
end

-- This runs in the regular protected GUI callback, where userdata is allowed.
-- Consume before dispatch so an uncertain send is never retried from the panel.
local function exchangePhase2Vehicle() : nil
  if not userdataExists("phase2_vehicle_request") then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "phase2_vehicle_request")
  if request.schemaVersion ~= 1 or request.kind ~= "phase2_vehicle" or request.nonce ~= bridgeNonce or request.confirmed ~= 1 then return nil end
  local allowed : table = { schemaVersion=true, kind=true, nonce=true, requestId=true, companyEntity=true, targetCompany=true,
    depotEntity=true, model=true, confirmed=true, issuedTick=true, expiresTick=true }
  local count : integer = 0; for key, _ in pairs(request) do if allowed[key] ~= true then return nil end; count = count + 1 end
  if count ~= 11 or type(request.model) ~= "string" or #request.model < 1 or #request.model > 256
    or not string.match(request.model as string, "^[A-Za-z0-9_.:/%-]+%.mdl$") then return nil end
  for _, key in ipairs({ "requestId", "companyEntity", "targetCompany", "depotEntity", "issuedTick", "expiresTick" }) do
    local value = request[key]; if type(value) ~= "number" or value < 0 or value > 2147483647 or value % 1 ~= 0 then return nil end
  end
  if request.requestId < 1 or request.companyEntity < 1 or request.targetCompany < 1 or request.depotEntity < 1
    or request.companyEntity == request.targetCompany or request.expiresTick ~= request.issuedTick + 300 then return nil end
  if request.requestId > phase2VehicleSent then
    phase2VehicleSent = request.requestId as integer
    local param : table = { schemaVersion=1, kind="phase2_vehicle", nonce=bridgeNonce, requestId=phase2VehicleSent,
      companyEntity=request.companyEntity, targetCompany=request.targetCompany, depotEntity=request.depotEntity,
      model=request.model, confirmed=1, issuedTick=request.issuedTick, expiresTick=request.expiresTick }
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_phase2_vehicle", param))
  end
  if phase2VehicleReported == phase2VehicleSent then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_phase2_vehicle", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.kind ~= "phase2_vehicle_receipt" then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1; if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.kind == "phase2_vehicle_receipt" and item.nonce == bridgeNonce and item.requestId == phase2VehicleSent then receipt = item; break end
      end
    end
  end
  if receipt.kind ~= "phase2_vehicle_receipt" or receipt.nonce ~= bridgeNonce or receipt.requestId ~= phase2VehicleSent then return nil end
  local result : table = { schemaVersion=1, kind="phase2_vehicle_receipt", nonce=bridgeNonce, requestId=phase2VehicleSent }
  for _, key in ipairs({ "companyEntity", "targetCompany", "depotEntity", "tickCount", "updateCount", "vehicleEntity", "vehicleOwner", "depotOwner" }) do
    local numberValue = receipt[key]
    if type(numberValue) ~= "number" or numberValue < 0 or numberValue > 2147483647 or numberValue % 1 ~= 0 then return nil end
    result[key] = numberValue
  end
  if type(receipt.chargedCost) ~= "number" or receipt.chargedCost < 0 or receipt.chargedCost > 9007199254740991 or receipt.chargedCost % 1 ~= 0 then return nil end
  result.chargedCost = receipt.chargedCost
  for _, name in ipairs({ "originalBefore", "originalAfter", "targetBefore", "targetAfter" }) do
    local amount, negative = receipt[name], receipt[name .. "Negative"]
    if type(amount) ~= "number" or amount < 0 or amount > 9007199254740991 or amount % 1 ~= 0 or (negative ~= 0 and negative ~= 1) then return nil end
    result[name] = amount; result[name .. "Negative"] = negative
  end
  if type(receipt.model) ~= "string" or receipt.model ~= request.model or type(receipt.outcome) ~= "string" or type(receipt.code) ~= "string" then return nil end
  result.model = receipt.model; result.outcome = receipt.outcome; result.code = receipt.code
  app.saveUserdata("tf3mp_status_1", "phase2_vehicle_receipt", result)
  phase2VehicleReported = phase2VehicleSent
  return nil
end

-- Userdata is permitted only in this protected regular GUI callback. Consume
-- request ids before dispatch; neither failed sends nor unknown receipts retry.
local function exchangePhase2Station() : nil
  if not userdataExists("phase2_station_request") then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "phase2_station_request")
  if request.schemaVersion ~= 1 or request.kind ~= "phase2_station" or request.nonce ~= bridgeNonce or request.confirmed ~= 1 then return nil end
  local allowed : table = { schemaVersion=true, kind=true, nonce=true, requestId=true, companyEntity=true, targetCompany=true,
    slot=true, resource=true, x=true, y=true, z=true, yaw=true, seed=true, confirmed=true, issuedTick=true, expiresTick=true }
  local count : integer = 0; for key, _ in pairs(request) do if allowed[key] ~= true then return nil end; count = count + 1 end
  if count ~= 16 or type(request.resource) ~= "string" or #request.resource < 1 or #request.resource > 256 then return nil end
  for _, key in ipairs({ "requestId", "companyEntity", "targetCompany", "slot", "seed", "issuedTick", "expiresTick" }) do
    local value = request[key]; if type(value) ~= "number" or value < 0 or value > 2147483647 or value % 1 ~= 0 then return nil end
  end
  if request.requestId < 1 or request.companyEntity < 1 or request.targetCompany < 1 or request.companyEntity == request.targetCompany
    or (request.slot ~= 1 and request.slot ~= 2) or request.seed < 1 or request.expiresTick ~= request.issuedTick + 300 then return nil end
  for _, key in ipairs({ "x", "y", "z", "yaw" }) do if type(request[key]) ~= "number" or request[key] ~= request[key] then return nil end end
  if math.abs(request.x) > 100000 or math.abs(request.y) > 100000 or math.abs(request.z) > 10000 or math.abs(request.yaw) > math.pi then return nil end
  if request.requestId > phase2StationSent then
    phase2StationSent = request.requestId as integer
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_phase2_station", request))
  end
  if phase2StationReported == phase2StationSent then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_phase2_station", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.kind ~= "phase2_station_receipt" then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1; if checked > 64 then break end
      if type(candidate) == "table" then local item = candidate as table
        if item.kind == "phase2_station_receipt" and item.nonce == bridgeNonce and item.requestId == phase2StationSent then receipt = item; break end
      end
    end
  end
  if receipt.schemaVersion ~= 1 or receipt.kind ~= "phase2_station_receipt" or receipt.nonce ~= bridgeNonce or receipt.requestId ~= phase2StationSent then return nil end
  local result : table = { schemaVersion=1, kind="phase2_station_receipt", nonce=bridgeNonce, requestId=phase2StationSent }
  for _, key in ipairs({ "companyEntity", "targetCompany", "slot", "tickCount", "updateCount", "constructionEntity", "stationEntity", "constructionOwner", "stationOwner" }) do
    local numberValue = receipt[key]; if type(numberValue) ~= "number" or numberValue < 0 or numberValue > 2147483647 or numberValue % 1 ~= 0 then return nil end; result[key] = numberValue
  end
  if type(receipt.resource) ~= "string" or receipt.resource ~= request.resource or type(receipt.outcome) ~= "string" or type(receipt.code) ~= "string" then return nil end
  result.resource = receipt.resource; result.outcome = receipt.outcome; result.code = receipt.code
  for _, key in ipairs({ "constructionMembershipPreserved", "stationMembershipPreserved" }) do if receipt[key] ~= 0 and receipt[key] ~= 1 then return nil end; result[key] = receipt[key] end
  if type(receipt.chargedCost) ~= "number" or receipt.chargedCost < 0 or receipt.chargedCost > 9007199254740991 or receipt.chargedCost % 1 ~= 0 then return nil end; result.chargedCost = receipt.chargedCost
  for _, name in ipairs({ "originalBefore", "originalAfter", "targetBefore", "targetAfter" }) do
    local amount, negative = receipt[name], receipt[name .. "Negative"]
    if type(amount) ~= "number" or amount < 0 or amount > 9007199254740991 or amount % 1 ~= 0 or (negative ~= 0 and negative ~= 1) then return nil end
    result[name] = amount; result[name .. "Negative"] = negative
  end
  app.saveUserdata("tf3mp_status_1", "phase2_station_receipt", result); phase2StationReported = phase2StationSent
  return nil
end

local function exchangePhase2Service() : nil
  if not userdataExists("phase2_service_request") then return nil end
  local request=app.loadUserdata("tf3mp_status_1","phase2_service_request")
  if request.schemaVersion~=1 or request.kind~="phase2_service" or request.nonce~=bridgeNonce or request.confirmed~=1 then return nil end
  local allowed : table={schemaVersion=true,kind=true,nonce=true,requestId=true,companyEntity=true,targetCompany=true,depotEntity=true,vehicleEntity=true,stationA=true,stationB=true,confirmed=true,issuedTick=true,expiresTick=true}
  local count : integer=0; for key,_ in pairs(request) do if allowed[key]~=true then return nil end; count=count+1 end; if count~=13 then return nil end
  for _,key in ipairs({"requestId","companyEntity","targetCompany","depotEntity","vehicleEntity","stationA","stationB","issuedTick","expiresTick"}) do local value=request[key]; if type(value)~="number" or value<0 or value>2147483647 or value%1~=0 then return nil end end
  if request.requestId<1 or request.companyEntity<1 or request.targetCompany<1 or request.companyEntity==request.targetCompany or request.depotEntity<1 or request.vehicleEntity<1 or request.stationA<1 or request.stationB<1 or request.stationA==request.stationB or request.expiresTick~=request.issuedTick+300 then return nil end
  if request.requestId>phase2ServiceSent then phase2ServiceSent=request.requestId as integer; api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs","tf3mp_engine_bridge","tf3mp_phase2_service",request)) end
  if phase2ServiceReported==phase2ServiceSent then return nil end
  local value=api.gui.fireGuiScriptEvent("tf3mp_engine_bridge","tf3mp_get_phase2_service",{}); if type(value)~="table" then return nil end; local receipt=value as table
  if receipt.kind~="phase2_service_receipt" then local checked : integer=0; for _,candidate in pairs(receipt) do checked=checked+1; if checked>64 then break end; if type(candidate)=="table" then local item=candidate as table; if item.kind=="phase2_service_receipt" and item.nonce==bridgeNonce and item.requestId==phase2ServiceSent then receipt=item; break end end end end
  if receipt.schemaVersion~=1 or receipt.kind~="phase2_service_receipt" or receipt.nonce~=bridgeNonce or receipt.requestId~=phase2ServiceSent or type(receipt.outcome)~="string" or type(receipt.code)~="string" then return nil end
  local result : table={schemaVersion=1,kind="phase2_service_receipt",nonce=bridgeNonce,requestId=phase2ServiceSent,outcome=receipt.outcome,code=receipt.code}
  for _,key in ipairs({"companyEntity","targetCompany","depotEntity","vehicleEntity","stationA","stationB","tickCount","updateCount","lineEntity","lineOwner","vehicleOwner","stationAOwner","stationBOwner"}) do local item=receipt[key]; if type(item)~="number" or item<0 or item>2147483647 or item%1~=0 then return nil end; result[key]=item end
  app.saveUserdata("tf3mp_status_1","phase2_service_receipt",result); phase2ServiceReported=phase2ServiceSent; return nil
end

-- A read-only start/end capture for the verified disposable service. Keep this
-- in the regular GUI exchange: userdata is unavailable to restricted timers.
-- Every accepted receipt is copied field-by-field so no nested engine userdata
-- can reach the launcher bridge.
local function exchangePhase2ServiceObservation() : nil
  if not userdataExists("phase2_service_observation_request") then return nil end
  -- Defense in depth: this exchange is called only from company_test below,
  -- but it must remain unavailable if a future caller bypasses that branch.
  if not userdataExists("bridge") then return nil end
  local bridge = app.loadUserdata("tf3mp_status_1", "bridge")
  if bridge.schemaVersion ~= 1 or bridge.mode ~= "company_test" or bridge.nonce ~= bridgeNonce then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "phase2_service_observation_request")
  if request.schemaVersion ~= 1 or request.kind ~= "phase2_service_observation" or request.nonce ~= bridgeNonce
    or (request.action ~= "start" and request.action ~= "end") then return nil end
  local allowed : table = { schemaVersion=true, kind=true, nonce=true, requestId=true, action=true, originalCompany=true,
    targetCompany=true, vehicleEntity=true, lineEntity=true, issuedTick=true, expiresTick=true }
  local count : integer = 0
  for key, _ in pairs(request) do if allowed[key] ~= true then return nil end; count = count + 1 end
  if count ~= 11 then return nil end
  if type(request.nonce) ~= "string" or #request.nonce ~= 32 or not string.match(request.nonce as string, "^[0-9a-f]+$") then return nil end
  for _, key in ipairs({ "requestId", "originalCompany", "targetCompany", "vehicleEntity", "lineEntity", "issuedTick", "expiresTick" }) do
    local value = request[key]
    if type(value) ~= "number" or value ~= value or value < 0 or value > 2147483647 or value % 1 ~= 0 then return nil end
  end
  if request.requestId < 1 or request.originalCompany < 1 or request.targetCompany < 1 or request.originalCompany == request.targetCompany
    or request.vehicleEntity < 1 or request.lineEntity < 1 or request.expiresTick < request.issuedTick or request.expiresTick - request.issuedTick > 300 then return nil end
  if request.requestId > phase2ServiceObservationSent then
    -- Consume before the send. An uncertain command is never automatically retried.
    phase2ServiceObservationSent = request.requestId as integer
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_phase2_service_observation", request))
  end
  if phase2ServiceObservationReported == phase2ServiceObservationSent then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_phase2_service_observation", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  -- GUI event return values may be a flat receipt or an event-result map.
  -- Unwrap at most one bounded matching receipt; never export that envelope.
  if receipt.kind ~= "phase2_service_observation_receipt" then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.kind == "phase2_service_observation_receipt" and item.nonce == bridgeNonce
          and item.requestId == phase2ServiceObservationSent and item.action == request.action then receipt = item; break end
      end
    end
  end
  if receipt.schemaVersion ~= 1 or receipt.kind ~= "phase2_service_observation_receipt" or receipt.nonce ~= bridgeNonce
    or receipt.requestId ~= phase2ServiceObservationSent or receipt.action ~= request.action
    or receipt.originalCompany ~= request.originalCompany or receipt.targetCompany ~= request.targetCompany
    or receipt.vehicleEntity ~= request.vehicleEntity or receipt.lineEntity ~= request.lineEntity
    or receipt.issuedTick ~= request.issuedTick or receipt.expiresTick ~= request.expiresTick then return nil end
  local receiptAllowed : table = { schemaVersion=true, kind=true, nonce=true, requestId=true, action=true, outcome=true, code=true,
    originalCompany=true, targetCompany=true, vehicleEntity=true, lineEntity=true, issuedTick=true, expiresTick=true, tickCount=true,
    updateCount=true, gameTime=true, startGameTime=true, startUpdateCount=true, endGameTime=true, endUpdateCount=true,
    accountNetWindowStart=true, accountNetWindowEnd=true, accountNet=true, intervalNet=true, intervalMaintenanceVehicle=true,
    intervalMaintenanceInfrastructure=true, intervalMaintenanceOther=true, intervalMaintenanceVehicleMaintenance=true,
    startVisitedMask=true, endVisitedMask=true, startStopIndex=true, endStopIndex=true }
  local receiptCount : integer = 0
  for key, _ in pairs(receipt) do if receiptAllowed[key] ~= true then return nil end; receiptCount = receiptCount + 1 end
  local outcomes : table = { raw_start_captured=true, raw_end_captured=true, rejected=true }
  local codes : table = { RAW_START_CAPTURED=true, RAW_END_CAPTURED=true, INVALID_REQUEST=true, HELD_ENGINE_REQUIRED=true,
    CLOCK_UNAVAILABLE=true, REQUEST_OUTSIDE_WINDOW=true, ORIGINAL_COMPANY_CHANGED=true, COMPANY_MISSING=true,
    COMPANY_PHASE2_FAULT=true, SERVICE_RECEIPT_UNVERIFIED=true, SERVICE_RECEIPT_CHANGED=true, BOUND_ENTITY_MISSING=true,
    TARGET_OWNERSHIP_CHANGED=true, VEHICLE_LINE_CHANGED=true, TWO_STOP_LINE_REQUIRED=true, INVALID_LINE_STOP=true,
    INVALID_VISIT_HISTORY=true, INVALID_VISITED_STOP=true, STATE_UNAVAILABLE=true, STATE_PERSIST_FAILED=true,
    ACCOUNT_BALANCE_UNAVAILABLE=true, OBSERVATION_ALREADY_STARTED=true,
    OBSERVATION_NOT_STARTED=true, OBSERVATION_ALREADY_FINISHED=true, OBSERVATION_BINDING_CHANGED=true,
    SIMULATION_DID_NOT_ADVANCE=true, OBSERVED_ROUTE_CHANGED=true, INTERVAL_BALANCE_UNAVAILABLE=true,
    OBSERVATION_UNAVAILABLE=true }
  if receiptCount ~= 32 or type(receipt.outcome) ~= "string" or outcomes[receipt.outcome] ~= true
    or type(receipt.code) ~= "string" or #receipt.code < 1 or #receipt.code > 64
    or not string.match(receipt.code as string, "^[A-Z_]+$") or codes[receipt.code] ~= true then return nil end
  if (receipt.outcome == "raw_start_captured" and receipt.code ~= "RAW_START_CAPTURED")
    or (receipt.outcome == "raw_end_captured" and receipt.code ~= "RAW_END_CAPTURED")
    or (receipt.outcome == "rejected" and (receipt.code == "RAW_START_CAPTURED" or receipt.code == "RAW_END_CAPTURED")) then return nil end
  local result : table = { schemaVersion=1, kind="phase2_service_observation_receipt", nonce=bridgeNonce,
    requestId=phase2ServiceObservationSent, action=request.action, outcome=receipt.outcome, code=receipt.code }
  for _, key in ipairs({ "originalCompany", "targetCompany", "vehicleEntity", "lineEntity", "issuedTick", "expiresTick", "tickCount", "updateCount", "startUpdateCount", "endUpdateCount" }) do
    local item = receipt[key]
    if type(item) ~= "number" or item ~= item or item < 0 or item > 2147483647 or item % 1 ~= 0 then return nil end
    result[key] = item
  end
  for _, key in ipairs({ "startVisitedMask", "endVisitedMask" }) do
    local item = receipt[key]
    if type(item) ~= "number" or item ~= item or item < 0 or item > 3 or item % 1 ~= 0 then return nil end
    result[key] = item
  end
  for _, key in ipairs({ "startStopIndex", "endStopIndex" }) do
    local item = receipt[key]
    if type(item) ~= "number" or item ~= item or (item ~= 0 and item ~= 1) then return nil end
    result[key] = item
  end
  for _, key in ipairs({ "gameTime", "startGameTime", "endGameTime", "accountNetWindowStart", "accountNetWindowEnd", "accountNet", "intervalNet", "intervalMaintenanceVehicle", "intervalMaintenanceInfrastructure", "intervalMaintenanceOther", "intervalMaintenanceVehicleMaintenance" }) do
    local item = receipt[key]
    if type(item) ~= "number" or item ~= item or item == math.huge or item == -math.huge or math.abs(item) > 9007199254740991 or item % 1 ~= 0 then return nil end
    result[key] = item
  end
  app.saveUserdata("tf3mp_status_1", "phase2_service_observation_receipt", result)
  phase2ServiceObservationReported = phase2ServiceObservationSent
  return nil
end

local function exchangePhase2Funding() : nil
  if not userdataExists("phase2_funding_request") then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "phase2_funding_request")
  if request.schemaVersion ~= 1 or request.kind ~= "phase2_funding" or request.nonce ~= bridgeNonce or request.confirmed ~= 1 then return nil end
  for _, key in ipairs({ "requestId", "companyEntity", "targetCompany", "amount", "issuedTick", "expiresTick" }) do
    local value = request[key]
    if type(value) ~= "number" or value < 0 or value > 2147483647 or value % 1 ~= 0 then return nil end
  end
  if request.requestId < 1 or request.amount < 1 or request.amount > 1000000 or request.expiresTick ~= request.issuedTick + 300 then return nil end
  if request.requestId > phase2FundingSent then
    phase2FundingSent = request.requestId as integer
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_phase2_funding", request))
  end
  if phase2FundingReported == phase2FundingSent then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_phase2_funding", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.kind ~= "phase2_funding_receipt" then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.kind == "phase2_funding_receipt" and item.nonce == bridgeNonce and item.requestId == phase2FundingSent then receipt = item; break end
      end
    end
  end
  if receipt.kind ~= "phase2_funding_receipt" or receipt.nonce ~= bridgeNonce or receipt.requestId ~= phase2FundingSent then return nil end
  app.saveUserdata("tf3mp_status_1", "phase2_funding_receipt", receipt)
  phase2FundingReported = phase2FundingSent
  return nil
end

local function exchangeCompanyProbe() : nil
  if not userdataExists("company_request") then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "company_request")
  if request.schemaVersion ~= 1 or (request.kind ~= "company_probe" and request.kind ~= "finance_probe") or request.nonce ~= bridgeNonce then return nil end
  local finance = request.kind == "finance_probe"
  local expectedKind = finance and "finance_receipt" or "company_receipt"
  for _, key in ipairs({ "requestId", "companyEntity", "issuedTick", "expiresTick" }) do
    local value = request[key]
    if type(value) ~= "number" or value < 0 or value > 2147483647 or value % 1 ~= 0 then return nil end
  end
  if request.requestId < 1 or request.expiresTick ~= request.issuedTick + 300 then return nil end
  if request.requestId > companyProbeSent then
    companyProbeSent = request.requestId as integer -- Consume before dispatch; never retry.
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", finance and "tf3mp_finance_probe" or "tf3mp_company_probe", {
      schemaVersion = 1, nonce = bridgeNonce, requestId = companyProbeSent, companyEntity = request.companyEntity,
      issuedTick = request.issuedTick, expiresTick = request.expiresTick,
    }))
  end
  if companyProbeReported == companyProbeSent then return nil end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", finance and "tf3mp_get_finance_receipt" or "tf3mp_get_company_receipt", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.kind ~= expectedKind then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.kind == expectedKind and item.nonce == bridgeNonce and item.requestId == companyProbeSent then receipt = item; break end
      end
    end
  end
  if receipt.kind ~= expectedKind or receipt.nonce ~= bridgeNonce or receipt.requestId ~= companyProbeSent then return nil end
  local result : table = {
    schemaVersion = 1, kind = expectedKind, nonce = bridgeNonce, requestId = companyProbeSent,
    companyEntity = receipt.companyEntity, newCompanyEntity = receipt.newCompanyEntity, outcome = receipt.outcome,
    tickCount = receipt.tickCount, updateCount = receipt.updateCount,
  }
  if finance then
    result.stage = receipt.stage
    for _, name in ipairs({ "originalBefore", "originalCredit", "originalAfter", "targetBefore", "targetCredit", "targetAfter" }) do
      result[name] = receipt[name]; result[name .. "Negative"] = receipt[name .. "Negative"]
    end
  end
  app.saveUserdata("tf3mp_status_1", expectedKind, result)
  companyProbeReported = companyProbeSent
  return nil
end

-- Read-only: discover the saved test-company marker, then query both engine
-- entities. Never create a company, switch control or move money here.
local function exchangeCompanyInspection() : nil
  if not userdataExists("company_inspect_request") then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "company_inspect_request")
  if request.schemaVersion ~= 1 or request.kind ~= "company_inspect" or request.nonce ~= bridgeNonce then return nil end
  if type(request.requestId) ~= "number" or request.requestId < 1 or request.requestId > 2147483647 or request.requestId % 1 ~= 0 then return nil end
  if request.requestId <= companyInspectionSent then return nil end
  companyInspectionSent = request.requestId as integer
  local result : table = { schemaVersion = 1, kind = "company_inspection", nonce = bridgeNonce, requestId = companyInspectionSent,
    outcome = "no_test_company", tickCount = 0, updateCount = 0, companyEntity = 0, newCompanyEntity = 0,
    originalBalance = 0, originalKnown = 0, originalNegative = 0, originalAssets = 0, originalVehicles = 0, originalLines = 0,
    createdBalance = 0, createdKnown = 0, createdNegative = 0, createdAssets = 0, createdVehicles = 0, createdLines = 0 }
  local ok = pcall(function()
    local clock = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
    result.tickCount = clock.tickCount
    result.updateCount = clock.updateCount
    local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_company_receipt", {})
    if type(value) ~= "table" then return end
    local receipt = value as table
    if receipt.kind ~= "company_receipt" then
      local checked : integer = 0
      for _, candidate in pairs(receipt) do
        checked = checked + 1
        if checked > 64 then break end
        if type(candidate) == "table" then
          local item = candidate as table
          if item.kind == "company_receipt" and item.outcome == "created" then receipt = item; break end
        end
      end
    end
    if receipt.kind ~= "company_receipt" or receipt.outcome ~= "created" then return end
    local original = receipt.companyEntity as integer
    local created = receipt.newCompanyEntity as integer
    result.companyEntity = original
    result.newCompanyEntity = created
    if original == created or not api.engine.entityExists(original) or not api.engine.entityExists(created) then result.outcome = "company_missing"; return end
    if api.engine.util.getPlayer() ~= original then result.outcome = "company_changed"; return end
    for index, entity in ipairs({ original, created }) do
      local company = api.engine.getComponent(entity, api.type.ComponentType.PLAYER) as Engine.Component.Player
      if company == nil then result.outcome = "company_missing"; return end
      local prefix = index == 1 and "original" or "created"
      local balance = api.engine.util.finance.getPlayersBalance(entity)
      if balance ~= nil then
        result[prefix .. "Known"] = 1
        result[prefix .. "Negative"] = balance < 0 and 1 or 0
        result[prefix .. "Balance"] = balance < 0 and -balance or balance
      end
      local filter : Engine.EntityFilters = { requireOwnedByPlayer = entity }
      result[prefix .. "Assets"] = #api.engine.getEntitiesWithComponent(api.type.ComponentType.PLAYER_OWNED, filter)
      result[prefix .. "Vehicles"] = #api.engine.getEntitiesWithComponent(api.type.ComponentType.TRANSPORT_VEHICLE, filter)
      result[prefix .. "Lines"] = #api.engine.system.lineSystem.getLinesForPlayer(entity)
    end
    result.outcome = "inspected"
  end)
  if not ok then result.outcome = "read_failed" end
  app.saveUserdata("tf3mp_status_1", "company_inspection", result)
  return nil
end

-- Read-only Host roster preflight. A network claim is never ownership proof:
-- this observes actual PLAYER entities while the Host game is held. The
-- game-side bindSession repeats the checks on every participant afterward.
local function exchangeRosterInspection() : nil
  if not userdataExists("roster_inspect_request") then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "roster_inspect_request")
  if request.schemaVersion ~= 1 or request.kind ~= "roster_inspect" or request.nonce ~= bridgeNonce then return nil end
  if type(request.requestId) ~= "number" or request.requestId < 1 or request.requestId > 2147483647
    or request.requestId % 1 ~= 0 or request.requestId <= rosterInspectionSent then return nil end
  rosterInspectionSent = request.requestId as integer
  local result : table = { schemaVersion=1, kind="roster_inspection", nonce=bridgeNonce,
    requestId=rosterInspectionSent, outcome="invalid", tickCount=0, updateCount=0,
    companyCount=0, hostCompany=0, companyA=0, companyB=0, companyC=0, companyD=0 }
  local ok = pcall(function()
    local clock = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
    local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
    result.tickCount = clock.tickCount; result.updateCount = clock.updateCount
    local allowed : table = { schemaVersion=true, kind=true, nonce=true, requestId=true,
      issuedUpdate=true, companyCount=true, hostCompany=true,
      companyA=true, companyB=true, companyC=true, companyD=true }
    local count : integer = 0
    for key, _ in pairs(request) do if allowed[key] ~= true then return end; count = count + 1 end
    if count ~= 11 or type(request.companyCount) ~= "number" or request.companyCount < 2
      or request.companyCount > 4 or request.companyCount % 1 ~= 0
      or type(request.issuedUpdate) ~= "number" or request.issuedUpdate < 0
      or request.issuedUpdate > 2147483647 or request.issuedUpdate % 1 ~= 0 then return end
    result.companyCount = request.companyCount
    for index, key in ipairs({ "companyA", "companyB", "companyC", "companyD" }) do
      local value = request[key]
      if type(value) ~= "number" or value % 1 ~= 0 or value < 0 or value > 2147483647 then return end
      result[key] = value
      if index <= request.companyCount and value < 1 then return end
      if index > request.companyCount and value ~= 0 then return end
    end
    if request.hostCompany ~= request.companyA or request.hostCompany < 1 then return end
    result.hostCompany = request.hostCompany
    if api.engine.util.getPlayer() ~= request.hostCompany then result.outcome = "company_changed"; return end
    if speed == nil or speed.speedup ~= 0 then result.outcome = "not_paused"; return end
    if clock.updateCount ~= request.issuedUpdate then result.outcome = "clock_changed"; return end
    local seen : table = {}
    for _, key in ipairs({ "companyA", "companyB", "companyC", "companyD" }) do
      local entity = request[key]
      if entity ~= 0 then
        if seen[entity] == true or not api.engine.entityExists(entity as integer)
          or api.engine.getComponent(entity as integer, api.type.ComponentType.PLAYER) == nil then
          result.outcome = "company_missing"; return
        end
        seen[entity] = true
      end
    end
    local afterClock = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
    local afterSpeed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
    if afterClock.updateCount ~= request.issuedUpdate or afterSpeed == nil or afterSpeed.speedup ~= 0 then
      result.outcome = "clock_changed"; return
    end
    result.outcome = "verified"
  end)
  if not ok then result.outcome = "read_failed" end
  app.saveUserdata("tf3mp_status_1", "roster_inspection", result)
  return nil
end

-- Delay only in GUI memory. Recheck the live request immediately before the
-- send; the engine independently refuses early/late delivery before pausing.
local function dispatchPauseAtUpdate() : nil
  if pendingPauseDelivery.nonce == nil then return nil end
  local request = pendingPauseDelivery
  if missedAcks > 10 or not userdataExists("bridge") or not userdataExists("pause_request") then pendingPauseDelivery = {}; return nil end
  local config = app.loadUserdata("tf3mp_status_1", "bridge")
  if config.mode ~= "pause_test" or config.nonce ~= request.nonce or request.nonce ~= bridgeNonce then pendingPauseDelivery = {}; return nil end
  local clock = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
  if clock.updateCount < request.scheduledUpdate - 1 and clock.tickCount <= request.expiresTick then return nil end
  pendingPauseDelivery = {} -- Consume before dispatch, never retry.
  local live = app.loadUserdata("tf3mp_status_1", "pause_request")
  for key, value in pairs(request) do
    if live[key] ~= value then return nil end
  end
  api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_pause_probe", request))
  return nil
end

local function exchangePauseTest() : nil
  if not userdataExists("pause_request") then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "pause_request")
  if request.schemaVersion ~= 1 or request.kind ~= "pause_probe" or request.nonce ~= bridgeNonce then return nil end
  if request.phase ~= "pause" and request.phase ~= "check" and request.phase ~= "resume" then return nil end
  local eventParam : table = { schemaVersion = 1, kind = "pause_probe", nonce = bridgeNonce, phase = request.phase }
  for _, key in ipairs({ "requestId", "companyEntity", "heldUpdate", "issuedTick", "expiresTick", "scheduledUpdate" }) do
    local value = request[key]
    if type(value) ~= "number" or value < 0 or value > 2147483647 or value % 1 ~= 0 then return nil end
    eventParam[key] = value
  end
  local key = tostring(request.requestId) .. ":" .. (request.phase as string)
  if pausePhaseSent ~= key then
    pausePhaseSent = key
    if request.phase == "pause" and request.scheduledUpdate > 0 then
      pendingPauseDelivery = eventParam
    else
      api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_pause_probe", eventParam))
    end
  end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_pause_receipt", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.kind ~= "pause_receipt" then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.kind == "pause_receipt" and item.nonce == bridgeNonce then receipt = item; break end
      end
    end
  end
  if receipt.kind ~= "pause_receipt" or receipt.nonce ~= bridgeNonce or receipt.requestId ~= request.requestId or receipt.phase ~= request.phase then return nil end
  local result : table = { schemaVersion = 1, kind = "pause_receipt", nonce = bridgeNonce, phase = request.phase }
  for _, field in ipairs({ "requestId", "companyEntity", "heldUpdate", "tickCount", "updateCount", "speedup" }) do
    local numberValue = receipt[field]
    if type(numberValue) ~= "number" or numberValue < 0 or numberValue > 2147483647 or numberValue % 1 ~= 0 then return nil end
    result[field] = numberValue
  end
  if type(receipt.outcome) ~= "string" or not string.match(receipt.outcome as string, "^[a-z_]+$") then return nil end
  result.outcome = receipt.outcome
  app.saveUserdata("tf3mp_status_1", "pause_receipt", result)
  return nil
end

local function exchangeHeldSnapshot() : nil
  if not userdataExists("snapshot_request") then return nil end
  local request = app.loadUserdata("tf3mp_status_1", "snapshot_request")
  if request.schemaVersion ~= 1 or request.kind ~= "snapshot_request" or request.nonce ~= bridgeNonce then return nil end
  local param : table = { schemaVersion = 1, kind = "snapshot_request", nonce = bridgeNonce }
  for _, key in ipairs({ "requestId", "entity", "companyEntity", "heldUpdate", "issuedTick", "expiresTick" }) do
    local v = request[key]
    if type(v) ~= "number" or v < 0 or v > 2147483647 or v % 1 ~= 0 then return nil end
    param[key] = v
  end
  if param.requestId < 1 or param.expiresTick ~= param.issuedTick + 300 then return nil end
  if param.requestId > snapshotSent then
    snapshotSent = param.requestId as integer
    api.cmd.sendCommand(api.cmd.makeScriptingSendEventCmd("tf3mp_status_1::/tf3mp_status.gs", "tf3mp_engine_bridge", "tf3mp_capture_snapshot", param))
  end
  local value = api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_snapshot", {})
  if type(value) ~= "table" then return nil end
  local receipt = value as table
  if receipt.kind ~= "held_snapshot" then
    local checked : integer = 0
    for _, candidate in pairs(receipt) do
      checked = checked + 1
      if checked > 64 then break end
      if type(candidate) == "table" then
        local item = candidate as table
        if item.kind == "held_snapshot" and item.nonce == bridgeNonce then receipt = item; break end
      end
    end
  end
  if receipt.kind ~= "held_snapshot" or receipt.nonce ~= bridgeNonce or receipt.requestId ~= param.requestId then return nil end
  if receipt.schemaVersion ~= 1 and receipt.schemaVersion ~= 2 then return nil end
  local allowed : table = { schemaVersion=true, kind=true, nonce=true, requestId=true, entity=true, companyEntity=true, heldUpdate=true,
    tickCount=true, updateCount=true, speedup=true, ownerCompanyEntity=true, revision=true, stopFlag=true, balanceNegative=true, balance=true, outcome=true }
  if receipt.schemaVersion == 2 then
    for _, domain in ipairs({ "townsGrowth", "economy", "topology", "vehicles", "companies", "linesServices", "rngHiddenState" }) do
      allowed[domain .. "Status"] = true; allowed[domain .. "Hash"] = true
    end
  end
  local count : integer = 0
  for key in pairs(receipt) do if allowed[key] ~= true then return nil end; count = count + 1 end
  if count ~= (receipt.schemaVersion == 2 and 30 or 16) then return nil end
  local result : table = { schemaVersion = receipt.schemaVersion, kind = "held_snapshot", nonce = bridgeNonce }
  for _, key in ipairs({ "requestId", "entity", "companyEntity", "heldUpdate", "tickCount", "updateCount", "speedup", "ownerCompanyEntity", "revision", "stopFlag", "balanceNegative" }) do
    local v = receipt[key]
    if type(v) ~= "number" or v < 0 or v > 2147483647 or v % 1 ~= 0 then return nil end
    result[key] = v
  end
  if type(receipt.balance) ~= "number" or receipt.balance < 0 or receipt.balance > 9007199254740991 or receipt.balance % 1 ~= 0 then return nil end
  if type(receipt.outcome) ~= "string" or not string.match(receipt.outcome as string, "^[a-z_]+$") then return nil end
  result.balance = receipt.balance; result.outcome = receipt.outcome
  if receipt.schemaVersion == 2 then
    -- v2 is an exact, fail-closed envelope.  A missing or malformed domain
    -- never degrades into the old selected-state receipt under the same nonce.
    for _, domain in ipairs({ "townsGrowth", "economy", "topology", "vehicles", "companies", "linesServices", "rngHiddenState" }) do
      local status, digest = receipt[domain .. "Status"], receipt[domain .. "Hash"]
      if type(status) ~= "string" or type(digest) ~= "string" then return nil end
      if status == "observed" then
        if #digest ~= 64 or not string.match(digest, "^[0-9a-f]+$") then return nil end
      elseif (status == "unavailable" or status == "unsupported" or status == "read_failed") and digest == status then
        -- Explicit blind spot/failure; JS will refuse comparison-ready mode.
      else return nil end
      result[domain .. "Status"] = status; result[domain .. "Hash"] = digest
    end
  elseif receipt.schemaVersion ~= 1 then return nil end
  app.saveUserdata("tf3mp_status_1", "snapshot_receipt", result)
  return nil
end

local function exchangeTelemetry(tickCount : integer, updateCount : integer) : string
  if not userdataExists("bridge") then return "helper offline" end
  local config = app.loadUserdata("tf3mp_status_1", "bridge")
  if config.schemaVersion ~= 1 or (config.mode ~= "telemetry" and config.mode ~= "vehicle_test" and config.mode ~= "company_test" and config.mode ~= "pause_test" and config.mode ~= "halt_test" and config.mode ~= "watchdog_test") or type(config.nonce) ~= "string" then
    return "bridge config invalid"
  end
  local nonce = config.nonce as string
  if #nonce ~= 32 or not string.match(nonce, "^[0-9a-f]+$") then return "bridge config invalid" end
  if nonce ~= bridgeNonce then
    bridgeNonce = nonce
    bridgeCounter = 0
    lastAck = -1
    missedAcks = 0
    lastProbe = 0
    probeReported = 0
    probeFailed = false
    probeResult = "diagnostics"
    vehiclePhaseKey = ""
    vehicleDiscoverySent = 0
    companyProbeSent = 0
    phase2FundingSent = 0
    phase2FundingReported = 0
    phase2DepotSent = 0
    phase2DepotReported = 0
    phase2VehicleSent = 0
    phase2VehicleReported = 0
    phase2StationSent = 0
    phase2StationReported = 0
    phase2ServiceSent = 0
    phase2ServiceReported = 0
    phase2ServiceObservationSent = 0
    phase2ServiceObservationReported = 0
    stationProbeSent = 0
    stationProbeReported = 0
    companyProbeReported = 0
    companyInspectionSent = 0
    rosterInspectionSent = 0
    roadReplaySent = 0
    roadReplayReported = 0
    pausePhaseSent = ""
    snapshotSent = 0
    haltSent = 0
    watchdogSent = 0
    coordinationSent = ""
    bindingSent = ""
    preparationSent = ""
    executionSent = ""
    pendingExecution = {}
    pendingCheckpoint = {}
    checkpointSent = ""
    releaseSent = ""
    pendingPauseDelivery = {}
    pendingVehicleDelivery = {}
  end
  if userdataExists("ack") then
    local ack = app.loadUserdata("tf3mp_status_1", "ack")
    if ack.schemaVersion == 1 and ack.nonce == bridgeNonce and type(ack.counter) == "number" then
      local counter = ack.counter as number
      if counter % 1 == 0 and counter > lastAck and counter <= bridgeCounter then
        lastAck = counter as integer
        missedAcks = 0
      end
    end
  end
  bridgeCounter = bridgeCounter + 1
  missedAcks = missedAcks + 1
  app.saveUserdata("tf3mp_status_1", "telemetry", {
    schemaVersion = 1, kind = "telemetry", nonce = bridgeNonce,
    counter = bridgeCounter, tickCount = tickCount, updateCount = updateCount,
  })
  -- Optional read-only observations. No mutation or request dispatch, and no
  -- userdata I/O from the restricted engine timer. Isolate failures so an
  -- unsupported component cannot bring down the working status bridge.
  local observationOk, observationWritten = pcall(function() : boolean
    local world = api.engine.util.getWorld()
    local freshClock = api.engine.getComponent(world, api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
    local speed = api.engine.getComponent(world, api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
    local company = api.engine.util.getPlayer()
    if not api.engine.entityExists(company) then return false end
    local balance = api.engine.util.finance.getPlayersBalance(company)
    local known : integer = 1
    if balance == nil then balance = 0; known = 0 end
    local negative : integer = 0
    if balance < 0 then negative = 1; balance = -balance end
    app.saveUserdata("tf3mp_status_1", "engine_observation", {
      schemaVersion = 1, kind = "engine_observation", nonce = bridgeNonce,
      counter = bridgeCounter, tickCount = freshClock.tickCount, updateCount = freshClock.updateCount,
      speedup = speed.speedup, companyEntity = company, balanceKnown = known, balanceNegative = negative, balance = balance,
    })
    return true
  end)
  if not probeFailed then
    local ok = pcall(exchangeEngineProbe)
    if not ok then probeFailed = true end
  end
  if config.mode == "watchdog_test" then
    pcall(exchangeBinding)
    pcall(exchangeCheckpoint)
    pcall(exchangeRelease)
    pcall(exchangePreparation)
    pcall(exchangeExecution)
    pcall(exchangeCoordinationHalt)
    -- The coordinator inspects ownership before arming a native Stop and
    -- again after its receipt. Keep this read-only exchange alive in the
    -- terminal watchdog mode that owns those command phases.
    local discoveryOk = pcall(exchangeVehicleDiscovery)
    if not discoveryOk then return "vehicle discovery error / see launcher" end
    local watchdogOk = pcall(exchangeWatchdog)
    if missedAcks > 10 then return watchdogOk and "helper disconnected / observing engine stop" or "helper disconnected / stop evidence unavailable" end
    if lastAck < 0 then return "bridge connecting" end
    return watchdogOk and "LOCAL engine expiry test / ends paused" or "expiry stop unknown / pause manually"
  end
  if missedAcks > 10 then return "bridge disconnected" end
  if lastAck < 0 then return "bridge connecting" end
  if config.mode == "halt_test" then
    local haltOk = pcall(exchangeHalt)
    return haltOk and "LOCAL stop test / see launcher" or "stop outcome unknown / pause manually"
  end
  if config.mode == "pause_test" then
    local snapshotOk = pcall(exchangeHeldSnapshot)
    if not snapshotOk then return "snapshot unavailable / see launcher" end
    local ok = pcall(exchangePauseTest)
    return ok and "LOCAL pause test / see launcher" or "pause test error / resume manually"
  end
  local inspectionOk = pcall(exchangeCompanyInspection)
  if not inspectionOk then return "company inspection unavailable / see launcher" end
  local rosterOk = pcall(exchangeRosterInspection)
  if not rosterOk then return "roster inspection unavailable / see launcher" end
  local discoveryOk = pcall(exchangeVehicleDiscovery)
  if not discoveryOk then return "vehicle discovery error / see launcher" end
  if config.mode == "company_test" then
    local roadReplayOk = pcall(exchangeNativeRoadStopReplay)
    if not roadReplayOk then return "road replay outcome unknown / do not retry" end
    local stationOk = pcall(exchangeStationTemplate)
    if not stationOk then return "station inspection unavailable / do not retry" end
    local depotOk = pcall(exchangePhase2Depot)
    if not depotOk then return "depot outcome unknown / do not retry" end
    local vehicleOk = pcall(exchangePhase2Vehicle)
    if not vehicleOk then return "vehicle outcome unknown / do not retry" end
    local stationOk = pcall(exchangePhase2Station)
    if not stationOk then return "station outcome unknown / do not retry" end
    local serviceOk = pcall(exchangePhase2Service)
    if not serviceOk then return "service outcome unknown / do not retry" end
    local serviceObservationOk = pcall(exchangePhase2ServiceObservation)
    if not serviceObservationOk then return "service observation unavailable / do not retry" end
    local fundingOk = pcall(exchangePhase2Funding)
    if not fundingOk then return "funding outcome unknown / do not retry" end
    local ok = pcall(exchangeCompanyProbe)
    return ok and "company test / see launcher / disposable save" or "company test error / do not retry"
  end
  if config.mode == "vehicle_test" then
    local ok = pcall(exchangeVehicleTest)
    return ok and "LOCAL vehicle test / not multiplayer" or "vehicle test error / see launcher"
  end
  if probeFailed then return "bridge connected / engine test failed" end
  if not observationOk or observationWritten ~= true then return "bridge connected / observation unavailable / see launcher" end
  return "bridge connected / " .. probeResult
end
-- USERDATA EXCHANGE END

local Tf3MpStatusPanel = react.RegisterPluginRecipe(game_bar_widgets.GameBarInfoDisplayExtension, "Tf3MpStatusPanel", function() : TreeNodeId
  local makeState = function() : Tf3MpPanelState
    local clock = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
    return {
      tickCount = clock.tickCount,
      updateCount = clock.updateCount,
    }
  end

  local status = engine_react_util.useStepStateTimer(makeState, 0.5)
  local current = status:old()
  local bridgeStatus = react.useState("bridge waiting") as ReactStateT<string>
  -- Unlike onStepTimer, onStep does not enqueue a restricted deferred step.
  -- TF3's own map editor uses getAllUserdata here. Never move this into makeState.
  react.onStep(function()
    checkPlacementRoute()
    flushRoadCapture()
    if bridgeFailed then pcall(restoreSpeedControls); return end
    local checkpointOk = pcall(dispatchCheckpointAtUpdate)
    if not checkpointOk then
      pendingCheckpoint = {}
      bridgeFailed = true
      bridgeStatus:set("checkpoint delivery unknown / stop helper / do not retry")
      return
    end
    local executionOk = pcall(dispatchExecutionAtUpdate)
    if not executionOk then
      pendingExecution = {}
      bridgeFailed = true
      bridgeStatus:set("execution delivery unknown / stop helper / do not retry")
      return
    end
    local pauseDeliveryOk = pcall(dispatchPauseAtUpdate)
    if not pauseDeliveryOk then
      pendingPauseDelivery = {}
      bridgeFailed = true
      bridgeStatus:set("pause delivery failed / stop helper / resume manually")
      return
    end
    local deliveryOk = pcall(dispatchVehicleAtUpdate)
    if not deliveryOk then
      pendingVehicleDelivery = {}
      bridgeFailed = true
      bridgeStatus:set("scheduled delivery failed / restart helper and UI")
      return
    end
    stepCount = stepCount + 1
    if stepCount % 30 ~= 0 then return end
    local ok, result = pcall(function() : string
      local sample = status:old()
      return exchangeTelemetry(sample.tickCount, sample.updateCount)
    end)
    if not ok then
      pcall(restoreSpeedControls)
      bridgeFailed = true
      bridgeStatus:set("bridge unavailable / file access failed")
    else
      bridgeStatus:set(result as string)
      local controlsOk = pcall(exchangeSpeedControls)
      if not controlsOk then
        pcall(restoreSpeedControls)
        bridgeFailed = true
        bridgeStatus:set("speed control test failed / stop helper")
      end
      local permitOk = pcall(exchangeSingleStopPermit)
      if not permitOk then
        pcall(native_controls.revokeSingleStop, bridgeNonce)
        bridgeFailed = true
        bridgeStatus:set("Stop permit failed / stop helper")
      end
    end
  end)
  react.onUnmount(function() pcall(restoreSpeedControls) end)

  return builtin.BoxLayout {
    orientation = builtin.type.Orientation.Horizontal,
    children = {
      builtin.Component {
        meta = {
          tooltip = _("Gameplay is not synchronized. Diagnostics are active by default. Launcher Debug can enable an experimental LOCAL vehicle stop/start test. File access failures disable the bridge until the UI is reopened."),
        },
        layout = builtin.BoxLayout {
          orientation = builtin.type.Orientation.Horizontal,
          children = {
            builtin.TextView {
              meta = { class = "font-scale-headline" },
              text = _("TF3MP"),
            },
            builtin.TextView {
              meta = { class = "font-scale-headline" },
              text = "update " .. tostring(current.updateCount) .. " / " .. bridgeStatus:old(),
            },
          },
        },
      },
    },
  }
end)

return {
  Tf3MpStatusPanel = Tf3MpStatusPanel,
}
