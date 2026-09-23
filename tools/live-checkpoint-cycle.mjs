import { createEngineSessionAdapter } from '../src/engine-session-adapter.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// One bridge owner supplies observations and control. This can run inside the
// native checker without contending for the same bridge.lock or spawning a
// second helper against one TF3 process.
export async function runLiveCheckpointCycle({ bridge, directory, localCompany, peerCompany,
  production = true, timeoutMs = 90000 }) {
  const deadline = Date.now() + timeoutMs;
  const events = [];
  let adapter, disconnected = false, ready = null, released = null;
  try {
    while (!bridge.connected || !bridge.engineObservation.available) {
      if (Date.now() >= deadline) throw new Error('live bridge observation timeout');
      await sleep(100);
    }
    adapter = await createEngineSessionAdapter({ directory, bridge, playerId: 'host',
      companies: new Map([['host', localCompany], ['peer', peerCompany]]),
      healthy: () => true, controlsReady: () => true,
      send(kind, payload) {
        events.push({ kind, payload });
        if (kind === 'participant_ready') ready = payload;
        if (kind === 'participant_released') released = payload;
      },
      disconnect: () => { disconnected = true; },
      checkpointEvidenceScope: production ? 'production' : 'local_diagnostic' });
    while (adapter.leaseState !== 'active') {
      if (adapter.phase === 'halted' || ['failed', 'closed'].includes(adapter.leaseState))
        throw new Error(`lease activation failed phase=${adapter.phase} lease=${adapter.leaseState} fault=${adapter.fault}`);
      if (Date.now() >= deadline)
        throw new Error(`lease activation timeout phase=${adapter.phase} lease=${adapter.leaseState} fault=${adapter.fault}`);
      await adapter.poll(); await sleep(50);
    }
    const updateCount = bridge.clock.updateCount + 30;
    if (!adapter.receive('coordination_capture', { roundId: 'live.checkpoint', updateCount,
      players: [{ playerId: 'host', companyEntity: localCompany },
        { playerId: 'peer', companyEntity: peerCompany }] }))
      throw new Error(`checkpoint request rejected phase=${adapter.phase} fault=${adapter.fault}`);
    while (!ready) {
      if (adapter.phase === 'halted' || Date.now() >= deadline)
        throw new Error(`checkpoint capture failed phase=${adapter.phase} fault=${adapter.fault}`);
      await adapter.poll(); await sleep(50);
    }
    if (!adapter.receive('coordination_ready', { roundId: 'live.checkpoint',
      updateCount: ready.updateCount, checkpointHash: ready.checkpointHash }))
      throw new Error(`checkpoint release rejected phase=${adapter.phase} fault=${adapter.fault}`);
    while (!released) {
      if (adapter.phase === 'halted' || Date.now() >= deadline)
        throw new Error(`checkpoint release failed phase=${adapter.phase} fault=${adapter.fault}`);
      await adapter.poll(); await sleep(50);
    }
    if (disconnected) throw new Error('checkpoint diagnostic disconnected');
    return { event: 'live_checkpoint_capture', diagnosticOnly: !production,
      ready, released, checkpointEvidence: adapter.checkpointEvidence,
      eventKinds: events.map(event => event.kind) };
  } finally { await adapter?.close().catch(() => {}); }
}
