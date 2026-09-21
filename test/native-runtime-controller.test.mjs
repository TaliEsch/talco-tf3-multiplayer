import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const exe = fileURLToPath(new URL('../dist/native-runtime/TF3RuntimeController.exe', import.meta.url));
const sources = ['runtime_controller.cpp', 'runtime_observer.cpp', 'runtime_ipc.h']
  .map(name => fileURLToPath(new URL(`../native/${name}`, import.meta.url)));
const skip = process.platform !== 'win32' || !existsSync(exe);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function assertFreshBinary() {
  assert.ok(sources.every(source => statSync(exe).mtimeMs >= statSync(source).mtimeMs),
    'Run Build-NativeRuntime.ps1 first; controller executable or an included dependency is stale.');
}
function frame(type, id, session, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  const result = Buffer.alloc(36 + body.length);
  result.writeUInt32LE(0x54463349, 0); result.writeUInt16LE(1, 4); result.writeUInt16LE(type, 6);
  result.writeUInt32LE(body.length, 8); result.writeBigUInt64LE(BigInt(id), 12);
  session.copy(result, 20); body.copy(result, 36); return result;
}
async function connect(credentials, overrideToken) {
  let socket;
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      socket = await new Promise((resolve, reject) => {
        const candidate = net.createConnection(`\\\\.\\pipe\\${credentials.pipe}`);
        candidate.once('connect', () => { candidate.removeAllListeners('error'); resolve(candidate); });
        candidate.once('error', error => { candidate.destroy(); reject(error); });
      }); break;
    } catch { await sleep(20); }
  }
  assert.ok(socket, 'controller pipe did not open');
  let buffer = Buffer.alloc(0), session = Buffer.alloc(16), sequence = 1;
  const waiting = new Map();
  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 36) {
      const size = buffer.readUInt32LE(8); if (buffer.length < 36 + size) break;
      const packet = buffer.subarray(0, 36 + size); buffer = buffer.subarray(36 + size);
      const type = packet.readUInt16LE(6), id = packet.readBigUInt64LE(12).toString();
      if (type === 2) session = Buffer.from(packet.subarray(20, 36));
      const waiter = waiting.get(id);
      if (waiter) { clearTimeout(waiter.timer); waiting.delete(id); waiter.resolve({ type, payload: JSON.parse(packet.subarray(36)) }); }
    }
  });
  const closed = () => { for (const waiter of waiting.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('controller disconnected')); } waiting.clear(); };
  socket.on('error', closed); socket.on('close', closed);
  const request = (type, payload, forcedId) => new Promise((resolve, reject) => {
    const id = forcedId ?? sequence++;
    if (forcedId !== undefined) sequence = Math.max(sequence, forcedId + 1);
    const timer = setTimeout(() => { waiting.delete(String(id)); reject(new Error(`controller request ${id} timed out`)); }, 5000);
    waiting.set(String(id), { resolve, reject, timer }); socket.write(frame(type, id, session, payload));
  });
  try {
    const hello = await request(1, { token: overrideToken ?? credentials.token });
    assert.equal(hello.type, 2);
    return { socket, hello: hello.payload, epoch: session.toString('hex'), control: (control, id) => request(3, { control }, id),
      bind: (sessionId, role) => request(3, { control: 'bind', sessionId, role }), close: () => socket.destroy() };
  } catch (error) { socket.destroy(); throw error; }
}
async function start(t, mode = '--fixture', bind = true) {
  assertFreshBinary();
  const credentials = { pipe: `tf3_gate_${randomBytes(10).toString('hex')}`, token: randomBytes(32).toString('hex') };
  const child = spawn(exe, [mode, '--pipe', credentials.pipe], {
    windowsHide: true, env: { ...process.env, TF3_RUNTIME_TOKEN: credentials.token }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '', errors = '', fixturePid;
  child.stdout.on('data', data => {
    output += data;
    for (const line of output.split(/\r?\n/)) {
      if (line.startsWith('{')) { try { const value = JSON.parse(line); if (value.event === 'controller-started') fixturePid = value.pid; } catch {} }
    }
  });
  child.stderr.on('data', data => { errors += data; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const runtime = { child, credentials, exited, client: undefined, output: () => output, errors: () => errors };
  t.after(async () => {
    if (child.exitCode === null) {
      try {
        const cleanup = await connect(credentials);
        await cleanup.control('shutdown'); cleanup.close();
      } catch {
        // Only our fixture child and our controller may be terminated; no TF3
        // process is ever launched, located, attached, or killed by these tests.
        if (fixturePid) { try { process.kill(fixturePid); } catch {} }
        child.kill();
      }
    }
    runtime.client?.close();
  });
  runtime.client = await connect(credentials);
  if (bind) assert.equal((await runtime.client.bind('owned-fixture.session:1', 'host')).type, 4);
  return runtime;
}
async function held(client) {
  const response = await client.control('hold');
  assert.equal(response.type, 4);
  assert.equal(response.payload.engineHalted, true);
  return response.payload;
}

async function waitForProcessExit(pid, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    await sleep(20);
  }
  assert.fail(`owned fixture ${pid} remained alive after controller termination`);
}

test('native controller trap ownership requires tracked armed execution slots, matching exception address and RIP, and excludes TF/BD/BS/BT', { skip }, () => {
  assertFreshBinary();
  const result = spawnSync(exe, ['--self-test-trap-ownership'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    event: 'controller-trap-ownership-passed', sites: 4, rejectedCases: 52, missingDr6Accepted: true
  });
});

for (const mode of ['--fixture-multithread', '--fixture-missing-dr6']) {
  test(`native controller ${mode} owns traps across 16 threads and restores cleanly after repeated iteration releases`, { skip, timeout: 25000 }, async t => {
    const runtime = await start(t, mode), client = runtime.client;
    const before = await held(client);
    for (let iteration = 1; iteration <= 12; iteration++) {
      const release = await client.control('release');
      assert.equal(release.type, 4);
      assert.equal(release.payload.engineHalted, true);
      assert.equal(release.payload.completedIterations, iteration);
      assert.equal(release.payload.fixtureIterations, before.fixtureIterations + iteration);
    }
    const paused = (await client.control('ping')).payload;
    await sleep(100);
    const after = (await client.control('ping')).payload;
    assert.equal(after.fixtureIterations, paused.fixtureIterations);
    assert.equal(after.fixtureBackground, paused.fixtureBackground);
    assert.equal((await client.control('shutdown')).payload.state, 'resumed_and_detached');
    assert.equal((await runtime.exited).code, 0, runtime.errors());
    const detached = runtime.output().trim().split(/\r?\n/).map(line => JSON.parse(line))
      .find(value => value.event === 'controller-detached');
    assert.equal(detached.trapThreads, 16, 'every owned fixture worker and the iteration thread must trap');
    assert.ok(detached.trapHits >= 55, 'requires worker pre/post traps and all iteration boundaries');
    if (mode === '--fixture-missing-dr6') assert.equal(detached.missingDr6Hits, detached.trapHits);
    assert.equal(detached.restoredAndDetached, true);
    assert.equal(runtime.errors(), '');
  });
}

test('native controller preserves an unowned trap through emergency hold and shutdown second chance', { skip, timeout: 25000 }, async t => {
  const runtime = await start(t, '--fixture-unowned-trap'), client = runtime.client;
  await held(client);
  const release = await client.control('release');
  assert.equal(release.type, 6);
  assert.equal(release.payload.code, 'UNKNOWN_ITERATION_OUTCOME');
  const before = (await client.control('ping')).payload;
  assert.equal(before.state, 'emergency_halted');
  assert.equal(before.engineHalted, true);
  assert.equal(before.fixtureUnownedTrapDelivered, 0, 'original exception stays held before shutdown');
  assert.equal((await client.control('release')).payload.code, 'GATE_NOT_RELEASABLE');
  await sleep(100);
  const after = (await client.control('ping')).payload;
  assert.equal(after.fixtureIterations, before.fixtureIterations);
  assert.equal(after.fixtureBackground, before.fixtureBackground);
  assert.equal(after.fixtureUnownedTrapDelivered, 0);
  assert.equal((await client.control('shutdown')).type, 4);
  assert.equal((await runtime.exited).code, 0, runtime.errors());
  const events = runtime.output().trim().split(/\r?\n/).map(line => JSON.parse(line));
  const rejected = events.find(value => value.reason === 'controller-unowned-single-step');
  assert.equal(rejected.firstChance, 1);
  assert.notEqual(rejected.exceptionAddress, rejected.rip);
  const forwarded = events.find(value => value.reason === 'cleanup-forwarded-unowned-single-step');
  assert.equal(forwarded.firstChance, 0, 'shutdown must forward the unhandled second chance');
  assert.equal(forwarded.exceptionAddress, rejected.exceptionAddress);
  assert.deepEqual(events.find(value => value.event === 'controller-unowned-trap-delivered'), {
    event: 'controller-unowned-trap-delivered', handlerDeliveries: 1, exitCode: 0x80000004
  });
  assert.equal(runtime.errors(), '');
});

test('native controller holds all fixture threads, receives control while held, and releases exactly one real iteration', { skip, timeout: 25000 }, async t => {
  const runtime = await start(t), client = runtime.client;
  assert.deepEqual(client.hello.capabilities, ['transport.health', 'session.bind', 'qualification.fixture.gate']);
  assert.equal(client.hello.productionQualified, false);
  assert.equal(client.hello.guiFreezes, true);
  const before = await held(client);
  await sleep(100);
  const ping = (await client.control('ping')).payload;
  assert.equal(ping.fixtureIterations, before.fixtureIterations);
  assert.equal(ping.fixtureBackground, before.fixtureBackground, 'all target threads must be halted, including background worker');
  const release = await client.control('release');
  assert.equal(release.type, 4);
  assert.equal(release.payload.state, 'held_at_pre');
  assert.equal(release.payload.engineHalted, true);
  assert.equal(release.payload.completedIterations, 1);
  assert.equal(release.payload.fixtureIterations, before.fixtureIterations + 1);
  await sleep(100);
  const after = (await client.control('ping')).payload;
  assert.equal(after.fixtureIterations, release.payload.fixtureIterations);
  assert.equal(after.fixtureBackground, release.payload.fixtureBackground);
  const second = await client.control('release');
  assert.equal(second.payload.completedIterations, 2);
  assert.equal(second.payload.fixtureIterations, before.fixtureIterations + 2);
  const shutdown = await client.control('shutdown');
  assert.equal(shutdown.payload.state, 'resumed_and_detached');
  assert.equal(shutdown.payload.engineHalted, false);
  assert.equal((await runtime.exited).code, 0, runtime.errors());
  assert.match(runtime.output(), /"restoredAndDetached":true/);
});

test('native controller fail-stops a held owned fixture when the controller is terminated abruptly', { skip, timeout: 25000 }, async t => {
  const runtime = await start(t), client = runtime.client;
  await held(client);
  assert.ok(runtime.output().includes('"ownedFixture":true'));
  const fixture = /"event":"controller-started","pid":(\d+)/.exec(runtime.output());
  assert.ok(fixture, 'controller did not report its owned fixture PID');
  runtime.client.close();
  runtime.child.kill();
  await runtime.exited;
  await waitForProcessExit(Number(fixture[1]));
});

test('native controller requires one-time authenticated session binding before readiness or release and preserves it across reconnect', { skip, timeout: 25000 }, async t => {
  const runtime = await start(t, '--fixture', false), client = runtime.client;
  const before = await held(client);
  assert.equal(before.sessionBound, false);
  assert.equal(before.gateReady, false);
  assert.equal((await client.control('release')).payload.code, 'SESSION_NOT_BOUND');
  for (const [identity, role] of [['bad space', 'host'], ['', 'host'], ['a'.repeat(129), 'host'], ['okay', 'join']]) {
    assert.equal((await client.bind(identity, role)).payload.code, 'INVALID_CONTROL');
  }
  const bound = (await client.bind('short_safe.session:1', 'participant')).payload;
  assert.equal(bound.sessionBound, true);
  assert.equal(bound.gateReady, true);
  assert.equal(bound.boundSessionId, 'short_safe.session:1');
  assert.equal(bound.boundRole, 'participant');
  assert.equal((await client.bind('short_safe.session:1', 'participant')).payload.code, 'SESSION_ALREADY_BOUND');
  assert.equal((await client.bind('different', 'host')).payload.code, 'SESSION_ALREADY_BOUND');
  client.close(); await sleep(50);
  const reconnected = runtime.client = await connect(runtime.credentials);
  const ping = (await reconnected.control('ping')).payload;
  assert.equal(ping.boundSessionId, 'short_safe.session:1');
  assert.equal(ping.boundRole, 'participant');
  assert.equal(ping.sessionBound, true);
  assert.equal(ping.gateReady, false, 'disconnect latches emergency halt despite persistent binding');
  assert.equal(ping.fixtureIterations, before.fixtureIterations);
  assert.equal((await reconnected.bind('other', 'host')).payload.code, 'SESSION_ALREADY_BOUND');
  await reconnected.control('shutdown');
  assert.equal((await runtime.exited).code, 0, runtime.errors());
});

test('native controller latches emergency halt, refuses release and still accepts authenticated ping/shutdown', { skip, timeout: 25000 }, async t => {
  const runtime = await start(t), client = runtime.client;
  const before = await held(client);
  assert.equal((await client.control('halt')).payload.state, 'emergency_halted');
  const refusal = await client.control('release');
  assert.equal(refusal.type, 6); assert.equal(refusal.payload.code, 'GATE_NOT_RELEASABLE');
  await sleep(100);
  const ping = (await client.control('ping')).payload;
  assert.equal(ping.fixtureIterations, before.fixtureIterations);
  assert.equal(ping.fixtureBackground, before.fixtureBackground);
  await client.control('shutdown');
  assert.equal((await runtime.exited).code, 0, runtime.errors());
});

test('native controller disconnect keeps fixture halted, reconnect uses a fresh session, and duplicates never replay an iteration', { skip, timeout: 25000 }, async t => {
  const runtime = await start(t);
  const before = await held(runtime.client);
  const previousEpoch = runtime.client.epoch;
  runtime.client.close(); await sleep(100);
  const client = runtime.client = await connect(runtime.credentials);
  assert.notEqual(client.epoch, previousEpoch);
  const ping = (await client.control('ping')).payload;
  assert.equal(ping.state, 'emergency_halted');
  assert.equal(ping.fixtureIterations, before.fixtureIterations);
  assert.equal(ping.fixtureBackground, before.fixtureBackground);
  const duplicate = await client.control('release', 2);
  assert.equal(duplicate.type, 6); assert.equal(duplicate.payload.code, 'DUPLICATE_ID');
  assert.equal((await client.control('release')).payload.code, 'GATE_NOT_RELEASABLE');
  await client.control('shutdown');
  assert.equal((await runtime.exited).code, 0, runtime.errors());
});

test('native controller rejects an unauthenticated reconnect without releasing any target thread', { skip, timeout: 25000 }, async t => {
  const runtime = await start(t);
  const before = await held(runtime.client);
  runtime.client.close(); await sleep(50);
  await assert.rejects(connect(runtime.credentials, 'f'.repeat(64)), /disconnected/);
  const client = runtime.client = await connect(runtime.credentials);
  const ping = (await client.control('ping')).payload;
  assert.equal(ping.engineHalted, true);
  assert.equal(ping.fixtureIterations, before.fixtureIterations);
  assert.equal(ping.fixtureBackground, before.fixtureBackground);
  await client.control('shutdown');
  assert.equal((await runtime.exited).code, 0, runtime.errors());
  assert.ok(!runtime.output().includes(runtime.credentials.token));
  assert.ok(!runtime.errors().includes(runtime.credentials.token));
});

test('native controller rejects out-of-order and duplicate releases without executing them', { skip, timeout: 25000 }, async t => {
  const runtime = await start(t), client = runtime.client;
  const before = await held(client);
  await client.control('ping', 10);
  assert.equal((await client.control('release', 9)).payload.code, 'OUT_OF_ORDER_ID');
  assert.equal((await client.control('release', 10)).payload.code, 'DUPLICATE_ID');
  const ping = (await client.control('ping')).payload;
  assert.equal(ping.fixtureIterations, before.fixtureIterations);
  assert.equal(ping.fixtureBackground, before.fixtureBackground);
  const release = (await client.control('release')).payload;
  assert.equal(release.fixtureIterations, before.fixtureIterations + 1);
  await client.control('shutdown');
  assert.equal((await runtime.exited).code, 0, runtime.errors());
});

test('native controller missed iteration deadline halts the actual target and preserves unknown completion without retry', { skip, timeout: 25000 }, async t => {
  const runtime = await start(t, '--fixture-slow'), client = runtime.client;
  const before = await held(client);
  const release = await client.control('release');
  assert.equal(release.type, 6);
  assert.equal(release.payload.code, 'UNKNOWN_ITERATION_OUTCOME');
  const halted = (await client.control('ping')).payload;
  assert.equal(halted.state, 'emergency_halted');
  assert.equal(halted.engineHalted, true);
  assert.equal(halted.completedIterations, 0, 'no post-boundary was observed');
  assert.equal(halted.fixtureIterations, before.fixtureIterations + 1, 'fixture mutation happened before its stalled post-boundary');
  await sleep(100);
  const still = (await client.control('ping')).payload;
  assert.equal(still.fixtureIterations, halted.fixtureIterations);
  assert.equal(still.fixtureBackground, halted.fixtureBackground);
  assert.equal((await client.control('release')).payload.code, 'GATE_NOT_RELEASABLE');
  await client.control('shutdown');
  assert.equal((await runtime.exited).code, 0, runtime.errors());
});
