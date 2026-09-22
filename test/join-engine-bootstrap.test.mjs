import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createJoinEngineBootstrap } from '../src/join-engine-bootstrap.mjs';

const save = Object.freeze({ bytes: 7, sha256: 'c'.repeat(64) });
const admitted = { kind: 'admitted', payload: { player: { playerId: 'a' }, save } };
const capture = { kind: 'coordination_capture', payload: { players: [
  { playerId: 'a', companyEntity: 7 }, { playerId: 'b', companyEntity: 9 },
] } };

function connection() {
  const events = new EventEmitter(), socket = { destroyed: false, destroy() { this.destroyed = true; } };
  const sent = [];
  return { socket, playerId: 'a', sent, send(kind, payload) { sent.push({ kind, payload }); },
    subscribe(listener) { events.on('message', listener); return () => events.off('message', listener); },
    emit(message) { events.emit('message', message); },
  };
}

const loader = createAdapter => async options => ({
  createAdapter, verifiedSave: { ...options.requiredSave },
});

test('join bootstrap downloads and qualifies the exact save, then subscribes before save_ready', async () => {
  const c = connection(), order = [], received = [];
  const bootstrap = createJoinEngineBootstrap({ connection: c, modulePath: 'C:/qualified.mjs',
    downloadSave: async expected => { order.push('download'); assert.deepEqual(expected, save); return { ...save }; },
    loadFactory: async options => { order.push('provider'); assert.equal('secret' in options, false); return loader(() => ({ receive(kind) { received.push(kind); return true; } }))(options); },
    onAdapter() { order.push('adapter'); },
  });
  const attachment = await bootstrap.admitted(admitted);
  assert.deepEqual(order, ['download', 'provider']);
  assert.deepEqual(c.sent, [{ kind: 'save_ready', payload: save }]);
  c.emit(capture);
  await attachment.attachment;
  assert.deepEqual(received, ['coordination_capture']);
  await attachment.close();
});

test('no-save, a download mismatch, or an unqualified provider fails closed before save_ready', async () => {
  for (const scenario of [
    { message: { kind: 'admitted', payload: { save: null } }, download: async () => ({ ...save }), factory: loader(() => true), code: 'SAVE_GATE_REQUIRED' },
    { message: admitted, download: async () => ({ ...save, bytes: 8 }), factory: loader(() => true), code: 'DOWNLOADED_SAVE_MISMATCH' },
    { message: admitted, download: async () => ({ ...save }), factory: async () => null, code: 'ENGINE_FACTORY_REQUIRED' },
  ]) {
    const c = connection(), failures = [];
    const bootstrap = createJoinEngineBootstrap({ connection: c, modulePath: 'C:/qualified.mjs',
      downloadSave: scenario.download, loadFactory: scenario.factory, onFailure: error => failures.push(error.message),
    });
    await assert.rejects(bootstrap.admitted(scenario.message), new RegExp(scenario.code));
    assert.equal(c.socket.destroyed, true);
    assert.deepEqual(c.sent, []);
    assert.match(failures[0], new RegExp(scenario.code));
  }
});

test('provider failure and repeat admission fail closed without producing a second readiness message', async () => {
  const c = connection(), bootstrap = createJoinEngineBootstrap({ connection: c, modulePath: 'C:/qualified.mjs',
    downloadSave: async () => ({ ...save }), loadFactory: async () => { throw new Error('PROVIDER_FAILED'); },
  });
  await assert.rejects(bootstrap.admitted(admitted), /PROVIDER_FAILED/);
  await assert.rejects(bootstrap.admitted(admitted), /ALREADY_STARTED/);
  assert.deepEqual(c.sent, []);
  assert.equal(c.socket.destroyed, true);
});

test('a duplicate admitted frame fails closed even after the first readiness message', async () => {
  const c = connection(), bootstrap = createJoinEngineBootstrap({ connection: c, modulePath: 'C:/qualified.mjs',
    downloadSave: async () => ({ ...save }), loadFactory: loader(() => ({ receive() { return true; } })),
  });
  await bootstrap.admitted(admitted);
  await assert.rejects(bootstrap.admitted(admitted), /ALREADY_STARTED/);
  assert.equal(c.socket.destroyed, true);
  assert.deepEqual(c.sent, [{ kind: 'save_ready', payload: save }]);
});
