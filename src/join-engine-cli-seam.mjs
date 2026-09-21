import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const exactKeys = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === names.slice().sort().join(',');

// A Join-side engine adapter must be supplied by an explicit, separately
// qualified provider. This is composition only: bridge observation and the
// authenticated native binding are prerequisites, not proof of engine control.
export async function loadJoinEngineFactory({ modulePath, bridge, nativeGate,
  sessionId, buildHash, modManifestHash, requiredSave, verifiedSave,
  engineSessionDirectory, logger = () => {} } = {}) {
  if (modulePath === undefined || modulePath === null) return null;
  if (typeof modulePath !== 'string' || !path.isAbsolute(modulePath)) throw new Error('JOIN_ENGINE_ADAPTER_MODULE_ABSOLUTE_PATH_REQUIRED');
  if (!bridge || bridge.connected !== true || bridge.engineObservation?.available !== true
    || typeof bridge.startCoordinationLease !== 'function') throw new Error('JOIN_LIVE_ENGINE_OBSERVATION_REQUIRED');
  if (!nativeGate?.ready || !nativeGate.binding || nativeGate.binding.sessionId !== sessionId
    || nativeGate.binding.role !== 'participant' || typeof nativeGate.client?.requireCapability !== 'function') {
    throw new Error('JOIN_NATIVE_BINDING_REQUIRED');
  }
  if (typeof sessionId !== 'string' || !hash(buildHash) || !hash(modManifestHash)) throw new TypeError('INVALID_JOIN_ENGINE_IDENTITY');
  if (requiredSave !== null && (!requiredSave || !Number.isSafeInteger(requiredSave.bytes) || requiredSave.bytes < 0 || !hash(requiredSave.sha256))) {
    throw new TypeError('INVALID_JOIN_REQUIRED_SAVE');
  }
  if (!path.isAbsolute(engineSessionDirectory ?? '') || path.basename(engineSessionDirectory) !== 'tf3mp_status_1') {
    throw new Error('JOIN_ENGINE_SESSION_DIRECTORY_REQUIRED');
  }
  if (!requiredSave || !verifiedSave || verifiedSave.bytes !== requiredSave.bytes
    || verifiedSave.sha256 !== requiredSave.sha256) throw new Error('JOIN_SAVE_VERIFICATION_REQUIRED');

  const info = await lstat(modulePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('JOIN_ENGINE_ADAPTER_MODULE_REGULAR_FILE_REQUIRED');
  const resolved = await realpath(modulePath);
  const imported = await import(pathToFileURL(resolved).href);
  if (typeof imported.createJoinEngineBinding !== 'function') throw new Error('JOIN_ENGINE_ADAPTER_FACTORY_EXPORT_REQUIRED');

  // Deliberately pass only authenticated runtime components and public identity;
  // credentials and the session secret are outside the provider boundary.
  const provided = await imported.createJoinEngineBinding(Object.freeze({
    bridge,
    nativeRuntime: Object.freeze({
      client: nativeGate.client,
      binding: nativeGate.binding,
      sessionId,
      role: 'join',
      logger,
    }),
    sessionId,
    buildHash,
    modManifestHash,
    requiredSave: requiredSave && Object.freeze({ ...requiredSave }),
    verifiedSave: Object.freeze({ ...verifiedSave }),
    engineSessionDirectory,
  }));
  if (!exactKeys(provided, ['createAdapter', 'productionQualified', 'verifiedSave'])
    || provided.productionQualified !== true || typeof provided.createAdapter !== 'function') {
    throw new Error('JOIN_ENGINE_BINDING_FACTORY_INVALID');
  }
  if (requiredSave === null) {
    if (provided.verifiedSave !== null) throw new Error('JOIN_UNEXPECTED_SAVE_VERIFICATION');
  } else if (!provided.verifiedSave || provided.verifiedSave.bytes !== requiredSave.bytes
    || provided.verifiedSave.sha256 !== requiredSave.sha256) {
    throw new Error('JOIN_SAVE_VERIFICATION_REQUIRED');
  }
  return Object.freeze({
    createAdapter: provided.createAdapter,
    verifiedSave: provided.verifiedSave,
  });
}
