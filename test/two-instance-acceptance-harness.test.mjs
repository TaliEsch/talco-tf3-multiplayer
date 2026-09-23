import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createTwoInstanceAcceptancePlan, collectTwoInstanceAcceptanceEvidence } from '../src/two-instance-acceptance-harness.mjs';

const root = path.parse(process.cwd()).root;
const save = { bytes: 44, sha256: 'a'.repeat(64) };
function plan(overrides = {}) { return createTwoInstanceAcceptancePlan({
  sessionId: 'two.instance.1', save, hostBridgeDirectory: path.join(root, 'host', 'tf3mp_status_1'),
  joinBridgeDirectory: path.join(root, 'join', 'tf3mp_status_1'), joinSaveDirectory: path.join(root, 'join', 'save'),
  hostPort: 38111, savePort: 38112, hostNativePipe: 'tf3mp_host_38111', joinNativePipe: 'tf3mp_join_38111',
  modManifestHash: 'c'.repeat(64), hostSaveFile: path.join(root, 'host', 'checkpoint.sav'), ...overrides,
}); }

test('two-instance plan isolates identities, bridge directories, and host endpoints without launching anything', () => {
  const value = plan();
  assert.equal(value.liveLaunchPerformed, false);
  assert.notEqual(value.instances.host.bridgeDirectory, value.instances.join.bridgeDirectory);
  assert.notEqual(value.instances.host.nativePipe, value.instances.join.nativePipe);
  assert.equal(value.instances.join.connectsTo.commandPort, 38111);
  assert.equal(value.instances.join.connectsTo.savePort, 38112);
  assert.equal(value.expectedSave.sha256, save.sha256);
  assert.ok(value.instances.host.command.includes('c'.repeat(64)));
  assert.ok(value.instances.host.command.includes(path.join(root, 'host', 'checkpoint.sav')));
  assert.ok(value.instances.join.prepareCommand.includes('prepare-join'));
  assert.ok(value.instances.join.command.includes('<path-from-prepare-join>'));
  const lan=plan({hostBind:'0.0.0.0',joinHost:'192.168.1.22'});
  assert.ok(lan.instances.host.command.includes('0.0.0.0'));
  assert.ok(lan.instances.join.prepareCommand.includes('192.168.1.22'));
  assert.ok(lan.instances.join.command.includes('192.168.1.22'));
  assert.throws(() => plan({joinHost:'0.0.0.0'}),/DIRECT_HOST_ADDRESS_REQUIRED/);
  assert.throws(() => plan({ savePort: 38111 }), /DISTINCT_HOST_SAVE_PORTS/);
  assert.throws(() => plan({ joinBridgeDirectory: path.join(root, 'host', 'tf3mp_status_1') }), /SEPARATE_INSTANCE_DIRECTORIES/);
});

test('evidence collector requires exact transferred-save identity and same held checkpoint round/update/hash', () => {
  const checkpoint = { roundId: 'round.1', updateCount: 77, checkpointHash: 'b'.repeat(64), comparisonReady: true };
  const evidence = collectTwoInstanceAcceptanceEvidence({ plan: plan(), host: { save, checkpoint }, join: { save, checkpoint: { ...checkpoint } } });
  assert.equal(evidence.saveMatches, true); assert.equal(evidence.checkpointMatches, true);
  assert.equal(evidence.acceptancePassed, false); assert.equal(evidence.realEngineVerified, false);
  const mismatch = collectTwoInstanceAcceptanceEvidence({ plan: plan(), host: { save, checkpoint }, join: { save, checkpoint: { ...checkpoint, updateCount: 78 } } });
  assert.equal(mismatch.checkpointMatches, false);
  assert.throws(() => collectTwoInstanceAcceptanceEvidence({ plan: plan(), host: { save, checkpoint }, join: { save, checkpoint: { ...checkpoint, comparisonReady: false } } }), /INVALID_CHECKPOINT_RESULT/);
});
