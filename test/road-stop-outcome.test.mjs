import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_road_stop_outcome.lua',import.meta.url),'utf8');
function run(change=''){
  const script=`local module=(function() ${source} end)()
local request={nonce=string.rep('a',32),companyEntity=10,originalEdgeEntity=24,
  model='models/stop.mdl',param=.5,left=true,priorBalance=100000,
  expectedBalance=53652,expectedUpdateCount=50}
local map={[81]=25};local exists={[10]=true,[24]=false,[25]=true,[81]=true}
local components={EDGE_OBJECT={[81]={param=.5}},PLAYER_OWNED={[81]={player=10}},
  MODEL_INSTANCE_LIST={[81]={fatInstances={{modelId=7}}}},BASE_EDGE={[25]={objects={{81,1}}}}}
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
return result.code,result.stage or '',result.stopEntity or 0,result.chargedCost or 0`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,4,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {code:lua.lua_tojsstring(L,-4),stage:lua.lua_tojsstring(L,-3),stop:lua.lua_tonumber(L,-2),cost:lua.lua_tonumber(L,-1)};
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
