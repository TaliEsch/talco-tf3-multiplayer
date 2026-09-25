import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseRoadPreflightReceipt} from '../src/road-preflight-receipt.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';
import {startGameBridge} from '../src/game-bridge.mjs';

const nonce='a'.repeat(32);
const context={nonce,requestId:5,company:3141,entity:53417};
const receipt={schemaVersion:1,kind:'road_preflight_receipt',nonce,
  requestId:5,company:3141,entity:53417,ownerCompany:0,revision:4,
  tickCount:100,updateCount:20,outcome:'found'};
const lua=value=>`function data() return {${Object.entries(value).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`;

test('road preflight accepts one fresh public or company-owned road receipt',()=>{
  assert.equal(parseRoadPreflightReceipt(lua(receipt),context).revision,4);
  assert.equal(parseRoadPreflightReceipt(lua({...receipt,ownerCompany:3141}),context).outcome,'found');
});

test('road preflight refuses cross-company, malformed and stale evidence',()=>{
  for(const change of [
    {ownerCompany:55652}, {company:55652}, {entity:999}, {requestId:4},
    {outcome:'occupied'}, {updateCount:-1}, {unexpected:1},
  ]){
    const value={...receipt,...change};
    if(change.outcome==='occupied')assert.equal(parseRoadPreflightReceipt(lua({...value,revision:0}),context).outcome,'occupied');
    else assert.throws(()=>parseRoadPreflightReceipt(lua(value),context));
  }
});

test('bridge binds a running road preflight to its request and fresh TF3 clock',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-road-preflight-'));
  const directory=path.join(root,'tf3mp_status_1');
  const bridge=await startGameBridge({directory,intervalMs:5});
  const until=async predicate=>{for(let i=0;i<200;i++){
    if(await predicate())return;
    await new Promise(resolve=>setTimeout(resolve,5));
  }assert.fail('road preflight timed out');};
  try{
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',
      nonce:bridge.nonce,counter:1,tickCount:100,updateCount:50}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,
      kind:'engine_observation',nonce:bridge.nonce,counter:1,tickCount:100,
      updateCount:50,speedup:1,companyEntity:7,balance:0,balanceKnown:1,balanceNegative:0}));
    await until(()=>bridge.engineObservation.available);
    const pending=bridge.inspectRoadPreflight({entity:53417,company:3141,timeoutMs:1000});
    await until(async()=>{try{return (await readFile(path.join(directory,'road_preflight_request.lua'),'utf8')).includes('entity = 53417');}catch{return false;}});
    const request=parseFlatDataFile(await readFile(path.join(directory,'road_preflight_request.lua'),'utf8'));
    await writeFile(path.join(directory,'road_preflight_receipt.lua'),lua({...receipt,
      nonce:bridge.nonce,requestId:request.requestId,updateCount:50,tickCount:100}));
    const proof=await pending;
    assert.deepEqual({entity:proof.entity,company:proof.company,issuedUpdate:proof.issuedUpdate,
      updateCount:proof.updateCount,paused:proof.paused},{entity:53417,company:3141,
      issuedUpdate:50,updateCount:50,paused:false});
    await assert.rejects(readFile(path.join(directory,'road_preflight_request.lua')),{code:'ENOENT'});
  }finally{await bridge.close();await rm(root,{recursive:true,force:true});}
});
