import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadJoinEngineFactory } from '../src/join-engine-cli-seam.mjs';

const sessionId = 'join-cli-test';
const buildHash = 'a'.repeat(64), modManifestHash = 'b'.repeat(64);
const requiredSave = Object.freeze({ bytes: 1, sha256: 'c'.repeat(64) });
const bridge = {
  connected: true,
  engineObservation: { available: true },
  startCoordinationLease() {},
};
const nativeGate = {
  ready: true,
  binding: { sessionId, role: 'participant' },
  client: { requireCapability() {} },
};
const engineSessionDirectory = path.join(path.parse(process.cwd()).root, 'tf3mp_status_1');
const options = modulePath => ({ modulePath, bridge, nativeGate, sessionId, buildHash,
  modManifestHash, requiredSave, verifiedSave: requiredSave, engineSessionDirectory });

test('join engine seam is absent unless an explicit adapter module is selected', async () => {
  assert.equal(await loadJoinEngineFactory(options(undefined)), null);
});

test('join engine seam rejects non-absolute, stale, wrong-role, and non-live bindings before importing', async () => {
  await assert.rejects(loadJoinEngineFactory(options('relative-provider.mjs')), /ABSOLUTE_PATH_REQUIRED/);
  await assert.rejects(loadJoinEngineFactory({ ...options('C:/provider.mjs'), nativeGate: null }), /NATIVE_BINDING_REQUIRED/);
  await assert.rejects(loadJoinEngineFactory({ ...options('C:/provider.mjs'), nativeGate: { ...nativeGate, binding: { sessionId: 'stale', role: 'join' } } }), /NATIVE_BINDING_REQUIRED/);
  await assert.rejects(loadJoinEngineFactory({ ...options('C:/provider.mjs'), nativeGate: { ...nativeGate, binding: { sessionId, role: 'join' } } }), /NATIVE_BINDING_REQUIRED/);
  await assert.rejects(loadJoinEngineFactory({ ...options('C:/provider.mjs'), bridge: { ...bridge, connected: false } }), /LIVE_ENGINE_OBSERVATION_REQUIRED/);
});

test('join engine seam accepts a qualified provider with exact save verification and no credentials', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tf3mp-join-cli-'));
  const valid = path.join(root, 'binding-provider.mjs');
  const badSave = path.join(root, 'bad-save-provider.mjs');
  const badShape = path.join(root, 'bad-shape-provider.mjs');
  try {
    await writeFile(valid, `export async function createJoinEngineBinding(context) {
      if (context.nativeRuntime.role !== 'join' || context.requiredSave.sha256 !== '${requiredSave.sha256}' || 'secret' in context || 'credentials' in context) throw new Error('wrong context');
      return { createAdapter() { return {}; }, productionQualified: true, verifiedSave: { bytes: 1, sha256: '${requiredSave.sha256}' } };
    }`);
    await writeFile(badSave, `export function createJoinEngineBinding() {
      return { createAdapter() {}, productionQualified: true, verifiedSave: { bytes: 2, sha256: '${requiredSave.sha256}' } };
    }`);
    await writeFile(badShape, `export function createJoinEngineBinding() {
      return { createAdapter() {}, productionQualified: true, verifiedSave: null, extra: true };
    }`);
    const factory = await loadJoinEngineFactory(options(valid));
    assert.equal(typeof factory.createAdapter, 'function');
    assert.deepEqual(factory.verifiedSave, requiredSave);
    await assert.rejects(loadJoinEngineFactory(options(badSave)), /SAVE_VERIFICATION_REQUIRED/);
    await assert.rejects(loadJoinEngineFactory(options(badShape)), /BINDING_FACTORY_INVALID/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('join engine seam rejects a bridge or native fence lost while its provider loads', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tf3mp-join-race-'));
  const provider = path.join(root, 'binding-provider.mjs');
  try {
    await writeFile(provider, `export function createJoinEngineBinding(context) {
      context.bridge.connected = false;
      return { createAdapter() {}, productionQualified: true, verifiedSave: { bytes: 1, sha256: '${requiredSave.sha256}' } };
    }`);
    await assert.rejects(loadJoinEngineFactory({ ...options(provider), bridge: { ...bridge } }), /RUNTIME_LOST_DURING_LOAD/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('join engine seam rejects symbolic-link provider modules', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tf3mp-join-cli-link-'));
  const target = path.join(root, 'target.mjs'), link = path.join(root, 'link.mjs');
  try {
    await writeFile(target, 'export function createJoinEngineBinding() { return {}; }');
    try { await symlink(target, link, 'file'); } catch (error) { t.skip(`symlinks unavailable: ${error.code}`); return; }
    await assert.rejects(loadJoinEngineFactory(options(link)), /REGULAR_FILE_REQUIRED/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
