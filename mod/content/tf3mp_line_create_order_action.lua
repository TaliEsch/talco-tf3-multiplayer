-- One target-owned two-stop ROAD line for the Host-ordered held boundary.
-- The caller owns nonce/roster/lease/sequence admission and must persist its
-- consumed execution barrier before calling send. This module keeps a second,
-- durable one-use latch and never resends after an uncertain native outcome.
-- The station-group/terminal recipe derives from tf3mp_service_command.lua.
-- TF2 Mp/tpf2-multiplayer/mod/mp_lockstep_1/res/scripts/mp/lines.lua was
-- consulted for createLine callback behavior; no code is copied from it.
local M = {}
local pending = nil
local function integer(v)
  return type(v)=="number" and v==math.floor(v) and v>=0 and v<=2147483647
end
local function entity(v) return integer(v) and v>0 end
local function native(v) return type(v)=="table" or type(v)=="userdata" end
local function fail(code) error(code,0) end
local function ownedRoadStation(api,id,company)
  if not entity(id) or api.engine.entityExists(id)~=true then fail("STATION_MISSING") end
  local c=api.type.ComponentType
  local owner=api.engine.getComponent(id,c.PLAYER_OWNED)
  if not native(owner) or owner.player~=company then fail("STATION_OWNER_CHANGED") end
  if not native(api.engine.getComponent(id,c.STATION)) then fail("STATION_COMPONENT_MISSING") end
  local group=api.engine.system.stationGroupSystem.getStationGroup(id)
  if not entity(group) or api.engine.entityExists(group)~=true then fail("STATION_GROUP_MISSING") end
  local component=api.engine.getComponent(group,c.STATION_GROUP)
  if not native(component) or not native(component.stations) then fail("STATION_GROUP_MISSING") end
  for i,station in ipairs(component.stations) do
    if station==id then return {entity=id,group=group,station=i-1} end
  end
  fail("STATION_NOT_IN_GROUP")
end
local function roadTerminal(api,group,station,terminal)
  if not integer(station) or not integer(terminal) then return false end
  local carriers=api.engine.system.stationGroupSystem.getCarriers(group,station,terminal)
  if not native(carriers) or not native(carriers[1]) then return false end
  for _,carrier in ipairs(carriers[1]) do
    if carrier==api.type["enum"].Carrier.ROAD then return true end
  end
  return false
end
local function lineFor(api,stops)
  local line=api.type.Line.new();line.stops={}
  for _,selected in ipairs(stops) do
    local stop=api.type.Line.Stop.new()
    stop.stationGroup=selected.group;stop.station=selected.station
    stop.terminal=-1;stop.alternativeTerminals={}
    line.stops[#line.stops+1]=stop
  end
  local assignments=api.engine.system.lineSystem.getBestLineAssignment(-1,line,true)
  if not native(assignments) or #assignments~=2 then fail("TERMINAL_ASSIGNMENT_MISSING") end
  for i,assignment in ipairs(assignments) do
    if not native(assignment) or assignment.station~=stops[i].station
      or not roadTerminal(api,stops[i].group,assignment.station,assignment.terminal) then
      fail("ROAD_TERMINAL_UNAVAILABLE")
    end
    line.stops[i].station=assignment.station;line.stops[i].terminal=assignment.terminal
  end
  return line
end
local function live(api,request)
  if not entity(request.companyEntity) or not entity(request.stationA)
    or not entity(request.stationB) or request.stationA==request.stationB
    or request.lineName~="TalCo disposable service"
    or api.engine.entityExists(request.companyEntity)~=true
    or not native(api.engine.getComponent(request.companyEntity,api.type.ComponentType.PLAYER)) then
    fail("INVALID_LINE_INTENT")
  end
  local stops={ownedRoadStation(api,request.stationA,request.companyEntity),
    ownedRoadStation(api,request.stationB,request.companyEntity)}
  return lineFor(api,stops),stops
end
function M.inspect(api,request)
  local ok,line,stops=pcall(live,api,request)
  if not ok then return nil,line end
  return {stationA=request.stationA,stationB=request.stationB,
    companyEntity=request.companyEntity,lineName=request.lineName,
    stops={{group=stops[1].group,station=line.stops[1].station,terminal=line.stops[1].terminal},
      {group=stops[2].group,station=line.stops[2].station,terminal=line.stops[2].terminal}}}
end
local function sameStops(expected,line)
  if not native(expected) or not native(line) or not native(line.stops)
    or #expected~=2 or #line.stops~=2 then return false end
  for i=1,2 do
    if line.stops[i].stationGroup~=expected[i].group
      or line.stops[i].station~=expected[i].station
      or line.stops[i].terminal~=expected[i].terminal then return false end
  end
  return true
end
local function checkedState(state,request)
  local current=state:get()
  if type(current)~="table" or current.phase2CompanyFault==true
    or current.nativeLineOrderAttempted==true then return nil end
  local binding=current.coordinationBinding or {}
  local barrier=current.executionBarrier or {}
  local prepared=current.preparedCommand or {}
  if binding.phase~="prepared" or barrier.phase~="held"
    or barrier.operationId~=request.operationId
    or barrier.hostSequence~=request.hostSequence
    or barrier.scheduledUpdate~=request.scheduledUpdate
    or prepared.commandType~="road.line.create"
    or prepared.operationId~=request.operationId
    or prepared.hostSequence~=request.hostSequence
    or prepared.scheduledUpdate~=request.scheduledUpdate
    or prepared.companyEntity~=request.companyEntity
    or prepared.stationA~=request.stationA or prepared.stationB~=request.stationB
    or prepared.lineName~=request.lineName then return nil end
  return current,binding,barrier,prepared
end
function M.send(state,request,api)
  local current,binding,barrier,prepared=checkedState(state,request)
  if not current then return false end
  -- Consume before even checking the clock or live owners. The caller's
  -- execution barrier is also consumed here, before any native submission.
  barrier.phase="consumed";binding.phase="execution_unknown"
  current.nativeLineOrderAttempted=true;current.phase2CompanyFault=true
  current.executionReceipt={schemaVersion=1,nonce=request.nonce,
    roundId=request.roundId,operationId=request.operationId,
    operation="executeHeld",status="unknown",stage="latched",
    hostSequence=request.hostSequence,held=false}
  state:set(current)
  local clock=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_TIME)
  local speed=api.engine.getComponent(api.engine.util.getWorld(),api.type.ComponentType.GAME_SPEED)
  if not native(clock) or clock.updateCount~=request.scheduledUpdate
    or not native(speed) or speed.speedup~=0 then return false end
  local ok,line,stops=pcall(live,api,request)
  if not ok then
    local code=type(line)=="string" and line:match("^[A-Z_]+$") and line or "INVALID"
    current.executionReceipt.stage="live_"..code;state:set(current);return false
  end
  if not sameStops(prepared.stops,line) then
    current.executionReceipt.stage="terminal_binding_changed";state:set(current);return false
  end
  local before={}
  for _,id in ipairs(api.engine.system.lineSystem.getLines()) do before[id]=true end
  local work={operationId=request.operationId,request=request,expected=prepared.stops,
    before=before,callbackSeen=false,callback=nil,attempts=0}
  pending=work
  current.executionReceipt.stage="send_attempt";state:set(current)
  local sent=pcall(function()
    local command=api.cmd.makeLineCreateCmd(request.lineName,
      api.type.Vec3f.new(0.15,0.45,0.85),request.companyEntity,line)
    api.cmd.sendCommand(command,function(data,success,entities)
      pcall(function()
        local saved=state:get()
        local receipt=saved and saved.executionReceipt or {}
        local b=saved and saved.coordinationBinding or {}
        local barrierNow=saved and saved.executionBarrier or {}
        if pending~=work or work.callbackSeen or receipt.operationId~=work.operationId
          or receipt.status~="unknown" or b.phase~="execution_unknown"
          or barrierNow.phase~="consumed" or barrierNow.operationId~=work.operationId then return end
        work.callbackSeen=true
        if success~=true then receipt.stage="native_rejected_unknown";pending=nil;state:set(saved);return end
        local id=data and data.resultEntity
        if not entity(id) or before[id] or type(entities)~="table"
          or #entities~=1 or not native(entities[1]) or entities[1][1]~=id then
          receipt.stage="callback_shape";pending=nil;state:set(saved);return end
        work.callback=id;receipt.stage="await_world";state:set(saved)
      end)
    end)
  end)
  if not sent then pending=nil;current.executionReceipt.stage="send_failed";state:set(current);return false end
  if current.executionReceipt.stage=="send_attempt" then
    current.executionReceipt.stage="await_callback";state:set(current)
  end
  return true
end
function M.observe(state,api)
  local work=pending
  if not work or not work.callback then return false end
  local saved=state:get()
  local receipt=saved and saved.executionReceipt or {}
  local binding=saved and saved.coordinationBinding or {}
  local barrier=saved and saved.executionBarrier or {}
  if not saved or receipt.operationId~=work.operationId or receipt.status~="unknown"
    or receipt.stage~="await_world" or binding.phase~="execution_unknown"
    or barrier.phase~="consumed" or barrier.operationId~=work.operationId then
    pending=nil;return false end
  work.attempts=work.attempts+1
  local id=work.callback
  local c=api.type.ComponentType
  local clock=api.engine.getComponent(api.engine.util.getWorld(),c.GAME_TIME)
  local speed=api.engine.getComponent(api.engine.util.getWorld(),c.GAME_SPEED)
  if not native(clock) or clock.updateCount~=work.request.scheduledUpdate
    or not native(speed) or speed.speedup~=0 then
    receipt.stage="after_clock";pending=nil;state:set(saved);return false end
  local owner=api.engine.getComponent(id,c.PLAYER_OWNED)
  local name=api.engine.getComponent(id,c.NAME)
  local line=api.engine.getComponent(id,c.LINE)
  if api.engine.entityExists(id)~=true or not native(owner)
    or not native(name) or not native(line) then
    if work.attempts<24 then return false end
    receipt.stage="after_line_missing";pending=nil;state:set(saved);return false end
  if owner.player~=work.request.companyEntity or name.name~=work.request.lineName
    or not sameStops(work.expected,line) then
    receipt.stage="after_line_identity";pending=nil;state:set(saved);return false end
  local found,after=false,{}
  for _,candidate in ipairs(api.engine.system.lineSystem.getLines()) do
    after[candidate]=true
    if candidate==id then found=true
    elseif not work.before[candidate] then
      receipt.stage="after_extra_line";pending=nil;state:set(saved);return false
    end
  end
  if not found then
    if work.attempts<24 then return false end
    receipt.stage="after_line_membership";pending=nil;state:set(saved);return false end
  for prior in pairs(work.before) do
    if not after[prior] then
      receipt.stage="after_prior_line_missing";pending=nil;state:set(saved);return false end
  end
  for i=1,2 do
    local source=i==1 and work.request.stationA or work.request.stationB
    local stationOwner=api.engine.getComponent(source,c.PLAYER_OWNED)
    if not native(stationOwner) or stationOwner.player~=work.request.companyEntity
      or not roadTerminal(api,line.stops[i].stationGroup,
        line.stops[i].station,line.stops[i].terminal) then
      receipt.stage="after_stop_owner_or_carrier";pending=nil;state:set(saved);return false end
  end
  receipt.snapshotVersion=4;receipt.status="ok";receipt.stage=nil;receipt.held=true
  receipt.updateCount=clock.updateCount;receipt.lineEntity=id
  receipt.entity=id
  receipt.ownerCompanyEntity=owner.player
  receipt.stationA=work.request.stationA;receipt.stationB=work.request.stationB
  binding.phase="action_held";saved.phase2CompanyFault=false
  pending=nil;state:set(saved)
  return true
end
return M
