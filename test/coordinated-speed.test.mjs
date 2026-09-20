import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionCoordinator} from '../src/session-coordinator.mjs';
import {encodeAsyncEngineRequest,decodeAsyncEngineRequest} from '../src/async-engine-mailbox.mjs';

const players=[{playerId:'a',companyEntity:1},{playerId:'b',companyEntity:2}];
const checkpointHash='a'.repeat(64),nonce='b'.repeat(32);
for(const speedup of [1,2,4])test(`coordinator waits for both actual ${speedup}x release receipts`,()=>{
  const events=[];
  const c=new SessionCoordinator({requireReleaseAck:true,now:()=>0,broadcast:(kind,payload)=>events.push({kind,payload})});
  c.setResumeSpeed(speedup);c.prepare(players,{updateCount:100,checkpointHash});
  assert.throws(()=>c.setResumeSpeed(1),/before the next barrier/);
  for(const p of players)c.ready(p.playerId,{roundId:c.roundId,updateCount:100,checkpointHash,companyEntity:p.companyEntity});
  assert.equal(events.at(-1).payload.speedup,speedup);
  const receipt={roundId:c.roundId,hostSequence:0,releaseUpdate:100,updateCount:100,speedup};
  c.released('a',receipt);assert.equal(c.phase,'awaiting_release');
  c.released('b',receipt);assert.equal(c.phase,'running');
});
for(const speedup of [undefined,1,0,8])test(`wrong or absent speed ${speedup} cannot acknowledge requested 2x`,()=>{
  const c=new SessionCoordinator({requireReleaseAck:true,now:()=>0});
  c.setResumeSpeed(2);c.prepare(players,{updateCount:100,checkpointHash});
  for(const p of players)c.ready(p.playerId,{roundId:c.roundId,updateCount:100,checkpointHash,companyEntity:p.companyEntity});
  assert.throws(()=>c.released('a',{roundId:c.roundId,hostSequence:0,releaseUpdate:100,updateCount:100,
    ...(speedup===undefined?{}:{speedup})}),/INVALID_RELEASE_ACK/);
  assert.equal(c.phase,'halted');
});
test('speed codec is bounded and lossless; pause is not a release',()=>{
  const request={schemaVersion:1,roundId:'round',operationId:'operation',operation:'release',updateCount:100};
  for(const speedup of [1,2,4])assert.deepEqual(decodeAsyncEngineRequest(encodeAsyncEngineRequest({...request,speedup},nonce),nonce),{...request,speedup});
  for(const speedup of [0,-1,3,8,1.5,'2',null])assert.throws(()=>encodeAsyncEngineRequest({...request,speedup},nonce));
  assert.throws(()=>new SessionCoordinator().setResumeSpeed(2));
});
