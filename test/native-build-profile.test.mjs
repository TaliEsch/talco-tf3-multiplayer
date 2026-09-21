import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateStaticBuildProfile,fingerprintStaticCandidates} from '../src/native-build-profile.mjs';

const candidate={label:'simulationStep',stringRva:20,referenceInstructionRva:10,
  functionRange:{beginRva:8,endRva:16},functionRangeSha256:'a'.repeat(64),
  primaryFunctionRange:{beginRva:8,endRva:16},unwindChainDepth:0,unwindVersion:1,
  unwindFlags:0,unwindHandlerRva:null,
  evidence:'static-candidate-only',hookReady:false};
const fingerprint=fingerprintStaticCandidates([candidate]);
const profile={profileVersion:1,executableSha256:'b'.repeat(64),peTimestamp:2,sizeOfImage:3,
  candidateCount:1,candidateEvidenceSha256:fingerprint};

test('exact static profile match remains explicitly non-activating',()=>{
  const result=evaluateStaticBuildProfile({sha256:'b'.repeat(64),peTimestamp:2,sizeOfImage:3,candidates:[candidate]},profile);
  assert.equal(result.matched,true);
  assert.equal(result.activationPermitted,false);
  assert.deepEqual(result.mismatches,[]);
  assert.match(result.requiredNextGate,/in-memory/);
});

test('profile comparison fails closed for identity, evidence and malformed candidates',()=>{
  const wrong=evaluateStaticBuildProfile({sha256:'c'.repeat(64),peTimestamp:4,sizeOfImage:5,
    candidates:[{...candidate,functionRangeSha256:'d'.repeat(64)}]},profile);
  assert.equal(wrong.matched,false);
  assert.deepEqual(wrong.mismatches,['executable_sha256','pe_timestamp','size_of_image','candidate_evidence']);
  const malformed=evaluateStaticBuildProfile({sha256:profile.executableSha256,peTimestamp:2,sizeOfImage:3,
    candidates:[{...candidate,hookReady:true}]},profile);
  assert.deepEqual(malformed.mismatches,['candidate_shape','candidate_evidence']);
  assert.equal(malformed.activationPermitted,false);
});

test('candidate fingerprint is order invariant and rejects unsafe shapes',()=>{
  const other={...candidate,label:'simulationApplyCommand',referenceInstructionRva:30};
  assert.equal(fingerprintStaticCandidates([candidate,other]),fingerprintStaticCandidates([other,candidate]));
  assert.throws(()=>fingerprintStaticCandidates([{...candidate,functionRangeSha256:null}]),/INVALID_STATIC_CANDIDATE/);
  assert.throws(()=>fingerprintStaticCandidates([{...candidate,functionRange:{beginRva:9,endRva:9}}]),/INVALID_STATIC_CANDIDATE/);
});
