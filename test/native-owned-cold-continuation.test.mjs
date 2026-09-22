import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const host = fileURLToPath(new URL('../dist/owned-cold-continuation/TF3OwnedColdContinuation.exe', import.meta.url));
const skip = process.platform !== 'win32' || !existsSync(host);

test('owned cold fragment holds outside VEH, preserves state and unwinds a native exception', {skip}, () => {
  const result = spawnSync(host, [], {windowsHide: true, encoding: 'utf8', timeout: 20_000});
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scope, 'owned-cold-fragment-continuation');
  for (const field of ['fixturePassed', 'environmentSupported', 'gateInEhContinuationTable',
    'cfgKnown', 'cetKnown', 'normalCompleted', 'allGprAndFlagsPreserved',
    'enabledXstatePreserved', 'waitOutsideVeh', 'waitingObserved',
    'workerRemainedHeld', 'nativeExceptionReachedCaller']) assert.equal(report[field], true, field);
  for (const field of ['activationPermitted', 'tf3Qualified', 'tf3CetQualified',
    'crossImageContinuationQualified']) assert.equal(report[field], false, field);
  assert.equal(report.normalCases, 8);
  assert.equal(report.handlerHits, 9);
  assert.equal(report.independentTraffic, 800);
  assert.equal(report.unwindExamined, 58);
  assert.equal(report.unwindPassed, report.unwindExamined);
  assert.ok(report.xstateBytes >= 576 && report.xstateBytes <= 0x3dc0);
  assert.equal(report.xcr0 & 7, 7);
  assert.equal(report.ownedCetExecutionVerified, report.cetEnabled && report.cetIpValidation);
});

test('owned cold fragment refuses every activation argument', {skip}, () => {
  const result = spawnSync(host, ['--activate'], {windowsHide: true, encoding: 'utf8', timeout: 5_000});
  assert.ifError(result.error);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.equal(result.stdout, '');
  const report = JSON.parse(result.stderr);
  assert.equal(report.activationPermitted, false);
  assert.match(report.error, /accepts no arguments/);
});
