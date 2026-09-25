import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRoadStopOrderPayload,ROAD_STOP_MODEL} from '../src/road-stop-order-payload.mjs';

const payload={edgeEntity:53417,companyEntity:3141,param:0.5,left:true,oneWay:false,
  model:ROAD_STOP_MODEL,name:'TalCo Road Stop'};

test('copies the observed TF3 road Stop command without accepting later mutation',()=>{
  const original={...payload};
  const parsed=parseRoadStopOrderPayload(original,53417,3141);
  original.name='changed';
  assert.deepEqual(parsed,payload);
  assert.equal(Object.isFrozen(parsed),true);
});

test('road command binds the company and road and rejects extra or malformed fields',()=>{
  for(const candidate of [
    {...payload,edgeEntity:53418},{...payload,companyEntity:3142},
    {...payload,param:NaN},{...payload,param:Infinity},{...payload,param:-0.1},
    {...payload,param:1.1},{...payload,left:1},{...payload,oneWay:null},
    {...payload,model:'::/stations/street/small_stops/other.mdl'},
    {...payload,name:'bad\0name'},{...payload,name:'x'.repeat(1025)},
    {...payload,name:'é'.repeat(513)},{...payload,name:'\uD800'},
    {...payload,chargedCost:1},Object.assign(Object.create(null),payload),
  ]) assert.throws(()=>parseRoadStopOrderPayload(candidate,53417,3141),/INVALID_ROAD_STOP_ORDER_PAYLOAD/);
  assert.throws(()=>parseRoadStopOrderPayload(payload,53418,3141),/INVALID_ROAD_STOP_ORDER_PAYLOAD/);
  assert.throws(()=>parseRoadStopOrderPayload(payload,53417,3142),/INVALID_ROAD_STOP_ORDER_PAYLOAD/);
});
