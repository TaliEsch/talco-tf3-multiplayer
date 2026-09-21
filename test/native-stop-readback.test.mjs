import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
import {parseRoadStopReadbackEnvelope} from '../src/road-stop-readback.mjs';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_stop_readback.lua',import.meta.url),'utf8');
function run(mutation=''){
  const script=`
local m=(function()${source}end)()
local reads=0
local CT={GAME_SPEED='GAME_SPEED',GAME_TIME='GAME_TIME',EDGE_OBJECT='EDGE_OBJECT',PLAYER_OWNED='PLAYER_OWNED',BASE_EDGE='BASE_EDGE'}
local stop={param=.25,transf={{x=1,y=0,z=0,w=0},{x=0,y=1,z=0,w=0},{x=0,y=0,z=1,w=0},{x=4,y=5,z=6,w=1}},edgeObjectConstruction='construction/road_stop.con',params={z='last',[9]='nine',a=true,nested={b=2}}}
local data={[0]={GAME_SPEED={speedup=0},GAME_TIME={tickCount=77,updateCount=44}},[50]={EDGE_OBJECT=stop,PLAYER_OWNED={player=10}},[60]={BASE_EDGE={objects={{50,'STOP_LEFT'}}}},[51]={PLAYER_OWNED={player=11}}}
local api={type={ComponentType=CT,enum={EdgeObjectType={STOP_LEFT='STOP_LEFT',STOP_RIGHT='STOP_RIGHT',SIGNAL='SIGNAL'}},Mat4f={cols=function(m,col)return m[col]end}},engine={util={getWorld=function()return 0 end},system={streetSystem={getEdgeForEdgeObject=function(id) if id==50 then return 60 end end}},entityExists=function(id)return data[id]~=nil end,getComponent=function(id,kind) reads=reads+1;return data[id] and data[id][kind] end}}
local request={schemaVersion=1,nonce=string.rep('a',32),observationId=3,companyEntity=10,resultEntities={50,51},oneWay=false,name='Observed stop'}
${mutation}
local r=m.collect(api,request)
return r.code,r.json or '',reads
`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);try{
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,3,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return [lua.lua_tojsstring(L,-3),lua.lua_tojsstring(L,-2),lua.lua_tointeger(L,-1)];
  }finally{lua.lua_close(L);}
}
test('copies one returned owned stop to bounded deterministic JSON',()=>{
  assert.doesNotMatch(source,/api\.cmd|sendCommand|makeWorldBuildProposalCmd|saveUserdata|io\.|os\./);
  const [code,json]=run(); assert.equal(code,'readback'); assert.ok(Buffer.byteLength(json)<=64*1024);
  assert.deepEqual(JSON.parse(json),{schemaVersion:1,kind:'road_stop_readback',nonce:'a'.repeat(32),observationId:3,companyEntity:10,updateCount:44,tickCount:77,stopEntity:50,edgeEntity:60,param:.25,oneWay:false,name:'Observed stop',left:true,transform:[1,0,0,0,0,1,0,0,0,0,1,0,4,5,6,1],constructionResource:'construction/road_stop.con',params:{kind:'table',entries:[{keyType:'number',key:9,value:{kind:'string',value:'nine'}},{keyType:'string',key:'a',value:{kind:'boolean',value:true}},{keyType:'string',key:'nested',value:{kind:'table',entries:[{keyType:'string',key:'b',value:{kind:'number',value:2}}]}},{keyType:'string',key:'z',value:{kind:'string',value:'last'}}]}});
});
test('the Lua snapshot is accepted by the JavaScript native-envelope codec',()=>{
  const [,json]=run(); const snapshotHex=Buffer.from(json,'utf8').toString('hex');
  const envelope=`function data() return {schemaVersion=1,kind="road_stop_readback",nonce="${'a'.repeat(32)}",observationId=3,snapshotHex="${snapshotHex}",} end`;
  const parsed=parseRoadStopReadbackEnvelope(envelope);
  assert.equal(parsed.executionAuthorized,false);
  assert.equal(parsed.snapshot.stopEntity,50);
  assert.equal(parsed.snapshot.params.entries[0].key,9);
});
test('returns fixed unavailable for request, pause, candidate, edge, and copy boundaries',()=>{
  for(const change of [
    'request.extra=true', 'request.oneWay=nil', 'request.name=string.rep("x",1025)', 'request.resultEntities={50,50}', 'data[0].GAME_SPEED.speedup=1',
    'data[0].GAME_TIME.tickCount=-1', 'data[0].GAME_TIME.tickCount=2147483648', 'data[50].PLAYER_OWNED.player=9',
    'data[51].EDGE_OBJECT=stop', 'data[50]=nil', 'data[60]=nil',
    "data[60].BASE_EDGE.objects={{50,'SIGNAL'}}", 'data[60].BASE_EDGE.objects={{50,\'STOP_LEFT\'},{50,\'STOP_RIGHT\'}}',
    'stop.param=1.1', "stop.edgeObjectConstruction='../unsafe.con'", "stop.edgeObjectConstruction='construction/'", "stop.edgeObjectConstruction='/construction/stop'", "stop.edgeObjectConstruction='construction//stop'", 'stop.params=setmetatable({}, {})',
    'stop.params.loop=stop.params', 'stop.params.deep={a={b={c={d={e=1}}}}}', "stop.params.bad=function()end",
    "stop.params['bad-key']=1", 'stop.params.too=9007199254740992',
  ]) assert.equal(run(change)[0],'unavailable',change);
});
test('does not discover replacements outside the supplied result entities',()=>{
  const [code,,reads]=run('request.resultEntities={51}');
  assert.equal(code,'unavailable'); assert.equal(reads,4); // clock plus only entity 51 component reads
});
test('copyApply copies only bounded native-event scalars without aliases',()=>{
  const script=`local m=(function()${source}end)();local p={proposal={edgeObjectsToAdd={{category=0,playerEntity=10,oneWay=true,name='Native name'}}}};local ids={50,51};local r=m.copyApply(p,ids,3);p.proposal.edgeObjectsToAdd[1].playerEntity=9;ids[1]=99;return r.observationId,r.companyEntity,r.resultEntities[1],r.resultEntities[2],r.oneWay and r.name=='Native name' and m.copyApply(p,{50,50},3).field=='applyResults'`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);try{
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,5,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.deepEqual([lua.lua_tointeger(L,-5),lua.lua_tointeger(L,-4),lua.lua_tointeger(L,-3),lua.lua_tointeger(L,-2),lua.lua_toboolean(L,-1)],[3,10,50,51,true]);
  }finally{lua.lua_close(L);}
});
function copyApply(proposal, results){
  const script=`local m=(function()${source}end)();local p=${proposal};local r=m.copyApply(p,${results},3);return (r.code or 'ok')..'|'..(r.field or '')..'|'..tostring(r.resultEntities and r.resultEntities[1] or 0)..'|'..tostring(r.companyEntity or 0)`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);try{
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,1,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return lua.lua_tojsstring(L,-1);
  }finally{lua.lua_close(L);}
}
const applyProposal=(resultEntity='50')=>`{proposal={edgeObjectsToAdd={{resultEntity=${resultEntity},category=0,playerEntity=10,oneWay=true,name='Native name'}}}}`;
test('copyApply accepts an empty native apply result only through its declared positive stop entity',()=>{
  assert.equal(copyApply(applyProposal(),'{}'),'ok||50|10');
  assert.equal(copyApply(applyProposal('-4'),'{}'),'unavailable|applyStopEntity|0|0');
  assert.equal(copyApply(applyProposal('nil'),'{}'),'unavailable|applyStopEntity|0|0');
});
test('copyApply reads an explicitly indexed result even when its Lua length is zero',()=>{
  // Defensive proxy case; the live log alone does not prove proxy semantics.
  assert.equal(copyApply(applyProposal('50'),"setmetatable({[1]=50},{__len=function() return 0 end})"),'ok||50|10');
});
test('copyApply rejects malformed apply-result maps and over-bound indexed results',()=>{
  assert.equal(copyApply(applyProposal('nil'),'{stop=50}'),'unavailable|applyStopEntity|0|0');
  const tooMany=`{${Array.from({length:65},(_,index)=>index+1).join(',')}}`;
  assert.equal(copyApply(applyProposal(),tooMany),'unavailable|applyResults|0|0');
  assert.equal(copyApply(applyProposal(),'{[1]=50,[3]=51}'),'unavailable|applyResults|0|0');
});
