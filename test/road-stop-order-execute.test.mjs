import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
import {encodeAsyncEngineRequest} from '../src/async-engine-mailbox.mjs';
import {ROAD_STOP_MODEL} from '../src/road-stop-order-payload.mjs';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_road_stop_order_execute.lua',import.meta.url),'utf8');
const wire=await readFile(new URL('../mod/content/tf3mp_road_stop_order_wire.lua',import.meta.url),'utf8');
const nonce='a'.repeat(32);
const command={protocolVersion:2,hostSequence:1,scheduledUpdate:108,
  originPlayerId:'player-a',targetCompanyEntity:3141,targetEntity:53417,
  commandType:'road.stop.place',payload:{edgeEntity:53417,companyEntity:3141,
    param:0.5,left:true,oneWay:false,model:ROAD_STOP_MODEL,name:'TalCo Road Stop'},
  clientSequence:1,requestMessageId:'road-11'};
const encoded=encodeAsyncEngineRequest({schemaVersion:1,roundId:'round',operationId:'execute',
  operation:'executeHeld',command},nonce);

function run(change=''){
  const script=`local wire=(function() ${wire} end)()
local sends=0;local saves=0;local callback=nil
local result={before=function()return{code='observed',updateCount=108}end,
 after=function()return{code='verified',stopEntity=73312,edgeEntity=73313,
 chargedCost=46348,updateCount=108}end}
local prep={prepare=function()return{code='prepared',command='native-command'}end}
ug_require=function(name)
 if name:find('order_wire')then return wire end
 if name:find('simple_prepare')then return prep end
 if name:find('simple_result')then return result end
end
local executor=(function() ${source} end)()
${encoded}
local request=data()
local capture=wire.decode(request)
local current={coordinationBinding={nonce='${nonce}',roundId='round',phase='prepared',
 players={['player-a']=3141,['player-b']=3142},nextSequence=1},
 watchdogLease={nonce='${nonce}',companyEntity=3141,phase='active',lastTick=10,expiresTick=20},
 preparationReceipt={status='ok',nonce='${nonce}',roundId='round',ownerCompanyEntity=3141},
 executionReceipt={},coordinationReceipt={},preparedCommand={commandType='road.stop.place',
 hostSequence=1,scheduledUpdate=108,originPlayerId='player-a',companyEntity=3141,
 entity=53417,clientSequence=1,requestMessageId='road-11',modelId=7,revision=2,capture=capture}}
local state={get=function()return current end,set=function(_,value)saves=saves+1;current=value end}
local update=100;local road={node0=31,node1=32,objects={}}
local api={type={ComponentType={GAME_TIME='GAME_TIME',GAME_SPEED='GAME_SPEED',
 PLAYER='PLAYER',BASE_EDGE='BASE_EDGE'}},res={modelRep={find=function()return 7 end}},
 cmd={sendCommand=function(_,fn)sends=sends+1;callback=fn end},
 engine={util={getWorld=function()return 0 end,getPlayer=function()return 3141 end,
 finance={getPlayersBalance=function()return 53652 end}},
 entityExists=function(id)return id==3141 or id==53417 end,
 getRevision=function()return{num={2}}end,
 getComponent=function(id,kind)
  if kind=='GAME_TIME'then return{tickCount=15,updateCount=update}end
  if kind=='GAME_SPEED'then return{speedup=0}end
  if kind=='PLAYER'and id==3141 then return{}end
  if kind=='BASE_EDGE'and id==53417 then return road end
 end}}
${change}
local armed=executor.arm(state,request,api)
if armed then current.executionBarrier.phase='held' end
update=108
local executed=executor.execute(state,request,api)
local consumed=current.executionBarrier and current.executionBarrier.phase or ''
local duplicate=executor.execute(state,request,api)
if callback then callback({},true,{}) end
return armed,executed,duplicate,consumed,current.executionReceipt.status or '',
 current.coordinationBinding.phase,sends,saves,current.executionReceipt.stopEntity or 0`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,9,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {armed:lua.lua_toboolean(L,-9),executed:lua.lua_toboolean(L,-8),
      duplicate:lua.lua_toboolean(L,-7),consumed:lua.lua_tojsstring(L,-6),
      status:lua.lua_tojsstring(L,-5),phase:lua.lua_tojsstring(L,-4),
      sends:lua.lua_tonumber(L,-3),saves:lua.lua_tonumber(L,-2),
      stop:lua.lua_tonumber(L,-1)};
  }finally{lua.lua_close(L);}
}

test('held road execution consumes before one native send and correlates callback receipt',()=>{
  assert.deepEqual(run(),{armed:true,executed:true,duplicate:false,consumed:'consumed',
    status:'ok',phase:'action_held',sends:1,saves:3,stop:73312});
  assert.equal(run('request.clientSequence=0;current.preparedCommand.clientSequence=0').status,'ok');
});
test('changed road, company, revision or receipt cannot authorize native send',()=>{
  for(const change of [
    'request.companyEntity=3142',
    "current.coordinationBinding.players['player-a']=3142",
    'road.objects={{81,1}}',
    'api.engine.getRevision=function()return{num={3}}end',
    "current.preparationReceipt.status='unknown'",
    "current.watchdogLease.expiresTick=15",
  ]){
    const observed=run(change);
    assert.equal(observed.sends,0,change);
    assert.equal(observed.status,'',change);
  }
});
test('unknown callback preserves consumed latch without replay',()=>{
  const observed=run("result.after=function()return{code='unknown'}end");
  assert.equal(observed.armed,true);
  assert.equal(observed.executed,true);
  assert.equal(observed.duplicate,false);
  assert.equal(observed.status,'unknown');
  assert.equal(observed.phase,'execution_unknown');
  assert.equal(observed.sends,1);
});
