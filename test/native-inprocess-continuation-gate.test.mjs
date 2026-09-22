import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const host = fileURLToPath(new URL('../dist/native-continuation-assessment/TF3OwnedContinuationAssessment.exe', import.meta.url));
const skip = process.platform !== 'win32' || !existsSync(host);

test('owned negative ABI assessment rejects ordinary PROC FRAME for arbitrary RIP entry', {skip}, () => {
  const run = spawnSync(host, [], {windowsHide: true, encoding: 'utf8', timeout: 10_000});
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.scope, 'owned-negative-abi-assessment');
  assert.equal(report.assessmentPassed, true);
  for (const field of ['qualified', 'activationPermitted', 'holdImplemented', 'fullXstatePreserved',
    'nativeExceptionPropagationQualified', 'stackWalkQualified', 'unsafeRedirectionExecuted']) {
    assert.equal(report[field], false, field);
  }
  for (const field of ['normalCallExecuted', 'normalCallUnwindCorrect', 'redirectedUnwindReadsLocalCanary',
    'redirectedUnwindLosesOriginalFrame', 'normalHelperCallAligned', 'stackCanariesIntact']) {
    assert.equal(report[field], true, field);
  }
  assert.equal(report.redirectedHelperCallAligned, false);
  assert.equal(report.postSiteRva, 0x159581);
  assert.equal(report.continuationRva, 0x159584);
  assert.equal(report.interruptedRspAlignment, 16);
  assert.equal(report.interruptedReturnOffset, 0x58);
  for (const policy of ['cfg', 'cet']) {
    assert.equal(typeof report[`${policy}QuerySucceeded`], 'boolean');
    assert.equal(typeof report[`${policy}Enabled`], 'boolean');
    assert.ok(Number.isInteger(report[`${policy}Flags`]));
    if (report[`${policy}QuerySucceeded`]) assert.equal(report[`${policy}QueryError`], 0);
    else assert.notEqual(report[`${policy}QueryError`], 0);
  }
});

test('owned negative ABI assessment has no activation mode', {skip}, () => {
  const run = spawnSync(host, ['--activate'], {windowsHide: true, encoding: 'utf8', timeout: 10_000});
  assert.ifError(run.error);
  assert.equal(run.status, 2, run.stderr || run.stdout);
  const report = JSON.parse(run.stderr);
  assert.equal(report.qualified, false);
  assert.equal(report.activationPermitted, false);
  assert.match(report.error, /accepts no arguments/);
  assert.equal(run.stdout, '');
});
