import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {prepareDisposableStartupLoad,serializeStartupLoadRequest} from '../src/startup-load.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';

test('startup request serialization is bounded and exact',()=>{
  const text=serializeStartupLoadRequest({nonce:'a'.repeat(32),saveName:`tf3mp_disposable_${'b'.repeat(32)}`,expectedBytes:7,expectedSha256:'c'.repeat(64)});
  assert.deepEqual({...parseFlatDataFile(text)},{schemaVersion:1,nonce:'a'.repeat(32),saveName:`tf3mp_disposable_${'b'.repeat(32)}`,expectedBytes:7,expectedSha256:'c'.repeat(64)});
  assert.throws(()=>serializeStartupLoadRequest({nonce:'x',saveName:'comp',expectedBytes:0,expectedSha256:'x'}),/invalid/);
});

test('preparer creates an exclusive verified disposable copy and one-shot request',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-startup-')),save=path.join(root,'save'),bridge=path.join(root,'tf3mp_status_1');
  await Promise.all([mkdir(save),mkdir(bridge)]);
  const source=path.join(save,'source.sav');
  await writeFile(source,Buffer.from('disposable-test-save'));
  const result=await prepareDisposableStartupLoad({sourceSave:source,saveDirectory:save,bridgeDirectory:bridge});
  assert.equal(path.dirname(result.path),await realpath(save));
  assert.match(path.basename(result.path),/^tf3mp_disposable_[a-f0-9]{32}\.sav$/);
  assert.deepEqual(await readFile(result.path),await readFile(source));
  assert.equal((await stat(result.requestPath)).isFile(),true);
  const request=parseFlatDataFile(await readFile(result.requestPath,'utf8'));
  assert.equal(request.saveName,result.saveName);assert.equal(request.expectedBytes,result.bytes);assert.equal(request.expectedSha256,result.sha256);
  await assert.rejects(prepareDisposableStartupLoad({sourceSave:source,saveDirectory:save,bridgeDirectory:bridge}),/EEXIST/);
});
