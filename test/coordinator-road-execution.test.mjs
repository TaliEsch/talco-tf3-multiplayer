import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {decodeRoadExecutionReceipt} from '../src/coordinator-road-execution.mjs';
import {createAsyncEngineMailbox} from '../src/async-engine-mailbox.mjs';
import {ROAD_STOP_MODEL} from '../src/road-stop-order-payload.mjs';

const raw={schemaVersion:1,nonce:'a'.repeat(32),roundId:'round',operationId:'execute',
  operation:'executeHeld',status:'ok',updateCount:108,held:true,snapshotVersion:2,
  hostSequence:1,entity:53417,ownerCompanyEntity:3141,stopEntity:73312,
  roadEntity:73313,chargedCost:46348,balance:53652,negative:0};
test('road execution digest binds native stop, replacement road, charge and held clock',()=>{
  const observed=decodeRoadExecutionReceipt(raw);
  assert.equal(observed.state.scope,'held_road_stop_company_balance_v1');
  assert.equal(observed.state.company.balance,53652);
  for(const change of [{stopEntity:73314},{roadEntity:73314},{chargedCost:46349},
    {balance:53653},{ownerCompanyEntity:3142},{updateCount:109},{hostSequence:2}])
    assert.notEqual(decodeRoadExecutionReceipt({...raw,...change}).receipt.stateHash,
      observed.receipt.stateHash);
});
test('road execution receipt rejects partial, unheld and self-referential claims',()=>{
  for(const change of [{held:false},{status:'unknown'},{snapshotVersion:1},
    {roadEntity:53417},{chargedCost:0},{stopEntity:0},{negative:2},{extra:1}])
    assert.throws(()=>decodeRoadExecutionReceipt({...raw,...change}));
});
test('mailbox accepts only the scheduled road and bound company from raw engine evidence',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-road-execution-'));
  const directory=path.join(root,'tf3mp_status_1');await mkdir(directory);
  const evidence=[];const delivered=[];
  const mailbox=await createAsyncEngineMailbox({directory,nonce:raw.nonce,
    onExecutionEvidence:value=>evidence.push(value)});
  const command={protocolVersion:2,hostSequence:1,scheduledUpdate:108,
    originPlayerId:'player-a',targetCompanyEntity:3141,targetEntity:53417,
    commandType:'road.stop.place',payload:{edgeEntity:53417,companyEntity:3141,
      param:0.5,left:true,oneWay:false,model:ROAD_STOP_MODEL,name:'Road Stop'},
    clientSequence:1,requestMessageId:'road-11'};
  const file=path.join(directory,'coordination_receipt.lua');
  const poll=async value=>{
    await writeFile(file,`function data() return {${Object.entries(value)
      .map(([key,item])=>`${key}=${JSON.stringify(item)},`).join('')}} end`);
    return mailbox.poll({receiveEngine:receipt=>{delivered.push(receipt);return true;}});
  };
  try{
    await mailbox.publish({schemaVersion:1,roundId:'round',operationId:'execute',
      operation:'executeHeld',command});
    await poll({...raw,entity:53418});
    assert.equal(delivered.at(-1).status,'unknown');assert.equal(evidence.length,0);
    await poll({...raw,ownerCompanyEntity:3142});
    assert.equal(delivered.at(-1).status,'unknown');assert.equal(evidence.length,0);
    await poll(raw);
    assert.equal(evidence.length,1);
    assert.equal(delivered.at(-1).stateHash,decodeRoadExecutionReceipt(raw).receipt.stateHash);
  }finally{await mailbox.close();await rm(root,{recursive:true,force:true});}
});
