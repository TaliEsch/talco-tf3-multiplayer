import test from 'node:test';
import assert from 'node:assert/strict';
import {stationRequest,serializeStationRequest,parseStationReceipt} from '../src/phase2-station.mjs';

const placement={resource:'base::/construction/street/modular_street_station/modular_terminal.con',x:-1.25,y:2.5,z:8,yaw:-Math.PI/2,seed:1};
const options={nonce:'a'.repeat(32),requestId:1,sample:{companyEntity:10,tickCount:100,speedup:0},targetCompany:20,slot:1,placement,confirmed:true};
const request=stationRequest(options);
const lua=values=>`function data() return { ${Object.entries(values).map(([key,value])=>`${key}=${JSON.stringify(value)},`).join(' ')} } end`;
const receipt={schemaVersion:1,kind:'phase2_station_receipt',nonce:request.nonce,requestId:1,companyEntity:10,targetCompany:20,slot:1,
  resource:placement.resource,tickCount:101,updateCount:80,outcome:'verified',code:'NATIVE_STATION_ACCOUNTING_VERIFIED',
  constructionEntity:30,stationEntity:31,constructionOwner:20,stationOwner:20,constructionMembershipPreserved:1,stationMembershipPreserved:1,
  chargedCost:100,originalBefore:5000,originalBeforeNegative:0,originalAfter:5000,originalAfterNegative:0,
  targetBefore:1000,targetBeforeNegative:0,targetAfter:900,targetAfterNegative:0};

test('station request has the exact paused, bounded two-slot schema',()=>{
  assert.equal(Object.keys(request).length,16);
  assert.match(serializeStationRequest(request),/slot = 1/);
  for(const change of [{confirmed:false},{slot:3},{targetCompany:10},{sample:{...options.sample,speedup:1}},
    {placement:{...placement,resource:'unsafe"'}},{placement:{...placement,seed:0}},{placement:{...placement,x:Infinity}},
    {placement:{...placement,cost:1}}])assert.throws(()=>stationRequest({...options,...change}));
  assert.throws(()=>serializeStationRequest({...request,expiresTick:999}));
  assert.throws(()=>serializeStationRequest({...request,extra:1}));
});

test('station receipts accept only a correlated verified native accounting result',()=>{
  assert.equal(parseStationReceipt(lua(receipt),request).outcome,'verified');
  for(const change of [{nonce:'b'.repeat(32)},{slot:2},{constructionOwner:10},{stationOwner:10},{stationEntity:30},
    {stationEntity:10},{stationEntity:2147483648},{updateCount:2147483648},
    {chargedCost:101},{originalAfter:4900},{targetAfterNegative:1},
    {constructionMembershipPreserved:0},{stationMembershipPreserved:0},{tickCount:401},{extra:1}])
    assert.throws(()=>parseStationReceipt(lua({...receipt,...change}),request));
  assert.throws(()=>parseStationReceipt(lua(receipt)+'; evil()',request));
  assert.throws(()=>parseStationReceipt(lua(receipt).replace('resource=', 'resource="duplicate",resource='),request));
});

test('station receipts retain non-success outcomes but never verify them',()=>{
  for(const outcome of ['rejected','unknown']){
    const parsed=parseStationReceipt(lua({...receipt,outcome,code:'ENGINE_OUTCOME_UNKNOWN',constructionEntity:0,stationEntity:0,chargedCost:0}),request);
    assert.equal(parsed.outcome,outcome);
  }
  assert.throws(()=>parseStationReceipt(lua({...receipt,outcome:'verified',code:'RESOURCE_COST_QUOTED'}),request));
  assert.throws(()=>parseStationReceipt(lua({...receipt,outcome:'other'}),request));
});
