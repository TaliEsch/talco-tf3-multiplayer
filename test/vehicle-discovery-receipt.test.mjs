import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';
import {parseVehicleDiscoveryReceipt} from '../src/vehicle-discovery-receipt.mjs';
import {startGameBridge} from '../src/game-bridge.mjs';

const nonce='a'.repeat(32);
const lua=p=>`function data() return {${Object.entries(p).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`;
const receipt=patch=>({schemaVersion:1,kind:'vehicle_discovery_receipt',nonce,requestId:1,
  company:7,entity:42,revision:3,stopFlag:1,tickCount:110,updateCount:50,outcome:'found',...patch});
async function until(predicate){for(let i=0;i<200;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,5));}assert.fail('timed out');}

test('discovery receipt requires exact identity and owned result shape',()=>{
  assert.equal(parseVehicleDiscoveryReceipt(lua(receipt()),{nonce,requestId:1,company:7}).entity,42);
  for(const patch of [{nonce:'b'.repeat(32)},{requestId:2},{company:8},{entity:-1},{revision:1.5},
    {stopFlag:2},{outcome:'owned'},{outcome:'missing'},{extra:1}])
    assert.throws(()=>parseVehicleDiscoveryReceipt(lua(receipt(patch)),{nonce,requestId:1,company:7}));
  assert.equal(parseVehicleDiscoveryReceipt(lua(receipt({outcome:'missing',entity:0,revision:0,stopFlag:0})),
    {nonce,requestId:1,company:7}).outcome,'missing');
  assert.throws(()=>parseVehicleDiscoveryReceipt(lua(receipt())+';os.execute("bad")',{nonce,requestId:1,company:7}));
});

test('bridge accepts one fresh paused engine ownership receipt and removes request',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-discovery-'));
  const directory=path.join(root,'tf3mp_status_1');
  const bridge=await startGameBridge({directory,intervalMs:5});
  try {
    await assert.rejects(bridge.discoverOwnedVehicle(),/PAUSED_FRESH_BRIDGE_OBSERVATION_REQUIRED/);
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:50}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,
      counter:1,tickCount:100,updateCount:50,speedup:0,companyEntity:7,balance:0,balanceKnown:1,balanceNegative:0}));
    await until(()=>bridge.engineObservation.available);
    const pending=bridge.discoverOwnedVehicle({timeoutMs:1000});
    await until(async()=>{try{return (await readFile(path.join(directory,'vehicle_discovery_request.lua'),'utf8')).includes('requestId = 1');}catch{return false;}});
    await assert.rejects(bridge.discoverOwnedVehicle(),/VEHICLE_DISCOVERY_BUSY/);
    const request=parseFlatDataFile(await readFile(path.join(directory,'vehicle_discovery_request.lua'),'utf8'));
    assert.equal(request.company,7);
    await writeFile(path.join(directory,'vehicle_discovery_receipt.lua'),lua(receipt({nonce:bridge.nonce,requestId:request.requestId})));
    const result=await pending;
    assert.equal(result.entity,42);
    await assert.rejects(readFile(path.join(directory,'vehicle_discovery_request.lua')),{code:'ENOENT'});
  } finally {await bridge.close();await rm(root,{recursive:true,force:true});}
});

test('targeted owner inspection binds entity, company and live update',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-target-owner-'));
  const directory=path.join(root,'tf3mp_status_1');
  const bridge=await startGameBridge({directory,intervalMs:5});
  try {
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,
      counter:1,tickCount:100,updateCount:50}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,
      counter:1,tickCount:100,updateCount:50,speedup:1,companyEntity:7,balance:0,balanceKnown:1,balanceNegative:0}));
    await until(()=>bridge.engineObservation.available);
    const pending=bridge.inspectVehicleOwner({entity:42,company:8,timeoutMs:1000});
    await until(async()=>{try{return (await readFile(path.join(directory,'vehicle_discovery_request.lua'),'utf8')).includes('entity = 42');}catch{return false;}});
    const request=parseFlatDataFile(await readFile(path.join(directory,'vehicle_discovery_request.lua'),'utf8'));
    assert.equal(request.company,8);
    await assert.rejects(bridge.discoverOwnedVehicle(),/VEHICLE_DISCOVERY_BUSY/);
    await writeFile(path.join(directory,'vehicle_discovery_receipt.lua'),lua(receipt({nonce:bridge.nonce,
      requestId:request.requestId,company:8,entity:42})));
    assert.equal((await pending).entity,42);
    await assert.rejects(readFile(path.join(directory,'vehicle_discovery_request.lua')),{code:'ENOENT'});
  }finally{await bridge.close();await rm(root,{recursive:true,force:true});}
});
