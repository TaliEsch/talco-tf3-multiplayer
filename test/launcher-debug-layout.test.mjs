import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source=await readFile(new URL("../launcher/Program.cs",import.meta.url),"utf8");
const debug=source.slice(source.indexOf("private void DebugClicked"),source.indexOf("private Button SmallButton"));
test("guided warning and progress explicitly describe the final paused state",()=>{
  assert.match(debug,/ends with a verified pause/);
  assert.match(debug,/participant mirrors receipts; this is NOT a multiplayer proof/);
  assert.match(source,/VERIFYING_EXPLICIT_ENGINE_STOP/);
  assert.match(source,/LOCAL_RUN_PASSED_GAME_HELD/);
});

test("Debug primary actions are limited to the guided workflow and recovery", () => {
  const direct=[...debug.matchAll(/primaryActions.Children.Add\(SmallButton\("([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(direct,["Open batch reports","Stop helper","Copy logs"]);
  assert.match(debug,/primaryActions.Children.Add\(batchStartButton\)/);
  assert.doesNotMatch(debug,/primaryActions.Children.Add\(batchConfirmButton\)/);
  assert.match(debug,/SmallButton\("Run local sync test"/);
  assert.match(debug,/WriteLine\("coordinator-run-confirmed"\)/);
  assert.match(debug,/Use for sync test/);
  assert.doesNotMatch(debug,/SmallButton\("Start TF3"/);
});
test("specialist checks are collapsed, scrollable and unavailable during a guided batch", () => {
  assert.match(debug,/Header = "Advanced — individual diagnostics", IsExpanded = false, IsEnabled = !guidedBatchOwnsHelper/);
  assert.match(debug,/Content = actions, MaxHeight = 170/);
  assert.match(debug,/actions.Children.Add\(SmallButton\("Test exact-update hold"/);
  assert.match(debug,/actions.Children.Add\(SmallButton\("Test company accounting"/);
  assert.match(debug,/advancedDiagnostics.IsExpanded = false; advancedDiagnostics.IsEnabled = false/);
});
test("confirmation is stage-gated, old prompts are suppressed and helper exit resets UI", () => {
  assert.match(source,/batchControlsReady = code == "TRY_BUTTONS_AND_SHORTCUTS_THEN_CONFIRM"/);
  assert.match(debug,/batchConfirmButton.IsEnabled = batchControlsReady/);
  assert.match(source,/guidedBatchOwnsHelper && eventName != "integration_batch"/);
  assert.match(source,/helper = null; ResetBatchUi\(\); SetStatus/);
  assert.match(source,/guidedBatchOwnsHelper = false; batchControlsReady = false/);
});

test('Host and Join launch through the qualified native runner with save-specific bridges',()=>{
  const host=source.slice(source.indexOf('private void HostClicked'),source.indexOf('private void JoinClicked'));
  const join=source.slice(source.indexOf('private void JoinClicked'),source.indexOf('private void ShowHostReady'));
  assert.match(host,/EnsureNativeLoaderStaged\(\)/);
  assert.match(join,/EnsureNativeLoaderStaged\(\)/);
  for(const section of [host,join]){
    assert.match(section,/tools\/launch-qualified-session\.mjs/);
    assert.match(section,/"--bridge-dir"/);
    assert.match(section,/"--exe", GameExe/);
  }
  assert.doesNotMatch(source.slice(source.indexOf('private void ShowHostReady'),source.indexOf('private void DebugClicked')),/PrimaryButton\("START TF3"/);
});
