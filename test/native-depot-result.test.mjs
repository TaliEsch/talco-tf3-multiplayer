import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyNativeDepotResult} from '../src/native-depot-result.mjs';
const binding={originalCompany:10,targetCompany:20,resource:'base::/depots/road/road_depot/road_depot.con',sessionId:'phase2-test',actionId:1,consentId:'consent-1'};
const before={originalBalance:900000,targetBalance:20000};
const receipt={outcome:'verified',code:'NATIVE_BUILD_ACCOUNTING_VERIFIED',sessionId:binding.sessionId,
  actionId:binding.actionId,consentId:binding.consentId,originalCompany:10,targetCompany:20,
  resource:binding.resource,
  constructionEntity:30,depotEntity:31,constructionOwner:20,depotOwner:20,chargedCost:5000,
  constructionMembershipPreserved:true,depotMembershipPreserved:true,
  originalBefore:900000,targetBefore:20000,originalAfter:900000,targetAfter:15000};
test('native build verifies actual target-company debit without a custom quote',()=>{
  assert.equal(verifyNativeDepotResult(binding,before,receipt).outcome,'verified');
});
test('wrong correlation, spending, owner, identity and unconfirmed result remain unknown',()=>{
  for(const change of [{sessionId:'other'},{actionId:2},{consentId:'consent-2'},{resource:'other'},{constructionOwner:10},{depotOwner:10},{constructionMembershipPreserved:false},{depotMembershipPreserved:false},{chargedCost:0},
    {chargedCost:NaN},{chargedCost:5001},{originalBefore:899000},{targetAfter:14999},
    {outcome:'unknown'},{code:'NATIVE_REJECTION_REASON_UNVERIFIED'},
    {constructionEntity:0},{depotEntity:0},{constructionEntity:10},{depotEntity:20},
    {depotEntity:30},{extra:true}]){
    assert.equal(verifyNativeDepotResult(binding,before,{...receipt,...change}).outcome,'unknown');
  }
  assert.equal(verifyNativeDepotResult(binding,before,null).outcome,'unknown');
  assert.equal(verifyNativeDepotResult({...binding,targetCompany:10},before,receipt).outcome,'unknown');
});
test('native debit into debt is accepted only at the exact signed balance',()=>{
  assert.equal(verifyNativeDepotResult(binding,{...before,targetBalance:100},
    {...receipt,targetBefore:100,targetAfter:-4900}).outcome,'verified');
  assert.equal(verifyNativeDepotResult(binding,{...before,targetBalance:100},
    {...receipt,targetBefore:100,targetAfter:-4899}).outcome,'unknown');
  assert.equal(verifyNativeDepotResult(binding,{...before,targetBalance:NaN},receipt).outcome,'unknown');
});
test('engine factory uses explicit owner/context and standard validation',async()=>{
  const source=await readFile(new URL('../experimental/native-depot-command.lua',import.meta.url),'utf8');
  for(const marker of ['construction.playerEntity = binding.targetCompany','context.player = binding.targetCompany',
    'makeWorldBuildProposalCmd(proposal,context,false,true,false)','speed.speedup == 0',
    'proposal.constructionsToRemove = {}','params.seed = intent.seed'])assert.ok(source.includes(marker));
  const factory=source.slice(source.indexOf('function M.prepare'),source.indexOf('local function balance'));
  assert.doesNotMatch(factory,/sendCommand/);
  assert.doesNotMatch(source,/Proposal\.clone|onCreateProposalData|withCostRep/);
});
test('native diagnostic persists one attempt before send and checks owner/debit inside callback',async()=>{
  const source=await readFile(new URL('../experimental/native-depot-command.lua',import.meta.url),'utf8');
  const execute=source.slice(source.indexOf('function M.execute'));
  assert.ok(execute.indexOf('state:set(current)')<execute.indexOf('api.cmd.sendCommand(command'));
  for(const marker of ['CONSENT_PLACEMENT_CHANGED','CONSENT_ACTION_CHANGED','CONSENT_EVENT_CHANGED'])assert.ok(source.includes(marker),marker);
  for(const marker of ['not current.nativeDepotAttempted',
    'not constructions[id]','not depots[depotId]','depotOwner.player == binding.targetCompany',
    'preservesExisting(constructions','EXISTING_MEMBERSHIP_CHANGED',
    'receipt.originalAfter == beforeOriginal','receipt.targetAfter == beforeTarget-charged',
    'NATIVE_REJECTION_REASON_UNVERIFIED','ENGINE_CALLBACK_MISSING','callbackOpen = false','COMPANY_PHASE2_FAULT','current.phase2CompanyFault = true','saved.phase2CompanyFault=false'])assert.ok(execute.includes(marker),marker);
  assert.doesNotMatch(execute,/nativeDepotAttempted\s*=\s*false|function M\.expire|makeJournal|makeEntitySetPlayer/);
});
