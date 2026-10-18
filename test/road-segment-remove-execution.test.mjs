import assert from 'node:assert/strict';
import test from 'node:test';
import {decodeRoadSegmentRemoveExecutionReceipt as decode} from '../src/coordinator-road-segment-remove-execution.mjs';

const receipt=()=>({schemaVersion:1,nonce:'a'.repeat(32),roundId:'round',operationId:'execute',
  operation:'executeHeld',status:'ok',updateCount:2243,held:true,snapshotVersion:15,hostSequence:1,
  entity:0,edgeEntity:28753,ownerCompanyEntity:15702,preparedEffectHash:'b'.repeat(64),
  edgeRemoved:true,removedNodeCount:1,nodeConfigurationsMatched:true,survivingEdgesMatched:true,
  removedNodesAbsent:true,topologyMatched:true,cost:300,negativeCost:0,companyCount:2,
  company1:15702,balanceBefore1:19892131,negativeBefore1:0,balanceAfter1:19891831,negativeAfter1:0,
  company2:28619,balanceBefore2:0,negativeBefore2:0,balanceAfter2:0,negativeAfter2:0});

test('native road-removal charge and refund require borrower-only exact accounting',()=>{
  const charged=decode(receipt());
  assert.equal(charged.state.removedRoad.signedCost,300);
  const refund={...receipt(),negativeCost:1,balanceAfter1:19892431};
  assert.equal(decode(refund).state.removedRoad.signedCost,-300);
  assert.throws(()=>decode({...refund,balanceAfter2:300}));
  assert.throws(()=>decode({...receipt(),balanceAfter1:19892131}));
  assert.throws(()=>decode({...receipt(),company1:9999}));
});
test('local IDs are evidence; semantic effects, accounting and update determine paired hash',()=>{
  const a=decode(receipt()),b=decode({...receipt(),edgeEntity:999});
  assert.equal(a.receipt.stateHash,b.receipt.stateHash);
  assert.notEqual(a.localEvidence.edgeEntity,b.localEvidence.edgeEntity);
  for(const change of [{preparedEffectHash:'c'.repeat(64)},{removedNodeCount:0},{updateCount:2244}])
    assert.notEqual(a.receipt.stateHash,decode({...receipt(),...change}).receipt.stateHash);
});
test('strict flat receipt rejects incomplete, guessed and noncanonical execution evidence',()=>{
  for(const change of [{status:'unknown'},{edgeRemoved:false},{snapshotVersion:14},{entity:28753},
    {edgeEntity:0},{removedNodeCount:2},{preparedEffectHash:'B'.repeat(64)},
    {nodeConfigurationsMatched:false},{survivingEdgesMatched:false},{removedNodesAbsent:false},{topologyMatched:false},
    {nativeAuthorizationVerified:true},{negativeBefore2:1},{company2:15702},
    {cost:0,negativeCost:1},{cost:Number.MAX_SAFE_INTEGER+1}])
    assert.throws(()=>decode({...receipt(),...change}));
  const missing=receipt();delete missing.edgeRemoved;assert.throws(()=>decode(missing));
});
