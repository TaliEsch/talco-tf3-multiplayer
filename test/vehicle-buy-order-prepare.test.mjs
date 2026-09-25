import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const wire=await readFile(new URL('../mod/content/tf3mp_vehicle_buy_order_wire.lua',import.meta.url),'utf8');
const prepare=await readFile(new URL('../mod/content/tf3mp_vehicle_buy_order_prepare.lua',import.meta.url),'utf8');
const nonce='a'.repeat(32);
const model='::/vehicle/bus/example.mdl';

function run(change=''){
  const script=`local wire=(function() ${wire} end)()
ug_require=function()return wire end
local preparer=(function() ${prepare} end)()
local request={schemaVersion=1,protocolVersion=2,nonce='${nonce}',roundId='round',
  operationId='prepare',operation='prepare',hostSequence=1,scheduledUpdate=108,
  originPlayerId='player-b',companyEntity=55652,entity=73803,
  commandType='road.vehicle.buy',model='${model}',clientSequence=1,
  requestMessageId='vehicle-11'}
local saved=0;local sends=0
local current={coordinationBinding={nonce='${nonce}',roundId='round',phase='running',
  players={['player-b']=55652},nextSequence=1},watchdogLease={nonce='${nonce}',
  companyEntity=3141,phase='active',lastTick=10,expiresTick=20},
  preparationReceipt={},coordinationReceipt={}}
local state={get=function()return current end,set=function(_,value)saved=saved+1;current=value end}
local api={type={ComponentType={GAME_TIME='GAME_TIME',GAME_SPEED='GAME_SPEED',PLAYER='PLAYER',
  PLAYER_OWNED='PLAYER_OWNED',VEHICLE_DEPOT='VEHICLE_DEPOT'},['enum']={Carrier={ROAD=2}}},
  res={modelRep={find=function()return 7 end,getName=function()return '${model}' end,
    get=function()return{metadata={transportVehicle={carrier=2},cost={price=449160}}}end}},
  cmd={sendCommand=function()sends=sends+1 end},
  engine={util={getWorld=function()return 0 end,getPlayer=function()return 3141 end,
    finance={getPlayersBalance=function()return 1000000 end}},
    entityExists=function(id)return id==3141 or id==55652 or id==73803 end,
    getComponent=function(id,kind)
      if kind=='GAME_TIME'then return{tickCount=15,updateCount=100}end
      if kind=='GAME_SPEED'then return{speedup=1}end
      if kind=='PLAYER'and(id==3141 or id==55652)then return{}end
      if id==73803 and kind=='PLAYER_OWNED'then return{player=55652}end
      if id==73803 and kind=='VEHICLE_DEPOT'then return{carrier=2}end
    end}}
${change}
local accepted=preparer.handle(state,request,api)
return accepted,current.preparationReceipt.status or '',current.coordinationBinding.phase,
  current.preparedCommand and current.preparedCommand.modelId or 0,saved,sends`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,6,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {accepted:lua.lua_toboolean(L,-6),status:lua.lua_tojsstring(L,-5),
      phase:lua.lua_tojsstring(L,-4),modelId:lua.lua_tonumber(L,-3),
      saved:lua.lua_tonumber(L,-2),sends:lua.lua_tonumber(L,-1)};
  }finally{lua.lua_close(L);}
}

test('purchase preparation binds owner, road depot and priced model without a native send',()=>{
  assert.deepEqual(run(),{accepted:true,status:'ok',phase:'prepared',modelId:7,saved:2,sends:0});
});

test('purchase preparation rejects changed owner, company, model, price and funding',()=>{
  for(const change of [
    'request.companyEntity=3141',
    "current.coordinationBinding.players['player-b']=3141",
    "request.model='::/vehicle/bus/other.mdl'",
    'request.scheduledUpdate=100',
    'current.watchdogLease.expiresTick=15',
    'current.nativeVehicleAttempted=true',
    "current.preparationReceipt={operationId='already-used'}",
    'api.engine.entityExists=function()return false end',
    "api.engine.getComponent=function(id,kind)if kind=='PLAYER_OWNED'then return{player=3141}end return{}end",
    "api.res.modelRep.getName=function()return 'changed.mdl'end",
    "api.res.modelRep.get=function()return{metadata={transportVehicle={carrier=3},cost={price=449160}}}end",
    'api.engine.util.finance.getPlayersBalance=function()return 100 end',
    'request.extra=true',
  ]){
    const observed=run(change);
    assert.equal(observed.accepted,false,change);
    assert.equal(observed.sends,0,change);
  }
});
