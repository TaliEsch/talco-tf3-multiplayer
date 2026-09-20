import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Structural checks only: Lua and the native evaluator are not executed here.
const source=await readFile(new URL('../mod/content/tf3mp_station_probe.lua',import.meta.url),'utf8');

test('station probe evaluates exactly the stock passenger template through the public API',()=>{
  for(const marker of ['RESOURCE_SUFFIX = "/street/modular_street_station/modular_terminal.con"',
    'api.res.constructionRep.getAll()', 'pairs(names)',
    'api.res.constructionRep.find(resource)',
    'api.res.constructionRep.getName(resourceId) ~= resource',
    'api.engine.util.construction.getGlobalConstructionParams()',
    'params.platforms = 1',
    'getConstructionResult(resource, 0, params)', 'parameter.key == "tramTrack"']) {
    assert.ok(source.includes(marker),marker);
  }
  assert.doesNotMatch(source, /params\.templateIndex\s*=/);
});

test('station probe returns only a bounded scalar snapshot and sanitizes evaluator failures',()=>{
  for(const marker of ['code = code', 'paramsPresent = paramsPresent or 0',
    'modulesPresent = modulesPresent or 0', 'moduleCount = moduleCount or 0',
    'subconstructionCount = subconstructionCount or 0', 'costKnown = costKnown or 0',
    'templateIndex = 0', 'platforms = 1', 'MAX_RESULT_ITEMS = 256',
    'for _ in pairs(value) do', 'count > MAX_RESULT_ITEMS', 'pcall(function()',
    'PROBE_FAILED']) assert.ok(source.includes(marker),marker);
  assert.match(source,/local function snapshot\([^)]*\)[\s\S]*?return \{[\s\S]*?\n  \}/);
  assert.doesNotMatch(source,/return constructionResult|return params|return result\.params/);
  assert.doesNotMatch(source,/#constructionResult|ipairs\(constructionResult/);
});

test('station probe has no command, proposal, ownership, or content-registration route',()=>{
  assert.doesNotMatch(source,/api\s*\.\s*cmd|makeWorldBuildProposalCmd|SimpleProposal|playerEntity|setPlayer|setCompany/);
  assert.doesNotMatch(source,/function\s+data\s*\(|Register(?:Plugin|Recipe|Tool)|app\s*\./);
  assert.match(source,/Native\s+assertions may abort before Lua error handling/);
});
