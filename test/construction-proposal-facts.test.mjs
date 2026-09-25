import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_proposal_facts.lua',import.meta.url),'utf8');

function collect(change='') {
  const script=`local facts=(function() ${source} end)()
    local proposal={toAdd={{fileName='base::/depots/road/road_depot/road_depot.con',playerEntity=3141}},toRemove={}}
    local data={costs=446291,errorState={critical=false}}
    local result={40001}
    ${change}
    return facts.collectConstruction(proposal,data,result)`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try {
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,1,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return JSON.parse(lua.lua_tojsstring(L,-1));
  } finally {lua.lua_close(L)}
}

test('construction observer copies bounded owner, resource, cost and result shape',()=>{
  assert.deepEqual(collect(),{schemaVersion:1,code:'constructionReadable',constructions:1,
    removals:0,resultCount:1,ownerCompany:3141,
    resource:'base::/depots/road/road_depot/road_depot.con',cost:446291,critical:false});
});

test('construction observer fails closed on ambiguous or unsafe native values',()=>{
  for(const change of [
    'proposal.toAdd={}',
    'proposal.toAdd[2]=proposal.toAdd[1]',
    'proposal.toAdd[1].playerEntity=0',
    "proposal.toAdd[1].fileName='bad\"resource'",
    'data.costs=-1',
    'data.errorState.critical=nil',
  ]) assert.equal(collect(change).code,'unavailable',change);
  assert.deepEqual(collect('result={}; for i=1,65 do result[i]=i end'),
    {schemaVersion:1,code:'bounds',field:'resultCount'});
});
