import test from 'node:test';
import assert from 'node:assert/strict';
import {assertMatchingLoanOffer,parseLoanObtainOrderPayload,encodeLoanObtainFlat,decodeLoanObtainFlat} from '../src/loan-obtain-order-payload.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';

const company=3141;
const payload=()=>({companyEntity:company,offerType:'Small',amount:41000000,
  duration:35064000,percentage:0.12,birthDay:479200});
const offer=(changes={})=>({type:'Small',amount:41000000,duration:35064000,
  percentage:0.12,birthDay:479200,...changes});

test('loan rates round trip through the existing integer-only userdata format exactly',()=>{
  for(const percentage of [.03,.05,.07,.12]){
    const original={...payload(),percentage};
    const flat={companyEntity:company,...encodeLoanObtainFlat(original,company)};
    const text='function data() return {'+Object.entries(flat)
      .map(([key,value])=>`${key}=${typeof value==='string'?JSON.stringify(value):value},`).join('')+'} end';
    assert.deepEqual(decodeLoanObtainFlat(parseFlatDataFile(text),company),original);
  }
  assert.throws(()=>encodeLoanObtainFlat({...payload(),percentage:.1234567},company),/NOT_EXACTLY_SERIALIZABLE/);
  for(const percentageMillionths of [0,1000001,.5,NaN,Infinity])
    assert.throws(()=>decodeLoanObtainFlat({...payload(),percentageMillionths},company),/INVALID_LOAN_RATE_SCALAR/);
});

test('loan obtain parser returns only detached, frozen stock offer facts',()=>{
  const original=payload();
  const parsed=parseLoanObtainOrderPayload(original,company);
  assert.deepEqual(parsed,original);assert.equal(Object.isFrozen(parsed),true);
  original.amount=1;original.extra='client balance delta';
  assert.equal(parsed.amount,41000000);assert.equal(Object.hasOwn(parsed,'extra'),false);
  assert.throws(()=>{parsed.amount=1;},TypeError);
});

test('loan obtain payload requires the exact selected company and exact fact fields',()=>{
  assert.throws(()=>parseLoanObtainOrderPayload({...payload(),companyEntity:55652},company),
    /INVALID_LOAN_OBTAIN_ORDER_PAYLOAD/);
  for(const changed of [
    {...payload(),balance:50000000},{...payload(),credit:41000000},
    {...payload(),extra:true},{...payload(),offerType:'unknown'},
    {...payload(),offerType:'extralarge'},Object.create(null),null,[],
  ])assert.throws(()=>parseLoanObtainOrderPayload(changed,company),
    /INVALID_LOAN_OBTAIN_ORDER_PAYLOAD/);
});

test('loan obtain payload rejects unsafe or invalid numeric offer facts',()=>{
  for(const changed of [
    {...payload(),amount:0},{...payload(),amount:-1},{...payload(),amount:1.5},
    {...payload(),amount:Number.MAX_SAFE_INTEGER+1},{...payload(),duration:0},
    {...payload(),duration:-1},{...payload(),duration:1.5},
    {...payload(),duration:Number.MAX_SAFE_INTEGER+1},{...payload(),percentage:0},
    {...payload(),percentage:-0.1},{...payload(),percentage:1.01},
    {...payload(),percentage:NaN},{...payload(),percentage:Infinity},
    {...payload(),birthDay:-1},{...payload(),birthDay:1.5},
    {...payload(),birthDay:Number.MAX_SAFE_INTEGER+1},
  ])assert.throws(()=>parseLoanObtainOrderPayload(changed,company),
    /INVALID_LOAN_OBTAIN_ORDER_PAYLOAD/);
  for(const expectedCompany of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'3141',null])
    assert.throws(()=>parseLoanObtainOrderPayload(payload(),expectedCompany),
      /INVALID_LOAN_OBTAIN_ORDER_PAYLOAD/);
});

test('loan intent must exactly match one current offer in the dense bounded snapshot',()=>{
  const original=payload();
  const available=[offer({type:'Medium',amount:82000000,birthDay:500000}),offer(),
    offer({type:'ExtraLarge',amount:164000000,birthDay:600000})];
  const parsed=assertMatchingLoanOffer(original,available);
  assert.deepEqual(parsed,original);assert.equal(Object.isFrozen(parsed),true);
  assert.equal(Object.isFrozen(original),false);assert.equal(Object.isFrozen(available[1]),false);
  original.amount=1;available[1].amount=2;
  assert.equal(parsed.amount,41000000);
});

test('loan offer matching rejects stale facts and missing offer types without regenerating offers',()=>{
  assert.throws(()=>assertMatchingLoanOffer({...payload(),amount:41000001},[offer()]),
    /LOAN_OFFER_NOT_CURRENT/);
  assert.throws(()=>assertMatchingLoanOffer(payload(),[offer({type:'Medium'})]),
    /LOAN_OFFER_NOT_CURRENT/);
  assert.throws(()=>assertMatchingLoanOffer({...payload(),birthDay:479201},[offer()]),
    /LOAN_OFFER_NOT_CURRENT/);
});

test('loan offer matching rejects duplicate types, cooldown markers and unknown offer facts',()=>{
  assert.throws(()=>assertMatchingLoanOffer(payload(),[offer(),offer({amount:42000000})]),
    /INVALID_LOAN_OFFER_SNAPSHOT/);
  assert.throws(()=>assertMatchingLoanOffer(payload(),[offer({cooldownUntil:500000})]),
    /INVALID_LOAN_OFFER_SNAPSHOT/);
  assert.throws(()=>assertMatchingLoanOffer(payload(),[offer({unexpected:true})]),
    /INVALID_LOAN_OFFER_SNAPSHOT/);
  assert.throws(()=>assertMatchingLoanOffer(payload(),[offer({amount:NaN})]),
    /INVALID_LOAN_OFFER_SNAPSHOT/);
});

test('a different available offer remains selectable beside a typed cooldown slot',()=>{
  const parsed=assertMatchingLoanOffer(payload(),[
    {type:'Medium',cooldownUntil:600000},offer(),
  ]);
  assert.deepEqual(parsed,payload());
  assert.equal(Object.isFrozen(parsed),true);
});

test('selected cooled offer, duplicate cooled type and malformed cooldown are rejected',()=>{
  assert.throws(()=>assertMatchingLoanOffer(payload(),[
    {type:'Small',cooldownUntil:600000},
  ]),/LOAN_OFFER_NOT_CURRENT/);
  assert.throws(()=>assertMatchingLoanOffer(payload(),[
    {type:'Medium',cooldownUntil:600000},{type:'Medium',cooldownUntil:700000},offer(),
  ]),/INVALID_LOAN_OFFER_SNAPSHOT/);
  for(const cooldownUntil of [-1,1.5,Number.MAX_SAFE_INTEGER+1,'600000',null])
    assert.throws(()=>assertMatchingLoanOffer(payload(),[
      {type:'Medium',cooldownUntil},offer(),
    ]),/INVALID_LOAN_OFFER_SNAPSHOT/);
  assert.throws(()=>assertMatchingLoanOffer(payload(),[
    {type:'Medium',cooldownUntil:600000,amount:1},offer(),
  ]),/INVALID_LOAN_OFFER_SNAPSHOT/);
});

test('loan offer matching accepts only dense snapshots of at most four plain offer records',()=>{
  const sparse=[];sparse.length=1;sparse[0]=offer();sparse.length=2;
  for(const invalid of [null,{},Array(5).fill(offer()),sparse])
    assert.throws(()=>assertMatchingLoanOffer(payload(),invalid),/INVALID_LOAN_OFFER_SNAPSHOT/);
  const withExtra=Object.assign([offer()],{other:offer({type:'Large'})});
  assert.throws(()=>assertMatchingLoanOffer(payload(),withExtra),/INVALID_LOAN_OFFER_SNAPSHOT/);
  const nullPrototype=Object.assign(Object.create(null),offer());
  assert.throws(()=>assertMatchingLoanOffer(payload(),[nullPrototype]),/INVALID_LOAN_OFFER_SNAPSHOT/);
});
