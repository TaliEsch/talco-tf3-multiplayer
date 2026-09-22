import assert from 'node:assert/strict';
import {existsSync, statSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const host = fileURLToPath(new URL('../dist/native-inprocess-control-ipc/TF3OwnedControlIpcHost.exe', import.meta.url));
const sources = ['inprocess_control.cpp', 'inprocess_control.h', 'inprocess_control_ipc_host.cpp', 'runtime_ipc.h']
  .map(name => fileURLToPath(new URL(`../native/${name}`, import.meta.url)));
const skip = process.platform !== 'win32' || !existsSync(host);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function frame(type, id, epoch, payload) {
  const body = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
  const out = Buffer.alloc(36 + body.length);
  out.writeUInt32LE(0x54463349); out.writeUInt16LE(1, 4); out.writeUInt16LE(type, 6);
  out.writeUInt32LE(body.length, 8); out.writeBigUInt64LE(BigInt(id), 12); epoch.copy(out, 20); body.copy(out, 36);
  return out;
}
async function fixture(t, {slow = false, authenticate = true} = {}) {
  assert.ok(sources.every(source => statSync(host).mtimeMs >= statSync(source).mtimeMs), 'Build-InProcessControlIpc.ps1 must produce fresh binaries.');
  const pipe = `tf3_owned_control_${randomBytes(10).toString('hex')}`, token = randomBytes(32).toString('hex');
  const child = spawn(host, ['--pipe', pipe, ...(slow ? ['--slow-step'] : [])], {
    windowsHide: true, env: {...process.env, TF3_RUNTIME_TOKEN: token}, stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '', stderr = '', socket;
  child.stdout.on('data', data => {stdout += data;}); child.stderr.on('data', data => {stderr += data;});
  const exit = new Promise(resolve => child.once('exit', code => resolve(code)));
  t.after(async () => {socket?.destroy(); if (child.exitCode === null) await Promise.race([exit, sleep(2000)]); if (child.exitCode === null) child.kill();});
  for (let i = 0; i < 100 && !socket; i++) {
    try {socket = await new Promise((resolve, reject) => {
      const candidate = net.createConnection(`\\\\.\\pipe\\${pipe}`);
      candidate.once('connect', () => {candidate.removeAllListeners('error'); resolve(candidate);});
      candidate.once('error', error => {candidate.destroy(); reject(error);});
    });} catch {await sleep(10);}
  }
  assert.ok(socket, stderr);
  let sequence = 1, epoch = Buffer.alloc(16), buffer = Buffer.alloc(0);
  const pending = new Map();
  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 36) {
      const size = buffer.readUInt32LE(8); if (buffer.length < 36 + size) break;
      const packet = buffer.subarray(0, 36 + size); buffer = buffer.subarray(36 + size);
      const type = packet.readUInt16LE(6), id = packet.readBigUInt64LE(12).toString();
      if (type === 2) epoch = Buffer.from(packet.subarray(20, 36));
      const waiter = pending.get(id);
      if (waiter) {clearTimeout(waiter.timer); pending.delete(id); waiter.resolve({type, payload: JSON.parse(packet.subarray(36))});}
    }
  });
  const closed = () => {for (const waiter of pending.values()) {clearTimeout(waiter.timer); waiter.reject(new Error('fixture disconnected'));} pending.clear();};
  socket.on('error', closed); socket.on('close', closed);
  function request(type, payload, forcedId) {
    const id = forcedId ?? sequence++; sequence = Math.max(sequence, id + 1);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {pending.delete(String(id)); reject(new Error(`request ${id} timeout`));}, 2000);
      pending.set(String(id), {resolve, reject, timer}); socket.write(frame(type, id, epoch, payload));
    });
  }
  const control = (name, id) => request(3, {control: name}, id);
  const result = {socket, control, request, token, epoch: () => epoch, async stopped() {
    assert.equal(await exit, 0, stderr);
    return JSON.parse(stdout.trim());
  }};
  if (authenticate) {
    const hello = await request(1, {token});
    assert.equal(hello.type, 2);
    assert.deepEqual(hello.payload.capabilities, ['transport.health', 'qualification.owned.control']);
    assert.equal(hello.payload.productionQualified, false); assert.equal(hello.payload.engineObserver, false);
    assert.equal((await control('hold')).payload.simulationThreadHeld, true);
  }
  return result;
}
test('owned control IPC holds a real worker, permits one iteration per release, and keeps traffic responsive', {skip}, async t => {
  const f = await fixture(t);
  const before = (await f.control('ping')).payload;
  await sleep(80);
  assert.equal((await f.control('ping')).payload.completedIterations, before.completedIterations);
  for (let step = 1; step <= 3; step++) {
    const receipt = await f.control('release-one');
    assert.equal(receipt.type, 4); assert.equal(receipt.payload.status, 'completed');
    assert.equal(receipt.payload.completedIterations, before.completedIterations + step);
    assert.equal(receipt.payload.simulationThreadHeld, true);
    assert.equal(receipt.payload.engineHalted, false); assert.equal(receipt.payload.protocolHalted, false);
  }
  await f.control('shutdown'); f.socket.destroy();
  const stopped = await f.stopped();
  assert.equal(stopped.fixtureWorkerStopped, true); assert.equal(stopped.protocolHalted, true);
  assert.equal(stopped.simulationThreadHeld, false);
  assert.equal(stopped.engineHalted, false);
});
test('owned control IPC rejects duplicates, out-of-order IDs and ambiguous controls without extra iterations', {skip}, async t => {
  const f = await fixture(t);
  assert.equal((await f.control('release-one', 20)).payload.completedIterations, 1);
  assert.equal((await f.control('release-one', 20)).payload.code, 'DUPLICATE_ID');
  assert.equal((await f.control('release-one', 19)).payload.code, 'OUT_OF_ORDER_ID');
  assert.equal((await f.request(3, '{"control":"release-one","control":"ping"}')).payload.code, 'INVALID_CONTROL');
  assert.equal((await f.control('ping')).payload.completedIterations, 1);
  f.socket.destroy(); assert.equal((await f.stopped()).completedIterations, 1);
});
test('owned control IPC continues receiving ping during an in-flight release and latches unknown timeout without retry', {skip}, async t => {
  const f = await fixture(t, {slow: true});
  const releasing = f.control('release-one');
  await sleep(30);
  const ping = (await f.control('ping')).payload;
  assert.equal(ping.completedIterations, 0); assert.equal(ping.simulationThreadHeld, false);
  assert.equal((await f.control('release-one')).payload.code, 'CONTROL_PENDING');
  const unknown = await releasing;
  assert.equal(unknown.type, 6); assert.equal(unknown.payload.code, 'UNKNOWN_ITERATION_OUTCOME');
  assert.equal(unknown.payload.protocolHalted, true); assert.equal(unknown.payload.simulationThreadHeld, false);
  assert.equal((await f.control('release-one')).payload.code, 'PROTOCOL_HALTED');
  await sleep(850);
  const stopped = (await f.control('ping')).payload;
  assert.equal(stopped.completedIterations, 1); assert.equal(stopped.fixtureWorkerStopped, true);
  assert.equal(stopped.engineHalted, false);
  f.socket.destroy(); assert.equal((await f.stopped()).completedIterations, 1);
});
test('owned control IPC accepts halt while release is in flight and never claims an immediate engine halt', {skip}, async t => {
  const f = await fixture(t, {slow: true});
  const release = f.control('release-one'); await sleep(30);
  const halt = (await f.control('halt')).payload;
  assert.equal(halt.protocolHalted, true); assert.equal(halt.simulationThreadHeld, false); assert.equal(halt.engineHalted, false);
  assert.equal((await release).payload.code, 'UNKNOWN_ITERATION_OUTCOME');
  assert.equal((await f.control('release-one')).payload.code, 'PROTOCOL_HALTED');
  f.socket.destroy(); const stopped = await f.stopped();
  assert.equal(stopped.fixtureWorkerStopped, true); assert.equal(stopped.completedIterations, 1);
});
test('owned control IPC disconnect latches halt while held with no implicit release', {skip}, async t => {
  const f = await fixture(t); f.socket.destroy();
  const stopped = await f.stopped();
  assert.equal(stopped.protocolHalted, true); assert.equal(stopped.fixtureWorkerStopped, true);
  assert.equal(stopped.completedIterations, 0);
});
test('owned control IPC disconnect during a consumed permit allows no additional iteration', {skip}, async t => {
  const f = await fixture(t, {slow: true});
  const release = f.control('release-one').catch(error => error);
  await sleep(30);
  assert.equal((await f.control('ping')).payload.simulationThreadHeld, false);
  f.socket.destroy();
  assert.match((await release).message, /disconnected/);
  const stopped = await f.stopped();
  assert.equal(stopped.protocolHalted, true); assert.equal(stopped.fixtureWorkerStopped, true);
  assert.equal(stopped.completedIterations, 1); assert.equal(stopped.engineHalted, false);
});
for (const mode of ['wrong-token', 'stale-epoch', 'malformed-header', 'partial-frame', 'silent-hello']) {
  test(`owned control IPC rejects ${mode} and fail-stops its owned worker`, {skip}, async t => {
    const unauthenticated = mode === 'wrong-token' || mode === 'silent-hello';
    const f = await fixture(t, {authenticate: !unauthenticated});
    if (mode === 'wrong-token') f.socket.write(frame(1, 1, Buffer.alloc(16), {token: '0'.repeat(64)}));
    if (mode === 'stale-epoch') f.socket.write(frame(3, 50, Buffer.alloc(16, 1), {control: 'release-one'}));
    if (mode === 'malformed-header') f.socket.write(Buffer.alloc(36, 0xff));
    if (mode === 'partial-frame') f.socket.write(Buffer.from([0x49]));
    const stopped = await f.stopped();
    assert.equal(stopped.protocolHalted, true); assert.equal(stopped.fixtureWorkerStopped, true);
    assert.equal(stopped.completedIterations, 0); assert.equal(stopped.engineHalted, false);
  });
}
