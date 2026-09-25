import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
import {encodeAsyncEngineRequest} from '../src/async-engine-mailbox.mjs';
import {ROAD_DEPOT_RESOURCE} from '../src/depot-build-order-payload.mjs';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const wire=await readFile(new URL('../mod/content/tf3mp_depot_build_order_wire.lua',import.meta.url),'utf8');
const execute=await readFile(new URL('../mod/content/tf3mp_depot_build_order_execute.lua',import.meta.url),'utf8');
const nonce='a'.repeat(32);
const command={protocolVersion:2,hostSequence:1,scheduledUpdate:108,
  originPlayerId:'player-b',targetCompanyEntity:55652,targetEntity:0,
  commandType:'road.depot.build',payload:{companyEntity:55652,resource:ROAD_DEPOT_RESOURCE,
    x:-812.891541,y:-3142.25684,z:23.3068237,yaw:Math.PI,seed:1},
  clientSequence:1,requestMessageId:'depot-11'};
const encoded=encodeAsyncEngineRequest({schemaVersion:1,roundId:'round',
  operationId:'execute',operation:'executeHeld',command},nonce,{enableDepotBuild:true});

function run(change='',outcome='verified',nativeCode='NATIVE_BUILD_ACCOUNTING_VERIFIED'){
  const script=`local wire=(function() ${wire} end)()
local sends=0;local consumedBeforeSend=false
local depot={execute=function(state,intent,binding,consent)
  sends=sends+1
  consumedBeforeSend=state:get().executionBarrier.phase=='consumed'
    and state:get().executionReceipt.status=='unknown'
  return {outcome='${outcome}',code='${nativeCode}',
    constructionEntity=123,depotEntity=124,constructionOwner=55652,depotOwner=55652,
    chargedCost=449160,targetBefore=1000000,targetAfter=550840,
    originalBefore=40000000,originalAfter=40000000}
end}
ug_require=function(name)if name:match('wire')then return wire end return depot end
local executor=(function() ${execute} end)()
${encoded}
local request=data()
local saved=0;local tick=15;local update=100;local speedup=1
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
local state={get=function()return current end,set=function(_,value)saved=saved+1;current=value end}
local api={type={ComponentType={GAME_TIME='GAME_TIME',GAME_SPEED='GAME_SPEED',PLAYER='PLAYER'}},
  res={constructionRep={find=function()return 7 end,getName=function()return '${ROAD_DEPOT_RESOURCE}' end}},
  engine={util={getWorld=function()return 0 end,getPlayer=function()return 3141 end},
    entityExists=function(id)return id==3141 or id==55652 end,
    getComponent=function(id,kind)
      if kind=='GAME_TIME'then return{tickCount=tick,updateCount=update}end
      if kind=='GAME_SPEED'then return{speedup=speedup}end
      if kind=='PLAYER'then return{}end
    end}}
${change}
local armed=executor.arm(state,request,api)
if armed then current.executionBarrier.phase='held';update=108;speedup=0 end
local applied=executor.execute(state,request,api)
  return armed,applied,sends,consumedBeforeSend,current.executionBarrier.phase or '',
  current.executionReceipt.status or '',current.coordinationBinding.phase,saved,
  current.executionReceipt.stage or ''`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,9,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {armed:lua.lua_toboolean(L,-9),applied:lua.lua_toboolean(L,-8),
      sends:lua.lua_tonumber(L,-7),consumedBeforeSend:lua.lua_toboolean(L,-6),
      barrier:lua.lua_tojsstring(L,-5),status:lua.lua_tojsstring(L,-4),
      phase:lua.lua_tojsstring(L,-3),saved:lua.lua_tonumber(L,-2),
      stage:lua.lua_tojsstring(L,-1)};
  }finally{lua.lua_close(L);}
}

test('held depot executes once only after the sequence barrier is consumed',()=>{
  assert.deepEqual(run(),{armed:true,applied:true,sends:1,consumedBeforeSend:true,
    barrier:'consumed',status:'ok',phase:'action_held',saved:4,stage:''});
});

test('depot native unknown stays latched and cannot be resent',()=>{
  const result=run('', 'unknown');
  assert.equal(result.armed,true);
  assert.equal(result.applied,false);
  assert.equal(result.sends,1);
  assert.equal(result.barrier,'consumed');
  assert.equal(result.status,'unknown');
  assert.equal(result.phase,'execution_unknown');
  assert.equal(result.stage,'native_receipt_unknown');
  assert.equal(run('','unknown','NATIVE_REJECTION_REASON_UNVERIFIED').stage,
    'NATIVE_REJECTION_REASON_UNVERIFIED');
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
