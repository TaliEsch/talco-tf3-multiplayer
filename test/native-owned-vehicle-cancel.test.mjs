import assert from 'node:assert/strict';
import {existsSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root=fileURLToPath(new URL('..',import.meta.url));
const fixture=fileURLToPath(new URL('../dist/owned-vehicle-cancel/TF3OwnedVehicleCancelFixture.exe',import.meta.url));
const sources=['native/owned_vehicle_cancel_fixture.cpp','native/owned_vehicle_cancel_fixture.asm','Build-OwnedVehicleCancelFixture.ps1']
  .map(path=>fileURLToPath(new URL(`../${path}`,import.meta.url)));
const fresh=()=>existsSync(fixture)&&sources.every(path=>statSync(path).mtimeMs<=statSync(fixture).mtimeMs);

test('owned MOV/vtable-call cancellation fixture preserves entry and restores normal submission',
  {skip:process.platform!=='win32'||!fresh()},()=>{
    const run=spawnSync(fixture,[],{cwd:root,windowsHide:true,encoding:'utf8',timeout:15_000});
    assert.ifError(run.error);
    assert.equal(run.status,0,run.stderr||run.stdout);
    const report=JSON.parse(run.stdout);
    for(const field of ['fixturePassed','unpatchedIndirectCall','rdxEntryPreserved','rcxAndRaxSubstituted','exactlyOnceCancel','noSubmission',
      'unchangedActionState','nestedCallback','callbackExceptionUnwound','teardownRestored','sequentialLifecycleOnly']) {
      assert.equal(report[field],true,field);
    }
    assert.equal(report.activationPermitted,false);
    assert.equal(report.tf3Qualified,false);
  });
