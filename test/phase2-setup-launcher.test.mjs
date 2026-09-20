import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../launcher/Program.cs',import.meta.url),'utf8');
const debug=source.slice(source.indexOf('private void DebugClicked'),source.indexOf('private Button SmallButton'));
const helper=source.slice(source.indexOf('private void HelperLine'),source.indexOf('private void StopHelper'));

test('Phase 2 setup is an explicitly-started, read-only location-selection flow',()=>{
  assert.match(debug,/SmallButton\("Phase 2: service setup"/);
  assert.match(debug,/WriteLine\("phase2-setup"\)/);
  assert.match(debug,/does not fund, build, buy, or create a line/);
  assert.match(debug,/paused, zero-balance test company/);
  assert.match(debug,/Pause the game/);
  assert.match(debug,/select one depot position, two station positions, and a bus/);
  assert.match(debug,/not Phase 2 completion/);
  assert.match(debug,/will not be launched automatically/);
});

test('only a valid PLAN_READY hash exposes confirmation, with no default-Yes action',()=>{
  assert.match(helper,/eventName == "phase2_setup"/);
  assert.match(helper,/code == "PLAN_READY"[\s\S]*?!phase2SetupConfirmed && IsPhase2SetupHash\(planHash\)/);
  assert.match(helper,/originalCompany[\s\S]*?targetCompany[\s\S]*?fundingAmount[\s\S]*?TryPhase2SetupCompanies/);
  assert.match(source,/fundingAmount == 1000000/);
  assert.match(source,/originalCompany != targetCompany/);
  assert.match(helper,/code == "PLAN_READY"[\s\S]*?ClearPendingPhase2SetupPlan\(\)[\s\S]*?Visibility\.Collapsed/);
  assert.match(source,/Regex\.IsMatch\(value, "\^\[0-9a-fA-F\]\{64\}\$"\)/);
  assert.match(debug,/phase2SetupConfirmButton\.Visibility = Visibility\.Collapsed/);
  assert.match(debug,/MessageBoxButton\.YesNo, MessageBoxImage\.Warning, MessageBoxResult\.No\) != MessageBoxResult\.Yes\) return/);
  assert.match(debug,/WriteLine\("phase2-setup-confirm " \+ planHash\)/);
});

test('confirmation is single-use and stale setup hashes are reset without launching TF3',()=>{
  assert.match(debug,/phase2SetupConfirmed = true;\s*ClearPendingPhase2SetupPlan\(\);/);
  assert.match(debug,/phase2SetupConfirmButton\.IsEnabled = false;/);
  assert.match(source,/ClearPendingPhase2SetupPlan\(\); phase2SetupConfirmed = false;/);
  assert.match(debug,/Original company: " \+ pendingPhase2OriginalCompany[\s\S]*?Target company: " \+ pendingPhase2TargetCompany/);
  assert.match(debug,/verifies the original company is unchanged and stops if it detects a mismatch/);
  assert.match(source,/process\.Exited[\s\S]*?helper = null; ResetBatchUi\(\)/);
  assert.match(source,/private void StopHelper\(\)[\s\S]*?ResetBatchUi\(\)/);
  const setupFlow=debug.slice(debug.indexOf('Phase 2: service setup'),debug.indexOf('// Legacy diagnostic confirmation'));
  assert.doesNotMatch(setupFlow,/StartGameClicked|StartGameWithInstructions|Process\.Start\(new ProcessStartInfo/);
  assert.match(debug,/if \(guidedBatchOwnsHelper\) throw new InvalidOperationException\("The current guided diagnostic owns this helper\. Stop it before starting local sync\."\)/);
});
