import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const [wire,order]=await Promise.all(['wire','order'].map(part=>readFile(
  new URL(`../mod/content/tf3mp_vehicle_line_assign_${part}.lua`,import.meta.url),'utf8')));
function run(change=''){
  const script=`local wire=(function() ${wire} end)()
ug_require=function()return wire end
local order=(function() ${order} end)()
local sent=0;local callback=nil;local owner=8;local update=100;local assigned=0
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
 entityExists=function(id)return id==7 or id==8 or id==101 or id==102 end,
 getComponent=function(id,kind)
  if kind=='GAME_TIME'then return{updateCount=update,tickCount=15}end
  if kind=='GAME_SPEED'then return{speedup=0}end
  if kind=='PLAYER'and (id==7 or id==8)then return{}end
  if kind=='PLAYER_OWNED'and (id==101 or id==102)then return{player=owner}end
  if kind=='TRANSPORT_VEHICLE'and id==101 then return{carrier=1,line=assigned}end
  if kind=='LINE'and id==102 then return{stops={{stationGroup=201,station=0,terminal=0},
   {stationGroup=202,station=0,terminal=0}}}end
 end,system={lineSystem={getLines=function()return{102}end},
 stationGroupSystem={getCarriers=function()return{{1}}end}}},
 cmd={makeVehicleSetLineCmd=function()return{}end,sendCommand=function(_,fn)sent=sent+1;callback=fn end}}
${change}
local prepared=order.prepare(state,request,api)
request.operation='executeHeld'
local armed=order.arm(state,request,api)
if armed then current.executionBarrier.phase='held' end
update=108
local executed=order.execute(state,request,api)
local duplicate=order.execute(state,request,api)
if callback then assigned=102;callback({},true)end
local observed=order.observe(state,api)
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
