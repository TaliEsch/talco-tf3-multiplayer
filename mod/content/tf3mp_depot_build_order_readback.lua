-- Independent read-only GUI world check for one held, ordered stock road depot.
local M = {}
local RESOURCE = "::/depots/road/road_depot/road_depot.con"
local function integer(v)
  return type(v)=="number" and v==math.floor(v) and v>=0 and v<=2147483647
end
local function entity(v) return integer(v) and v>0 end
local function native(v) return type(v)=="table" or type(v)=="userdata" end
local function fail() error("depot readback unavailable",0) end
local function component(api,id,name)
  return api.engine.getComponent(id,api.type.ComponentType[name])
end
function M.probe(api,request)
  local progress={stage="request"}
  local function inspect()
    if type(request)~="table" or getmetatable(request)~=nil then fail() end
    local allowed={schemaVersion=true,kind=true,nonce=true,requestId=true,
      hostSequence=true,company=true,localCompany=true,construction=true,depot=true,
      update=true,balance=true,balanceNegative=true,localBalance=true,
      localBalanceNegative=true,charge=true}
    local count=0
    for key in pairs(request) do if not allowed[key] then fail() end;count=count+1 end
    if count~=15 or request.schemaVersion~=1
      or request.kind~="ordered_depot_readback_request"
      or type(request.nonce)~="string" or #request.nonce~=32
      or not request.nonce:match("^[0-9a-f]+$")
      or not entity(request.requestId) or not entity(request.hostSequence)
      or not entity(request.company) or not entity(request.localCompany)
      or not entity(request.construction) or not entity(request.depot)
      or request.construction==request.depot
      or not integer(request.update)
      or not integer(request.balance) or request.balanceNegative~=0 and request.balanceNegative~=1
      or request.balance==0 and request.balanceNegative~=0
      or not integer(request.localBalance)
      or request.localBalanceNegative~=0 and request.localBalanceNegative~=1
      or request.localBalance==0 and request.localBalanceNegative~=0
      or not entity(request.charge) then fail() end
    progress.stage="clock"
    local world=api.engine.util.getWorld()
    local time=component(api,world,"GAME_TIME")
    local speed=component(api,world,"GAME_SPEED")
    if not native(time) or time.updateCount~=request.update
      or not native(speed) or speed.speedup~=0
      or api.engine.util.getPlayer()~=request.localCompany then fail() end
    progress.stage="balance"
    local balance=request.balanceNegative==1 and -request.balance or request.balance
    if api.engine.util.finance.getPlayersBalance(request.company)~=balance then fail() end
    progress.stage="local_balance"
    local localBalance=request.localBalanceNegative==1
      and -request.localBalance or request.localBalance
    if api.engine.util.finance.getPlayersBalance(request.localCompany)~=localBalance then fail() end
    progress.stage="construction"
    if api.engine.entityExists(request.construction)~=true then fail() end
    local construction=component(api,request.construction,"CONSTRUCTION")
    local owner=component(api,request.construction,"PLAYER_OWNED")
    if not native(construction) or construction.fileName~=RESOURCE
      or not native(owner) or owner.player~=request.company
      or not native(construction.depots) or #construction.depots~=1
      or construction.depots[1]~=request.depot then fail() end
    progress.stage="depot"
    if api.engine.entityExists(request.depot)~=true then fail() end
    local depot=component(api,request.depot,"VEHICLE_DEPOT")
    local depotOwner=component(api,request.depot,"PLAYER_OWNED")
    if not native(depot) or not native(depotOwner)
      or depotOwner.player~=request.company then fail() end
    return {schemaVersion=1,kind="ordered_depot_readback_receipt",code="observed",
      nonce=request.nonce,requestId=request.requestId,hostSequence=request.hostSequence,
      company=request.company,localCompany=request.localCompany,
      construction=request.construction,depot=request.depot,update=request.update,
      balance=request.balance,balanceNegative=request.balanceNegative,
      localBalance=request.localBalance,localBalanceNegative=request.localBalanceNegative,
      charge=request.charge}
  end
  local ok,result=pcall(inspect)
  if ok then return result end
  return {schemaVersion=1,kind="ordered_depot_readback_receipt",code="unknown",
    nonce=type(request)=="table" and request.nonce or "",
    requestId=type(request)=="table" and request.requestId or 0,
    stage=progress.stage}
end
return M
