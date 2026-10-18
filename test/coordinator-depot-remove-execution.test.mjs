import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Canonical} from '../src/canonical.mjs';
import {decodeDepotRemoveExecutionReceipt} from '../src/coordinator-depot-remove-execution.mjs';

function receipt({companies=[{id:10,before:1000,after:1000},{id:20,before:500,after:500}],
  cost=0,negativeCost=0,depotRemoved=true,constructionRemoved=true}={}){
  const p={schemaVersion:1,nonce:'a'.repeat(32),roundId:'round-1',operationId:'operation-1',
    operation:'executeHeld',status:'ok',updateCount:34,held:true,snapshotVersion:14,
    hostSequence:7,entity:501,depotEntity:501,constructionEntity:701,ownerCompanyEntity:10,
    depotRemoved,constructionRemoved,cost,negativeCost,companyCount:companies.length};
  companies.forEach((company,index)=>{
    const i=index+1,beforeNegative=company.before<0?1:0,afterNegative=company.after<0?1:0;
    p[`company${i}`]=company.id;p[`balanceBefore${i}`]=Math.abs(company.before);
    p[`negativeBefore${i}`]=beforeNegative;p[`balanceAfter${i}`]=Math.abs(company.after);
    p[`negativeAfter${i}`]=afterNegative;
  });
  return p;
}

test('decodes charge, refund, zero, and two to four company accounting',()=>{
  for(const [input,signedCost,after] of [
    [receipt({cost:75,companies:[{id:10,before:1000,after:925},{id:20,before:500,after:500}]}),75,925],
    [receipt({cost:60,negativeCost:1,companies:[{id:10,before:1000,after:1060},{id:20,before:500,after:500}]}),-60,1060],
    [receipt(),0,1000],
    [receipt({companies:[{id:10,before:1000,after:1000},{id:20,before:500,after:500},
      {id:30,before:-25,after:-25},{id:40,before:0,after:0}]}),0,1000],
  ]){
    const decoded=decodeDepotRemoveExecutionReceipt(input);
    assert.equal(decoded.state.scope,'held_road_depot_remove_v1');
    assert.equal(decoded.state.removedDepot.signedCost,signedCost);
    assert.deepEqual(decoded.state.removedDepot,{depotEntity:501,constructionEntity:701,
      ownerCompanyEntity:10,signedCost});
    assert.equal(decoded.state.accounting.companies[0].balanceAfter,after);
    assert.equal(decoded.receipt.stateHash,sha256Canonical(decoded.state));
  }
});

test('rejects company deltas, overflow, duplicate or unsorted rosters, and noncanonical signs',()=>{
  for(const input of [
    receipt({cost:10}),
    receipt({cost:1,negativeCost:1,companies:[{id:10,before:Number.MAX_SAFE_INTEGER,after:Number.MAX_SAFE_INTEGER},{id:20,before:500,after:500}]}),
    receipt({companies:[{id:10,before:1,after:1},{id:10,before:2,after:2}]}),
    receipt({negativeCost:1}),
    receipt({companies:[{id:10,before:0,after:0},{id:20,before:-1,after:0}]}),
  ])assert.throws(()=>decodeDepotRemoveExecutionReceipt(input),/INVALID_DEPOT_REMOVE_EXECUTION_RECEIPT/);
});

test('requires exact fields, target identity, and both observed removal flags',()=>{
  for(const input of [
    {...receipt(),unexpected:1},
    {...receipt(),entity:502},
    {...receipt(),depotEntity:502},
    {...receipt(),constructionEntity:501},
    {...receipt(),depotRemoved:false},
    {...receipt(),constructionRemoved:false},
    {...receipt(),snapshotVersion:13},
  ])assert.throws(()=>decodeDepotRemoveExecutionReceipt(input),/INVALID_DEPOT_REMOVE_EXECUTION_RECEIPT/);
});
