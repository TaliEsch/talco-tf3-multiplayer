import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
import {encodeAsyncEngineRequest} from '../src/async-engine-mailbox.mjs';
import {ROAD_STOP_MODEL} from '../src/road-stop-order-payload.mjs';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const wire=await readFile(new URL('../mod/content/tf3mp_road_stop_order_wire.lua',import.meta.url),'utf8');
const prepare=await readFile(new URL('../mod/content/tf3mp_road_stop_order_prepare.lua',import.meta.url),'utf8');
const nonce='a'.repeat(32);
const command={protocolVersion:2,hostSequence:1,scheduledUpdate:108,
  originPlayerId:'player-a',targetCompanyEntity:3141,targetEntity:53417,
  commandType:'road.stop.place',payload:{edgeEntity:53417,companyEntity:3141,
    param:0.5,left:true,oneWay:false,model:ROAD_STOP_MODEL,name:'TalCo Road Stop'},
  clientSequence:1,requestMessageId:'road-11'};
const request={schemaVersion:1,roundId:'round',operationId:'prepare',operation:'prepare',command};
const encoded=encodeAsyncEngineRequest(request,nonce);

function run(change=''){
  const script=`local wire=(function() ${wire} end)()
ug_require=function()return wire end
local preparer=(function() ${prepare} end)()
${encoded}
local request=data()
local calls=0;local saved=0
local current={coordinationBinding={nonce='${nonce}',roundId='round',phase='running',
  players={['player-a']=3141},nextSequence=1},watchdogLease={nonce='${nonce}',
  companyEntity=3141,phase='active',lastTick=10,expiresTick=20},
  preparationReceipt={},coordinationReceipt={}}
local state={get=function()return current end,set=function(_,value)saved=saved+1;current=value end}
local road={objects={},node0=31,node1=32};local roadOwner=nil
local api={type={ComponentType={GAME_TIME='GAME_TIME',GAME_SPEED='GAME_SPEED',
  PLAYER='PLAYER',PLAYER_OWNED='PLAYER_OWNED',BASE_EDGE='BASE_EDGE'}},res={modelRep={find=function()return 7 end}},
  engine={util={getWorld=function()return 0 end,getPlayer=function()return 3141 end},
    entityExists=function(id)return id==3141 or id==53417 end,
    getRevision=function()return{num={2}}end,
    getComponent=function(id,kind)
      if kind=='GAME_TIME'then return{tickCount=15,updateCount=100}end
      if kind=='GAME_SPEED'then return{speedup=1}end
      if kind=='PLAYER'and id==3141 then return{}end
      if kind=='BASE_EDGE'and id==53417 then return road end
      if kind=='PLAYER_OWNED'and id==53417 then return roadOwner end
    end}}
${change}
local accepted=preparer.handle(state,request,api)
return accepted,current.preparationReceipt.status or '',current.coordinationBinding.phase,
  current.preparedCommand and current.preparedCommand.capture.param or 0,
  current.preparedCommand and current.preparedCommand.revision or 0,saved,calls`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,7,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {accepted:lua.lua_toboolean(L,-7),status:lua.lua_tojsstring(L,-6),
      phase:lua.lua_tojsstring(L,-5),param:lua.lua_tonumber(L,-4),
      revision:lua.lua_tonumber(L,-3),saved:lua.lua_tonumber(L,-2),calls:lua.lua_tonumber(L,-1)};
  }finally{lua.lua_close(L);}
}

test('road prepare binds the Host sequence and road revision without sending construction',()=>{
  assert.deepEqual(run(),{accepted:true,status:'ok',phase:'prepared',param:0.5,revision:2,saved:2,calls:0});
  assert.equal(run('request.clientSequence=0').accepted,true);
});

test('road prepare rejects cross-company, occupied, stale and malformed requests',()=>{
  for(const change of [
    "request.companyEntity=3142",
    "current.coordinationBinding.players['player-a']=3142",
    "road.objects={{81,1}}",
    "roadOwner={player=3142}",
    "roadOwner={player='invalid'}",
    "current.watchdogLease.expiresTick=15",
    "request.scheduledUpdate=100",
    "request.nameChunkCount=2",
    "current.preparationReceipt={operationId='already-used'}",
    "api.engine.getRevision=function()return nil end",
    "api.res.modelRep.find=function()return -1 end",
  ]){
    const observed=run(change);
    assert.equal(observed.accepted,false,change);
    assert.equal(observed.calls,0,change);
  }
});
test('road prepare accepts public and same-company ownership',()=>{
  assert.equal(run('roadOwner={player=0}').accepted,true);
  assert.equal(run('roadOwner={player=3141}').accepted,true);
});
test('road prepare permits another roster company while local lease stays with the host',()=>{
  const result=run("request.companyEntity=3142;current.coordinationBinding.players['player-a']=3142;roadOwner={player=3142};api.engine.entityExists=function(id)return id==3141 or id==3142 or id==53417 end;local prior=api.engine.getComponent;api.engine.getComponent=function(id,kind)if id==3142 and kind=='PLAYER'then return{}end return prior(id,kind)end");
  assert.equal(result.accepted,true);
  assert.equal(result.status,'ok');
});
