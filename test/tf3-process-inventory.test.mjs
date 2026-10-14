import assert from 'node:assert/strict';
import test from 'node:test';
import {
  qualifyPrelaunchTf3Processes,
  selectLaunchedTf3Process,
  pinnedTf3ProcessPresent,
  reconcileLaunchedTf3Process,
  qualifyBoundHostCoexistence,
} from '../src/tf3-process-inventory.mjs';

const exe = 'E:\\Steam\\steamapps\\common\\Transport Fever 3\\TransportFever3.exe';
const host = { pid: 1234, startedAtMs: 1_790_000_000_000 };
const hostVisible = { ...host, exePath: null };
const join = { pid: 5678, startedAtMs: host.startedAtMs + 5000, exePath: exe };

test('solo launch requires no existing game', () => {
  assert.equal(qualifyPrelaunchTf3Processes([], { role: 'host', exe }), null);
  assert.throws(() => qualifyPrelaunchTf3Processes([hostVisible], { role: 'host', exe }), /TF3_ALREADY_RUNNING/);
});

test('Steam may replace only the initial unbound launch process within a bounded gap', () => {
  const first = { pid: 4321, startedAtMs: join.startedAtMs - 100, exePath: exe };
  const options = { exe, existingHost: host, launchedAfterMs: first.startedAtMs - 1,
    spawnedPid: first.pid, spawnedExited: false, nowMs: first.startedAtMs + 10 };
  const initial = reconcileLaunchedTf3Process([hostVisible, first], options);
  assert.equal(initial.pinned.pid, first.pid);
  const gap = reconcileLaunchedTf3Process([hostVisible], { ...options,
    spawnedExited: true, pinned: initial.pinned, nowMs: options.nowMs + 100 });
  assert.equal(gap.present, false);
  const replaced = reconcileLaunchedTf3Process([hostVisible, join], { ...options,
    spawnedExited: true, pinned: gap.pinned, absentSinceMs: gap.absentSinceMs,
    nowMs: options.nowMs + 200 });
  assert.equal(replaced.pinned.pid, join.pid);
  assert.equal(replaced.replaced, true);
  assert.throws(() => reconcileLaunchedTf3Process([hostVisible], { ...options,
    spawnedExited: true, pinned: gap.pinned, absentSinceMs: gap.absentSinceMs,
    nowMs: gap.absentSinceMs + 90001 }), /TF3_EXITED_BEFORE_NATIVE_BIND/);
  assert.throws(() => reconcileLaunchedTf3Process([hostVisible, join], { ...options,
    spawnedExited: true, pinned: gap.pinned, bound: true, nowMs: options.nowMs + 200 }),
  /TF3_NEW_PROCESS_CHANGED/);
  assert.throws(() => reconcileLaunchedTf3Process([hostVisible,
    { ...first, startedAtMs: first.startedAtMs + 1 }], { ...options,
    spawnedExited: true, pinned: gap.pinned, nowMs: options.nowMs + 200 }),
  /TF3_NEW_PROCESS_CHANGED/);
  assert.throws(() => reconcileLaunchedTf3Process([hostVisible], { ...options,
    spawnedExited: true, pinned: replaced.pinned, nowMs: options.nowMs + 300 }),
  /TF3_EXITED_BEFORE_NATIVE_BIND/);
});

test('bound Host remains pinned when one later exact-build Join starts', () => {
  const pinnedHost = { ...host, exePath: exe };
  assert.equal(qualifyBoundHostCoexistence([pinnedHost], pinnedHost), true);
  assert.equal(qualifyBoundHostCoexistence([pinnedHost, join], pinnedHost), true);
  assert.throws(() => qualifyBoundHostCoexistence([join], pinnedHost), /TF3_HOST_PROCESS_CHANGED/);
  assert.throws(() => qualifyBoundHostCoexistence([pinnedHost, { ...join, exePath: null }], pinnedHost),
    /TF3_COEXISTENCE_UNQUALIFIED/);
  assert.throws(() => qualifyBoundHostCoexistence([pinnedHost, join, { ...join, pid: 9012 }], pinnedHost),
    /TF3_COEXISTENCE_UNQUALIFIED/);
});

test('Join prelaunch admits only the exact attested Host instance', () => {
  assert.deepEqual(qualifyPrelaunchTf3Processes([hostVisible], { role: 'join', exe, existingHost: host }), host);
  assert.deepEqual(qualifyPrelaunchTf3Processes([], { role: 'join', exe, existingHost: host }), host);
  assert.throws(() => qualifyPrelaunchTf3Processes([{ ...hostVisible, startedAtMs: host.startedAtMs + 1 }],
    { role: 'join', exe, existingHost: host }), /EXISTING_HOST_IDENTITY_MISMATCH/);
  assert.throws(() => qualifyPrelaunchTf3Processes([{ ...hostVisible, pid: host.pid + 1 }],
    { role: 'join', exe, existingHost: host }), /EXISTING_HOST_IDENTITY_MISMATCH/);
  assert.throws(() => qualifyPrelaunchTf3Processes([hostVisible, join],
    { role: 'join', exe, existingHost: host }), /EXISTING_HOST_IDENTITY_MISMATCH/);
  assert.throws(() => qualifyPrelaunchTf3Processes([{ ...hostVisible, exePath: 'C:\\wrong.exe' }],
    { role: 'join', exe, existingHost: host }), /EXISTING_HOST_EXE_MISMATCH/);
});

test('Join process selection tolerates hidden Host while preserving visible identity and launch gates', () => {
  const launchedAfterMs = join.startedAtMs - 1;
  assert.deepEqual(qualifyPrelaunchTf3Processes([], { role: 'join', exe, existingHost: host }), host);
  assert.equal(selectLaunchedTf3Process([], { exe, existingHost: host, launchedAfterMs }), null);
  assert.deepEqual(selectLaunchedTf3Process([join], { exe, existingHost: host, launchedAfterMs }), join);
  assert.throws(() => selectLaunchedTf3Process([join], { exe, existingHost: { pid: 0 }, launchedAfterMs }),
    /EXISTING_HOST_IDENTITY_INVALID/);
  assert.throws(() => selectLaunchedTf3Process([
    { ...hostVisible, startedAtMs: host.startedAtMs + 1 }, join,
  ], { exe, existingHost: host, launchedAfterMs }), /EXISTING_HOST_IDENTITY_MISMATCH/);
  assert.throws(() => selectLaunchedTf3Process([
    { ...hostVisible, exePath: 'C:\\wrong.exe' }, join,
  ], { exe, existingHost: host, launchedAfterMs }), /EXISTING_HOST_EXE_MISMATCH/);
  assert.throws(() => qualifyPrelaunchTf3Processes([join], { role: 'join', exe, existingHost: host }),
    /EXISTING_HOST_IDENTITY_MISMATCH/);
  assert.throws(() => selectLaunchedTf3Process([join, { ...join, pid: 9999 }],
    { exe, existingHost: host, launchedAfterMs }), /TF3_NEW_PROCESS_AMBIGUOUS/);
});

test('Join launch pins one new exact executable and never mistakes the Host for it', () => {
  assert.equal(selectLaunchedTf3Process([hostVisible], { exe, existingHost: host, launchedAfterMs: join.startedAtMs - 1 }), null);
  const pinned = selectLaunchedTf3Process([hostVisible, join], { exe, existingHost: host, launchedAfterMs: join.startedAtMs - 1 });
  assert.deepEqual(pinned, join);
  assert.equal(pinnedTf3ProcessPresent([hostVisible, join], pinned), true);
  assert.equal(pinnedTf3ProcessPresent([hostVisible], pinned), false);
  assert.throws(() => selectLaunchedTf3Process([hostVisible, { ...join, exePath: null }],
    { exe, existingHost: host, launchedAfterMs: join.startedAtMs - 1 }), /TF3_NEW_PROCESS_UNQUALIFIED/);
  assert.throws(() => selectLaunchedTf3Process([hostVisible, { ...join, startedAtMs: join.startedAtMs - 2 }],
    { exe, existingHost: host, launchedAfterMs: join.startedAtMs - 1 }), /TF3_NEW_PROCESS_UNQUALIFIED/);
  assert.throws(() => selectLaunchedTf3Process([hostVisible, join, { ...join, pid: 9999 }],
    { exe, existingHost: host, launchedAfterMs: join.startedAtMs - 1 }), /TF3_NEW_PROCESS_AMBIGUOUS/);
});
