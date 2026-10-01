import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const exe=fileURLToPath(new URL('../dist/boundary-patch-pair/TF3BoundaryPatchPairFixture.exe',import.meta.url));

test('owned boundary patch-pair fixture restores only its exact owned byte pair',{skip:process.platform!=='win32'||!existsSync(exe),timeout:15000},()=>{
  const result=spawnSync(exe,[],{encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(result.error,undefined,result.error?.message);
  assert.equal(result.status,0,result.stderr||result.stdout);
  const report=JSON.parse(result.stdout.trim());
  assert.equal(report.scope,'boundary-patch-pair-owned');
  assert.equal(report.passed,true,'fixture report must pass');
  assert.equal(report.activationPermitted,false);
  assert.equal(report.tf3Qualified,false);
  for(const field of ['normalInstallRestore','partialInstallRolledBack','foreignBytePreserved',
    'failedFlushRetained','failedProtectionRetained'])assert.equal(report[field],true,field);
  assert.equal(report.aliasAndForeignAdmissionDenied,true);
});
