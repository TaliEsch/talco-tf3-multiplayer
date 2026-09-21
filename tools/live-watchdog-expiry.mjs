import assert from 'node:assert/strict';
import path from 'node:path';
import { startGameBridge } from '../src/game-bridge.mjs';

const [directory] = process.argv.slice(2);
assert.ok(path.isAbsolute(directory ?? '') && path.basename(directory) === 'tf3mp_status_1',
  'usage: node tools/live-watchdog-expiry.mjs <absolute bridge directory>');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = Date.now() + 30_000;
let bridge, lease, failure = null;
try {
  bridge = await startGameBridge({ directory, intervalMs: 50, staleMs: 3000,
    logger: event => process.stderr.write(`${JSON.stringify(event)}\n`) });
  while (!bridge.connected || !bridge.engineObservation.available) {
    if (Date.now() >= deadline) throw new Error('live bridge observation timeout');
    await sleep(50);
  }
  const sample = () => ({ ...bridge.engineObservation.sample });
  assert.equal(sample().speedup, 1, 'watchdog test requires a running disposable game');
  lease = await bridge.startCoordinationLease({ healthy: () => true,
    onFailure: code => { failure = code; } });
  while (!lease.active) {
    if (failure || Date.now() >= deadline) throw new Error(`lease activation failed: ${failure ?? 'timeout'}`);
    await sleep(50);
  }
  const armed = { ...sample(), confirmedExpiry: lease.confirmedExpiry };
  lease.stop();
  let lastUpdate = sample().updateCount, stoppedAt = null, stableSince = null;
  while (Date.now() < deadline) {
    const current = sample();
    if (current.speedup === 0) {
      if (current.updateCount !== lastUpdate) stableSince = null;
      else stableSince ??= Date.now();
      if (Date.now() - stableSince >= 1000) { stoppedAt = current; break; }
    }
    lastUpdate = current.updateCount;
    await sleep(50);
  }
  process.stdout.write(`${JSON.stringify({ event: 'live_watchdog_expiry', armed, stoppedAt,
    failure, final: sample(), halted: stoppedAt !== null })}\n`);
  if (!stoppedAt) process.exitCode = 2;
} finally {
  lease?.stop();
  await bridge?.close().catch(() => {});
}
