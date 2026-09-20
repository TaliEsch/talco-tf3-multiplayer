import test from 'node:test';
import assert from 'node:assert/strict';
import {roadStopCaptureFixture} from './fixtures/road-stop-capture.mjs';
import {createRoadStopReplayCase,parseRoadStopReplayCase,checkRoadStopReplayIdentity,checkRoadStopReplayResource,ROAD_STOP_REPLAY_CASE_MAX_BYTES} from '../src/road-stop-replay-case.mjs';
const identity={saveSha256:'a'.repeat(64),gameSha256:'b'.repeat(64),modManifestSha256:'c'.repeat(64)};
const modelResource={modelId:7,resourceName:'models/station/road_stop.mdl'};
function envelope(stage='apply',capture=roadStopCaptureFixture()){
  return `function data() return {schemaVersion=1,observerRevision=7,kind="native_road_stop_capture",stage="${stage}",sequence=2,captureHex="${Buffer.from(JSON.stringify(capture)).toString('hex')}",} end`;
}
const make=(overrides={})=>createRoadStopReplayCase({applyEnvelope:envelope(),checkpoint:identity,companyEntity:10,modelResource,...overrides});
test('replay artifact binds apply capture, original company, model resource and pre-placement checkpoint without granting execution',()=>{
  const result=make();
  assert.deepEqual(parseRoadStopReplayCase(result.canonical),result);
  assert.equal(result.executionAuthorized,false);assert.equal(result.loadedCheckpointVerified,false);
  assert.deepEqual(checkRoadStopReplayIdentity(result.canonical,identity),{caseDigest:result.digest,identityMatches:true,executionAuthorized:false,loadedCheckpointVerified:false});
  assert.deepEqual(checkRoadStopReplayResource(result.canonical,modelResource),{caseDigest:result.digest,resourceIdentityMatches:true,executionAuthorized:false,loadedCheckpointVerified:false});
});
test('preview/cancel, malformed capture and a different stop company cannot become replay cases',()=>{
  assert.throws(()=>make({applyEnvelope:envelope('create')}));
  assert.throws(()=>make({companyEntity:11}));
  for(const value of [0,-1,1.5,2147483648,'10'])assert.throws(()=>make({companyEntity:value}));
  assert.throws(()=>make({applyEnvelope:'function data() os.execute("bad") end'}));
});
test('replay cases preserve distinct road owners and never reassign ownership implicitly',()=>{
  const capture=roadStopCaptureFixture();capture.proposal.street.addedSegments[0].playerOwned.player=20;
  const result=make({applyEnvelope:envelope('apply',capture)});
  assert.equal(result.case.capture.proposal.street.addedSegments[0].playerOwned.player,20);
  assert.equal(result.case.companyEntity,10);
});
test('checkpoint and compatibility mismatch reject before any execution permission',()=>{
  const result=make();
  for(const key of Object.keys(identity)){
    assert.throws(()=>checkRoadStopReplayIdentity(result.canonical,{...identity,[key]:'d'.repeat(64)}),/MISMATCH/);
    assert.throws(()=>make({checkpoint:{...identity,[key]:'not-a-hash'}}));
  }
  assert.throws(()=>make({checkpoint:{...identity,loaded:true}}));
  assert.throws(()=>make({checkpoint:{'gameSha256,modManifestSha256,saveSha256':'a'.repeat(64)}}));
});
test('resource identity is required, exact and cannot infer a name from a numeric model id',()=>{
  const result=make();
  assert.throws(()=>make({modelResource:undefined}));
  assert.throws(()=>make({modelResource:{modelId:8,resourceName:modelResource.resourceName}}));
  assert.throws(()=>checkRoadStopReplayResource(result.canonical,{modelId:7,resourceName:'models/station/other_stop.mdl'}),/RESOURCE_MISMATCH/);
  assert.throws(()=>checkRoadStopReplayResource(result.canonical,{modelId:8,resourceName:modelResource.resourceName}),/RESOURCE_MISMATCH/);
  for(const resourceName of ['/models/road_stop.mdl','models/../road_stop.mdl','models\\road_stop.mdl','models/road_stop.lua','models/road\0stop.mdl',`${'a'.repeat(1021)}.mdl`])
    assert.throws(()=>make({modelResource:{modelId:7,resourceName}}));
  for(const bad of [{modelId:'7',resourceName:modelResource.resourceName},{modelId:7.5,resourceName:modelResource.resourceName},{modelId:-1,resourceName:modelResource.resourceName},{modelId:2147483648,resourceName:modelResource.resourceName},{modelId:7,resourceName:modelResource.resourceName,extra:true}])
    assert.throws(()=>make({modelResource:bad}));
});
test('tampered, oversized and extended replay artifacts reject',()=>{
  const result=make(),base=JSON.parse(result.canonical);
  for(const alter of [v=>v.companyEntity=11,v=>v.checkpoint.saveSha256='d'.repeat(64),
    v=>v.capture.proposal.street.edgeObjectsToAdd[0].left=false,v=>v.digest='0'.repeat(64),
    v=>v.executionAuthorized=true,v=>delete v.captureDigest,v=>v.modelResource.resourceName='models/station/other_stop.mdl',
    v=>{v.schemaVersion=1;delete v.modelResource;}]){
    const copy=structuredClone(base);alter(copy);assert.throws(()=>parseRoadStopReplayCase(JSON.stringify(copy)));
  }
  assert.throws(()=>parseRoadStopReplayCase(' '.repeat(ROAD_STOP_REPLAY_CASE_MAX_BYTES+1)));
  assert.throws(()=>parseRoadStopReplayCase('{'));
});
