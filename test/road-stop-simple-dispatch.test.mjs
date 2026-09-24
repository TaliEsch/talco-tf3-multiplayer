import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const dispatch=await readFile(new URL('../mod/content/tf3mp_road_stop_simple_dispatch.lua',import.meta.url),'utf8');
const execute=await readFile(new URL('../mod/content/tf3mp_road_replay_execute.lua',import.meta.url),'utf8');
function run(change='',tail=''){
  const script=`local dispatcher=(function() ${dispatch} end)()
local executor=(function() ${execute} end)()
local request={schemaVersion=1,kind='native_road_stop_simple_probe',nonce=string.rep('a',32),
  requestId=1,issuedTick=100,expiresTick=200,confirmed=1,caseDigest=string.rep('b',64),
  capture={edgeEntity=24,companyEntity=10,param=.5,left=true,oneWay=false,
    model='models/stop.mdl',name='TalCo Road Stop'},modelResource={resourceName='models/stop.mdl'},
  targetCompany=10,sessionId=string.rep('a',32),actionId=1,consentId='simple_1'}
local saved={roadStopPreActionReceipt={nonce=request.nonce,code='shape',commandCode='prepared',
  companyEntity=10,edgeEntity=24,updateCount=50}}
local state={get=function()return saved end,set=function(_,value)saved=value end}
local sends=0;local callback=true;local tick=110;local update=50
local api={type={ComponentType={GAME_TIME='GAME_TIME'}},engine={util={getWorld=function()return 0 end,
  getPlayer=function()return 10 end},getComponent=function()return{tickCount=tick,updateCount=update}end},
  cmd={sendCommand=function(_,done)sends=sends+1
    assert(saved.nativeRoadReplayAttempted and saved.phase2CompanyFault)
    if callback then done({resultProposalData={costs=67500}},true,{}) end end}}
local deps={execute=executor,prepare={prepare=function(_,input)
  assert(input.edgeEntity==24 and input.model=='models/stop.mdl');return{code='prepared',command={}}end},
  results={before=function(_,input)assert(input.companyEntity==10);return{code='observed'}end,
    after=function(_,_,input,data,success)
      assert(input.edgeEntity==24 and data.resultProposalData.costs==67500 and success)
      return{code='verified',stopEntity=81,chargedCost=67500}end}}
${change}
local receipt=dispatcher.dispatch(state,request,api,deps)
${tail}
return receipt.code,receipt.outcome,sends,saved.phase2CompanyFault==true`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,4,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {code:lua.lua_tojsstring(L,-4),outcome:lua.lua_tojsstring(L,-3),sends:lua.lua_tonumber(L,-2),fault:lua.lua_toboolean(L,-1)};
  }finally{lua.lua_close(L);}
}
test('simple probe reuses the persisted one-use executor and correlates one callback',()=>{
  assert.deepEqual(run(),{code:'ROAD_STOP_OWNER_AND_DEBIT_OBSERVED',outcome:'verified',sends:1,fault:true});
});
test('missing or stale pre-action evidence cannot submit',()=>{
  for(const change of [
    'saved.roadStopPreActionReceipt.commandCode="rejected"',
    'saved.roadStopPreActionReceipt.edgeEntity=25',
    'saved.roadStopPreActionReceipt.updateCount=49',
    'request.targetCompany=11',
    'request.capture.model="other.mdl"',
    'request.capture.param=0/0',
  ]){
    const result=run(change);
    assert.equal(result.sends,0,change);
    assert.equal(result.fault,false,change);
  }
});
test('an unqualified read-only player snapshot rejects before command submission',()=>{
  assert.deepEqual(run("deps.results.before=function()return{code='unknown',stage='players'}end"),
    {code:'BEFORE_SNAPSHOT_UNQUALIFIED',outcome:'rejected',sends:0,fault:false});
});
test('unknown callback cannot be retried and consumes the save',()=>{
  assert.deepEqual(run('callback=false','receipt=dispatcher.dispatch(state,request,api,deps)'),
    {code:'REPLAY_CONSUMED_OR_COMPANY_UNKNOWN',outcome:'rejected',sends:1,fault:true});
});
