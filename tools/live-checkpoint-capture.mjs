import assert from 'node:assert/strict';
import path from 'node:path';
import { startGameBridge } from '../src/game-bridge.mjs';
import { createEngineSessionAdapter } from '../src/engine-session-adapter.mjs';

const [directory, localText, peerText, mode] = process.argv.slice(2);
assert.ok(path.isAbsolute(directory ?? '') && path.basename(directory) === 'tf3mp_status_1',
  'usage: node tools/live-checkpoint-capture.mjs <absolute bridge directory> <local company> <peer company> [--production]');
assert.ok(mode === undefined || mode === '--production', 'mode must be --production when provided');
const production = mode === '--production';
const localCompany = Number(localText), peerCompany = Number(peerText);
assert.ok(Number.isSafeInteger(localCompany) && localCompany > 0 && Number.isSafeInteger(peerCompany)
  && peerCompany > 0 && peerCompany !== localCompany, 'two distinct positive company entities required');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = Date.now() + 90_000;
const events = [];
let bridge, adapter, disconnected = false, ready = null, released = null;
try {
  bridge = await startGameBridge({ directory, intervalMs: 100, staleMs: 3000,
    logger: event => process.stderr.write(`${JSON.stringify(event)}\n`) });
  while (!bridge.connected || !bridge.engineObservation.available) {
    if (Date.now() >= deadline) throw new Error('live bridge observation timeout');
    await sleep(100);
  }
  adapter = await createEngineSessionAdapter({ directory, bridge, playerId: 'host',
    companies: new Map([['host', localCompany], ['peer', peerCompany]]),
    healthy: () => true, controlsReady: () => true,
    send(kind, payload) { events.push({ kind, payload }); if (kind === 'participant_ready') ready = payload; if (kind === 'participant_released') released = payload; },
    disconnect: () => { disconnected = true; }, checkpointEvidenceScope: production ? 'production' : 'local_diagnostic' });

  // startCoordinationLease publishes an arm request, but the lease is not
  // authoritative until TF3 has returned a correlated watchdog receipt.  The
  // production adapter deliberately fails closed if coordination arrives in
  // that window, so this diagnostic must wait instead of racing the engine.
  while (adapter.leaseState !== 'active') {
    if (adapter.phase === 'halted' || ['failed', 'closed'].includes(adapter.leaseState))
      throw new Error(`lease activation failed phase=${adapter.phase} lease=${adapter.leaseState} fault=${adapter.fault}`);
    if (Date.now() >= deadline)
      throw new Error(`lease activation timeout phase=${adapter.phase} lease=${adapter.leaseState} fault=${adapter.fault}`);
    await adapter.poll(); await sleep(50);
  }

  const updateCount = bridge.clock.updateCount + 30;
  const accepted = adapter.receive('coordination_capture', { roundId: 'live.checkpoint', updateCount,
    players: [{ playerId: 'host', companyEntity: localCompany }, { playerId: 'peer', companyEntity: peerCompany }] });
  if (!accepted) throw new Error(`checkpoint request rejected phase=${adapter.phase} fault=${adapter.fault}`);
  while (!ready) {
    if (Date.now() >= deadline) throw new Error(`checkpoint capture timeout phase=${adapter.phase} fault=${adapter.fault}`);
    await adapter.poll(); await sleep(50);
  }
  assert.equal(adapter.receive('coordination_ready', { roundId: 'live.checkpoint', updateCount: ready.updateCount,
    checkpointHash: ready.checkpointHash }), true);
  while (!released) {
    if (Date.now() >= deadline) throw new Error(`checkpoint release timeout phase=${adapter.phase} fault=${adapter.fault}`);
    await adapter.poll(); await sleep(50);
  }
  assert.equal(disconnected, false);
  process.stdout.write(`${JSON.stringify({ event: 'live_checkpoint_capture', diagnosticOnly: !production,
    ready, released, checkpointEvidence: adapter.checkpointEvidence,
    eventKinds: events.map(event => event.kind) })}\n`);
} finally {
  await adapter?.close().catch(() => {});
  await bridge?.close().catch(() => {});
}
