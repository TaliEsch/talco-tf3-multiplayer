-- Opt-in one-use removal of an empty target-owned line at a held Host update.
local M={}
local pending=nil
local function integer(v)return type(v)=="number" and v==math.floor(v) and v>=0 and v<=2147483647 end
local function entity(v)return integer(v) and v>0 end
local function native(v)return type(v)=="table" or type(v)=="userdata" end
local function identity(v)return type(v)=="string" and #v>0 and #v<=128 and v:match("^[A-Za-z0-9_.:-]+$")~=nil end
local function valid(r,operation)
  if type(r)~="table" or r.schemaVersion~=1 or r.protocolVersion~=2
    or r.operation~=operation or r.commandType~="road.line.remove"
    or type(r.nonce)~="string" or #r.nonce~=32 or not r.nonce:match("^[a-f0-9]+$") then return false end
  for _,key in ipairs({"roundId","operationId","originPlayerId","requestMessageId"}) do
    if not identity(r[key]) then return false end end
  for _,key in ipairs({"hostSequence","scheduledUpdate","companyEntity","entity","clientSequence"}) do
    if not integer(r[key]) then return false end end
  if r.hostSequence<1 or not entity(r.companyEntity) or not entity(r.entity) then return false end
  local allowed={schemaVersion=true,nonce=true,roundId=true,operationId=true,
    operation=true,protocolVersion=true,hostSequence=true,scheduledUpdate=true,
    companyEntity=true,entity=true,clientSequence=true,originPlayerId=true,
    requestMessageId=true,commandType=true}
  local count=0
  for key in pairs(r) do if not allowed[key] then return false end;count=count+1 end
  return count==14
end
local function live(api,r)
  local c=api.type.ComponentType
  if api.engine.entityExists(r.companyEntity)~=true
    or not native(api.engine.getComponent(r.companyEntity,c.PLAYER))
    or api.engine.entityExists(r.entity)~=true then return false end
  local owner=api.engine.getComponent(r.entity,c.PLAYER_OWNED)
  local line=api.engine.getComponent(r.entity,c.LINE)
  if not native(owner) or owner.player~=r.companyEntity or not native(line)
    or not native(line.stops) or #line.stops~=2 then return false end
  for _,stop in ipairs(line.stops) do
    if not native(stop) or not entity(stop.stationGroup)
      or not integer(stop.station) or not integer(stop.terminal) then return false end
    local carriers=api.engine.system.stationGroupSystem.getCarriers(stop.stationGroup,stop.station,stop.terminal)
    if not native(carriers) or not native(carriers[1]) then return false end
    local road=false
    for _,carrier in ipairs(carriers[1]) do
      if carrier==api.type["enum"].Carrier.ROAD then road=true end end
    if not road then return false end
  end
  local found=false
  for _,id in ipairs(api.engine.system.lineSystem.getLines()) do if id==r.entity then found=true end end
  if not found then return false end
  local vehicles=api.engine.system.transportVehicleSystem.getLineVehicles(r.entity)
  if not native(vehicles) or #vehicles~=0 then return false end
  return true
end
local function context(state,r,api,phase)
  local current=state:get()
  if type(current)~="table" then return nil end
  local binding=current.coordinationBinding or {}
  local lease=current.watchdogLease or {}
  local clock=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_TIME)
  local localCompany=api.engine.util.getPlayer()
  if not native(clock) or not integer(clock.tickCount) or not integer(clock.updateCount)
    or binding.nonce~=r.nonce or binding.roundId~=r.roundId or binding.phase~=phase
    or type(binding.players)~="table" or binding.players[r.originPlayerId]~=r.companyEntity
    or r.hostSequence~=(binding.nextSequence or 1)
    or lease.nonce~=r.nonce or lease.phase~="active" or lease.companyEntity~=localCompany
    or clock.tickCount<lease.lastTick or clock.tickCount>=lease.expiresTick
    or current.haltTestAttempted==true or current.phase2CompanyFault==true
    or current.nativeLineRemoveAttempted==true or not entity(localCompany)
    or localCompany==r.companyEntity or api.engine.entityExists(localCompany)~=true
    or not native(api.engine.getComponent(localCompany,api.type.ComponentType.PLAYER)) then return nil end
  return current,binding,clock
end
function M.prepare(state,r,api)
  local ok,result=pcall(function()
    if not valid(r,"prepare") then return false end
    local current,binding,clock=context(state,r,api,"running")
    if not current or (current.coordinationReceipt or {}).operationId~=nil
      or (current.preparationReceipt or {}).operationId~=nil then return false end
    local speed=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_SPEED)
    if not native(speed) or not integer(speed.speedup) then return false end
    local receipt={schemaVersion=1,nonce=r.nonce,roundId=r.roundId,
      operationId=r.operationId,operation="prepare",status="unknown",
      updateCount=clock.updateCount,held=speed.speedup==0,ownerCompanyEntity=0}
    current.preparationReceipt=receipt;state:set(current)
    if r.scheduledUpdate<=clock.updateCount or r.scheduledUpdate>clock.updateCount+600
      or not live(api,r) then return false end
    current.preparedCommand={commandType=r.commandType,operationId=r.operationId,
      hostSequence=r.hostSequence,scheduledUpdate=r.scheduledUpdate,
      originPlayerId=r.originPlayerId,companyEntity=r.companyEntity,
      entity=r.entity,clientSequence=r.clientSequence,requestMessageId=r.requestMessageId}
    receipt.status="ok";receipt.ownerCompanyEntity=r.companyEntity
    binding.phase="prepared";state:set(current);return true
  end)
  return ok and result==true
end
local function prepared(state,r,api)
  local current,binding,clock=context(state,r,api,"prepared")
  if not current then return nil end
  local receipt=current.preparationReceipt or {}
  local p=current.preparedCommand or {}
  if receipt.status~="ok" or receipt.operationId~=r.operationId
    or receipt.ownerCompanyEntity~=r.companyEntity
    or (current.coordinationReceipt or {}).operationId~=nil
    or (current.executionReceipt or {}).operationId~=nil then return nil end
  for _,key in ipairs({"operationId","hostSequence","scheduledUpdate","originPlayerId",
    "companyEntity","entity","clientSequence","requestMessageId","commandType"}) do
    if p[key]~=r[key] then return nil end end
  return current,binding,clock
end
function M.arm(state,r,api)
  local ok,result=pcall(function()
    if not valid(r,"executeHeld") then return false end
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
    if not valid(r,"executeHeld") then return false end
    local current,binding=prepared(state,r,api)
    if not current then return false end
    local barrier=current.executionBarrier or {}
    if barrier.phase~="held" or barrier.nonce~=r.nonce or barrier.roundId~=r.roundId
      or barrier.operationId~=r.operationId or barrier.hostSequence~=r.hostSequence
      or barrier.scheduledUpdate~=r.scheduledUpdate then return false end
    barrier.phase="consumed";binding.phase="execution_unknown"
    current.nativeLineRemoveAttempted=true;current.phase2CompanyFault=true
    current.executionReceipt={schemaVersion=1,nonce=r.nonce,roundId=r.roundId,
      operationId=r.operationId,operation="executeHeld",status="unknown",
      stage="latched",hostSequence=r.hostSequence,held=false}
    state:set(current)
    local clock=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_TIME)
    local speed=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_SPEED)
    if not native(clock) or clock.updateCount~=r.scheduledUpdate
      or not native(speed) or speed.speedup~=0 then return false end
    if not live(api,r) then
      current.executionReceipt.stage="live_owner_or_vehicles_changed";state:set(current);return false end
    local work={request=r,callbackSeen=false,accepted=false,attempts=0}
    pending=work;current.executionReceipt.stage="send_attempt";state:set(current)
    local sent=pcall(function()
      api.cmd.sendCommand(api.cmd.makeLineDestroyCmd(r.entity),function(_,success)
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
      pending=nil
      local saved=state:get()
      if saved and (saved.executionReceipt or {}).operationId==r.operationId then
        saved.executionReceipt.stage="send_failed";state:set(saved) end
      return false end
    local saved=state:get()
    if saved and (saved.executionReceipt or {}).operationId==r.operationId
      and saved.executionReceipt.stage=="send_attempt" then
      saved.executionReceipt.stage="await_callback";state:set(saved) end
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
    local found=false
    for _,id in ipairs(api.engine.system.lineSystem.getLines()) do
      if id==work.request.entity then found=true end end
    if api.engine.entityExists(work.request.entity)==true or found then
      if work.attempts<24 then return false end
      receipt.stage="after_line_present";pending=nil;state:set(saved);return false end
    if api.engine.entityExists(work.request.companyEntity)~=true
      or not native(api.engine.getComponent(work.request.companyEntity,c.PLAYER)) then
      receipt.stage="after_company_missing";pending=nil;state:set(saved);return false end
    receipt.snapshotVersion=6;receipt.status="ok";receipt.stage=nil;receipt.held=true
    receipt.updateCount=clock.updateCount;receipt.entity=work.request.entity
    receipt.lineEntity=work.request.entity;receipt.ownerCompanyEntity=work.request.companyEntity
    binding.phase="action_held";saved.phase2CompanyFault=false
    pending=nil;state:set(saved);return true
  end)
  return ok and result==true
end
return M
