import { createEngineSessionAdapter } from './engine-session-adapter.mjs';
import { NATIVE_RUNTIME_CAPABILITIES } from './native-runtime-client.mjs';

const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const ident = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const save = value => value !== null && value !== undefined
  && Number.isSafeInteger(value.bytes) && value.bytes >= 0 && hash(value.sha256);

// This is the first-party composition provider, not a native qualification
// mechanism.  The launch seams must supply an independently verified save and
// the exact bridge directory: guessing either would make a received save or a
// passive observation look like engine evidence.
function contextFor(context, expectedRole) {
  if (!context || typeof context !== 'object' || context.nativeRuntime?.role !== expectedRole
    || !context.bridge || typeof context.bridge.startCoordinationLease !== 'function'
    || context.bridge.connected !== true || context.bridge.engineObservation?.available !== true
    || !ident(context.sessionId) || !hash(context.buildHash) || !hash(context.modManifestHash)
    || typeof context.engineSessionDirectory !== 'string'
    || !context.engineSessionDirectory.length || !save(context.verifiedSave)
    || (context.requiredSave !== null && (!save(context.requiredSave)
      || context.requiredSave.bytes !== context.verifiedSave.bytes
      || context.requiredSave.sha256 !== context.verifiedSave.sha256))) {
    throw new Error('ENGINE_BINDING_PROVIDER_CONTEXT_INCOMPLETE');
  }
  const runtime = context.nativeRuntime;
  const adapterRole = expectedRole === 'host' ? 'host' : 'participant';
  // createEngineSessionAdapter fences the already-bound controller identity.
  // A Join-side controller is a `participant` on its own wire, not `join`.
  if (!runtime.client || typeof runtime.client.requireCapability !== 'function'
    || typeof runtime.client.bindSession !== 'function' || typeof runtime.client.control !== 'function'
    || typeof runtime.client.on !== 'function' || typeof runtime.client.off !== 'function'
    || !runtime.binding || runtime.binding.sessionId !== context.sessionId
    || runtime.binding.role !== adapterRole || typeof runtime.logger !== 'function') {
    throw new Error('ENGINE_BINDING_PROVIDER_NATIVE_BINDING_INCOMPLETE');
  }
  // Do not let a provider's own `productionQualified` return value elevate a
  // passive observer/IPC transport into production admission. These checks are
  // repeated here because providers can be called directly, outside the CLI
  // Host/Join gate.
  if(runtime.client.handshake?.productionQualified!==true)throw new Error('ENGINE_BINDING_PROVIDER_NATIVE_GATE_UNQUALIFIED');
  try {
    runtime.client.requireCapability(NATIVE_RUNTIME_CAPABILITIES.simulationHold);
    runtime.client.requireCapability(NATIVE_RUNTIME_CAPABILITIES.engineHalt);
    runtime.client.requireCapability(NATIVE_RUNTIME_CAPABILITIES.gateReceipts);
  } catch(error) {throw new Error(`ENGINE_BINDING_PROVIDER_NATIVE_GATE_INCOMPLETE:${error?.message??'UNKNOWN'}`);}
  if(typeof runtime.gateControl!=='function'||typeof runtime.awaitGateEvent!=='function')throw new Error('ENGINE_BINDING_PROVIDER_TYPED_GATE_REQUIRED');
  return Object.freeze({
    bridge: context.bridge,
    directory: context.engineSessionDirectory,
    nativeRuntime: Object.freeze({
      client: runtime.client, binding: runtime.binding, sessionId: context.sessionId,
      role: adapterRole, logger: runtime.logger, gateControl: runtime.gateControl,
      awaitGateEvent: runtime.awaitGateEvent,
    }),
    verifiedSave: Object.freeze({ bytes: context.verifiedSave.bytes, sha256: context.verifiedSave.sha256 }),
  });
}

function factory(context, expectedRole, includeBinding) {
  const fixed = contextFor(context, expectedRole);
  const createAdapter = async input => {
    if (!input || typeof input !== 'object' || !ident(input.playerId) || !(input.companies instanceof Map)
      || typeof input.send !== 'function' || typeof input.disconnect !== 'function') {
      throw new TypeError('INVALID_ENGINE_BINDING_ADAPTER_INPUT');
    }
    return createEngineSessionAdapter({
      directory: fixed.directory, bridge: fixed.bridge, playerId: input.playerId,
      companies: input.companies, send: input.send, disconnect: input.disconnect,
      healthy: () => fixed.bridge.connected === true
        && fixed.bridge.engineObservation?.available === true,
      controlsReady: () => fixed.bridge.coordinationControlsLocked === true,
      nativeRuntime: fixed.nativeRuntime,
    });
  };
  const result = { createAdapter, productionQualified: true, verifiedSave: fixed.verifiedSave };
  if (includeBinding) {
    // This opaque token makes accidental replacement with a synthetic binding
    // visible at the host-local participant boundary without claiming a game
    // command executor exists.
    result.engineBinding = Object.freeze({
      kind: 'first_party_engine_session_adapter', sessionId: context.sessionId,
      buildHash: context.buildHash, modManifestHash: context.modManifestHash,
    });
  }
  return Object.freeze(result);
}

export function createHostLocalEngineBinding(context) {
  return factory(context, 'host', true);
}

export function createJoinEngineBinding(context) {
  return factory(context, 'join', false);
}
