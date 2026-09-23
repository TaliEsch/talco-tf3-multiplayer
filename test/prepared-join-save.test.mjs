import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyPreparedJoinSave } from '../src/prepared-join-save.mjs';
import { startSaveServer } from '../src/save-transfer.mjs';

const execFileAsync=promisify(execFile);

test('prepared Join save must be the exact direct disposable copy admitted by Host', async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-join-'));
  const saveDirectory=path.join(root,'save');
  await mkdir(saveDirectory);
  const data=Buffer.from('authenticated save for join');
  const expected={bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};
  const saveFile=path.join(saveDirectory,`tf3mp_disposable_${'a'.repeat(32)}.sav`);
  await writeFile(saveFile,data);
  assert.deepEqual(await verifyPreparedJoinSave({saveFile,saveDirectory,expected}),expected);
  await assert.rejects(verifyPreparedJoinSave({saveFile,saveDirectory,expected:{...expected,bytes:1}}),/MISMATCH/);
  const outside=path.join(root,`tf3mp_disposable_${'b'.repeat(32)}.sav`);
  await writeFile(outside,data);
  await assert.rejects(verifyPreparedJoinSave({saveFile:outside,saveDirectory,expected}),/PATH_REJECTED/);
  const linked=path.join(saveDirectory,`tf3mp_disposable_${'c'.repeat(32)}.sav`);
  try {
    await symlink(saveFile,linked);
    await assert.rejects(verifyPreparedJoinSave({saveFile:linked,saveDirectory,expected}),/PATH_REJECTED/);
  } catch (error) {
    if (error.code !== 'EPERM') throw error; // Windows accounts without symlink privilege.
  }
});

test('prepare-join CLI downloads authenticated Host save and creates a one-use startup request', async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-join-cli-'));
  const saveDirectory=path.join(root,'save'),bridgeDirectory=path.join(root,'tf3mp_status_1');
  await Promise.all([mkdir(saveDirectory),mkdir(bridgeDirectory)]);
  const source=path.join(root,'host.sav'),data=Buffer.from('host save transferred before Join launch');
  await writeFile(source,data);
  const secret='join-preparation-test-secret-32-bytes-minimum',sessionId='prepare.test';
  const server=await startSaveServer({secret,sessionId,saveFile:source,bind:'127.0.0.1',port:0});
  try {
    const {stdout}=await execFileAsync(process.execPath,['src/cli.mjs','prepare-join','--session',sessionId,
      '--host','127.0.0.1','--save-port',String(server.port),'--save-dir',saveDirectory,
      '--bridge-dir',bridgeDirectory],{cwd:path.resolve(import.meta.dirname,'..'),
      env:{...process.env,TF3MP_SESSION_SECRET:secret},timeout:15000});
    assert.match(stdout,/join_save_prepared/);
    const request=await readFile(path.join(bridgeDirectory,'startup_load_request.lua'),'utf8');
    assert.match(request,/expectedSha256/);
  } finally {
    await new Promise(resolve=>server.server.close(resolve));
  }
});
