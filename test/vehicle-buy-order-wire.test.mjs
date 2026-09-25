import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const decoder=await readFile(new URL('../mod/content/tf3mp_vehicle_buy_order_wire.lua',import.meta.url),'utf8');
function decode(companyEntity,entity,model){
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    const script=`local decoder=(function() ${decoder} end)()\nlocal result=decoder.decode({companyEntity=${companyEntity},entity=${entity},model=${JSON.stringify(model)}})\nif result==nil then return false end\nreturn true,result.companyEntity,result.depotEntity,result.model`;
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,4,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    if(!lua.lua_toboolean(L,-4))return null;
    return {companyEntity:lua.lua_tonumber(L,-3),depotEntity:lua.lua_tonumber(L,-2),model:lua.lua_tojsstring(L,-1)};
  }finally{lua.lua_close(L);}
}

test('ordered purchase intent binds target company, depot child and model resource',()=>{
  const model='::/vehicle/bus/example.mdl';
  assert.deepEqual(decode(55652,73803,model),{companyEntity:55652,depotEntity:73803,model});
});

test('ordered purchase intent rejects invalid company, depot and model',()=>{
  for(const [company,depot,model] of [
    [0,73803,'::/vehicle/bus/example.mdl'],
    [55652,0,'::/vehicle/bus/example.mdl'],
    [55652,73803,'::/vehicle/bus/example.con'],
    [55652,73803,'../../outside.mdl'],
    [55652,73803,'::/vehicle/"bad.mdl'],
    [55652,73803,'::/vehicle/'+'a'.repeat(250)+'.mdl'],
  ])assert.equal(decode(company,depot,model),null);
});
