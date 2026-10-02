import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeLoanOfferObservation} from '../src/loan-offer-observation.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';

const nonce='0123456789abcdef0123456789abcdef';
const context={expectedNonce:nonce,expectedCompanyEntity:3141,expectedRoundId:'round-1',expectedUpdateCount:3614};
const base=()=>({schemaVersion:1,kind:'loan_offer_observation',status:'ok',nonce,roundId:'round-1',
  companyEntity:3141,counter:7,tickCount:950,updateCount:3614,gameTime:722800,freeId:1,
  obtainedLoanCount:1,offerCount:2,offer1Type:'Medium',offer1State:'available',offer1Amount:82000000,
  offer1Duration:35064000,offer1PercentageMillionths:120000,offer1BirthDay:600000,
  offer2Type:'Small',offer2State:'cooldown',offer2CooldownUntil:900000});
function flat(value){
  return `function data()\nreturn {\n${Object.entries(value).map(([key,item])=>
    ` ${key} = ${typeof item==='string'?JSON.stringify(item):item},\n`).join('')} }\nend\n`;
}
function rejects(value,ctx=context,pattern=/^INVALID_LOAN_OFFER_OBSERVATION:/){
  assert.throws(()=>decodeLoanOfferObservation(value,ctx),error=>pattern.test(error.message));
}

test('decoder round trips through integer-only userdata IPC and returns a detached frozen semantic view',()=>{
  const parsed=parseFlatDataFile(flat(base()));
  const observed=decodeLoanOfferObservation(parsed,context);
  assert.equal(observed.companyEntity,3141);
  assert.equal(observed.updateCount,3614);
  assert.equal(observed.obtainedLoanCount,1);
  assert.deepEqual(observed.availableLoans,[
    {type:'Medium',amount:82000000,duration:35064000,percentage:0.12,birthDay:600000},
    {type:'Small',cooldownUntil:900000},
  ]);
  assert.equal(Object.isFrozen(observed),true);
  assert.equal(Object.isFrozen(observed.availableLoans),true);
  assert.equal(Object.isFrozen(observed.availableLoans[0]),true);
  assert.throws(()=>{observed.availableLoans[0].amount=1;},TypeError);
});

test('zero offers and zero debt decode without inferring freshness or debt',()=>{
  const value={...base(),freeId:0,obtainedLoanCount:0,offerCount:0};
  for(const key of Object.keys(value))if(/^offer\d/.test(key))delete value[key];
  const observed=decodeLoanOfferObservation(parseFlatDataFile(flat(value)),context);
  assert.equal(observed.availableLoans.length,0);
  assert.equal(observed.obtainedLoanCount,0);
  assert.equal(observed.freeId,0);
});

for(const [name,mutate] of [
  ['schema',v=>{v.schemaVersion=2;}],
  ['kind',v=>{v.kind='loan_state';}],
  ['status',v=>{v.status='unknown';}],
  ['nonce',v=>{v.nonce='f'.repeat(32);}],
  ['round',v=>{v.roundId='other-round';}],
  ['company',v=>{v.companyEntity=55652;}],
  ['counter',v=>{v.counter=-1;}],
  ['zero producer counter',v=>{v.counter=0;}],
  ['counter beyond producer bound',v=>{v.counter=2147483648;}],
  ['tick',v=>{v.tickCount=2147483648;}],
  ['game time',v=>{v.gameTime=Number.MAX_SAFE_INTEGER+1;}],
  ['free id',v=>{v.freeId=-1;}],
  ['free id beyond producer bound',v=>{v.freeId=2147483648;}],
  ['obtained count',v=>{v.obtainedLoanCount=5;}],
  ['offer count',v=>{v.offerCount=5;}],
  ['wrong held update',v=>{v.updateCount++;}],
  ['extra field',v=>{v.unreviewed=1;}],
  ['sparse slot',v=>{delete v.offer1Type;v.offer1State='cooldown';v.offer1CooldownUntil=4;}],
  ['off-count slot',v=>{v.offer3Type='Large';v.offer3State='cooldown';v.offer3CooldownUntil=7;}],
  ['duplicate type',v=>{v.offer2Type='Medium';}],
  ['unknown offer type',v=>{v.offer1Type='Custom';}],
  ['unknown offer state',v=>{v.offer1State='spent';}],
  ['available cooldown extra',v=>{v.offer1CooldownUntil=900000;}],
  ['cooldown available extra',v=>{v.offer2Amount=1;}],
  ['fractional amount',v=>{v.offer1Amount=82000000.5;}],
  ['fractional duration',v=>{v.offer1Duration=35064000.5;}],
  ['bad rate scalar',v=>{v.offer1PercentageMillionths=1000001;}],
  ['negative birthday',v=>{v.offer1BirthDay=-1;}],
  ['negative cooldown',v=>{v.offer2CooldownUntil=-1;}],
]) test(`decoder rejects ${name}`,()=>{
  const value=base();mutate(value);rejects(value);
});

test('decoder requires exact current caller identity and held update context',()=>{
  rejects(base(),{...context,expectedNonce:'f'.repeat(32)});
  rejects(base(),{...context,expectedCompanyEntity:55652});
  rejects(base(),{...context,expectedRoundId:'other-round'});
  rejects(base(),{...context,expectedUpdateCount:3615});
  rejects(base(),{...context,unexpected:true});
});

test('invalid offer-fact values fail before a semantic offer is returned',()=>{
  for(const field of ['offer1Amount','offer1Duration','offer1BirthDay','offer1PercentageMillionths']){
    const value=base();value[field]=Number.MAX_SAFE_INTEGER+1;rejects(value);
  }
});
