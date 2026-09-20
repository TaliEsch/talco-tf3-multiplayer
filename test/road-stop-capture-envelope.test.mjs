import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRoadStopCaptureEnvelope as parse,ROAD_STOP_ENVELOPE_MAX_BYTES} from '../src/road-stop-capture-envelope.mjs';
import {parseRoadStopCapture} from '../src/road-stop-capture.mjs';
import {roadStopCaptureFixture} from './fixtures/road-stop-capture.mjs';
const json=JSON.stringify(roadStopCaptureFixture());
const hex=Buffer.from(json).toString('hex');
const source=`function data()\nreturn {schemaVersion=1,observerRevision=7,kind="native_road_stop_capture",stage="create",sequence=1,captureHex="${hex}",}\nend`;
const modelName='models/station/road_stop.mdl';
const v2Source=(name=modelName)=>`function data() return {schemaVersion=2,observerRevision=7,kind="native_road_stop_capture",stage="apply",sequence=2,captureHex="${hex}",modelNameHex="${Buffer.from(name).toString('hex')}",} end`;

test('diagnostic envelope preserves complete canonical capture without granting authority',()=>{
  const result=parse(source),expected=parseRoadStopCapture(json);
  assert.deepEqual(result,{observerRevision:7,stage:'create',sequence:1,...expected,
    freshnessVerified:false,reconstructionVerified:false,executionAuthorized:false});
  assert.equal(parse(source.replace('stage="create"','stage="apply"')).stage,'apply');
  assert.equal(parse(source.replace('schemaVersion=1,','').replace('sequence=1,','sequence=1,schemaVersion=1,')).digest,expected.digest);
});

test('v2 diagnostic envelope carries a strict copied model resource identity',()=>{
  const result=parse(v2Source());
  assert.deepEqual(result.modelResource,{modelId:7,resourceName:modelName});
  assert.equal(result.executionAuthorized,false);
  for(const value of [v2Source('').replace('modelNameHex=""','modelNameHex=""'),
    v2Source().replace('modelNameHex="','modelNameHex="g'),v2Source('models/../road_stop.mdl'),
    v2Source('/models/road_stop.mdl'),v2Source('models\\road_stop.mdl'),
    v2Source(`${'a'.repeat(1021)}.mdl`),v2Source().replace('return {','return {extra=1,'),
    v2Source().replace('modelNameHex=','otherNameHex=')])assert.throws(()=>parse(value),/^TypeError: INVALID_ROAD_STOP_CAPTURE_ENVELOPE$/);
});

test('diagnostic envelope rejects executable Lua, duplicate fields and unsupported metadata',()=>{
  for(const value of [
    source+'\nos.execute("secret")',source.replace('return {','return {extra=1,'),
    source.replace('return {','return {sequence=2,'),source.replace('observerRevision=7','observerRevision=6'),
    source.replace('sequence=1','sequence=17'),source.replace('sequence=1','sequence="1"'),
    source.replace('sequence=1','sequence=01'),source.replace('stage="create"','stage="execute"'),
    source.replace('schemaVersion=1,',''),source.replace('captureHex="','captureHex="g'),
    source.replace(hex,'ff'),source.replace(hex,'1'),source.replace(hex,Buffer.from('{}').toString('hex')),
    ' '.repeat(ROAD_STOP_ENVELOPE_MAX_BYTES+1),null,
  ])assert.throws(()=>parse(value),/^TypeError: INVALID_ROAD_STOP_CAPTURE_ENVELOPE$/);
});

test('large diagnostic captures do not relax the gameplay IPC bounds',async()=>{
  const {parseFlatDataFile}=await import('../src/userdata-ipc.mjs');
  assert.ok(Buffer.byteLength(source)>4096);
  assert.throws(()=>parseFlatDataFile(source),/4096 bytes/);
});
