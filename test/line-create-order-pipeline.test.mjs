import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const [wire,action,prepare,execute]=await Promise.all([
  'wire','action','prepare','execute'].map(part=>readFile(
    new URL(`../mod/content/tf3mp_line_create_order_${part}.lua`,import.meta.url),'utf8')));

function run(change=''){
  const script=`local wire=(function() ${wire} end)()
local action=(function() ${action} end)()
ug_require=function(path)if path:find('wire')then return wire end return action end
local preparer=(function() ${prepare} end)()
local executor=(function() ${execute} end)()
local sent=0;local callback=nil;local owner=8;local update=100
local current={coordinationBinding={nonce=string.rep('a',32),roundId='round',phase='running',
 players={['remote']=8,['host']=7},nextSequence=1},
 watchdogLease={nonce=string.rep('a',32),companyEntity=7,phase='active',lastTick=10,expiresTick=20},
 coordinationReceipt={},preparationReceipt={},executionReceipt={}}
local state={get=function()return current end,set=function(_,value)current=value end}
local request={schemaVersion=1,protocolVersion=2,operation='prepare',commandType='road.line.create',
 nonce=string.rep('a',32),roundId='round',operationId='op',originPlayerId='remote',
 requestMessageId='msg',hostSequence=1,scheduledUpdate=108,companyEntity=8,
 entity=101,stationB=102,clientSequence=1}
local api={type={ComponentType={PLAYER='PLAYER',PLAYER_OWNED='PLAYER_OWNED',STATION='STATION',
 STATION_GROUP='STATION_GROUP',GAME_TIME='GAME_TIME',GAME_SPEED='GAME_SPEED',NAME='NAME',LINE='LINE'},
 ['enum']={Carrier={ROAD=1}},Line={new=function()return{}end,Stop={new=function()return{}end}},
 Vec3f={new=function()return{}end}},
 engine={util={getWorld=function()return 0 end,getPlayer=function()return 7 end},
 entityExists=function(id)return id==7 or id==8 or id==101 or id==102 or id==201 or id==202 or id==700 end,
 getComponent=function(id,kind)
  if kind=='GAME_TIME'then return{updateCount=update,tickCount=15}end
  if kind=='GAME_SPEED'then return{speedup=0}end
  if kind=='PLAYER'and (id==7 or id==8)then return{}end
  if kind=='PLAYER_OWNED'and (id==101 or id==102 or id==700)then return{player=owner}end
  if kind=='STATION'and (id==101 or id==102)then return{}end
  if kind=='STATION_GROUP'and id==201 then return{stations={101}}end
  if kind=='STATION_GROUP'and id==202 then return{stations={102}}end
  if kind=='NAME'and id==700 then return{name='TalCo disposable service'}end
  if kind=='LINE'and id==700 then return{stops={{stationGroup=201,station=0,terminal=0},
   {stationGroup=202,station=0,terminal=0}}}end
 end,system={stationGroupSystem={getStationGroup=function(id)return id==101 and 201 or 202 end,
 getCarriers=function()return{{1}}end},lineSystem={getBestLineAssignment=function()
 return{{station=0,terminal=0},{station=0,terminal=0}}end,getLines=function()return sent>0 and {700} or {} end}}},
 cmd={makeLineCreateCmd=function()return{}end,sendCommand=function(_,fn)sent=sent+1;callback=fn end}}
${change}
local prepared=preparer.handle(state,request,api)
request.operation='executeHeld'
local armed=executor.arm(state,request,api)
if armed then current.executionBarrier.phase='held' end
update=108
local executed=executor.execute(state,request,api)
local duplicate=executor.execute(state,request,api)
if callback then callback({resultEntity=700},true,{{700}})end
local observed=executor.observe(state,api)
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
test('line preparation, held one-use send and world receipt form one ordered action',()=>{
  assert.deepEqual(run(),{prepared:true,armed:true,executed:true,duplicate:false,
    observed:true,sent:1,status:'ok',stage:'',barrier:'consumed',
    phase:'action_held',line:700});
});
test('foreign station ownership rejects before arming',()=>{
  const result=run('owner=9');
  assert.equal(result.prepared,false);assert.equal(result.armed,false);
  assert.equal(result.sent,0);
});
test('changed player binding rejects held execution',()=>{
  const result=run("local prior=preparer.handle;preparer.handle=function(...)local ok=prior(...);current.coordinationBinding.players['remote']=7;return ok end");
  assert.equal(result.prepared,true);assert.equal(result.armed,false);
  assert.equal(result.sent,0);
});
test('owner changed after preparation consumes the held attempt without native send',()=>{
  const result=run('local prior=executor.arm;executor.arm=function(...)local ok=prior(...);owner=9;return ok end');
  assert.equal(result.prepared,true);assert.equal(result.armed,true);
  assert.equal(result.executed,false);assert.equal(result.duplicate,false);
  assert.equal(result.sent,0);assert.equal(result.status,'unknown');
  assert.equal(result.barrier,'consumed');
});
