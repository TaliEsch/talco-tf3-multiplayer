-- Held Host-ordered line command. Every failed or uncertain send remains spent.
local M={}
local wire=ug_require("tf3mp_status_1::/tf3mp_line_create_order_wire.lua")
local action=ug_require("tf3mp_status_1::/tf3mp_line_create_order_action.lua")
local function integer(v)
  return type(v)=="number" and v==math.floor(v) and v>=0 and v<=2147483647
end
local function entity(v)return integer(v) and v>0 end
local function identity(v)
  return type(v)=="string" and #v>0 and #v<=128
    and v:match("^[A-Za-z0-9_.:-]+$")~=nil
end
local function native(v)return type(v)=="table" or type(v)=="userdata" end
local function valid(request)
  if type(request)~="table" or request.schemaVersion~=1
    or request.protocolVersion~=2 or request.operation~="executeHeld"
    or request.commandType~="road.line.create"
    or type(request.nonce)~="string" or #request.nonce~=32
    or not request.nonce:match("^[a-f0-9]+$") then return nil end
  for _,key in ipairs({"roundId","operationId","originPlayerId","requestMessageId"}) do
    if not identity(request[key]) then return nil end
  end
  for _,key in ipairs({"hostSequence","scheduledUpdate","companyEntity",
    "entity","stationB","clientSequence"}) do
    if not integer(request[key]) then return nil end
  end
  if request.hostSequence<1 or not entity(request.companyEntity)
    or not entity(request.entity) or not entity(request.stationB) then return nil end
  local allowed={schemaVersion=true,nonce=true,roundId=true,operationId=true,
    operation=true,protocolVersion=true,hostSequence=true,scheduledUpdate=true,
    companyEntity=true,entity=true,stationB=true,clientSequence=true,
    originPlayerId=true,requestMessageId=true,commandType=true}
  local count=0
  for key in pairs(request) do if not allowed[key] then return nil end;count=count+1 end
  if count~=15 then return nil end
  return wire.decode(request)
end
local function context(state,request,api)
  local intent=valid(request)
  if not intent then return nil end
  local current=state:get()
  if type(current)~="table" then return nil end
  local binding=current.coordinationBinding or {}
  local lease=current.watchdogLease or {}
  local prepared=current.preparedCommand or {}
  local preparation=current.preparationReceipt or {}
  local clock=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_TIME)
  local localCompany=api.engine.util.getPlayer()
  if not native(clock) or not integer(clock.tickCount) or not integer(clock.updateCount)
    or binding.nonce~=request.nonce or binding.roundId~=request.roundId
    or binding.phase~="prepared" or type(binding.players)~="table"
    or binding.players[request.originPlayerId]~=request.companyEntity
    or request.hostSequence~=(binding.nextSequence or 1)
    or lease.nonce~=request.nonce or lease.phase~="active"
    or lease.companyEntity~=localCompany or clock.tickCount<lease.lastTick
    or clock.tickCount>=lease.expiresTick or current.haltTestAttempted==true
    or current.phase2CompanyFault==true or current.nativeLineOrderAttempted==true
    or (current.coordinationReceipt or {}).operationId~=nil
    or (current.executionReceipt or {}).operationId~=nil
    or preparation.status~="ok" or preparation.operation~="prepare"
    or preparation.operationId~=prepared.operationId
    or preparation.nonce~=request.nonce
    or preparation.roundId~=request.roundId
    or preparation.ownerCompanyEntity~=request.companyEntity
    or prepared.commandType~="road.line.create"
    or not entity(localCompany) then return nil end
  for _,key in ipairs({"hostSequence","scheduledUpdate","originPlayerId",
    "companyEntity","entity","clientSequence","requestMessageId"}) do
    if prepared[key]~=request[key] then return nil end
  end
  if prepared.stationA~=intent.stationA or prepared.stationB~=intent.stationB
    or prepared.lineName~=intent.lineName then return nil end
  if api.engine.entityExists(localCompany)~=true
    or api.engine.entityExists(request.companyEntity)~=true
    or not native(api.engine.getComponent(localCompany,api.type.ComponentType.PLAYER))
    or not native(api.engine.getComponent(request.companyEntity,api.type.ComponentType.PLAYER)) then return nil end
  return current,binding,prepared,clock,intent
end
local function arm(state,request,api)
  local current,_,_,clock=context(state,request,api)
  if not current then return false end
  local barrier=current.executionBarrier or {}
  if barrier.phase~=nil and (barrier.phase~="consumed"
    or request.hostSequence<=barrier.hostSequence) then return false end
  if request.scheduledUpdate<=clock.updateCount
    or request.scheduledUpdate>clock.updateCount+600 then return false end
  current.executionBarrier={phase="armed",nonce=request.nonce,
    roundId=request.roundId,operationId=request.operationId,
    hostSequence=request.hostSequence,scheduledUpdate=request.scheduledUpdate}
  state:set(current)
  return true
end
local function execute(state,request,api)
  local current,_,_,_,intent=context(state,request,api)
  if not current then return false end
  local barrier=current.executionBarrier or {}
  if barrier.phase~="held" or barrier.nonce~=request.nonce
    or barrier.roundId~=request.roundId or barrier.operationId~=request.operationId
    or barrier.hostSequence~=request.hostSequence
    or barrier.scheduledUpdate~=request.scheduledUpdate then return false end
  local actionRequest={nonce=request.nonce,roundId=request.roundId,
    operationId=request.operationId,hostSequence=request.hostSequence,
    scheduledUpdate=request.scheduledUpdate,companyEntity=request.companyEntity,
    stationA=intent.stationA,stationB=intent.stationB,lineName=intent.lineName}
  return action.send(state,actionRequest,api)
end
function M.arm(state,request,api)
  local ok,result=pcall(arm,state,request,api)
  return ok and result==true
end
function M.execute(state,request,api)
  local ok,result=pcall(execute,state,request,api)
  return ok and result==true
end
function M.observe(state,api)
  local ok,result=pcall(action.observe,state,api)
  return ok and result==true
end
-- Pure qualification for retirement at the existing confirmed release seam.
-- Preparation and execution have distinct operation IDs. The consumed barrier
-- remains saved after retirement and the coordinator advances nextSequence.
function M.qualifyRelease(current)
  if type(current)~="table" or current.nativeLineOrderAttempted~=true
    or current.phase2CompanyFault~=false then return false end
  local b=current.coordinationBinding or {}
  local p=current.preparedCommand or {}
  local prep=current.preparationReceipt or {}
  local barrier=current.executionBarrier or {}
  local r=current.executionReceipt or {}
  return b.phase=="action_held" and p.commandType=="road.line.create"
    and type(b.nonce)=="string" and #b.nonce==32 and b.nonce:match("^[a-f0-9]+$")~=nil
    and identity(b.roundId) and identity(p.operationId)
    and type(b.players)=="table" and identity(p.originPlayerId)
    and b.players[p.originPlayerId]==p.companyEntity
    and identity(p.requestMessageId) and integer(p.clientSequence)
    and identity(r.operationId) and prep.status=="ok" and prep.operation=="prepare"
    and prep.operationId==p.operationId and prep.nonce==b.nonce and prep.roundId==b.roundId
    and barrier.phase=="consumed" and barrier.nonce==b.nonce and barrier.roundId==b.roundId
    and barrier.operationId==r.operationId and r.nonce==b.nonce and r.roundId==b.roundId
    and r.status=="ok" and r.operation=="executeHeld" and r.held==true
    and entity(p.hostSequence) and p.hostSequence==(b.nextSequence or 1)
    and barrier.hostSequence==p.hostSequence and r.hostSequence==p.hostSequence
    and integer(p.scheduledUpdate) and barrier.scheduledUpdate==p.scheduledUpdate
    and prep.schemaVersion==1 and r.schemaVersion==1 and r.stage==nil
    and integer(prep.updateCount) and prep.updateCount<p.scheduledUpdate
    and p.scheduledUpdate<=prep.updateCount+600
    and r.updateCount==p.scheduledUpdate and prep.ownerCompanyEntity==p.companyEntity
    and entity(p.companyEntity) and r.ownerCompanyEntity==p.companyEntity
    and r.snapshotVersion==4 and entity(r.lineEntity) and r.entity==r.lineEntity
    and r.stationA==p.stationA and r.stationB==p.stationB
    and entity(p.stationA) and entity(p.stationB) and p.stationA~=p.stationB
    and p.entity==p.stationA and p.lineName=="TalCo disposable service"
    and r.lineEntity~=p.stationA and r.lineEntity~=p.stationB
end
return M
