import { spawnSync } from 'node:child_process';
import path from 'node:path';

const inventoryCommand = [
  "$ErrorActionPreference='Stop'",
  "$items=@(Get-Process -Name TransportFever3 -ErrorAction SilentlyContinue | ForEach-Object {",
  "  [pscustomobject]@{pid=$_.Id;exePath=$_.Path;startedAtMs=([DateTimeOffset]$_.StartTime).ToUnixTimeMilliseconds()}",
  '})',
  'ConvertTo-Json -InputObject $items -Compress',
].join('; ');

const validPid = value => Number.isSafeInteger(value) && value > 0;
const validTime = value => Number.isSafeInteger(value) && value > 0;
const samePath = (left, right) => path.win32.resolve(left).toLowerCase() === path.win32.resolve(right).toLowerCase();

export function listTf3Processes() {
  if (process.platform !== 'win32') throw new Error('WINDOWS_REQUIRED');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', inventoryCommand], {
    encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 64 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error('TF3_PROCESS_CHECK_FAILED');
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { throw new Error('TF3_PROCESS_CHECK_FAILED'); }
  if (!Array.isArray(parsed) || parsed.length > 8 || parsed.some(item => !validPid(item?.pid)
    || !validTime(item?.startedAtMs) || (item.exePath !== null && typeof item.exePath !== 'string')))
    throw new Error('TF3_PROCESS_CHECK_FAILED');
  if (new Set(parsed.map(item => item.pid)).size !== parsed.length) throw new Error('TF3_PROCESS_CHECK_FAILED');
  return parsed;
}

export function qualifyPrelaunchTf3Processes(processes, { role, exe, existingHost = null } = {}) {
  if (!Array.isArray(processes) || typeof exe !== 'string' || !path.win32.isAbsolute(exe))
    throw new Error('TF3_PROCESS_CHECK_FAILED');
  if (existingHost === null) {
    if (processes.length !== 0) throw new Error('TF3_ALREADY_RUNNING');
    return null;
  }
  if (role !== 'join' || !validPid(existingHost.pid) || !validTime(existingHost.startedAtMs))
    throw new Error('EXISTING_HOST_IDENTITY_INVALID');
  // Sandboxie may hide the Host process from the Join-side process inventory.
  // Its authenticated admission identity is still required by the caller, so
  // absence here is permissible; any visible process must still be the exact
  // attested Host and no unrelated prelaunch process may be present.
  if (processes.length === 0) return Object.freeze({ pid: existingHost.pid, startedAtMs: existingHost.startedAtMs });
  if (processes.length !== 1 || processes[0].pid !== existingHost.pid
    || processes[0].startedAtMs !== existingHost.startedAtMs)
    throw new Error('EXISTING_HOST_IDENTITY_MISMATCH');
  if (processes[0].exePath !== null && !samePath(processes[0].exePath, exe))
    throw new Error('EXISTING_HOST_EXE_MISMATCH');
  return Object.freeze({ pid: existingHost.pid, startedAtMs: existingHost.startedAtMs });
}

export function selectLaunchedTf3Process(processes, { exe, existingHost = null, launchedAfterMs = 0 } = {}) {
  if (!Array.isArray(processes) || typeof exe !== 'string' || !path.win32.isAbsolute(exe)
    || !Number.isSafeInteger(launchedAfterMs) || launchedAfterMs < 0)
    throw new Error('TF3_PROCESS_CHECK_FAILED');
  if (existingHost) {
    const visibleHost = processes.filter(item => item.pid === existingHost.pid);
    qualifyPrelaunchTf3Processes(visibleHost, { role: 'join', exe, existingHost });
  }
  const candidates = processes.filter(item => item.pid !== existingHost?.pid);
  if (candidates.length === 0) return null;
  if (candidates.length !== 1) throw new Error('TF3_NEW_PROCESS_AMBIGUOUS');
  const candidate = candidates[0];
  if (!validPid(candidate.pid) || !validTime(candidate.startedAtMs)
    || candidate.startedAtMs < launchedAfterMs || typeof candidate.exePath !== 'string'
    || !samePath(candidate.exePath, exe)) throw new Error('TF3_NEW_PROCESS_UNQUALIFIED');
  return Object.freeze({ pid: candidate.pid, startedAtMs: candidate.startedAtMs, exePath: path.win32.resolve(exe) });
}

export function pinnedTf3ProcessPresent(processes, pinned) {
  return Array.isArray(processes) && processes.some(item => item.pid === pinned?.pid
    && item.startedAtMs === pinned?.startedAtMs && typeof item.exePath === 'string'
    && samePath(item.exePath, pinned.exePath));
}

export function reconcileLaunchedTf3Process(processes, {
  exe, existingHost = null, launchedAfterMs, spawnedPid, spawnedExited,
  pinned = null, bound = false, absentSinceMs = null, nowMs,
} = {}) {
  if (!validPid(spawnedPid) || !Number.isSafeInteger(nowMs) || nowMs < 1)
    throw new Error('TF3_PROCESS_CHECK_FAILED');
  const observed = selectLaunchedTf3Process(processes, { exe, existingHost, launchedAfterMs });
  if (pinned && observed && (pinned.pid !== observed.pid || pinned.startedAtMs !== observed.startedAtMs)) {
    // Steam may replace only the initially spawned, unbound launch process.
    if (bound || pinned.pid !== spawnedPid || !spawnedExited
      || observed.pid === pinned.pid || observed.startedAtMs <= pinned.startedAtMs)
      throw new Error('TF3_NEW_PROCESS_CHANGED');
    return { pinned: observed, present: true, absentSinceMs: null, replaced: true };
  }
  if (pinned && !observed) {
    if (bound || pinned.pid !== spawnedPid || !spawnedExited)
      throw new Error('TF3_EXITED_BEFORE_NATIVE_BIND');
    const since = absentSinceMs ?? nowMs;
    // Steam's device selector may wait for a human before replacing the
    // initial process. Keep the one-process identity gate during that wait.
    if (nowMs - since > 90000) throw new Error('TF3_EXITED_BEFORE_NATIVE_BIND');
    return { pinned, present: false, absentSinceMs: since, replaced: false };
  }
  return { pinned: pinned ?? observed, present: observed !== null,
    absentSinceMs: null, replaced: false };
}

export function qualifyBoundHostCoexistence(processes, pinned) {
  if (!pinnedTf3ProcessPresent(processes, pinned)) throw new Error('TF3_HOST_PROCESS_CHANGED');
  const others = processes.filter(item => item.pid !== pinned.pid);
  if (others.length > 1 || others.some(item => typeof item.exePath !== 'string'
    || !samePath(item.exePath, pinned.exePath) || item.startedAtMs <= pinned.startedAtMs))
    throw new Error('TF3_COEXISTENCE_UNQUALIFIED');
  return true;
}
