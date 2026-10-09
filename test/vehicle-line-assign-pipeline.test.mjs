import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const [wire,order]=await Promise.all(['wire','order'].map(part=>readFile(
  new URL(`../mod/content/tf3mp_vehicle_line_assign_${part}.lua`,import.meta.url),'utf8')));
const status=await readFile(new URL('../mod/content/tf3mp_status.script.tl',import.meta.url),'utf8');
const releaseStart=status.indexOf('    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_release_checkpoint"');
const releaseEnd=status.indexOf('    if src == "tf3mp_status_1::/tf3mp_status.gs"',releaseStart+8);
assert.ok(releaseStart>=0&&releaseEnd>releaseStart);
const releaseHandler=status.slice(releaseStart,releaseEnd)
  .replaceAll(' as table','').replaceAll(' : integer','')
  .replaceAll(' as integer','').replaceAll(' as Engine.Component.GameSpeed','')
  .replaceAll(' as string','').replaceAll(' : string','').replaceAll(' : table','')
  .replace('_coordinationReleaseData : GameSetSpeedCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}}',
    '_coordinationReleaseData, success, _entities');
function run(change='',afterObserve=''){
  const script=`local wire=(function() ${wire} end)()
ug_require=function()return wire end
local order=(function() ${order} end)()
local sent=0;local callback=nil;local owner=8;local update=100;local assigned=0;local speedup=0;local resumes=0;local resumeSuccess=true
local current={coordinationBinding={nonce=string.rep('a',32),roundId='round',phase='running',
 players={['remote']=8,['host']=7},nextSequence=1},
 watchdogLease={nonce=string.rep('a',32),companyEntity=7,phase='active',lastTick=10,expiresTick=20},
 coordinationReceipt={},preparationReceipt={},executionReceipt={}}
local state={get=function()return current end,set=function(_,value)current=value end}
local request={schemaVersion=1,protocolVersion=2,operation='prepare',commandType='road.vehicle.assignLine',
 nonce=string.rep('a',32),roundId='round',operationId='op',originPlayerId='remote',
 requestMessageId='msg',hostSequence=1,scheduledUpdate=108,companyEntity=8,
 entity=101,lineEntity=102,clientSequence=1}
local api={type={ComponentType={PLAYER='PLAYER',PLAYER_OWNED='PLAYER_OWNED',
 TRANSPORT_VEHICLE='TRANSPORT_VEHICLE',LINE='LINE',GAME_TIME='GAME_TIME',GAME_SPEED='GAME_SPEED'},
 ['enum']={Carrier={ROAD=1}}},engine={util={getWorld=function()return 0 end,getPlayer=function()return 7 end},
 entityExists=function(id)return id==7 or id==8 or id==101 or id==102 or id==103 end,
 getComponent=function(id,kind)
  if kind=='GAME_TIME'then return{updateCount=update,tickCount=15}end
  if kind=='GAME_SPEED'then return{speedup=speedup}end
  if kind=='PLAYER'and (id==7 or id==8)then return{}end
  if kind=='PLAYER_OWNED'and (id==101 or id==102 or id==103)then return{player=owner}end
  if kind=='TRANSPORT_VEHICLE'and id==101 then return{carrier=1,line=assigned}end
  if kind=='TRANSPORT_VEHICLE'and id==103 then return{carrier=1,line=0}end
  if kind=='LINE'and id==102 then return{stops={{stationGroup=201,station=0,terminal=0},
   {stationGroup=202,station=0,terminal=0}}}end
 end,system={lineSystem={getLines=function()return{102}end},
 stationGroupSystem={getCarriers=function()return{{1}}end}}},
 cmd={makeVehicleSetLineCmd=function()return{}end,makeGameSetSpeedCmd=function(target)return{releaseSpeed=target}end,
 sendCommand=function(command,fn)if command.releaseSpeed then resumes=resumes+1;if resumeSuccess then speedup=command.releaseSpeed end;fn({},resumeSuccess);else sent=sent+1;callback=fn end end}}
${change}
local prepared=order.prepare(state,request,api)
request.operation='executeHeld'
request.operationId='execute-op'
local armed=order.arm(state,request,api)
if armed then current.executionBarrier.phase='held' end
update=108
local executed=order.execute(state,request,api)
local duplicate=order.execute(state,request,api)
if callback then assigned=102;callback({},true)end
local observed=order.observe(state,api)
${afterObserve}
return prepared,armed,executed,duplicate,observed,sent,
 current.executionReceipt.status or '',current.executionReceipt.stage or '',
 current.executionBarrier and current.executionBarrier.phase or '',
 current.coordinationBinding.phase,current.executionReceipt.lineEntity or 0`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,11,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {prepared:lua.lua_toboolean(L,-11),armed:lua.lua_toboolean(L,-10),
      executed:lua.lua_toboolean(L,-9),duplicate:lua.lua_toboolean(L,-8),
      observed:lua.lua_toboolean(L,-7),sent:lua.lua_tonumber(L,-6),
      status:lua.lua_tojsstring(L,-5),stage:lua.lua_tojsstring(L,-4),
      barrier:lua.lua_tojsstring(L,-3),phase:lua.lua_tojsstring(L,-2),
      line:lua.lua_tonumber(L,-1)};
  }finally{lua.lua_close(L)}
}
test('one held assignment gets one send and observed world receipt',()=>{
  assert.deepEqual(run(),{prepared:true,armed:true,executed:true,duplicate:false,
    observed:true,sent:1,status:'ok',stage:'',barrier:'consumed',phase:'action_held',line:102});
});
test('selected owner can assign its own vehicle through the held path',()=>{
  const result=run('api.engine.util.getPlayer=function()return 8 end;current.watchdogLease.companyEntity=8');
  assert.equal(result.prepared,true);assert.equal(result.observed,true);assert.equal(result.sent,1);
});
test('foreign ownership blocks preparation',()=>{
  const result=run('owner=9');
  assert.equal(result.prepared,false);assert.equal(result.armed,false);assert.equal(result.sent,0);
});
test('ownership change after preparation consumes the attempt before native send',()=>{
  const result=run('local prior=order.arm;order.arm=function(...)local ok=prior(...);owner=9;return ok end');
  assert.equal(result.prepared,true);assert.equal(result.armed,true);
  assert.equal(result.executed,false);assert.equal(result.duplicate,false);
  assert.equal(result.sent,0);assert.equal(result.status,'unknown');assert.equal(result.barrier,'consumed');
});
function releaseProbe(mode){
  return `
assert(prepared and armed and executed and observed)
assert(current.preparedCommand.nonce==nil and current.preparedCommand.roundId==nil)
assert(current.preparedCommand.operationId=='op' and current.executionReceipt.operationId=='execute-op')
local old={};for key,value in pairs(request)do old[key]=value end
assert(order.qualifyRelease(current)==true)
local originalPreparation=current.preparationReceipt
local originalExecution=current.executionReceipt
local originalBarrier=current.executionBarrier
current.nativeLineOrderAttempted=true -- An unrelated diagnostic latch must survive.
local validInteger=function(value)return type(value)=='number' and value>=0 and value%1==0 end
local readClock=function()return{updateCount=update,tickCount=15}end
local lineCreateOrderExecute={qualifyRelease=function()return false end}
local vehicleLineAssignOrder=order
local function release(param)
  local src='tf3mp_status_1::/tf3mp_status.gs'
  local id='tf3mp_engine_bridge'
  local name='tf3mp_release_checkpoint'
  ${releaseHandler}
end
local releaseRequest={schemaVersion=1,nonce=string.rep('a',32),roundId='round',
 operationId='release-op',operation='release',updateCount=108}
if '${mode}'=='unknown' then current.executionReceipt.status='unknown' end
if '${mode}'=='corrupt' then current.executionReceipt.lineOwnerCompanyEntity=9 end
if '${mode}'=='failed' then resumeSuccess=false end
if '${mode}'=='schema' then current.preparationReceipt.schemaVersion=2 end
if '${mode}'=='time' then current.preparationReceipt.updateCount=108 end
if '${mode}'=='origin' then current.coordinationBinding.players.remote=9 end
if '${mode}'=='occupied' then current.completedLineActionReleases={[''..string.rep('a',32)..':1']={status='prior'}} end
release(releaseRequest)
assert(current.executionBarrier.phase=='consumed' and current.executionBarrier.operationId=='execute-op')
assert(current.nativeLineOrderAttempted==true)
if '${mode}'=='success' then
 assert(resumes==1 and current.releaseReceipt.status=='ok' and current.coordinationBinding.phase=='running')
 assert(current.coordinationBinding.nextSequence==2 and current.nativeVehicleLineAssignAttempted==false)
 assert(next(current.preparedCommand)==nil and next(current.preparationReceipt)==nil and next(current.executionReceipt)==nil)
 local key=string.rep('a',32)..':1'
 local archived=current.completedLineActionReleases[key]
 assert(archived.commandType=='road.vehicle.assignLine' and archived.prepareOperationId=='op')
 assert(archived.preparationReceipt.status=='ok' and archived.executionReceipt.operationId=='execute-op')
 assert(archived.executionBarrier.phase=='consumed' and archived.releaseReceipt.status=='ok')
 assert(archived.nextSequence==2 and archived.actualSpeedup==1)
 assert(archived.preparationReceipt~=originalPreparation and archived.executionReceipt~=originalExecution)
 assert(archived.executionBarrier~=originalBarrier and archived.releaseReceipt~=current.releaseReceipt)
 originalExecution.operationId='changed-after-release';originalBarrier.phase='changed-after-release'
 assert(archived.executionReceipt.operationId=='execute-op' and archived.executionBarrier.phase=='consumed')
 originalBarrier.phase='consumed'
 assert(order.execute(state,old,api)==false)
 update=109
 request.hostSequence=2;request.scheduledUpdate=117;request.operation='prepare'
 request.operationId='op-2';request.requestMessageId='msg-2';request.clientSequence=2;request.entity=103
 assert(order.prepare(state,request,api)==true)
 request.operation='executeHeld';request.operationId='execute-op-2'
 assert(order.arm(state,request,api)==true)
 current.executionBarrier.phase='held';speedup=0;update=117
 assert(order.execute(state,request,api)==true and sent==2)
 assert(order.execute(state,old,api)==false)
 local function copy(value)
  if type(value)~='table' then return value end
  local result={};for k,v in pairs(value)do result[copy(k)]=copy(v) end;return result
 end
 state:set(copy(current));current=state:get() -- Simulate persisted state reloaded into new tables.
 assert(current.completedLineActionReleases[key].executionBarrier.phase=='consumed')
 assert(current.completedLineActionReleases[key].executionReceipt.operationId=='execute-op')
 assert(current.completedLineActionReleases[key].releaseReceipt.status=='ok')
 assert(current.executionBarrier.operationId=='execute-op-2')
 assert(order.execute(state,old,api)==false and sent==2)
else
 if '${mode}'=='failed' then
  assert(resumes==1 and current.releaseReceipt.status=='unknown' and current.coordinationBinding.phase=='release_unknown')
 else assert(resumes==0 and current.coordinationBinding.phase=='action_held') end
 assert(current.nativeVehicleLineAssignAttempted==true and current.coordinationBinding.nextSequence==1)
 assert(current.preparedCommand.operationId=='op' and current.executionBarrier.phase=='consumed')
 if '${mode}'=='occupied' then assert(current.completedLineActionReleases[string.rep('a',32)..':1'].status=='prior')
 else assert((current.completedLineActionReleases or {})[string.rep('a',32)..':1']==nil) end
 assert(order.execute(state,old,api)==false)
 local nextRequest={};for key,value in pairs(request)do nextRequest[key]=value end
 nextRequest.operation='prepare';nextRequest.operationId='op-2';nextRequest.hostSequence=2
 nextRequest.scheduledUpdate=117;nextRequest.clientSequence=2;nextRequest.requestMessageId='msg-2';nextRequest.entity=103
 assert(order.prepare(state,nextRequest,api)==false and sent==1)
end
`;
}
for(const mode of ['success','unknown','corrupt','failed','schema','time','origin','occupied']){
  test(`vehicle assignment release composition: ${mode}`,()=>{
    const result=run('',releaseProbe(mode));
    assert.equal(result.observed,true);
    assert.equal(result.sent,mode==='success'?2:1);
  });
}
