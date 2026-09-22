import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const host = fileURLToPath(new URL('../dist/inprocess-gate-control/TF3InProcessGateControl.exe', import.meta.url));
const skip = process.platform !== 'win32' || !existsSync(host);

test('owned-process gate control keeps release, boundary completion, terminal park, and detach distinct', {skip}, () => {
  const run = spawnSync(host, [], {windowsHide: true, encoding: 'utf8', timeout: 10_000});
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.scope, 'owned-process-gate-control');
  assert.equal(report.activationPermitted, false);
  assert.equal(report.productionLifecycleQualified, false);
  for (const field of ['passed', 'delayedAck', 'repeatedSameOwnerBoundaries', 'staleGenerationAba',
    'concurrentRelease', 'cancelBeforeConsumption', 'concurrentHaltCancellation',
    'haltLatchedDuringReleaseReturn', 'releaseFrameOccupancy', 'foreignOwnerFaultClosed',
    'nestedOwnerFaultClosed', 'generationAliasRejected', 'atomicFaultAdmissionRaces',
    'unacknowledgedStop',
    'runningHaltNextBoundary', 'detachBeforeReturn', 'foreignDetachConfirmationRejected',
    'haltDetachRacePolicy', 'modeledOwnerDetach']) {
    assert.equal(report[field], true, field);
  }
});

test('owned-process gate-control host has no activation command mode', {skip}, () => {
  const run = spawnSync(host, ['--activate'], {windowsHide: true, encoding: 'utf8', timeout: 5_000});
  assert.ifError(run.error);
  assert.equal(run.status, 2, run.stderr || run.stdout);
  assert.equal(run.stdout, '');
  const report = JSON.parse(run.stderr);
  assert.equal(report.activationPermitted, false);
  assert.match(report.error, /accepts no arguments/);
});
