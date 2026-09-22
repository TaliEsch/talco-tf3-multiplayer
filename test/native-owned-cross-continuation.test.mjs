import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const host = fileURLToPath(new URL('../dist/owned-cross-continuation/TF3OwnedCrossContinuation.exe', import.meta.url));
const skip = process.platform !== 'win32' || !existsSync(host);

test('owned EXE/DLL continuation preserves state and survives native exception and pinned teardown', {skip}, () => {
  const run = spawnSync(host, [], {windowsHide: true, encoding: 'utf8', timeout: 20_000});
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.scope, 'owned-cross-image-continuation');
  for (const field of ['fixturePassed', 'gprAndFlagsPreserved', 'enabledXstatePreserved',
    'workerHeld', 'nativeExceptionReachedExeCaller', 'busyStopRejected', 'stopAfterJoin',
    'badXcr0Rejected', 'badResumeRejected', 'wrongOwnerRejected', 'faultLatched',
    'freeLibrarySucceeded', 'pinnedModuleRemainedLoaded', 'inertBypassPreservedState',
    'entryEhcont', 'resumeEhcont']) assert.equal(report[field], true, field);
  for (const field of ['activationPermitted', 'tf3Qualified', 'productionLifecycleQualified'])
    assert.equal(report[field], false, field);
  assert.equal(report.normalCases, 8);
  assert.equal(report.entries, 9);
  assert.equal(report.returns, 8);
  assert.equal(report.inertBypasses, 1);
  assert.equal(report.controllerProgress, 800);
  assert.equal(report.unwindPassed, report.unwindExamined);
  assert.equal(report.unwindExamined, 56);
  assert.ok(report.xstateBytes >= 576 && report.xstateBytes <= 0x3dc0);
  assert.equal(report.xcr0 & 7, 7);
  // The code has no relative return branch. Whether ASLR happens to place these
  // two images farther than 2 GiB is evidence, not an input the fixture controls.
  assert.equal(typeof report.imagesBeyondRel32, 'boolean');
});

test('owned EXE/DLL fixture has no activation command mode', {skip}, () => {
  const run = spawnSync(host, ['--activate'], {windowsHide: true, encoding: 'utf8', timeout: 5_000});
  assert.ifError(run.error);
  assert.equal(run.status, 2, run.stderr || run.stdout);
  assert.equal(run.stdout, '');
  const report = JSON.parse(run.stderr);
  assert.equal(report.activationPermitted, false);
  assert.match(report.error, /accepts no arguments/);
});
