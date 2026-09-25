import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
import {encodeAsyncEngineRequest} from '../src/async-engine-mailbox.mjs';
import {ROAD_DEPOT_RESOURCE} from '../src/depot-build-order-payload.mjs';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const wire=await readFile(new URL('../mod/content/tf3mp_depot_build_order_wire.lua',import.meta.url),'utf8');
const prepare=await readFile(new URL('../mod/content/tf3mp_depot_build_order_prepare.lua',import.meta.url),'utf8');
const nonce='a'.repeat(32);
const command={protocolVersion:2,hostSequence:1,scheduledUpdate:108,
  originPlayerId:'player-b',targetCompanyEntity:55652,targetEntity:0,
  commandType:'road.depot.build',payload:{companyEntity:55652,resource:ROAD_DEPOT_RESOURCE,
    x:-812.891541,y:-3142.25684,z:23.3068237,yaw:Math.PI,seed:1},
  clientSequence:1,requestMessageId:'depot-11'};
const encoded=encodeAsyncEngineRequest({schemaVersion:1,roundId:'round',
  operationId:'prepare',operation:'prepare',command},nonce,{enableDepotBuild:true});

function run(change=''){
  const script=`local wire=(function() ${wire} end)()
ug_require=function()return wire end
local preparer=(function() ${prepare} end)()
${encoded}
local request=data()
local saved=0;local sent=0
local current={coordinationBinding={nonce='${nonce}',roundId='round',phase='running',
  players={['player-b']=55652},nextSequence=1},watchdogLease={nonce='${nonce}',
  companyEntity=3141,phase='active',lastTick=10,expiresTick=20},
  preparationReceipt={},coordinationReceipt={}}
local state={get=function()return current end,set=function(_,value)saved=saved+1;current=value end}
local api={type={ComponentType={GAME_TIME='GAME_TIME',GAME_SPEED='GAME_SPEED',PLAYER='PLAYER'}},
  res={constructionRep={find=function()return 7 end,getName=function()return '${ROAD_DEPOT_RESOURCE}' end}},
  cmd={sendCommand=function()sent=sent+1 end},
  engine={util={getWorld=function()return 0 end,getPlayer=function()return 3141 end},
    entityExists=function(id)return id==3141 or id==55652 end,
    getComponent=function(id,kind)
      if kind=='GAME_TIME'then return{tickCount=15,updateCount=100}end
      if kind=='GAME_SPEED'then return{speedup=1}end
      if kind=='PLAYER'and id==55652 then return{}end
    end}}
${change}
local accepted=preparer.handle(state,request,api)
return accepted,current.preparationReceipt.status or '',current.coordinationBinding.phase,
  current.preparedCommand and current.preparedCommand.intent.x or 0,
  current.preparedCommand and current.preparedCommand.resourceId or 0,saved,sent`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,7,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {accepted:lua.lua_toboolean(L,-7),status:lua.lua_tojsstring(L,-6),
      phase:lua.lua_tojsstring(L,-5),x:lua.lua_tonumber(L,-4),
      resourceId:lua.lua_tonumber(L,-3),saved:lua.lua_tonumber(L,-2),sent:lua.lua_tonumber(L,-1)};
  }finally{lua.lua_close(L);}
}

test('depot preparation binds the separate company and stock resource without submitting construction',()=>{
  assert.deepEqual(run(),{accepted:true,status:'ok',phase:'prepared',x:-812.891541,
    resourceId:7,saved:2,sent:0});
});

test('depot preparation rejects changed company, lease, sequence, resource and prior mutation',()=>{
  for(const change of [
    'request.companyEntity=3141',
    "current.coordinationBinding.players['player-b']=3141",
    'request.entity=1',
    'request.scheduledUpdate=100',
    'current.watchdogLease.expiresTick=15',
    'current.nativeDepotAttempted=true',
    "current.preparationReceipt={operationId='already-used'}",
    'api.engine.entityExists=function()return false end',
    'api.res.constructionRep.find=function()return -1 end',
    'api.res.constructionRep.getName=function()return "changed.con" end',
    'request.xText="100001"',
  ]){
    const observed=run(change);
    assert.equal(observed.accepted,false,change);
    assert.equal(observed.sent,0,change);
  }
});
