import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const statusUrl=new URL('../mod/content/tf3mp_status.script.tl',import.meta.url);
const moduleUrl=new URL('../mod/content/tf3mp_depot_command.lua',import.meta.url);
const experimentalUrl=new URL('../experimental/native-depot-command.lua',import.meta.url);

test('depot engine event admits only the fixed, held, created-company request',async()=>{
  const source=await readFile(statusUrl,'utf8');
  const fn=source.slice(source.indexOf('local function phase2DepotEvent'),source.indexOf('local ret : GameScriptWithGui'));
  for(const marker of ['request.kind ~= "phase2_depot"','count ~= 15','request.expiresTick ~= request.issuedTick + 300',
    'created.outcome ~= "created"','created.newCompanyEntity ~= request.targetCompany',
    'api.engine.util.getPlayer() ~= request.companyEntity','speed == nil or speed.speedup ~= 0',
    'current.phase2CompanyFault == true or current.nativeDepotAttempted == true',
    'sessionId=request.nonce, actionId=request.requestId','consentId=consentId',
    'depotCommand.execute(state, intent, binding, consent)']) assert.ok(fn.includes(marker),marker);
  assert.ok(fn.indexOf('current.phase2DepotReceipt = receipt')<fn.indexOf('depotCommand.execute'));
  assert.ok(fn.indexOf('state:set(current)')<fn.indexOf('clock.tickCount < request.issuedTick'));
  assert.match(fn,/local saved = state:get\(\) or current/);
  assert.match(fn,/saved\.phase2CompanyFault = true/);
  assert.match(source,/eventSubscriptionsVersion ~= 19/);
  for(const event of ['tf3mp_phase2_depot','tf3mp_get_phase2_depot'])assert.ok(source.includes(`state:subscribeToEvent("${event}")`));
  assert.match(source,/name == "tf3mp_get_phase2_depot"/);
  const handler=source.slice(source.indexOf('name == "tf3mp_phase2_depot"'),source.indexOf('name == "tf3mp_finance_probe"'));
  assert.match(handler,/local saved = state:get\(\) or current/);
  assert.match(handler,/state:set\(saved\)/);
});

test('depot GUI receipt has the flat correlated, signed-balance schema',async()=>{
  const source=await readFile(statusUrl,'utf8');
  const fn=source.slice(source.indexOf('local function depotReceipt'),source.indexOf('local function phase2DepotEvent'));
  for(const field of ['schemaVersion=1','kind="phase2_depot_receipt"','nonce=request.nonce','requestId=request.requestId',
    'companyEntity=request.companyEntity','targetCompany=request.targetCompany','tickCount=clock.tickCount','updateCount=clock.updateCount',
    'constructionEntity=0','depotEntity=0','constructionOwner=0','depotOwner=0','constructionMembershipPreserved=0',
    'depotMembershipPreserved=0','chargedCost=0','recordBalance(receipt, name, 0)']) assert.ok(fn.includes(field),field);
  assert.match(source,/receipt\.outcome = native\.outcome == "verified" and "verified" or "unknown"/);
  assert.match(source,/NATIVE_REJECTION_REASON_UNVERIFIED/);
  assert.doesNotMatch(fn,/afford|insufficient/i);
});

test('installed depot adapter is the review-pinned experimental source',async()=>{
  const [installed,experimental]=await Promise.all([readFile(moduleUrl),readFile(experimentalUrl)]);
  assert.deepEqual(installed,experimental);
  assert.equal(createHash('sha256').update(installed).digest('hex'),'9af2637773cc091bf0ee6082f6225bb9c06c25d89085aa4825796134df5ed0ba');
});
