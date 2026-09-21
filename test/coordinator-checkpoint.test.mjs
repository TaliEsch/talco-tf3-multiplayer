import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { decodeCheckpointReceipt } from '../src/coordinator-checkpoint.mjs';
import { createAsyncEngineMailbox } from '../src/async-engine-mailbox.mjs';
const fixture=()=>({schemaVersion:1,nonce:'a'.repeat(32),roundId:'r',operationId:'hold',operation:'holdCheckpoint',
  status:'ok',updateCount:100,held:true,snapshotVersion:1,companyCount:2,company1:7,balance1:1000,negative1:0,company2:9,balance2:50,negative2:1});
const domains=['townsGrowth','economy','topology','vehicles','companies','linesServices','rngHiddenState'];
const worldFixture=()=>Object.assign({...fixture(),snapshotVersion:2},...domains.flatMap((domain,index)=>[
  {[`${domain}Status`]:'observed'}, {[`${domain}Hash`]:String(index+1).repeat(64)}]));

test('checkpoint digest derives from observed scoped state, not company order or expected hash',()=>{
  const p=fixture(),first=decodeCheckpointReceipt(p);
  assert.equal(first.state.scope,'held_company_balances_v1');
  assert.equal(first.state.companies[1].balance,-50);
  const swapped={...p,company1:9,balance1:50,negative1:1,company2:7,balance2:1000,negative2:0};
  assert.equal(decodeCheckpointReceipt(swapped).receipt.checkpointHash,first.receipt.checkpointHash);
  for(const change of [{balance1:999},{updateCount:101},{company2:10}])
    assert.notEqual(decodeCheckpointReceipt({...p,...change}).receipt.checkpointHash,first.receipt.checkpointHash);
  for(const change of [{checkpointHash:'b'.repeat(64)},{held:false},{company2:7},{balance1:NaN},{balance1:0,negative1:1},{companyCount:5},{snapshotVersion:3}])
    assert.throws(()=>decodeCheckpointReceipt({...p,...change}));
});

test('production checkpoint digest includes every game-produced world domain and explicit blind spots',()=>{
  const p=worldFixture(),first=decodeCheckpointReceipt(p);
  assert.equal(first.state.scope,'held_canonical_world_v2');
  assert.equal(first.coverage.complete,true);
  for(const domain of domains)assert.notEqual(decodeCheckpointReceipt({...p,[`${domain}Hash`]:'f'.repeat(64)}).receipt.checkpointHash,first.receipt.checkpointHash);
  const blind={...p,rngHiddenStateStatus:'unavailable',rngHiddenStateHash:'unavailable'};
  const parsed=decodeCheckpointReceipt(blind);
  assert.equal(parsed.coverage.complete,false);assert.deepEqual(parsed.coverage.unavailable,['rngHiddenState']);
  assert.throws(()=>decodeCheckpointReceipt({...blind,rngHiddenStateHash:'read_failed'}));
});

test('production mailbox fails closed before participant receipt when canonical coverage is incomplete',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-checkpoint-'));
  const dir=path.join(root,'tf3mp_status_1');await mkdir(dir);let mailbox;
  try {
    const p={...worldFixture(),rngHiddenStateStatus:'unavailable',rngHiddenStateHash:'unavailable'};
    mailbox=await createAsyncEngineMailbox({directory:dir,nonce:p.nonce,requireCompleteCheckpointCoverage:true});
    await writeFile(path.join(dir,'coordination_receipt.lua'),`function data() return {${Object.entries(p).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`);
    let receipt;await mailbox.poll({receiveEngine:value=>{receipt=value;return false;}});
    assert.equal(receipt.status,'unknown');assert.equal(receipt.checkpointHash,undefined);
  } finally {await mailbox?.close();await rm(root,{recursive:true,force:true});}
});

test('legacy checkpoint scope remains an explicit local diagnostic option',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-checkpoint-'));
  const dir=path.join(root,'tf3mp_status_1');await mkdir(dir);let mailbox;
  try {
    const p=fixture();mailbox=await createAsyncEngineMailbox({directory:dir,nonce:p.nonce,requireCompleteCheckpointCoverage:false});
    await writeFile(path.join(dir,'coordination_receipt.lua'),`function data() return {${Object.entries(p).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`);
    let receipt;await mailbox.poll({receiveEngine:value=>{receipt=value;return true;}});
    assert.match(receipt.checkpointHash,/^[a-f0-9]{64}$/);
  } finally {await mailbox?.close();await rm(root,{recursive:true,force:true});}
});

test('actual mailbox hashes raw engine receipt independently of the published expectation',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-checkpoint-'));
  const dir=path.join(root,'tf3mp_status_1');await mkdir(dir);
  let mailbox;
  try {
    const p=fixture();mailbox=await createAsyncEngineMailbox({directory:dir,nonce:p.nonce});
    await mailbox.publish({schemaVersion:1,roundId:'r',operationId:'hold',operation:'holdCheckpoint',updateCount:100,checkpointHash:'f'.repeat(64)});
    await writeFile(path.join(dir,'coordination_receipt.lua'),`function data() return {${Object.entries(p).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`);
    let receipt;
    await mailbox.poll({receiveEngine:p=>{receipt=p;return true;}});
    assert.equal(receipt.checkpointHash,decodeCheckpointReceipt(p).receipt.checkpointHash);
    assert.notEqual(receipt.checkpointHash,'f'.repeat(64));
    assert.equal(receipt.nonce,undefined);
    assert.equal(receipt.balance1,undefined);
    const echo={schemaVersion:1,nonce:p.nonce,roundId:'r',operationId:'hold',operation:'holdCheckpoint',status:'ok',updateCount:100,held:true,checkpointHash:'f'.repeat(64)};
    await writeFile(path.join(dir,'coordination_receipt.lua'),`function data() return {${Object.entries(echo).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`);
    await mailbox.poll({receiveEngine:p=>{receipt=p;return false;}});
    assert.equal(receipt.status,'unknown');
  } finally {await mailbox?.close();await rm(root,{recursive:true,force:true});}
});
