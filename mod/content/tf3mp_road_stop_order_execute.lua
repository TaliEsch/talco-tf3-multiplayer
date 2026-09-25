-- One held, Host-ordered road Stop. Unknown outcomes consume the sequence.
local M = {}
local wire = ug_require("tf3mp_status_1::/tf3mp_road_stop_order_wire.lua")
local prepare = ug_require("tf3mp_status_1::/tf3mp_road_stop_simple_prepare.lua")
local results = ug_require("tf3mp_status_1::/tf3mp_road_stop_simple_result.lua")
local pending = nil -- Transient readback only; reload keeps the durable unknown latch.
local function integer(v)
  return type(v) == "number" and v == math.floor(v) and v >= 0 and v <= 2147483647
end
local function entity(v) return integer(v) and v > 0 end
local function identity(v)
  return type(v) == "string" and #v > 0 and #v <= 128
    and v:match("^[A-Za-z0-9_.:-]+$") ~= nil
end
local function native(v) return type(v) == "table" or type(v) == "userdata" end
local function sameCapture(a,b)
  if type(a) ~= "table" or type(b) ~= "table" then return false end
  for _, key in ipairs({"edgeEntity","companyEntity","param","left","oneWay","model","name"}) do
    if a[key] ~= b[key] then return false end
  end
  return true
end
local function valid(request)
  if type(request) ~= "table" or request.schemaVersion ~= 1
    or request.protocolVersion ~= 2 or request.operation ~= "executeHeld"
    or request.commandType ~= "road.stop.place" or type(request.nonce) ~= "string"
    or #request.nonce ~= 32 or not request.nonce:match("^[a-f0-9]+$") then return nil end
  for _, key in ipairs({"roundId","operationId","originPlayerId","requestMessageId"}) do
    if not identity(request[key]) then return nil end
  end
  for _, key in ipairs({"hostSequence","scheduledUpdate","companyEntity","entity","clientSequence"}) do
    if not integer(request[key]) then return nil end
  end
  if request.hostSequence < 1 or not entity(request.companyEntity) or not entity(request.entity) then return nil end
  local count = request.nameChunkCount
  if not integer(count) or count > 16 then return nil end
  local allowed = {schemaVersion=true,nonce=true,roundId=true,operationId=true,
    operation=true,protocolVersion=true,hostSequence=true,scheduledUpdate=true,
    companyEntity=true,entity=true,paramText=true,left=true,oneWay=true,
    nameChunkCount=true,clientSequence=true,originPlayerId=true,
    requestMessageId=true,commandType=true}
  for index=1,count do allowed["nameChunk"..index]=true end
  local seen=0
  for key in pairs(request) do if not allowed[key] then return nil end; seen=seen+1 end
  if seen ~= 18+count then return nil end
  return wire.decode(request)
end
local function context(state,request,api)
  local capture=valid(request)
  if capture == nil then return nil end
  local current=state:get()
  if type(current) ~= "table" then return nil end
  local binding=current.coordinationBinding or {}
  local lease=current.watchdogLease or {}
  local prepared=current.preparedCommand or {}
  local preparation=current.preparationReceipt or {}
  local world=api.engine.util.getWorld()
  local clock=api.engine.getComponent(world,api.type.ComponentType.GAME_TIME)
  if not native(clock) or not integer(clock.tickCount) or not integer(clock.updateCount)
    or binding.nonce ~= request.nonce or binding.roundId ~= request.roundId
    or binding.phase ~= "prepared" or type(binding.players) ~= "table"
    or binding.players[request.originPlayerId] ~= request.companyEntity
    or request.hostSequence ~= (binding.nextSequence or 1)
    or lease.nonce ~= request.nonce or lease.phase ~= "active"
    or lease.companyEntity ~= api.engine.util.getPlayer()
    or clock.tickCount < lease.lastTick or clock.tickCount >= lease.expiresTick
    or current.haltTestAttempted == true or current.phase2CompanyFault == true
    or current.nativeRoadReplayAttempted == true
    or (current.coordinationReceipt or {}).operationId ~= nil
    or (current.executionReceipt or {}).operationId ~= nil
    or preparation.status ~= "ok" or preparation.nonce ~= request.nonce
    or preparation.roundId ~= request.roundId
    or preparation.ownerCompanyEntity ~= request.companyEntity
    or prepared.commandType ~= "road.stop.place" or not sameCapture(prepared.capture,capture) then return nil end
  for _,key in ipairs({"hostSequence","scheduledUpdate","originPlayerId","companyEntity",
    "entity","clientSequence","requestMessageId"}) do
    if prepared[key] ~= request[key] then return nil end
  end
  return current,binding,prepared,clock,capture
end
local function liveRoad(api,request,prepared)
  if api.engine.entityExists(request.companyEntity) ~= true
    or api.engine.entityExists(request.entity) ~= true
    or not native(api.engine.getComponent(request.companyEntity,api.type.ComponentType.PLAYER)) then return false end
  local edge=api.engine.getComponent(request.entity,api.type.ComponentType.BASE_EDGE)
  if not native(edge) or type(edge.objects) ~= "table" or #edge.objects ~= 0
    or not entity(edge.node0) or not entity(edge.node1) or edge.node0 == edge.node1 then return false end
  local owner=api.engine.getComponent(request.entity,api.type.ComponentType.PLAYER_OWNED)
  if owner ~= nil and (not native(owner) or not integer(owner.player)
    or owner.player ~= 0 and owner.player ~= request.companyEntity) then return false end
  local revision=api.engine.getRevision(request.entity)
  return native(revision) and native(revision.num)
    and revision.num[1] == prepared.revision
    and api.res.modelRep.find(prepared.capture.model) == prepared.modelId
end
local function roster(binding)
  local companies,seen={},{}
  for _,company in pairs(binding.players) do
    if not entity(company) or seen[company] then return nil end
    seen[company]=true; companies[#companies+1]=company
  end
  if #companies < 2 or #companies > 4 then return nil end
  return companies
end
local function arm(state,request,api)
  local current,binding,prepared,clock=context(state,request,api)
  if current == nil then return false end
  local barrier=current.executionBarrier or {}
  if barrier.phase ~= nil and (barrier.phase ~= "consumed" or request.hostSequence <= barrier.hostSequence) then return false end
  if request.scheduledUpdate <= clock.updateCount or request.scheduledUpdate > clock.updateCount+600
    or not liveRoad(api,request,prepared) then return false end
  current.executionBarrier={phase="armed",nonce=request.nonce,roundId=request.roundId,
    operationId=request.operationId,hostSequence=request.hostSequence,
    scheduledUpdate=request.scheduledUpdate}
  state:set(current)
  return true
end
local function execute(state,request,api)
  local current,binding,prepared,clock,capture=context(state,request,api)
  if current == nil then return false end
  local barrier=current.executionBarrier or {}
  if barrier.phase ~= "held" or barrier.nonce ~= request.nonce
    or barrier.roundId ~= request.roundId or barrier.operationId ~= request.operationId
    or barrier.hostSequence ~= request.hostSequence
    or barrier.scheduledUpdate ~= request.scheduledUpdate then return false end
  barrier.phase="consumed"
  current.executionReceipt={schemaVersion=1,nonce=request.nonce,roundId=request.roundId,
    operationId=request.operationId,operation="executeHeld",status="unknown",
    updateCount=clock.updateCount,held=false,stage="latched"}
  binding.phase="execution_unknown"
  state:set(current) -- Durable one-use latch before snapshots or native submission.
  if clock.updateCount ~= request.scheduledUpdate then return false end
  current.executionReceipt.stage="live_gate"
  state:set(current)
  local speed=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_SPEED)
  if not native(speed) or speed.speedup ~= 0 or not liveRoad(api,request,prepared) then return false end
  local companies=roster(binding)
  if companies == nil then return false end
  current.executionReceipt.stage="before_snapshot"
  state:set(current)
  local before=results.before(api,capture,companies)
  if type(before) ~= "table" or before.code ~= "observed"
    or before.updateCount ~= request.scheduledUpdate then
    if type(before) == "table" and type(before.stage) == "string" then
      current.executionReceipt.stage="before_"..before.stage
      state:set(current)
    end
    return false
  end
  current.executionReceipt.stage="construct"
  state:set(current)
  local constructed=prepare.prepare(api,capture)
  if type(constructed) ~= "table" or constructed.code ~= "prepared" then
    if type(constructed) == "table" and type(constructed.stage) == "string" then
      current.executionReceipt.stage="construct_"..constructed.stage
      state:set(current)
    end
    return false
  end
  local operation=request.operationId
  current.executionReceipt.stage="send_attempt"
  state:set(current)
  pending=nil
  api.cmd.sendCommand(constructed.command,function(data,success,entities)
    pcall(function()
      local saved=state:get()
      if type(saved) ~= "table" then return end
      local receipt=saved.executionReceipt or {}
      local savedBinding=saved.coordinationBinding or {}
      local savedBarrier=saved.executionBarrier or {}
      if receipt.operationId ~= operation or receipt.status ~= "unknown"
        or savedBinding.phase ~= "execution_unknown" or savedBarrier.phase ~= "consumed"
        or savedBarrier.operationId ~= operation then return end
      local captured=results.capture(data,success,entities)
      if type(captured) ~= "table" then receipt.stage="callback_capture"; state:set(saved); return end
      pending={operationId=operation,before=before,capture=capture,
        callback=captured,request=request,attempts=0}
      receipt.stage="await_world"
      state:set(saved)
    end)
  end)
  return true
end

local function observe(state,api)
  local work=pending
  if work == nil then return false end
  local saved=state:get()
  if type(saved) ~= "table" then pending=nil; return false end
  local receipt=saved.executionReceipt or {}
  local binding=saved.coordinationBinding or {}
  local barrier=saved.executionBarrier or {}
  local lease=saved.watchdogLease or {}
  if receipt.operationId ~= work.operationId or receipt.status ~= "unknown"
    or receipt.stage ~= "await_world" or binding.phase ~= "execution_unknown"
    or barrier.phase ~= "consumed" or barrier.operationId ~= work.operationId
    or lease.phase ~= "active" or saved.haltTestAttempted == true then
    pending=nil; return false
  end
  work.attempts=work.attempts+1
  local observed=results.afterCaptured(api,work.before,work.capture,work.callback)
  if type(observed) ~= "table" or observed.code ~= "verified"
    or not entity(observed.stopEntity) or not entity(observed.edgeEntity)
    or not integer(observed.chargedCost) or observed.chargedCost < 1
    or observed.updateCount ~= work.request.scheduledUpdate then
    local stage=type(observed) == "table" and observed.stage or nil
    -- The callback and first GUI events can all precede TF3's world commit.
    -- Keep checking only the road publication state; the coordinator deadline
    -- still bounds this observation and the native command is never resent.
    if type(stage) == "string" and stage:match("^result_road")
      and work.attempts < 24 then return false end
    receipt.stage=type(stage) == "string" and "after_"..stage or "after_unknown"
    pending=nil; state:set(saved); return false
  end
  receipt.stage="balance"
  state:set(saved)
  local balance=api.engine.util.finance.getPlayersBalance(work.request.companyEntity)
  if type(balance) ~= "number" or balance ~= math.floor(balance)
    or math.abs(balance) > 9007199254740991 then
    pending=nil; return false
  end
  receipt.snapshotVersion=2; receipt.hostSequence=work.request.hostSequence
  receipt.entity=work.request.entity; receipt.ownerCompanyEntity=work.request.companyEntity
  receipt.stopEntity=observed.stopEntity; receipt.roadEntity=observed.edgeEntity
  receipt.chargedCost=observed.chargedCost
  receipt.balance=math.abs(balance); receipt.negative=balance < 0 and 1 or 0
  receipt.updateCount=observed.updateCount; receipt.held=true; receipt.status="ok"; receipt.stage=nil
  binding.phase="action_held"
  pending=nil; state:set(saved)
  return true
end
function M.arm(state,request,api)
  local ok,result=pcall(arm,state,request,api)
  return ok and result == true
end
function M.execute(state,request,api)
  local ok,result=pcall(execute,state,request,api)
  return ok and result == true
end

function M.observe(state,api)
  local ok,result=pcall(observe,state,api)
  return ok and result == true
end
return M
