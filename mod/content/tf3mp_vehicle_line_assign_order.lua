-- One-use held assignment. The saved barrier is consumed before native send.
-- Command shape follows tf3mp_service_command.lua; no TF2 code is copied.
local M={}
local wire=ug_require("tf3mp_status_1::/tf3mp_vehicle_line_assign_wire.lua")
local pending=nil
local function integer(v)return type(v)=="number" and v==math.floor(v) and v>=0 and v<=2147483647 end
local function entity(v)return integer(v) and v>0 end
local function native(v)return type(v)=="table" or type(v)=="userdata" end
local function identity(v)return type(v)=="string" and #v>0 and #v<=128 and v:match("^[A-Za-z0-9_.:-]+$")~=nil end
local function valid(r,operation)
  if type(r)~="table" or r.schemaVersion~=1 or r.protocolVersion~=2
    or r.operation~=operation or r.commandType~="road.vehicle.assignLine"
    or type(r.nonce)~="string" or #r.nonce~=32 or not r.nonce:match("^[a-f0-9]+$") then return nil end
  for _,key in ipairs({"roundId","operationId","originPlayerId","requestMessageId"}) do
    if not identity(r[key]) then return nil end end
  for _,key in ipairs({"hostSequence","scheduledUpdate","companyEntity","entity","lineEntity","clientSequence"}) do
    if not integer(r[key]) then return nil end end
  if r.hostSequence<1 then return nil end
  local allowed={schemaVersion=true,nonce=true,roundId=true,operationId=true,
    operation=true,protocolVersion=true,hostSequence=true,scheduledUpdate=true,
    companyEntity=true,entity=true,lineEntity=true,clientSequence=true,
    originPlayerId=true,requestMessageId=true,commandType=true}
  local count=0
  for key in pairs(r) do if not allowed[key] then return nil end;count=count+1 end
  if count~=15 then return nil end
  return wire.decode(r)
end
local function live(api,intent,requireUnassigned)
  local c=api.type.ComponentType
  if api.engine.entityExists(intent.companyEntity)~=true
    or not native(api.engine.getComponent(intent.companyEntity,c.PLAYER))
    or api.engine.entityExists(intent.vehicleEntity)~=true
    or api.engine.entityExists(intent.lineEntity)~=true then return nil end
  local vo=api.engine.getComponent(intent.vehicleEntity,c.PLAYER_OWNED)
  local lo=api.engine.getComponent(intent.lineEntity,c.PLAYER_OWNED)
  local vehicle=api.engine.getComponent(intent.vehicleEntity,c.TRANSPORT_VEHICLE)
  local line=api.engine.getComponent(intent.lineEntity,c.LINE)
  if not native(vo) or vo.player~=intent.companyEntity
    or not native(lo) or lo.player~=intent.companyEntity
    or not native(vehicle) or vehicle.carrier~=api.type["enum"].Carrier.ROAD
    or not native(line) or not native(line.stops) or #line.stops<2
    or requireUnassigned and entity(vehicle.line) then return nil end
  local found=false
  for _,id in ipairs(api.engine.system.lineSystem.getLines()) do
    if id==intent.lineEntity then found=true end end
  if not found then return nil end
  for _,stop in ipairs(line.stops) do
    if not native(stop) or not entity(stop.stationGroup)
      or not integer(stop.station) or not integer(stop.terminal) then return nil end
    local carriers=api.engine.system.stationGroupSystem.getCarriers(stop.stationGroup,stop.station,stop.terminal)
    if not native(carriers) or not native(carriers[1]) then return nil end
    local road=false
    for _,carrier in ipairs(carriers[1]) do
      if carrier==api.type["enum"].Carrier.ROAD then road=true end end
    if not road then return nil end
  end
  return vehicle,line
end
local function context(state,r,api,operation)
  local intent=valid(r,operation)
  if not intent then return nil end
  local current=state:get()
  if type(current)~="table" then return nil end
  local binding=current.coordinationBinding or {}
  local lease=current.watchdogLease or {}
  local localCompany=api.engine.util.getPlayer()
  local clock=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_TIME)
  if not native(clock) or not integer(clock.tickCount) or not integer(clock.updateCount)
    or binding.nonce~=r.nonce or binding.roundId~=r.roundId
    or type(binding.players)~="table" or binding.players[r.originPlayerId]~=r.companyEntity
    or r.hostSequence~=(binding.nextSequence or 1)
    or lease.nonce~=r.nonce or lease.phase~="active"
    or lease.companyEntity~=localCompany or clock.tickCount<lease.lastTick
    or clock.tickCount>=lease.expiresTick or current.haltTestAttempted==true
    or current.phase2CompanyFault==true or current.nativeVehicleLineAssignAttempted==true
    or not entity(localCompany) or localCompany==r.companyEntity
    or api.engine.entityExists(localCompany)~=true
    or not native(api.engine.getComponent(localCompany,api.type.ComponentType.PLAYER)) then return nil end
  return current,binding,clock,intent
end
function M.prepare(state,r,api)
  local ok,result=pcall(function()
    local current,binding,clock,intent=context(state,r,api,"prepare")
    if not current or binding.phase~="running"
      or (current.coordinationReceipt or {}).operationId~=nil
      or (current.preparationReceipt or {}).operationId~=nil then return false end
    local speed=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_SPEED)
    if not native(speed) or not integer(speed.speedup) then return false end
    local receipt={schemaVersion=1,nonce=r.nonce,roundId=r.roundId,operationId=r.operationId,
      operation="prepare",status="unknown",updateCount=clock.updateCount,
      held=speed.speedup==0,ownerCompanyEntity=0}
    current.preparationReceipt=receipt;state:set(current)
    if r.scheduledUpdate<=clock.updateCount or r.scheduledUpdate>clock.updateCount+600
      or not live(api,intent,true) then return false end
    current.preparedCommand={commandType=r.commandType,operationId=r.operationId,
      hostSequence=r.hostSequence,scheduledUpdate=r.scheduledUpdate,
      originPlayerId=r.originPlayerId,companyEntity=r.companyEntity,
      entity=r.entity,lineEntity=r.lineEntity,clientSequence=r.clientSequence,
      requestMessageId=r.requestMessageId}
    receipt.status="ok";receipt.ownerCompanyEntity=r.companyEntity
    binding.phase="prepared";state:set(current);return true
  end)
  return ok and result==true
end
local function prepared(state,r,api)
  local current,binding,clock,intent=context(state,r,api,"executeHeld")
  if not current or binding.phase~="prepared" then return nil end
  local lease=current.watchdogLease or {}
  local receipt=current.preparationReceipt or {}
  local p=current.preparedCommand or {}
  if receipt.status~="ok" or receipt.operationId~=r.operationId
    or receipt.ownerCompanyEntity~=r.companyEntity
    or (current.coordinationReceipt or {}).operationId~=nil
    or (current.executionReceipt or {}).operationId~=nil then return nil end
  for _,key in ipairs({"operationId","hostSequence","scheduledUpdate","originPlayerId",
    "companyEntity","entity","lineEntity","clientSequence","requestMessageId","commandType"}) do
    if p[key]~=r[key] then return nil end end
  return current,binding,clock,intent
end
function M.arm(state,r,api)
  local ok,result=pcall(function()
    local current,_,clock=prepared(state,r,api)
    if not current then return false end
    local barrier=current.executionBarrier or {}
    if barrier.phase~=nil and (barrier.phase~="consumed"
      or r.hostSequence<=barrier.hostSequence) then return false end
    if r.scheduledUpdate<=clock.updateCount or r.scheduledUpdate>clock.updateCount+600 then return false end
    current.executionBarrier={phase="armed",nonce=r.nonce,roundId=r.roundId,
      operationId=r.operationId,hostSequence=r.hostSequence,scheduledUpdate=r.scheduledUpdate}
    state:set(current);return true
  end)
  return ok and result==true
end
function M.execute(state,r,api)
  local ok,result=pcall(function()
    local current,binding,_,intent=prepared(state,r,api)
    if not current then return false end
    local barrier=current.executionBarrier or {}
    if barrier.phase~="held" or barrier.nonce~=r.nonce
      or barrier.roundId~=r.roundId or barrier.operationId~=r.operationId
      or barrier.hostSequence~=r.hostSequence
      or barrier.scheduledUpdate~=r.scheduledUpdate then return false end
    -- Both latches precede clock, ownership, component and native checks.
    barrier.phase="consumed";binding.phase="execution_unknown"
    current.nativeVehicleLineAssignAttempted=true;current.phase2CompanyFault=true
    current.executionReceipt={schemaVersion=1,nonce=r.nonce,roundId=r.roundId,
      operationId=r.operationId,operation="executeHeld",status="unknown",
      stage="latched",hostSequence=r.hostSequence,held=false}
    state:set(current)
    local clock=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_TIME)
    local speed=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_SPEED)
    if not native(clock) or clock.updateCount~=r.scheduledUpdate
      or not native(speed) or speed.speedup~=0 then return false end
    -- This is the final ownership and ROAD type check immediately before send.
    if not live(api,intent,true) then
      current.executionReceipt.stage="live_owner_or_type_changed";state:set(current);return false end
    local work={request=r,intent=intent,callbackSeen=false,accepted=false,attempts=0}
    pending=work;current.executionReceipt.stage="send_attempt";state:set(current)
    local sent=pcall(function()
      api.cmd.sendCommand(api.cmd.makeVehicleSetLineCmd(r.entity,r.lineEntity,0),function(_,success)
        pcall(function()
          local saved=state:get()
          local receipt=saved and saved.executionReceipt or {}
          local b=saved and saved.coordinationBinding or {}
          local barrierNow=saved and saved.executionBarrier or {}
          if pending~=work or work.callbackSeen or receipt.operationId~=r.operationId
            or receipt.status~="unknown" or b.phase~="execution_unknown"
            or barrierNow.phase~="consumed" or barrierNow.operationId~=r.operationId then return end
          work.callbackSeen=true
          if success~=true then
            receipt.stage="native_rejected_unknown";pending=nil;state:set(saved);return end
          work.accepted=true;receipt.stage="await_world";state:set(saved)
        end)
      end)
    end)
    if not sent then
      pending=nil;current.executionReceipt.stage="send_failed";state:set(current);return false end
    if current.executionReceipt.stage=="send_attempt" then
      current.executionReceipt.stage="await_callback";state:set(current) end
    return true
  end)
  return ok and result==true
end
function M.observe(state,api)
  local ok,result=pcall(function()
    local work=pending
    if not work or not work.accepted then return false end
    local saved=state:get()
    local receipt=saved and saved.executionReceipt or {}
    local binding=saved and saved.coordinationBinding or {}
    local barrier=saved and saved.executionBarrier or {}
    if not saved or receipt.operationId~=work.request.operationId
      or receipt.status~="unknown" or receipt.stage~="await_world"
      or binding.phase~="execution_unknown" or barrier.phase~="consumed"
      or barrier.operationId~=work.request.operationId then pending=nil;return false end
    work.attempts=work.attempts+1
    local c=api.type.ComponentType
    local clock=api.engine.getComponent(api.engine.util.getWorld(),c.GAME_TIME)
    local speed=api.engine.getComponent(api.engine.util.getWorld(),c.GAME_SPEED)
    if not native(clock) or clock.updateCount~=work.request.scheduledUpdate
      or not native(speed) or speed.speedup~=0 then
      receipt.stage="after_clock";pending=nil;state:set(saved);return false end
    local vehicle,line=live(api,work.intent,false)
    if not vehicle or not line then
      receipt.stage="after_owner_or_type";pending=nil;state:set(saved);return false end
    if vehicle.line~=work.intent.lineEntity then
      if work.attempts<24 then return false end
      receipt.stage="after_assignment_missing";pending=nil;state:set(saved);return false end
    receipt.snapshotVersion=5;receipt.status="ok";receipt.stage=nil;receipt.held=true
    receipt.updateCount=clock.updateCount;receipt.entity=work.intent.vehicleEntity
    receipt.vehicleEntity=work.intent.vehicleEntity;receipt.lineEntity=work.intent.lineEntity
    receipt.ownerCompanyEntity=work.intent.companyEntity
    receipt.lineOwnerCompanyEntity=work.intent.companyEntity
    binding.phase="action_held";saved.phase2CompanyFault=false
    pending=nil;state:set(saved);return true
  end)
  return ok and result==true
end
return M
