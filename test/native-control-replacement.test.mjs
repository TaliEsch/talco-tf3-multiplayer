import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, cp, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateReviewPackage } from '../src/review-validator.mjs';

// Source/package checks, not a fake JS execution of the Teal control boundary.
test('native replacement clones action parameters and isolates original manager hooks', async () => {
  const source = await readFile(new URL('../mod/content/tf3mp_native_controls.script.tl', import.meta.url), 'utf8');
  assert.match(source, /local fields : table = \{\}/);
  assert.match(source, /fields\[key\] = value/);
  assert.doesNotMatch(source, /button\.(?:onClick|onValueChange)\s*=/);
  assert.match(source, /children = \{ OriginalManager\(params\) \}/);
  const guard = source.slice(source.indexOf('local GuardedManager'), source.indexOf('local function install'));
  assert.doesNotMatch(guard, /CallOriginalRecipe/);
});

test('all native wrapper return paths own a builtin layout root', async () => {
  const source = await readFile(new URL('../mod/content/tf3mp_native_controls.script.tl', import.meta.url), 'utf8');
  const recipes = source.slice(source.indexOf('local GuardedActionBar'), source.indexOf('local function install'));
  // Runtime regression: direct recipe returns crashed both VehicleWindow and
  // MaintenanceStationWindow before any restriction was armed. Include both
  // manager paths so fixing the action bar cannot merely move the same crash.
  assert.doesNotMatch(recipes, /return\s+(?:react\.CallOriginalRecipe|OriginalManager)\s*\(/);
  assert.equal(recipes.match(/return builtin\.BoxLayout\s*\{/g)?.length, 4);
  for (const child of ['react.CallOriginalRecipe(entity_window_util.ActionButtonBar,',
    'react.CallOriginalRecipe(manager_window.ManagerWindowContent, params)', 'OriginalManager(params)']) {
    assert.ok(recipes.includes(`children = { ${child}`));
  }
});

test('native restriction release occurs only in explicit matching control-release branch', async () => {
  const source = await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl', import.meta.url), 'utf8');
  assert.equal(source.match(/native_controls\.release\(/g)?.length, 1);
  const release = source.slice(source.indexOf('if request.phase == "release" then'), source.indexOf('elseif controlOwned then'));
  assert.match(release, /native_controls\.release\(bridgeNonce\)/);
  const cleanup = source.slice(source.indexOf('local function restoreSpeedControls'), source.indexOf('local function userdataExists'));
  assert.doesNotMatch(cleanup, /native_controls/);
});

test('acquisition waits for original manager teardown rather than arm acknowledgement', async () => {
  const source = await readFile(new URL('../mod/content/tf3mp_native_controls.script.tl', import.meta.url), 'utf8');
  assert.match(source, /if originalManagers ~= 0 then readyChecks = 0; return false end/);
  assert.match(source, /return readyChecks == 2/);
  assert.match(source, /originalManagers = originalManagers \+ 1/);
  assert.match(source, /originalManagers = originalManagers - 1/);
  assert.match(source, /if blocked or restricted:old\(\) then/);
  const panel = await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl', import.meta.url), 'utf8');
  assert.match(panel, /native_controls\.arm\(bridgeNonce\) then return nil/);
  assert.match(panel, /native_controls\.pollReady\(bridgeNonce\) then outcome = "acquired"/);
  assert.match(panel, /controlSent == "acquire:acquired" then restoreSpeedControls\(\); outcome = "conflict"/);
});

test('review rejects missing callback-time guard and command dispatch in replacements', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tf3mp-native-review-'));
  try {
    await cp(new URL('../mod', import.meta.url), root, { recursive: true });
    const file = path.join(root, 'content', 'tf3mp_native_controls.script.tl');
    const original = await readFile(file, 'utf8');
    for (const marker of ['if not blocked then onClick() end', 'if not blocked or owner ~= nonce then return false end']) {
      await writeFile(file, original.replace(marker, ''));
      await assert.rejects(validateReviewPackage(root), /native-control guard/);
    }
    await writeFile(file, original + '\napi.cmd.sendCommand(nil)\n');
    await assert.rejects(validateReviewPackage(root), /must not dispatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
