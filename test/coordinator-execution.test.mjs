import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { decodeExecutionReceipt } from '../src/coordinator-execution.mjs';
import { createAsyncEngineMailbox } from '../src/async-engine-mailbox.mjs';

const fixture = () => ({schemaVersion:1,nonce:'a'.repeat(32),roundId:'round',operationId:'execute:1',
  operation:'executeHeld',status:'ok',updateCount:100,held:true,snapshotVersion:1,
  hostSequence:1,entity:42,ownerCompanyEntity:7,stopFlag:1,balance:100,negative:0});

test('execution digest covers observed action, ownership, finances and exact held update',()=>{
  const p=fixture(), result=decodeExecutionReceipt(p);
  assert.equal(result.state.scope,'held_vehicle_company_balance_v1');
  assert.equal(result.state.vehicle.stopped,true);
  for(const change of [{entity:43},{ownerCompanyEntity:8},{stopFlag:0},{balance:101},{negative:1},{updateCount:101},{hostSequence:2}])
    assert.notEqual(decodeExecutionReceipt({...p,...change}).receipt.stateHash,result.receipt.stateHash);
  assert.equal(decodeExecutionReceipt({...p,operationId:'other',nonce:'b'.repeat(32)}).receipt.stateHash,result.receipt.stateHash);
  assert.equal(decodeExecutionReceipt({...p,negative:1}).state.company.balance,-100);
});

test('execution evidence rejects fabricated hashes, malformed states and unheld observations',()=>{
  for(const change of [{stateHash:'f'.repeat(64)},{held:false},{snapshotVersion:2},{stopFlag:2},
    {hostSequence:0},{entity:-1},{ownerCompanyEntity:NaN},{balance:Infinity},{balance:-0},
    {balance:0,negative:1},{balance:1.5},{negative:2},{nonce:42},{operationId:''},{status:'unknown'}])
    assert.throws(()=>decodeExecutionReceipt({...fixture(),...change}));
});

test('mailbox translates raw execution evidence and fails closed on digest-only acknowledgments',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-execution-'));
  const directory=path.join(root,'tf3mp_status_1');await mkdir(directory);
  let mailbox;
  try {
    const p=fixture(),evidence=[];mailbox=await createAsyncEngineMailbox({directory,nonce:p.nonce,
      onExecutionEvidence:result=>evidence.push(result)});
    let observed;
    const poll=async value=>{
      await writeFile(path.join(directory,'coordination_receipt.lua'),`function data() return {${Object.entries(value).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`);
      return mailbox.poll({receiveEngine:r=>{observed=r;return true;}});
    };
    await poll(p);
    assert.equal(observed.status,'unknown');
    await mailbox.publish({schemaVersion:1,roundId:p.roundId,operationId:p.operationId,
      operation:'executeHeld',command:{protocolVersion:2,hostSequence:1,scheduledUpdate:100,
        originPlayerId:'host',targetCompanyEntity:7,targetEntity:42,
        commandType:'vehicle.setRunning',payload:{running:false},clientSequence:0,
        requestMessageId:'request:1'}});
    await poll(p);
    assert.equal(observed.stateHash,decodeExecutionReceipt(p).receipt.stateHash);
    assert.equal(evidence.length,1);
    assert.deepEqual(evidence[0].state.vehicle,{entity:42,ownerCompanyEntity:7,stopped:true});
    assert.equal(evidence[0].receipt.stateHash,observed.stateHash);
    assert.equal(observed.nonce,undefined);
    assert.equal(observed.balance,undefined);
    await poll({...decodeExecutionReceipt(p).receipt});
    assert.equal(observed.status,'unknown');
    await poll({...p,held:false});
    assert.equal(observed.status,'unknown');
    for(const change of [{entity:43},{ownerCompanyEntity:8},{stopFlag:0},
      {updateCount:101},{hostSequence:2},{operationId:'other'}]){
      await poll({...p,...change});
      assert.equal(observed.status,'unknown');
    }
    assert.equal(evidence.length,1,'rejected postconditions cannot appear as execution evidence');
  } finally {await mailbox?.close();await rm(root,{recursive:true,force:true});}
});
