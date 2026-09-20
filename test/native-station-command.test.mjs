import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../experimental/native-station-command.lua', import.meta.url), 'utf8');

test('native station adapter is experimental, bounded, and unregistered', () => {
  assert.match(source, /NOT registered in the mod[\s\S]*network endpoint/);
  assert.doesNotMatch(source, /register\s*\(/i);
  assert.doesNotMatch(source, /require\s*\(/);
  assert.doesNotMatch(source, /makeEntitySetPlayerCmd|transferOwnership|make\w*Fund\w*Cmd|load\s*\(/i);
});

test('placement intent and evaluator use only the approved passenger modular terminal', () => {
  for (const marker of [
    'exactKeys(intent, {x=true, y=true, z=true, yaw=true, resource=true, seed=true}, 6)',
    'RESOURCE_SUFFIX = "/street/modular_street_station/modular_terminal.con"',
    'params.platforms = 1',
    'getConstructionResult(intent.resource, 0, params)', 'exactCollectionSize(result.params.modules, 3)',
    'exactCollectionSize(result.subconstructions, 2)', 'if result.params.seed == nil then result.params.seed = intent.seed',
    'construction.params = result.params', 'construction.playerEntity = binding.targetCompany',
    'context.player = binding.targetCompany', 'makeWorldBuildProposalCmd(proposal, context, false, true, false)',
  ]) assert.ok(source.includes(marker), marker);
  assert.doesNotMatch(source, /params\.templateIndex\s*=/);
  assert.doesNotMatch(source, /\n  params\.seed\s*=/);
  const prepare = source.slice(source.indexOf('function M.prepare'), source.indexOf('local function assertConsent'));
  assert.doesNotMatch(prepare, /sendCommand|pairs\(result\.params\)|ipairs\(result\.params\)/);
});

test('adapter revalidates separate companies, original identity, hold, and two fixed slots', () => {
  for (const marker of [
    'binding.originalCompany ~= binding.targetCompany', 'api.engine.util.getPlayer() == binding.originalCompany',
    'speed and speed.speedup == 0', 'binding.slot == 1 or binding.slot == 2',
    'current.nativeStationSlot1Attempted == true', 'current.nativeStationSlot2Attempted == true',
  ]) assert.ok(source.includes(marker), marker);
});

test('explicit consent correlates companies, action, slot, and every placement field', () => {
  assert.match(source, /consent\.kind == "native_station_charge" and consent\.confirmed == true/);
  for (const marker of ['consent.sessionId == binding.sessionId', 'consent.actionId == binding.actionId',
    'consent.consentId == binding.consentId', 'consent.slot == binding.slot',
    'CONSENT_PLACEMENT_CHANGED']) assert.ok(source.includes(marker), marker);
});

test('each slot is durably consumed before its sole send and unknown keeps the company fault', () => {
  const persist = source.indexOf('state:set(current) -- Persist consume-before-send');
  const send = source.indexOf('api.cmd.sendCommand(command');
  assert.ok(persist >= 0 && send > persist, 'latch must precede command send');
  assert.match(source, /not current\.phase2CompanyFault and not consumed\(current, slot\)/);
  assert.match(source, /current\.phase2CompanyFault = true -- Unknown company-wide fault is saved before send\./);
  assert.match(source, /if not ok or not callbackSeen or receipt\.outcome ~= "verified" then/);
  assert.match(source, /callbackOpen = false -- A late callback cannot revive an unknown result\./);
  assert.match(source, /if receipt\.outcome == "verified" then saved\.phase2CompanyFault = false/);
  assert.match(source, /local saved = state:get\(\)/);
  assert.match(source, /nativeStationSlot1Receipt/);
  assert.match(source, /nativeStationSlot2Receipt/);
  assert.match(source, /receipt\.outcome, receipt\.code = "unknown", "STATE_PERSIST_FAILED"/);
});

test('second station is enabled only by the verified, correlated first placement and must be distinct', () => {
  for (const marker of ['slot == 2 then', 'firstReceipt.outcome == "verified"',
    'firstReceipt.originalCompany == binding.originalCompany', 'firstReceipt.targetCompany == binding.targetCompany',
    'firstReceipt.sessionId == binding.sessionId', 'constructionId ~= firstReceipt.constructionEntity',
    'stationId ~= firstReceipt.stationEntity']) assert.ok(source.includes(marker), marker);
});

test('successful callback requires target-owned construction and station plus exact native debit', () => {
  for (const marker of [
    'construction.fileName == intent.resource', 'owner(constructionId) == binding.targetCompany',
    'not constructionsBefore[constructionId]',
    '#construction.stations == 1', 'owner(stationId) == binding.targetCompany',
    'not stationsBefore[stationId]', 'preservesExisting(constructionsBefore',
    'preservesExisting(stationsBefore', 'api.type.ComponentType.STATION',
    'data and data.resultProposalData and data.resultProposalData.costs',
    'beforeTarget >= charged', 'receipt.originalAfter == beforeOriginal',
    'receipt.targetAfter == beforeTarget - charged', 'receipt.targetAfter >= 0',
    'NATIVE_STATION_ACCOUNTING_VERIFIED',
  ]) assert.ok(source.includes(marker), marker);
});
