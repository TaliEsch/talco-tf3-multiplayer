import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const exactKeys = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === names.slice().sort().join(',');

// A TF3 engine binding cannot be inferred from a debugger/transport handshake.
// This loader is therefore only a narrow, explicit composition seam for a
// separately qualified local binding provider. It neither offers a fallback
// adapter nor treats the bridge's passive telemetry as binding proof.
export async function loadHostLocalEngineFactory({ modulePath, bridge, nativeGate,
  sessionId, buildHash, modManifestHash, requiredSave, logger = () => {} } = {}) {
  if (modulePath === undefined || modulePath === null) return null;
  if (typeof modulePath !== 'string' || !path.isAbsolute(modulePath)) throw new Error('HOST_LOCAL_ADAPTER_MODULE_ABSOLUTE_PATH_REQUIRED');
  if (!bridge || bridge.connected !== true || bridge.engineObservation?.available !== true
    || typeof bridge.startCoordinationLease !== 'function') throw new Error('HOST_LOCAL_LIVE_ENGINE_OBSERVATION_REQUIRED');
  if (!nativeGate?.ready || !nativeGate.binding || nativeGate.binding.sessionId !== sessionId
    || nativeGate.binding.role !== 'host' || typeof nativeGate.client?.requireCapability !== 'function') {
    throw new Error('HOST_LOCAL_NATIVE_BINDING_REQUIRED');
  }
  if (typeof sessionId !== 'string' || !hash(buildHash) || !hash(modManifestHash)) throw new TypeError('INVALID_HOST_LOCAL_ENGINE_IDENTITY');
  if (requiredSave !== null && (!requiredSave || !Number.isSafeInteger(requiredSave.bytes) || requiredSave.bytes < 0 || !hash(requiredSave.sha256))) {
    throw new TypeError('INVALID_HOST_LOCAL_REQUIRED_SAVE');
  }

  const info = await lstat(modulePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('HOST_LOCAL_ADAPTER_MODULE_REGULAR_FILE_REQUIRED');
  const resolved = await realpath(modulePath);
  const imported = await import(pathToFileURL(resolved).href);
  if (typeof imported.createHostLocalEngineBinding !== 'function') throw new Error('HOST_LOCAL_ADAPTER_FACTORY_EXPORT_REQUIRED');

  // The provider receives only existing, authenticated components. In
  // particular, credentials and the session secret are never passed to it.
  const provided = await imported.createHostLocalEngineBinding(Object.freeze({
    bridge,
    nativeRuntime: Object.freeze({
      client: nativeGate.client,
      binding: nativeGate.binding,
      sessionId,
      role: 'host',
      logger,
    }),
    sessionId,
    buildHash,
    modManifestHash,
    requiredSave: requiredSave && Object.freeze({ ...requiredSave }),
  }));
  if (!exactKeys(provided, ['engineBinding', 'createAdapter', 'productionQualified', 'verifiedSave'])
    || provided.productionQualified !== true || !provided.engineBinding
    || (typeof provided.engineBinding !== 'object' && typeof provided.engineBinding !== 'function')
    || typeof provided.createAdapter !== 'function') throw new Error('HOST_LOCAL_ENGINE_BINDING_FACTORY_INVALID');
  if (requiredSave === null) {
    if (provided.verifiedSave !== null) throw new Error('HOST_LOCAL_UNEXPECTED_SAVE_VERIFICATION');
  } else if (!provided.verifiedSave || provided.verifiedSave.bytes !== requiredSave.bytes
    || provided.verifiedSave.sha256 !== requiredSave.sha256) {
    throw new Error('HOST_LOCAL_SAVE_VERIFICATION_REQUIRED');
  }
  return Object.freeze({
    engineBinding: provided.engineBinding,
    createAdapter: provided.createAdapter,
    verifiedSave: provided.verifiedSave,
  });
}
