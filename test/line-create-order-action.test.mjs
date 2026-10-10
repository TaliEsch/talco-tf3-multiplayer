import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_line_create_order_action.lua',import.meta.url),'utf8');

function run(change='',callback='callback({resultEntity=700},true,{{700}})'){
  const script=`local action=(function() ${source} end)()
local sent=0;local callback=nil;local owner=8;local update=108
local current={coordinationBinding={phase='prepared'},executionBarrier={phase='held',operationId='execute-op',hostSequence=1,scheduledUpdate=108},
 preparationReceipt={operation='prepare',operationId='prepare-op',status='ok'},
 preparedCommand={commandType='road.line.create',operationId='prepare-op',hostSequence=1,scheduledUpdate=108,
 companyEntity=8,stationA=101,stationB=102,lineName='TalCo disposable service'}}
local state={get=function()return current end,set=function(_,value)current=value end}
local request={nonce='a',roundId='round',operationId='execute-op',hostSequence=1,scheduledUpdate=108,
 companyEntity=8,stationA=101,stationB=102,lineName='TalCo disposable service'}
local api={type={ComponentType={PLAYER='PLAYER',PLAYER_OWNED='PLAYER_OWNED',STATION='STATION',
 STATION_GROUP='STATION_GROUP',GAME_TIME='GAME_TIME',GAME_SPEED='GAME_SPEED',NAME='NAME',LINE='LINE'},
 ['enum']={Carrier={ROAD=1}},Line={new=function()return{}end,Stop={new=function()return{}end}},
 Vec3f={new=function()return{}end}},
 engine={util={getWorld=function()return 0 end},entityExists=function(id)return id==8 or id==101 or id==102 or id==201 or id==202 or id==700 end,
 getComponent=function(id,kind)
  if kind=='GAME_TIME'then return{updateCount=update}end
  if kind=='GAME_SPEED'then return{speedup=0}end
  if kind=='PLAYER'and id==8 then return{}end
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
local prepared=action.inspect(api,request)
current.preparedCommand.stops=prepared and prepared.stops
${change}
local first=action.send(state,request,api)
local second=action.send(state,request,api)
if callback then ${callback} end
local observed=action.observe(state,api)
return first,second,observed,sent,current.executionReceipt and current.executionReceipt.status or '',
 current.executionReceipt and current.executionReceipt.stage or '',current.executionBarrier.phase,
 current.coordinationBinding.phase,current.phase2CompanyFault`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,9,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {first:lua.lua_toboolean(L,-9),second:lua.lua_toboolean(L,-8),
      observed:lua.lua_toboolean(L,-7),sent:lua.lua_tonumber(L,-6),
      status:lua.lua_tojsstring(L,-5),stage:lua.lua_tojsstring(L,-4),
      barrier:lua.lua_tojsstring(L,-3),phase:lua.lua_tojsstring(L,-2),fault:lua.lua_toboolean(L,-1)};
  }finally{lua.lua_close(L)}
}
test('one held line create is consumed and verified by correlated callback and world',()=>{
  assert.deepEqual(run(),{first:true,second:false,observed:true,sent:1,status:'ok',
    stage:'',barrier:'consumed',phase:'action_held',fault:false});
});
test('changed station owner prevents submission and preserves consumed unknown',()=>{
  assert.deepEqual(run('owner=9',''),{first:false,second:false,observed:false,sent:0,
    status:'unknown',stage:'live_STATION_OWNER_CHANGED',barrier:'consumed',
    phase:'execution_unknown',fault:true});
});
test('callback mismatch cannot verify or replay',()=>{
  const result=run('', 'callback({resultEntity=701},true,{{701}})');
  assert.equal(result.sent,1);assert.equal(result.status,'unknown');
  assert.equal(result.barrier,'consumed');assert.equal(result.fault,true);
});

test('synchronous callback survives detached state snapshots without a second send',()=>{
  const result=run(`
local function copy(value)
 if type(value)~='table' then return value end
 local out={} for key,item in pairs(value) do out[key]=copy(item) end return out
end
state.get=function()return copy(current)end
state.set=function(_,value)current=copy(value)end
api.cmd.sendCommand=function(_,fn)sent=sent+1;fn({resultEntity=700},true,{{700,1}})end
`, '');
  assert.deepEqual(result,{first:true,second:false,observed:true,sent:1,status:'ok',
    stage:'',barrier:'consumed',phase:'action_held',fault:false});
});

test('synchronous native rejection stays unknown and cannot resend',()=>{
  const result=run(`
local function copy(value)
 if type(value)~='table' then return value end
 local out={} for key,item in pairs(value) do out[key]=copy(item) end return out
end
state.get=function()return copy(current)end
state.set=function(_,value)current=copy(value)end
api.cmd.sendCommand=function(_,fn)sent=sent+1;fn({},false,{})end
`, '');
  assert.equal(result.sent,1);assert.equal(result.second,false);
  assert.equal(result.status,'unknown');assert.equal(result.stage,'native_rejected_unknown');
  assert.equal(result.fault,true);
});
