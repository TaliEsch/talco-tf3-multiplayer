import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
import {encodeAsyncEngineRequest} from '../src/async-engine-mailbox.mjs';
import {ROAD_DEPOT_RESOURCE} from '../src/depot-build-order-payload.mjs';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const decoder=await readFile(new URL('../mod/content/tf3mp_depot_build_order_wire.lua',import.meta.url),'utf8');
const payload={companyEntity:55652,resource:ROAD_DEPOT_RESOURCE,
  x:-812.891541,y:-3142.25684,z:23.3068237,yaw:Math.PI,seed:1};
const request={schemaVersion:1,roundId:'round',operationId:'prepare',operation:'prepare',
  command:{protocolVersion:2,hostSequence:1,scheduledUpdate:108,originPlayerId:'player-b',
    targetCompanyEntity:55652,targetEntity:0,commandType:'road.depot.build',payload,
    clientSequence:11,requestMessageId:'depot-11'}};
const source=encodeAsyncEngineRequest(request,'a'.repeat(32),{enableDepotBuild:true});

function decode(wire){
  const script=`local decoder=(function() ${decoder} end)()\n${wire}\nlocal result=decoder.decode(data())\nif result==nil then return false end\nreturn true,result.companyEntity,result.resource,result.x,result.y,result.z,result.yaw,result.seed`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,8,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    if(!lua.lua_toboolean(L,-8))return null;
    return {companyEntity:lua.lua_tonumber(L,-7),resource:lua.lua_tojsstring(L,-6),
      x:lua.lua_tonumber(L,-5),y:lua.lua_tonumber(L,-4),z:lua.lua_tonumber(L,-3),
      yaw:lua.lua_tonumber(L,-2),seed:lua.lua_tonumber(L,-1)};
  }finally{lua.lua_close(L);}
}

test('TF3-side decoder reconstructs the observed stock depot placement',()=>{
  assert.deepEqual(decode(source),payload);
  const f32Yaw=-3.1415927410125732;
  const exact=encodeAsyncEngineRequest({...request,command:{...request.command,
    payload:{...payload,yaw:f32Yaw}}},'a'.repeat(32),{enableDepotBuild:true});
  assert.equal(decode(exact).yaw,f32Yaw);
});

test('TF3-side decoder rejects wrong company, target, seed and geometry',()=>{
  for(const [before,after] of [
    ['companyEntity=55652','companyEntity=0'],['entity=0','entity=1'],
    ['seed=1','seed=0'],['xText="-812.891541"','xText="100001"'],
    ['yawText="3.141592653589793"','yawText="4"'],
    ['zText="23.3068237"','zText="nan"'],
    ['zText="23.3068237"','zText="-0"'],
  ])assert.equal(decode(source.replace(before,after)),null);
});
