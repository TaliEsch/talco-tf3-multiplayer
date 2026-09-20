import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionCoordinator} from '../src/session-coordinator.mjs';
import {AsyncSessionParticipant} from '../src/async-session-participant.mjs';
import {encodeAsyncEngineRequest,decodeAsyncEngineRequest} from '../src/async-engine-mailbox.mjs';
const digest='a'.repeat(64),nonce='b'.repeat(32);

test('capture wire contract contains no invented expected hash and round-trips strictly',()=>{
  const request={schemaVersion:1,roundId:'r',operationId:'capture',operation:'holdCheckpoint',updateCount:140};
  const wire=encodeAsyncEngineRequest(request,nonce);
  assert.doesNotMatch(wire,/checkpointHash/);
  assert.deepEqual(decodeAsyncEngineRequest(wire,nonce),request);
  assert.throws(()=>encodeAsyncEngineRequest({...request,checkpointHash:null},nonce));
});

for(const count of [2,4])for(const divergence of [false,true])test(`${count} observed checkpoints require agreement before any release; mismatch=${divergence}`,()=>{
  const companies=new Map(Array.from({length:count},(_,i)=>['p'+i,10+i]));
  const players=[...companies].map(([playerId,companyEntity])=>({playerId,companyEntity}));
  const network=[],engines=new Map(),participants=new Map(),outgoing=[];
  const coordinator=new SessionCoordinator({now:()=>0,requireReleaseAck:true,broadcast:(kind,payload)=>network.push({kind,payload})});
  for(const [playerId] of companies){
    const requests=[];engines.set(playerId,requests);
    const participant=new AsyncSessionParticipant({playerId,companies,requireEngineBinding:true,now:()=>0,
      publish:r=>requests.push(r),disconnect:()=>{},send:(kind,payload)=>outgoing.push({playerId,kind,payload})});
    participant.observe({updateCount:100,held:false});participants.set(playerId,participant);
  }
  coordinator.capture(players,{updateCount:140});
  const capture=network.shift();assert.equal(capture.kind,'coordination_capture');assert.equal(Object.hasOwn(capture.payload,'checkpointHash'),false);
  let i=0;
  for(const [playerId,p] of participants){
    p.receive(capture.kind,capture.payload);
    const requests=engines.get(playerId),bind=requests.at(-1);
    const base=r=>({schemaVersion:1,roundId:r.roundId,operationId:r.operationId,operation:r.operation,status:'ok',updateCount:104,held:false});
    p.receiveEngine(base(bind));const hold=requests.at(-1);
    assert.equal(hold.operation,'holdCheckpoint');assert.equal(Object.hasOwn(hold,'checkpointHash'),false);
    const actual=divergence&&i===count-1?'c'.repeat(64):digest;
    p.receiveEngine({...base(hold),updateCount:140,held:true,checkpointHash:actual});
    const ready=outgoing.shift();assert.equal(ready.kind,'participant_ready');
    if(divergence&&i===count-1)assert.throws(()=>coordinator.ready(playerId,ready.payload),/CHECKPOINT_MISMATCH/);
    else coordinator.ready(playerId,ready.payload);
    assert.equal(requests.some(r=>r.operation==='release'),false);
    i++;
  }
  if(divergence){assert.equal(coordinator.phase,'halted');assert.equal(network.some(m=>m.kind==='coordination_ready'),false);return;}
  const ready=network.find(m=>m.kind==='coordination_ready');assert.equal(ready.payload.checkpointHash,digest);
  assert.equal(coordinator.phase,'awaiting_release');
  for(const [playerId,p] of participants){p.receive(ready.kind,ready.payload);assert.equal(engines.get(playerId).at(-1).operation,'release');}
});

test('duplicate readiness cannot replace the candidate digest or count as a second participant',()=>{
  const c=new SessionCoordinator({now:()=>0});
  c.capture([{playerId:'a',companyEntity:1},{playerId:'b',companyEntity:2}],{updateCount:100});
  const p={roundId:c.roundId,companyEntity:1,updateCount:100,checkpointHash:digest};
  c.ready('a',p);assert.equal(c.phase,'preparing');
  assert.throws(()=>c.ready('a',p),/CHECKPOINT_MISMATCH/);assert.equal(c.phase,'halted');
});
