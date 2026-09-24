import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_road_stop_simple_prepare.lua',import.meta.url),'utf8');

function run(mutation=''){
  const script=`local adapter=(function() ${source} end)()
local input={edgeEntity=24,companyEntity=10,param=.4,left=true,oneWay=false,model='models/stop.mdl',name='Stop'}
local removed={entity=24};local added={entity=-1,comp={objects={}}}
local street={addedSegments={added},removedSegments={removed},addedNodes={},removedNodes={},edgeObjectsToAdd={},
  nodeConfigsToAdd={{entity=31,comp={}},{entity=32,comp={}}},nodeConfigsToRemove={31,32}}
local calls,sends=0,0
local api={type={ComponentType={PLAYER='PLAYER',BASE_EDGE='BASE_EDGE',GAME_SPEED='GAME_SPEED'},
  SimpleProposal={new=function()return{}end},
  SimpleStreetProposal={new=function()return{}end,EdgeObject={new=function()return{}end}},
  Context={new=function()return{}end}},
  engine={entityExists=function(id)return id==24 or id==10 end,
    getComponent=function(id,kind)if id==10 and kind=='PLAYER'then return{}end
      if id==24 and kind=='BASE_EDGE'then return{objects={},node0=31,node1=32}end
      if id==99 and kind=='GAME_SPEED'then return{speedup=0}end end,
    util={getWorld=function()return 99 end,proposal={replaceSegment=function(id)assert(id==24);return{proposal=street}end}}},
  res={modelRep={find=function(name)assert(name=='models/stop.mdl' or name=='::/models/stop.mdl');return 7 end}},
  cmd={makeWorldBuildProposalCmd=function(proposal,context)calls=calls+1;return{proposal=proposal,context=context}end,
    sendCommand=function()sends=sends+1;error('MUST_NOT_SEND')end}}
${mutation}
local result=adapter.prepare(api,input)
local command=result.command
if command then
  assert(command.proposal.streetProposal.nodeConfigsToAdd==street.nodeConfigsToAdd)
  assert(command.proposal.streetProposal.nodeConfigsToRemove==street.nodeConfigsToRemove)
end
local object=command and command.proposal.streetProposal.edgeObjectsToAdd[1]
if object then assert(object.model=='models/stop.mdl') end
return result.code,calls,sends,result.temporaryEdgeEntity or 0,
  object and object.edgeEntity or 0,object and object.playerEntity or 0,
  command and command.proposal.streetProposal.edgesToRemove[1] or 0,
  command and command.context.player or 0,result.stage or 'none'`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,9,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {code:lua.lua_tojsstring(L,-9),calls:lua.lua_tonumber(L,-8),sends:lua.lua_tonumber(L,-7),
      newEdge:lua.lua_tonumber(L,-6),objectEdge:lua.lua_tonumber(L,-5),owner:lua.lua_tonumber(L,-4),
      removedEdge:lua.lua_tonumber(L,-3),payer:lua.lua_tonumber(L,-2),stage:lua.lua_tojsstring(L,-1)};
  }finally{lua.lua_close(L);}
}

test('the factory segment and stop bind to one replacement edge and company without submission',()=>{
  assert.deepEqual(run(),{code:'prepared',calls:1,sends:0,newEdge:-1,objectEdge:-1,owner:10,removedEdge:24,payer:10,stage:'none'});
  assert.equal(run("input.model='::/models/stop.mdl'").code,'prepared');
});

test('unsafe or stale roads and owners cannot produce a command',()=>{
  for(const change of [
    'input.companyEntity=11','input.edgeEntity=25','input.model="../stop.mdl"',
    'input.param=1.1','input.left=1','input.unexpected=true',
    "api.engine.getComponent=function(id,kind)if kind=='BASE_EDGE'then return{objects={{30,1}}}end;return{}end",
    "api.engine.getComponent=function(id,kind)if kind=='GAME_SPEED'then return{speedup=1}end;return{}end",
    'added.entity=-2','removed.entity=25','street.edgeObjectsToAdd={{}}',
    'street.nodeConfigsToAdd={}',
    'street.nodeConfigsToRemove={31,31}',
    'street.nodeConfigsToRemove={31,33}',
    'street.nodeConfigsToAdd[1].entity=33',
    'street.nodeConfigsToAdd[2].comp=nil',
    'street.addedSegments[2]={entity=-2,comp={objects={}}}',
  ]){
    const result=run(change);
    assert.equal(result.code,'rejected',change);
    assert.equal(result.calls,0,change);
    assert.equal(result.sends,0,change);
  }
});

test('unexpected native failures remain unknown and never submit a command',()=>{
  const result=run('api.engine.util.proposal.replaceSegment=function()error("private")end');
  assert.equal(result.code,'unknown');
  assert.equal(result.calls,0);
  assert.equal(result.sends,0);
});

test('rejection stays classified when the game sandbox does not expose rawequal',()=>{
  const result=run('rawequal=nil;input.companyEntity=11');
  assert.equal(result.code,'rejected');
  assert.equal(result.calls,0);
  assert.equal(result.sends,0);
});

test('read-only factory rejection identifies the failed field',()=>{
  assert.equal(run('street.addedNodes={1}').stage,'factoryAddedNodes');
  assert.equal(run('street.nodeConfigsToAdd=nil').stage,'factoryNodeConfigsAdd');
  assert.equal(run('added.entity=-2').stage,'factoryFirstSegment');
});
