import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { attachAuthenticatedEngineSession } from '../src/authenticated-engine-session.mjs';

const capture = { roundId: 'round', updateCount: 140, players: [
  { playerId: 'a', companyEntity: 7 }, { playerId: 'b', companyEntity: 9 },
] };

function connection() {
  const events = new EventEmitter(), socket = { destroyed: false, destroy() { this.destroyed = true; } };
  return { socket, playerId: 'a', send() {}, subscribe(listener) { events.on('message', listener); return () => events.off('message', listener); }, emit(message) { events.emit('message', message); } };
}

test('authenticated capture builds one real adapter from its roster and forwards later coordinator frames', async () => {
  const c = connection(), calls = [], received = [];
  const attached = attachAuthenticatedEngineSession({ connection: c, createAdapter: context => {
    calls.push(context); return { receive(kind, payload) { received.push({ kind, payload }); return true; }, poll() {}, close() {} };
  } });
  c.emit({ kind: 'coordination_capture', payload: capture });
  await attached.attachment;
  c.emit({ kind: 'coordination_ready', payload: { roundId: 'round' } });
  assert.equal(attached.ready, true);
  assert.equal(calls.length, 1);
  assert.deepEqual([...calls[0].companies], [['a', 7], ['b', 9]]);
  assert.deepEqual(received.map(frame => frame.kind), ['coordination_capture', 'coordination_ready']);
  await attached.close();
});

test('untrusted/malformed capture and a rejected coordinator frame close instead of making an adapter', async () => {
  const c = connection(); let constructed = false;
  const attached = attachAuthenticatedEngineSession({ connection: c, createAdapter() { constructed = true; return { receive() { return true; }, poll() {}, close() {} }; } });
  c.emit({ kind: 'coordination_capture', payload: { ...capture, players: [{ playerId: 'a', companyEntity: 7 }] } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(constructed, false); assert.equal(c.socket.destroyed, true); assert.equal(attached.ready, false);

  const second = connection();
  const rejected = attachAuthenticatedEngineSession({ connection: second, createAdapter() { return { receive() { return false; }, poll() {}, close() {} }; } });
  second.emit({ kind: 'coordination_capture', payload: capture });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(second.socket.destroyed, true); assert.equal(rejected.ready, false);
});

test('frames arriving during adapter construction retain authenticated order', async () => {
  const c = connection(), received = []; let resolve;
  const attached = attachAuthenticatedEngineSession({ connection: c, createAdapter: () => new Promise(done => { resolve = () => done({ receive(kind) { received.push(kind); return true; }, poll() {}, close() {} }); }) });
  c.emit({ kind: 'coordination_capture', payload: capture });
  c.emit({ kind: 'coordination_heartbeat', payload: { roundId: 'round' } });
  resolve(); await attached.attachment;
  assert.deepEqual(received, ['coordination_capture', 'coordination_heartbeat']);
  await attached.close();
});

test('authenticated adapter polling is serialized, teardown is awaited, and a rejected poll closes transport', async () => {
  const c = connection(); let polls = 0, concurrent = 0, maximum = 0, release, closes = 0;
  const attached = attachAuthenticatedEngineSession({ connection: c, pollIntervalMs: 10, createAdapter: () => ({
    receive() { return true; },
    poll() { polls++; concurrent++; maximum = Math.max(maximum, concurrent); return new Promise(resolve => { release = () => { concurrent--; resolve(); }; }); },
    async close() { closes++; },
  }) });
  c.emit({ kind: 'coordination_capture', payload: capture });
  await attached.attachment;
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(polls, 1); assert.equal(maximum, 1);
  const closing = attached.close();
  release(); await closing;
  assert.equal(closes, 1); assert.equal(c.socket.destroyed, true);

  const rejectedConnection = connection();
  const rejected = attachAuthenticatedEngineSession({ connection: rejectedConnection, pollIntervalMs: 10,
    createAdapter: () => ({ receive() { return true; }, poll() { return Promise.reject(new Error('bridge lost')); }, close() {} }) });
  rejectedConnection.emit({ kind: 'coordination_capture', payload: capture });
  await rejected.attachment;
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(rejectedConnection.socket.destroyed, true);
  await rejected.close();
});
