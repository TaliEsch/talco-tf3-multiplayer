import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = path.join(root, 'dist/native-runtime/TF3RuntimeObserver.exe');
const source = path.join(root, 'native/runtime_observer.cpp');
const available = process.platform === 'win32' && existsSync(executable);
const skip = available ? false : 'Run Build-NativeRuntime.ps1 on Windows to execute the real native observer tests.';
function run(args) {
  assert.ok(statSync(executable).mtimeMs >= statSync(source).mtimeMs,
    'Native observer binary is stale; run Build-NativeRuntime.ps1 first.');
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', timeout: 20000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  assert.ifError(result.error);
  return { ...result, events: result.stdout.split(/\r?\n/).filter(line => line.startsWith('{')).map(JSON.parse) };
}

test('native observer captures real hardware traps on two owned threads and detaches before normal child exit', { skip }, () => {
  const result = run(['--self-test']);
  assert.equal(result.status, 0, result.stderr);
  const observations = result.events.filter(event => event.event === 'observation');
  assert.equal(observations.length, 32);
  assert.equal(new Set(observations.map(event => event.threadId)).size, 2);
  const batch = observations.filter(event => event.site === 'step_batch_entry_candidate');
  assert.ok(batch.length > 0);
  for (const event of batch) {
    assert.equal(event.rcx, '12345678');
    assert.equal(event.rdx, '30d40');
    assert.equal(event.stackWordReadable, true);
    assert.ok(event.stackWordImageRva > 0);
  }
  const complete = result.events.at(-1);
  assert.equal(complete.restoredAndDetached, true);
  assert.equal(complete.fixturePassed, true);
  assert.equal(complete.simulationControlQualified, false);
  assert.ok(complete.siteHits.every(count => count > 0));
});

test('native observer rejects mapped-byte mismatch before arming and child exits normally', { skip }, () => {
  const result = run(['--self-test-mismatch']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.events, [{ event: 'mismatch-test-passed', hardwareBreakpointsArmed: 0 }]);
  assert.match(result.stderr, /cleanup_restored_and_detached=true/);
});

test('native observer attaches to an already-running owned process and restores its pre-existing threads', { skip }, () => {
  const result = run(['--self-test-attach']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.events.at(-1).hits, 32);
  assert.equal(result.events.at(-1).observedThreadCount, 2);
  assert.equal(result.events.at(-1).restoredAndDetached, true);
  assert.equal(result.events.at(-1).fixturePassed, true);
});

test('native observer timeout restores debug registers even without any observation', { skip }, () => {
  const result = run(['--self-test-timeout']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.events.at(-1).hits, 0);
  assert.equal(result.events.at(-1).restoredAndDetached, true);
  assert.equal(result.events.at(-1).fixturePassed, true);
});

test('native observer repeatedly restores and drains queued traps before detaching after an armed failure', { skip, timeout: 30000 }, () => {
  // Two fixture threads can trap together. A single pass missed the race where
  // detach succeeded while another thread still had a queued hardware trap.
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = run(['--self-test-armed-failure']);
    assert.equal(result.status, 0, `attempt ${attempt + 1}: ${result.stderr}`);
    assert.equal(result.events.filter(event => event.event === 'observation').length, 1);
    assert.match(result.stderr, /cleanup_restored_and_detached=true/);
    assert.deepEqual(result.events.at(-1), { event: 'armed-failure-test-passed', fixtureExitedNormally: true });
  }
});

test('native observer rejects an unsupported real PID before debugger attach', { skip }, () => {
  const result = run(['--pid', String(process.pid), '--seconds', '1', '--hits', '1']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unsupported target executable SHA256/);
  assert.deepEqual(result.events, []);
});

test('native observer rejects malformed and unbounded requests without attachment', { skip }, () => {
  for (const args of [[], ['--pid', '0', '--seconds', '1', '--hits', '1'],
    ['--pid', '1', '--seconds', '31', '--hits', '1'], ['--pid', '1', '--seconds', '1', '--hits', '257'],
    ['--pid', '-1', '--seconds', '1', '--hits', '1'], ['--pid', '1x', '--seconds', '1', '--hits', '1']]) {
    const result = run(args);
    assert.equal(result.status, 2);
    assert.deepEqual(result.events, []);
  }
});

test('command profile captures bounded factory/admission/apply/handler evidence and rejects unsafe optional reads', { skip }, () => {
  const result = run(['--self-test-command']);
  assert.equal(result.status, 0, result.stderr);
  const observations = result.events.filter(event => event.event === 'command-observation');
  assert.equal(observations.length, 64);
  assert.equal(new Set(observations.map(event => event.threadId)).size, 2);
  assert.equal(new Set(observations.map(event => event.site)).size, 4);
  for (const event of observations) {
    assert.equal(event.schemaVersion, 2);
    assert.equal(event.profile, 'command');
    assert.match(event.sha256, /^[a-f0-9]{64}$/);
    assert.match(event.processCreationTime, /^[1-9][0-9]+$/);
    assert.equal(event.mappedSiteVerified, true);
    assert.equal(event.returnAddressReadable, true);
    assert.equal(event.returnAddressClass, 'main-image');
    assert.ok(event.returnAddressRva > 0);
    assert.ok(event.remoteBytesAttempted <= 128);
    assert.equal(event.completeCommandPayload, false);
    assert.equal(event.commandControlQualified, false);
    if (event.factory) {
      assert.equal(event.factory.entity, 12345);
      assert.equal(event.factory.booleanValid, true);
      assert.equal(event.factory.outputConstructed, false);
    }
    if (event.command?.status === 'decoded-local-action') {
      assert.equal(event.command.entity, 12345);
      assert.equal(event.command.tag, 0x32);
      assert.ok([0, 1].includes(event.command.stoppedByte));
      assert.equal(event.command.resultIsCompletion, false);
      assert.equal(event.command.dependencyRecordsCaptured, false);
    }
    if (event.site === 'command_admission_entry_candidate') {
      assert.equal(event.fifthArgumentReadable, true);
      assert.equal(event.fifthArgument, 'def0');
    }
  }
  const commands = observations.filter(event => event.command).map(event => event.command);
  for (const status of ['decoded-local-action', 'entry-read-failed', 'tag-read-failed', 'unsupported-tag', 'invalid-stopped-byte']) {
    assert.ok(commands.some(command => command.status === status), status);
  }
  assert.ok(commands.some(command => command.entryReadable && !command.dependencyShapeValid));
  const complete = result.events.at(-1);
  assert.equal(complete.restoredAndDetached, true);
  assert.equal(complete.fixturePassed, true); // Also verifies guard pages were not consumed by observation.
  assert.equal(complete.captureComplete, false);
  assert.equal(complete.stopReason, 'event-cap');
});

test('command profile preserves attach, timeout, mismatch refusal and armed-failure cleanup', { skip }, () => {
  for (const suffix of ['attach', 'timeout', 'mismatch', 'armed-failure']) {
    const result = run([`--self-test-command-${suffix}`]);
    assert.equal(result.status, 0, `${suffix}: ${result.stderr}`);
    if (suffix === 'mismatch') {
      assert.deepEqual(result.events, [{ event: 'mismatch-test-passed', hardwareBreakpointsArmed: 0 }]);
    } else if (suffix === 'armed-failure') {
      assert.match(result.stderr, /cleanup_restored_and_detached=true/);
      assert.equal(result.events.at(-1).fixtureExitedNormally, true);
    } else {
      assert.equal(result.events.at(-1).fixturePassed, true);
      assert.equal(result.events.at(-1).restoredAndDetached, true);
    }
  }
});

test('profile selection refuses unknown profiles and unsupported process hashes before attachment', { skip }, () => {
  for (const profile of ['command', 'simulation', 'guessed']) {
    const result = run(['--pid', String(process.pid), '--seconds', '1', '--hits', '1', '--profile', profile]);
    assert.equal(result.status, 2);
    assert.deepEqual(result.events, []);
    assert.match(result.stderr, profile === 'guessed' ? /unknown observation profile/ :
      profile === 'command' ? /live command profile disabled/ : /unsupported target executable SHA256/);
  }
});

test('sixteen non-current worker threads exercise every armed command site without leaking SINGLE_STEP', { skip, timeout: 30000 }, () => {
  for (const mode of ['--self-test-command-stress', '--self-test-command-stress-attach', '--self-test-command-dr6']) {
    const result = run([mode]);
    assert.equal(result.status, 0, `${mode}: ${result.stderr}\n${result.stdout.slice(-3000)}`);
    const observations = result.events.filter(event => event.event === 'command-observation');
    assert.equal(observations.length, 1280);
    const threads = new Map();
    for (const event of observations) {
      const sites = threads.get(event.threadId) ?? new Set();
      sites.add(event.site);
      threads.set(event.threadId, sites);
    }
    assert.equal(threads.size, 16);
    assert.ok([...threads.values()].every(sites => sites.size === 4));
    assert.ok(!result.events.some(event => event.reason === 'forwarded-unrecognized-single-step'));
    const complete = result.events.at(-1);
    assert.equal(complete.fixturePassed, true);
    assert.equal(complete.targetExited, true);
    assert.equal(complete.targetExitCode, 0); // The fixture exits 96 if ANY single-step reaches its VEH.
    assert.equal(complete.restoredAndDetached, false); // Process exit is not a successful detach.
    assert.equal(complete.missingDr6Hits, mode.endsWith('-dr6') ? 1280 : 0);
  }
});

test('trap classification requires exception, instruction and configured execution-slot identity and rejects unrelated stepping', { skip }, () => {
  const result = run(['--self-test-trap-classifier']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.events, [{ event: 'trap-classifier-test-passed', sites: 4, unrelatedExceptionsRejected: true }]);
});

test('stress cutoff restores non-current threads and drains concurrent traps before detach', { skip, timeout: 30000 }, () => {
  for (let attempt = 0; attempt < 8; ++attempt) {
    const result = run(['--self-test-command-stress-cutoff']);
    assert.equal(result.status, 0, `attempt ${attempt + 1}: ${result.stderr}`);
    const complete = result.events.at(-1);
    assert.equal(complete.hits, 256);
    assert.equal(complete.fixturePassed, true); // VEH saw no leaked trap, including during teardown.
    assert.equal(complete.restoredAndDetached, true);
    assert.equal(complete.targetExited, false);
    assert.equal(complete.stopReason, 'event-cap');
  }
});
