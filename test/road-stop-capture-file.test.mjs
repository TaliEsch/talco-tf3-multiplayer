import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {roadStopCaptureFixture} from './fixtures/road-stop-capture.mjs';
import {parseRoadStopCapture} from '../src/road-stop-capture.mjs';

const run=promisify(execFile);
const script=fileURLToPath(new URL('../tools/check-road-stop-capture.mjs',import.meta.url));

test('offline checker reports a valid digest without authorizing execution or printing geometry',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'tf3mp-capture-file-'));
  const filename=path.join(root,'capture.json');
  try{
    const source=JSON.stringify(roadStopCaptureFixture());await writeFile(filename,source);
    const {stdout,stderr}=await run(process.execPath,[script,filename]);
    assert.equal(stderr,'');
    assert.deepEqual(JSON.parse(stdout),{schemaVersion:1,code:'OFFLINE_CAPTURE_VALID',
      digest:parseRoadStopCapture(source).digest,addedSegments:1,removedSegments:1,edgeObjects:1,
      nativeCaptureVerified:false,reconstructionVerified:false,executionAuthorized:false});
    assert.equal(stdout.includes('street/standard'),false);
  }finally{await rm(root,{recursive:true,force:true});}
});
for(const [name,bytes] of [
  ['invalid JSON',Buffer.from('private-secret-and-invalid-json')],
  ['wrong schema',Buffer.from('{"private":"secret","schemaVersion":999}')],
  ['oversized',Buffer.alloc(256*1024+1,65)],
  ['invalid UTF8',Buffer.from([0xff,0xfe])],
])test(`offline capture checker rejects ${name} without exposing contents`,async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'tf3mp-capture-file-'));
  const filename=path.join(root,'capture.json');
  try{
    await writeFile(filename,bytes);
    await assert.rejects(run(process.execPath,[script,filename]),error=>{
      assert.equal(error.code,1);
      assert.equal(error.stdout,'');
      assert.equal(error.stderr.trim(),'ROAD_STOP_CAPTURE_INVALID_OR_UNREADABLE');
      return true;
    });
  }finally{await rm(root,{recursive:true,force:true});}
});

test('offline capture checker requires exactly one input path',async()=>{
  for(const args of [[],['one','two']])await assert.rejects(run(process.execPath,[script,...args]),error=>{
    assert.equal(error.code,1);assert.equal(error.stdout,'');
    assert.match(error.stderr,/^Usage: node tools\/check-road-stop-capture\.mjs/);return true;
  });
});
