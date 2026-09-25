import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_road_stop_outcome.lua',import.meta.url),'utf8');
test('ordered GUI exchange resolves the local userdata helper before use',async()=>{
  const panel=await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl',import.meta.url),'utf8');
  const helper=panel.indexOf('local function userdataExists(');
  const exchange=panel.indexOf('local function exchangeOrderedRoadReadback(');
  assert.ok(helper>=0&&exchange>helper);
  assert.match(panel.slice(exchange,panel.indexOf('local function flushRoadCapture(',exchange)),
    /roadStopOutcome\.probeOrdered\(api, request as table\)/);
});
function runOrdered(change=''){
  const script=`local module=(function() ${source} end)()
local request={schemaVersion=1,kind='ordered_road_readback_request',nonce=string.rep('a',32),
  requestId=3,hostSequence=1,company=10,localCompany=10,sourceRoad=24,road=25,stop=81,
  update=50,balance=53652,balanceNegative=0,localBalance=53652,
  localBalanceNegative=0,charge=46348}
local map={[81]=25};local components={EDGE_OBJECT={[81]={param=.5}},
  PLAYER_OWNED={[81]={player=10}},BASE_EDGE={[25]={objects={{81,1}}}}}
local api={type={ComponentType={EDGE_OBJECT='EDGE_OBJECT',PLAYER_OWNED='PLAYER_OWNED',
  BASE_EDGE='BASE_EDGE',GAME_SPEED='GAME_SPEED',GAME_TIME='GAME_TIME'}},
  engine={entityExists=function(id)return id==81 or id==25 end,
    getComponent=function(id,kind)if id==24 and not components.BASE_EDGE[24]then error('absent entity')end
      if kind=='GAME_SPEED'then return{speedup=0}end
      if kind=='GAME_TIME'then return{updateCount=50}end
      return components[kind] and components[kind][id] end,
    system={streetSystem={getEdgeForEdgeObject=function(id)return map[id] end}},
    util={getWorld=function()return 0 end,getPlayer=function()return 10 end,
      finance={getPlayersBalance=function()return 53652 end}}}}
${change}
local result=module.probeOrdered(api,request)
return result.code,result.stage or ''`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,2,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {code:lua.lua_tojsstring(L,-2),stage:lua.lua_tojsstring(L,-1)};
  }finally{lua.lua_close(L);}
}
test('ordered road readback independently checks held world and rejects mismatches',()=>{
  assert.deepEqual(runOrdered(),{code:'observed',stage:''});
  for(const [change,stage] of [
    ['request.update=51','clock'],
    ["local prior=api.engine.getComponent;api.engine.getComponent=function(id,kind)if kind=='GAME_SPEED'then return{speedup=1}end return prior(id,kind)end",'clock'],
    ['api.engine.util.finance.getPlayersBalance=function()return 1 end','balance'],
    ['request.localBalance=1','local_balance'],
    ['components.BASE_EDGE[24]={objects={}};local prior=api.engine.entityExists;api.engine.entityExists=function(id)if id==24 then return true end return prior(id)end','source_road'],
    ['components.PLAYER_OWNED[81].player=11','stop'],
    ['map[81]=26','attachment'],
  ])assert.deepEqual(runOrdered(change),{code:'unknown',stage});
  assert.deepEqual(runOrdered('request.company=11;request.balance=123;components.PLAYER_OWNED[81].player=11;api.engine.util.finance.getPlayersBalance=function(id)if id==11 then return 123 end return 53652 end'),
    {code:'observed',stage:''});
  assert.deepEqual(runOrdered('request.company=11;request.balance=123;components.PLAYER_OWNED[81].player=11;api.engine.util.finance.getPlayersBalance=function(id)if id==11 then return 123 end return 1 end'),
    {code:'unknown',stage:'local_balance'});
  assert.deepEqual(runOrdered('request.localCompany=11'),{code:'unknown',stage:'clock'});
  assert.deepEqual(runOrdered('request.company=11;components.PLAYER_OWNED[81].player=11;request.balanceNegative=1;api.engine.util.finance.getPlayersBalance=function(id)if id==11 then return -53652 end return 53652 end'),
    {code:'observed',stage:''});
});
function run(change='', includeMissing=false){
  const script=`local module=(function() ${source} end)()
local request={nonce=string.rep('a',32),companyEntity=10,originalEdgeEntity=24,
  model='models/stop.mdl',param=.5,left=true,priorBalance=100000,
  expectedBalance=53652,expectedUpdateCount=50}
local map={[81]=25};local exists={[10]=true,[24]=false,[25]=true,[81]=true}
local geo={node0=31,node1=32,distance=10,
  position0={x=0,y=1,z=2},position1={x=10,y=1,z=2},
  tangent0={x=1,y=0,z=0},tangent1={x=1,y=0,z=0}}
local components={EDGE_OBJECT={[81]={param=.5}},PLAYER_OWNED={[81]={player=10}},
  MODEL_INSTANCE_LIST={[81]={fatInstances={{modelId=7}}}},BASE_EDGE={[25]={objects={{81,1}},
    node0=geo.node0,node1=geo.node1,distance=geo.distance,position0=geo.position0,
    position1=geo.position1,tangent0=geo.tangent0,tangent1=geo.tangent1}}}
local api={type={ComponentType={EDGE_OBJECT='EDGE_OBJECT',PLAYER_OWNED='PLAYER_OWNED',
  MODEL_INSTANCE_LIST='MODEL_INSTANCE_LIST',BASE_EDGE='BASE_EDGE',GAME_SPEED='GAME_SPEED',
  GAME_TIME='GAME_TIME'},enum={EdgeObjectType={STOP_LEFT=1,STOP_RIGHT=2}}},
  res={modelRep={find=function()return 7 end}},
  engine={entityExists=function(id)return exists[id]==true end,
    getComponent=function(id,kind)if kind=='GAME_SPEED'then return{speedup=0}end
      if kind=='GAME_TIME'then return{updateCount=50}end
      return components[kind] and components[kind][id] end,
    system={streetSystem={getEdgeObject2EdgeMap=function()return map end,
      getEdgeForEdgeObject=function(id)return map[id] end}},
    util={getWorld=function()return 0 end,getPlayer=function()return 10 end,
      finance={getPlayersBalance=function()return 53652 end}}}}
${change}
local result=module.probe(api,request)
local road=result.originalRoad or result.stopRoad
return result.code,result.stage or '',result.stopEntity or 0,result.chargedCost or 0,
  road and table.concat(road.missingFields, ',') or ''`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,5,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    const result={code:lua.lua_tojsstring(L,-5),stage:lua.lua_tojsstring(L,-4),stop:lua.lua_tonumber(L,-3),cost:lua.lua_tonumber(L,-2)};
    if(includeMissing) result.missing=lua.lua_tojsstring(L,-1);
    return result;
  }finally{lua.lua_close(L);}
}
test('qualifies one saved, owned and attached stop with native balance delta',()=>{
  assert.deepEqual(run(),{code:'observed',stage:'',stop:81,cost:46348});
});
test('rejects missing, ambiguous, wrong company and wrong attachment',()=>{
  for(const change of [
    'map={}',
    'map[82]=26;exists[82]=true;exists[26]=true;components.EDGE_OBJECT[82]={param=.5};components.PLAYER_OWNED[82]={player=10};components.MODEL_INSTANCE_LIST[82]={fatInstances={{modelId=7}}};components.BASE_EDGE[26]={objects={{82,1}}}',
    'components.PLAYER_OWNED[81].player=11',
    'components.BASE_EDGE[25].objects={{81,2}}',
    'exists[24]=true',
    'request.expectedBalance=100000',
  ]) assert.equal(run(change).code,'unknown',change);
});
test('world refusal identifies the exact check without returning untrusted values',()=>{
  for(const [change,stage] of [
    ['api.engine.util.getWorld=function()return nil end','world_identity'],
    ['api.engine.util.getPlayer=function()return 11 end','world_company'],
    ['api.engine.entityExists=function(id)if id==24 then return nil end return exists[id]==true end','world_original_road'],
    ['api.engine.getComponent=function(id,kind)if kind=="GAME_SPEED"then return{speedup=1}end if kind=="GAME_TIME"then return{updateCount=50}end return components[kind] and components[kind][id] end','world_clock'],
    ['api.engine.util.finance.getPlayersBalance=function()return 1 end','world_balance'],
  ]) assert.deepEqual(run(change),{code:'unknown',stage,stop:0,cost:0},change);
});
test('accepts a replacement road assigned the original ID only when it carries the stop',()=>{
  assert.equal(run('exists[24]=true;map[81]=24;components.BASE_EDGE[24]={objects={{81,1}}}').code,'observed');
  assert.deepEqual(run('exists[24]=true'),{code:'unknown',stage:'original_road_conflict',stop:0,cost:0});
});
test('read-only source and outcome diagnostics report geometry without accepting the result',()=>{
  const source='request.phase="source";map={};exists[24]=true;components.BASE_EDGE[24]={objects={},node0=geo.node0,node1=geo.node1,distance=geo.distance,position0=geo.position0,position1=geo.position1,tangent0=geo.tangent0,tangent1=geo.tangent1};api.engine.util.finance.getPlayersBalance=function()return 100000 end';
  assert.equal(run(source).code,'source_diagnostic');
  assert.deepEqual(run(source+';api.engine.getComponent=function(id,kind)if kind=="GAME_SPEED"then return{speedup=1}end if kind=="GAME_TIME"then return{updateCount=50}end return components[kind] and components[kind][id] end'),{code:'unknown',stage:'world_clock',stop:0,cost:0});
  assert.equal(run(source+';api.engine.util.finance.getPlayersBalance=function()return 99000 end;api.engine.getComponent=function(id,kind)if kind=="GAME_SPEED"then return{speedup=0}end if kind=="GAME_TIME"then return{updateCount=3213}end return components[kind] and components[kind][id] end').code,'source_diagnostic');
  assert.deepEqual(run(source+';components.BASE_EDGE[24].position0=nil',true).missing,'position0');
  assert.equal(run('request.phase="outcome_diagnostic";exists[24]=true').code,'outcome_diagnostic');
  assert.deepEqual(run('request.phase="outcome_diagnostic";components.BASE_EDGE[25].distance=nil',true).missing,'distance');
});
