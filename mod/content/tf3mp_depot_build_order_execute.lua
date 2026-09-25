-- First held Host-ordered depot slice for a separately mapped company.
-- Reuses the local native depot adapter and its persistent one-attempt latch.
local M = {}
local wire = ug_require("tf3mp_status_1::/tf3mp_depot_build_order_wire.lua")
local depot = ug_require("tf3mp_status_1::/tf3mp_depot_command.lua")
local function integer(v)
  return type(v) == "number" and v == math.floor(v) and v >= 0 and v <= 2147483647
end
local function entity(v) return integer(v) and v > 0 end
local function identity(v)
  return type(v) == "string" and #v > 0 and #v <= 128
    and v:match("^[A-Za-z0-9_.:-]+$") ~= nil
end
local function native(v) return type(v) == "table" or type(v) == "userdata" end
local function valid(request)
  if type(request) ~= "table" or request.schemaVersion ~= 1 or request.protocolVersion ~= 2
    or request.operation ~= "executeHeld" or request.commandType ~= "road.depot.build"
    or type(request.nonce) ~= "string" or #request.nonce ~= 32
    or not request.nonce:match("^[a-f0-9]+$") then return nil end
  for _, key in ipairs({"roundId","operationId","originPlayerId","requestMessageId"}) do
    if not identity(request[key]) then return nil end
  end
  for _, key in ipairs({"hostSequence","scheduledUpdate","companyEntity","entity","clientSequence"}) do
    if not integer(request[key]) then return nil end
  end
  if request.hostSequence < 1 or not entity(request.companyEntity) or request.entity ~= 0 then return nil end
  local allowed = {schemaVersion=true,nonce=true,roundId=true,operationId=true,
    operation=true,protocolVersion=true,hostSequence=true,scheduledUpdate=true,
    companyEntity=true,entity=true,clientSequence=true,originPlayerId=true,
    requestMessageId=true,commandType=true,xText=true,yText=true,zText=true,
    yawText=true,seed=true}
  local count = 0
  for key in pairs(request) do if not allowed[key] then return nil end; count = count + 1 end
  if count ~= 19 then return nil end
  return wire.decode(request)
end
local function context(state,request,api)
  local intent=valid(request)
  if intent == nil then return nil end
  local current=state:get()
  if type(current) ~= "table" then return nil end
  local binding=current.coordinationBinding or {}
  local lease=current.watchdogLease or {}
  local prepared=current.preparedCommand or {}
  local preparation=current.preparationReceipt or {}
  local clock=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_TIME)
  local localCompany=api.engine.util.getPlayer()
  if not native(clock) or not integer(clock.tickCount) or not integer(clock.updateCount)
    or binding.nonce ~= request.nonce or binding.roundId ~= request.roundId
    or binding.phase ~= "prepared" or type(binding.players) ~= "table"
    or binding.players[request.originPlayerId] ~= request.companyEntity
    or request.hostSequence ~= (binding.nextSequence or 1)
    or lease.nonce ~= request.nonce or lease.phase ~= "active"
    or lease.companyEntity ~= localCompany or clock.tickCount < lease.lastTick
    or clock.tickCount >= lease.expiresTick or current.haltTestAttempted == true
    or current.phase2CompanyFault == true or current.nativeDepotAttempted == true
    or (current.coordinationReceipt or {}).operationId ~= nil
    or (current.executionReceipt or {}).operationId ~= nil
    or preparation.status ~= "ok" or preparation.nonce ~= request.nonce
    or preparation.roundId ~= request.roundId
    or preparation.ownerCompanyEntity ~= request.companyEntity
    or prepared.commandType ~= "road.depot.build"
    or not entity(localCompany) or localCompany == request.companyEntity then return nil end
  for _,key in ipairs({"hostSequence","scheduledUpdate","originPlayerId","companyEntity",
    "entity","clientSequence","requestMessageId"}) do
    if prepared[key] ~= request[key] then return nil end
  end
  local prior=prepared.intent or {}
  for _,key in ipairs({"companyEntity","resource","x","y","z","yaw","seed"}) do
    if prior[key] ~= intent[key] then return nil end
  end
  if api.engine.entityExists(localCompany) ~= true
    or api.engine.entityExists(request.companyEntity) ~= true
    or not native(api.engine.getComponent(localCompany,api.type.ComponentType.PLAYER))
    or not native(api.engine.getComponent(request.companyEntity,api.type.ComponentType.PLAYER))
    or api.res.constructionRep.find(intent.resource) ~= prepared.resourceId
    or api.res.constructionRep.getName(prepared.resourceId) ~= intent.resource then return nil end
  return current,binding,prepared,clock,intent,localCompany
end
local function arm(state,request,api)
  local current,_,_,clock=context(state,request,api)
  if current == nil then return false end
  local barrier=current.executionBarrier or {}
  if barrier.phase ~= nil and (barrier.phase ~= "consumed" or request.hostSequence <= barrier.hostSequence) then return false end
  if request.scheduledUpdate <= clock.updateCount or request.scheduledUpdate > clock.updateCount+600 then return false end
  current.executionBarrier={phase="armed",nonce=request.nonce,roundId=request.roundId,
    operationId=request.operationId,hostSequence=request.hostSequence,
    scheduledUpdate=request.scheduledUpdate}
  state:set(current)
  return true
end
local function execute(state,request,api)
  local current,binding,_,clock,intent,localCompany=context(state,request,api)
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
  state:set(current) -- Never authorize a second send after an unknown result.
  if clock.updateCount ~= request.scheduledUpdate then return false end
  local speed=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_SPEED)
  if not native(speed) or speed.speedup ~= 0 then return false end
  local bound={originalCompany=localCompany,targetCompany=request.companyEntity,
    resource=intent.resource,sessionId=request.nonce,actionId=request.hostSequence,
    consentId=request.operationId}
  local consent={kind="native_charge",confirmed=true,sessionId=bound.sessionId,
    actionId=bound.actionId,consentId=bound.consentId,
    originalCompany=bound.originalCompany,targetCompany=bound.targetCompany,
    x=intent.x,y=intent.y,z=intent.z,yaw=intent.yaw,
    resource=intent.resource,seed=intent.seed}
  local saved=state:get()
  saved.executionReceipt.stage="native_attempt"
  state:set(saved)
  -- The adapter rechecks the two live companies and held speed before creating
  -- the proposal, then persists its own company-wide attempt latch before send.
  local nativeReceipt=depot.execute(state,intent,bound,consent)
  saved=state:get()
  local receipt=saved.executionReceipt or {}
  local savedBinding=saved.coordinationBinding or {}
  if type(nativeReceipt) ~= "table" or nativeReceipt.outcome ~= "verified"
    or nativeReceipt.code ~= "NATIVE_BUILD_ACCOUNTING_VERIFIED"
    or receipt.operationId ~= request.operationId or receipt.status ~= "unknown"
    or savedBinding.phase ~= "execution_unknown"
    or not entity(nativeReceipt.constructionEntity) or not entity(nativeReceipt.depotEntity)
    or nativeReceipt.constructionOwner ~= request.companyEntity
    or nativeReceipt.depotOwner ~= request.companyEntity
    or not entity(nativeReceipt.chargedCost)
    or nativeReceipt.targetAfter ~= nativeReceipt.targetBefore-nativeReceipt.chargedCost
    or nativeReceipt.originalAfter ~= nativeReceipt.originalBefore then return false end
  local afterClock=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_TIME)
  local afterSpeed=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_SPEED)
  if not native(afterClock) or afterClock.updateCount ~= request.scheduledUpdate
    or not native(afterSpeed) or afterSpeed.speedup ~= 0 then return false end
  local balance=nativeReceipt.targetAfter
  if type(balance) ~= "number" or balance ~= math.floor(balance)
    or math.abs(balance) > 9007199254740991 then return false end
  receipt.snapshotVersion=3;receipt.hostSequence=request.hostSequence
  receipt.entity=0;receipt.ownerCompanyEntity=request.companyEntity
  receipt.constructionEntity=nativeReceipt.constructionEntity
  receipt.depotEntity=nativeReceipt.depotEntity
  receipt.chargedCost=nativeReceipt.chargedCost
  receipt.balance=math.abs(balance);receipt.negative=balance<0 and 1 or 0
  receipt.updateCount=afterClock.updateCount;receipt.held=true;receipt.status="ok";receipt.stage=nil
  savedBinding.phase="action_held"
  state:set(saved)
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
return M
