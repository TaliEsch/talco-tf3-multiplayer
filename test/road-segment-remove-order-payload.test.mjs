import assert from 'node:assert/strict';
import test from 'node:test';
import {decodeRoadSegmentRemoveFlat,encodeRoadSegmentRemoveFlat,parseRoadSegmentRemoveOrderPayload}
  from '../src/road-segment-remove-order-payload.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';
import {MAX_USERDATA_IPC_BYTES} from '../src/constants.mjs';

// Recorded diagnostic-number descriptor for owned street entity 28753 in the
// fb1b66 no-send discovery. Native full precision remains pending v6; the
// local entity ID is intentionally not on wire.
const fixture=()=>({schemaVersion:1,companyEntity:15702,
  node0Position:[-1647.9,1136.9,1.8],node1Position:[-1647.47,1077.99,1.0442],
  tangent0:[0.426758,-58.9109,-0.755817],tangent1:[0.426768,-58.9109,-0.755816],
  roadTemplate:'::/infrastructure/street/town/town_old_small.street_template',
  roadStyle:'::/infrastructure/street/town/town_old.street',
  type:0,typeIndex:-1,roadType:1,roadDevelopmentLocked:false});

const parseWire=(wire,company=15702)=>decodeRoadSegmentRemoveFlat({...wire},company);
const flatLua=value=>`function data()\nreturn {\n${Object.entries(value).map(([key,item])=>
  `  ${key} = ${typeof item==='string'?`"${item}"`:String(item)},\n`).join('')}}\nend\n`;

test('road segment removal identity round trips recorded diagnostic descriptor without local edge IDs',()=>{
  const input=fixture(),parsed=parseRoadSegmentRemoveOrderPayload(input,15702);
  const wire=encodeRoadSegmentRemoveFlat(input,15702);
  assert.deepEqual(parsed,input);
  assert.deepEqual(decodeRoadSegmentRemoveFlat({...wire},15702),input);
  assert.equal(Object.hasOwn(wire,'companyEntity'),false);
  assert.equal(Object.keys(wire).some(key=>/entity/i.test(key)),false);
  assert.equal(Object.isFrozen(parsed),true);
  for(const key of ['node0Position','node1Position','tangent0','tangent1'])
    assert.equal(Object.isFrozen(parsed[key]),true);
  assert.throws(()=>{parsed.node0Position[0]=0;});
});

for(const [name,change] of [
  ['wrong authenticated company',p=>{p.companyEntity=28619;}],
  ['non-road type',p=>{p.type=1;}],
  ['type index above int32',p=>{p.typeIndex=2147483648;}],
  ['fractional type index',p=>{p.typeIndex=-1.5;}],
  ['road type below int32',p=>{p.roadType=-2147483649;}],
  ['fractional road type',p=>{p.roadType=1.5;}],
  ['nonfinite coordinate',p=>{p.node0Position[0]=Infinity;}],
  ['coordinate outside bound',p=>{p.node0Position[1]=1_000_001;}],
  ['negative zero',p=>{p.tangent0[0]=-0;}],
  ['sparse vector',p=>{p.tangent1=[];p.tangent1.length=3;p.tangent1[1]=1;p.tangent1[2]=2;}],
  ['extra payload field',p=>{p.edgeEntity=28753;}],
  ['unsafe template traversal',p=>{p.roadTemplate='::/infrastructure/street/../unsafe.street_template';}],
  ['wrong resource suffix',p=>{p.roadStyle='::/infrastructure/street/town/town_old.street_template';}],
  ['oversized resource',p=>{p.roadStyle='::/infrastructure/street/'+('a'.repeat(240))+'.street';}],
])test(`road segment identity rejects ${name}`,()=>{
  const p=fixture();change(p);assert.throws(()=>parseRoadSegmentRemoveOrderPayload(p,15702));
});

test('flat decoder binds company from explicit authenticated argument, rejects extra fields, noncanonical numbers, and malformed chunks',()=>{
  const wire=encodeRoadSegmentRemoveFlat(fixture(),15702);
  assert.equal(decodeRoadSegmentRemoveFlat(wire,28619).companyEntity,28619);
  assert.throws(()=>decodeRoadSegmentRemoveFlat({...wire,companyEntity:15702},15702));
  for(const text of ['01','1.0','1e0','-0','NaN','Infinity']){
    const changed={...wire,node0PositionXText:text};
    assert.throws(()=>decodeRoadSegmentRemoveFlat(changed,15702));
  }
  const extra={...wire,resourceTemplate5:'00'};
  assert.throws(()=>decodeRoadSegmentRemoveFlat(extra,15702));
  for(const chunk of ['AABB','ab-cd','0','0'.repeat(130)]){
    const changed={...wire,resourceTemplate1:chunk};
    assert.throws(()=>decodeRoadSegmentRemoveFlat(changed,15702));
  }
  const badCount={...wire,resourceStyleCount:5};
  assert.throws(()=>decodeRoadSegmentRemoveFlat(badCount,15702));
});

test('signed int32 typeIndex and roadType values round trip without coercion',()=>{
  const input=fixture();input.typeIndex=-2147483648;input.roadType=2147483647;
  const parsed=parseRoadSegmentRemoveOrderPayload(input,15702);
  const wire=encodeRoadSegmentRemoveFlat(input,15702);
  assert.equal(wire.typeIndexText,'-2147483648');
  assert.equal(wire.roadTypeText,'2147483647');
  assert.deepEqual(decodeRoadSegmentRemoveFlat({...wire},15702),input);
  assert.equal(parsed.typeIndex,input.typeIndex);
  assert.equal(parsed.roadType,input.roadType);
});

test('signed geometry wire survives real flat userdata IPC parsing and round trips',()=>{
  const wire=encodeRoadSegmentRemoveFlat(fixture(),15702);
  const envelope={schemaVersion:1,nonce:'0123456789abcdef0123456789abcdef',
    roundId:'1f1550e7-b12f-4b53-b722-34d24b7c92be',operationId:'390c4cd6-cd0b-4033-b3ba-450b1eab3372',
    operation:'executeHeld',protocolVersion:1,hostSequence:1,scheduledUpdate:2243,
    originPlayerId:'468e24bc-ba99-4dae-b1df-116bd14005de',companyEntity:15702,
    entity:28753,commandType:'road.segment.remove',clientSequence:1,
    requestMessageId:'06b15b76-acd7-4f0c-a89f-8aed53ab8113',...wire};
  const parsed=parseFlatDataFile(flatLua(envelope));
  const payloadFlat=Object.fromEntries(Object.keys(wire).map(key=>[key,parsed[key]]));
  assert.deepEqual(decodeRoadSegmentRemoveFlat(payloadFlat,parsed.companyEntity),fixture());
});

test('flat resource encoding round trips UTF-8 and enforces bounded canonical chunks',()=>{
  const input=fixture();input.roadStyle='::/infrastructure/street/'+('town/'.repeat(17))+'road.street';
  const wire=encodeRoadSegmentRemoveFlat(input,15702);
  assert.ok(wire.resourceStyleCount>1);
  assert.deepEqual(decodeRoadSegmentRemoveFlat({...wire},15702),input);
  const broken={...wire,resourceStyle2:wire.resourceStyle2.toUpperCase()};
  assert.throws(()=>decodeRoadSegmentRemoveFlat(broken,15702));
});

test('maximum legal resources and common coordination fields remain under userdata IPC limit',()=>{
  const templatePrefix='::/infrastructure/street/';
  const templateSuffix='.street_template';
  const styleSuffix='.street';
  const maximal=fixture();
  maximal.node0Position=[-999999.9999999999,999999.9999999999,-999999.9999999999];
  maximal.node1Position=[999999.9999999999,-999999.9999999999,999999.9999999999];
  maximal.tangent0=[-999999.9999999999,999999.9999999999,-999999.9999999999];
  maximal.tangent1=[999999.9999999999,-999999.9999999999,999999.9999999999];
  maximal.roadTemplate=templatePrefix+'a'.repeat(256-templatePrefix.length-templateSuffix.length)+templateSuffix;
  maximal.roadStyle=templatePrefix+'b'.repeat(256-templatePrefix.length-styleSuffix.length)+styleSuffix;
  const flat=encodeRoadSegmentRemoveFlat(maximal,15702);
  const common={schemaVersion:1,nonce:'0123456789abcdef0123456789abcdef',
    roundId:'1f1550e7-b12f-4b53-b722-34d24b7c92be',operationId:'390c4cd6-cd0b-4033-b3ba-450b1eab3372',
    operation:'executeHeld',protocolVersion:1,hostSequence:2147483647,scheduledUpdate:2147483647,
    originPlayerId:'468e24bc-ba99-4dae-b1df-116bd14005de',companyEntity:15702,
    entity:2147483647,commandType:'road.segment.remove',clientSequence:2147483647,
    requestMessageId:'06b15b76-acd7-4f0c-a89f-8aed53ab8113'};
  const serialized=flatLua({...common,...flat});
  assert.ok(Buffer.byteLength(serialized,'utf8')<MAX_USERDATA_IPC_BYTES);
  const parsed=parseFlatDataFile(serialized);
  const payloadFlat=Object.fromEntries(Object.keys(flat).map(key=>[key,parsed[key]]));
  assert.deepEqual(decodeRoadSegmentRemoveFlat(payloadFlat,parsed.companyEntity),maximal);
});
