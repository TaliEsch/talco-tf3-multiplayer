-- Held Host-ordered depot construction for a separately mapped company.
-- Reuses the qualified proposal builder; callback and world commit are separate.
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
local pending = nil
local function balance(api,company)
  local value=api.engine.util.finance.getPlayersBalance(company)
  if type(value) ~= "number" or value ~= math.floor(value)
    or math.abs(value)>9007199254740991 then error("BALANCE_UNAVAILABLE") end
  return value
end
local function members(api,component)
  local found={}
  for _,id in ipairs(api.engine.getEntitiesWithComponent(component)) do found[id]=true end
  return found
end
local function preserved(api,before,component)
  local after=members(api,component)
  for id in pairs(before) do if not after[id] then return false end end
  return true
end
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
  current.executionReceipt.stage="proposal_prepare"
  state:set(current)
  -- The proposal builder rechecks the live companies, resource and held speed.
  -- The wire intent also carries companyEntity for admission. The native
  -- proposal builder accepts only the six placement fields and gets the
  -- target company from the separately checked binding.
  local placement={resource=intent.resource,x=intent.x,y=intent.y,z=intent.z,
    yaw=intent.yaw,seed=intent.seed}
  local command=depot.prepare(placement,bound)
  current=state:get()
  current.executionReceipt.stage="before_snapshot"
  state:set(current)
  local before={original=balance(api,localCompany),target=balance(api,request.companyEntity),
    constructions=members(api,api.type.ComponentType.CONSTRUCTION),
    depots=members(api,api.type.ComponentType.VEHICLE_DEPOT)}
  current=state:get()
  current.nativeDepotAttempted=true
  current.phase2CompanyFault=true
  current.nativeDepotReceipt={outcome="unknown",code="ENGINE_OUTCOME_UNKNOWN",
    originalBefore=before.original,targetBefore=before.target,
    originalCompany=localCompany,targetCompany=request.companyEntity,
    sessionId=request.nonce,actionId=request.hostSequence,consentId=request.operationId,
    resource=intent.resource}
  current.executionReceipt.stage="send_attempt"
  state:set(current) -- Durable company-wide latch before the native send.
  local work={operationId=request.operationId,request=request,intent=intent,
    localCompany=localCompany,before=before,callback=nil,callbackSeen=false,attempts=0}
  pending=work
  local sent=pcall(function()
    api.cmd.sendCommand(command,function(data,success,resultEntities)
      local callbackOk=pcall(function()
        local saved=state:get()
        local receipt=saved and saved.executionReceipt or {}
        local active=saved and saved.coordinationBinding or {}
        local barrier=saved and saved.executionBarrier or {}
        if pending~=work or work.callbackSeen or receipt.operationId~=work.operationId
          or receipt.status~="unknown" or active.phase~="execution_unknown"
          or barrier.phase~="consumed" or barrier.operationId~=work.operationId
          or saved.haltTestAttempted==true then return end
        work.callbackSeen=true
        if success~=true then
          receipt.stage="NATIVE_REJECTION_REASON_UNVERIFIED"
          saved.nativeDepotReceipt.code=receipt.stage
          pending=nil;state:set(saved);return
        end
        local cost=data and data.resultProposalData and data.resultProposalData.costs
        local created=resultEntities or data and data.resultEntities
        local ids={}
        if type(cost)~="number" or cost~=math.floor(cost) or cost<1
          or cost>2147483647 or not native(created) then
          receipt.stage="callback_shape"
          pending=nil;state:set(saved);return
        end
        for _,pair in ipairs(created) do
          if #ids>=32 or not native(pair) or not entity(pair[1]) then
            receipt.stage="callback_shape"
            pending=nil;state:set(saved);return
          end
          ids[#ids+1]=pair[1]
        end
        if #ids<1 then receipt.stage="callback_shape";pending=nil;state:set(saved);return end
        work.callback={cost=cost,ids=ids}
        receipt.stage="await_world"
        state:set(saved)
      end)
      if not callbackOk and pending==work then
        local saved=state:get()
        if type(saved)=="table" and type(saved.executionReceipt)=="table"
          and saved.executionReceipt.operationId==work.operationId then
          saved.executionReceipt.stage="callback_exception"
          if type(saved.nativeDepotReceipt)=="table" then
            saved.nativeDepotReceipt.code="callback_exception"
          end
          pending=nil;state:set(saved)
        end
      end
    end)
  end)
  if not sent then
    current=state:get()
    current.executionReceipt.stage="ENGINE_SEND_FAILED"
    current.nativeDepotReceipt.code="ENGINE_SEND_FAILED"
    pending=nil;state:set(current);return false
  end
  current=state:get()
  if current.executionReceipt.stage=="send_attempt" then
    current.executionReceipt.stage="await_callback"
    state:set(current)
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
  if type(saved)~="table" or receipt.operationId~=work.operationId or receipt.status~="unknown"
    or binding.phase~="execution_unknown" or barrier.phase~="consumed"
    or barrier.operationId~=work.operationId or lease.phase~="active"
    or saved.haltTestAttempted==true then pending=nil;return false end
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
  local constructionId=nil
  for _,id in ipairs(work.callback.ids) do
    if not work.before.constructions[id]
      and api.engine.getComponent(id,api.type.ComponentType.CONSTRUCTION)~=nil then
      if constructionId~=nil then
        receipt.stage="after_construction_count";pending=nil;state:set(saved);return false end
      constructionId=id
    end
  end
  if constructionId==nil then
    return waitOrFail("after_construction_missing")
  end
  local construction=api.engine.getComponent(constructionId,api.type.ComponentType.CONSTRUCTION)
  local owner=api.engine.getComponent(constructionId,api.type.ComponentType.PLAYER_OWNED)
  if not native(construction) or not native(owner) or not native(construction.depots)
    or #construction.depots==0 then return waitOrFail("after_construction_incomplete") end
  if construction.fileName~=work.intent.resource
    or owner.player~=work.request.companyEntity or #construction.depots~=1 then
    receipt.stage="after_construction_owner";pending=nil;state:set(saved);return false end
  local depotId=construction.depots[1]
  local depotComponent=api.engine.getComponent(depotId,api.type.ComponentType.VEHICLE_DEPOT)
  local depotOwner=api.engine.getComponent(depotId,api.type.ComponentType.PLAYER_OWNED)
  if not entity(depotId) or work.before.depots[depotId] then
    receipt.stage="after_depot_owner";pending=nil;state:set(saved);return false end
  if not native(depotComponent) or not native(depotOwner) then
    return waitOrFail("after_depot_missing") end
  if depotOwner.player~=work.request.companyEntity then
    receipt.stage="after_depot_owner";pending=nil;state:set(saved);return false end
  if not preserved(api,work.before.constructions,api.type.ComponentType.CONSTRUCTION)
    or not preserved(api,work.before.depots,api.type.ComponentType.VEHICLE_DEPOT) then
    receipt.stage="after_membership";pending=nil;state:set(saved);return false end
  local originalAfter=balance(api,work.localCompany)
  local targetAfter=balance(api,work.request.companyEntity)
  if originalAfter~=work.before.original
    or targetAfter~=work.before.target-work.callback.cost then
    receipt.stage="after_debit";pending=nil;state:set(saved);return false end
  receipt.snapshotVersion=3;receipt.hostSequence=work.request.hostSequence
  receipt.entity=0;receipt.ownerCompanyEntity=work.request.companyEntity
  receipt.constructionEntity=constructionId;receipt.depotEntity=depotId
  receipt.chargedCost=work.callback.cost
  receipt.balance=math.abs(targetAfter);receipt.negative=targetAfter<0 and 1 or 0
  receipt.updateCount=clock.updateCount;receipt.held=true;receipt.status="ok";receipt.stage=nil
  binding.phase="action_held"
  saved.nativeDepotReceipt={outcome="verified",code="NATIVE_BUILD_ACCOUNTING_VERIFIED",
    constructionEntity=constructionId,depotEntity=depotId,
    originalBefore=work.before.original,originalAfter=originalAfter,
    targetBefore=work.before.target,targetAfter=targetAfter,chargedCost=work.callback.cost}
  saved.phase2CompanyFault=false
  pending=nil;state:set(saved)
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
  return ok and result==true
end
return M
