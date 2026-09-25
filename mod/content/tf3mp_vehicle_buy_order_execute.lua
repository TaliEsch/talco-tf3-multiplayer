-- One held Host-ordered road vehicle purchase. Callback acceptance and world
-- verification are separate; any uncertain result consumes the durable latch.
local M = {}
local wire = ug_require("tf3mp_status_1::/tf3mp_vehicle_buy_order_wire.lua")
local vehicleCommand = ug_require("tf3mp_status_1::/tf3mp_vehicle_command.lua")
local pending = nil
local function integer(v)
  return type(v)=="number" and v==math.floor(v) and v>=0 and v<=2147483647
end
local function entity(v) return integer(v) and v>0 end
local function money(v)
  return type(v)=="number" and v==v and v==math.floor(v)
    and math.abs(v)<=9007199254740991
end
local function native(v) return type(v)=="table" or type(v)=="userdata" end
local function identity(v)
  return type(v)=="string" and #v>0 and #v<=128
    and v:match("^[A-Za-z0-9_.:-]+$")~=nil
end
local function balance(api,company)
  local result=api.engine.util.finance.getPlayersBalance(company)
  if not money(result) then error("BALANCE_UNAVAILABLE") end
  return result
end
local function members(api)
  local result={}
  for _,id in ipairs(api.engine.getEntitiesWithComponent(api.type.ComponentType.TRANSPORT_VEHICLE)) do
    result[id]=true
  end
  return result
end
local function valid(request)
  if type(request)~="table" or request.schemaVersion~=1 or request.protocolVersion~=2
    or request.operation~="executeHeld" or request.commandType~="road.vehicle.buy"
    or type(request.nonce)~="string" or #request.nonce~=32
    or not request.nonce:match("^[a-f0-9]+$") then return nil end
  for _,key in ipairs({"roundId","operationId","originPlayerId","requestMessageId"}) do
    if not identity(request[key]) then return nil end
  end
  for _,key in ipairs({"hostSequence","scheduledUpdate","companyEntity","entity","clientSequence"}) do
    if not integer(request[key]) then return nil end
  end
  if request.hostSequence<1 or not entity(request.companyEntity)
    or not entity(request.entity) then return nil end
  local allowed={schemaVersion=true,nonce=true,roundId=true,operationId=true,
    operation=true,protocolVersion=true,hostSequence=true,scheduledUpdate=true,
    companyEntity=true,entity=true,clientSequence=true,originPlayerId=true,
    requestMessageId=true,commandType=true,model=true}
  local count=0
  for key in pairs(request) do if not allowed[key] then return nil end;count=count+1 end
  if count~=15 then return nil end
  return wire.decode(request)
end
local function context(state,request,api)
  local intent=valid(request)
  if intent==nil then return nil end
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
    or current.phase2CompanyFault==true or current.nativeVehicleAttempted==true
    or (current.coordinationReceipt or {}).operationId~=nil
    or (current.executionReceipt or {}).operationId~=nil
    or preparation.status~="ok" or preparation.nonce~=request.nonce
    or preparation.roundId~=request.roundId
    or preparation.ownerCompanyEntity~=request.companyEntity
    or prepared.commandType~="road.vehicle.buy"
    or not entity(localCompany) or localCompany==request.companyEntity then return nil end
  for _,key in ipairs({"hostSequence","scheduledUpdate","originPlayerId","companyEntity",
    "entity","clientSequence","requestMessageId"}) do
    if prepared[key]~=request[key] then return nil end
  end
  local prior=prepared.intent or {}
  if prior.companyEntity~=intent.companyEntity or prior.depotEntity~=intent.depotEntity
    or prior.model~=intent.model then return nil end
  if api.engine.entityExists(localCompany)~=true
    or api.engine.entityExists(request.companyEntity)~=true
    or not native(api.engine.getComponent(localCompany,api.type.ComponentType.PLAYER))
    or not native(api.engine.getComponent(request.companyEntity,api.type.ComponentType.PLAYER))
    or api.engine.entityExists(request.entity)~=true then return nil end
  local owner=api.engine.getComponent(request.entity,api.type.ComponentType.PLAYER_OWNED)
  local depot=api.engine.getComponent(request.entity,api.type.ComponentType.VEHICLE_DEPOT)
  if not native(owner) or owner.player~=request.companyEntity or not native(depot)
    or depot.carrier~=api.type["enum"].Carrier.ROAD then return nil end
  return current,binding,prepared,clock,intent,localCompany
end
local function arm(state,request,api)
  local current,_,_,clock=context(state,request,api)
  if current==nil then return false end
  local barrier=current.executionBarrier or {}
  if barrier.phase~=nil and (barrier.phase~="consumed"
    or request.hostSequence<=barrier.hostSequence) then return false end
  if request.scheduledUpdate<=clock.updateCount
    or request.scheduledUpdate>clock.updateCount+600 then return false end
  current.executionBarrier={phase="armed",nonce=request.nonce,roundId=request.roundId,
    operationId=request.operationId,hostSequence=request.hostSequence,
    scheduledUpdate=request.scheduledUpdate}
  state:set(current)
  return true
end
local function execute(state,request,api)
  local current,binding,prepared,clock,intent,localCompany=context(state,request,api)
  if current==nil then return false end
  local barrier=current.executionBarrier or {}
  if barrier.phase~="held" or barrier.nonce~=request.nonce
    or barrier.roundId~=request.roundId or barrier.operationId~=request.operationId
    or barrier.hostSequence~=request.hostSequence
    or barrier.scheduledUpdate~=request.scheduledUpdate then return false end
  barrier.phase="consumed"
  current.executionReceipt={schemaVersion=1,nonce=request.nonce,roundId=request.roundId,
    operationId=request.operationId,operation="executeHeld",status="unknown",
    updateCount=clock.updateCount,held=false,stage="latched"}
  binding.phase="execution_unknown"
  state:set(current)
  if clock.updateCount~=request.scheduledUpdate then return false end
  local speed=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_SPEED)
  if not native(speed) or speed.speedup~=0 then return false end
  current.executionReceipt.stage="command_prepare";state:set(current)
  local bound={originalCompany=localCompany,targetCompany=request.companyEntity,
    depotEntity=request.entity,modelResource=intent.model}
  -- prepare rechecks live owner, model, price, funds and held speed.
  local command,price,modelId=vehicleCommand.prepare({model=intent.model},bound)
  if not money(price) or price<1 or not integer(modelId)
    or prepared.modelId~=modelId then return false end
  local before={original=balance(api,localCompany),target=balance(api,request.companyEntity),
    vehicles=members(api)}
  if before.target<price then return false end
  current=state:get()
  current.nativeVehicleAttempted=true
  current.phase2CompanyFault=true
  current.nativeVehicleReceipt={outcome="unknown",code="ENGINE_OUTCOME_UNKNOWN",
    originalCompany=localCompany,targetCompany=request.companyEntity,
    depotEntity=request.entity,model=intent.model,originalBefore=before.original,
    targetBefore=before.target,sessionId=request.nonce,actionId=request.hostSequence,
    consentId=request.operationId}
  current.executionReceipt.stage="send_attempt"
  state:set(current) -- Persist the one-use company latch before native submission.
  local work={request=request,intent=intent,localCompany=localCompany,before=before,
    price=price,modelId=modelId,callback=nil,callbackSeen=false,attempts=0}
  pending=work
  local sent=pcall(function()
    api.cmd.sendCommand(command,function(data,success,resultEntities)
      local callbackOk=pcall(function()
        local saved=state:get()
        local receipt=saved and saved.executionReceipt or {}
        local active=saved and saved.coordinationBinding or {}
        local latestBarrier=saved and saved.executionBarrier or {}
        if pending~=work or work.callbackSeen
          or receipt.operationId~=work.request.operationId or receipt.status~="unknown"
          or active.phase~="execution_unknown" or latestBarrier.phase~="consumed"
          or latestBarrier.operationId~=work.request.operationId
          or saved.haltTestAttempted==true then return end
        work.callbackSeen=true
        if success~=true then
          receipt.stage="NATIVE_REJECTION_REASON_UNVERIFIED"
          saved.nativeVehicleReceipt.code=receipt.stage
          pending=nil;state:set(saved);return
        end
        local id=data and data.resultVehicleEntity
        if not entity(id) or type(resultEntities)~="table" or #resultEntities~=1
          or not native(resultEntities[1]) or resultEntities[1][1]~=id
          or work.before.vehicles[id] then
          receipt.stage="callback_shape"
          pending=nil;state:set(saved);return
        end
        work.callback={vehicleEntity=id}
        receipt.stage="await_world";state:set(saved)
      end)
      if not callbackOk and pending==work then
        local saved=state:get()
        if type(saved)=="table" and type(saved.executionReceipt)=="table"
          and saved.executionReceipt.operationId==work.request.operationId then
          saved.executionReceipt.stage="callback_exception"
          saved.nativeVehicleReceipt.code="callback_exception"
          pending=nil;state:set(saved)
        end
      end
    end)
  end)
  if not sent then
    current=state:get()
    current.executionReceipt.stage="ENGINE_SEND_FAILED"
    current.nativeVehicleReceipt.code="ENGINE_SEND_FAILED"
    pending=nil;state:set(current);return false
  end
  current=state:get()
  if current.executionReceipt.stage=="send_attempt" then
    current.executionReceipt.stage="await_callback";state:set(current)
  end
  return true
end
local function observe(state,api)
  local work=pending
  if work==nil then return false end
  local saved=state:get()
  local receipt=saved and saved.executionReceipt or {}
  local binding=saved and saved.coordinationBinding or {}
  local barrier=saved and saved.executionBarrier or {}
  local lease=saved and saved.watchdogLease or {}
  if type(saved)~="table" or receipt.operationId~=work.request.operationId
    or receipt.status~="unknown" or binding.phase~="execution_unknown"
    or barrier.phase~="consumed" or barrier.operationId~=work.request.operationId
    or lease.phase~="active" or saved.haltTestAttempted==true then
    pending=nil;return false end
  if receipt.stage=="await_callback" then return false end
  if receipt.stage~="await_world" or type(work.callback)~="table" then
    pending=nil;return false end
  work.attempts=work.attempts+1
  local function waitOrFail(stage)
    if work.attempts<24 then return false end
    receipt.stage=stage;pending=nil;state:set(saved);return false
  end
  local clock=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_TIME)
  local speed=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_SPEED)
  if not native(clock) or clock.updateCount~=work.request.scheduledUpdate
    or not native(speed) or speed.speedup~=0
    or api.engine.util.getPlayer()~=work.localCompany then
    receipt.stage="after_clock";pending=nil;state:set(saved);return false end
  local id=work.callback.vehicleEntity
  local vehicle=api.engine.getComponent(id,api.type.ComponentType.TRANSPORT_VEHICLE)
  local owner=api.engine.getComponent(id,api.type.ComponentType.PLAYER_OWNED)
  if api.engine.entityExists(id)~=true or not native(vehicle) or not native(owner) then
    return waitOrFail("after_vehicle_missing") end
  local config=vehicle.transportVehicleConfig
  local parts=config and config.vehicles
  local first=parts and parts[1]
  if owner.player~=work.request.companyEntity or vehicle.depot~=work.request.entity
    or vehicle.carrier~=api.type["enum"].Carrier.ROAD
    or api.res.modelRep.getName(work.modelId)~=work.intent.model
    or not native(config) or not native(parts) or #parts~=1
    or not native(first) or not native(first.part)
    or first.part.modelId~=work.modelId
    or not native(config.vehicleGroups) or #config.vehicleGroups~=1
    or config.vehicleGroups[1]~=1 then
    receipt.stage="after_vehicle_identity";pending=nil;state:set(saved);return false end
  local depotOwner=api.engine.getComponent(work.request.entity,api.type.ComponentType.PLAYER_OWNED)
  local depot=api.engine.getComponent(work.request.entity,api.type.ComponentType.VEHICLE_DEPOT)
  if not native(depotOwner) or depotOwner.player~=work.request.companyEntity
    or not native(depot) or depot.carrier~=api.type["enum"].Carrier.ROAD then
    receipt.stage="after_depot_owner";pending=nil;state:set(saved);return false end
  local afterMembers=members(api)
  if not afterMembers[id] then return waitOrFail("after_vehicle_membership") end
  for candidate in pairs(afterMembers) do
    if not work.before.vehicles[candidate] and candidate~=id then
      receipt.stage="after_vehicle_count";pending=nil;state:set(saved);return false end
  end
  for prior in pairs(work.before.vehicles) do
    if not afterMembers[prior] then
      receipt.stage="after_membership";pending=nil;state:set(saved);return false end
  end
  local originalAfter=balance(api,work.localCompany)
  local targetAfter=balance(api,work.request.companyEntity)
  if originalAfter~=work.before.original
    or targetAfter~=work.before.target-work.price or targetAfter<0 then
    receipt.stage="after_debit";pending=nil;state:set(saved);return false end
  receipt.snapshotVersion=3;receipt.hostSequence=work.request.hostSequence
  receipt.entity=id;receipt.ownerCompanyEntity=work.request.companyEntity
  receipt.vehicleEntity=id;receipt.depotEntity=work.request.entity
  receipt.chargedCost=work.price;receipt.balance=math.abs(targetAfter)
  receipt.negative=0;receipt.targetBefore=work.before.target
  receipt.originalBefore=work.before.original
  receipt.originalAfter=originalAfter;receipt.updateCount=clock.updateCount
  receipt.held=true;receipt.status="ok";receipt.stage=nil
  binding.phase="action_held"
  saved.nativeVehicleReceipt={outcome="verified",code="NATIVE_VEHICLE_ACCOUNTING_VERIFIED",
    vehicleEntity=id,vehicleOwner=owner.player,depotEntity=work.request.entity,
    depotOwner=depotOwner.player,model=work.intent.model,
    originalBefore=work.before.original,originalAfter=originalAfter,
    targetBefore=work.before.target,targetAfter=targetAfter,chargedCost=work.price}
  saved.phase2CompanyFault=false
  pending=nil;state:set(saved)
  return true
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
  local ok,result=pcall(observe,state,api)
  return ok and result==true
end
return M
