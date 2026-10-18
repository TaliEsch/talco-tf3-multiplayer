import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDepotRemoveOrderPayload} from '../src/depot-remove-order-payload.mjs';

const payload={companyEntity:10,depotEntity:501};

test('copies the authorized depot removal scalars and freezes the parsed payload',()=>{
  const original={...payload};
  const parsed=parseDepotRemoveOrderPayload(original,10,501);
  original.depotEntity=502;
  assert.deepEqual(parsed,payload);
  assert.equal(Object.isFrozen(parsed),true);
});

test('requires exact target, company authority, and the exact plain object shape',()=>{
  for(const candidate of [
    {...payload,companyEntity:11},{...payload,depotEntity:502},{...payload,extra:1},
    Object.assign(Object.create(null),payload),[],
  ])assert.throws(()=>parseDepotRemoveOrderPayload(candidate,10,501),
    /INVALID_DEPOT_REMOVE_ORDER_PAYLOAD/);
  assert.throws(()=>parseDepotRemoveOrderPayload(payload,11,501),/INVALID_DEPOT_REMOVE_ORDER_PAYLOAD/);
  assert.throws(()=>parseDepotRemoveOrderPayload(payload,10,502),/INVALID_DEPOT_REMOVE_ORDER_PAYLOAD/);
  for(const bad of [0,-1,2147483648,1.5,NaN])
    assert.throws(()=>parseDepotRemoveOrderPayload({...payload,depotEntity:bad},10,501),
      /INVALID_DEPOT_REMOVE_ORDER_PAYLOAD/);
});
