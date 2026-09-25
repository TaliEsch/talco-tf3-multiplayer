import test from 'node:test';
import assert from 'node:assert/strict';
import {HostAuthority,CommandQueue} from '../src/lockstep.mjs';
import {parseLineCreateOrderPayload} from '../src/line-create-order-payload.mjs';

const compatibility={sessionId:'line-test',buildHash:'a'.repeat(64),modManifestHash:'b'.repeat(64)};
const payload=()=>({companyEntity:101,stationA:730,stationB:731});
const code=expected=>error=>error.code===expected;
function fixture(options={}){
  const owners=new Map([[730,101],[731,101]]);
  const resolveEntityOwner=id=>owners.get(id)??null;
  const host=new HostAuthority({...compatibility,resolveEntityOwner,enableLineCreate:true,...options});
  const player=host.admit({...compatibility,displayName:'A'});
  host.bindCompanyEntity(player.playerId,101);
  const request=(overrides={})=>({messageId:'line-1',clientSequence:1,
    originPlayerId:player.playerId,targetCompanyEntity:101,targetEntity:730,
    commandType:'road.line.create',payload:payload(),...overrides});
  return {host,player,request,resolveEntityOwner,owners};
}
test('line payload is exact and names two distinct owned station entities',()=>{
  assert.deepEqual(parseLineCreateOrderPayload(payload(),101,730),payload());
  for(const changed of [{...payload(),companyEntity:102},{...payload(),stationA:732},
    {...payload(),stationB:730},{...payload(),stationB:0},{...payload(),extra:true}])
    assert.throws(()=>parseLineCreateOrderPayload(changed,101,730),/INVALID_LINE_CREATE_ORDER_PAYLOAD/);
});
test('host line admission is opt-in and checks both owners',()=>{
  const disabled=fixture({enableLineCreate:false});
  assert.throws(()=>disabled.host.accept(disabled.request(),100,disabled.player.playerId),code('UNSUPPORTED_COMMAND'));
  const f=fixture();
  f.owners.set(731,102);
  assert.throws(()=>f.host.accept(f.request(),100,f.player.playerId),code('NOT_OWNER'));
  f.owners.set(731,101);
  const accepted=f.host.accept(f.request({messageId:'line-2'}),100,f.player.playerId);
  assert.equal(accepted.commandType,'road.line.create');
  assert.deepEqual(accepted.payload,payload());
});
test('queue rechecks both station owners at admission and due update',()=>{
  const f=fixture();const accepted=f.host.accept(f.request(),100,f.player.playerId);
  const players=new Map([[f.player.playerId,101]]);
  assert.throws(()=>new CommandQueue().enqueue(accepted,players,f.resolveEntityOwner),code('AUTH_RECHECK_FAILED'));
  f.owners.set(731,102);
  assert.throws(()=>new CommandQueue({enableLineCreate:true}).enqueue(accepted,players,f.resolveEntityOwner),code('AUTH_RECHECK_FAILED'));
  f.owners.set(731,101);
  const queue=new CommandQueue({enableLineCreate:true});
  assert.equal(queue.enqueue(accepted,players,f.resolveEntityOwner),true);
  f.owners.set(730,102);
  assert.throws(()=>queue.due(accepted.scheduledUpdate),code('AUTH_RECHECK_FAILED'));
  assert.equal(queue.pendingCount,1);
});
