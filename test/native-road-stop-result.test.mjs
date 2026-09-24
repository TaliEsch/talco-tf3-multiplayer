import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
import {roadStopCaptureFixture} from './fixtures/road-stop-capture.mjs';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const module=await readFile(new URL('../mod/content/tf3mp_road_replay_result.lua',import.meta.url),'utf8');
const executor=await readFile(new URL('../mod/content/tf3mp_road_replay_execute.lua',import.meta.url),'utf8');
function literal(v){if(v===null)return'nil';if(typeof v==='string')return `string.char(${[...Buffer.from(v)].join(',')})`;if(typeof v==='number'||typeof v==='boolean')return String(v);return `{${Object.entries(v).map(([k,x])=>`[${Array.isArray(v)?Number(k)+1:literal(k)}]=${literal(x)}`).join(',')}}`;}
function execute(mutation='',integrated=false,beforeMutation=''){
  const fixture=roadStopCaptureFixture();fixture.proposal.street.edgeObjectsToAdd[0].playerEntity=1;
  const script=`
local receipt=(function() ${module} end)()
local capture=${literal(fixture)}
local components={ [0]={speedup=0}, [1]={player=true}, [2]={player=true}, [22]={edge=true}, [40]={edgeObject=true} }
local lists={PLAYER={1,2},EDGE_OBJECT={40}}
local balances={[1]=9000000000,[2]=150}
local CT={GAME_SPEED='GAME_SPEED',PLAYER='PLAYER',EDGE_OBJECT='EDGE_OBJECT',BASE_EDGE='BASE_EDGE',PLAYER_OWNED='PLAYER_OWNED',MODEL_INSTANCE_LIST='MODEL_INSTANCE_LIST'}
local api={type={ComponentType=CT,Mat4f={cols=function(m,col)return m[col]end}},res={modelRep={find=function(n)return n=='models/stop.mdl' and 7 or -1 end,getName=function(id)return id==7 and 'models/stop.mdl' or nil end}},engine={util={getWorld=function()return 0 end,finance={getPlayersBalance=function(id)return balances[id]end}},getComponent=function(id,kind)
  local c=components[id]
  if kind=='GAME_SPEED' then return c and c.speedup~=nil and c or nil end
  if kind=='PLAYER' then return c and c.player and c or nil end
  if kind=='BASE_EDGE' then return c and c.edge and c or nil end
  if kind=='PLAYER_OWNED' then return c and c.owner and {player=c.owner} or nil end
  if kind=='MODEL_INSTANCE_LIST' then return c and c.models and {fatInstances=c.models} or nil end
  return c and c.edgeObject and c or nil
end,getEntitiesWithComponent=function(kind)return lists[kind] end}}
local model={modelId=7,transf={{x=1,y=0,z=0,w=0},{x=0,y=1,z=0,w=0},{x=0,y=0,z=1,w=0},{x=4,y=5,z=6,w=1}}}
${beforeMutation}
local before=receipt.before(capture,{modelId=7,resourceName='models/stop.mdl'},1,api)
components[22]=nil; components[50]={edgeObject=true,owner=1,models={model}}; lists.EDGE_OBJECT={40,50}; balances[1]=8999999940
local data={resultProposalData={costs=60}}
local resultEntities={{50,3}}
${mutation}
local after=receipt.after(before,capture,{modelId=7,resourceName='models/stop.mdl'},1,api,data,true,resultEntities)
${integrated ? `
local executor=(function() ${executor} end)()
components[22]={edge=true};components[50]=nil;lists.EDGE_OBJECT={40};balances[1]=9000000000
local saved={};local state={get=function()return saved end,set=function(self,v)saved=v end}
api.cmd={sendCommand=function(command,callback)
  assert(saved.nativeRoadReplayAttempted and saved.phase2CompanyFault)
  components[22]=nil;components[50]={edgeObject=true,owner=1,models={model}}
  lists.EDGE_OBJECT={40,50};balances[1]=8999999940
  callback(data,true,resultEntities)
end}
local request={capture=capture,modelResource={modelId=7,resourceName='models/stop.mdl'},targetCompany=1,
  sessionId='session',actionId=1,consentId='consent',caseDigest=string.rep('a',64)}
local outcome=executor.execute(state,request,{request=request,confirmed=true,kind='native_road_stop_replay'},api,
  function()return{code='prepared',command={}}end,receipt)
assert(saved.phase2CompanyFault and outcome.replayAcceptanceVerified==false)
after={code=outcome.outcome,stopEntity=outcome.stopEntity,chargedCost=outcome.chargedCost}
` : ''}
return before.code,after.code,after.stopEntity or -1,after.chargedCost or -1
`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,10_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,4,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return [lua.lua_tojsstring(L,-4),lua.lua_tojsstring(L,-3),lua.lua_tointeger(L,-2),lua.lua_tointeger(L,-1)];
  }finally{lua.lua_close(L);}
}
test('read-only receipt verifies the normal curb-stop callback evidence',()=>{
  assert.deepEqual(execute(),['observed','verified',50,60]);
});
test('result reader accepts callable native finance, component and matrix bindings',()=>{
  const wrap='local function wrap(f)return setmetatable({}, {__call=function(_,...)return f(...)end})end;'
    +'api.engine.util.getWorld=wrap(api.engine.util.getWorld);'
    +'api.engine.util.finance.getPlayersBalance=wrap(api.engine.util.finance.getPlayersBalance);'
    +'api.engine.getComponent=wrap(api.engine.getComponent);'
    +'api.engine.getEntitiesWithComponent=wrap(api.engine.getEntitiesWithComponent);'
    +'api.res.modelRep.find=wrap(api.res.modelRep.find);api.res.modelRep.getName=wrap(api.res.modelRep.getName);'
    +'api.type.Mat4f.cols=wrap(api.type.Mat4f.cols)';
  assert.deepEqual(execute('',false,wrap),['observed','verified',50,60]);
  assert.equal(execute('balances[1]=8999999941',false,wrap)[1],'unknown');
});

test('real result checker integrates with the one-shot executor and leaves acceptance unverified',()=>{
  assert.deepEqual(execute('',true),['observed','verified',50,60]);
});

test('before rejects a running world or a capture bound to another company',()=>{
  for(const mutation of ['components[0].speedup=1','capture.proposal.street.edgeObjectsToAdd[1].playerEntity=2'])
    assert.equal(execute('',false,mutation)[0],'unknown');
});
test('receipt returns fixed unknown for ownership, debit, peer balance, callback, or membership evidence failures',()=>{
  for(const mutation of [
    'components[50].owner=2',
    'balances[1]=8999999941',
    'balances[2]=149',
    'resultEntities=nil',
    'components[51]={edgeObject=true,owner=1,models={model}};lists.EDGE_OBJECT={40,50,51}',
    'components[22]={edge=true}',
    'components[0].speedup=1',
  ]){
    const [before,after]=execute(mutation);assert.equal(before,'observed');assert.equal(after,'unknown');
  }
});
test('before is unknown for a running world and does not expose native state',()=>{
  const [before]=execute('');assert.equal(before,'observed');
  // The normal test returns only scalar fields, while all component access stays
  // internal to the Lua module; malformed public reads remain fixed unknown.
  const [beforeCode,afterCode]=execute('api.res.modelRep.getName=function() error("native detail") end');
  assert.equal(beforeCode,'observed');assert.equal(afterCode,'unknown');
});
