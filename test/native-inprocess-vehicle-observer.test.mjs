import assert from 'node:assert/strict';
import {existsSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root=fileURLToPath(new URL('..',import.meta.url));
const host=fileURLToPath(new URL('../dist/native-vehicle-observer/TF3OwnedVehicleObserverHost.exe',import.meta.url));
const dll=fileURLToPath(new URL('../dist/native-vehicle-observer/TF3OwnedVehicleObserver.dll',import.meta.url));
const sources=['native/inprocess_vehicle_observer.cpp','native/inprocess_vehicle_observer.h',
  'native/inprocess_vehicle_observer_host.cpp','native/inprocess_vehicle_observer_host.asm']
  .map(path=>fileURLToPath(new URL(`../${path}`,import.meta.url)));
const fresh=()=>existsSync(host)&&existsSync(dll)&&sources.every(path=>statSync(path).mtimeMs<=Math.min(statSync(host).mtimeMs,statSync(dll).mtimeMs));

test('owned in-process vehicle observer correlates actual factory/submission traps and restores both sites',
  {skip:process.platform!=='win32'||!fresh()},()=>{
    const run=spawnSync(host,[dll],{cwd:root,windowsHide:true,encoding:'utf8',timeout:15_000});
    assert.ifError(run.error);
    assert.equal(run.status,0,run.stderr||run.stdout);
    assert.match(run.stdout,/owned-cancel-normal=1 false-callback=1 original-submissions=0 caller-cleanup=1/);
    assert.match(run.stdout,/actual-traps=1 correlation=1 invalid-tag=1 mismatch=1 cross-thread=1 restored=1/);
  });

test('owned cancellation callback unwind cleans caller values once and never completes or rearms',
  {skip:process.platform!=='win32'||!fresh()},()=>{
    const run=spawnSync(host,[dll,'unwind'],{cwd:root,windowsHide:true,encoding:'utf8',timeout:15_000});
    assert.ifError(run.error);
    assert.equal(run.status,0,run.stderr||run.stdout);
    assert.match(run.stdout,/owned-cancel-unwind=1 false-callback=1 original-submissions=0 caller-cleanup=1 unknown=1/);
  });
