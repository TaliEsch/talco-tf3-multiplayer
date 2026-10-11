import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_line_create_order_action.lua',import.meta.url),'utf8');

function run(change='',callback='callback({},true,{{700,1}})'){
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
    lua.lua_newuserdata(L,0);lua.lua_setglobal(L,to_luastring('nativeEntitiesFixture'));
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
test('stock callback entity pair does not require ICommandData resultEntity',()=>{
  for(const callback of ['callback(nil,true,{{700,1}})',
    'callback({resultEntity=999},true,{{700,1}})']){
    const result=run('',callback);
    assert.equal(result.observed,true);assert.equal(result.status,'ok');
    assert.equal(result.sent,1);assert.equal(result.second,false);
  }
});
test('native userdata callback container retains single-result and world verification',()=>{
  const result=run('',`debug.setmetatable(nativeEntitiesFixture,{
    __len=function()return 1 end,__index=function(_,key)if key==1 then return {700,1} end end
  });callback({},true,nativeEntitiesFixture)`);
  assert.equal(result.status,'ok');assert.equal(result.observed,true);
  assert.equal(result.sent,1);assert.equal(result.second,false);
});
test('invalid callback first entity remains consumed unknown',()=>{
  for(const callback of ['callback({},true,{})',
    'callback({},true,{{0,1}})']){
    const result=run('',callback);
    assert.equal(result.status,'unknown');assert.equal(result.observed,false);
    assert.equal(result.sent,1);assert.equal(result.second,false);
    assert.equal(result.barrier,'consumed');assert.equal(result.fault,true);
  }
});
test('callback container failures identify the rejecting predicate without resend',()=>{
  for(const [callback,stage] of [
    ['callback({},true,nil)','callback_entities_type_nil'],
    ['callback({},true,{})','callback_entities_pair_nil'],
    ['callback({},true,{700})','callback_entities_pair_number'],
    ['callback({},true,{{0,1}})','callback_identity'],
    ['callback({},true,setmetatable({}, {__index=function()error("pair")end}))','callback_entities_pair_access'],
    ['callback({},true,{setmetatable({}, {__index=function()error("id")end})})','callback_identity_access'],
  ]){
    const result=run('',callback);
    assert.equal(result.stage,stage);assert.equal(result.status,'unknown');
    assert.equal(result.observed,false);assert.equal(result.sent,1);
    assert.equal(result.second,false);assert.equal(result.barrier,'consumed');
  }
});
test('stock first-pair identity permits extra result revisions but only one new world line',()=>{
  const callback='callback({},true,{{700,1},{701,1}})';
  const valid=run('',callback);
  assert.equal(valid.status,'ok');assert.equal(valid.observed,true);
  const extra=run('api.engine.system.lineSystem.getLines=function()return sent>0 and {700,701} or {} end',callback);
  assert.equal(extra.status,'unknown');assert.equal(extra.stage,'after_extra_line');
  assert.equal(extra.sent,1);assert.equal(extra.second,false);
});
test('stock first-pair access does not require a native length operation',()=>{
  const result=run('',`debug.setmetatable(nativeEntitiesFixture,{
    __len=function()error('no length contract')end,
    __index=function(_,key)if key==1 then return {700,1} end end
  });callback({},true,nativeEntitiesFixture)`);
  assert.equal(result.status,'ok');assert.equal(result.observed,true);
  assert.equal(result.sent,1);assert.equal(result.second,false);
});
test('first-pair selection never falls back and preserves every prior world line',()=>{
  const wrong=run('', 'callback({},true,{{701,1},{700,1}})');
  assert.equal(wrong.status,'unknown');assert.equal(wrong.observed,false);
  const stale=run('api.engine.system.lineSystem.getLines=function()return sent>0 and {600,700} or {600} end',
    'callback({},true,{{600,1},{700,1}})');
  assert.equal(stale.stage,'callback_identity');assert.equal(stale.status,'unknown');
  const lost=run('api.engine.system.lineSystem.getLines=function()return sent>0 and {700} or {600} end');
  assert.equal(lost.stage,'after_prior_line_missing');assert.equal(lost.status,'unknown');
  for(const result of [wrong,stale,lost]){
    assert.equal(result.sent,1);assert.equal(result.second,false);assert.equal(result.barrier,'consumed');
  }
});
test('changed station owner prevents submission and preserves consumed unknown',()=>{
  assert.deepEqual(run('owner=9',''),{first:false,second:false,observed:false,sent:0,
    status:'unknown',stage:'live_STATION_OWNER_CHANGED',barrier:'consumed',
    phase:'execution_unknown',fault:true});
});

test('line construction assigns detached native stop arrays instead of mutating getters',()=>{
  const result=run(`
local function cloneStops(value)
 local out={}
 for i,stop in ipairs(value)do
  local item={}for key,field in pairs(stop)do item[key]=field end
  out[i]=item
 end
 return out
end
api.type.Line.new=function()
 local stored={}
 return setmetatable({}, {
  __index=function(_,key)if key=='stops'then return cloneStops(stored)end end,
  __newindex=function(_,key,value)assert(key=='stops');stored=cloneStops(value)end})
end
api.engine.system.lineSystem.getBestLineAssignment=function(_,line)
 assert(#line.stops==2,'LINE_STOPS_NOT_ASSIGNED')
 assert(line.stops[1].terminal==-1 and line.stops[2].terminal==-1)
 return {{station=0,terminal=0},{station=0,terminal=0}}
end
`);
  assert.equal(result.first,true);assert.equal(result.sent,1);
  assert.equal(result.observed,true);assert.equal(result.status,'ok');
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
