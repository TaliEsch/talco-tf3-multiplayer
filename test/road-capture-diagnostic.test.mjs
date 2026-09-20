import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,utimes} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {parseRoadCaptureDiagnostic,previewRoadStopReplayCaptureDiagnostics,beginRoadStopReplayRecording,finishRoadStopReplayRecording} from '../src/road-stop-replay-session.mjs';
import {roadStopCaptureFixture} from './fixtures/road-stop-capture.mjs';

const source=(stage='create',issues='RoadShapeMismatch')=>`function data() return {schemaVersion=1,kind="road_capture_diagnostic",stage="${stage}",sequence=1,issues="${issues}",} end`;

test('road capture diagnostics accept only bounded inert userdata literals',()=>{
  assert.deepEqual(parseRoadCaptureDiagnostic(source('apply','RoadShapeMismatch_OwnerMismatch')),
    {schemaVersion:1,kind:'road_capture_diagnostic',stage:'apply',sequence:1,issues:'RoadShapeMismatch_OwnerMismatch'});
  for(const invalid of [source('create',''),source('create','bad-token'),source('create','a_'.repeat(24)+'a'),
    'return {schemaVersion=1,kind="road_capture_diagnostic",stage="create",sequence=1,issues="Issue",}',
    source().replace('sequence=1','sequence=17'),source().replace('kind="road_capture_diagnostic",','kind="road_capture_diagnostic",kind="road_capture_diagnostic",')])
    assert.throws(()=>parseRoadCaptureDiagnostic(invalid),/INVALID_ROAD_CAPTURE_DIAGNOSTIC/);
});

test('read-only capture preview only reports a fresh create mismatch and never readiness',async()=>{
  const bridge=await mkdtemp(path.join(tmpdir(),'tf3mp-road-diagnostic-'));
  const started=Date.now();
  assert.deepEqual(await previewRoadStopReplayCaptureDiagnostics({bridgeDirectory:bridge,freshAfter:started}),{status:'CAPTURE_NOT_AVAILABLE'});
  const filename=path.join(bridge,'road_capture_diagnostic_create.lua');
  await writeFile(filename,source());
  await utimes(filename,new Date(started-2000),new Date(started-2000));
  assert.deepEqual(await previewRoadStopReplayCaptureDiagnostics({bridgeDirectory:bridge,freshAfter:started}),{status:'CAPTURE_DIAGNOSTICS_STALE'});
  await utimes(filename,new Date(started+2000),new Date(started+2000));
  assert.deepEqual(await previewRoadStopReplayCaptureDiagnostics({bridgeDirectory:bridge,freshAfter:started}),{status:'CAPTURE_UNSUPPORTED',issues:'RoadShapeMismatch'});
});

const identity={saveSha256:'a'.repeat(64),gameSha256:'b'.repeat(64),modManifestSha256:'c'.repeat(64)};
const capture=()=>`function data() return {schemaVersion=2,observerRevision=7,kind="native_road_stop_capture",stage="apply",sequence=2,captureHex="${Buffer.from(JSON.stringify(roadStopCaptureFixture())).toString('hex')}",modelNameHex="${Buffer.from('models/station/road_stop.mdl').toString('hex')}",} end`;

test('stale apply diagnostic does not block a fresh valid capture, while missing capture is explicit',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'tf3mp-road-diagnostic-finish-'));
  const bridge=path.join(root,'bridge'),output=path.join(root,'output');
  await mkdir(bridge);
  await writeFile(path.join(bridge,'road_capture_diagnostic_apply.lua'),source('apply'));
  await beginRoadStopReplayRecording({directory:output,bridgeDirectory:bridge,checkpoint:identity,companyEntity:10});
  await assert.rejects(finishRoadStopReplayRecording({directory:output,bridgeDirectory:bridge}),/CAPTURE_NOT_AVAILABLE/);
  await writeFile(path.join(bridge,'road_capture_apply.lua'),capture());
  const future=new Date(Date.now()+2000);await utimes(path.join(bridge,'road_capture_apply.lua'),future,future);
  const artifact=await finishRoadStopReplayRecording({directory:output,bridgeDirectory:bridge});
  assert.equal(typeof artifact.digest,'string');
});
