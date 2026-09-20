import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Structural checks only: do not execute Lua, TF3's GUI, or its native types.
const source=await readFile(new URL('../mod/content/tf3mp_depot_preview.script.lua',import.meta.url),'utf8');
test('preview identifies callback processing and reports bounded failures without building',()=>{
  for(const marker of ['proposalId = "talco-depot,"', 'tostring(request.placementId)',
    'PREVIEW_DATA_UNAVAILABLE', 'waitingSamples >= 30',
    'PREVIEW_CALLBACK_TIMEOUT', 'Preview price unavailable: ']) {
    assert.ok(source.includes(marker),marker);
  }
  assert.doesNotMatch(source,/buildReady\s*=\s*true/);
});
test('native preview remains read-only and indexed by the mod',async()=>{
  assert.doesNotMatch(source,/api\s*\.\s*cmd|app\s*\.|setAsTable|setVisible|makeWorldBuildProposalCmd/);
  assert.doesNotMatch(source,/buildReady\s*=\s*true/);
  const index=JSON.parse(await readFile(new URL('../mod/_content.json',import.meta.url),'utf8'));
  assert.ok(index.files.includes('tf3mp_depot_preview.script.lua'));
});
test('preview resolves installed resource and binds intended owner without claiming verified price',()=>{
  for(const marker of ['api.res.constructionRep.find(request.resource)',
    'api.res.constructionRep.getName(resourceId) == request.resource',
    'construction.playerEntity = target', 'Target-company price is not verified.',
    'Preview estimate: ']) assert.ok(source.includes(marker),marker);
  assert.doesNotMatch(source,/makeProposalData|Proposal\.clone|preview_only/);
});
test('callback projects only scalar display data synchronously and never retains a native proposal',()=>{
  const callback=source.slice(source.indexOf('onCreateProposalData ='),source.indexOf('function instance.refresh()'));
  assert.doesNotMatch(callback,/Proposal\.clone|makeProposalData/);
  assert.match(callback,/if closed then return end/);
  assert.match(callback,/onCreateProposalData = function\(data\)/);
  assert.match(callback,/return data.costs, data.errorState.critical/);
  assert.match(callback,/finite\(cost, 9007199254740991\)/);
  assert.match(callback,/type\(critical\) == "boolean"/);
  assert.doesNotMatch(source,/processed|result\s*=\s*data\b/);
  const refresh=source.slice(source.indexOf('function instance.refresh()'),source.indexOf('function instance.viewerParams()'));
  assert.doesNotMatch(refresh,/api\.|data\.|proposal/);
});
test('preview has an explicit layout root, engine read hook, and closed-callback guard',()=>{
  for(const marker of ['return builtin.BoxLayout', 'engineReact.useStepStateTimer',
    'react.onUnmount', 'if closed then return end',
    'code = "PREVIEW_DATA_UNAVAILABLE"']) assert.ok(source.includes(marker),marker);
  assert.doesNotMatch(source,/RegisterPluginRecipe/);
});
test('in-game placement tools are explicitly enabled and close on missing or stale helper',async()=>{
  const tools=await readFile(new URL('../mod/content/tf3mp_depot_tools.script.lua',import.meta.url),'utf8');
  for(const marker of ['react.onStep(function()', 'request.nonce ~= bridge.nonce',
    'request.nonce ~= ack.nonce', 'state.stale > 10', 'control:set(nil); placement:set(nil)',
    'api.res.constructionRep.getAll()', 'Preview last map position', 'Rotate 90 degrees',
    'return builtin.BoxLayout'])assert.ok(tools.includes(marker),marker);
  assert.doesNotMatch(tools,/api\s*\.\s*cmd|buildReady\s*=\s*true/);
  assert.match(tools,/function data\(\)\s+return \{TalCoDepotTools=Tools\}\s+end/);
});
test('managed preview window declares native window identity and compact bar entry',async()=>{
  const source=await readFile(new URL('../mod/content/tf3mp_depot_tools.script.lua',import.meta.url),'utf8');
  const bar=source.slice(source.indexOf('local Tools = react.RegisterPluginRecipe'),source.indexOf('-- Loaded as a .script resource'));
  assert.match(bar,/text="Company tools"/);
  assert.match(bar,/if windows then windows.addSingletonWindow\(Panel,\{\}\) end/);
  assert.doesNotMatch(bar,/moveSingletonWindowToFront/);
  assert.match(source,/Panel = react.RegisterWrapperRecipe\("TalCoDepotToolsWindow", builtin.Window,/);
  assert.match(source,/content=builtin.Component\{meta=\{class="tf3mp-company-panel"\},layout=builtin.BoxLayout/);
  assert.doesNotMatch(bar,/message:old|Preview\(placement|text="Preview last map position"/);
  assert.match(source,/return builtin.Window\{/);
  assert.match(source,/removeAllWindows\(Panel\)/);
  assert.match(source,/closable=true,movable=true/);
});
test('world preview is owned by a tool action, never inserted into panel layout',async()=>{
  assert.match(source,/return builtin.ActionDescriptor\{children=children\}/);
  assert.match(source,/react.RegisterTool/);
  assert.match(source,/ctx.setActionFn\(action\(param.preview\)\)/);
  assert.match(source,/stack.pop\(PreviewTool,"tf3mp-depot-preview"\)/);
  const layout=source.slice(source.indexOf('-- World-action nodes must never'));
  assert.doesNotMatch(layout,/ProposalViewer/);
  assert.match(layout,/children = \{builtin.TextView/);
  const css=await readFile(new URL('../mod/content/tf3mp_status_panel.css.lua',import.meta.url),'utf8');
  assert.match(css,/padding = \{ 28, 28, 28, 28 \}/);
  assert.match(css,/size = \{ -1, 20 \}/);
});
test('construction seed is explicit and stable before native proposal processing',()=>{
  const seed=source.indexOf('parameters.seed = 1');
  assert.ok(seed>source.indexOf('parameters[parameter.key] = parameter.defaultIndex'));
  assert.ok(seed<source.indexOf('construction.params = parameters'));
  assert.doesNotMatch(source,/math\.random(?:seed)?\s*\(/);
});
