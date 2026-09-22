import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const host = fileURLToPath(new URL('../dist/native-post-observer/TF3OwnedPostObserverHost.exe', import.meta.url));
const dll = fileURLToPath(new URL('../dist/native-post-observer/TF3OwnedPostObserver.dll', import.meta.url));
const skip = process.platform !== 'win32' || !existsSync(host) || !existsSync(dll);

for (const [mode, evidence] of [
  ['', /arithmetic=576 fixed-traps=1004 concurrent-stop=1 saturation=1 pinned-after-release=1 restored=1/],
  ['--dynamic-code-block', /mitigation-rejection=1/],
  ['--foreign-patch', /foreign-byte-preserved=1 restored-after-retry=1/]
]) {
  test(`owned in-process observer executes native qualification ${mode || 'flags/lifetime/teardown'}`, {skip}, () => {
    const run = spawnSync(host, [dll, ...(mode ? [mode] : [])], {
      windowsHide: true, encoding: 'utf8', timeout: 15_000
    });
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, evidence);
  });
}
