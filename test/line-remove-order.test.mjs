import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fengari from 'fengari';
import {HostAuthority,CommandQueue} from '../src/lockstep.mjs';
import {parseLineRemoveOrderPayload} from '../src/line-remove-order-payload.mjs';
import {encodeAsyncEngineRequest,decodeAsyncEngineRequest,createAsyncEngineMailbox} from '../src/async-engine-mailbox.mjs';
import {decodeLineRemoveExecutionReceipt} from '../src/coordinator-line-remove-execution.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';

const nonce='a'.repeat(32);
const compatibility={sessionId:'line-remove',buildHash:'a'.repeat(64),modManifestHash:'b'.repeat(64)};
const payload={companyEntity:8,lineEntity:101};
function fixture(options={}){
  const owners=new Map([[101,8]]),owner=id=>owners.get(id)??null;
  const host=new HostAuthority({...compatibility,resolveEntityOwner:owner,enableLineRemove:true,...options});
  const player=host.admit({...compatibility,displayName:'A'});
  host.bindCompanyEntity(player.playerId,8);
  const request=(overrides={})=>({messageId:'remove-1',clientSequence:1,
    originPlayerId:player.playerId,targetCompanyEntity:8,targetEntity:101,
    commandType:'road.line.remove',payload,...overrides});
  return {host,player,owners,owner,request};
}
test('Host and queue reject disabled, foreign, stale-owner and malformed line removal',()=>{
  assert.deepEqual(parseLineRemoveOrderPayload(payload,8,101),payload);
  for(const bad of [{...payload,lineEntity:102},{...payload,companyEntity:9},{...payload,extra:1}])
    assert.throws(()=>parseLineRemoveOrderPayload(bad,8,101));
  const disabled=fixture({enableLineRemove:false});
  assert.throws(()=>disabled.host.accept(disabled.request(),100,disabled.player.playerId),{code:'UNSUPPORTED_COMMAND'});
  const f=fixture();f.owners.set(101,9);
  assert.throws(()=>f.host.accept(f.request(),100,f.player.playerId),{code:'NOT_OWNER'});
  f.owners.set(101,8);
  const command=f.host.accept(f.request({messageId:'remove-2'}),100,f.player.playerId);
  const players=new Map([[f.player.playerId,8]]);
  assert.throws(()=>new CommandQueue().enqueue(command,players,f.owner),{code:'AUTH_RECHECK_FAILED'});
  const queue=new CommandQueue({enableLineRemove:true});
  assert.equal(queue.enqueue(command,players,f.owner),true);
  f.owners.set(101,9);
  assert.throws(()=>queue.due(command.scheduledUpdate),{code:'AUTH_RECHECK_FAILED'});
});
test('flat request and held deletion receipt are exact and opt-in',()=>{
  const f=fixture(),command=f.host.accept(f.request(),100,f.player.playerId);
  for(const operation of ['prepare','executeHeld']){
    const request={schemaVersion:1,roundId:'round',operationId:operation,operation,command};
    assert.throws(()=>encodeAsyncEngineRequest(request,nonce));
    const source=encodeAsyncEngineRequest(request,nonce,{enableLineRemove:true});
    const flat=parseFlatDataFile(source);
    assert.equal(Object.keys(flat).length,14);
    assert.equal(flat.entity,101);
    assert.deepEqual(decodeAsyncEngineRequest(source,nonce,{enableLineRemove:true}),request);
    assert.throws(()=>decodeAsyncEngineRequest(source,nonce));
  }
  const receipt={schemaVersion:1,nonce,roundId:'round',operationId:'executeHeld',
    operation:'executeHeld',status:'ok',updateCount:108,held:true,snapshotVersion:6,
    hostSequence:1,entity:101,lineEntity:101,ownerCompanyEntity:8};
  assert.equal(decodeLineRemoveExecutionReceipt(receipt).state.removedLine.entity,101);
  for(const bad of [{lineEntity:102},{ownerCompanyEntity:0},{held:false},{snapshotVersion:5},{extra:1}])
    assert.throws(()=>decodeLineRemoveExecutionReceipt({...receipt,...bad}));
});
test('mailbox rejects unrelated line deletion receipt',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-line-remove-'));
  const directory=path.join(root,'tf3mp_status_1');await mkdir(directory);
  const f=fixture(),command=f.host.accept(f.request(),100,f.player.playerId);
  const request={schemaVersion:1,roundId:'round',operationId:'executeHeld',operation:'executeHeld',command};
  const receipt={schemaVersion:1,nonce,roundId:'round',operationId:'executeHeld',
    operation:'executeHeld',status:'ok',updateCount:command.scheduledUpdate,held:true,
    snapshotVersion:6,hostSequence:1,entity:101,lineEntity:101,ownerCompanyEntity:8};
  const evidence=[],delivered=[];
  const mailbox=await createAsyncEngineMailbox({directory,nonce,enableLineRemove:true,
    onExecutionEvidence:value=>evidence.push(value)});
  const participant={receiveEngine:value=>{delivered.push(value);return true;}};
  const write=async value=>writeFile(path.join(directory,'coordination_receipt.lua'),
    `function data() return {${Object.entries(value).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`);
  try{
    await mailbox.publish(request);
    await write({...receipt,ownerCompanyEntity:9});await mailbox.poll(participant);
    assert.equal(evidence.length,0);assert.equal(delivered.at(-1).status,'unknown');
    await write(receipt);await mailbox.poll(participant);
    assert.equal(evidence.length,1);assert.equal(delivered.at(-1).status,'ok');
  }finally{await mailbox.close();await rm(root,{recursive:true,force:true});}
});

const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_line_remove_order.lua',import.meta.url),'utf8');
function run(change='',callbackCode='callback({},true)',removeOnCallback=true){
  const script=`local order=(function() ${source} end)()
local sent=0;local callback=nil;local owner=8;local update=100;local vehicles={};local removed=false
local current={coordinationBinding={nonce=string.rep('a',32),roundId='round',phase='running',
 players={remote=8,host=7},nextSequence=1},
 watchdogLease={nonce=string.rep('a',32),companyEntity=7,phase='active',lastTick=10,expiresTick=20},
 coordinationReceipt={},preparationReceipt={},executionReceipt={}}
local state={get=function()return current end,set=function(_,value)current=value end}
local request={schemaVersion=1,protocolVersion=2,operation='prepare',commandType='road.line.remove',
 nonce=string.rep('a',32),roundId='round',operationId='op',originPlayerId='remote',
 requestMessageId='msg',hostSequence=1,scheduledUpdate=108,companyEntity=8,entity=101,clientSequence=1}
local api={type={ComponentType={PLAYER='PLAYER',PLAYER_OWNED='PLAYER_OWNED',LINE='LINE',GAME_TIME='GAME_TIME',GAME_SPEED='GAME_SPEED'},
 ['enum']={Carrier={ROAD=1}}},engine={util={getWorld=function()return 0 end,getPlayer=function()return 7 end},
 entityExists=function(id)return id==7 or id==8 or (id==101 and not removed)end,
 getComponent=function(id,kind)
  if kind=='GAME_TIME'then return{updateCount=update,tickCount=15}end
  if kind=='GAME_SPEED'then return{speedup=0}end
  if kind=='PLAYER'and (id==7 or id==8)then return{}end
  if kind=='PLAYER_OWNED'and id==101 then return{player=owner}end
  if kind=='LINE'and id==101 then return{stops={{stationGroup=201,station=0,terminal=0},
   {stationGroup=202,station=0,terminal=0}}}end
 end,system={lineSystem={getLines=function()return removed and {} or {101}end},
 transportVehicleSystem={getLineVehicles=function()return vehicles end},
 stationGroupSystem={getCarriers=function()return{{1}}end}}},
 cmd={makeLineDestroyCmd=function()return{}end,sendCommand=function(_,fn)sent=sent+1;callback=fn end}}
${change}
local prepared=order.prepare(state,request,api)
request.operation='executeHeld'
local armed=order.arm(state,request,api)
if armed then current.executionBarrier.phase='held' end
update=108
local executed=order.execute(state,request,api)
local duplicate=order.execute(state,request,api)
if callback then ${removeOnCallback?'removed=true':''};${callbackCode} end
local observed=order.observe(state,api)
return prepared,armed,executed,duplicate,observed,sent,
 current.executionReceipt.status or '',current.executionReceipt.stage or '',
 current.executionBarrier and current.executionBarrier.phase or '',current.coordinationBinding.phase`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,1_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,10,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {prepared:lua.lua_toboolean(L,-10),armed:lua.lua_toboolean(L,-9),
      executed:lua.lua_toboolean(L,-8),duplicate:lua.lua_toboolean(L,-7),
      observed:lua.lua_toboolean(L,-6),sent:lua.lua_tonumber(L,-5),
      status:lua.lua_tojsstring(L,-4),stage:lua.lua_tojsstring(L,-3),
      barrier:lua.lua_tojsstring(L,-2),phase:lua.lua_tojsstring(L,-1)};
  }finally{lua.lua_close(L)}
}
test('empty owned ROAD line gets one send and observed deletion',()=>{
  assert.deepEqual(run(),{prepared:true,armed:true,executed:true,duplicate:false,
    observed:true,sent:1,status:'ok',stage:'',barrier:'consumed',phase:'action_held'});
});
test('foreign or active line blocks prepare',()=>{
  for(const changed of ['owner=9','vehicles={500}']){
    const result=run(changed);
    assert.equal(result.prepared,false);assert.equal(result.sent,0);
  }
});
test('owner or vehicle change after prepare consumes attempt without send',()=>{
  for(const changed of ['owner=9','vehicles={500}']){
    const result=run(`local prior=order.arm;order.arm=function(...)local ok=prior(...);${changed};return ok end`);
    assert.equal(result.prepared,true);assert.equal(result.executed,false);
    assert.equal(result.sent,0);assert.equal(result.barrier,'consumed');
  }
});
test('callback alone and rejected callback cannot verify deletion',()=>{
  const present=run('','callback({},true)',false);
  assert.equal(present.status,'unknown');assert.equal(present.stage,'await_world');
  const rejected=run('','callback({},false)');
  assert.equal(rejected.status,'unknown');assert.equal(rejected.stage,'native_rejected_unknown');
});
test('synchronous callback cannot be overwritten by post-send stage',()=>{
  const result=run(`state.get=function()return current end
  state.set=function(_,value)current=value end
  api.cmd.sendCommand=function(_,fn)sent=sent+1;callback=fn;removed=true;fn({},true)end`);
  assert.equal(result.sent,1);assert.equal(result.observed,true);
  assert.equal(result.status,'ok');
});
