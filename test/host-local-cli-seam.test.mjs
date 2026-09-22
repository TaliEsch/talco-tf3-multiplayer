import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadHostLocalEngineFactory } from '../src/host-local-cli-seam.mjs';

const sessionId = 'host-local-cli-test';
const buildHash = 'a'.repeat(64), modManifestHash = 'b'.repeat(64);
const requiredSave = Object.freeze({ bytes: 1, sha256: 'c'.repeat(64) });
const bridge = {
  connected: true,
  engineObservation: { available: true },
  startCoordinationLease() {},
};
const nativeGate = {
  ready: true,
  binding: { sessionId, role: 'host' },
  client: { requireCapability() {} },
};
const engineSessionDirectory = path.join(path.parse(process.cwd()).root, 'tf3mp_status_1');
const options = modulePath => ({ modulePath, bridge, nativeGate, sessionId, buildHash,
  modManifestHash, requiredSave, verifiedSave: requiredSave, engineSessionDirectory });

test('host-local CLI seam is absent unless an explicit adapter module is selected', async () => {
  assert.equal(await loadHostLocalEngineFactory(options(undefined)), null);
});

test('host-local CLI seam rejects diagnostic, stale, and non-live bindings before importing a provider', async () => {
  await assert.rejects(loadHostLocalEngineFactory(options('relative-provider.mjs')), /ABSOLUTE_PATH_REQUIRED/);
  await assert.rejects(loadHostLocalEngineFactory({ ...options('C:/provider.mjs'), nativeGate: null }), /NATIVE_BINDING_REQUIRED/);
  await assert.rejects(loadHostLocalEngineFactory({ ...options('C:/provider.mjs'), bridge: { ...bridge, connected: false } }), /LIVE_ENGINE_OBSERVATION_REQUIRED/);
});

test('host-local CLI seam accepts only an explicit, qualified factory with exact save identity', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tf3mp-host-local-cli-'));
  const valid = path.join(root, 'binding-provider.mjs');
  const badSave = path.join(root, 'bad-save-provider.mjs');
  try {
    await writeFile(valid, `export async function createHostLocalEngineBinding(context) {
      if (context.nativeRuntime.role !== 'host' || context.requiredSave.sha256 !== '${requiredSave.sha256}') throw new Error('wrong context');
      return { engineBinding: Object.freeze({ source: 'qualified-provider' }), createAdapter() { throw new Error('not constructed by loader'); }, productionQualified: true, verifiedSave: { bytes: 1, sha256: '${requiredSave.sha256}' } };
    }`);
    await writeFile(badSave, `export function createHostLocalEngineBinding() {
      return { engineBinding: {}, createAdapter() {}, productionQualified: true, verifiedSave: { bytes: 2, sha256: '${requiredSave.sha256}' } };
    }`);
    const factory = await loadHostLocalEngineFactory(options(valid));
    assert.equal(factory.engineBinding.source, 'qualified-provider');
    assert.equal(typeof factory.createAdapter, 'function');
    await assert.rejects(loadHostLocalEngineFactory(options(badSave)), /SAVE_VERIFICATION_REQUIRED/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('host-local seam rejects a bridge or native fence lost while its provider loads', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tf3mp-host-race-'));
  const provider = path.join(root, 'binding-provider.mjs');
  try {
    await writeFile(provider, `export function createHostLocalEngineBinding(context) {
      context.bridge.engineObservation.available = false;
      return { engineBinding: {}, createAdapter() {}, productionQualified: true, verifiedSave: { bytes: 1, sha256: '${requiredSave.sha256}' } };
    }`);
    await assert.rejects(loadHostLocalEngineFactory({ ...options(provider), bridge: { ...bridge, engineObservation: { ...bridge.engineObservation } } }), /RUNTIME_LOST_DURING_LOAD/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
