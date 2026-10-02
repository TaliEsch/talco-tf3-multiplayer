import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Canonical} from '../src/canonical.mjs';
import {createLoanObtainAuthorization,parseLoanObtainHeld} from '../src/loan-obtain-hold-contract.mjs';
import {decodeLoanObtainExecutionReceipt,decodeLoanObtainHeldReceipt} from '../src/coordinator-loan-obtain.mjs';

const nonce='0123456789abcdef0123456789abcdef';
const roundId='borrow-round';
const operationId='loan-operation-5';
const command=()=>({protocolVersion:2,hostSequence:5,scheduledUpdate:120,originPlayerId:'host',
  targetCompanyEntity:3141,targetEntity:0,commandType:'finance.loan.obtain',
  payload:{companyEntity:3141,offerType:'Medium',amount:82000000,duration:35064000,
    percentage:0.12,birthDay:600000},clientSequence:2,requestMessageId:'loan-request-1'});
const initialOffers=()=>[
  {type:'Medium',amount:82000000,duration:35064000,percentage:0.12,birthDay:600000},
  {type:'Small',cooldownUntil:900000},
  {type:'Large',cooldownUntil:900000},
  {type:'ExtraLarge',cooldownUntil:900000},
];
const flatOffers=offers=>Object.fromEntries(offers.flatMap((offer,index)=>{
  const prefix=`offer${index+1}`;
  return Object.hasOwn(offer,'cooldownUntil')
    ?[[`${prefix}Type`,offer.type],[`${prefix}State`,'cooldown'],[`${prefix}CooldownUntil`,offer.cooldownUntil]]
    :[[`${prefix}Type`,offer.type],[`${prefix}State`,'available'],[`${prefix}Amount`,offer.amount],
      [`${prefix}Duration`,offer.duration],[`${prefix}PercentageMillionths`,Math.round(offer.percentage*1e6)],
      [`${prefix}BirthDay`,offer.birthDay]];
}));
function heldRaw(overrides={}){
  return {schemaVersion:1,nonce,roundId,operationId,operation:'holdLoanObtain',status:'ok',
    updateCount:120,held:true,hostSequence:5,companyEntity:55652,targetCompanyEntity:3141,
    heldGameTime:722800,freeId:0,monthDuration:86400,offerCount:4,obtainedLoanCount:0,
    ownerCount:0,loanMarkersAbsent:1,...flatOffers(initialOffers()),...overrides};
}
function heldContext(commandValue=command(),companiesLocal=55652){
  return {nonce,command:commandValue,roundId,operationId,localCompanyEntity:companiesLocal};
}
function decodeHeld(raw=heldRaw(),context=heldContext()){
  return decodeLoanObtainHeldReceipt(raw,context);
}
function authorizationFromHold(raw=heldRaw()){
  const commandValue=command();
  const held=decodeHeld(raw,heldContext(commandValue)).state;
  return createLoanObtainAuthorization(held,6);
}
function executionRaw({companies=[3141,55652],authorization=authorizationFromHold()}={}){
  const c=command();
  const post=initialOffers().map(offer=>offer.type==='Medium'
    ?{type:'Medium',cooldownUntil:authorization.cooldownUntil}:offer);
  const raw={schemaVersion:1,nonce,roundId,operationId,operation:'executeHeld',status:'ok',
    updateCount:c.scheduledUpdate,held:true,hostSequence:c.hostSequence,companyEntity:c.targetCompanyEntity,
    loanId:authorization.freeId,amount:c.payload.amount,duration:c.payload.duration,
    percentageMillionths:120000,offerType:c.payload.offerType,loanLastPayDay:authorization.heldGameTime,
    loanTimesPaid:0,freeId:authorization.freeId+1,heldGameTime:authorization.heldGameTime,
    cooldownUntil:authorization.cooldownUntil,callbackCount:1,companyCount:companies.length,offerCount:4,
    ...flatOffers(post)};
  companies=[...companies].sort((a,b)=>a-b);
  for(let index=1;index<=companies.length;index++){
    const company=companies[index-1];raw[`company${index}`]=company;
    const balance=company===3141?-500:-100;
    const after=company===3141?balance+c.payload.amount:balance;
    raw[`balanceBefore${index}`]=Math.abs(balance);raw[`negativeBefore${index}`]=balance<0?1:0;
    raw[`balanceAfter${index}`]=Math.abs(after);raw[`negativeAfter${index}`]=after<0?1:0;
  }
  return raw;
}
function executionContext({companies=[3141,55652],authorization=authorizationFromHold()}={}){
  return {nonce,command:command(),roundId,operationId,authorization,companies};
}
function rejected(fn){assert.throws(fn,TypeError);}

test('HOLD receipt decodes actual engine facts into validated shared loan state',()=>{
  const raw=heldRaw();const result=decodeHeld(raw);
  assert.deepEqual(result.receipt,{schemaVersion:1,roundId,operationId,operation:'holdLoanObtain',
    status:'ok',updateCount:120,held:true,loanHeld:result.state});
  assert.equal(result.state.companyEntity,55652);
  assert.equal(result.state.targetCompanyEntity,3141);
  assert.equal(result.state.availableLoans.length,4);
  assert.equal(result.state.loanStateHash,sha256Canonical({schemaVersion:1,
    availableLoans:result.state.availableLoans,obtainedLoans:[],freeId:0,owners:[]}));
  assert.equal(Object.isFrozen(result),true);
  assert.equal(Object.isFrozen(result.state.availableLoans[0]),true);
  raw.offer1Amount=1;
  assert.equal(result.state.availableLoans[0].amount,82000000);
});

test('HOLD validates separately at Host or borrower local company',()=>{
  for(const localCompanyEntity of [3141,55652]){
    const raw=heldRaw({...heldRaw(),companyEntity:localCompanyEntity});
    const result=decodeHeld(raw,heldContext(command(),localCompanyEntity));
    assert.equal(result.state.companyEntity,localCompanyEntity);
  }
});

test('HOLD rejects wrong correlation, company, loan markers, counts and offer evidence',()=>{
  for(const [field,value] of Object.entries({nonce:'f'.repeat(32),roundId:'other',operationId:'other-op',
    operation:'executeHeld',status:'unknown',updateCount:121,held:false,hostSequence:6,
    companyEntity:3141,targetCompanyEntity:55652,obtainedLoanCount:1,ownerCount:1,loanMarkersAbsent:0,
    freeId:2147483648,monthDuration:0,offerCount:3})){
    const raw=heldRaw();raw[field]=value;rejected(()=>decodeHeld(raw));
  }
  const raw=heldRaw();raw.offer1Amount++;
  rejected(()=>decodeHeld(raw));
  const extra=heldRaw();extra.stateHash='a'.repeat(64);
  rejected(()=>decodeHeld(extra));
});

test('HOLD checks caller command target, selected facts and supplied context',()=>{
  const raw=heldRaw();
  rejected(()=>decodeHeld(raw,{...heldContext(),operationId:'other'}));
  rejected(()=>decodeHeld(raw,heldContext({...command(),targetEntity:9})));
  rejected(()=>decodeHeld(raw,heldContext({...command(),payload:{...command().payload,amount:82000001}})));
  rejected(()=>decodeHeld(raw,heldContext(command(),3141))); // reporter is not the supplied local company
});

test('COMPLETE receipt decodes independently sampled credit, terms, schedule and four offers',()=>{
  const authorization=authorizationFromHold();
  const raw=executionRaw({authorization});
  const result=decodeLoanObtainExecutionReceipt(raw,executionContext({authorization}));
  assert.deepEqual(result.state.loan,{id:0,type:'Medium',amount:82000000,duration:35064000,
    percentage:0.12,lastPayDay:722800,timesPaid:0});
  assert.deepEqual(result.state.owner,{loanId:0,ownerCompanyEntity:3141,type:'Medium',
    amount:82000000,duration:35064000,percentage:0.12});
  assert.deepEqual(result.state.balancesBefore,[{companyEntity:3141,balance:-500},{companyEntity:55652,balance:-100}]);
  assert.deepEqual(result.state.balancesAfter,[{companyEntity:3141,balance:81999500},{companyEntity:55652,balance:-100}]);
  assert.equal(result.state.availableLoans[0].cooldownUntil,authorization.cooldownUntil);
  assert.equal(result.state.freeId,1);
  assert.equal(result.receipt.stateHash,sha256Canonical(result.state));
  assert.equal('stateHash' in raw,false);
  assert.equal(Object.isFrozen(result.state.balancesBefore[0]),true);
  raw.balanceAfter1=1;
  assert.equal(result.state.balancesAfter[0].balance,81999500);
});

test('COMPLETE accepts a sorted four-company roster and unchanged zero/signed references',()=>{
  const companies=[70000,55652,3141,60000];const authorization=authorizationFromHold();
  const raw=executionRaw({companies,authorization});
  const context=executionContext({companies,authorization});
  const result=decodeLoanObtainExecutionReceipt(raw,context);
  assert.deepEqual(result.state.balancesAfter.map(item=>item.companyEntity),[3141,55652,60000,70000]);
  for(const row of result.state.balancesBefore.filter(item=>item.companyEntity!==3141))
    assert.equal(result.state.balancesAfter.find(item=>item.companyEntity===row.companyEntity).balance,row.balance);
});

test('COMPLETE rejects every correlation, callback, owner, schedule and balance contradiction',()=>{
  const cases=[
    ['wrong nonce',r=>{r.nonce='f'.repeat(32);}],['wrong round',r=>{r.roundId='other';}],
    ['wrong operation id',r=>{r.operationId='other';}],['wrong operation',r=>{r.operation='holdLoanObtain';}],
    ['wrong status',r=>{r.status='unknown';}],['not held',r=>{r.held=false;}],
    ['wrong update',r=>{r.updateCount++;}],['wrong sequence',r=>{r.hostSequence++;}],
    ['wrong company',r=>{r.companyEntity=55652;}],['wrong loan id',r=>{r.loanId++;}],
    ['wrong owner credit amount',r=>{r.amount++;}],['wrong duration',r=>{r.duration++;}],
    ['wrong interest',r=>{r.percentageMillionths++;}],['wrong offer type',r=>{r.offerType='Large';}],
    ['wrong payday',r=>{r.loanLastPayDay++;}],['paid count',r=>{r.loanTimesPaid=1;}],
    ['wrong free id',r=>{r.freeId++;}],['wrong held time',r=>{r.heldGameTime++;}],
    ['wrong cooldown',r=>{r.cooldownUntil++;}],['duplicate callback',r=>{r.callbackCount=2;}],
    ['wrong roster count',r=>{r.companyCount=3;}],['nonselected offer changed',r=>{r.offer2CooldownUntil++;}],
    ['selected offer did not cool',r=>{r.offer1BirthDay++;}],
    ['reference balance changed',r=>{r.balanceAfter2++;}],
    ['owner balance delta wrong',r=>{r.balanceAfter1++;}],
    ['negative zero flag',r=>{r.negativeBefore2=1;r.balanceBefore2=0;}],
    ['negative flag invalid',r=>{r.negativeAfter2=2;}],
    ['echoed expected hash',r=>{r.stateHash='a'.repeat(64);}],
    ['extra evidence field',r=>{r.balanceDelta=82000000;}],
  ];
  for(const [name,mutate]of cases){const raw=executionRaw();mutate(raw);rejected(()=>decodeLoanObtainExecutionReceipt(raw,executionContext()));}
});

test('COMPLETE rejects malformed or unsorted company roster projections',()=>{
  const authorization=authorizationFromHold();
  for(const companies of [[3141],[3141,55652,60000,70000,80000],[3141,3141],[3141,55652,2147483648]]){
    const raw=executionRaw({companies:[3141,55652],authorization});
    rejected(()=>decodeLoanObtainExecutionReceipt(raw,executionContext({companies,authorization})));
  }
  const raw=executionRaw({authorization});
  raw.company1=55652;raw.company2=3141;
  rejected(()=>decodeLoanObtainExecutionReceipt(raw,executionContext({authorization})));
});

test('COMPLETE rejects stale Host authorization and malformed offer state',()=>{
  const authorization=authorizationFromHold();
  const raw=executionRaw({authorization});
  const changed=structuredClone(authorization);changed.cooldownUntil++;
  rejected(()=>decodeLoanObtainExecutionReceipt(raw,executionContext({authorization:changed})));
  const sparse=executionRaw({authorization});delete sparse.offer4State;
  rejected(()=>decodeLoanObtainExecutionReceipt(sparse,executionContext({authorization})));
  const duplicate=executionRaw({authorization});duplicate.offer4Type='Small';
  rejected(()=>decodeLoanObtainExecutionReceipt(duplicate,executionContext({authorization})));
  const unsafe=executionRaw({authorization});unsafe.balanceBefore1=Number.MAX_SAFE_INTEGER+1;
  rejected(()=>decodeLoanObtainExecutionReceipt(unsafe,executionContext({authorization})));
});
