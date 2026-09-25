import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_road_stop_simple_result.lua',import.meta.url),'utf8');
function run(change='',preChange=''){
  const script=`local result=(function() ${source} end)()
local input={edgeEntity=24,companyEntity=10,model='models/stop.mdl',left=true,param=.5}
local players={10,11};local stops={80};local balances={[10]=100000,[11]=70000}
local map={}
local exists={[10]=true,[11]=true,[24]=true,[80]=true};local update=50;local calls=0
local geo={node0=31,node1=32,position0={x=0,y=1,z=2},position1={x=10,y=1,z=2},
  tangent0={x=1,y=0,z=0},tangent1={x=1,y=0,z=0}}
local components={PLAYER={ [10]={},[11]={} },BASE_EDGE={
  [24]={objects={},node0=geo.node0,node1=geo.node1,position0=geo.position0,
    position1=geo.position1,tangent0=geo.tangent0,tangent1=geo.tangent1},
  [25]={objects={{81,1}},node0=geo.node0,node1=geo.node1,position0=geo.position0,
    position1=geo.position1,tangent0=geo.tangent0,tangent1=geo.tangent1} },
  PLAYER_OWNED={ [81]={player=10} },EDGE_OBJECT={ [81]={param=.5} },
  MODEL_INSTANCE_LIST={ [81]={fatInstances={{modelId=7}}} }}
local api={type={ComponentType={PLAYER='PLAYER',BASE_EDGE='BASE_EDGE',EDGE_OBJECT='EDGE_OBJECT',
  PLAYER_OWNED='PLAYER_OWNED',MODEL_INSTANCE_LIST='MODEL_INSTANCE_LIST',GAME_SPEED='GAME_SPEED',GAME_TIME='GAME_TIME'},
  enum={EdgeObjectType={STOP_LEFT=1,STOP_RIGHT=2}}},
  res={modelRep={find=function()return 7 end}},
  engine={entityExists=function(id)return exists[id]==true end,
    getComponent=function(id,kind)if kind=='GAME_SPEED'then return{speedup=0}end
      if kind=='GAME_TIME'then return{updateCount=update}end
      return components[kind] and components[kind][id] end,
    getEntitiesWithComponent=function(kind)if kind=='PLAYER'then return players end
      if kind=='EDGE_OBJECT'then return stops end end,
    system={streetSystem={getEdgeObject2EdgeMap=function()return map end,
      getEdgeForEdgeObject=function(id)return map[id] end}},
    util={getWorld=function()return 0 end,getPlayer=function()return 10 end,
      finance={getPlayersBalance=function(id)return balances[id] end}}}}
${preChange}
local before=result.before(api,input,players)
exists[24]=nil;components.BASE_EDGE[24]=nil;exists[25]=true;exists[81]=true;stops={80,81};map[81]=25;balances[10]=32500
local data={resultProposalData={costs=67500},proposal={streetProposal={edgeObjectsToAdd={{resultEntity=81}}}}};local success=true;local entities={{25,1},{81,1}}
${change}
local captured=result.capture(data,success,entities)
local after=result.afterCaptured(api,before,input,captured)
return before.code,after.code,after.stopEntity or 0,after.chargedCost or 0,calls`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,5,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {before:lua.lua_tojsstring(L,-5),after:lua.lua_tojsstring(L,-4),stop:lua.lua_tonumber(L,-3),cost:lua.lua_tonumber(L,-2),calls:lua.lua_tonumber(L,-1)};
  }finally{lua.lua_close(L);}
}

test('correlates one owned stop, replaced road and native debit under the same hold',()=>{
  assert.deepEqual(run(),{before:'observed',after:'verified',stop:81,cost:67500,calls:0});
});
test('bound remote company may place its own stop while the local player differs',()=>{
  assert.deepEqual(run('', 'api.engine.util.getPlayer=function()return 11 end'),
    {before:'observed',after:'verified',stop:81,cost:67500,calls:0});
});
test('accepts the completed proposal exact stop ID when the callback omits that object',()=>{
  assert.deepEqual(run('entities={{25,1}}'),{before:'observed',after:'verified',stop:81,cost:67500,calls:0});
});
test('locates the unique TF3 stop after an empty or scalar callback vector',()=>{
  for(const entities of ['{}','{25,81}','{{25,-1}}']){
    assert.deepEqual(run(`entities=${entities}`),{before:'observed',after:'verified',stop:81,cost:67500,calls:0});
  }
  assert.equal(run('entities={};data.proposal.streetProposal.edgeObjectsToAdd[1].resultEntity=-400000000').after,'verified');
});
test('allows TF3 to reuse the removed road ID for a non-road entity',()=>{
  assert.deepEqual(run('exists[24]=true'),
    {before:'observed',after:'verified',stop:81,cost:67500,calls:0});
});
test('accepts removed source road when TF3 rejects component lookup on its absent ID',()=>{
  const guard=`local originalGet=api.engine.getComponent
api.engine.getComponent=function(id,kind)
  if id==24 and exists[id]~=true then error('missing entity') end
  return originalGet(id,kind)
end`;
  assert.deepEqual(run(guard),{before:'observed',after:'verified',stop:81,cost:67500,calls:0});
});
test('refuses a mismatched replacement road or preexisting stop on the selected geometry',()=>{
  assert.equal(run('components.BASE_EDGE[25].position1={x=11,y=1,z=2}').after,'unknown');
  assert.equal(run('', 'map[80]=25;components.EDGE_OBJECT[80]={param=.5};components.PLAYER_OWNED[80]={player=10};components.MODEL_INSTANCE_LIST[80]={fatInstances={{modelId=7}}};components.BASE_EDGE[25].objects={{80,1}};exists[25]=true').before,'unknown');
  assert.equal(run('map[82]=26;exists[82]=true;exists[26]=true;components.EDGE_OBJECT[82]={param=.5};components.PLAYER_OWNED[82]={player=10};components.MODEL_INSTANCE_LIST[82]={fatInstances={{modelId=7}}};components.BASE_EDGE[26]={objects={{82,1}},node0=31,node1=32,position0=geo.position0,position1=geo.position1,tangent0=geo.tangent0,tangent1=geo.tangent1}').after,'unknown');
});
test('other roads may already have the same model and relative position',()=>{
  const other='map[80]=26;exists[80]=true;exists[26]=true;components.EDGE_OBJECT[80]={param=.5};components.PLAYER_OWNED[80]={player=10};components.MODEL_INSTANCE_LIST[80]={fatInstances={{modelId=7}}};components.BASE_EDGE[26]={objects={{80,1}},node0=31,node1=32,position0={x=99,y=1,z=2},position1=geo.position1,tangent0=geo.tangent0,tangent1=geo.tangent1}';
  assert.deepEqual(run('',other),{before:'observed',after:'verified',stop:81,cost:67500,calls:0});
});
test('callback and state discrepancies remain unknown, without a mutation',()=>{
  for(const change of [
    'success=false','balances[10]=100000','balances[11]=69999','balances[10]=-1',
    'components.PLAYER_OWNED[81].player=11','components.BASE_EDGE[25].objects={{81,2}}',
    'components.MODEL_INSTANCE_LIST[81].fatInstances={{modelId=8}}',
    'components.EDGE_OBJECT[81].param=.3',
    'entities={{25,1}};data.proposal.streetProposal.edgeObjectsToAdd[1].resultEntity=82',
    'entities={{25,1},{81,1},{82,1}};components.EDGE_OBJECT[82]={param=.5}',
    'exists[24]=true;components.BASE_EDGE[24]={}',
    'exists[24]=nil;components.BASE_EDGE[24]={}',
    'update=51','data.resultProposalData.costs=7',
  ]){
    const observed=run(change);
    assert.equal(observed.after,'unknown',change);
    assert.equal(observed.calls,0,change);
  }
});
test('world debit and unique owned Stop qualify incomplete optional callback fields',()=>{
  for(const change of [
    'data.resultProposalData.costs=0',
    'data.resultProposalData=nil',
    'data.proposal.streetProposal.edgeObjectsToAdd={}',
    'entities=nil',
  ]) assert.equal(run(change).after,'verified',change);
});
test('changing the bound road or company between snapshots leaves the outcome unknown',()=>{
  for(const change of ['input.companyEntity=11','input.edgeEntity=25',
    "api.engine.getComponent=function()return nil end"]){
    const observed=run(change);
    assert.equal(observed.after,'unknown',change);
  }
});
test('invalid or moving preconditions cannot form a readback baseline',()=>{
  for(const change of ['input.param=0/0','update=0/0','components.BASE_EDGE[24].objects={{80,1}}',
    'players={10,10}','exists[11]=nil','components.PLAYER[11]=nil']){
    assert.equal(run('',change).before,'unknown',change);
  }
});
