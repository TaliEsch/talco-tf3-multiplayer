import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerProofClockCurrent,MAX_VEHICLE_OWNER_PROOF_LAG_UPDATES as MAX} from '../src/vehicle-owner-proof.mjs';

test('running owner proof is bounded and paused proof stays exact',()=>{
  assert.equal(ownerProofClockCurrent({issuedUpdate:50,receiptUpdate:52,hostUpdate:52+MAX,paused:false}),true);
  assert.equal(ownerProofClockCurrent({issuedUpdate:50,receiptUpdate:52,hostUpdate:53,paused:false}),true);
  assert.equal(ownerProofClockCurrent({issuedUpdate:50,receiptUpdate:50,hostUpdate:50,paused:true}),true);
  for(const [issuedUpdate,receiptUpdate,hostUpdate,paused] of [
    [50,49,50,false],[50,52,51,false],[50,52,53,true],[50,50,51,true],
    [50,52,52+MAX+1,false],
  ])assert.equal(ownerProofClockCurrent({issuedUpdate,receiptUpdate,hostUpdate,paused}),false);
});
