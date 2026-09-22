import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHostLocalEngineBinding, createJoinEngineBinding } from '../src/production-engine-binding-provider.mjs';

const buildHash = 'a'.repeat(64), modManifestHash = 'b'.repeat(64);
const verifiedSave = Object.freeze({ bytes: 1, sha256: 'c'.repeat(64) });

function bridge() {
  return {
    connected: true, nonce: 'd'.repeat(32), coordinationControlsLocked: true,
    engineObservation: { available: true, sample: { counter: 1, updateCount: 1, speedup: 0 } },
    async startCoordinationLease() { return { active: true, phase: 'active', stop() {} }; },
  };
}
function client(missingCapability=null) {
  return {
    handshake:{productionQualified:true},
    requireCapability(capability) {if(capability===missingCapability)throw new Error('CAPABILITY_UNAVAILABLE');}, async bindSession({ sessionId, role }) {
      return { status: 'accepted', boundSessionId: sessionId, boundRole: role };
    }, async control() { return { status: 'accepted' }; }, on() {}, off() {}, close() {},
  };
}
function context({ role, directory, bindingRole = role === 'join' ? 'participant' : 'host', extra = {} }) {
  return {
    bridge: bridge(), engineSessionDirectory: directory, sessionId: 'provider-test', buildHash,
    modManifestHash, requiredSave: verifiedSave, verifiedSave,
    nativeRuntime: { client: client(), gateControl: async () => ({status:'held'}), awaitGateEvent: async () => ({event:'boundary_applied'}), binding: { sessionId: 'provider-test', role: bindingRole,
      receipt: { status: 'accepted', boundSessionId: 'provider-test', boundRole: bindingRole } }, sessionId: 'provider-test', role, logger() {} },
    ...extra,
  };
}

test('provider refuses missing save verification and bridge directory rather than guessing seam data', () => {
  const base = context({ role: 'host', directory: '' });
  assert.throws(() => createHostLocalEngineBinding(base), /CONTEXT_INCOMPLETE/);
  assert.throws(() => createHostLocalEngineBinding({ ...base, engineSessionDirectory: 'C:/x', verifiedSave: undefined }), /CONTEXT_INCOMPLETE/);
});

test('provider refuses a production label without real hold/halt capabilities and typed gate control', () => {
  const base=context({role:'host',directory:'C:/x'});
  base.nativeRuntime.client.handshake={productionQualified:false};
  assert.throws(()=>createHostLocalEngineBinding(base),/NATIVE_GATE_UNQUALIFIED/);
  const missingGate=context({role:'host',directory:'C:/x'});delete missingGate.nativeRuntime.gateControl;
  assert.throws(()=>createHostLocalEngineBinding(missingGate),/TYPED_GATE_REQUIRED/);
  const missingReceipts=context({role:'host',directory:'C:/x'});
  missingReceipts.nativeRuntime.client=client('simulation.gate-receipts.v1');
  assert.throws(()=>createHostLocalEngineBinding(missingReceipts),/NATIVE_GATE_INCOMPLETE/);
});

test('host-local provider returns an opaque binding and creates the shared engine adapter', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tf3mp-provider-'));
  const directory = path.join(root, 'tf3mp_status_1');
  await mkdir(directory);
  try {
    const provider = createHostLocalEngineBinding(context({ role: 'host', directory }));
    assert.equal(provider.productionQualified, true);
    assert.equal(provider.engineBinding.kind, 'first_party_engine_session_adapter');
    const adapter = await provider.createAdapter({ playerId: 'host', companies: new Map([['host', 7], ['join', 9]]), send() {}, disconnect() {} });
    assert.equal(adapter.phase, 'lobby');
    await adapter.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('join provider maps its wire role to participant and rejects the incompatible join binding', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tf3mp-provider-'));
  const directory = path.join(root, 'tf3mp_status_1');
  await mkdir(directory);
  try {
    const provider = createJoinEngineBinding(context({ role: 'join', directory }));
    assert.equal(provider.engineBinding, undefined);
    const adapter = await provider.createAdapter({ playerId: 'join', companies: new Map([['host', 7], ['join', 9]]), send() {}, disconnect() {} });
    await adapter.close();
    assert.throws(() => createJoinEngineBinding(context({ role: 'join', directory, bindingRole: 'join' })), /NATIVE_BINDING_INCOMPLETE/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
