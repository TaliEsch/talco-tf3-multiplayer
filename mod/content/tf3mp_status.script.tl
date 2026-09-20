local record Tf3MpState
  schemaVersion : integer
  tickCount : integer
  updateCount : integer
  lastDiagnosticUpdate : integer
  probeNonce : string
  probeRequestId : integer
  probeTickCount : integer
  probeUpdateCount : integer
  eventSubscriptionsVersion : integer
  probeScheduledUpdate : integer
  probeOutcome : string
  probePending : boolean
  probePreviousUpdate : integer
  vehicleReceipt : table
  vehicleInbox : table
  companyTestAttempted : boolean
  companyReceipt : table
  financeTestAttempted : boolean
  financeReceipt : table
  phase2FundingAttempted : boolean
  phase2FundingReceipt : table
  phase2CompanyFault : boolean
  nativeDepotAttempted : boolean
  nativeDepotReceipt : table
  phase2DepotReceipt : table
  nativeVehicleAttempted : boolean
  nativeVehicleReceipt : table
  phase2VehicleReceipt : table
  nativeStationSlot1Attempted : boolean
  nativeStationSlot2Attempted : boolean
  nativeStationSlot1Receipt : table
  nativeStationSlot2Receipt : table
  nativeStationReceipt : table
  phase2StationReceipt : table
  phase2ServiceReceipt : table
  nativeServiceLineAttempted : boolean
  nativeServiceAssignmentAttempted : boolean
  nativeServiceReceipt : table
  pauseTestAttempted : boolean
  scheduledPauseTestAttempted : boolean
  pauseReceipt : table
  snapshotReceipt : table
  haltTestAttempted : boolean
  haltReceipt : table
  watchdogLease : table
  coordinationReceipt : table
  coordinationBinding : table
  bindingReceipt : table
  preparedCommand : table
  preparationReceipt : table
  checkpointReceipt : table
  releaseReceipt : table
  executionReceipt : table
  executionBarrier : table
  stationTemplateAttempted : boolean
  stationTemplateReceipt : table
end

local record Tf3MpDepotCommand
  execute : function(GameScriptState<Tf3MpState>, table, table, table): table
end

-- The Lua adapter owns the native proposal and its persistent attempt latch.
local depotCommand = ug_require "tf3mp_status_1::/tf3mp_depot_command.lua" as Tf3MpDepotCommand

local record Tf3MpVehicleCommand
  execute : function(GameScriptState<Tf3MpState>, table, table, table): table
end
local vehicleCommand = ug_require "tf3mp_status_1::/tf3mp_vehicle_command.lua" as Tf3MpVehicleCommand

local record Tf3MpStationCommand
  execute : function(GameScriptState<Tf3MpState>, table, table, table): table
end
local stationCommand = ug_require "tf3mp_status_1::/tf3mp_station_command.lua" as Tf3MpStationCommand
local record Tf3MpServiceCommand
  execute : function(GameScriptState<Tf3MpState>, table, table, table): table
end
local serviceCommand = ug_require "tf3mp_status_1::/tf3mp_service_command.lua" as Tf3MpServiceCommand

-- This adapter only evaluates the documented template path; it has no command
-- capability and returns a compact observation for the bridge.
local stationProbe = ug_require "tf3mp_status_1::/tf3mp_station_probe.lua" as table
local record Tf3MpProposalFacts
  collect : function(any, any, any) : string
end
local proposalFacts = ug_require "tf3mp_status_1::/tf3mp_proposal_facts.lua" as Tf3MpProposalFacts
local record Tf3MpRoadCapture
  collect : function(any, any, any) : table
end
local roadCapture = ug_require "tf3mp_status_1::/tf3mp_road_capture.lua" as Tf3MpRoadCapture
local roadCaptureTypes = api.type
local function roadCaptureModelName(modelId : integer) : string
  return api.res.modelRep.getName(modelId)
end

local record Tf3MpGuiState
  status : string
  placementCreateCount : integer
  placementApplyCount : integer
  placementSequence : integer
  placementLogQueue : {string}
  placementObserverFailed : boolean
  roadCaptureCreate : table
  roadCaptureApply : table
end

local function readClock() : Engine.Component.GameTime
  return api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_TIME) as Engine.Component.GameTime
end

-- No cross-callback authorization locals or saved vehicle-action queue.
-- Persisted barrier metadata can only pause; it cannot execute vehicle actions.
local function validInteger(value : any) : boolean
  return type(value) == "number" and value >= 0 and value <= 2147483647 and value % 1 == 0
end
local function validCost(value : any) : boolean
  return type(value) == "number" and value == value and value >= 0 and value <= 9007199254740991 and value % 1 == 0
end

-- Passive diagnostic only. Never retain, copy, mutate or replay native proposal
-- userdata. The mission script demonstrates these two GUI event names; their
-- delivery/timing in free play is still unverified. Always let native handling
-- continue, including when diagnostics throw. Separate caps keep preview floods
-- from consuming the apply evidence budget (maximum eight records of each).
local function observeNativePlacement(guiState : GameScriptState<Tf3MpGuiState>, id : string, name : string, param : any) : nil
  if name ~= "builder.proposalCreate" and name ~= "builder.proposalApply" then return nil end
  local current = guiState:get() or {}
  local isApply = name == "builder.proposalApply"
  local count = isApply and (current.placementApplyCount or 0) or (current.placementCreateCount or 0)
  if count >= 8 then return nil end
  count = count + 1
  if isApply then current.placementApplyCount = count else current.placementCreateCount = count end
  current.placementSequence = (current.placementSequence or 0) + 1
  guiState:set(current)
  local builderId = "unreported"
  if type(id) == "string" and #id > 0 and #id <= 64 and id:match("^[A-Za-z0-9_.-]+$") then builderId = id end
  local proposalType, dataType, resultType = "nil", "nil", "nil"
  local shapeInspected = false
  local facts = "{\"schemaVersion\":1,\"code\":\"unavailable\"}"
  if type(param) == "table" then
    -- Use the stock mission's outer positional access, not an unqualified
    -- rawget global. Shape inspection must not discard event-delivery evidence.
    local shapeOk = pcall(function()
      local slots = param as table
      proposalType = type(slots[1])
      dataType = type(slots[2])
      resultType = type(slots[3])
    end)
    shapeInspected = shapeOk
    if not shapeOk then proposalType, dataType, resultType = "nil", "nil", "nil" end
    if shapeOk and id == "streetTerminalBuilder" then
      local factsOk, captured = pcall(function() : string
        local slots = param as table
        return proposalFacts.collect(slots[1], slots[2], slots[3])
      end)
      if factsOk and type(captured) == "string" and #captured <= 1024 then facts = captured as string end
      -- One bounded copied capture per stage. Never retain the event userdata.
      if (isApply and current.roadCaptureApply == nil) or (not isApply and current.roadCaptureCreate == nil) then
        local captureOk, captureValue = pcall(function() : table
          local slots = param as table
          return roadCapture.collect(slots[1], roadCaptureTypes, roadCaptureModelName)
        end)
        local result : table = { code = "unsupported", field = "callback" }
        if captureOk and type(captureValue) == "table" then
          local value = captureValue as table
          if value.code == "captured" and type(value.json) == "string" and #value.json > 0 and #value.json <= 262144
            and type(value.modelResourceName) == "string" and #value.modelResourceName > 0 and #value.modelResourceName <= 1024 then
            result = { code = "captured", json = value.json, modelResourceName = value.modelResourceName, sequence = current.placementSequence }
          elseif value.code == "unsupported" and type(value.field) == "string" and #value.field <= 64 and value.field:match("^[A-Za-z0-9]+$") then
            result = { code = "unsupported", field = value.field }
          end
        end
        if isApply then current.roadCaptureApply = result else current.roadCaptureCreate = result end
      end
    end
  end
  -- Engine API access may be restricted inside GUI event dispatch. Do not read
  -- the clock here; unknown values are more honest than a swallowed exception.
  local tick, update = -1, -1
  local entry = "{\"event\":\"native_placement_observed\",\"observerRevision\":7,\"stage\":\"" .. (isApply and "apply" or "create")
    .. "\",\"builderId\":\"" .. builderId .. "\",\"sequence\":" .. tostring(current.placementSequence)
    .. ",\"sample\":" .. tostring(count) .. ",\"tickCount\":" .. tostring(tick) .. ",\"updateCount\":" .. tostring(update)
    .. ",\"proposalType\":\"" .. proposalType .. "\",\"dataType\":\"" .. dataType .. "\",\"resultType\":\"" .. resultType
    .. "\",\"payloadType\":\"" .. type(param) .. "\",\"shapeInspected\":" .. tostring(shapeInspected)
    .. ",\"proposalFacts\":" .. facts
    .. ",\"passive\":true,\"gameplayVerified\":false}"
  local queue = current.placementLogQueue or {}
  if #queue < 16 then queue[#queue + 1] = entry end
  current.placementLogQueue = queue
  guiState:set(current)
  return nil
end

local function vehicleSnapshot(entity : integer) : table
  local result : table = { company = 0, localPlayer = 0, revision = 0, stopFlag = 0, outcome = "missing" }
  if not api.engine.entityExists(entity) then return result end
  local owner = api.engine.getComponent(entity, api.type.ComponentType.PLAYER_OWNED) as Engine.Component.PlayerOwned
  local vehicle = api.engine.getComponent(entity, api.type.ComponentType.TRANSPORT_VEHICLE) as Engine.Component.TransportVehicle
  if owner == nil or vehicle == nil then return result end
  result.company = owner.player
  result.localPlayer = api.engine.util.getPlayer()
  result.revision = api.engine.getRevision(entity).num[1]
  result.stopFlag = vehicle.userStopped and 1 or 0
  result.outcome = owner.player == result.localPlayer and "inspected" or "not_owner"
  return result
end

local function rejectVehicle(current : Tf3MpState, request : table, outcome : string) : nil
  local clock = readClock()
  current.vehicleReceipt = { schemaVersion = request.schemaVersion, kind = "vehicle_receipt", nonce = request.nonce,
    phase = request.phase, actionId = request.actionId, entity = request.entity, stopFlag = request.stopFlag,
    company = request.company, localPlayer = request.company, revision = request.revision,
    hostSequence = request.hostSequence, scheduledUpdate = request.scheduledUpdate,
    tickCount = clock.tickCount, updateCount = clock.updateCount, outcome = outcome }
  return nil
end

local function vehicleHoldValid(current : Tf3MpState, request : table) : boolean
  if request.schemaVersion == 1 then return true end
  local held = current.pauseReceipt or {}
  local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
  return held.outcome == "checked" and held.nonce == request.nonce and held.companyEntity == api.engine.util.getPlayer()
    and held.heldUpdate == request.scheduledUpdate and request.scheduledUpdate > 0
    and readClock().updateCount == request.scheduledUpdate and speed.speedup == 0
end

local function vehicleEvent(state : GameScriptState<Tf3MpState>, current : Tf3MpState, request : table) : nil
  if (request.schemaVersion ~= 1 and request.schemaVersion ~= 2) or request.kind ~= "vehicle_command" or type(request.nonce) ~= "string" then return nil end
  local nonce = request.nonce as string
  if #nonce ~= 32 or not string.match(nonce, "^[0-9a-f]+$") then return nil end
  for _, key in ipairs({ "actionId", "entity", "stopFlag", "company", "revision", "hostSequence", "scheduledUpdate", "expiresTick" }) do
    if not validInteger(request[key]) then return nil end
  end
  if request.actionId < 1 or (request.stopFlag ~= 0 and request.stopFlag ~= 1) then return nil end
  local clock = readClock()
  local old = current.vehicleReceipt or {}
  if not vehicleHoldValid(current, request) then rejectVehicle(current, request, "hold_lost"); return nil end
  if request.phase == "inspect" then
    if old.nonce == nonce and old.actionId >= request.actionId then return nil end
    local snapshot = vehicleSnapshot(request.entity as integer)
    current.vehicleReceipt = { schemaVersion = request.schemaVersion, kind = "vehicle_receipt", nonce = nonce,
      phase = "inspect", actionId = request.actionId, entity = request.entity, stopFlag = request.stopFlag,
      company = snapshot.company, localPlayer = snapshot.localPlayer, revision = snapshot.revision,
      hostSequence = 0, scheduledUpdate = 0, tickCount = clock.tickCount, updateCount = clock.updateCount, outcome = snapshot.outcome }
    return nil
  end
  if request.phase ~= "commit" then return nil end
  -- A receipt is a snapshot/duplicate barrier, never a queued command.
  if old.nonce == nonce and old.actionId == request.actionId and old.phase == "commit" then return nil end
  if old.schemaVersion ~= request.schemaVersion or old.nonce ~= nonce or old.actionId ~= request.actionId or old.phase ~= "inspect" or old.outcome ~= "inspected" then rejectVehicle(current, request, "no_inspection"); return nil end
  if old.entity ~= request.entity or old.stopFlag ~= request.stopFlag or old.company ~= request.company or old.revision ~= request.revision then rejectVehicle(current, request, "changed"); return nil end
  -- Zero means immediate; nonzero targets MUST match this fresh event exactly.
  -- There is no saved queue, deferred execution or late catch-up.
  if request.hostSequence < 1 or request.scheduledUpdate > old.updateCount + 600 or request.expiresTick ~= old.tickCount + 1200 then rejectVehicle(current, request, "bad_schedule"); return nil end
  if clock.tickCount < old.tickCount or clock.updateCount < old.updateCount then rejectVehicle(current, request, "clock_reset"); return nil end
  if clock.tickCount > request.expiresTick or clock.updateCount > old.updateCount + 600 then rejectVehicle(current, request, "expired"); return nil end
  if request.scheduledUpdate > 0 then
    if clock.updateCount < request.scheduledUpdate then rejectVehicle(current, request, "early"); return nil end
    if clock.updateCount > request.scheduledUpdate then rejectVehicle(current, request, "late"); return nil end
  end
  local before = vehicleSnapshot(request.entity as integer)
  if before.outcome ~= "inspected" then rejectVehicle(current, request, before.outcome as string); return nil end
  if before.company ~= request.company or before.revision ~= request.revision then rejectVehicle(current, request, "changed"); return nil end

  -- Persist a terminal duplicate barrier BEFORE the only allowed mutation.
  -- If the command or postcondition read fails, never retry uncertain work.
  rejectVehicle(current, request, "command_failed")
  state:set(current)
  local receipt = current.vehicleReceipt
  receipt.company = before.company
  receipt.localPlayer = before.localPlayer
  receipt.revision = before.revision
  local ok = pcall(function()
    api.cmd.sendCommand(api.cmd.makeVehicleSetStoppedByUserCmd(request.entity as integer, request.stopFlag == 1))
    local after = vehicleSnapshot(request.entity as integer)
    receipt.stopFlag = after.stopFlag
    if after.outcome == "inspected" and after.company == request.company and after.stopFlag == request.stopFlag and vehicleHoldValid(current, request) then receipt.outcome = "applied" end
  end)
  if not ok then receipt.outcome = "command_failed" end
  current.vehicleReceipt = receipt
  return nil
end

-- One opt-in creation attempt per save state. Receipts/barriers may be saved;
-- executable work never is. This does not assign a remote user or switch UI.
-- Fresh-event diagnostic only; saved receipts never execute on update/reload.
-- Fresh-event stop diagnostic. This is not a watchdog or an automatic reload
-- action. No resume command exists on this path; saved receipts never execute.
local function watchdogUpdate(state : GameScriptState<Tf3MpState>, current : Tf3MpState) : nil
  local lease = current.watchdogLease or {}
  if lease.phase ~= "active" then return nil end
  local clock = readClock()
  local reason = ""
  if clock.tickCount < lease.lastTick then reason = "clock_reset"
  elseif api.engine.util.getPlayer() ~= lease.companyEntity then reason = "context_changed"
  elseif clock.tickCount >= lease.expiresTick then reason = "expired" end
  lease.lastTick = clock.tickCount
  if reason == "" then return nil end
  -- Consume and persist before the only stop attempt. An unknown result never
  -- retries and a saved receipt never resumes or replays a gameplay action.
  lease.phase = "stopping"
  lease.outcome = "outcome_unknown"
  lease.reason = reason
  lease.tickCount = clock.tickCount
  lease.updateCount = clock.updateCount
  current.watchdogLease = lease
  state:set(current)
  local succeeded = false
  api.cmd.sendCommand(api.cmd.makeGameSetSpeedCmd(0), function(_watchdogData : GameSetSpeedCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})
    succeeded = success
  end)
  local afterClock = readClock()
  local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
  lease.speedup = speed.speedup
  if succeeded and speed.speedup == 0 and afterClock.updateCount == lease.updateCount then
    lease.phase = "stopped"
    lease.outcome = "halted"
  end
  state:set(current)
  return nil
end

-- Saved state may request only a bounded pause, never a vehicle action. Actual
-- execution still needs a fresh matching GUI event after the held receipt.
local function executionBarrierUpdate(state : GameScriptState<Tf3MpState>, current : Tf3MpState) : nil
  local barrier = current.executionBarrier or {}
  if barrier.phase ~= "armed" then return nil end
  local clock = readClock()
  local lease = current.watchdogLease or {}
  local binding = current.coordinationBinding or {}
  if lease.phase ~= "active" or lease.nonce ~= barrier.nonce or clock.tickCount >= lease.expiresTick
    or binding.phase ~= "prepared" or binding.roundId ~= barrier.roundId
    or binding.nonce ~= barrier.nonce or api.engine.util.getPlayer() ~= lease.companyEntity then
    barrier.phase = "failed"; state:set(current); return nil
  end
  if clock.updateCount < barrier.scheduledUpdate then return nil end
  barrier.phase = "unknown"
  barrier.updateCount = clock.updateCount
  state:set(current) -- One pause attempt only; reloads cannot replay it.
  if clock.updateCount == barrier.scheduledUpdate then
    local succeeded = false
    api.cmd.sendCommand(api.cmd.makeGameSetSpeedCmd(0), function(_barrierData : GameSetSpeedCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})
      succeeded = success
    end)
    local afterClock = readClock()
    local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
    if succeeded and afterClock.updateCount == barrier.scheduledUpdate and speed.speedup == 0 then barrier.phase = "held" end
  end
  if barrier.phase ~= "held" then
    current.executionReceipt = { schemaVersion = 1, nonce = barrier.nonce, roundId = barrier.roundId,
      operationId = barrier.operationId, operation = "executeHeld", status = "unknown", updateCount = clock.updateCount, held = false }
  end
  state:set(current)
  return nil
end

local function watchdogEvent(state : GameScriptState<Tf3MpState>, current : Tf3MpState, request : table) : nil
  if request.schemaVersion ~= 1 or request.kind ~= "watchdog_request" or type(request.nonce) ~= "string" then return nil end
  local nonce = request.nonce as string
  if #nonce ~= 32 or not string.match(nonce, "^[0-9a-f]+$") then return nil end
  local count : integer = 0
  for key, _ in pairs(request) do
    if key ~= "schemaVersion" and key ~= "kind" and key ~= "nonce" and key ~= "requestId" and key ~= "companyEntity" and key ~= "issuedTick" and key ~= "expiresTick" and key ~= "phase" then return nil end
    count = count + 1
  end
  if count ~= 8 or (request.phase ~= "arm" and request.phase ~= "renew") then return nil end
  for _, key in ipairs({ "requestId", "companyEntity", "issuedTick", "expiresTick" }) do
    if not validInteger(request[key]) then return nil end
  end
  if request.requestId < 1 or request.expiresTick ~= request.issuedTick + 100 then return nil end
  watchdogUpdate(state, current) -- Expiry wins over even a fresh renewal.
  local clock = readClock()
  if clock.tickCount < request.issuedTick or clock.tickCount >= request.expiresTick then return nil end
  if api.engine.util.getPlayer() ~= request.companyEntity then return nil end
  local lease = current.watchdogLease or {}
  if request.phase == "arm" then
    if lease.phase ~= nil then return nil end -- One diagnostic lease per save.
    local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
    if speed.speedup ~= 1 then return nil end
    current.watchdogLease = { schemaVersion = 1, kind = "watchdog_receipt", phase = "active", nonce = nonce,
      requestId = request.requestId, companyEntity = request.companyEntity, issuedTick = request.issuedTick,
      expiresTick = request.expiresTick, lastTick = clock.tickCount, tickCount = clock.tickCount,
      updateCount = clock.updateCount, speedup = speed.speedup, outcome = "armed", reason = "none" }
  else
    if lease.phase ~= "active" or lease.nonce ~= nonce or lease.companyEntity ~= request.companyEntity then return nil end
    if request.requestId <= lease.requestId or request.issuedTick <= lease.issuedTick then return nil end
    lease.requestId = request.requestId
    lease.issuedTick = request.issuedTick
    lease.expiresTick = request.expiresTick
    lease.outcome = "renewed"
    lease.tickCount = clock.tickCount
    lease.updateCount = clock.updateCount
  end
  state:set(current)
  return nil
end

local function haltEvent(state : GameScriptState<Tf3MpState>, current : Tf3MpState, request : table) : nil
  if request.schemaVersion ~= 1 or request.kind ~= "halt_request" or type(request.nonce) ~= "string" then return nil end
  local nonce = request.nonce as string
  if #nonce ~= 32 or not string.match(nonce, "^[0-9a-f]+$") then return nil end
  local count : integer = 0
  for key, _ in pairs(request) do
    if key ~= "schemaVersion" and key ~= "kind" and key ~= "nonce" and key ~= "requestId" and key ~= "companyEntity" and key ~= "issuedTick" and key ~= "expiresTick" then return nil end
    count = count + 1
  end
  if count ~= 7 then return nil end
  for _, key in ipairs({ "requestId", "companyEntity", "issuedTick", "expiresTick" }) do
    if not validInteger(request[key]) then return nil end
  end
  if request.requestId < 1 or request.expiresTick ~= request.issuedTick + 300 then return nil end
  local old = current.haltReceipt or {}
  if old.nonce == nonce and old.requestId == request.requestId then return nil end
  local clock = readClock()
  local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
  local receipt : table = { schemaVersion = 1, kind = "halt_receipt", nonce = nonce, requestId = request.requestId,
    companyEntity = request.companyEntity, tickCount = clock.tickCount, updateCount = clock.updateCount,
    speedup = speed.speedup, outcome = "outcome_unknown" }
  current.haltReceipt = receipt
  if clock.tickCount < request.issuedTick or clock.tickCount >= request.expiresTick then receipt.outcome = "expired"; return nil end
  if api.engine.util.getPlayer() ~= request.companyEntity then receipt.outcome = "context_changed"; return nil end
  if current.haltTestAttempted == true then receipt.outcome = "already_attempted"; return nil end
  current.haltTestAttempted = true
  local beforeUpdate = clock.updateCount
  state:set(current) -- Persist before the sole stop attempt; never retry unknown.
  local succeeded = false
  api.cmd.sendCommand(api.cmd.makeGameSetSpeedCmd(0), function(_data : GameSetSpeedCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})
    succeeded = success
  end)
  local afterClock = readClock()
  local afterSpeed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
  receipt.tickCount = afterClock.tickCount
  receipt.updateCount = afterClock.updateCount
  receipt.speedup = afterSpeed.speedup
  if succeeded and afterClock.updateCount == beforeUpdate and afterSpeed.speedup == 0 then receipt.outcome = "halted" end
  current.haltReceipt = receipt
  return nil
end

local function pauseEvent(state : GameScriptState<Tf3MpState>, current : Tf3MpState, request : table) : nil
  if request.schemaVersion ~= 1 or request.kind ~= "pause_probe" or type(request.nonce) ~= "string" then return nil end
  local nonce = request.nonce as string
  if #nonce ~= 32 or not string.match(nonce, "^[0-9a-f]+$") then return nil end
  if request.phase ~= "pause" and request.phase ~= "check" and request.phase ~= "resume" then return nil end
  for _, key in ipairs({ "requestId", "companyEntity", "heldUpdate", "issuedTick", "expiresTick", "scheduledUpdate" }) do
    if not validInteger(request[key]) then return nil end
  end
  if request.requestId < 1 or request.expiresTick < request.issuedTick or request.expiresTick - request.issuedTick > 1800 then return nil end
  local old = current.pauseReceipt or {}
  if old.nonce == nonce and old.requestId == request.requestId and old.phase == request.phase then return nil end
  local clock = readClock()
  local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
  local receipt : table = { schemaVersion = 1, kind = "pause_receipt", nonce = nonce, requestId = request.requestId,
    phase = request.phase, companyEntity = request.companyEntity, heldUpdate = request.heldUpdate,
    tickCount = clock.tickCount, updateCount = clock.updateCount, speedup = speed.speedup, outcome = "outcome_unknown" }
  current.pauseReceipt = receipt
  if clock.tickCount < request.issuedTick or clock.tickCount > request.expiresTick then receipt.outcome = "expired"; return nil end
  if api.engine.util.getPlayer() ~= request.companyEntity then receipt.outcome = "context_changed"; return nil end
  if request.phase == "pause" then
    if request.scheduledUpdate > 0 then
      if current.scheduledPauseTestAttempted == true then receipt.outcome = "already_attempted"; return nil end
      if clock.updateCount < request.scheduledUpdate then receipt.outcome = "early"; return nil end
      if clock.updateCount > request.scheduledUpdate then receipt.outcome = "late"; return nil end
      current.scheduledPauseTestAttempted = true
    elseif current.pauseTestAttempted == true then receipt.outcome = "already_attempted"; return nil end
    if speed.speedup ~= 1 then receipt.outcome = "context_changed"; return nil end
    receipt.heldUpdate = clock.updateCount
    if request.scheduledUpdate == 0 then current.pauseTestAttempted = true end
  else
    local expected = request.phase == "check" and "paused" or "checked"
    if old.nonce ~= nonce or old.requestId ~= request.requestId or old.companyEntity ~= request.companyEntity or old.outcome ~= expected then receipt.outcome = "context_changed"; return nil end
    if old.heldUpdate ~= request.heldUpdate or clock.updateCount ~= request.heldUpdate or speed.speedup ~= 0 then receipt.outcome = "hold_lost"; return nil end
    if request.phase == "check" then
      if clock.tickCount <= old.tickCount then receipt.outcome = "context_changed"; return nil end
      receipt.outcome = "checked"
      return nil
    end
  end
  -- Latch before mutation. Late callbacks cannot turn an unknown result into success.
  state:set(current)
  local targetSpeed : integer = request.phase == "pause" and 0 or 1
  local succeeded = false
  api.cmd.sendCommand(api.cmd.makeGameSetSpeedCmd(targetSpeed), function(_data : GameSetSpeedCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})
    succeeded = success
  end)
  local afterClock = readClock()
  local afterSpeed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
  receipt.tickCount = afterClock.tickCount
  receipt.updateCount = afterClock.updateCount
  receipt.speedup = afterSpeed.speedup
  if succeeded and afterClock.updateCount == receipt.heldUpdate and afterSpeed.speedup == targetSpeed then
    receipt.outcome = request.phase == "pause" and "paused" or "resumed"
  end
  current.pauseReceipt = receipt
  return nil
end

-- Read-only fresh-event snapshot; never save executable work or echo a host hash.
local function snapshotEvent(current : Tf3MpState, request : table) : nil
  if request.schemaVersion ~= 1 or request.kind ~= "snapshot_request" or type(request.nonce) ~= "string" then return nil end
  local nonce = request.nonce as string
  if #nonce ~= 32 or not string.match(nonce, "^[0-9a-f]+$") then return nil end
  for _, key in ipairs({ "requestId", "entity", "companyEntity", "heldUpdate", "issuedTick", "expiresTick" }) do
    if not validInteger(request[key]) then return nil end
  end
  if request.requestId < 1 or request.expiresTick ~= request.issuedTick + 300 then return nil end
  local old = current.snapshotReceipt or {}
  if old.nonce == nonce and old.requestId >= request.requestId then return nil end
  local clock = readClock()
  local receipt : table = { schemaVersion = 1, kind = "held_snapshot", nonce = nonce, requestId = request.requestId,
    entity = request.entity, companyEntity = request.companyEntity, heldUpdate = request.heldUpdate,
    tickCount = clock.tickCount, updateCount = clock.updateCount, speedup = 0, balance = 0, balanceNegative = 0,
    ownerCompanyEntity = 0, revision = 0, stopFlag = 0, outcome = "unavailable" }
  current.snapshotReceipt = receipt
  if clock.tickCount < request.issuedTick or clock.tickCount > request.expiresTick then receipt.outcome = "expired"; return nil end
  local held = current.pauseReceipt or {}
  local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
  receipt.speedup = speed.speedup
  if held.outcome ~= "checked" or held.nonce ~= nonce or held.companyEntity ~= request.companyEntity
    or held.heldUpdate ~= request.heldUpdate or clock.updateCount ~= request.heldUpdate or speed.speedup ~= 0 then
    receipt.outcome = "hold_lost"; return nil
  end
  local vehicle = vehicleSnapshot(request.entity as integer)
  if vehicle.outcome ~= "inspected" or vehicle.company ~= request.companyEntity or vehicle.localPlayer ~= request.companyEntity then
    receipt.outcome = "not_owner"; return nil
  end
  local balance = api.engine.util.finance.getPlayersBalance(request.companyEntity as integer)
  if balance == nil or balance ~= balance or math.abs(balance) > 9007199254740991 or balance % 1 ~= 0 then return nil end
  receipt.balanceNegative = balance < 0 and 1 or 0
  receipt.balance = math.abs(balance)
  receipt.ownerCompanyEntity = vehicle.company
  receipt.revision = vehicle.revision
  receipt.stopFlag = vehicle.stopFlag
  -- Recheck the barrier after all reads. The helper hashes this observed data.
  if readClock().updateCount ~= request.heldUpdate then receipt.outcome = "hold_lost"; return nil end
  receipt.outcome = "captured"
  return nil
end

local function companyEvent(state : GameScriptState<Tf3MpState>, current : Tf3MpState, request : table) : nil
  if request.schemaVersion ~= 1 or type(request.nonce) ~= "string" then return nil end
  local nonce = request.nonce as string
  if #nonce ~= 32 or not string.match(nonce, "^[0-9a-f]+$") then return nil end
  for _, key in ipairs({ "requestId", "companyEntity", "issuedTick", "expiresTick" }) do
    if not validInteger(request[key]) then return nil end
  end
  if request.requestId < 1 or request.expiresTick ~= request.issuedTick + 300 then return nil end
  local old = current.companyReceipt or {}
  if old.nonce == nonce and old.requestId == request.requestId then return nil end
  local clock = readClock()
  local receipt : table = { schemaVersion = 1, kind = "company_receipt", nonce = nonce, requestId = request.requestId,
    companyEntity = request.companyEntity, newCompanyEntity = 0, tickCount = clock.tickCount, updateCount = clock.updateCount, outcome = "command_failed" }
  current.companyReceipt = receipt
  if current.companyTestAttempted == true then receipt.outcome = "already_attempted"; return nil end
  if clock.tickCount < request.issuedTick or clock.tickCount > request.expiresTick then receipt.outcome = "expired"; return nil end
  if api.engine.util.getPlayer() ~= request.companyEntity then receipt.outcome = "company_changed"; return nil end
  current.companyTestAttempted = true
  state:set(current) -- Persist a terminal barrier BEFORE the only creation call.
  local ok = pcall(function()
    api.cmd.sendCommand(api.cmd.makeGameAddPlayerCmd("TF3MP Test Company", api.type.Vec3f.new(0.2, 0.6, 0.8)), function(data : GameAddPlayerCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})
      if not success or data.resultEntity == request.companyEntity or not api.engine.entityExists(data.resultEntity) then return end
      local company = api.engine.getComponent(data.resultEntity, api.type.ComponentType.PLAYER) as Engine.Component.Player
      if company == nil or api.engine.util.getPlayer() ~= request.companyEntity then return end
      receipt.newCompanyEntity = data.resultEntity
      receipt.outcome = "created"
    end)
  end)
  if not ok then receipt.outcome = "handler_failed" end
  current.companyReceipt = receipt
  return nil
end

local function recordBalance(receipt : table, name : string, balance : integer) : nil
  receipt[name] = balance < 0 and -balance or balance
  receipt[name .. "Negative"] = balance < 0 and 1 or 0
  return nil
end

local function depotReceipt(clock : Engine.Component.GameTime, request : table, outcome : string, code : string) : table
  local receipt : table = { schemaVersion=1, kind="phase2_depot_receipt", nonce=request.nonce, requestId=request.requestId,
    companyEntity=request.companyEntity, targetCompany=request.targetCompany, tickCount=clock.tickCount,
    updateCount=clock.updateCount, outcome=outcome, code=code, resource=request.resource,
    constructionEntity=0, depotEntity=0, constructionOwner=0, depotOwner=0,
    constructionMembershipPreserved=0, depotMembershipPreserved=0, chargedCost=0 }
  for _, name in ipairs({ "originalBefore", "originalAfter", "targetBefore", "targetAfter" }) do recordBalance(receipt, name, 0) end
  return receipt
end

local function depotBalance(receipt : table, name : string, value : any) : nil
  if type(value) == "number" and value == value and value % 1 == 0 and math.abs(value) <= 9007199254740991 then
    recordBalance(receipt, name, value as integer)
  end
  return nil
end

-- A native `success=false` cannot prove a harmless rejection, so it remains
-- unknown. Only local admission failures produce the distinct rejected receipt.
local function phase2DepotEvent(state : GameScriptState<Tf3MpState>, current : Tf3MpState, request : table) : nil
  if request.schemaVersion ~= 1 or request.kind ~= "phase2_depot" or request.confirmed ~= 1 then return nil end
  if type(request.nonce) ~= "string" or #request.nonce ~= 32 or not string.match(request.nonce as string, "^[0-9a-f]+$") then return nil end
  local allowed : table = { schemaVersion=true, kind=true, nonce=true, requestId=true, companyEntity=true, targetCompany=true,
    resource=true, x=true, y=true, z=true, yaw=true, seed=true, confirmed=true, issuedTick=true, expiresTick=true }
  local count : integer = 0
  for key, _ in pairs(request) do if allowed[key] ~= true then return nil end; count = count + 1 end
  if count ~= 15 then return nil end
  for _, key in ipairs({ "requestId", "companyEntity", "targetCompany", "seed", "issuedTick", "expiresTick" }) do
    if not validInteger(request[key]) then return nil end
  end
  if request.requestId < 1 or request.companyEntity < 1 or request.targetCompany < 1
    or request.companyEntity == request.targetCompany or request.seed < 1 or request.expiresTick ~= request.issuedTick + 300 then return nil end
  if type(request.resource) ~= "string" or type(request.x) ~= "number" or type(request.y) ~= "number"
    or type(request.z) ~= "number" or type(request.yaw) ~= "number" then return nil end
  local old = current.phase2DepotReceipt or {}
  if old.nonce == request.nonce and old.requestId == request.requestId then return nil end
  local clock = readClock()
  local receipt = depotReceipt(clock, request, "rejected", "REQUEST_REJECTED")
  current.phase2DepotReceipt = receipt
  -- A valid, correlated request always receives a terminal local-admission
  -- receipt. Persist it before any branch that might return a rejection.
  state:set(current)
  if clock.tickCount < request.issuedTick or clock.tickCount > request.expiresTick then return nil end
  local created = current.companyReceipt or {}
  if created.outcome ~= "created" or created.companyEntity ~= request.companyEntity or created.newCompanyEntity ~= request.targetCompany then return nil end
  if api.engine.util.getPlayer() ~= request.companyEntity then return nil end
  local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
  if speed == nil or speed.speedup ~= 0 then return nil end
  if current.phase2CompanyFault == true or current.nativeDepotAttempted == true then return nil end
  local intent : table = { resource=request.resource, x=request.x, y=request.y, z=request.z, yaw=request.yaw, seed=request.seed }
  local consentId = request.nonce .. "-" .. tostring(request.requestId)
  local binding : table = { originalCompany=request.companyEntity, targetCompany=request.targetCompany, resource=request.resource,
    sessionId=request.nonce, actionId=request.requestId, consentId=consentId }
  local consent : table = { kind="native_charge", confirmed=true, sessionId=request.nonce, actionId=request.requestId,
    consentId=consentId, originalCompany=request.companyEntity, targetCompany=request.targetCompany,
    resource=request.resource, x=request.x, y=request.y, z=request.z, yaw=request.yaw, seed=request.seed }
  local ok, native = pcall(function() : table return depotCommand.execute(state, intent, binding, consent) end)
  if not ok or type(native) ~= "table" then
    -- execute may already have persisted its one-attempt latch before failing.
    -- Amend that freshest state rather than losing the consumed-latch evidence.
    local saved = state:get() or current
    saved.phase2DepotReceipt = receipt
    saved.phase2DepotReceipt.outcome = "unknown"; saved.phase2DepotReceipt.code = "DEPOT_HANDLER_FAILED"
    saved.phase2CompanyFault = true
    state:set(saved)
    return nil
  end
  local saved = state:get()
  if saved == nil then return nil end
  receipt.outcome = native.outcome == "verified" and "verified" or "unknown"
  receipt.code = native.code == "NATIVE_BUILD_ACCOUNTING_VERIFIED" and native.code
    or native.code == "NATIVE_REJECTION_REASON_UNVERIFIED" and native.code
    or native.code == "ENGINE_CALLBACK_MISSING" and native.code
    or native.code == "ENGINE_SEND_FAILED" and native.code or "ENGINE_OUTCOME_UNKNOWN"
  for _, name in ipairs({ "originalBefore", "originalAfter", "targetBefore", "targetAfter" }) do depotBalance(receipt, name, native[name]) end
  for _, name in ipairs({ "constructionEntity", "depotEntity", "constructionOwner", "depotOwner", "chargedCost" }) do
    if validInteger(native[name]) then receipt[name] = native[name] end
  end
  receipt.constructionMembershipPreserved = native.constructionMembershipPreserved == true and 1 or 0
  receipt.depotMembershipPreserved = native.depotMembershipPreserved == true and 1 or 0
  saved.phase2DepotReceipt = receipt
  state:set(saved)
  return nil
end

local function stationReceipt(clock : Engine.Component.GameTime, request : table, outcome : string, code : string) : table
  local receipt : table = { schemaVersion=1, kind="phase2_station_receipt", nonce=request.nonce, requestId=request.requestId,
    companyEntity=request.companyEntity, targetCompany=request.targetCompany, slot=request.slot, resource=request.resource,
    tickCount=clock.tickCount, updateCount=clock.updateCount, outcome=outcome, code=code, constructionEntity=0, stationEntity=0,
    constructionOwner=0, stationOwner=0, constructionMembershipPreserved=0, stationMembershipPreserved=0, chargedCost=0 }
  for _, name in ipairs({ "originalBefore", "originalAfter", "targetBefore", "targetAfter" }) do recordBalance(receipt, name, 0) end
  return receipt
end

-- The station wire receipt is distinct from the native adapter receipt: only
-- a fixed scalar allowlist crosses the protected GUI boundary.
local function phase2StationEvent(state : GameScriptState<Tf3MpState>, current : Tf3MpState, request : table) : nil
  if request.schemaVersion ~= 1 or request.kind ~= "phase2_station" or request.confirmed ~= 1 then return nil end
  if type(request.nonce) ~= "string" or #request.nonce ~= 32 or not string.match(request.nonce as string, "^[0-9a-f]+$") then return nil end
  local allowed : table = { schemaVersion=true, kind=true, nonce=true, requestId=true, companyEntity=true, targetCompany=true,
    slot=true, resource=true, x=true, y=true, z=true, yaw=true, seed=true, confirmed=true, issuedTick=true, expiresTick=true }
  local count : integer = 0; for key, _ in pairs(request) do if allowed[key] ~= true then return nil end; count = count + 1 end
  if count ~= 16 then return nil end
  for _, key in ipairs({ "requestId", "companyEntity", "targetCompany", "slot", "seed", "issuedTick", "expiresTick" }) do if not validInteger(request[key]) then return nil end end
  if request.requestId < 1 or request.companyEntity < 1 or request.targetCompany < 1 or request.companyEntity == request.targetCompany
    or (request.slot ~= 1 and request.slot ~= 2) or request.seed < 1 or request.expiresTick ~= request.issuedTick + 300
    or type(request.resource) ~= "string" or #request.resource < 1 or #request.resource > 256
    or type(request.x) ~= "number" or type(request.y) ~= "number" or type(request.z) ~= "number" or type(request.yaw) ~= "number"
    or request.x ~= request.x or request.y ~= request.y or request.z ~= request.z or request.yaw ~= request.yaw
    or math.abs(request.x) > 100000 or math.abs(request.y) > 100000 or math.abs(request.z) > 10000 or math.abs(request.yaw) > math.pi then return nil end
  local old = current.phase2StationReceipt or {}; if old.nonce == request.nonce and old.requestId == request.requestId then return nil end
  local clock = readClock(); local receipt = stationReceipt(clock, request, "rejected", "REQUEST_REJECTED"); current.phase2StationReceipt = receipt; state:set(current)
  if clock.tickCount < request.issuedTick or clock.tickCount > request.expiresTick then return nil end
  local created = current.companyReceipt or {}; local vehicle = current.phase2VehicleReceipt or {}; local nativeVehicle = current.nativeVehicleReceipt or {}
  if created.outcome ~= "created" or created.companyEntity ~= request.companyEntity or created.newCompanyEntity ~= request.targetCompany then return nil end
  if vehicle.outcome ~= "verified" or vehicle.nonce ~= request.nonce or vehicle.companyEntity ~= request.companyEntity or vehicle.targetCompany ~= request.targetCompany then return nil end
  if nativeVehicle.outcome ~= "verified" or nativeVehicle.originalCompany ~= request.companyEntity or nativeVehicle.targetCompany ~= request.targetCompany then return nil end
  if api.engine.util.getPlayer() ~= request.companyEntity then return nil end
  local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
  if speed == nil or speed.speedup ~= 0 or current.phase2CompanyFault == true then return nil end
  local intent : table = { resource=request.resource, x=request.x, y=request.y, z=request.z, yaw=request.yaw, seed=request.seed }
  local consentId = request.nonce .. "-station-" .. tostring(request.requestId)
  local binding : table = { originalCompany=request.companyEntity, targetCompany=request.targetCompany, resource=request.resource, slot=request.slot,
    sessionId=request.nonce, actionId=request.requestId, consentId=consentId }
  local consent : table = { kind="native_station_charge", confirmed=true, sessionId=request.nonce, actionId=request.requestId, consentId=consentId,
    originalCompany=request.companyEntity, targetCompany=request.targetCompany, slot=request.slot, resource=request.resource,
    x=request.x, y=request.y, z=request.z, yaw=request.yaw, seed=request.seed }
  local ok, native = pcall(function() : table return stationCommand.execute(state, intent, binding, consent) end)
  if not ok or type(native) ~= "table" then
    local saved = state:get() or current; saved.phase2CompanyFault = true; saved.phase2StationReceipt = receipt
    saved.phase2StationReceipt.outcome = "unknown"; saved.phase2StationReceipt.code = "STATION_HANDLER_FAILED"; state:set(saved); return nil
  end
  local saved = state:get(); if saved == nil then return nil end
  receipt.outcome = native.outcome == "verified" and "verified" or "unknown"
  receipt.code = native.code == "NATIVE_STATION_ACCOUNTING_VERIFIED" and native.code or "ENGINE_OUTCOME_UNKNOWN"
  for _, name in ipairs({ "originalBefore", "originalAfter", "targetBefore", "targetAfter" }) do depotBalance(receipt, name, native[name]) end
  for _, name in ipairs({ "constructionEntity", "stationEntity", "constructionOwner", "stationOwner", "chargedCost" }) do if validInteger(native[name]) then receipt[name] = native[name] end end
  receipt.constructionMembershipPreserved = native.constructionMembershipPreserved == true and 1 or 0
  receipt.stationMembershipPreserved = native.stationMembershipPreserved == true and 1 or 0
  if receipt.outcome ~= "verified" then saved.phase2CompanyFault = true end
  saved.phase2StationReceipt = receipt; state:set(saved)
  return nil
end

local function serviceReceipt(clock : Engine.Component.GameTime, request : table, outcome : string, code : string) : table
  return { schemaVersion=1, kind="phase2_service_receipt", nonce=request.nonce, requestId=request.requestId, companyEntity=request.companyEntity,
    targetCompany=request.targetCompany, depotEntity=request.depotEntity, vehicleEntity=request.vehicleEntity, stationA=request.stationA,
    stationB=request.stationB, tickCount=clock.tickCount, updateCount=clock.updateCount, outcome=outcome, code=code,
    lineEntity=0, lineOwner=0, vehicleOwner=0, stationAOwner=0, stationBOwner=0 }
end
local function phase2ServiceEvent(state : GameScriptState<Tf3MpState>, current : Tf3MpState, request : table) : nil
  if request.schemaVersion ~= 1 or request.kind ~= "phase2_service" or request.confirmed ~= 1 or type(request.nonce) ~= "string" or #request.nonce ~= 32 or not string.match(request.nonce as string, "^[0-9a-f]+$") then return nil end
  local allowed : table = {schemaVersion=true,kind=true,nonce=true,requestId=true,companyEntity=true,targetCompany=true,depotEntity=true,vehicleEntity=true,stationA=true,stationB=true,confirmed=true,issuedTick=true,expiresTick=true}
  local count : integer = 0; for key, _ in pairs(request) do if allowed[key] ~= true then return nil end; count = count + 1 end; if count ~= 13 then return nil end
  for _, key in ipairs({"requestId","companyEntity","targetCompany","depotEntity","vehicleEntity","stationA","stationB","issuedTick","expiresTick"}) do if not validInteger(request[key]) then return nil end end
  if request.requestId < 1 or request.companyEntity < 1 or request.targetCompany < 1 or request.companyEntity == request.targetCompany or request.depotEntity < 1 or request.vehicleEntity < 1 or request.stationA < 1 or request.stationB < 1 or request.stationA == request.stationB or request.expiresTick ~= request.issuedTick + 300 then return nil end
  local old=current.phase2ServiceReceipt or {}; if old.nonce==request.nonce and old.requestId==request.requestId then return nil end
  local clock=readClock(); local receipt=serviceReceipt(clock,request,"rejected","REQUEST_REJECTED"); current.phase2ServiceReceipt=receipt; state:set(current)
  if clock.tickCount < request.issuedTick or clock.tickCount > request.expiresTick then return nil end
  local created=current.companyReceipt or {}; local depot=current.nativeDepotReceipt or {}; local vehicle=current.nativeVehicleReceipt or {}; local vehicleWire=current.phase2VehicleReceipt or {}; local station1=current.nativeStationSlot1Receipt or {}; local station2=current.nativeStationSlot2Receipt or {}
  if created.outcome ~= "created" or created.companyEntity ~= request.companyEntity or created.newCompanyEntity ~= request.targetCompany then return nil end
  if depot.outcome ~= "verified" or depot.sessionId ~= request.nonce or depot.originalCompany ~= request.companyEntity or depot.targetCompany ~= request.targetCompany or depot.depotEntity ~= request.depotEntity then return nil end
  if vehicle.outcome ~= "verified" or vehicle.originalCompany ~= request.companyEntity or vehicle.targetCompany ~= request.targetCompany or vehicle.vehicleEntity ~= request.vehicleEntity then return nil end
  if vehicleWire.outcome ~= "verified" or vehicleWire.nonce ~= request.nonce then return nil end
  if station1.outcome ~= "verified" or station2.outcome ~= "verified" or station1.sessionId ~= request.nonce or station2.sessionId ~= request.nonce or station1.stationEntity ~= request.stationA or station2.stationEntity ~= request.stationB then return nil end
  if station1.originalCompany ~= request.companyEntity or station2.originalCompany ~= request.companyEntity or station1.targetCompany ~= request.targetCompany or station2.targetCompany ~= request.targetCompany then return nil end
  if api.engine.util.getPlayer() ~= request.companyEntity then return nil end
  local speed=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
  if speed == nil or speed.speedup ~= 0 or current.phase2CompanyFault == true or current.nativeServiceLineAttempted == true then return nil end
  local consent : table = {kind="native_service_create_and_assign",confirmed=true,originalCompany=request.companyEntity,targetCompany=request.targetCompany,depotEntity=request.depotEntity,vehicleEntity=request.vehicleEntity,stationA=request.stationA,stationB=request.stationB,lineName="TalCo disposable service"}
  local binding : table = {originalCompany=request.companyEntity,targetCompany=request.targetCompany,depotEntity=request.depotEntity,vehicleEntity=request.vehicleEntity,lineName="TalCo disposable service"}
  local ok,native=pcall(function() : table return serviceCommand.execute(state,{stationA=request.stationA,stationB=request.stationB},binding,consent) end)
  if not ok or type(native) ~= "table" then local saved=state:get() or current; saved.phase2CompanyFault=true; saved.phase2ServiceReceipt=receipt; saved.phase2ServiceReceipt.outcome="unknown"; saved.phase2ServiceReceipt.code="SERVICE_HANDLER_FAILED"; state:set(saved); return nil end
  local saved=state:get(); if saved == nil then return nil end; receipt.outcome=native.outcome=="verified" and "verified" or "unknown"; receipt.code=native.code=="NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED" and native.code or "ENGINE_OUTCOME_UNKNOWN"
  for _,key in ipairs({"lineEntity","lineOwner","vehicleOwner","stationAOwner","stationBOwner"}) do if validInteger(native[key]) then receipt[key]=native[key] end end
  if receipt.outcome ~= "verified" then saved.phase2CompanyFault=true end; saved.phase2ServiceReceipt=receipt; state:set(saved); return nil
end

local function vehiclePurchaseReceipt(clock : Engine.Component.GameTime, request : table, outcome : string, code : string) : table
  local receipt : table = { schemaVersion=1, kind="phase2_vehicle_receipt", nonce=request.nonce, requestId=request.requestId,
    companyEntity=request.companyEntity, targetCompany=request.targetCompany, depotEntity=request.depotEntity, model=request.model,
    tickCount=clock.tickCount, updateCount=clock.updateCount, outcome=outcome, code=code,
    vehicleEntity=0, vehicleOwner=0, depotOwner=0, chargedCost=0 }
  for _, name in ipairs({ "originalBefore", "originalAfter", "targetBefore", "targetAfter" }) do recordBalance(receipt, name, 0) end
  return receipt
end

-- This accepts only a fresh, explicit request tied to the exact verified depot
-- receipt.  It never turns a stale/foreign depot into a purchase authority.
local function phase2VehicleEvent(state : GameScriptState<Tf3MpState>, current : Tf3MpState, request : table) : nil
  if request.schemaVersion ~= 1 or request.kind ~= "phase2_vehicle" or request.confirmed ~= 1 then return nil end
  if type(request.nonce) ~= "string" or #request.nonce ~= 32 or not string.match(request.nonce as string, "^[0-9a-f]+$") then return nil end
  local allowed : table = { schemaVersion=true, kind=true, nonce=true, requestId=true, companyEntity=true, targetCompany=true,
    depotEntity=true, model=true, confirmed=true, issuedTick=true, expiresTick=true }
  local count : integer = 0; for key, _ in pairs(request) do if allowed[key] ~= true then return nil end; count = count + 1 end
  if count ~= 11 then return nil end
  for _, key in ipairs({ "requestId", "companyEntity", "targetCompany", "depotEntity", "issuedTick", "expiresTick" }) do if not validInteger(request[key]) then return nil end end
  if request.requestId < 1 or request.companyEntity < 1 or request.targetCompany < 1 or request.depotEntity < 1
    or request.companyEntity == request.targetCompany or request.expiresTick ~= request.issuedTick + 300
    or type(request.model) ~= "string" or #request.model < 1 or #request.model > 256
    or not string.match(request.model as string, "^[A-Za-z0-9_.:/%-]+%.mdl$") then return nil end
  local old = current.phase2VehicleReceipt or {}
  if old.nonce == request.nonce and old.requestId == request.requestId then return nil end
  local clock = readClock(); local receipt = vehiclePurchaseReceipt(clock, request, "rejected", "REQUEST_REJECTED")
  current.phase2VehicleReceipt = receipt; state:set(current)
  if clock.tickCount < request.issuedTick or clock.tickCount > request.expiresTick then return nil end
  local created = current.companyReceipt or {}; local depot = current.nativeDepotReceipt or {}
  if created.outcome ~= "created" or created.companyEntity ~= request.companyEntity or created.newCompanyEntity ~= request.targetCompany then return nil end
  if depot.outcome ~= "verified" or depot.sessionId ~= request.nonce or depot.originalCompany ~= request.companyEntity or depot.targetCompany ~= request.targetCompany or depot.depotEntity ~= request.depotEntity then return nil end
  if api.engine.util.getPlayer() ~= request.companyEntity then return nil end
  local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
  if speed == nil or speed.speedup ~= 0 or current.phase2CompanyFault == true or current.nativeVehicleAttempted == true then return nil end
  local intent : table = { model=request.model }
  local consent : table = { kind="native_vehicle_charge", confirmed=true, originalCompany=request.companyEntity,
    targetCompany=request.targetCompany, depotEntity=request.depotEntity, model=request.model }
  local binding : table = { originalCompany=request.companyEntity, targetCompany=request.targetCompany,
    depotEntity=request.depotEntity, modelResource=request.model }
  local ok, native = pcall(function() : table return vehicleCommand.execute(state, intent, binding, consent) end)
  if not ok or type(native) ~= "table" then
    local saved = state:get() or current; saved.phase2CompanyFault = true; saved.phase2VehicleReceipt = receipt
    saved.phase2VehicleReceipt.outcome = "unknown"; saved.phase2VehicleReceipt.code = "VEHICLE_HANDLER_FAILED"; state:set(saved); return nil
  end
  local saved = state:get(); if saved == nil then return nil end
  receipt.outcome = native.outcome == "verified" and "verified" or "unknown"
  receipt.code = native.code == "NATIVE_VEHICLE_ACCOUNTING_VERIFIED" and native.code or native.code == "ENGINE_SEND_FAILED" and native.code or native.code == "ENGINE_CALLBACK_MISSING" and native.code or "ENGINE_OUTCOME_UNKNOWN"
  for _, name in ipairs({ "originalBefore", "originalAfter", "targetBefore", "targetAfter" }) do depotBalance(receipt, name, native[name]) end
  for _, name in ipairs({ "vehicleEntity", "vehicleOwner", "depotOwner" }) do if validInteger(native[name]) then receipt[name] = native[name] end end
  if validCost(native.chargedCost) then receipt.chargedCost = native.chargedCost end
  saved.phase2VehicleReceipt = receipt; state:set(saved)
  return nil
end

local function bookTestEntry(companyEntity : integer, amount : integer) : boolean
  if amount ~= 1000 and amount ~= -1000 then return false end
  local entry = api.type.JournalEntry.new()
  entry.amount = amount
  entry.time = -1
  entry.category.type = api.type.JournalEntry.Type.SUBSIDY
  local succeeded = false
  api.cmd.sendCommand(api.cmd.makeJournalBookAssetCmd(companyEntity, entry), function(_data : JournalBookAssetCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})
    succeeded = success
  end)
  return succeeded
end

-- The template probe is deliberately read-only.  Its one saved attempt latch
-- is consumed before the evaluator is entered so an engine-side failure cannot
-- cause a second evaluation after reload.
local function stationTemplateEvent(state : GameScriptState<Tf3MpState>, current : Tf3MpState, request : table) : nil
  if request.schemaVersion ~= 1 or request.kind ~= "station_template_probe" or type(request.nonce) ~= "string" then return nil end
  local nonce = request.nonce as string
  if #nonce ~= 32 or not string.match(nonce, "^[0-9a-f]+$") then return nil end
  local allowed : table = { schemaVersion=true, kind=true, nonce=true, requestId=true, issuedTick=true, expiresTick=true }
  local count : integer = 0
  for key, _ in pairs(request) do
    if allowed[key] ~= true then return nil end
    count = count + 1
  end
  if count ~= 6 then return nil end
  for _, key in ipairs({ "requestId", "issuedTick", "expiresTick" }) do
    if not validInteger(request[key]) then return nil end
  end
  if request.requestId < 1 or request.expiresTick ~= request.issuedTick + 300 then return nil end
  local old = current.stationTemplateReceipt or {}
  if old.nonce == nonce and old.requestId == request.requestId then return nil end
  local clock = readClock()
  if clock.tickCount < request.issuedTick or clock.tickCount > request.expiresTick then
    current.stationTemplateReceipt = { schemaVersion=1, kind="station_template_receipt", nonce=nonce, requestId=request.requestId,
      tickCount=clock.tickCount, updateCount=clock.updateCount, code="REQUEST_EXPIRED", paramsPresent=0, modulesPresent=0,
      moduleCount=0, subconstructionCount=0, costKnown=0, cost=0, templateIndex=0, platforms=1 }
    return nil
  end
  local receipt : table = { schemaVersion=1, kind="station_template_receipt", nonce=nonce, requestId=request.requestId,
    tickCount=clock.tickCount, updateCount=clock.updateCount, code="PROBE_FAILED", paramsPresent=0, modulesPresent=0,
    moduleCount=0, subconstructionCount=0, costKnown=0, cost=0, templateIndex=0, platforms=1 }
  current.stationTemplateReceipt = receipt
  if current.stationTemplateAttempted == true then receipt.code = "ALREADY_ATTEMPTED"; return nil end
  current.stationTemplateAttempted = true
  state:set(current) -- Save the duplicate barrier before inspecting native data.
  local ok, observation = pcall(function() : table return stationProbe.inspect() end)
  if not ok or type(observation) ~= "table" then return nil end
  if observation.code == "RESOURCE_LOOKUP_FAILED" or observation.code == "PARAMETER_METADATA_FAILED"
    or observation.code == "GLOBAL_PARAMETERS_FAILED" or observation.code == "TEMPLATE_EVALUATION_FAILED"
    or observation.code == "RESULT_INSPECTION_FAILED" then
    receipt.code = observation.code
    return nil
  end
  if observation.code ~= "TEMPLATE_EVALUATED" then return nil end
  if (observation.paramsPresent ~= 0 and observation.paramsPresent ~= 1) or (observation.modulesPresent ~= 0 and observation.modulesPresent ~= 1)
    or (observation.costKnown ~= 0 and observation.costKnown ~= 1) then return nil end
  if not validInteger(observation.moduleCount) or observation.moduleCount > 256 or not validInteger(observation.subconstructionCount)
    or observation.subconstructionCount > 256 or type(observation.cost) ~= "number" or observation.cost < 0
    or observation.cost % 1 ~= 0 or observation.cost > 9007199254740991 then return nil end
  if observation.costKnown == 0 and observation.cost ~= 0 then return nil end
  if observation.modulesPresent == 0 and observation.moduleCount ~= 0 then return nil end
  if observation.templateIndex ~= 0 or observation.platforms ~= 1 then return nil end
  receipt.code = "TEMPLATE_EVALUATED"
  receipt.paramsPresent = observation.paramsPresent
  receipt.modulesPresent = observation.modulesPresent
  receipt.moduleCount = observation.moduleCount
  receipt.subconstructionCount = observation.subconstructionCount
  receipt.costKnown = observation.costKnown
  receipt.cost = observation.cost
  return nil
end

local function financeEvent(state : GameScriptState<Tf3MpState>, current : Tf3MpState, request : table) : nil
  if request.schemaVersion ~= 1 or type(request.nonce) ~= "string" then return nil end
  local nonce = request.nonce as string
  if #nonce ~= 32 or not string.match(nonce, "^[0-9a-f]+$") then return nil end
  for _, key in ipairs({ "requestId", "companyEntity", "issuedTick", "expiresTick" }) do
    if not validInteger(request[key]) then return nil end
  end
  if request.requestId < 1 or request.expiresTick ~= request.issuedTick + 300 then return nil end
  local old = current.financeReceipt or {}
  if old.nonce == nonce and old.requestId == request.requestId then return nil end
  local clock = readClock()
  local receipt : table = { schemaVersion = 1, kind = "finance_receipt", nonce = nonce, requestId = request.requestId,
    companyEntity = request.companyEntity, newCompanyEntity = 0, tickCount = clock.tickCount, updateCount = clock.updateCount, outcome = "no_test_company", stage = 0 }
  for _, name in ipairs({ "originalBefore", "originalCredit", "originalAfter", "targetBefore", "targetCredit", "targetAfter" }) do
    receipt[name] = 0; receipt[name .. "Negative"] = 0
  end
  current.financeReceipt = receipt
  if current.financeTestAttempted == true then receipt.outcome = "already_attempted"; return nil end
  if clock.tickCount < request.issuedTick or clock.tickCount > request.expiresTick then receipt.outcome = "expired"; return nil end
  local created = current.companyReceipt or {}
  if created.outcome ~= "created" or not validInteger(created.newCompanyEntity) or created.newCompanyEntity == request.companyEntity then return nil end
  local target = created.newCompanyEntity as integer
  if api.engine.util.getPlayer() ~= request.companyEntity or created.companyEntity ~= request.companyEntity then receipt.outcome = "company_changed"; return nil end
  if not api.engine.entityExists(target) or api.engine.getComponent(target, api.type.ComponentType.PLAYER) == nil then return nil end
  receipt.newCompanyEntity = target
  local originalBefore = api.engine.util.finance.getPlayersBalance(request.companyEntity as integer)
  local targetBefore = api.engine.util.finance.getPlayersBalance(target)
  receipt.outcome = "balance_unavailable"
  if originalBefore == nil or targetBefore == nil then return nil end
  if math.abs(originalBefore) > 9007199254739000 or math.abs(targetBefore) > 9007199254739000 then return nil end
  recordBalance(receipt, "originalBefore", originalBefore)
  recordBalance(receipt, "targetBefore", targetBefore)
  -- One attempt per saved state. No queued work and no uncertain retry/refund.
  current.financeTestAttempted = true
  receipt.outcome = "credit_unknown"
  state:set(current)
  if not bookTestEntry(target, 1000) then return nil end
  local originalCredit = api.engine.util.finance.getPlayersBalance(request.companyEntity as integer)
  local targetCredit = api.engine.util.finance.getPlayersBalance(target)
  if originalCredit == nil or targetCredit == nil then return nil end
  recordBalance(receipt, "originalCredit", originalCredit)
  recordBalance(receipt, "targetCredit", targetCredit)
  if originalCredit ~= originalBefore or targetCredit ~= targetBefore + 1000 then return nil end
  receipt.stage = 1
  receipt.outcome = "debit_unknown"
  state:set(current) -- Credit confirmed; persist before the planned debit.
  if not bookTestEntry(target, -1000) then return nil end
  local originalAfter = api.engine.util.finance.getPlayersBalance(request.companyEntity as integer)
  local targetAfter = api.engine.util.finance.getPlayersBalance(target)
  if originalAfter == nil or targetAfter == nil then return nil end
  recordBalance(receipt, "originalAfter", originalAfter)
  recordBalance(receipt, "targetAfter", targetAfter)
  if originalAfter ~= originalBefore or targetAfter ~= targetBefore then return nil end
  receipt.stage = 2
  receipt.outcome = "passed"
  return nil
end

-- Explicit, bounded Phase 2 funding. Separate from the old +/-1000 experiment.
-- One attempt per saved state, even after helper restart or unknown execution.
local function phase2FundingEvent(state : GameScriptState<Tf3MpState>, current : Tf3MpState, request : table) : nil
  if request.schemaVersion ~= 1 or request.kind ~= "phase2_funding" or request.confirmed ~= 1 then return nil end
  if type(request.nonce) ~= "string" or #request.nonce ~= 32 or not string.match(request.nonce as string, "^[0-9a-f]+$") then return nil end
  local count : integer = 0
  local allowed : table = { schemaVersion=true, kind=true, nonce=true, requestId=true, companyEntity=true, targetCompany=true, amount=true, confirmed=true, issuedTick=true, expiresTick=true }
  for key, _ in pairs(request) do
    if allowed[key] ~= true then return nil end
    count = count + 1
  end
  if count ~= 10 then return nil end
  for _, key in ipairs({ "requestId", "companyEntity", "targetCompany", "amount", "issuedTick", "expiresTick" }) do
    if not validInteger(request[key]) then return nil end
  end
  if request.requestId < 1 or request.amount < 1 or request.amount > 1000000 or request.companyEntity < 1 or request.targetCompany < 1 then return nil end
  if request.companyEntity == request.targetCompany or request.expiresTick ~= request.issuedTick + 300 then return nil end
  local old = current.phase2FundingReceipt or {}
  if old.nonce == request.nonce and old.requestId == request.requestId then return nil end
  local clock = readClock()
  local receipt : table = { schemaVersion=1, kind="phase2_funding_receipt", nonce=request.nonce, requestId=request.requestId,
    companyEntity=request.companyEntity, targetCompany=request.targetCompany, amount=request.amount,
    tickCount=clock.tickCount, updateCount=clock.updateCount, outcome="rejected" }
  for _, name in ipairs({ "originalBefore", "originalAfter", "targetBefore", "targetAfter" }) do recordBalance(receipt, name, 0) end
  current.phase2FundingReceipt = receipt
  if current.phase2CompanyFault == true then receipt.outcome = "outcome_unknown"; return nil end
  if current.phase2FundingAttempted == true then receipt.outcome = "already_attempted"; return nil end
  if clock.tickCount < request.issuedTick or clock.tickCount > request.expiresTick then return nil end
  local created = current.companyReceipt or {}
  if created.outcome ~= "created" or created.companyEntity ~= request.companyEntity or created.newCompanyEntity ~= request.targetCompany then return nil end
  if api.engine.util.getPlayer() ~= request.companyEntity then return nil end
  local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
  if speed == nil or speed.speedup ~= 0 then return nil end
  local original = request.companyEntity as integer
  local target = request.targetCompany as integer
  for _, company in ipairs({ original, target }) do
    if not api.engine.entityExists(company) or api.engine.getComponent(company, api.type.ComponentType.PLAYER) == nil then return nil end
  end
  local originalBefore = api.engine.util.finance.getPlayersBalance(original)
  local targetBefore = api.engine.util.finance.getPlayersBalance(target)
  if originalBefore == nil or targetBefore == nil or math.abs(originalBefore) > 9007199253740991 or math.abs(targetBefore) > 9007199253740991 then return nil end
  recordBalance(receipt, "originalBefore", originalBefore); recordBalance(receipt, "targetBefore", targetBefore)
  local entry = api.type.JournalEntry.new()
  entry.amount = request.amount as integer; entry.time = -1
  entry.category.type = api.type.JournalEntry.Type.SUBSIDY
  current.phase2FundingAttempted = true
  current.phase2CompanyFault = true -- Blocks other Phase 2 mutations until verified.
  receipt.outcome = "outcome_unknown"
  state:set(current) -- Consume before send; an exception never permits a retry.
  local callbackOpen = true
  local callbackSeen = false
  local ok = pcall(function()
    api.cmd.sendCommand(api.cmd.makeJournalBookAssetCmd(target, entry), function(_data : JournalBookAssetCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})
      if not callbackOpen or callbackSeen then return end
      callbackSeen = true
      local originalAfter = api.engine.util.finance.getPlayersBalance(original)
      local targetAfter = api.engine.util.finance.getPlayersBalance(target)
      if originalAfter == nil or targetAfter == nil then return end
      recordBalance(receipt, "originalAfter", originalAfter); recordBalance(receipt, "targetAfter", targetAfter)
      if success and originalAfter == originalBefore and targetAfter == targetBefore + request.amount then receipt.outcome = "funded" end
    end)
  end)
  callbackOpen = false
  if not ok or not callbackSeen then receipt.outcome = "outcome_unknown" end
  current.phase2CompanyFault = receipt.outcome ~= "funded"
  return nil
end

local ret : GameScriptWithGui<Tf3MpState, Tf3MpGuiState> = {
  update = function(_userParams : table, state : GameScriptState<Tf3MpState>, _dt : number) : any
    local clock = readClock()
    local current = state:get()
    if current == nil or current.schemaVersion == nil then
      current = { schemaVersion = 1, tickCount = 0, updateCount = 0, lastDiagnosticUpdate = -1,
        probeNonce = "", probeRequestId = 0, probeTickCount = 0, probeUpdateCount = 0,
        eventSubscriptionsVersion = 0, probeScheduledUpdate = 0, probeOutcome = "applied",
        probePending = false, probePreviousUpdate = 0, vehicleReceipt = {}, vehicleInbox = {}, companyTestAttempted = false, companyReceipt = {}, financeTestAttempted = false, financeReceipt = {}, phase2FundingAttempted = false, phase2FundingReceipt = {}, phase2CompanyFault = false, nativeDepotAttempted = false, nativeDepotReceipt = {}, phase2DepotReceipt = {}, nativeVehicleAttempted = false, nativeVehicleReceipt = {}, phase2VehicleReceipt = {}, nativeStationSlot1Attempted = false, nativeStationSlot2Attempted = false, nativeStationSlot1Receipt = {}, nativeStationSlot2Receipt = {}, nativeStationReceipt = {}, phase2StationReceipt = {}, phase2ServiceReceipt = {}, nativeServiceLineAttempted = false, nativeServiceAssignmentAttempted = false, nativeServiceReceipt = {}, pauseTestAttempted = false, scheduledPauseTestAttempted = false, pauseReceipt = {}, snapshotReceipt = {}, haltTestAttempted = false, haltReceipt = {}, stationTemplateAttempted = false, stationTemplateReceipt = {} }
    end
    -- GUI events use the script's event subscriptions too. Existing saves may
    -- already have the engine-only subscription, so hasEventSubscriptions alone
    -- is not sufficient when adding the receipt/status events.
    if not state:hasEventSubscriptions() or current.eventSubscriptionsVersion ~= 17 then
      state:subscribeToEvent("tf3mp_placement_observer_selftest")
      state:subscribeToEvent("builder.proposalCreate")
      state:subscribeToEvent("builder.proposalApply")
      state:subscribeToEvent("tf3mp_phase2_depot")
      state:subscribeToEvent("tf3mp_get_phase2_depot")
      state:subscribeToEvent("tf3mp_phase2_vehicle")
      state:subscribeToEvent("tf3mp_get_phase2_vehicle")
      state:subscribeToEvent("tf3mp_phase2_station")
      state:subscribeToEvent("tf3mp_get_phase2_station")
      state:subscribeToEvent("tf3mp_phase2_service")
      state:subscribeToEvent("tf3mp_get_phase2_service")
      state:subscribeToEvent("tf3mp_phase2_funding")
      state:subscribeToEvent("tf3mp_get_phase2_funding")
      state:subscribeToEvent("tf3mp_arm_execution_hold")
      state:subscribeToEvent("tf3mp_get_execution_barrier")
      state:subscribeToEvent("tf3mp_coordination")
      state:subscribeToEvent("tf3mp_bind_session")
      state:subscribeToEvent("tf3mp_get_binding_receipt")
      state:subscribeToEvent("tf3mp_prepare_command")
      state:subscribeToEvent("tf3mp_execute_command")
      state:subscribeToEvent("tf3mp_get_execution_receipt")
      state:subscribeToEvent("tf3mp_get_preparation_receipt")
      state:subscribeToEvent("tf3mp_hold_checkpoint")
      state:subscribeToEvent("tf3mp_get_checkpoint_receipt")
      state:subscribeToEvent("tf3mp_release_checkpoint")
      state:subscribeToEvent("tf3mp_get_release_receipt")
      state:subscribeToEvent("tf3mp_get_coordination_receipt")
      state:subscribeToEvent("tf3mp_watchdog")
      state:subscribeToEvent("tf3mp_get_watchdog_receipt")
      state:subscribeToEvent("tf3mp_halt")
      state:subscribeToEvent("tf3mp_get_halt_receipt")
      state:subscribeToEvent("tf3mp_capture_snapshot")
      state:subscribeToEvent("tf3mp_get_snapshot")
      state:subscribeToEvent("tf3mp_engine_probe")
      state:subscribeToEvent("tf3mp_get_engine_receipt")
      state:subscribeToEvent("tf3mp_get_status")
      state:subscribeToEvent("tf3mp_vehicle_command")
      state:subscribeToEvent("tf3mp_get_vehicle_receipt")
      state:subscribeToEvent("tf3mp_company_probe")
      state:subscribeToEvent("tf3mp_get_company_receipt")
      state:subscribeToEvent("tf3mp_finance_probe")
      state:subscribeToEvent("tf3mp_get_finance_receipt")
      state:subscribeToEvent("tf3mp_pause_probe")
      state:subscribeToEvent("tf3mp_get_pause_receipt")
      state:subscribeToEvent("tf3mp_station_template_probe")
      state:subscribeToEvent("tf3mp_get_station_template")
      current.eventSubscriptionsVersion = 17
    end
    current.tickCount = clock.tickCount
    current.updateCount = clock.updateCount
    -- Discard the obsolete 0.6.5 inbox on every update. Never execute saved work.
    current.vehicleInbox = {}
    -- This is deliberately a no-op scheduling proof, not a gameplay executor.
    -- Late requests are recorded as failures and never treated as catch-up work.
    if current.probePending then
      local outcome = "pending"
      if clock.updateCount < current.probePreviousUpdate then
        outcome = "clock_reset"
      elseif clock.updateCount > current.probeScheduledUpdate then
        outcome = "late"
      elseif clock.updateCount == current.probeScheduledUpdate then
        outcome = "applied"
      end
      current.probePreviousUpdate = clock.updateCount
      if outcome ~= "pending" then
        current.probePending = false
        current.probeOutcome = outcome
        current.probeTickCount = clock.tickCount
        current.probeUpdateCount = clock.updateCount
      end
    end
    if current.lastDiagnosticUpdate < 0 or clock.updateCount - current.lastDiagnosticUpdate >= 600 then
      current.lastDiagnosticUpdate = clock.updateCount
      -- TF3 declares log.message(string), not log.info. Diagnostics must never
      -- prevent state persistence or break the engine-event acknowledgment.
      pcall(function()
        log.message("{\"event\":\"tf3mp_diagnostic\",\"schemaVersion\":1,\"tickCount\":" .. tostring(clock.tickCount) .. ",\"updateCount\":" .. tostring(clock.updateCount) .. ",\"bridge\":\"disabled\"}")
      end)
    end
    state:set(current)
    -- Native scripts return nil to skip postUpdate. This transient marker only
    -- requests evaluation; it carries no saved command or execution authority.
    local lease = current.watchdogLease or {}
    if lease.phase == "active" then return { watchdog = true } end
    return nil
  end,

  -- Fixed event allowlist. No arbitrary command names or executable payloads.
  -- Native game scripts dispatch world mutations from postUpdate, not update.
  -- Read the live lease here; never serialize a command or retry a spent lease.
  postUpdate = function(_userParams : table, state : GameScriptState<Tf3MpState>, _dt : number, updateResult : any)
    if type(updateResult) ~= "table" or (updateResult as table).watchdog ~= true then return end
    local current = state:get()
    if current == nil then return end
    local ok = pcall(function() watchdogUpdate(state, current) end)
    if not ok then
      local lease = current.watchdogLease or {}
      if lease.phase == "stopping" then lease.outcome = "handler_failed" end
    end
    local barrierOk = pcall(function() executionBarrierUpdate(state, current) end)
    if not barrierOk then
      local barrier = current.executionBarrier or {}
      if barrier.phase == "armed" or barrier.phase == "unknown" then barrier.phase = "failed" end
    end
    state:set(current)
  end,

  handleEvent = function(_userParams : table, state : GameScriptState<Tf3MpState>, src : string, id : string, name : string, param : any) : nil
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_bind_session" and type(param) == "table" then
      local request = param as table
      if request.schemaVersion ~= 1 or request.operation ~= "bindSession" or not validInteger(request.playerCount) or request.playerCount < 2 or request.playerCount > 4 then return nil end
      if type(request.nonce) ~= "string" or #request.nonce ~= 32 or not string.match(request.nonce as string, "^[0-9a-f]+$") then return nil end
      for _, key in ipairs({ "roundId", "operationId", "localPlayerId" }) do
        if type(request[key]) ~= "string" or #request[key] < 1 or #request[key] > 128 or not string.match(request[key] as string, "^[A-Za-z0-9_.:-]+$") then return nil end
      end
      local allowed : table = { schemaVersion = true, nonce = true, roundId = true, operationId = true, operation = true, localPlayerId = true, playerCount = true }
      local players : table = {}
      local companies : table = {}
      local roster : {integer} = {}
      for i = 1, request.playerCount as integer do
        local playerKey = "player" .. tostring(i)
        local companyKey = "company" .. tostring(i)
        allowed[playerKey] = true; allowed[companyKey] = true
        local player = request[playerKey]
        local company = request[companyKey]
        if type(player) ~= "string" or #player < 1 or #player > 128 or not string.match(player as string, "^[A-Za-z0-9_.:-]+$") or not validInteger(company) then return nil end
        if players[player] ~= nil or companies[company] ~= nil then return nil end
        if not api.engine.entityExists(company as integer) or api.engine.getComponent(company as integer, api.type.ComponentType.PLAYER) == nil then return nil end
        players[player] = company; companies[company] = true
        roster[#roster + 1] = company as integer
      end
      local count : integer = 0
      for key, _ in pairs(request) do if allowed[key] ~= true then return nil end; count = count + 1 end
      if count ~= 7 + 2 * request.playerCount then return nil end
      local current = state:get()
      if current == nil then return nil end
      local existing = current.coordinationBinding or {}
      if existing.nonce ~= nil then return nil end -- No reassignment or automatic reuse of saved binding.
      if current.haltTestAttempted == true or (current.coordinationReceipt or {}).operationId ~= nil then return nil end
      local lease = current.watchdogLease or {}
      local clock = readClock()
      local company = api.engine.util.getPlayer()
      if players[request.localPlayerId] ~= company or lease.nonce ~= request.nonce or lease.companyEntity ~= company or lease.phase ~= "active"
        or clock.tickCount < lease.lastTick or clock.tickCount >= lease.expiresTick then return nil end
      local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
      current.coordinationBinding = { nonce = request.nonce, roundId = request.roundId, localPlayerId = request.localPlayerId, players = players, companies = roster, phase = "bound" }
      current.bindingReceipt = { schemaVersion = 1, nonce = request.nonce, roundId = request.roundId, operationId = request.operationId,
        operation = "bindSession", status = "ok", updateCount = clock.updateCount, held = speed.speedup == 0 }
      state:set(current)
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_hold_checkpoint" and type(param) == "table" then
      local request = param as table
      local count : integer = 0
      for key, _ in pairs(request) do
        if key ~= "schemaVersion" and key ~= "nonce" and key ~= "roundId" and key ~= "operationId" and key ~= "operation" and key ~= "updateCount" and key ~= "checkpointHash" then return nil end
        count = count + 1
      end
      if count ~= (request.checkpointHash == nil and 6 or 7) or request.schemaVersion ~= 1 or request.operation ~= "holdCheckpoint" or not validInteger(request.updateCount) then return nil end
      if type(request.nonce) ~= "string" or #request.nonce ~= 32 or not string.match(request.nonce as string, "^[0-9a-f]+$") then return nil end
      for _, key in ipairs({ "roundId", "operationId" }) do
        if type(request[key]) ~= "string" or #request[key] < 1 or #request[key] > 128 or not string.match(request[key] as string, "^[A-Za-z0-9_.:-]+$") then return nil end
      end
      if request.checkpointHash ~= nil and (type(request.checkpointHash) ~= "string" or #request.checkpointHash ~= 64 or not string.match(request.checkpointHash as string, "^[0-9a-f]+$")) then return nil end
      local current = state:get()
      if current == nil then return nil end
      local binding = current.coordinationBinding or {}
      local lease = current.watchdogLease or {}
      local clock = readClock()
      local company = api.engine.util.getPlayer()
      if binding.nonce ~= request.nonce or binding.roundId ~= request.roundId or type(binding.companies) ~= "table" then return nil end
      if lease.nonce ~= request.nonce or lease.companyEntity ~= company or lease.phase ~= "active" or clock.tickCount < lease.lastTick or clock.tickCount >= lease.expiresTick then return nil end
      if current.haltTestAttempted == true or (current.coordinationReceipt or {}).operationId ~= nil or (current.checkpointReceipt or {}).operationId ~= nil then return nil end
      local receipt : table = { schemaVersion = 1, nonce = request.nonce, roundId = request.roundId, operationId = request.operationId,
        operation = "holdCheckpoint", status = "unknown", updateCount = clock.updateCount, held = false }
      current.checkpointReceipt = receipt
      state:set(current)
      if clock.updateCount ~= request.updateCount or not validInteger(clock.tickCount + 300) then return nil end
      local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
      if speed.speedup ~= 0 then
        if current.pauseTestAttempted == true then return nil end
        local ok = pcall(function()
          pauseEvent(state, current, { schemaVersion = 1, kind = "pause_probe", nonce = request.nonce, requestId = 1, companyEntity = company,
            issuedTick = clock.tickCount, expiresTick = clock.tickCount + 300, phase = "pause", scheduledUpdate = 0, heldUpdate = 0 })
        end)
        if not ok or (current.pauseReceipt or {}).outcome ~= "paused" then return nil end
      end
      local roster = binding.companies as {integer}
      if #roster < 2 or #roster > 4 then return nil end
      for i, entity in ipairs(roster) do
        if not api.engine.entityExists(entity) or api.engine.getComponent(entity, api.type.ComponentType.PLAYER) == nil then return nil end
        local balance = api.engine.util.finance.getPlayersBalance(entity)
        if balance == nil or balance ~= balance or math.abs(balance) > 9007199254740991 or balance % 1 ~= 0 then return nil end
        receipt["company" .. tostring(i)] = entity
        receipt["balance" .. tostring(i)] = math.abs(balance)
        receipt["negative" .. tostring(i)] = balance < 0 and 1 or 0
      end
      local afterClock = readClock()
      local afterSpeed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
      if afterClock.updateCount ~= request.updateCount or afterSpeed.speedup ~= 0 then state:set(current); return nil end
      receipt.snapshotVersion = 1; receipt.companyCount = #roster
      receipt.held = true; receipt.status = "ok"
      binding.phase = "checkpoint_held"
      state:set(current)
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_release_checkpoint" and type(param) == "table" then
      local request = param as table
      local targetSpeed : integer = 1
      local expectedCount : integer = 6
      if request.speedup ~= nil then
        if request.speedup ~= 1 and request.speedup ~= 2 and request.speedup ~= 4 then return nil end
        targetSpeed = request.speedup as integer
        expectedCount = 7
      end
      local count : integer = 0
      for key, _ in pairs(request) do
        if key ~= "schemaVersion" and key ~= "nonce" and key ~= "roundId" and key ~= "operationId" and key ~= "operation" and key ~= "updateCount" and key ~= "speedup" then return nil end
        count = count + 1
      end
      if count ~= expectedCount or request.schemaVersion ~= 1 or request.operation ~= "release" or not validInteger(request.updateCount) then return nil end
      if type(request.nonce) ~= "string" or #request.nonce ~= 32 or not string.match(request.nonce as string, "^[0-9a-f]+$") then return nil end
      for _, key in ipairs({ "roundId", "operationId" }) do
        if type(request[key]) ~= "string" or #request[key] < 1 or #request[key] > 128 or not string.match(request[key] as string, "^[A-Za-z0-9_.:-]+$") then return nil end
      end
      local current = state:get()
      if current == nil then return nil end
      local binding = current.coordinationBinding or {}
      local lease = current.watchdogLease or {}
      local held = current.checkpointReceipt or {}
      local actionRelease = binding.phase == "action_held"
      if actionRelease then held = current.executionReceipt or {} end
      local clock = readClock()
      local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
      if binding.nonce ~= request.nonce or binding.roundId ~= request.roundId or (binding.phase ~= "checkpoint_held" and not actionRelease) then return nil end
      if lease.nonce ~= request.nonce or lease.phase ~= "active" or lease.companyEntity ~= api.engine.util.getPlayer()
        or clock.tickCount < lease.lastTick or clock.tickCount >= lease.expiresTick then return nil end
      if current.haltTestAttempted == true or (current.coordinationReceipt or {}).operationId ~= nil then return nil end
      local previousRelease = current.releaseReceipt or {}
      if previousRelease.operationId ~= nil and (previousRelease.status ~= "ok" or request.updateCount <= previousRelease.updateCount or request.operationId == previousRelease.operationId) then return nil end
      if actionRelease and (held.hostSequence ~= (binding.nextSequence or 1) or held.operation ~= "executeHeld") then return nil end
      if held.status ~= "ok" or held.held ~= true or held.nonce ~= request.nonce or held.roundId ~= request.roundId
        or held.updateCount ~= request.updateCount or clock.updateCount ~= request.updateCount or speed.speedup ~= 0 then return nil end
      local receipt : table = { schemaVersion = 1, nonce = request.nonce, roundId = request.roundId, operationId = request.operationId,
        operation = "release", status = "unknown", updateCount = clock.updateCount, held = true }
      current.releaseReceipt = receipt
      binding.phase = "release_unknown"
      state:set(current) -- Consume permission before the sole resume attempt.
      local succeeded = false
      local ok = pcall(function()
        api.cmd.sendCommand(api.cmd.makeGameSetSpeedCmd(targetSpeed), function(_coordinationReleaseData : GameSetSpeedCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})
          succeeded = success
        end)
      end)
      local afterClock = readClock()
      local afterSpeed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
      if request.speedup ~= nil then receipt.speedup = afterSpeed.speedup end
      if ok and succeeded and afterClock.updateCount == request.updateCount and afterSpeed.speedup == targetSpeed then
        receipt.status = "ok"; receipt.held = false; binding.phase = "running"
        if actionRelease then
          binding.nextSequence = held.hostSequence + 1
          current.preparedCommand = {}; current.preparationReceipt = {}; current.executionReceipt = {}
        end
      end
      state:set(current)
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_prepare_command" and type(param) == "table" then
      local request = param as table
      local allowed : table = { schemaVersion = true, nonce = true, roundId = true, operationId = true, operation = true,
        protocolVersion = true, hostSequence = true, scheduledUpdate = true, companyEntity = true, entity = true,
        running = true, clientSequence = true, originPlayerId = true, requestMessageId = true, commandType = true }
      local count : integer = 0
      for key, _ in pairs(request) do if allowed[key] ~= true then return nil end; count = count + 1 end
      if count ~= 15 or request.schemaVersion ~= 1 or request.protocolVersion ~= 2 or request.operation ~= "prepare" or request.commandType ~= "vehicle.setRunning" or type(request.running) ~= "boolean" then return nil end
      if type(request.nonce) ~= "string" or #request.nonce ~= 32 or not string.match(request.nonce as string, "^[0-9a-f]+$") then return nil end
      for _, key in ipairs({ "roundId", "operationId", "originPlayerId", "requestMessageId" }) do
        if type(request[key]) ~= "string" or #request[key] < 1 or #request[key] > 128 or not string.match(request[key] as string, "^[A-Za-z0-9_.:-]+$") then return nil end
      end
      for _, key in ipairs({ "hostSequence", "scheduledUpdate", "companyEntity", "entity", "clientSequence" }) do
        if not validInteger(request[key]) then return nil end
      end
      if request.hostSequence < 1 or request.clientSequence < 1 then return nil end
      local current = state:get()
      if current == nil then return nil end
      local binding = current.coordinationBinding or {}
      local lease = current.watchdogLease or {}
      local clock = readClock()
      local company = api.engine.util.getPlayer()
      if binding.nonce ~= request.nonce or binding.roundId ~= request.roundId or binding.phase ~= "running" or type(binding.players) ~= "table" then return nil end
      if lease.nonce ~= request.nonce or lease.companyEntity ~= company or lease.phase ~= "active" or clock.tickCount < lease.lastTick or clock.tickCount >= lease.expiresTick then return nil end
      if current.haltTestAttempted == true or (current.coordinationReceipt or {}).operationId ~= nil then return nil end
      if (current.preparationReceipt or {}).operationId ~= nil then return nil end -- One outstanding preparation; never overwrite an uncertain decision.
      local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
      local receipt : table = { schemaVersion = 1, nonce = request.nonce, roundId = request.roundId, operationId = request.operationId,
        operation = "prepare", status = "unknown", updateCount = clock.updateCount, held = speed.speedup == 0, ownerCompanyEntity = 0 }
      current.preparationReceipt = receipt
      state:set(current)
      if binding.players[request.originPlayerId] ~= request.companyEntity or request.hostSequence ~= (binding.nextSequence or 1)
        or request.scheduledUpdate <= clock.updateCount or request.scheduledUpdate > clock.updateCount + 600 then return nil end
      if not api.engine.entityExists(request.entity as integer) then return nil end
      local owner = api.engine.getComponent(request.entity as integer, api.type.ComponentType.PLAYER_OWNED) as Engine.Component.PlayerOwned
      local vehicle = api.engine.getComponent(request.entity as integer, api.type.ComponentType.TRANSPORT_VEHICLE) as Engine.Component.TransportVehicle
      if owner == nil or vehicle == nil then return nil end
      receipt.ownerCompanyEntity = owner.player
      if owner.player ~= request.companyEntity then state:set(current); return nil end
      -- Inspection metadata only. No update/postUpdate path executes this data.
      current.preparedCommand = { hostSequence = request.hostSequence, scheduledUpdate = request.scheduledUpdate,
        originPlayerId = request.originPlayerId, companyEntity = request.companyEntity, entity = request.entity,
        running = request.running, clientSequence = request.clientSequence, requestMessageId = request.requestMessageId,
        revision = api.engine.getRevision(request.entity as integer).num[1], inspectedTick = clock.tickCount }
      receipt.status = "ok"
      binding.phase = "prepared"
      state:set(current)
      return nil
    end
    -- Committed coordinator execution: explicit event only, never a saved queue.
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and (name == "tf3mp_execute_command" or name == "tf3mp_arm_execution_hold") and type(param) == "table" then
      local request = param as table
      local allowed : table = { schemaVersion = true, nonce = true, roundId = true, operationId = true, operation = true,
        protocolVersion = true, hostSequence = true, scheduledUpdate = true, companyEntity = true, entity = true,
        running = true, clientSequence = true, originPlayerId = true, requestMessageId = true, commandType = true }
      local count : integer = 0
      for key, _ in pairs(request) do if allowed[key] ~= true then return nil end; count = count + 1 end
      if count ~= 15 or request.schemaVersion ~= 1 or request.protocolVersion ~= 2 or request.operation ~= "executeHeld" or request.commandType ~= "vehicle.setRunning" or type(request.running) ~= "boolean" then return nil end
      if type(request.nonce) ~= "string" or #request.nonce ~= 32 or not string.match(request.nonce as string, "^[0-9a-f]+$") then return nil end
      for _, key in ipairs({ "roundId", "operationId", "originPlayerId", "requestMessageId" }) do
        if type(request[key]) ~= "string" or #request[key] < 1 or #request[key] > 128 or not string.match(request[key] as string, "^[A-Za-z0-9_.:-]+$") then return nil end
      end
      for _, key in ipairs({ "hostSequence", "scheduledUpdate", "companyEntity", "entity", "clientSequence" }) do
        if not validInteger(request[key]) then return nil end
      end
      if request.hostSequence < 1 or request.clientSequence < 1 then return nil end
      local current = state:get()
      if current == nil then return nil end
      local binding = current.coordinationBinding or {}
      local prepared = current.preparedCommand or {}
      local lease = current.watchdogLease or {}
      local clock = readClock()
      if binding.nonce ~= request.nonce or binding.roundId ~= request.roundId or binding.phase ~= "prepared" or type(binding.players) ~= "table" then return nil end
      if lease.nonce ~= request.nonce or lease.companyEntity ~= api.engine.util.getPlayer() or lease.phase ~= "active" or clock.tickCount < lease.lastTick or clock.tickCount >= lease.expiresTick then return nil end
      if current.haltTestAttempted == true or (current.coordinationReceipt or {}).operationId ~= nil or (current.executionReceipt or {}).operationId ~= nil then return nil end
      for _, key in ipairs({ "hostSequence", "scheduledUpdate", "companyEntity", "entity", "running", "clientSequence", "originPlayerId", "requestMessageId" }) do
        if request[key] ~= prepared[key] then return nil end
      end
      if (current.preparationReceipt or {}).status ~= "ok" or binding.players[request.originPlayerId] ~= request.companyEntity or request.hostSequence ~= (binding.nextSequence or 1) then return nil end
      local barrier = current.executionBarrier or {}
      if name == "tf3mp_arm_execution_hold" then
        if barrier.phase ~= nil and (barrier.phase ~= "consumed" or request.hostSequence <= barrier.hostSequence) then return nil end
        if request.scheduledUpdate <= clock.updateCount or request.scheduledUpdate > clock.updateCount + 600 then return nil end
        current.executionBarrier = { phase = "armed", nonce = request.nonce, roundId = request.roundId,
          operationId = request.operationId, hostSequence = request.hostSequence, scheduledUpdate = request.scheduledUpdate }
        state:set(current)
        return nil
      end
      if barrier.phase ~= "held" or barrier.nonce ~= request.nonce or barrier.roundId ~= request.roundId
        or barrier.operationId ~= request.operationId or barrier.hostSequence ~= request.hostSequence
        or barrier.scheduledUpdate ~= request.scheduledUpdate then return nil end
      barrier.phase = "consumed"
      local receipt : table = { schemaVersion = 1, nonce = request.nonce, roundId = request.roundId, operationId = request.operationId,
        operation = "executeHeld", status = "unknown", updateCount = clock.updateCount, held = false }
      current.executionReceipt = receipt
      binding.phase = "execution_unknown"
      state:set(current) -- Consume authorization before any mutation, including the hold.
      if clock.updateCount ~= request.scheduledUpdate then return nil end
      local ok = pcall(function()
        local speed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
        if speed.speedup ~= 0 then return end
        local heldClock = readClock()
        local heldSpeed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
        if heldClock.updateCount ~= request.scheduledUpdate or heldSpeed.speedup ~= 0 then return end
        receipt.held = true
        if not api.engine.entityExists(request.entity as integer) then return end
        local owner = api.engine.getComponent(request.entity as integer, api.type.ComponentType.PLAYER_OWNED) as Engine.Component.PlayerOwned
        local vehicle = api.engine.getComponent(request.entity as integer, api.type.ComponentType.TRANSPORT_VEHICLE) as Engine.Component.TransportVehicle
        if owner == nil or vehicle == nil or owner.player ~= request.companyEntity then return end
        -- Read live ownership immediately before the one authorized action.
        api.cmd.sendCommand(api.cmd.makeVehicleSetStoppedByUserCmd(request.entity as integer, not (request.running as boolean)))
        local afterOwner = api.engine.getComponent(request.entity as integer, api.type.ComponentType.PLAYER_OWNED) as Engine.Component.PlayerOwned
        local afterVehicle = api.engine.getComponent(request.entity as integer, api.type.ComponentType.TRANSPORT_VEHICLE) as Engine.Component.TransportVehicle
        local afterClock = readClock()
        local afterSpeed = api.engine.getComponent(api.engine.util.getWorld(), api.type.ComponentType.GAME_SPEED) as Engine.Component.GameSpeed
        if afterOwner == nil or afterVehicle == nil or afterOwner.player ~= request.companyEntity or afterVehicle.userStopped ~= not (request.running as boolean) then return end
        if afterClock.updateCount ~= request.scheduledUpdate or afterSpeed.speedup ~= 0 then return end
        local balance = api.engine.util.finance.getPlayersBalance(request.companyEntity as integer)
        if balance == nil or balance ~= balance or math.abs(balance) > 9007199254740991 or balance % 1 ~= 0 then return end
        receipt.snapshotVersion = 1; receipt.hostSequence = request.hostSequence; receipt.entity = request.entity
        receipt.ownerCompanyEntity = afterOwner.player; receipt.stopFlag = afterVehicle.userStopped and 1 or 0
        receipt.balance = math.abs(balance); receipt.negative = balance < 0 and 1 or 0
        receipt.updateCount = afterClock.updateCount; receipt.held = true; receipt.status = "ok"
        binding.phase = "action_held"
      end)
      if not ok then receipt.status = "unknown"; binding.phase = "execution_unknown" end
      state:set(current)
      return nil
    end
    -- First real coordinator operation: terminal halt only. Other operations
    -- remain unavailable until their session/ownership/execution gates exist.
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_coordination" and type(param) == "table" then
      local request = param as table
      local count : integer = 0
      for key, _ in pairs(request) do
        if key ~= "schemaVersion" and key ~= "nonce" and key ~= "roundId" and key ~= "operationId" and key ~= "operation" then return nil end
        count = count + 1
      end
      if count ~= 5 or request.schemaVersion ~= 1 or request.operation ~= "halt" then return nil end
      if type(request.nonce) ~= "string" or #request.nonce ~= 32 or not string.match(request.nonce as string, "^[0-9a-f]+$") then return nil end
      for _, key in ipairs({ "roundId", "operationId" }) do
        if type(request[key]) ~= "string" or #request[key] < 1 or #request[key] > 128 or not string.match(request[key] as string, "^[A-Za-z0-9_.:-]+$") then return nil end
      end
      local current = state:get()
      if current == nil then return nil end
      local old = current.coordinationReceipt or {}
      local binding = current.coordinationBinding or {}
      if binding.nonce ~= nil and (binding.nonce ~= request.nonce or binding.roundId ~= request.roundId) then return nil end
      if old.operationId ~= nil then return nil end -- Terminal operation never repeats, even after reload.
      if current.haltTestAttempted == true then return nil end
      local lease = current.watchdogLease or {}
      local clock = readClock()
      local company = api.engine.util.getPlayer()
      if not validInteger(clock.tickCount + 300) then return nil end
      if lease.nonce ~= request.nonce or lease.phase ~= "active" or lease.companyEntity ~= company
        or clock.tickCount < lease.lastTick or clock.tickCount >= lease.expiresTick then return nil end
      local receipt : table = { schemaVersion = 1, nonce = request.nonce, roundId = request.roundId,
        operationId = request.operationId, operation = "halt", status = "unknown", updateCount = clock.updateCount, held = false }
      current.coordinationReceipt = receipt
      state:set(current) -- Persist before calling the existing single-attempt engine stop.
      local ok = pcall(function()
        haltEvent(state, current, { schemaVersion = 1, kind = "halt_request", nonce = request.nonce,
          requestId = 1, companyEntity = company, issuedTick = clock.tickCount, expiresTick = clock.tickCount + 300 })
      end)
      local result = current.haltReceipt or {}
      if ok and result.nonce == request.nonce and result.outcome == "halted" and result.updateCount == clock.updateCount then
        receipt.status = "ok"; receipt.updateCount = result.updateCount; receipt.held = true
      end
      state:set(current)
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_watchdog" and type(param) == "table" then
      local current = state:get()
      if current ~= nil then
        pcall(function() watchdogEvent(state, current, param as table) end)
        state:set(current)
      end
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_halt" and type(param) == "table" then
      local current = state:get()
      if current ~= nil then
        local ok = pcall(function() haltEvent(state, current, param as table) end)
        if not ok and current.haltReceipt ~= nil then current.haltReceipt.outcome = "outcome_unknown" end
        state:set(current)
      end
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_capture_snapshot" and type(param) == "table" then
      local current = state:get()
      if current ~= nil then
        local ok = pcall(function() snapshotEvent(current, param as table) end)
        if not ok and current.snapshotReceipt ~= nil then current.snapshotReceipt.outcome = "read_failed" end
        state:set(current)
      end
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_pause_probe" and type(param) == "table" then
      local current = state:get()
      if current ~= nil and current.schemaVersion ~= nil then
        local ok = pcall(function() pauseEvent(state, current, param as table) end)
        if not ok and current.pauseReceipt ~= nil then current.pauseReceipt.outcome = "outcome_unknown" end
        state:set(current)
      end
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_phase2_funding" and type(param) == "table" then
      local current = state:get()
      if current ~= nil and current.schemaVersion ~= nil then
        local ok = pcall(function() phase2FundingEvent(state, current, param as table) end)
        if not ok then
          current.phase2CompanyFault = true
          if current.phase2FundingReceipt ~= nil then current.phase2FundingReceipt.outcome = "outcome_unknown" end
        end
        state:set(current)
      end
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_phase2_depot" and type(param) == "table" then
      local current = state:get()
      if current ~= nil and current.schemaVersion ~= nil then
        local ok = pcall(function() phase2DepotEvent(state, current, param as table) end)
        if not ok then
          local saved = state:get() or current
          saved.phase2CompanyFault = true
          if saved.phase2DepotReceipt ~= nil then
            saved.phase2DepotReceipt.outcome = "unknown"; saved.phase2DepotReceipt.code = "DEPOT_HANDLER_FAILED"
          end
          state:set(saved)
        else
          -- execute may have persisted the adapter's consumed latch and the
          -- projected receipt; do not overwrite that newer state with `current`.
          local saved = state:get()
          if saved ~= nil then state:set(saved) end
        end
      end
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_phase2_vehicle" and type(param) == "table" then
      local current = state:get()
      if current ~= nil and current.schemaVersion ~= nil then
        local ok = pcall(function() phase2VehicleEvent(state, current, param as table) end)
        if not ok then
          local saved = state:get() or current; saved.phase2CompanyFault = true
          if saved.phase2VehicleReceipt ~= nil then saved.phase2VehicleReceipt.outcome = "unknown"; saved.phase2VehicleReceipt.code = "VEHICLE_HANDLER_FAILED" end
          state:set(saved)
        else
          local saved = state:get(); if saved ~= nil then state:set(saved) end
        end
      end
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_phase2_station" and type(param) == "table" then
      local current = state:get()
      if current ~= nil and current.schemaVersion ~= nil then
        local ok = pcall(function() phase2StationEvent(state, current, param as table) end)
        if not ok then
          local saved = state:get() or current; saved.phase2CompanyFault = true
          if saved.phase2StationReceipt ~= nil then saved.phase2StationReceipt.outcome = "unknown"; saved.phase2StationReceipt.code = "STATION_HANDLER_FAILED" end
          state:set(saved)
        else
          local saved = state:get(); if saved ~= nil then state:set(saved) end
        end
      end
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_phase2_service" and type(param) == "table" then
      local current = state:get()
      if current ~= nil and current.schemaVersion ~= nil then
        local ok = pcall(function() phase2ServiceEvent(state, current, param as table) end)
        if not ok then local saved=state:get() or current; saved.phase2CompanyFault=true; if saved.phase2ServiceReceipt ~= nil then saved.phase2ServiceReceipt.outcome="unknown"; saved.phase2ServiceReceipt.code="SERVICE_HANDLER_FAILED" end; state:set(saved) end
      end
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_station_template_probe" and type(param) == "table" then
      local current = state:get()
      if current ~= nil and current.schemaVersion ~= nil then
        local ok = pcall(function() stationTemplateEvent(state, current, param as table) end)
        if ok then
          -- The adapter has no state capability. Persist its scalar receipt,
          -- including expired and duplicate-attempt outcomes, after return.
          state:set(current)
        else
          -- The pre-inspection barrier may already have been persisted. Keep
          -- that newest state on errors rather than replacing it with `current`.
          local saved = state:get() or current
          if saved.stationTemplateReceipt ~= nil then
            saved.stationTemplateAttempted = true
            saved.stationTemplateReceipt.code = "PROBE_FAILED"
            saved.stationTemplateReceipt.paramsPresent = 0
            saved.stationTemplateReceipt.modulesPresent = 0
            saved.stationTemplateReceipt.moduleCount = 0
            saved.stationTemplateReceipt.subconstructionCount = 0
            saved.stationTemplateReceipt.costKnown = 0
            saved.stationTemplateReceipt.cost = 0
          end
          state:set(saved)
        end
      end
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_finance_probe" and type(param) == "table" then
      local current = state:get()
      if current ~= nil and current.schemaVersion ~= nil then
        local ok = pcall(function() financeEvent(state, current, param as table) end)
        if not ok and current.financeReceipt ~= nil then current.financeReceipt.outcome = "handler_failed" end
        state:set(current)
      end
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_company_probe" and type(param) == "table" then
      local current = state:get()
      if current ~= nil and current.schemaVersion ~= nil then
        local ok = pcall(function() companyEvent(state, current, param as table) end)
        if not ok and current.companyReceipt ~= nil then current.companyReceipt.outcome = "handler_failed" end
        state:set(current)
      end
      return nil
    end
    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_vehicle_command" and type(param) == "table" then
      local current = state:get()
      if current ~= nil and current.schemaVersion ~= nil then
        -- Complete a fresh event in this invocation; no cross-callback locals.
        local request = param as table
        local ok = pcall(function() vehicleEvent(state, current, request) end)
        if not ok then
          pcall(function() rejectVehicle(current, request, "handler_failed") end)
        end
        state:set(current)
      end
      return nil
    end
    if src ~= "tf3mp_status_1::/tf3mp_status.gs" or id ~= "tf3mp_engine_bridge" or name ~= "tf3mp_engine_probe" then return nil end
    if type(param) ~= "table" then return nil end
    local request = param as table
    if request.schemaVersion ~= 1 or type(request.nonce) ~= "string" or type(request.requestId) ~= "number" then return nil end
    local nonce = request.nonce as string
    local requestId = request.requestId as number
    if #nonce ~= 32 or not string.match(nonce, "^[0-9a-f]+$") or requestId < 1 or requestId > 2147483647 or requestId % 1 ~= 0 then return nil end
    local current = state:get()
    if current == nil or current.schemaVersion == nil then return nil end
    if current.probeNonce == nonce and requestId <= (current.probeRequestId or 0) then return nil end
    local clock = readClock()
    local scheduledUpdate : integer = 0
    if request.scheduledUpdate ~= nil then
      if type(request.scheduledUpdate) ~= "number" then return nil end
      local target = request.scheduledUpdate as number
      if target < 1 or target > 2147483647 or target % 1 ~= 0 or target > clock.updateCount + 600 then return nil end
      scheduledUpdate = target as integer
    end
    current.probeNonce = nonce
    current.probeRequestId = requestId as integer
    current.probeTickCount = clock.tickCount
    current.probeUpdateCount = clock.updateCount
    current.probeScheduledUpdate = scheduledUpdate
    current.probePreviousUpdate = clock.updateCount
    current.probePending = scheduledUpdate > clock.updateCount
    current.probeOutcome = "applied"
    if current.probePending then
      current.probeOutcome = "pending"
    elseif scheduledUpdate > 0 and clock.updateCount > scheduledUpdate then
      current.probeOutcome = "late"
    end
    state:set(current)
    return nil
  end,

  guiUpdate = function(_userParams : table, state : GameScriptStateReadOnly<Tf3MpState>, guiState : GameScriptState<Tf3MpGuiState>) : nil
    local current = state:get()
    local guiCurrent = guiState:get() or {}
    guiCurrent.status = "TF3MP SAFE MODE | tick=" .. tostring(current.tickCount or 0) .. " update=" .. tostring(current.updateCount or 0) .. " | network bridge disabled"
    local pendingLogs = guiCurrent.placementLogQueue or {}
    guiCurrent.placementLogQueue = {}
    local failed = guiCurrent.placementObserverFailed
    guiCurrent.placementObserverFailed = false
    guiState:set(guiCurrent)
    pcall(function()
      for _, entry in ipairs(pendingLogs) do log.message(entry) end
      if failed then log.message("{\"event\":\"native_placement_observer_error\",\"observerRevision\":7,\"passive\":true,\"gameplayVerified\":false}") end
    end)
  end,

  guiHandleEvent = function(_userParams : table, state : GameScriptStateReadOnly<Tf3MpState>, guiState : GameScriptState<Tf3MpGuiState>, _src : string, id : string, name : string, _param : any) : any
    if id == "tf3mp_placement_observer" and name == "tf3mp_placement_observer_selftest" then
      -- Explicit synchronous acknowledgement; no nested dispatch or GUI-state
      -- write/readback ambiguity. Not a native construction event.
      return { kind = "placement_observer_ack", observerRevision = 7, passive = true }
    end
    if name == "builder.proposalCreate" or name == "builder.proposalApply" then
      local observed = pcall(function() observeNativePlacement(guiState, id, name, _param) end)
      if not observed then
        pcall(function()
          local current = guiState:get() or {}
          current.placementObserverFailed = true
          guiState:set(current)
        end)
      end
      return nil -- No restriction/error result, even if observation failed.
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_execution_barrier" then
      local current = state:get()
      if current ~= nil then return current.executionBarrier end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_execution_receipt" then
      local current = state:get()
      if current ~= nil then return current.executionReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_release_receipt" then
      local current = state:get()
      if current ~= nil then return current.releaseReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_checkpoint_receipt" then
      local current = state:get()
      if current ~= nil then return current.checkpointReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_preparation_receipt" then
      local current = state:get()
      if current ~= nil then return current.preparationReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_binding_receipt" then
      local current = state:get()
      if current ~= nil then return current.bindingReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_coordination_receipt" then
      local current = state:get()
      if current ~= nil then return current.coordinationReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_watchdog_receipt" then
      local current = state:get()
      if current ~= nil then return current.watchdogLease end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_halt_receipt" then
      local current = state:get()
      if current ~= nil then return current.haltReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_snapshot" then
      local current = state:get()
      if current ~= nil then return current.snapshotReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_pause_receipt" then
      local current = state:get()
      if current ~= nil then return current.pauseReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_station_template" then
      local current = state:get()
      if current ~= nil then return current.stationTemplateReceipt end
      return nil
    end
    if name == "tf3mp_get_status" then return guiState:get() end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_phase2_depot" then
      local current = state:get()
      if current ~= nil then return current.phase2DepotReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_phase2_vehicle" then
      local current = state:get()
      if current ~= nil then return current.phase2VehicleReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_phase2_station" then
      local current = state:get()
      if current ~= nil then return current.phase2StationReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_phase2_service" then
      local current = state:get()
      if current ~= nil then return current.phase2ServiceReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_phase2_funding" then
      local current = state:get()
      if current ~= nil then return current.phase2FundingReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_finance_receipt" then
      local current = state:get()
      if current ~= nil then return current.financeReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_company_receipt" then
      local current = state:get()
      if current ~= nil then return current.companyReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_vehicle_receipt" then
      local current = state:get()
      if current ~= nil and current.vehicleReceipt ~= nil then return current.vehicleReceipt end
      return nil
    end
    if id == "tf3mp_engine_bridge" and name == "tf3mp_get_engine_receipt" then
      local current = state:get()
      if current ~= nil and current.probeNonce ~= nil then
        if current.probePending then return nil end
        if (current.probeScheduledUpdate or 0) > 0 then
          return { schemaVersion = 1, kind = "scheduled_receipt", nonce = current.probeNonce,
            requestId = current.probeRequestId, tickCount = current.probeTickCount, updateCount = current.probeUpdateCount,
            scheduledUpdate = current.probeScheduledUpdate, outcome = current.probeOutcome }
        end
        return { schemaVersion = 1, kind = "engine_receipt", nonce = current.probeNonce,
          requestId = current.probeRequestId, tickCount = current.probeTickCount, updateCount = current.probeUpdateCount }
      end
    end
    return nil
  end,
}

return ret
