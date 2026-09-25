import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rename,unlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startGameBridge} from '../src/game-bridge.mjs';
import {parseFundingReceipt} from '../src/phase2-funding.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';

const lua=p=>`function data() return {${Object.entries(p).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')} } end`;
let publishId=0;
async function publish(file,source){
  const temporary=`${file}.test-${++publishId}`;
  await writeFile(temporary,source);
  try{
    for(let attempt=0;;attempt++){
      try{await rename(temporary,file);break;}
      catch(error){
        if(attempt>=19||!['EPERM','EBUSY','EACCES'].includes(error.code))throw error;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
    }
  }finally{await unlink(temporary).catch(()=>{});}
}
async function until(predicate){
  for(let i=0;i<200;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.fail('funded coordinator condition timed out');
}
async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-funded-coordinator-'));
  const directory=path.join(root,'tf3mp_status_1'),events=[];
  const bridge=await startGameBridge({directory,intervalMs:10,companyTimeoutMs:500,logger:e=>events.push(e)});
  const observation={schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,counter:1,
    tickCount:100,updateCount:80,speedup:0,companyEntity:10,balance:5000,balanceKnown:1,balanceNegative:0};
  await publish(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,
    counter:1,tickCount:100,updateCount:80}));
  await publish(path.join(directory,'engine_observation.lua'),lua(observation));
  await until(()=>bridge.engineObservation.available);
  return {root,directory,bridge,events,observation,close:async()=>{await bridge.close();await rm(root,{recursive:true,force:true});}};
}
function fundingReceipt(request,changes={}){
  return {schemaVersion:1,kind:'phase2_funding_receipt',nonce:request.nonce,
    requestId:request.requestId,companyEntity:request.companyEntity,
    targetCompany:request.targetCompany,amount:request.amount,tickCount:100,updateCount:80,
    outcome:'funded',originalBefore:5000,originalBeforeNegative:0,
    originalAfter:5000,originalAfterNegative:0,targetBefore:0,targetBeforeNegative:0,
    targetAfter:request.amount,targetAfterNegative:0,...changes};
}

test('one explicit funded receipt authorizes only a same-clock local coordinator lease',async()=>{
  const f=await fixture();
  try{
    assert.equal(f.bridge.fundedCoordinatorReady,false);
    await assert.rejects(f.bridge.authorizeFundedCoordinator({targetCompany:20}),/VERIFIED_HELD_FUNDING_REQUIRED/);
    await f.bridge.requestPhase2Funding({targetCompany:20,amount:100000,confirmed:true});
    assert.equal(f.bridge.fundedCoordinatorReady,false);
    await assert.rejects(f.bridge.startCoordinationLease({healthy:()=>true,onFailure:()=>{}}),/COORDINATION_BUSY_OR_USED/);
    const request=parseFlatDataFile(await readFile(path.join(f.directory,'phase2_funding_request.lua'),'utf8'));
    await publish(path.join(f.directory,'phase2_funding_receipt.lua'),lua(fundingReceipt(request)));
    await until(()=>f.bridge.fundedCoordinatorReady);
    await assert.rejects(f.bridge.authorizeFundedCoordinator({targetCompany:21}),/VERIFIED_HELD_FUNDING_REQUIRED/);
    const proof=await f.bridge.authorizeFundedCoordinator({targetCompany:20});
    assert.equal(parseFundingReceipt(proof.receiptSource,proof.request).outcome,'funded');
    assert.equal(Object.isFrozen(proof),true);
    assert.equal(f.bridge.fundedCoordinatorReady,false);
    await assert.rejects(f.bridge.authorizeFundedCoordinator({targetCompany:20}),/VERIFIED_HELD_FUNDING_REQUIRED/);
    await assert.rejects(f.bridge.requestCompanyTest(),/COMPANY_TEST_BUSY_OR_USED/);
    await publish(path.join(f.directory,'engine_observation.lua'),lua({...f.observation,counter:2,
      tickCount:101,updateCount:81,speedup:1}));
    await publish(path.join(f.directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:f.bridge.nonce,
      counter:2,tickCount:101,updateCount:81}));
    await until(()=>f.bridge.engineObservation.sample?.speedup===1);
    const lease=await f.bridge.startCoordinationLease({healthy:()=>true,onFailure:()=>{}});
    assert.equal(lease.phase,'awaiting_receipt');
    await assert.rejects(f.bridge.startCoordinationLease({healthy:()=>true,onFailure:()=>{}}),/COORDINATION_BUSY_OR_USED/);
  }finally{await f.close();}
});

for(const outcome of ['rejected','outcome_unknown'])
test(`non-funded receipt cannot authorize coordinator: ${outcome}`,async()=>{
  const f=await fixture();
  try{
    await f.bridge.requestPhase2Funding({targetCompany:20,amount:100000,confirmed:true});
    const request=parseFlatDataFile(await readFile(path.join(f.directory,'phase2_funding_request.lua'),'utf8'));
    await publish(path.join(f.directory,'phase2_funding_receipt.lua'),lua(fundingReceipt(request,{outcome})));
    await until(()=>f.events.some(e=>e.event==='phase2_funding_result'));
    assert.equal(f.bridge.fundedCoordinatorReady,false);
    await assert.rejects(f.bridge.authorizeFundedCoordinator({targetCompany:20}),/VERIFIED_HELD_FUNDING_REQUIRED/);
    await assert.rejects(f.bridge.startCoordinationLease({healthy:()=>true,onFailure:()=>{}}),/COORDINATION_BUSY_OR_USED/);
  }finally{await f.close();}
});

test('changed held update invalidates verified funding before coordinator authorization',async()=>{
  const f=await fixture();
  try{
    await f.bridge.requestPhase2Funding({targetCompany:20,amount:100000,confirmed:true});
    const request=parseFlatDataFile(await readFile(path.join(f.directory,'phase2_funding_request.lua'),'utf8'));
    await publish(path.join(f.directory,'phase2_funding_receipt.lua'),lua(fundingReceipt(request)));
    await until(()=>f.bridge.fundedCoordinatorReady);
    await publish(path.join(f.directory,'engine_observation.lua'),lua({...f.observation,counter:2,
      tickCount:101,updateCount:81}));
    await publish(path.join(f.directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:f.bridge.nonce,
      counter:2,tickCount:101,updateCount:81}));
    await until(()=>f.bridge.engineObservation.sample?.updateCount===81);
    assert.equal(f.bridge.fundedCoordinatorReady,false);
    await assert.rejects(f.bridge.authorizeFundedCoordinator({targetCompany:20}),/VERIFIED_HELD_FUNDING_REQUIRED/);
  }finally{await f.close();}
});

for(const changes of [{companyEntity:11},{tickCount:401},{tickCount:399,updateCount:381}])
test(`funded coordinator rejects changed running context: ${JSON.stringify(changes)}`,async()=>{
  const f=await fixture();
  try{
    await f.bridge.requestPhase2Funding({targetCompany:20,amount:100000,confirmed:true});
    const request=parseFlatDataFile(await readFile(path.join(f.directory,'phase2_funding_request.lua'),'utf8'));
    await publish(path.join(f.directory,'phase2_funding_receipt.lua'),lua(fundingReceipt(request)));
    await until(()=>f.bridge.fundedCoordinatorReady);
    await f.bridge.authorizeFundedCoordinator({targetCompany:20});
    const resumed={...f.observation,counter:2,tickCount:101,updateCount:81,speedup:1,...changes};
    await publish(path.join(f.directory,'engine_observation.lua'),lua(resumed));
    await publish(path.join(f.directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:f.bridge.nonce,
      counter:2,tickCount:resumed.tickCount,updateCount:resumed.updateCount}));
    await until(()=>f.bridge.engineObservation.sample?.counter===2
      ||f.bridge.engineObservation.available===false);
    await assert.rejects(f.bridge.startCoordinationLease({healthy:()=>true,onFailure:()=>{}}),
      /COORDINATION_BUSY_OR_USED|OBSERVATION_REQUIRED/);
  }finally{await f.close();}
});
