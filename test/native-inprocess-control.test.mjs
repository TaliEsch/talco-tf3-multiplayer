import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const host = fileURLToPath(new URL('../dist/native-inprocess-control/TF3OwnedInProcessControlHost.exe', import.meta.url));
const skip = process.platform !== 'win32' || !existsSync(host);

test('owned in-process control holds a worker, releases one boundary, keeps traffic live, and fails closed on disconnect', {skip}, () => {
  const run = spawnSync(host, [], {windowsHide: true, encoding: 'utf8', timeout: 12_000});
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /held=1 exact-releases=2 traffic-while-held=1 disconnect-halt=1 duplicates=1 concurrency=1 timeout-fail-closed=1 state=4/);
});
