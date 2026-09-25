import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_depot_build_order_readback.lua',import.meta.url),'utf8');
function run(change=''){
  const script=`local reader=(function() ${source} end)()
local request={schemaVersion=1,kind='ordered_depot_readback_request',nonce='${'a'.repeat(32)}',
  requestId=4,hostSequence=1,company=55652,localCompany=3141,
  construction=123,depot=124,update=108,balance=449160,balanceNegative=1,
  localBalance=40000000,localBalanceNegative=0,charge=449160}
local construction={fileName='::/depots/road/road_depot/road_depot.con',depots={124}}
local owner={player=55652};local localBalance=40000000;local targetBalance=-449160
local api={type={ComponentType={GAME_TIME='GAME_TIME',GAME_SPEED='GAME_SPEED',
  CONSTRUCTION='CONSTRUCTION',VEHICLE_DEPOT='VEHICLE_DEPOT',PLAYER_OWNED='PLAYER_OWNED'}},
  engine={util={getWorld=function()return 0 end,getPlayer=function()return 3141 end,
    finance={getPlayersBalance=function(id)if id==55652 then return targetBalance end
      if id==3141 then return localBalance end end}},
    entityExists=function(id)return id==123 or id==124 end,
    getComponent=function(id,kind)
      if kind=='GAME_TIME'then return{updateCount=108}end
      if kind=='GAME_SPEED'then return{speedup=0}end
      if id==123 and kind=='CONSTRUCTION'then return construction end
      if id==124 and kind=='VEHICLE_DEPOT'then return{}end
      if (id==123 or id==124) and kind=='PLAYER_OWNED'then return owner end
    end}}
${change}
local result=reader.probe(api,request)
return result.code,result.stage or '',result.construction or 0,result.depot or 0`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,4,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {code:lua.lua_tojsstring(L,-4),stage:lua.lua_tojsstring(L,-3),
      construction:lua.lua_tonumber(L,-2),depot:lua.lua_tonumber(L,-1)};
  }finally{lua.lua_close(L);}
}
test('independent held-world depot query checks construction, owner and both balances',()=>{
  assert.deepEqual(run(),{code:'observed',stage:'',construction:123,depot:124});
});
test('independent depot query rejects wrong clock, owner, resource and association',()=>{
  for(const [change,stage] of [
    ['request.update=109','clock'],['targetBalance=-449159','balance'],
    ['localBalance=39999999','local_balance'],
    ["construction.fileName='changed.con'",'construction'],
    ['construction.depots={125}','construction'],
    ['owner.player=3141','construction'],
    ['request.depot=123','request'],
  ])assert.deepEqual(run(change),{code:'unknown',stage,construction:0,depot:0});
});
