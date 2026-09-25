-- Read-only preparation for one Host-ordered stock road depot.
local M = {}
local wire = ug_require("tf3mp_status_1::/tf3mp_depot_build_order_wire.lua")
local function integer(v)
  return type(v) == "number" and v == math.floor(v) and v >= 0 and v <= 2147483647
end
local function identity(v)
  return type(v) == "string" and #v > 0 and #v <= 128
    and v:match("^[A-Za-z0-9_.:-]+$") ~= nil
end
local function native(v) return type(v) == "table" or type(v) == "userdata" end
local function valid(request)
  if type(request) ~= "table" or request.schemaVersion ~= 1 or request.protocolVersion ~= 2
    or request.operation ~= "prepare" or request.commandType ~= "road.depot.build"
    or type(request.nonce) ~= "string" or #request.nonce ~= 32
    or not request.nonce:match("^[a-f0-9]+$") then return nil end
  for _, key in ipairs({"roundId","operationId","originPlayerId","requestMessageId"}) do
    if not identity(request[key]) then return nil end
  end
  for _, key in ipairs({"hostSequence","scheduledUpdate","companyEntity","entity","clientSequence"}) do
    if not integer(request[key]) then return nil end
  end
  if request.hostSequence < 1 or request.companyEntity == 0 or request.entity ~= 0 then return nil end
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
local function inspect(state, request, api)
  local intent = valid(request)
  if intent == nil then return false end
  local current = state:get()
  if type(current) ~= "table" then return false end
  local binding = current.coordinationBinding or {}
  local lease = current.watchdogLease or {}
  local world = api.engine.util.getWorld()
  local clock = api.engine.getComponent(world,api.type.ComponentType.GAME_TIME)
  local speed = api.engine.getComponent(world,api.type.ComponentType.GAME_SPEED)
  local localCompany = api.engine.util.getPlayer()
  if not native(clock) or not integer(clock.tickCount) or not integer(clock.updateCount)
    or not native(speed) or not integer(speed.speedup)
    or binding.nonce ~= request.nonce or binding.roundId ~= request.roundId
    or binding.phase ~= "running" or type(binding.players) ~= "table"
    or lease.nonce ~= request.nonce or lease.companyEntity ~= localCompany
    or lease.phase ~= "active" or clock.tickCount < lease.lastTick
    or clock.tickCount >= lease.expiresTick or current.haltTestAttempted == true
    or current.phase2CompanyFault == true or current.nativeDepotAttempted == true
    or (current.coordinationReceipt or {}).operationId ~= nil
    or (current.preparationReceipt or {}).operationId ~= nil then return false end
  local receipt = {schemaVersion=1,nonce=request.nonce,roundId=request.roundId,
    operationId=request.operationId,operation="prepare",status="unknown",
    updateCount=clock.updateCount,held=speed.speedup == 0,ownerCompanyEntity=0}
  current.preparationReceipt = receipt
  state:set(current) -- One preparation decision; never overwrite uncertainty.
  if binding.players[request.originPlayerId] ~= request.companyEntity
    or request.hostSequence ~= (binding.nextSequence or 1)
    or request.scheduledUpdate <= clock.updateCount
    or request.scheduledUpdate > clock.updateCount + 600
    or api.engine.entityExists(request.companyEntity) ~= true
    or not native(api.engine.getComponent(request.companyEntity,api.type.ComponentType.PLAYER)) then return false end
  local resourceId = api.res.constructionRep.find(intent.resource)
  if not integer(resourceId) or api.res.constructionRep.getName(resourceId) ~= intent.resource then return false end
  current.preparedCommand = {commandType="road.depot.build",hostSequence=request.hostSequence,
    scheduledUpdate=request.scheduledUpdate,originPlayerId=request.originPlayerId,
    companyEntity=request.companyEntity,entity=0,clientSequence=request.clientSequence,
    requestMessageId=request.requestMessageId,resourceId=resourceId,intent=intent}
  receipt.status="ok"; receipt.ownerCompanyEntity=request.companyEntity
  binding.phase="prepared"
  state:set(current)
  return true
end
function M.handle(state, request, api)
  local ok, result = pcall(inspect,state,request,api)
  return ok and result == true
end
return M
