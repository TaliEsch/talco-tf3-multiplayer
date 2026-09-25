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
    or preparation.status~="ok" or preparation.nonce~=request.nonce
    or preparation.roundId~=request.roundId
    or preparation.ownerCompanyEntity~=request.companyEntity
    or prepared.commandType~="road.line.create"
    or prepared.operationId~=request.operationId
    or not entity(localCompany) or localCompany==request.companyEntity then return nil end
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
return M
