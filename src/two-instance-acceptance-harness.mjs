import path from 'node:path';

const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const port = value => Number.isSafeInteger(value) && value >= 1024 && value <= 65535;
const ident = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const absolute = value => typeof value === 'string' && path.isAbsolute(value);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');

function bridgeDirectory(value, role) {
  if (!absolute(value) || path.basename(value).toLowerCase() !== 'tf3mp_status_1') {
    throw new TypeError(`${role.toUpperCase()}_BRIDGE_DIRECTORY_REQUIRED`);
  }
  return path.resolve(value);
}

function saveIdentity(value) {
  if (!exactKeys(value, ['bytes', 'sha256']) || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || !hash(value.sha256)) {
    throw new TypeError('EXACT_SAVE_IDENTITY_REQUIRED');
  }
  return Object.freeze({ bytes: value.bytes, sha256: value.sha256 });
}

// This is deliberately a *launch plan*, not a launcher.  The CLI already owns
// authenticated Host/Join, save transfer, and native-gate admission; creating a
// second transport here would make a dry-run look more complete than it is.
export function createTwoInstanceAcceptancePlan({ sessionId, save, hostBridgeDirectory,
  joinBridgeDirectory, joinSaveDirectory, hostName = 'Host', joinName = 'Join',
  hostPort, savePort, hostNativePipe, joinNativePipe, modManifestHash, hostSaveFile, exe } = {}) {
  if (!ident(sessionId) || !ident(hostName) || !ident(joinName) || hostName === joinName) {
    throw new TypeError('DISTINCT_SESSION_IDENTITIES_REQUIRED');
  }
  if (!port(hostPort) || !port(savePort) || hostPort === savePort) throw new TypeError('DISTINCT_HOST_SAVE_PORTS_REQUIRED');
  if (!ident(hostNativePipe) || !ident(joinNativePipe) || hostNativePipe === joinNativePipe) {
    throw new TypeError('DISTINCT_NATIVE_IDENTITIES_REQUIRED');
  }
  const hostBridge = bridgeDirectory(hostBridgeDirectory, 'host');
  const joinBridge = bridgeDirectory(joinBridgeDirectory, 'join');
  if (hostBridge.toLowerCase() === joinBridge.toLowerCase() || !absolute(joinSaveDirectory)) {
    throw new TypeError('SEPARATE_INSTANCE_DIRECTORIES_REQUIRED');
  }
  const verifiedSave = saveIdentity(save);
  if (!hash(modManifestHash)) throw new TypeError('EXACT_MOD_MANIFEST_HASH_REQUIRED');
  if (!absolute(hostSaveFile)) throw new TypeError('ABSOLUTE_HOST_SAVE_FILE_REQUIRED');
  if (exe !== undefined && !absolute(exe)) throw new TypeError('ABSOLUTE_EXE_REQUIRED');
  const shared = ['--session', sessionId, '--mod-hash', modManifestHash, ...(exe ? ['--exe', path.resolve(exe)] : [])];
  return Object.freeze({
    schemaVersion: 1,
    kind: 'tf3mp_two_instance_acceptance_plan',
    liveLaunchPerformed: false,
    sessionId,
    expectedSave: verifiedSave,
    instances: Object.freeze({
      host: Object.freeze({ identity: hostName, bridgeDirectory: hostBridge, nativePipe: hostNativePipe,
        commandPort: hostPort, savePort,
        command: Object.freeze(['node', 'src/cli.mjs', 'host', ...shared, '--port', String(hostPort), '--save-port', String(savePort),
          '--save', path.resolve(hostSaveFile), '--bridge-dir', hostBridge, '--host-local-name', hostName,
          '--native-pipe', hostNativePipe, '--native-token', '<from-TF3MP_HOST_NATIVE_TOKEN>']) }),
      join: Object.freeze({ identity: joinName, bridgeDirectory: joinBridge, saveDirectory: path.resolve(joinSaveDirectory), nativePipe: joinNativePipe,
        connectsTo: Object.freeze({ host: '127.0.0.1', commandPort: hostPort, savePort }),
        prepareCommand: Object.freeze(['node', 'src/cli.mjs', 'prepare-join', '--session', sessionId,
          '--host', '127.0.0.1', '--save-port', String(savePort), '--save-dir', path.resolve(joinSaveDirectory),
          '--bridge-dir', joinBridge]),
        command: Object.freeze(['node', 'src/cli.mjs', 'join', ...shared, '--host', '127.0.0.1', '--port', String(hostPort), '--save-port', String(savePort),
          '--name', joinName, '--save-dir', path.resolve(joinSaveDirectory), '--bridge-dir', joinBridge,
          '--prepared-save', '<path-from-prepare-join>',
          '--native-pipe', joinNativePipe, '--native-token', '<from-TF3MP_JOIN_NATIVE_TOKEN>']) }),
    }),
    requiredEvidence: Object.freeze([
      'host CLI reports the expected save bytes and SHA-256 before Join admission',
      'Join prepares the authenticated downloaded save before TF3 launch and save_ready matches the admitted identity',
      'both TF3 instances emit held checkpoint receipts for one round/update count with the same checkpoint hash',
      'the native gate and adapter report a correlated command receipt and observed postcondition on both instances',
    ]),
    limitations: Object.freeze([
      'This plan does not launch Transport Fever 3, a debugger, the native runtime, Host, or Join.',
      'The prepared file and a live bridge alone do not prove TF3 loaded that exact save; observe the game world and compare checkpoints.',
      'Separate native pipe identities are planned, but the current native gate is not production-qualified for engine control.',
      'A matching checkpoint proves only the observed checkpoint scope; it is not proof of whole-world determinism.',
    ]),
  });
}

function checkpoint(value) {
  if (!exactKeys(value, ['checkpointHash', 'comparisonReady', 'roundId', 'updateCount'])
    || !ident(value.roundId) || !Number.isSafeInteger(value.updateCount) || value.updateCount < 0
    || !hash(value.checkpointHash) || value.comparisonReady !== true) throw new TypeError('INVALID_CHECKPOINT_RESULT');
  return value;
}

function result(value) {
  if (!exactKeys(value, ['checkpoint', 'save']) || !exactKeys(value.save, ['bytes', 'sha256'])) {
    throw new TypeError('INVALID_INSTANCE_RESULT');
  }
  return { save: saveIdentity(value.save), checkpoint: checkpoint(value.checkpoint) };
}

// Consume independently captured result records.  It validates agreement but
// intentionally cannot attest that any record came from a real TF3 process.
export function collectTwoInstanceAcceptanceEvidence({ plan, host, join } = {}) {
  if (!plan || plan.kind !== 'tf3mp_two_instance_acceptance_plan' || plan.liveLaunchPerformed !== false) {
    throw new TypeError('TWO_INSTANCE_PLAN_REQUIRED');
  }
  const hostResult = result(host), joinResult = result(join), expected = saveIdentity(plan.expectedSave);
  const saveMatches = [hostResult.save, joinResult.save].every(value => value.bytes === expected.bytes && value.sha256 === expected.sha256);
  const checkpointMatches = hostResult.checkpoint.roundId === joinResult.checkpoint.roundId
    && hostResult.checkpoint.updateCount === joinResult.checkpoint.updateCount
    && hostResult.checkpoint.checkpointHash === joinResult.checkpoint.checkpointHash;
  return Object.freeze({
    schemaVersion: 1, kind: 'tf3mp_two_instance_acceptance_evidence',
    saveMatches, checkpointMatches,
    host: Object.freeze(hostResult), join: Object.freeze(joinResult),
    realEngineVerified: false,
    acceptancePassed: false,
    outstanding: Object.freeze([
      ...(saveMatches ? [] : ['exact host/join save identity mismatch']),
      ...(checkpointMatches ? [] : ['held checkpoint round/update/hash mismatch']),
      'run the plan against two real TF3 processes and preserve correlated native command/postcondition receipts',
    ]),
  });
}
