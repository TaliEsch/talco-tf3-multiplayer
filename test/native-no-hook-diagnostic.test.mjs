import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const host = fileURLToPath(new URL('../dist/native-loader/TF3InProcessRuntimeHost.exe', import.meta.url));
const dll = fileURLToPath(new URL('../dist/native-loader/TF3InProcessRuntime.dll', import.meta.url));
const skip = process.platform !== 'win32' || !existsSync(host) || !existsSync(dll);
for (const mode of ['40401', '40396', '40401-extra', 'x'.repeat(64)]) {
  test(`native no-hook diagnostic rejects owned image or invalid selector ${mode}`, {skip}, () => {
    const run = spawnSync(host, [dll, mode], {windowsHide: true, encoding: 'utf8', timeout: 15_000});
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /diagnostic-rejected-no-probe=1/);
    assert.match(run.stdout, new RegExp(`status=${mode === '40401' ? 6 : 11}\\b`));
  });
}
test('one-use handoff pipe selects no-hook diagnostic without inherited mode', {skip}, () => {
  const run = spawnSync(host, [dll, '40401', 'pipe'],
    {windowsHide: true, encoding: 'utf8', timeout: 15_000});
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /diagnostic-rejected-no-probe=1/);
  assert.match(run.stdout, /status=6\b/);
});
for (const [selector, expected] of [['passive-pipe', 6], ['passive-conflict', 11]]) {
  test(`passive handoff ${selector} rejects an owned image without a probe`, {skip}, () => {
    const run = spawnSync(host, [dll, '40401', selector],
      {windowsHide: true, encoding: 'utf8', timeout: 15_000});
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /diagnostic-rejected-no-probe=1/);
    assert.match(run.stdout, new RegExp(`status=${expected}\\b`));
  });
}
for (const [selector, expected] of [['boundary-pipe', 6], ['boundary-conflict', 11]]) {
  test(`40401 boundary handoff ${selector} rejects an owned image without starting control`, {skip}, () => {
    const run = spawnSync(host, [dll, '40401', selector],
      {windowsHide: true, encoding: 'utf8', timeout: 15_000});
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /diagnostic-rejected-no-probe=1/);
    assert.match(run.stdout, new RegExp(`status=${expected}\\b`));
  });
}
