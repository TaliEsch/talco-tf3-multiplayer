import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Canonical} from '../src/canonical.mjs';
import {createLoanObtainAuthorization,loanObtainSharedFacts,
  parseLoanObtainAuthorization,parseLoanObtainHeld,validateLoanObtainWirePayload} from '../src/loan-obtain-hold-contract.mjs';

const roundId='borrow-round';
const command=()=>({protocolVersion:2,hostSequence:5,scheduledUpdate:120,originPlayerId:'host',
  targetCompanyEntity:3141,targetEntity:0,commandType:'finance.loan.obtain',
  payload:{companyEntity:3141,offerType:'Medium',amount:82000000,duration:35064000,percentage:0.12,birthDay:600000},
  clientSequence:2,requestMessageId:'loan-request-1'});
const offers=()=>[
  {type:'Medium',amount:82000000,duration:35064000,percentage:0.12,birthDay:600000},
  {type:'Small',cooldownUntil:900000},
  {type:'Large',cooldownUntil:900000},
  {type:'ExtraLarge',cooldownUntil:900000},
];
function held(overrides={}){
  const value={roundId,hostSequence:5,scheduledUpdate:120,companyEntity:55652,
    targetCompanyEntity:3141,heldGameTime:722800,freeId:0,monthDuration:86400,
    availableLoans:offers(),loanStateHash:'' ,...overrides};
  value.loanStateHash=sha256Canonical({schemaVersion:1,availableLoans:value.availableLoans,
    obtainedLoans:[],freeId:value.freeId,owners:[]});
  return value;
}
function changedHeld(overrides){return held(overrides);}
function resealAuthorization(value){
  const {authorizationHash,...unsigned}=value;
  value.authorizationHash=sha256Canonical(unsigned);return value;
}
function authHashInput(value){const {authorizationHash,...unsigned}=value;return unsigned;}
function assertReject(fn){assert.throws(fn,TypeError);}

test('wire held envelope rejects unknown fields and malformed shared state before command correlation',()=>{
  const input=held();assert.deepEqual(validateLoanObtainWirePayload('loan_obtain_held',input),loanObtainSharedFacts(input));
  for(const changes of [{extra:1},{availableLoans:[]},{loanStateHash:'f'.repeat(64)}])
    assertReject(()=>validateLoanObtainWirePayload('loan_obtain_held',{...input,...changes}));
});
test('wire authorization rejects changed hash, nonstock cooldown and unknown kind',()=>{
  const authorization=createLoanObtainAuthorization(held(),4);
  assert.deepEqual(validateLoanObtainWirePayload('loan_obtain_authorize',authorization),authorization);
  for(const changes of [{extra:1},{authorizationHash:'f'.repeat(64)},
    {cooldownUntil:authorization.cooldownUntil+1}])
    assertReject(()=>validateLoanObtainWirePayload('loan_obtain_authorize',{...authorization,...changes}));
  assertReject(()=>validateLoanObtainWirePayload('loan_obtain_unknown',authorization));
});

test('held report checks command correlation, exact stock offer and the canonical shared loan state',()=>{
  const input=held();const commandInput=command();
  const parsed=parseLoanObtainHeld(input,commandInput,roundId);
  assert.equal(parsed.companyEntity,55652);
  assert.equal(parsed.targetCompanyEntity,3141);
  assert.equal(parsed.loanStateHash,sha256Canonical({schemaVersion:1,availableLoans:input.availableLoans,
    obtainedLoans:[],freeId:input.freeId,owners:[]}));
  assert.deepEqual(loanObtainSharedFacts(parsed),{
    roundId,hostSequence:5,scheduledUpdate:120,targetCompanyEntity:3141,
    heldGameTime:722800,freeId:0,monthDuration:86400,availableLoans:offers(),loanStateHash:input.loanStateHash,
  });
  assert.equal(Object.isFrozen(parsed),true);
  assert.equal(Object.isFrozen(parsed.availableLoans),true);
  assert.equal(Object.isFrozen(parsed.availableLoans[0]),true);
});

test('held report and shared facts are detached from caller-owned tables',()=>{
  const originalOffers=offers();const input=held({availableLoans:originalOffers});
  const parsed=parseLoanObtainHeld(input,command(),roundId);
  originalOffers[0].amount=1;input.availableLoans[1].cooldownUntil=1;
  assert.equal(parsed.availableLoans[0].amount,82000000);
  assert.equal(parsed.availableLoans[1].cooldownUntil,900000);
  const facts=loanObtainSharedFacts(parsed);
  assert.notEqual(facts.availableLoans,parsed.availableLoans);
  assert.equal(Object.isFrozen(facts.availableLoans[0]),true);
});

for(const [name,mutate] of [
  ['wrong round',v=>{v.roundId='other';}],
  ['wrong host sequence',v=>{v.hostSequence=6;}],
  ['wrong scheduled update',v=>{v.scheduledUpdate=121;}],
  ['wrong target company',v=>{v.targetCompanyEntity=55652;}],
  ['bad reporter company',v=>{v.companyEntity=0;}],
  ['negative game time',v=>{v.heldGameTime=-1;}],
  ['unsafe game time',v=>{v.heldGameTime=Number.MAX_SAFE_INTEGER+1;}],
  ['zero month duration',v=>{v.monthDuration=0;}],
  ['free ID overflow',v=>{v.freeId=2147483648;}],
  ['forged shared state hash',v=>{v.loanStateHash='a'.repeat(64);}],
  ['stale chosen offer',v=>{v.availableLoans[0].amount++;v.loanStateHash=sha256Canonical({schemaVersion:1,
    availableLoans:v.availableLoans,obtainedLoans:[],freeId:v.freeId,owners:[]});}],
  ['duplicate stock type',v=>{v.availableLoans[1]={type:'Medium',cooldownUntil:900000};v.loanStateHash=sha256Canonical({schemaVersion:1,
    availableLoans:v.availableLoans,obtainedLoans:[],freeId:v.freeId,owners:[]});}],
  ['sparse stock offers',v=>{delete v.availableLoans[0];}],
  ['too many stock offers',v=>{v.availableLoans.push({type:'Large',cooldownUntil:1},{type:'ExtraLarge',cooldownUntil:1});}],
  ['fractional stock rate',v=>{v.availableLoans[0].percentage=0.1200001;v.loanStateHash=sha256Canonical({schemaVersion:1,
    availableLoans:v.availableLoans,obtainedLoans:[],freeId:v.freeId,owners:[]});}],
])test(`held parser rejects ${name}`,()=>{
  const input=held();mutate(input);assertReject(()=>parseLoanObtainHeld(input,command(),roundId));
});

test('held parser requires exactly four dense stock offer slots',()=>{
  for(const count of [0,1,2,3]){
    const input=held();input.availableLoans=input.availableLoans.slice(0,count);
    input.loanStateHash=sha256Canonical({schemaVersion:1,availableLoans:input.availableLoans,
      obtainedLoans:[],freeId:input.freeId,owners:[]});
    assertReject(()=>parseLoanObtainHeld(input,command(),roundId));
  }
  const input=held();input.availableLoans[0].amount=2147483648;
  input.loanStateHash=sha256Canonical({schemaVersion:1,availableLoans:input.availableLoans,
    obtainedLoans:[],freeId:input.freeId,owners:[]});
  const c=command();c.payload.amount=2147483648;
  assert.doesNotThrow(()=>parseLoanObtainHeld(input,c,roundId));
});

for(const [name,mutate] of [
  ['wrong protocol version',c=>{c.protocolVersion=1;}],
  ['wrong command type',c=>{c.commandType='vehicle.setRunning';}],
  ['nonzero target entity',c=>{c.targetEntity=1;}],
  ['wrong command company',c=>{c.targetCompanyEntity=55652;}],
  ['wrong command schedule',c=>{c.scheduledUpdate=121;}],
  ['wrong offer company',c=>{c.payload.companyEntity=55652;}],
  ['extra command field',c=>{c.unreviewed=true;}],
])test(`held parser rejects ${name}`,()=>{
  const c=command();mutate(c);assertReject(()=>parseLoanObtainHeld(held(),c,roundId));
});

test('Host authorization derives one bounded cooldown and parses against the same command',()=>{
  const heldResult=parseLoanObtainHeld(held(),command(),roundId);
  const authorization=createLoanObtainAuthorization(heldResult,6);
  assert.equal(authorization.cooldownUntil,722800+6*86400);
  assert.equal(authorization.authorizationHash,sha256Canonical(authHashInput(authorization)));
  const parsed=parseLoanObtainAuthorization(authorization,command(),roundId);
  assert.deepEqual(parsed,authorization);
  assert.equal(Object.isFrozen(parsed),true);
  assert.equal(Object.isFrozen(parsed.availableLoans[0]),true);
});

test('authorization parser detaches its caller-owned offer list',()=>{
  const input=structuredClone(createLoanObtainAuthorization(parseLoanObtainHeld(held(),command(),roundId),6));
  const parsed=parseLoanObtainAuthorization(input,command(),roundId);
  input.availableLoans[0].amount=1;
  assert.equal(parsed.availableLoans[0].amount,82000000);
  assert.equal(Object.isFrozen(parsed.availableLoans),true);
});

test('authorization omits reporter identity but pins the selected target company',()=>{
  const authorization=createLoanObtainAuthorization(parseLoanObtainHeld(held(),command(),roundId),4);
  assert.equal('companyEntity' in authorization,false);
  assert.equal(authorization.targetCompanyEntity,3141);
  assertReject(()=>parseLoanObtainAuthorization(authorization,{...command(),targetCompanyEntity:55652,
    payload:{...command().payload,companyEntity:55652}},roundId));
});

test('command and round identifiers follow existing protocol string bounds',()=>{
  const longRound=`round ${'r'.repeat(58)}`;const input=held({roundId:longRound});const c=command();
  c.originPlayerId='player with spaces';c.requestMessageId='x'.repeat(128);
  assert.doesNotThrow(()=>parseLoanObtainHeld(input,c,longRound));
});

for(const months of [3,9,4.5,Number.MAX_SAFE_INTEGER])
  test(`authorization creation rejects cooldown month value ${months}`,()=>{
    const input=parseLoanObtainHeld(held(),command(),roundId);
    assertReject(()=>createLoanObtainAuthorization(input,months));
  });

for(const [name,mutate] of [
  ['tampered cooldown',v=>{v.cooldownUntil++;resealAuthorization(v);}],
  ['out of range cooldown',v=>{v.cooldownUntil=722800+3*86400;resealAuthorization(v);}],
  ['nonintegral cooldown months',v=>{v.cooldownUntil=722800+4*86400+1;resealAuthorization(v);}],
  ['overflow cooldown',v=>{v.cooldownUntil=2147483648;resealAuthorization(v);}],
  ['changed available offer',v=>{v.availableLoans[0].amount++;v.loanStateHash=sha256Canonical({schemaVersion:1,
    availableLoans:v.availableLoans,obtainedLoans:[],freeId:v.freeId,owners:[]});resealAuthorization(v);}],
  ['bad shared loan hash',v=>{v.loanStateHash='b'.repeat(64);resealAuthorization(v);}],
  ['changed command offer',v=>{}],
  ['changed round',v=>{v.roundId='other';resealAuthorization(v);}],
  ['changed host sequence',v=>{v.hostSequence++;resealAuthorization(v);}],
  ['added field',v=>{v.replay=true;resealAuthorization(v);}],
])test(`authorization parser rejects ${name}`,()=>{
  const heldResult=parseLoanObtainHeld(held(),command(),roundId);
  const value=structuredClone(createLoanObtainAuthorization(heldResult,6));mutate(value);
  const c=command();if(name==='changed command offer')c.payload.amount++;
  assertReject(()=>parseLoanObtainAuthorization(value,c,roundId));
});

test('cooldown arithmetic refuses the signed game-time boundary overflow',()=>{
  const input=held({heldGameTime:2147483647-5*86400,monthDuration:86400});
  input.loanStateHash=sha256Canonical({schemaVersion:1,availableLoans:input.availableLoans,
    obtainedLoans:[],freeId:input.freeId,owners:[]});
  const parsed=parseLoanObtainHeld(input,command(),roundId);
  assertReject(()=>createLoanObtainAuthorization(parsed,6));
});
