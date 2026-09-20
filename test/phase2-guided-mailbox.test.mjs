import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createBatchReportWriter} from '../src/batch-report.mjs';
import {startGameBridge} from '../src/game-bridge.mjs';
import {createPhase2SetupSession} from '../src/phase2-setup-session.mjs';

const lua=value=>`function data() return {${Object.entries(value).map(([key,item])=>`${key}=${JSON.stringify(item)},`).join('')}} end`;
const depot={resource:'base::/road/road_depot/road_depot.con',x:1,y:2,z:3,yaw:0,seed:1};
const station={resource:'base::/street/modular_street_station/modular_terminal.con',x:10,y:2,z:3,yaw:0,seed:2};
const money=(before,after)=>({originalBefore:5000,originalBeforeNegative:0,originalAfter:5000,originalAfterNegative:0,targetBefore:before,targetBeforeNegative:0,targetAfter:after,targetAfterNegative:0});
const exists=async file=>{try{await readFile(file);return true;}catch{return false;}};
async function until(check){for(let i=0;i<500;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('guided mailbox timeout');}

test('guided setup confirms a ready flat plan then completes the six real mailbox stages without resuming',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-guided-mailbox-'));
  const directory=path.join(root,'tf3mp_status_1'),events=[];
  let session;
  const bridge=await startGameBridge({directory,intervalMs:5,companyTimeoutMs:2500,logger:event=>{
    events.push(event);void session?.onEvent(event);
  }});
  try{
    const observation={schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80,
      speedup:0,companyEntity:10,balance:5000,balanceKnown:1,balanceNegative:0};
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua(observation));
    await until(()=>bridge.engineObservation.available);
    const saveReport=await createBatchReportWriter(path.join(root,'reports'));
    session=createPhase2SetupSession({bridge,saveReport,logger:event=>events.push(event),checkpointHash:'c'.repeat(64)});
    await session.start();
    await writeFile(path.join(directory,'company_inspection.lua'),lua({schemaVersion:1,kind:'company_inspection',nonce:bridge.nonce,
      requestId:1,outcome:'inspected',tickCount:101,updateCount:80,companyEntity:10,newCompanyEntity:20,
      originalBalance:5000,originalKnown:1,originalNegative:0,originalAssets:5,originalVehicles:1,originalLines:1,
      createdBalance:0,createdKnown:1,createdNegative:0,createdAssets:0,createdVehicles:0,createdLines:0}));
    await until(()=>bridge.phase2SetupState.status==='selecting');
    await session.poll();
    const plan={schemaVersion:1,kind:'phase2_plan',nonce:bridge.nonce,revision:1,originalCompany:10,targetCompany:20,
      fundingAmount:1000000,model:'base::/vehicle/bus/test.mdl',
      depotResource:depot.resource,depotX:depot.x,depotY:depot.y,depotZ:depot.z,depotYaw:depot.yaw,depotSeed:depot.seed,
      stationAResource:station.resource,stationAX:station.x,stationAY:station.y,stationAZ:station.z,stationAYaw:station.yaw,stationASeed:station.seed,
      stationBResource:station.resource,stationBX:40,stationBY:2,stationBZ:3,stationBYaw:0,stationBSeed:3};
    await writeFile(path.join(directory,'phase2_plan.lua'),lua(plan));
    await session.poll();
    assert.equal(session.status.phase,'ready');
    assert.equal(await exists(path.join(directory,'phase2_funding_request.lua')),false);
    const planHash=events.find(event=>event.code==='PLAN_READY')?.planHash;
    assert.match(planHash,/^[a-f0-9]{64}$/);
    await session.confirm(planHash);
    const base={schemaVersion:1,nonce:bridge.nonce,companyEntity:10,targetCompany:20,tickCount:101,updateCount:80};
    const rows=[
      ['phase2_funding_request.lua','phase2_funding_receipt.lua',{...base,kind:'phase2_funding_receipt',requestId:2,amount:1000000,outcome:'funded',...money(0,1000000)}],
      ['phase2_depot_request.lua','phase2_depot_receipt.lua',{...base,kind:'phase2_depot_receipt',requestId:3,resource:depot.resource,outcome:'verified',code:'NATIVE_BUILD_ACCOUNTING_VERIFIED',constructionEntity:30,depotEntity:31,constructionOwner:20,depotOwner:20,constructionMembershipPreserved:1,depotMembershipPreserved:1,chargedCost:10,...money(1000000,999990)}],
      ['phase2_vehicle_request.lua','phase2_vehicle_receipt.lua',{...base,kind:'phase2_vehicle_receipt',requestId:4,depotEntity:31,model:plan.model,outcome:'verified',code:'NATIVE_VEHICLE_ACCOUNTING_VERIFIED',vehicleEntity:32,vehicleOwner:20,depotOwner:20,chargedCost:10,...money(999990,999980)}],
      ['phase2_station_request.lua','phase2_station_receipt.lua',{...base,kind:'phase2_station_receipt',requestId:5,slot:1,resource:station.resource,outcome:'verified',code:'NATIVE_STATION_ACCOUNTING_VERIFIED',constructionEntity:33,stationEntity:34,constructionOwner:20,stationOwner:20,constructionMembershipPreserved:1,stationMembershipPreserved:1,chargedCost:10,...money(999980,999970)}],
      ['phase2_station_request.lua','phase2_station_receipt.lua',{...base,kind:'phase2_station_receipt',requestId:6,slot:2,resource:station.resource,outcome:'verified',code:'NATIVE_STATION_ACCOUNTING_VERIFIED',constructionEntity:35,stationEntity:36,constructionOwner:20,stationOwner:20,constructionMembershipPreserved:1,stationMembershipPreserved:1,chargedCost:10,...money(999970,999960)}],
      ['phase2_service_request.lua','phase2_service_receipt.lua',{...base,kind:'phase2_service_receipt',requestId:7,depotEntity:31,vehicleEntity:32,stationA:34,stationB:36,outcome:'verified',code:'NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED',lineEntity:37,lineOwner:20,vehicleOwner:20,stationAOwner:20,stationBOwner:20}],
    ];
    for(const [requestName,receiptName,receipt] of rows){
      await until(()=>exists(path.join(directory,requestName)));
      await writeFile(path.join(directory,receiptName),lua(receipt));
      await until(()=>events.some(event=>event.event.endsWith('_result')&&event.requestId===receipt.requestId));
    }
    await until(()=>session.status.run?.phase==='terminal');
    await session.poll();
    assert.equal(session.status.phase,'complete');
    assert.equal(session.status.run.outcome,'SETUP_VERIFIED_SERVICE_NOT_OBSERVED');
    assert.equal(session.status.run.receipts.length,6);
    assert.equal(session.status.run.gameplayVerified,false);
    assert.equal(bridge.engineObservation.sample.speedup,0);
    assert.equal(bridge.phase2SetupState.status,'complete');
    const persisted=JSON.parse(await readFile(path.join(root,'reports',`local-batch-${session.status.run.batchId}`,'report.json'),'utf8'));
    assert.equal(persisted.receipts.length,6);
    assert.equal(persisted.checkpointVerified,false);
    assert.equal(persisted.multiGameVerified,false);
    await session.onEvent({event:'phase2_service_observation_result',action:'start',outcome:'raw_start_captured',
      code:'RAW_START_CAPTURED',requestId:8,originalCompany:10,targetCompany:20,vehicleEntity:32,lineEntity:37,
      accountNet:-100,nonce:bridge.nonce,secret:'must_not_persist'});
    await session.onEvent({event:'phase2_service_observation_result',action:'end',outcome:'raw_end_captured',
      code:'RAW_END_CAPTURED',requestId:9,intervalNet:300,intervalMaintenanceVehicle:-50,gameplayVerified:true});
    const observed=JSON.parse(await readFile(path.join(root,'reports',`local-batch-${session.status.run.batchId}`,'report.json'),'utf8'));
    assert.equal(observed.receipts.length,6);
    assert.equal(observed.outcome,'SETUP_VERIFIED_SERVICE_NOT_OBSERVED');
    assert.equal(observed.serviceObservation.receipts.length,2);
    assert.equal(observed.serviceObservation.receipts[0].accountNet,-100);
    assert.equal(observed.serviceObservation.serviceAccountingVerified,false);
    assert.equal(observed.serviceObservation.completedTripVerified,false);
    assert.equal(observed.serviceObservation.continuousOwnershipVerified,false);
    assert.equal(observed.gameplayVerified,false);
    assert.equal(JSON.stringify(observed).includes(bridge.nonce),false);
    assert.equal(JSON.stringify(observed).includes('must_not_persist'),false);
  }finally{await session?.close();await bridge.close();await rm(root,{recursive:true,force:true});}
});
