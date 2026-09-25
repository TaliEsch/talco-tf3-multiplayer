import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOrderedDepotReadback} from '../src/ordered-depot-readback.mjs';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startGameBridge} from '../src/game-bridge.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';

const request={schemaVersion:1,kind:'ordered_depot_readback_request',nonce:'a'.repeat(32),
  requestId:4,hostSequence:1,company:55652,localCompany:3141,construction:123,
  depot:124,update:108,balance:449160,balanceNegative:1,
  localBalance:40000000,localBalanceNegative:0,charge:449160};
const reply={...request,kind:'ordered_depot_readback_receipt',code:'observed'};
const lua=p=>`function data() return {${Object.entries(p).map(([key,value])=>`${key}=${JSON.stringify(value)},`).join('')}} end`;

test('ordered depot readback accepts only the exact held-world receipt',()=>{
  assert.deepEqual(parseOrderedDepotReadback(lua(reply),request),reply);
  for(const changed of [{depot:125},{construction:125},{company:3141},
    {balance:449159},{localBalance:39999999},{charge:449159},
    {hostSequence:2},{update:109},{extra:1}])
    assert.throws(()=>parseOrderedDepotReadback(lua({...reply,...changed}),request));
});
test('bounded unknown depot stages remain unknown',()=>{
  const unknown={schemaVersion:1,kind:'ordered_depot_readback_receipt',code:'unknown',
    nonce:request.nonce,requestId:request.requestId,stage:'construction'};
  assert.equal(parseOrderedDepotReadback(lua(unknown),request).code,'unknown');
  assert.throws(()=>parseOrderedDepotReadback(lua({...unknown,stage:'apply'}),request));
});

test('bridge publishes bounded held depot query and removes it after a matching reply',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-depot-readback-'));
  const directory=path.join(root,'tf3mp_status_1');
  const bridge=await startGameBridge({directory,intervalMs:5});
  const until=async predicate=>{for(let i=0;i<200;i++){
    if(await predicate())return;
    await new Promise(resolve=>setTimeout(resolve,5));
  }assert.fail('depot readback timed out');};
  const publishObservation=async(speedup,tickCount)=>{
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',
      nonce:bridge.nonce,counter:tickCount,tickCount,updateCount:108}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,
      kind:'engine_observation',nonce:bridge.nonce,counter:tickCount,tickCount,
      updateCount:108,speedup,companyEntity:3141,balance:40000000,balanceKnown:1,balanceNegative:0}));
  };
  try{
    await publishObservation(1,100);
    await until(()=>bridge.engineObservation.available);
    const lease=await bridge.startCoordinationLease({healthy:()=>true,onFailure:()=>{}});
    const arm=parseFlatDataFile(await readFile(path.join(directory,'watchdog_request.lua'),'utf8'));
    await writeFile(path.join(directory,'watchdog_receipt.lua'),lua({...arm,kind:'watchdog_receipt',
      lastTick:100,tickCount:100,updateCount:108,speedup:1,phase:'active',outcome:'armed',reason:'none'}));
    await until(()=>lease.active);
    await publishObservation(0,101);
    await until(()=>bridge.engineObservation.sample?.speedup===0);
    const awaiting=bridge.inspectOrderedDepotReadback({...request,balance:-449160,timeoutMs:1000});
    const file=path.join(directory,'ordered_depot_readback_request.lua');
    await until(async()=>{try{return (await readFile(file,'utf8')).includes('hostSequence = 1');}catch{return false;}});
    const issued=parseFlatDataFile(await readFile(file,'utf8'));
    assert.equal(issued.localBalance,40000000);
    assert.equal(issued.balanceNegative,1);
    await writeFile(path.join(directory,'ordered_depot_readback_receipt.lua'),lua({
      ...reply,nonce:bridge.nonce,requestId:issued.requestId}));
    assert.equal((await awaiting).code,'observed');
    await assert.rejects(readFile(file),{code:'ENOENT'});
  }finally{await bridge.close();await rm(root,{recursive:true,force:true});}
});
