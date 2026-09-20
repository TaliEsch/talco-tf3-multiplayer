import {open, writeFile} from 'node:fs/promises';
import {sha256File} from '../src/compatibility.mjs';
import {hashManifest} from '../src/manifest.mjs';
import {createRoadStopReplayCase} from '../src/road-stop-replay-case.mjs';
import {parseRoadStopCaptureEnvelope, ROAD_STOP_ENVELOPE_MAX_BYTES} from '../src/road-stop-capture-envelope.mjs';

// Offline evidence only. Never dispatch a command or overwrite a checkpoint.
// Record identity BEFORE placement; capture must use that exact identity file.
async function boundedRead(filename, limit) {
  const handle = await open(filename, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error('INVALID_FILE');
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const {bytesRead} = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limit || length !== stat.size) throw new Error('CHANGED_FILE');
    return new TextDecoder('utf-8', {fatal: true}).decode(buffer.subarray(0, length));
  } finally { await handle.close(); }
}

const [mode, ...args] = process.argv.slice(2);
try {
  if (mode === 'checkpoint' && args.length === 4) {
    const [save, game, mod, output] = args;
    const [saveSha256, gameSha256, modManifestSha256] = await Promise.all([
      sha256File(save), sha256File(game), hashManifest(mod),
    ]);
    await writeFile(output, JSON.stringify({saveSha256, gameSha256, modManifestSha256}) + '\n', {flag: 'wx', mode: 0o600});
    console.log('CHECKPOINT_IDENTITY_RECORDED — file identity only; loaded game is not verified.');
  } else if (mode === 'capture' && args.length === 3) {
    const [identityFile, applyFile, output] = args;
    const checkpoint = JSON.parse(await boundedRead(identityFile, 1024));
    const applyEnvelope = await boundedRead(applyFile, ROAD_STOP_ENVELOPE_MAX_BYTES);
    const parsed = parseRoadStopCaptureEnvelope(applyEnvelope);
    const companyEntity = parsed.capture.proposal.street.edgeObjectsToAdd[0].playerEntity;
    const artifact = createRoadStopReplayCase({applyEnvelope, checkpoint, companyEntity});
    await writeFile(output, artifact.canonical + '\n', {flag: 'wx', mode: 0o600});
    console.log(JSON.stringify({code: 'REPLAY_CASE_RECORDED', caseDigest: artifact.digest,
      executionAuthorized: false, loadedCheckpointVerified: false}));
  } else {
    console.error('Usage: node tools/road-stop-replay-case.mjs checkpoint <pre-action-save> <game-exe> <mod-directory> <new-identity-file>\n       node tools/road-stop-replay-case.mjs capture <identity-file> <apply-userdata-file> <new-case-file>');
    process.exitCode = 1;
  }
} catch {
  console.error('REPLAY_CASE_FAILED — invalid input, unreadable file, or output already exists. Nothing was dispatched.');
  process.exitCode = 1;
}
