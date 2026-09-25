import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseOrderedRoadReadback} from '../src/ordered-road-readback.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';
import {startGameBridge} from '../src/game-bridge.mjs';

const lua=value=>`function data() return {${Object.entries(value).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`;
const nonce='a'.repeat(32);
const request={schemaVersion:1,kind:'ordered_road_readback_request',nonce,requestId:3,
  hostSequence:1,company:10,localCompany:10,sourceRoad:24,road:25,stop:81,update:50,
  balance:53652,balanceNegative:0,localBalance:53652,localBalanceNegative:0,charge:46348};
const observed={...request,kind:'ordered_road_readback_receipt',code:'observed'};

test('ordered road readback binds every field and exposes bounded unknown stage',()=>{
  assert.equal(parseOrderedRoadReadback(lua(observed),request).code,'observed');
  for(const change of [{nonce:'b'.repeat(32)},{requestId:4},{hostSequence:2},
    {company:11},{localCompany:11},{sourceRoad:26},{road:27},{stop:82},{update:51},
    {balance:1},{balanceNegative:1},{localBalance:1},{localBalanceNegative:1},
    {charge:1},{extra:1}])
    assert.throws(()=>parseOrderedRoadReadback(lua({...observed,...change}),request));
  assert.equal(parseOrderedRoadReadback(lua({...observed,balanceNegative:1}),
    {...request,balanceNegative:1}).code,'observed');
  const unknown={schemaVersion:1,kind:'ordered_road_readback_receipt',code:'unknown',
    nonce,requestId:3,stage:'attachment'};
  assert.equal(parseOrderedRoadReadback(lua(unknown),request).stage,'attachment');
  assert.equal(parseOrderedRoadReadback(lua({...unknown,stage:'local_balance'}),request).stage,'local_balance');
  assert.throws(()=>parseOrderedRoadReadback(lua({...unknown,stage:'unbounded'}),request));
});

test('bridge obtains one receipt while held and removes request',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-ordered-road-readback-'));
  const directory=path.join(root,'tf3mp_status_1');
  const bridge=await startGameBridge({directory,intervalMs:5});
  const until=async predicate=>{for(let i=0;i<200;i++){
    if(await predicate())return;
    await new Promise(resolve=>setTimeout(resolve,5));
  }assert.fail('ordered readback timed out');};
  const publishObservation=async(speedup,tickCount)=>{
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',
      nonce:bridge.nonce,counter:tickCount,tickCount,updateCount:50}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,
      kind:'engine_observation',nonce:bridge.nonce,counter:tickCount,tickCount,
      updateCount:50,speedup,companyEntity:10,balance:53652,balanceKnown:1,balanceNegative:0}));
  };
  try{
    await publishObservation(1,100);
    await until(()=>bridge.engineObservation.available);
    const lease=await bridge.startCoordinationLease({healthy:()=>true,onFailure:()=>{}});
    const arm=parseFlatDataFile(await readFile(path.join(directory,'watchdog_request.lua'),'utf8'));
    await writeFile(path.join(directory,'watchdog_receipt.lua'),lua({
      ...arm,kind:'watchdog_receipt',lastTick:100,tickCount:100,updateCount:50,
      speedup:1,phase:'active',outcome:'armed',reason:'none'}));
    await until(()=>lease.active);
    await publishObservation(0,101);
    await until(()=>bridge.engineObservation.sample?.speedup===0);
    const awaiting=bridge.inspectOrderedRoadReadback({...request,company:9,timeoutMs:1000});
    await until(async()=>{try{return (await readFile(path.join(directory,
      'ordered_road_readback_request.lua'),'utf8')).includes('hostSequence = 1');}catch{return false;}});
    const issued=parseFlatDataFile(await readFile(path.join(directory,
      'ordered_road_readback_request.lua'),'utf8'));
    assert.equal(issued.localBalance,53652);
    assert.equal(issued.localBalanceNegative,0);
    await writeFile(path.join(directory,'ordered_road_readback_receipt.lua'),lua({
      ...observed,company:9,nonce:bridge.nonce,requestId:issued.requestId,
      localBalance:issued.localBalance,localBalanceNegative:issued.localBalanceNegative}));
    assert.equal((await awaiting).code,'observed');
    await assert.rejects(readFile(path.join(directory,'ordered_road_readback_request.lua')),{code:'ENOENT'});
    const localAction=bridge.inspectOrderedRoadReadback({...request,balance:53000,timeoutMs:1000});
    await until(async()=>{try{return parseFlatDataFile(await readFile(path.join(directory,
      'ordered_road_readback_request.lua'),'utf8')).requestId>issued.requestId;}catch{return false;}});
    const localIssued=parseFlatDataFile(await readFile(path.join(directory,
      'ordered_road_readback_request.lua'),'utf8'));
    assert.equal(localIssued.localBalance,53000);
    assert.equal(localIssued.localBalanceNegative,0);
    await writeFile(path.join(directory,'ordered_road_readback_receipt.lua'),lua({
      ...observed,nonce:bridge.nonce,requestId:localIssued.requestId,
      balance:53000,localBalance:53000}));
    assert.equal((await localAction).code,'observed');
  }finally{await bridge.close();await rm(root,{recursive:true,force:true});}
});
