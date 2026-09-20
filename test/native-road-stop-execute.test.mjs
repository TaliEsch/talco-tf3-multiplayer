import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_road_replay_execute.lua',import.meta.url),'utf8');
function run(mutation='',tail=''){
  const script=`local function loadAdapter() ${source} end
local adapter=loadAdapter()
local request={sessionId='session',actionId=1,consentId='confirm',targetCompany=10,caseDigest=string.rep('a',64),capture={value=1},modelResource={modelId=7,resourceName='stop.mdl'}}
local function copy(t)if type(t)~='table'then return t end;local out={};for k,v in pairs(t)do out[k]=copy(v)end;return out end
local consent={confirmed=true,kind='native_road_stop_replay',request=copy(request)}
local saved={};local writes,sends=0,0
local state={get=function()return copy(saved)end,set=function(self,v)writes=writes+1;saved=copy(v)end}
local prepare=function()return{code='prepared',command={}}end
local results={before=function()return{code='observed'}end,after=function()return{code='verified',stopEntity=200,chargedCost=67500}end}
local api={cmd={sendCommand=function(command,callback) sends=sends+1;assert(saved.nativeRoadReplayAttempted and saved.phase2CompanyFault);callback({},true,{{200,1}})end}}
${mutation}
local result=adapter.execute(state,request,consent,api,prepare,results)
${tail}
return result.code,result.outcome,sends,saved.phase2CompanyFault==true
`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,4,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {code:lua.lua_tojsstring(L,-4),outcome:lua.lua_tojsstring(L,-3),sends:lua.lua_tonumber(L,-2),fault:lua.lua_toboolean(L,-1)};
  }finally{lua.lua_close(L);}
}
test('replay persists its consume and company fault before exactly one native submission',()=>{
  assert.deepEqual(run(),{code:'ROAD_STOP_OWNER_AND_DEBIT_OBSERVED',outcome:'verified',sends:1,fault:true});
});
test('explicit consent binds the entire capture, resource and correlation before preparation',()=>{
  for(const mutation of ['consent.confirmed=false','request.capture.value=2','request.modelResource.resourceName="other.mdl"','request.targetCompany=11','request.caseDigest=string.rep("b",64)','request.sessionId="other"','request.capture.loop=request.capture']){
    assert.deepEqual(run(mutation),{code:'EXPLICIT_REPLAY_CONSENT_REQUIRED',outcome:'rejected',sends:0,fault:false});
  }
});
test('unqualified preparation or snapshot cannot send',()=>{
  for(const mutation of ['prepare=function()error("private")end','prepare=function()return{code="unknown"}end','results.before=function()return{code="unknown"}end']){
    assert.deepEqual(run(mutation),{code:'REPLAY_PREPARATION_UNQUALIFIED',outcome:'rejected',sends:0,fault:false});
  }
});
test('missing, failed, exceptional and unverifiable callbacks stay unknown without retry',()=>{
  for(const mutation of [
    'api.cmd.sendCommand=function()sends=sends+1 end',
    'api.cmd.sendCommand=function()sends=sends+1;error("private")end',
    'results.after=function()return{code="unknown"}end',
    'results.after=function()error("private")end',
    'results.after=function()return{code="verified",stopEntity=0,chargedCost=1}end',
  ]){const r=run(mutation);assert.equal(r.outcome,'unknown');assert.equal(r.sends,1);assert.equal(r.fault,true);}
});
test('persistent and in-memory consume barriers prevent repeats including after adapter reload',()=>{
  for(const tail of [
    'result=adapter.execute(state,request,consent,api,prepare,results)',
    'adapter=loadAdapter();result=adapter.execute(state,request,consent,api,prepare,results)',
  ])assert.deepEqual(run('',tail),{code:'REPLAY_CONSUMED_OR_COMPANY_UNKNOWN',outcome:'rejected',sends:1,fault:true});
});
test('failed consume persistence cannot send or be retried in the loaded adapter',()=>{
  const mutation='state.set=function()error("disk failure")end';
  assert.equal(run(mutation).code,'CONSUME_PERSISTENCE_UNKNOWN');assert.equal(run(mutation).sends,0);
  assert.equal(run(mutation,'result=adapter.execute(state,request,consent,api,prepare,results)').code,'REPLAY_CONSUMED_OR_COMPANY_UNKNOWN');
});
test('late and duplicate callbacks cannot revive or overwrite terminal evidence',()=>{
  assert.deepEqual(run('local late;api.cmd.sendCommand=function(c,cb)sends=sends+1;late=cb end',
    'late({},true,{{200,1}})'),{code:'ENGINE_CALLBACK_MISSING',outcome:'unknown',sends:1,fault:true});
  assert.deepEqual(run('api.cmd.sendCommand=function(c,cb)sends=sends+1;cb({},true,{});results.after=function()error("duplicate")end;cb({},true,{})end'),
    {code:'ROAD_STOP_OWNER_AND_DEBIT_OBSERVED',outcome:'verified',sends:1,fault:true});
});
