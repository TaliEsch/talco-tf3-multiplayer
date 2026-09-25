import test from 'node:test';
import assert from 'node:assert/strict';
import {HostAuthority,CommandQueue} from '../src/lockstep.mjs';
import {parseVehicleBuyOrderPayload} from '../src/vehicle-buy-order-payload.mjs';

const compatibility={sessionId:'vehicle-buy-test',buildHash:'a'.repeat(64),modManifestHash:'b'.repeat(64)};
const model='base::/vehicle/bus/test.mdl';
const payload=()=>({companyEntity:101,depotEntity:730,model});
const code=expected=>error=>error.code===expected;
function fixture(options={}){
  let owner=101;
  const resolveEntityOwner=entity=>entity===730?owner:null;
  const host=new HostAuthority({...compatibility,resolveEntityOwner,enableVehicleBuy:true,...options});
  const player=host.admit({...compatibility,displayName:'A'});
  host.bindCompanyEntity(player.playerId,101);
  const request=(overrides={})=>({messageId:'buy-1',clientSequence:1,
    originPlayerId:player.playerId,targetCompanyEntity:101,targetEntity:730,
    commandType:'road.vehicle.buy',payload:payload(),...overrides});
  return {host,player,request,resolveEntityOwner,setOwner:value=>{owner=value;}};
}

test('vehicle purchase parser accepts only the exact company, depot child and bounded model',()=>{
  assert.deepEqual(parseVehicleBuyOrderPayload(payload(),101,730),payload());
  assert.equal(Object.isFrozen(parseVehicleBuyOrderPayload(payload(),101,730)),true);
  for(const changed of [
    {...payload(),companyEntity:102},{...payload(),depotEntity:731},
    {...payload(),extra:true},{...payload(),model:'base::/vehicle/../test.mdl'},
    {...payload(),model:'bad;command.mdl'},{...payload(),model:'x'.repeat(257)},
  ])assert.throws(()=>parseVehicleBuyOrderPayload(changed,101,730),/INVALID_VEHICLE_BUY_ORDER_PAYLOAD/);
  assert.throws(()=>parseVehicleBuyOrderPayload(Object.create(null),101,730),/INVALID_VEHICLE_BUY_ORDER_PAYLOAD/);
});

test('host vehicle purchase is opt-in and requires live ownership of the depot child',()=>{
  const disabled=fixture({enableVehicleBuy:false});
  assert.throws(()=>disabled.host.accept(disabled.request(),100,disabled.player.playerId),code('UNSUPPORTED_COMMAND'));
  const f=fixture();
  assert.throws(()=>f.host.accept(f.request({messageId:'missing',targetEntity:731}),100,f.player.playerId,101),code('OWNERSHIP_UNAVAILABLE'));
  f.setOwner(102);
  assert.throws(()=>f.host.accept(f.request({messageId:'foreign'}),100,f.player.playerId,101),code('NOT_OWNER'));
  f.setOwner(101);
  assert.throws(()=>f.host.accept(f.request({messageId:'mismatch',payload:{...payload(),depotEntity:731}}),100,f.player.playerId),code('BAD_VEHICLE_BUY_PAYLOAD'));
  const accepted=f.host.accept(f.request(),100,f.player.playerId);
  assert.equal(accepted.commandType,'road.vehicle.buy');
  assert.equal(accepted.targetEntity,730);
  assert.deepEqual(accepted.payload,payload());
  assert.equal(Object.isFrozen(accepted.payload),true);
});

test('queue revalidates depot ownership at admission and immediately before due execution',()=>{
  const f=fixture();
  const accepted=f.host.accept(f.request(),100,f.player.playerId);
  const players=new Map([[f.player.playerId,101]]);
  assert.throws(()=>new CommandQueue().enqueue(accepted,players,f.resolveEntityOwner),code('AUTH_RECHECK_FAILED'));
  const queue=new CommandQueue({enableVehicleBuy:true});
  f.setOwner(102);
  assert.throws(()=>queue.enqueue(accepted,players,f.resolveEntityOwner),code('AUTH_RECHECK_FAILED'));
  f.setOwner(101);
  const mutable={...accepted,payload:{...accepted.payload}};
  assert.equal(queue.enqueue(mutable,players,f.resolveEntityOwner),true);
  mutable.payload.model='base::/vehicle/bus/other.mdl';
  f.setOwner(null);
  assert.throws(()=>queue.due(accepted.scheduledUpdate),code('AUTH_RECHECK_FAILED'));
  assert.equal(queue.pendingCount,1);
});

test('accepted purchase is dispatched exactly once when ownership remains valid',()=>{
  const f=fixture();
  const accepted=f.host.accept(f.request(),100,f.player.playerId);
  const queue=new CommandQueue({enableVehicleBuy:true});
  assert.equal(queue.enqueue(accepted,new Map([[f.player.playerId,101]]),f.resolveEntityOwner),true);
  assert.deepEqual(queue.due(accepted.scheduledUpdate-1),[]);
  assert.deepEqual(queue.due(accepted.scheduledUpdate),[accepted]);
  assert.deepEqual(queue.due(accepted.scheduledUpdate),[]);
});
