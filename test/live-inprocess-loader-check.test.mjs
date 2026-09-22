import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const tool=fileURLToPath(new URL('../tools/live-inprocess-loader-check.mjs',import.meta.url));

test('live in-process checker rejects unknown options before launching anything',()=>{
  const run=spawnSync(process.execPath,[tool,'--unknown'],{
    windowsHide:true,encoding:'utf8',timeout:10_000});
  assert.ifError(run.error);
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/usage: node tools\/live-inprocess-loader-check\.mjs/);
});

test('live in-process checker rejects a missing bridge directory before launching anything',()=>{
  const run=spawnSync(process.execPath,[tool,'--bridge-dir'],{
    windowsHide:true,encoding:'utf8',timeout:10_000});
  assert.ifError(run.error);
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/usage: node tools\/live-inprocess-loader-check\.mjs/);
});
