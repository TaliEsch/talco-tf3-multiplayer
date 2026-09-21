import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRoadStopReadbackEnvelope as parse,ROAD_STOP_READBACK_MAX_BYTES} from '../src/road-stop-readback.mjs';
import {sha256Canonical} from '../src/canonical.mjs';

const nonce='a'.repeat(32);
const readback=()=>({schemaVersion:1,kind:'road_stop_readback',nonce,observationId:3,companyEntity:1,updateCount:0,tickCount:2,stopEntity:4,edgeEntity:5,param:.5,
  transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],constructionResource:'construction/road.stop',
  oneWay:true,name:'Observed stop',left:false,
  params:{kind:'table',entries:[{keyType:'string',key:'name',value:{kind:'string',value:'Main'}},{keyType:'number',key:2,value:{kind:'boolean',value:true}}]}});
const source=(value=readback())=>`function data() return {schemaVersion=1,kind='road_stop_readback',nonce='${nonce}',observationId=3,snapshotHex='${Buffer.from(JSON.stringify(value)).toString('hex')}',} end`;

test('strict road-stop readback envelope is inert and canonically normalizes params',()=>{
  const result=parse(source());
  assert.equal(result.executionAuthorized,false);
  assert.deepEqual(result.snapshot.params.entries.map(entry=>entry.key),[2,'name']);
  assert.deepEqual({oneWay:result.snapshot.oneWay,name:result.snapshot.name,left:result.snapshot.left},{oneWay:true,name:'Observed stop',left:false});
  assert.equal(result.digest,sha256Canonical(result.snapshot));
  assert.deepEqual(parse(source().replaceAll("'",'"')).snapshot,result.snapshot);
});

test('readback rejects envelope execution, bounds, identity mismatch and duplicate fields',()=>{
  for(const value of [source()+' os.execute(\'x\')',source().replace('return {','return {nonce=\'b\',') ,source().replace("nonce='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'","nonce='A'.repeat(32)"),
    source().replace('observationId=3','observationId=0'),source().replace("snapshotHex='","snapshotHex='g"), ' '.repeat(ROAD_STOP_READBACK_MAX_BYTES+1),
    source({...readback(),nonce:'b'.repeat(32)}),source({...readback(),params:{kind:'table',entries:[{keyType:'string',key:'x',value:{kind:'table',entries:[{keyType:'string',key:'y',value:{kind:'table',entries:[{keyType:'string',key:'z',value:{kind:'table',entries:[{keyType:'string',key:'w',value:{kind:'table',entries:[{keyType:'string',key:'q',value:{kind:'number',value:1}}]}}]}}]}}]}}]}})])
    assert.throws(()=>parse(value),/^TypeError: INVALID_ROAD_STOP_READBACK$/);
});

test('readback rejects duplicate JSON keys, typed-key duplicates and unsafe values',()=>{
  const json=JSON.stringify(readback()).replace('"companyEntity":1','"companyEntity":1,"companyEntity":2');
  const duplicateKeys={...readback(),params:{kind:'table',entries:[{keyType:'number',key:1,value:{kind:'number',value:1}},{keyType:'number',key:1,value:{kind:'number',value:2}}]}};
  const unsafe={...readback(),params:{kind:'number',value:9007199254740992}};
  const malformed=json.replace('"param":0.5','"param":x0.5');
  let deeplyNested={kind:'number',value:1};for(let index=0;index<70;index++)deeplyNested={kind:'table',entries:[{keyType:'string',key:'n',value:deeplyNested}]};
  for(const value of [`function data() return {schemaVersion=1,kind='road_stop_readback',nonce='${nonce}',observationId=3,snapshotHex='${Buffer.from(json).toString('hex')}',} end`,
    `function data() return {schemaVersion=1,kind='road_stop_readback',nonce='${nonce}',observationId=3,snapshotHex='${Buffer.from(malformed).toString('hex')}',} end`,source(duplicateKeys),source(unsafe),source({...readback(),params:{kind:'number',value:1}}),source({...readback(),params:deeplyNested}),source({...readback(),constructionResource:'construction/../stop'}),source({...readback(),oneWay:1}),source({...readback(),left:'false'}),source({...readback(),name:'x'.repeat(1025)})])
    assert.throws(()=>parse(value),/^TypeError: INVALID_ROAD_STOP_READBACK$/);
});
