import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {decodeDepotExecutionReceipt} from '../src/coordinator-depot-execution.mjs';
import {createAsyncEngineMailbox} from '../src/async-engine-mailbox.mjs';
import {ROAD_DEPOT_RESOURCE} from '../src/depot-build-order-payload.mjs';

const raw={schemaVersion:1,nonce:'a'.repeat(32),roundId:'round',operationId:'execute',
  operation:'executeHeld',status:'ok',updateCount:108,held:true,snapshotVersion:3,
  hostSequence:1,entity:0,ownerCompanyEntity:55652,constructionEntity:123,
  depotEntity:124,chargedCost:449160,balance:550840,negative:0};

test('depot digest binds observed construction, depot, native charge and target balance',()=>{
  const observed=decodeDepotExecutionReceipt(raw);
  assert.equal(observed.state.scope,'held_stock_road_depot_company_balance_v1');
  assert.equal(observed.state.company.balance,550840);
  for(const change of [{constructionEntity:125},{depotEntity:125},{chargedCost:449161},
    {balance:550841},{ownerCompanyEntity:3141},{updateCount:109},{hostSequence:2}])
    assert.notEqual(decodeDepotExecutionReceipt({...raw,...change}).receipt.stateHash,
      observed.receipt.stateHash);
  assert.equal(decodeDepotExecutionReceipt({...raw,balance:10,negative:1}).state.company.balance,-10);
});

test('depot execution receipt rejects partial, unheld and implausible claims',()=>{
  for(const change of [{held:false},{status:'unknown'},{snapshotVersion:2},
    {entity:1},{chargedCost:0},{depotEntity:123},{constructionEntity:0},
    {negative:2},{balance:0,negative:1},{extra:1}])
    assert.throws(()=>decodeDepotExecutionReceipt({...raw,...change}));
});

test('mailbox accepts only scheduled sequence and mapped company from depot evidence',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-depot-execution-'));
  const directory=path.join(root,'tf3mp_status_1');await mkdir(directory);
  const evidence=[],delivered=[];
  const mailbox=await createAsyncEngineMailbox({directory,nonce:raw.nonce,
    enableDepotBuild:true,onExecutionEvidence:value=>evidence.push(value)});
  const command={protocolVersion:2,hostSequence:1,scheduledUpdate:108,
    originPlayerId:'player-b',targetCompanyEntity:55652,targetEntity:0,
    commandType:'road.depot.build',payload:{companyEntity:55652,resource:ROAD_DEPOT_RESOURCE,
      x:-812.891541,y:-3142.25684,z:23.3068237,yaw:Math.PI,seed:1},
    clientSequence:1,requestMessageId:'depot-11'};
  const file=path.join(directory,'coordination_receipt.lua');
  const poll=async value=>{
    await writeFile(file,`function data() return {${Object.entries(value)
      .map(([key,item])=>`${key}=${JSON.stringify(item)},`).join('')}} end`);
    return mailbox.poll({receiveEngine:receipt=>{delivered.push(receipt);return true;}});
  };
  try{
    await mailbox.publish({schemaVersion:1,roundId:'round',operationId:'execute',
      operation:'executeHeld',command});
    await poll({...raw,hostSequence:2});
    assert.equal(delivered.at(-1).status,'unknown');assert.equal(evidence.length,0);
    await poll({...raw,ownerCompanyEntity:3141});
    assert.equal(delivered.at(-1).status,'unknown');assert.equal(evidence.length,0);
    await poll(raw);
    assert.equal(evidence.length,1);
    assert.equal(delivered.at(-1).stateHash,decodeDepotExecutionReceipt(raw).receipt.stateHash);
  }finally{await mailbox.close();await rm(root,{recursive:true,force:true});}
});
