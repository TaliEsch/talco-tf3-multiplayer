import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_road_replay_dispatch.lua',import.meta.url),'utf8');

function run(change=''){
  const script=`local dispatcher=(function() ${source} end)()
local function wrap(f)return setmetatable({}, {__call=function(_,...)return f(...)end})end
local request={schemaVersion=1,kind='native_road_stop_replay',nonce=string.rep('a',32),
  requestId=1,issuedTick=100,expiresTick=300,confirmed=1,caseDigest=string.rep('b',64),
  capture={},modelResource={},targetCompany=3,sessionId=string.rep('a',32),actionId=1,consentId='replay_1'}
local api={engine={util={getWorld=wrap(function()return 0 end),getPlayer=wrap(function()return 3 end)},
  getComponent=wrap(function()return{tickCount=100,updateCount=7}end)},type={ComponentType={GAME_TIME=1}}}
local dependencies={execute={execute=function()return{outcome='rejected',code='REPLAY_PREPARATION_UNQUALIFIED'}end},
  prepare={prepare=function()end},preflight={verify=function()end},rebuild={rebuild=function()end},
  results={before=function()end,after=function()end}}
${change}
local result=dispatcher.dispatch({},request,api,dependencies)
return result.code,result.outcome,result.tickCount,result.updateCount`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,4,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return [lua.lua_tojsstring(L,-4),lua.lua_tojsstring(L,-3),lua.lua_tointeger(L,-2),lua.lua_tointeger(L,-1)];
  }finally{lua.lua_close(L);}
}

test('local replay dispatcher accepts callable native clock and player bindings',()=>{
  assert.deepEqual(run(),['REPLAY_PREPARATION_UNQUALIFIED','rejected',100,7]);
  assert.deepEqual(run('api.engine.util.getWorld=nil'),['ENGINE_TIME_UNAVAILABLE','rejected',0,0]);
  assert.deepEqual(run('api.engine.util.getPlayer=wrap(function()return 4 end)'),
    ['TARGET_COMPANY_CHANGED','rejected',100,7]);
});
