import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { sha256File } from '../src/compatibility.mjs';
import { createTwoInstanceAcceptancePlan } from '../src/two-instance-acceptance-harness.mjs';

function options(args) {
  const result = {};
  for (let index = 0; index < args.length; index++) if (args[index].startsWith('--')) result[args[index].slice(2)] = args[++index];
  return result;
}

const opt = options(process.argv.slice(2));
for (const name of ['session', 'save', 'mod-hash', 'host-bridge-dir', 'join-bridge-dir', 'join-save-dir', 'host-port', 'save-port', 'host-native-pipe', 'join-native-pipe']) {
  assert.ok(typeof opt[name] === 'string', `--${name} is required`);
}
const source = await stat(opt.save);
assert.ok(source.isFile() && source.size > 0, '--save must name a non-empty regular file');
const save = Object.freeze({ bytes: source.size, sha256: await sha256File(opt.save) });
const plan = createTwoInstanceAcceptancePlan({ sessionId: opt.session, save,
  hostBridgeDirectory: opt['host-bridge-dir'], joinBridgeDirectory: opt['join-bridge-dir'], joinSaveDirectory: opt['join-save-dir'],
  hostName: opt['host-name'] ?? 'Host', joinName: opt['join-name'] ?? 'Join', hostPort: Number(opt['host-port']), savePort: Number(opt['save-port']),
  hostNativePipe: opt['host-native-pipe'], joinNativePipe: opt['join-native-pipe'], modManifestHash: opt['mod-hash'],
  hostSaveFile: opt.save, exe: opt.exe });
process.stdout.write(`${JSON.stringify(plan)}\n`);
