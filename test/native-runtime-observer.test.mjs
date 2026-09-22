import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = path.join(root, 'dist/native-runtime/TF3RuntimeObserver.exe');
const source = path.join(root, 'native/runtime_observer.cpp');
const available = process.platform === 'win32' && existsSync(executable);
const skip = available ? false : 'Run Build-NativeRuntime.ps1 on Windows to execute the real native observer tests.';
const observerSource = readFileSync(source, 'utf8');

function assertReturnCoordinates(event) {
  assert.match(event.imageBase, /^[0-9a-f]+$/);
  assert.match(event.rawReturn, /^[0-9a-f]+$/);
  assert.equal(event.returnAddress, event.rawReturn);
  assert.equal(event.returnAddressClass, 'main-image');
  assert.ok(event.returnAddressRva > 0);
  const imageBase = BigInt(`0x${event.imageBase}`);
  const rawReturn = BigInt(`0x${event.rawReturn}`);
  const returnRva = BigInt(event.returnAddressRva);
  assert.equal(rawReturn, imageBase + returnRva);
}

test('native observer source keeps return coordinates and handler payload decoding bounded', () => {
  assert.match(observerSource, /constexpr bool kLiveCommandProfileQualified = false;/);
  assert.match(observerSource, /constexpr bool kLiveActionTraceQualified = false;/);
  assert.match(observerSource, /bool MainImageReturnRva\(ULONG64 rawReturn, ULONG64 base, DWORD imageSize, ULONG64& returnRva\)/);
  assert.match(observerSource, /rawReturn < base/);
  assert.match(observerSource, /candidate >= imageSize \|\| base > UINT64_MAX - candidate \|\| base \+ candidate != rawReturn/);
  assert.match(observerSource, /imageBase.*rawReturn/);
  assert.match(observerSource, /constexpr size_t kVehicleActionPayloadBytes = 5;/);
  assert.match(observerSource, /std::array<BYTE, kVehicleActionPayloadBytes> handlerPayload/);
  assert.match(observerSource, /siteIndex == 0 &&\s*reader\.Read\(context\.Rdx, handlerPayload\.data\(\), handlerPayload\.size\(\)\)/);
  assert.doesNotMatch(observerSource, /handlerPayload\.data\(\)\s*\+\s*[5-7]/);
});
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
  assert.equal(complete.restorationReadbackVerified, true);
  assert.equal(complete.teardownState, 'detached');
  assert.equal(complete.drainCompleted, true);
  assert.equal(complete.detachAttempted, true);
  assert.equal(complete.targetAliveAfterDetach, true);
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
  assert.equal(result.events.at(-1).restorationReadbackVerified, true);
  assert.equal(result.events.at(-1).teardownState, 'detached');
  assert.equal(result.events.at(-1).targetAliveAfterDetach, true);
  assert.equal(result.events.at(-1).fixturePassed, true);
});

test('native observer timeout restores debug registers even without any observation', { skip }, () => {
  const result = run(['--self-test-timeout']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.events.at(-1).hits, 0);
  assert.equal(result.events.at(-1).restoredAndDetached, true);
  assert.equal(result.events.at(-1).restorationReadbackVerified, true);
  assert.equal(result.events.at(-1).teardownState, 'detached');
  assert.equal(result.events.at(-1).targetAliveAfterDetach, true);
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
    assertReturnCoordinates(event);
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

test('profile selection refuses unknown profiles, unqualified action tracing and unsupported hashes before attachment', { skip }, () => {
  for (const profile of ['command', 'action-trace', 'simulation', 'guessed']) {
    const result = run(['--pid', String(process.pid), '--seconds', '1', '--hits', '1', '--profile', profile]);
    assert.equal(result.status, 2);
    assert.deepEqual(result.events, []);
    assert.match(result.stderr, profile === 'guessed' ? /unknown observation profile/ :
      profile === 'command' ? /live command profile disabled/ :
      profile === 'action-trace' ? /clean live detach remains unqualified/ : /unsupported target executable SHA256/);
  }
});

test('action trace pairs nested mixed calls on four actual threads using matching entry RSP and return address', { skip }, () => {
  for (const suffix of ['', '-attach']) {
    const result = run([`--self-test-action-trace${suffix}`]);
    assert.equal(result.status, 0, result.stderr);
    const observations = result.events.filter(event => event.event === 'action-trace-observation');
    assert.equal(observations.length, 256);
    const stacks = new Map();
    let maximumDepth = 0;
    let simultaneousThreads = 0;
    let returns = 0;
    for (const event of observations) {
      assert.equal(event.profile, 'action-trace');
      assert.equal(event.schemaVersion, 1);
      assert.match(event.sha256, /^[a-f0-9]{64}$/);
      assert.match(event.processCreationTime, /^[1-9][0-9]+$/);
      assert.equal(event.returnAddressReadable, true);
      assertReturnCoordinates(event);
      const handlerEntry = event.kind === 'handler' && event.phase === 'entry';
      assert.equal(event.handlerPayload.present, handlerEntry);
      assert.equal(event.handlerPayload.byteCount, handlerEntry ? 5 : 0);
      assert.equal(event.remoteBytesAttempted, handlerEntry ? 13 : 8);
      assert.equal(event.commandControlQualified, false);
      assert.equal(event.captureComplete, false);
      assert.equal(event.raxIsCompletion, false);
      assert.equal(event.mappedSiteVerified, true);
      assert.equal(event.firstChance, true);
      assert.equal(BigInt(`0x${event.dr7}`) & 0xffff00ffn, 0x55n);
      assert.ok([event.dr0, event.dr1, event.dr2, event.dr3].includes(event.rip));
      assert.equal(event.eflags & 0x100, 0);
      assert.equal(BigInt(`0x${event.dr6}`) & 0xe000n, 0n);
      const stack = stacks.get(event.threadId) ?? [];
      stacks.set(event.threadId, stack);
      if (event.phase === 'entry') {
        assert.equal(event.pairStatus, 'entry');
        assert.equal(event.paired, false);
        assert.equal(event.entryOrdinal, event.ordinal);
        stack.push(event);
        assert.equal(event.nestingDepth, stack.length);
        maximumDepth = Math.max(maximumDepth, stack.length);
        simultaneousThreads = Math.max(simultaneousThreads, [...stacks.values()].filter(frames => frames.length > 0).length);
      } else {
        assert.equal(event.pairStatus, 'paired-return');
        assert.equal(event.paired, true);
        assert.equal(event.nestingDepth, stack.length);
        const entry = stack.pop();
        assert.ok(entry);
        assert.equal(event.entryOrdinal, entry.ordinal);
        assert.equal(event.kind, entry.kind);
        assert.equal(event.rsp, entry.rsp);
        assert.equal(event.returnAddress, entry.returnAddress);
        returns++;
      }
    }
    assert.equal(stacks.size, 4);
    assert.ok([...stacks.values()].every(stack => stack.length === 0));
    assert.equal(maximumDepth, 4);
    assert.ok(simultaneousThreads >= 2, 'actual calls overlapped across threads');
    assert.equal(returns, 128);
    assert.deepEqual(result.events.at(-2), { event: 'action-trace-summary', paired: 128, orphan: 0,
      mismatched: 0, incomplete: 0, commandControlQualified: false });
    assert.equal(result.events.at(-1).restoredAndDetached, true);
    assert.equal(result.events.at(-1).fixturePassed, true);
    assert.deepEqual(result.events.at(-1).siteHits, [64, 64, 64, 64]);
  }
});

test('action trace labels incomplete calls at cutoff/failure and preserves timeout/mapped-byte rejection', { skip }, () => {
  for (const suffix of ['cutoff', 'armed-failure', 'timeout', 'mismatch']) {
    const result = run([`--self-test-action-trace-${suffix}`]);
    assert.equal(result.status, 0, `${suffix}: ${result.stderr}`);
    const incomplete = result.events.filter(event => event.event === 'action-trace-incomplete');
    if (suffix === 'cutoff' || suffix === 'armed-failure') {
      assert.ok(incomplete.length > 0);
      assert.ok(incomplete.every(event => event.reason === (suffix === 'cutoff' ? 'event-cap' : 'observation-failure')));
    }
    if (suffix === 'mismatch') {
      assert.deepEqual(result.events, [{ event: 'mismatch-test-passed', hardwareBreakpointsArmed: 0 }]);
      assert.match(result.stderr, /cleanup_restored_and_detached=true/);
    } else if (suffix === 'armed-failure') {
      assert.match(result.stderr, /cleanup_restored_and_detached=true/);
      assert.equal(result.events.at(-1).fixtureExitedNormally, true);
    } else {
      assert.equal(result.events.at(-1).hits, suffix === 'cutoff' ? 5 : 0);
      assert.equal(result.events.at(-1).fixturePassed, true);
      assert.equal(result.events.at(-1).restoredAndDetached, true);
    }
  }
});

test('action pairing rejects orphan, wrong kind/RSP/address and unreadable returns with bounded incomplete accounting', { skip }, () => {
  // This isolates malformed correlation records. The test above independently
  // exercises the same pairing code against real hardware entry/RET traps.
  const result = run(['--self-test-action-pairing']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.events.at(-1), { event: 'action-pairing-test-passed', paired: 3,
    orphan: 1, mismatched: 5, incomplete: 38 });
  assert.ok(result.events.some(event => event.reason === 'nesting-cap'));
  assert.ok(result.events.some(event => event.reason === 'return-unreadable'));
  assert.ok(result.events.some(event => event.reason === 'lifo-mismatch'));
});

test('action trace nesting cap consumes its owned hardware exception before unwinding diagnostics', { skip }, () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = run(['--self-test-action-trace-cap']);
    assert.equal(result.status, 0, `attempt ${attempt + 1}: ${result.stderr}`);
    const cap = result.events.filter(event => event.reason === 'nesting-cap');
    assert.equal(cap.length, 1);
    const observations = result.events.filter(event => event.event === 'action-trace-observation');
    assert.ok(observations.length >= 32);
    assert.ok(observations.some(event => event.nestingDepth === 32));
    assert.ok(result.events.some(event => event.reason === 'observation-failure'));
    assert.equal(result.events.some(event => event.event === 'unhandled-target-exception'), false);
    assert.match(result.stderr, /cleanup_restored_and_detached=true/);
    assert.deepEqual(result.events.at(-1), { event: 'nesting-cap-test-passed', fixtureExitedNormally: true });
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

test('trap classification requires first chance, instruction and configured execution-slot identity and rejects unrelated stepping', { skip }, () => {
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
    assert.equal(complete.restorationReadbackVerified, true);
    assert.equal(complete.teardownState, 'detached');
    assert.equal(complete.drainCompleted, true);
    assert.equal(complete.detachAttempted, true);
    assert.equal(complete.targetAliveAfterDetach, true);
    assert.equal(complete.targetExited, false);
    assert.equal(complete.stopReason, 'event-cap');
  }
});
