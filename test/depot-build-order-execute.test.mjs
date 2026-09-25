import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
import {encodeAsyncEngineRequest} from '../src/async-engine-mailbox.mjs';
import {ROAD_DEPOT_RESOURCE} from '../src/depot-build-order-payload.mjs';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const wire=await readFile(new URL('../mod/content/tf3mp_depot_build_order_wire.lua',import.meta.url),'utf8');
const executor=await readFile(new URL('../mod/content/tf3mp_depot_build_order_execute.lua',import.meta.url),'utf8');
const nonce='a'.repeat(32);
const command={protocolVersion:2,hostSequence:1,scheduledUpdate:108,
  originPlayerId:'player-b',targetCompanyEntity:55652,targetEntity:0,
  commandType:'road.depot.build',payload:{companyEntity:55652,resource:ROAD_DEPOT_RESOURCE,
    x:-812.891541,y:-3142.25684,z:23.3068237,yaw:Math.PI,seed:1},
  clientSequence:1,requestMessageId:'depot-11'};
const encoded=encodeAsyncEngineRequest({schemaVersion:1,roundId:'round',
  operationId:'execute',operation:'executeHeld',command},nonce,{enableDepotBuild:true});

function run(change='',after=''){
  const script=`local wire=(function() ${wire} end)()
local sends=0;local callback=nil;local built=false;local target=1000000
local depot={prepare=function(intent,binding)
  assert(intent.companyEntity==nil and binding.targetCompany==55652)
  local count=0
  for key in pairs(intent) do
    assert(key=='resource' or key=='x' or key=='y' or key=='z' or key=='yaw' or key=='seed')
    count=count+1
  end
  assert(count==6 and intent.resource=='${ROAD_DEPOT_RESOURCE}')
  return {proposal=true}
end}
ug_require=function(name)if name:match('wire')then return wire end return depot end
local executor=(function() ${executor} end)()
${encoded}
local request=data();local tick=15;local update=100;local speedup=1
local current={coordinationBinding={nonce='${nonce}',roundId='round',phase='prepared',
  players={['player-b']=55652},nextSequence=1},watchdogLease={nonce='${nonce}',
  companyEntity=3141,phase='active',lastTick=10,expiresTick=20},
  preparationReceipt={nonce='${nonce}',roundId='round',status='ok',ownerCompanyEntity=55652},
  coordinationReceipt={},executionReceipt={},executionBarrier={},
  preparedCommand={commandType='road.depot.build',hostSequence=1,scheduledUpdate=108,
    originPlayerId='player-b',companyEntity=55652,entity=0,clientSequence=1,
    requestMessageId='depot-11',resourceId=7,intent={companyEntity=55652,
      resource='${ROAD_DEPOT_RESOURCE}',x=-812.891541,y=-3142.25684,
      z=23.3068237,yaw=math.pi,seed=1}}}
local state={get=function()return current end,set=function(_,value)current=value end}
local api={type={ComponentType={GAME_TIME='GAME_TIME',GAME_SPEED='GAME_SPEED',
  PLAYER='PLAYER',CONSTRUCTION='CONSTRUCTION',VEHICLE_DEPOT='VEHICLE_DEPOT',
  PLAYER_OWNED='PLAYER_OWNED'}},
  res={constructionRep={find=function()return 7 end,getName=function()return '${ROAD_DEPOT_RESOURCE}' end}},
  cmd={sendCommand=function(_,fn)sends=sends+1;callback=fn end},
  engine={util={getWorld=function()return 0 end,getPlayer=function()return 3141 end,
    finance={getPlayersBalance=function(id)if id==3141 then return 40000000 end return target end}},
    entityExists=function(id)return id==3141 or id==55652 end,
    getEntitiesWithComponent=function(kind)
      if kind=='CONSTRUCTION'then if built then return {11,123}end return {11}end
      if kind=='VEHICLE_DEPOT'then if built then return {12,124}end return {12}end
      return {} end,
    getComponent=function(id,kind)
      if kind=='GAME_TIME'then return{tickCount=tick,updateCount=update}end
      if kind=='GAME_SPEED'then return{speedup=speedup}end
      if kind=='PLAYER'then return{}end
      if built and id==123 and kind=='CONSTRUCTION'then
        return{fileName='${ROAD_DEPOT_RESOURCE}',depots={124}}end
      if built and id==123 and kind=='PLAYER_OWNED'then return{player=55652}end
      if built and id==124 and kind=='VEHICLE_DEPOT'then return{}end
      if built and id==124 and kind=='PLAYER_OWNED'then return{player=55652}end
    end}}
${change}
local armed=executor.arm(state,request,api)
if armed then current.executionBarrier.phase='held';update=108;speedup=0 end
local submitted=executor.execute(state,request,api)
local duplicate=executor.execute(state,request,api)
local firstStage=current.executionReceipt.stage or ''
${after}
return armed,submitted,duplicate,sends,firstStage,current.executionReceipt.status or '',
  current.executionReceipt.stage or '',current.coordinationBinding.phase,
  current.executionReceipt.depotEntity or 0,current.nativeDepotAttempted==true,
  current.phase2CompanyFault==true`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,11,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {armed:lua.lua_toboolean(L,-11),submitted:lua.lua_toboolean(L,-10),
      duplicate:lua.lua_toboolean(L,-9),sends:lua.lua_tonumber(L,-8),
      firstStage:lua.lua_tojsstring(L,-7),status:lua.lua_tojsstring(L,-6),
      stage:lua.lua_tojsstring(L,-5),phase:lua.lua_tojsstring(L,-4),
      depotEntity:lua.lua_tonumber(L,-3),attempted:lua.lua_toboolean(L,-2),
      fault:lua.lua_toboolean(L,-1)};
  }finally{lua.lua_close(L);}
}

test('depot callback and observed world commit complete one held ordered build',()=>{
  const result=run('',`callback({resultProposalData={costs=449160}},true,{{123,1}})
local early=executor.observe(state,api)
target=550840;built=true;local observed=executor.observe(state,api)`);
  assert.deepEqual(result,{armed:true,submitted:true,duplicate:false,sends:1,
    firstStage:'await_callback',status:'ok',stage:'',phase:'action_held',
    depotEntity:124,attempted:true,fault:false});
});

test('missing and rejected callbacks remain latched without a second send',()=>{
  for(const after of ['',`callback({},false,{})`,`current.haltTestAttempted=true
callback({resultProposalData={costs=449160}},true,{{123,1}})`]){
    const result=run('',after);
    assert.equal(result.armed,true);
    assert.equal(result.submitted,true);
    assert.equal(result.duplicate,false);
    assert.equal(result.sends,1);
    assert.equal(result.status,'unknown');
    assert.equal(result.phase,'execution_unknown');
    assert.equal(result.attempted,true);
    assert.equal(result.fault,true);
  }
});

test('changed company, roster, placement and lease never reach native send',()=>{
  for(const change of [
    'request.companyEntity=3141',
    "current.coordinationBinding.players['player-b']=3141",
    "current.preparedCommand.intent.resource='changed.con'",
    'request.xText="100001"',
    'current.watchdogLease.expiresTick=15',
    'current.nativeDepotAttempted=true',
    'current.preparationReceipt.ownerCompanyEntity=3141',
    'api.res.constructionRep.find=function()return -1 end',
  ]){
    const result=run(change);
    assert.equal(result.armed,false,change);
    assert.equal(result.sends,0,change);
  }
});
