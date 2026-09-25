import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
import {encodeAsyncEngineRequest} from '../src/async-engine-mailbox.mjs';
import {ROAD_STOP_MODEL} from '../src/road-stop-order-payload.mjs';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const decoder=await readFile(new URL('../mod/content/tf3mp_road_stop_order_wire.lua',import.meta.url),'utf8');
const nonce='a'.repeat(32);
const name='TalCo ' + 'é'.repeat(90);
const request={schemaVersion:1,roundId:'round',operationId:'prepare',operation:'prepare',
  command:{protocolVersion:2,hostSequence:1,scheduledUpdate:108,originPlayerId:'player-a',
    targetCompanyEntity:3141,targetEntity:53417,commandType:'road.stop.place',
    payload:{edgeEntity:53417,companyEntity:3141,param:1e-7,left:true,oneWay:false,
      model:ROAD_STOP_MODEL,name},clientSequence:11,requestMessageId:'road-11'}};
const wire=encodeAsyncEngineRequest(request,nonce);

function decode(source){
  const script=`local decoder=(function() ${decoder} end)()\n${source}\nlocal result=decoder.decode(data())\nif result==nil then return false end\nreturn true,result.edgeEntity,result.companyEntity,result.param,result.left,result.oneWay,result.model,result.name`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,8,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    if(!lua.lua_toboolean(L,-8))return null;
    return {edgeEntity:lua.lua_tonumber(L,-7),companyEntity:lua.lua_tonumber(L,-6),
      param:lua.lua_tonumber(L,-5),left:lua.lua_toboolean(L,-4),oneWay:lua.lua_toboolean(L,-3),
      model:lua.lua_tojsstring(L,-2),name:lua.lua_tojsstring(L,-1)};
  }finally{lua.lua_close(L);}
}

test('TF3-side scalar decoder reconstructs the bounded road Stop command',()=>{
  assert.deepEqual(decode(wire),request.command.payload);
});

test('TF3-side scalar decoder rejects malformed position and name chunks',()=>{
  assert.equal(decode(wire.replace(' paramText="1e-7",',' paramText="2",')),null);
  assert.equal(decode(wire.replace(' nameChunkCount=3,',' nameChunkCount=2,')),null);
  assert.equal(decode(wire.replace(' nameChunkCount=3,',' nameChunkCount=17,')),null);
  assert.equal(decode(wire.replace(' entity=53417,',' entity=0,')),null);
});
