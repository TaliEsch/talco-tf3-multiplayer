import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const exe=fileURLToPath(new URL('../dist/common-exit-boundary/TF3CommonExitBoundaryFixture.exe',import.meta.url));

test('owned common-exit fixture preserves its instruction and frame for zero and positive steps',{skip:process.platform!=='win32'||!existsSync(exe),timeout:15000},()=>{
  const result=spawnSync(exe,[],{encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(result.error,undefined,result.error?.message);
  assert.equal(result.status,0,result.stderr||result.stdout);
  const report=JSON.parse(result.stdout.trim());
  assert.equal(report.scope,'common-exit-instruction-frame-owned');
  assert.equal(report.passed,true,'fixture report must pass');
  for(const field of ['activationPermitted','tf3Qualified'])assert.equal(report[field],false,field);
  for(const field of ['zeroStepReached','positiveStepReached','instructionPreserved','unwindPreserved','loopRegistersRestored'])
    assert.equal(report[field],true,field);
  for(const field of ['fullXstateQualified','chainedUnwindQualified','livePauseCadenceQualified','ownerParkingQualified'])
    assert.equal(report[field],false,field);
});
