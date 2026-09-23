import assert from 'node:assert/strict';
import path from 'node:path';
import { startGameBridge } from '../src/game-bridge.mjs';
import { runLiveCheckpointCycle } from './live-checkpoint-cycle.mjs';

const [directory, localText, peerText, mode] = process.argv.slice(2);
assert.ok(path.isAbsolute(directory ?? '') && path.basename(directory) === 'tf3mp_status_1',
  'usage: node tools/live-checkpoint-capture.mjs <absolute bridge directory> <local company> <peer company> [--production]');
assert.ok(mode === undefined || mode === '--production', 'mode must be --production when provided');
const localCompany = Number(localText), peerCompany = Number(peerText);
assert.ok(Number.isSafeInteger(localCompany) && localCompany > 0 && Number.isSafeInteger(peerCompany)
  && peerCompany > 0 && peerCompany !== localCompany, 'two distinct positive company entities required');

let bridge;
try {
  bridge = await startGameBridge({ directory, intervalMs: 100, staleMs: 3000,
    logger: event => process.stderr.write(`${JSON.stringify(event)}\n`) });
  const record = await runLiveCheckpointCycle({ bridge, directory, localCompany, peerCompany,
    production: mode === '--production' });
  process.stdout.write(`${JSON.stringify(record)}\n`);
} finally { await bridge?.close().catch(() => {}); }
