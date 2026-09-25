import test from 'node:test';
import assert from 'node:assert/strict';
import {HostAuthority,CommandQueue} from '../src/lockstep.mjs';
import {parseVehicleLineAssignOrderPayload} from '../src/vehicle-line-assign-order-payload.mjs';
import {encodeAsyncEngineRequest,decodeAsyncEngineRequest} from '../src/async-engine-mailbox.mjs';
import {decodeVehicleLineAssignExecutionReceipt} from '../src/coordinator-vehicle-line-assign-execution.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAsyncEngineMailbox} from '../src/async-engine-mailbox.mjs';

const compatibility={sessionId:'assign-test',buildHash:'a'.repeat(64),modManifestHash:'b'.repeat(64)};
const payload={companyEntity:101,vehicleEntity:730,lineEntity:731};
const nonce='a'.repeat(32);
const code=expected=>error=>error.code===expected;
function fixture(options={}){
  const owners=new Map([[730,101],[731,101]]);
  const owner=id=>owners.get(id)??null;
  const host=new HostAuthority({...compatibility,resolveEntityOwner:owner,enableVehicleLineAssign:true,...options});
  const player=host.admit({...compatibility,displayName:'A'});
  host.bindCompanyEntity(player.playerId,101);
  const request=(overrides={})=>({messageId:'assign-1',clientSequence:1,
    originPlayerId:player.playerId,targetCompanyEntity:101,targetEntity:730,
    commandType:'road.vehicle.assignLine',payload,...overrides});
  return {host,player,request,owner,owners};
}
test('assignment payload is exact and bound to vehicle and company',()=>{
  assert.deepEqual(parseVehicleLineAssignOrderPayload(payload,101,730),payload);
  for(const changed of [{...payload,companyEntity:102},{...payload,vehicleEntity:732},
    {...payload,lineEntity:730},{...payload,lineEntity:0},{...payload,extra:1}])
    assert.throws(()=>parseVehicleLineAssignOrderPayload(changed,101,730));
});
test('host and queue require capability and recheck both owners at execution',()=>{
  const disabled=fixture({enableVehicleLineAssign:false});
  assert.throws(()=>disabled.host.accept(disabled.request(),100,disabled.player.playerId),code('UNSUPPORTED_COMMAND'));
  const f=fixture();f.owners.set(731,102);
  assert.throws(()=>f.host.accept(f.request(),100,f.player.playerId),code('NOT_OWNER'));
  f.owners.set(731,101);
  const accepted=f.host.accept(f.request({messageId:'assign-2'}),100,f.player.playerId);
  const players=new Map([[f.player.playerId,101]]);
  assert.throws(()=>new CommandQueue().enqueue(accepted,players,f.owner),code('AUTH_RECHECK_FAILED'));
  const queue=new CommandQueue({enableVehicleLineAssign:true});
  assert.equal(queue.enqueue(accepted,players,f.owner),true);
  f.owners.set(730,102);
  assert.throws(()=>queue.due(accepted.scheduledUpdate),code('AUTH_RECHECK_FAILED'));
  assert.equal(queue.pendingCount,1);
});
test('flat wire is opt-in and contains one line entity',()=>{
  const f=fixture();const command=f.host.accept(f.request(),100,f.player.playerId);
  for(const operation of ['prepare','executeHeld']){
    const request={schemaVersion:1,roundId:'round',operationId:operation,operation,command};
    assert.throws(()=>encodeAsyncEngineRequest(request,nonce));
    const source=encodeAsyncEngineRequest(request,nonce,{enableVehicleLineAssign:true});
    const flat=parseFlatDataFile(source);
    assert.equal(flat.entity,730);assert.equal(flat.lineEntity,731);
    assert.equal(Object.keys(flat).length,15);
    assert.deepEqual(decodeAsyncEngineRequest(source,nonce,{enableVehicleLineAssign:true}),request);
    assert.throws(()=>decodeAsyncEngineRequest(source,nonce));
  }
});
test('receipt requires observed held vehicle and line owners',()=>{
  const receipt={schemaVersion:1,nonce,roundId:'round',operationId:'executeHeld',
    operation:'executeHeld',status:'ok',updateCount:108,held:true,snapshotVersion:5,
    hostSequence:1,entity:730,vehicleEntity:730,lineEntity:731,
    ownerCompanyEntity:101,lineOwnerCompanyEntity:101};
  assert.equal(decodeVehicleLineAssignExecutionReceipt(receipt).state.vehicle.lineEntity,731);
  for(const bad of [{vehicleEntity:732},{lineOwnerCompanyEntity:102},
    {held:false},{snapshotVersion:4},{extra:1}]){
    assert.throws(()=>decodeVehicleLineAssignExecutionReceipt({...receipt,...bad}));
  }
});
test('mailbox rejects an unrelated assignment receipt',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-assign-'));
  const directory=path.join(root,'tf3mp_status_1');await mkdir(directory);
  const f=fixture();const command=f.host.accept(f.request(),100,f.player.playerId);
  const request={schemaVersion:1,roundId:'round',operationId:'executeHeld',operation:'executeHeld',command};
  const receipt={schemaVersion:1,nonce,roundId:'round',operationId:'executeHeld',
    operation:'executeHeld',status:'ok',updateCount:command.scheduledUpdate,held:true,
    snapshotVersion:5,hostSequence:command.hostSequence,entity:730,vehicleEntity:730,
    lineEntity:731,ownerCompanyEntity:101,lineOwnerCompanyEntity:101};
  const evidence=[];const delivered=[];
  const mailbox=await createAsyncEngineMailbox({directory,nonce,enableVehicleLineAssign:true,
    onExecutionEvidence:value=>evidence.push(value)});
  const participant={receiveEngine:value=>{delivered.push(value);return true;}};
  const write=async value=>writeFile(path.join(directory,'coordination_receipt.lua'),
    `function data() return {${Object.entries(value).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`);
  try{
    await mailbox.publish(request);
    await write({...receipt,lineEntity:732});await mailbox.poll(participant);
    assert.equal(evidence.length,0);assert.equal(delivered.at(-1).status,'unknown');
    await write(receipt);await mailbox.poll(participant);
    assert.equal(evidence.length,1);assert.equal(delivered.at(-1).status,'ok');
  }finally{await mailbox.close();await rm(root,{recursive:true,force:true});}
});
