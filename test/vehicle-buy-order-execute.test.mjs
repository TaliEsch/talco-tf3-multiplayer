import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const wire=await readFile(new URL('../mod/content/tf3mp_vehicle_buy_order_wire.lua',import.meta.url),'utf8');
const executor=await readFile(new URL('../mod/content/tf3mp_vehicle_buy_order_execute.lua',import.meta.url),'utf8');
const nonce='a'.repeat(32);
const model='::/vehicle/bus/example.mdl';

function run(change='',after=''){
  const script=`local wire=(function() ${wire} end)()
local sends=0;local callback=nil;local built=false;local target=1000000
local adapter={prepare=function(intent,binding)
  assert(intent.model=='${model}' and binding.targetCompany==55652
    and binding.originalCompany==3141 and binding.depotEntity==73803
    and binding.modelResource=='${model}')
  return {buy=true},449160,7
end}
ug_require=function(name) if name:match('order_wire') then return wire end return adapter end
local executor=(function() ${executor} end)()
local request={schemaVersion=1,protocolVersion=2,nonce='${nonce}',roundId='round',
  operationId='execute',operation='executeHeld',hostSequence=1,scheduledUpdate=108,
  originPlayerId='player-b',companyEntity=55652,entity=73803,
  commandType='road.vehicle.buy',model='${model}',clientSequence=1,
  requestMessageId='vehicle-11'}
local tick=15;local update=100;local speedup=1
local current={coordinationBinding={nonce='${nonce}',roundId='round',phase='prepared',
  players={['player-b']=55652},nextSequence=1},watchdogLease={nonce='${nonce}',
  companyEntity=3141,phase='active',lastTick=10,expiresTick=20},
  preparationReceipt={nonce='${nonce}',roundId='round',status='ok',ownerCompanyEntity=55652},
  coordinationReceipt={},executionReceipt={},executionBarrier={},
  preparedCommand={commandType='road.vehicle.buy',hostSequence=1,scheduledUpdate=108,
    originPlayerId='player-b',companyEntity=55652,entity=73803,clientSequence=1,
    requestMessageId='vehicle-11',modelId=7,intent={companyEntity=55652,
      depotEntity=73803,model='${model}'}}}
local state={get=function()return current end,set=function(_,value)current=value end}
local api={type={ComponentType={GAME_TIME='GAME_TIME',GAME_SPEED='GAME_SPEED',
  PLAYER='PLAYER',VEHICLE_DEPOT='VEHICLE_DEPOT',PLAYER_OWNED='PLAYER_OWNED',
  TRANSPORT_VEHICLE='TRANSPORT_VEHICLE'},['enum']={Carrier={ROAD=2}}},
  res={modelRep={getName=function()return '${model}' end}},
  cmd={sendCommand=function(_,fn)sends=sends+1;callback=fn end},
  engine={util={getWorld=function()return 0 end,getPlayer=function()return 3141 end,
    finance={getPlayersBalance=function(id)if id==3141 then return 40000000 end return target end}},
    entityExists=function(id)return id==3141 or id==55652 or id==73803 or built and id==123 end,
    getEntitiesWithComponent=function(kind)
      if kind=='TRANSPORT_VEHICLE' then if built then return {11,123} end return {11} end
      return {} end,
    getComponent=function(id,kind)
      if kind=='GAME_TIME'then return{tickCount=tick,updateCount=update}end
      if kind=='GAME_SPEED'then return{speedup=speedup}end
      if kind=='PLAYER'then return{}end
      if id==73803 and kind=='VEHICLE_DEPOT'then return{carrier=2}end
      if id==73803 and kind=='PLAYER_OWNED'then return{player=55652}end
      if built and id==123 and kind=='TRANSPORT_VEHICLE'then
        return{carrier=2,depot=73803,transportVehicleConfig={vehicles={{part={modelId=7}}},vehicleGroups={1}}}end
      if built and id==123 and kind=='PLAYER_OWNED'then return{player=55652}end
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
  current.executionReceipt.vehicleEntity or 0,current.nativeVehicleAttempted==true,
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
      vehicleEntity:lua.lua_tonumber(L,-3),attempted:lua.lua_toboolean(L,-2),
      fault:lua.lua_toboolean(L,-1)};
  }finally{lua.lua_close(L);}
}

test('held vehicle callback and observed world debit complete one ordered buy',()=>{
  const result=run('',`callback({resultVehicleEntity=123},true,{{123,1}})
local early=executor.observe(state,api)
target=550840;built=true;local observed=executor.observe(state,api)`);
  assert.deepEqual(result,{armed:true,submitted:true,duplicate:false,sends:1,
    firstStage:'await_callback',status:'ok',stage:'',phase:'action_held',
    vehicleEntity:123,attempted:true,fault:false});
});

test('missing, rejected and malformed callbacks keep the purchase latch',()=>{
  for(const after of ['',`callback({},false,{})`,`callback({resultVehicleEntity=123},true,{})`,
    `current.haltTestAttempted=true\ncallback({resultVehicleEntity=123},true,{{123,1}})`]){
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

test('wrong debit never verifies a callback-confirmed vehicle',()=>{
  const result=run('',`callback({resultVehicleEntity=123},true,{{123,1}})
target=900000;built=true;executor.observe(state,api)`);
  assert.equal(result.status,'unknown');
  assert.equal(result.stage,'after_debit');
  assert.equal(result.fault,true);
});

test('changed owner, model, roster, lease and company fault prevent native send',()=>{
  for(const change of [
    'request.companyEntity=3141',
    "current.coordinationBinding.players['player-b']=3141",
    "current.preparedCommand.intent.model='changed.mdl'",
    "request.model='::/vehicle/bus/other.mdl'",
    'current.watchdogLease.expiresTick=15',
    'current.nativeVehicleAttempted=true',
    'current.preparationReceipt.ownerCompanyEntity=3141',
    "api.engine.getComponent=function(id,kind)if kind=='PLAYER_OWNED'then return{player=3141}end return{}end",
  ]){
    const result=run(change);
    assert.equal(result.armed,false,change);
    assert.equal(result.sends,0,change);
  }
});
