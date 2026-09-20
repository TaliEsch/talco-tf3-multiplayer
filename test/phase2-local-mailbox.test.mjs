import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {startGameBridge} from '../src/game-bridge.mjs';
import {createPhase2LocalRun,phase2LocalPlanHash} from '../src/phase2-local-run.mjs';
import {createBatchReportWriter} from '../src/batch-report.mjs';

const lua=value=>`function data() return {${Object.entries(value).map(([key,item])=>`${key}=${JSON.stringify(item)},`).join('')}} end`;
const depot={resource:'base::/construction/road/road_depot/road_depot.con',x:1,y:2,z:3,yaw:0,seed:1};
const station={resource:'base::/street/modular_street_station/modular_terminal.con',x:10,y:2,z:3,yaw:0,seed:2};
const money=(before,after)=>({originalBefore:5000,originalBeforeNegative:0,originalAfter:5000,originalAfterNegative:0,targetBefore:before,targetBeforeNegative:0,targetAfter:after,targetAfterNegative:0});
async function until(check){for(let i=0;i<500;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('mailbox timeout');}
async function exists(file){try{await readFile(file);return true;}catch{return false;}}

test('phase2 local run drives the real mailbox through scalar setup receipts exactly once',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-local-mailbox-'));
  const directory=path.join(root,'tf3mp_status_1');
  const events=[],reports=[];
  let run;
  const bridge=await startGameBridge({directory,intervalMs:5,companyTimeoutMs:2500,logger:event=>{
    events.push(event);
    void run?.onEvent(event);
  }});
  const plan={originalCompany:10,targetCompany:20,fundingAmount:100,depot,model:'base::/vehicle/bus/test.mdl',stationA:station,stationB:{...station,x:40,seed:3},checkpointHash:'c'.repeat(64)};
  try{
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80,speedup:0,companyEntity:10,balance:5000,balanceKnown:1,balanceNegative:0}));
    await until(()=>bridge.engineObservation.available);
    const writeReport = await createBatchReportWriter(path.join(root,'reports'));
    run=createPhase2LocalRun({bridge,logger:()=>{},saveReport:async report=>{await writeReport(report);reports.push(report);}});
    await run.start({plan,confirmedHash:phase2LocalPlanHash(plan)});
    const base={schemaVersion:1,nonce:bridge.nonce,companyEntity:10,targetCompany:20,tickCount:101,updateCount:80};
    const rows=[
      ['phase2_funding_request.lua','phase2_funding_receipt.lua',{...base,kind:'phase2_funding_receipt',requestId:1,amount:100,outcome:'funded',...money(0,100)}],
      ['phase2_depot_request.lua','phase2_depot_receipt.lua',{...base,kind:'phase2_depot_receipt',requestId:2,resource:depot.resource,outcome:'verified',code:'NATIVE_BUILD_ACCOUNTING_VERIFIED',constructionEntity:30,depotEntity:31,constructionOwner:20,depotOwner:20,constructionMembershipPreserved:1,depotMembershipPreserved:1,chargedCost:10,...money(100,90)}],
      ['phase2_vehicle_request.lua','phase2_vehicle_receipt.lua',{...base,kind:'phase2_vehicle_receipt',requestId:3,depotEntity:31,model:plan.model,outcome:'verified',code:'NATIVE_VEHICLE_ACCOUNTING_VERIFIED',vehicleEntity:32,vehicleOwner:20,depotOwner:20,chargedCost:10,...money(90,80)}],
      ['phase2_station_request.lua','phase2_station_receipt.lua',{...base,kind:'phase2_station_receipt',requestId:4,slot:1,resource:station.resource,outcome:'verified',code:'NATIVE_STATION_ACCOUNTING_VERIFIED',constructionEntity:33,stationEntity:34,constructionOwner:20,stationOwner:20,constructionMembershipPreserved:1,stationMembershipPreserved:1,chargedCost:10,...money(80,70)}],
      ['phase2_station_request.lua','phase2_station_receipt.lua',{...base,kind:'phase2_station_receipt',requestId:5,slot:2,resource:station.resource,outcome:'verified',code:'NATIVE_STATION_ACCOUNTING_VERIFIED',constructionEntity:35,stationEntity:36,constructionOwner:20,stationOwner:20,constructionMembershipPreserved:1,stationMembershipPreserved:1,chargedCost:10,...money(70,60)}],
      ['phase2_service_request.lua','phase2_service_receipt.lua',{...base,kind:'phase2_service_receipt',requestId:6,depotEntity:31,vehicleEntity:32,stationA:34,stationB:36,outcome:'verified',code:'NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED',lineEntity:37,lineOwner:20,vehicleOwner:20,stationAOwner:20,stationBOwner:20}],
    ];
    for(const [requestName,receiptName,receipt] of rows){
      await until(()=>exists(path.join(directory,requestName)));
      await writeFile(path.join(directory,receiptName),lua(receipt));
      await until(()=>events.some(event=>event.requestId===receipt.requestId&&event.event.endsWith('_result')));
    }
    await until(()=>run.status.phase==='terminal');
    assert.equal(run.status.outcome,'SETUP_VERIFIED_SERVICE_NOT_OBSERVED');
    assert.equal(run.status.gameplayVerified,false);
    assert.equal(run.status.receipts.length,6);
    assert.equal(reports.at(-1).receipts.length,6);
    const persisted = JSON.parse(await readFile(path.join(root,'reports',`local-batch-${run.status.batchId}`,'report.json'),'utf8'));
    assert.equal(persisted.receipts.length,6);
    assert.equal(persisted.checkpointVerified,false);
    await new Promise(resolve=>setTimeout(resolve,25));
    assert.equal(events.filter(event=>event.event==='phase2_service_result').length,1);
    await assert.rejects(readFile(path.join(directory,'phase2_service_request.lua')),{code:'ENOENT'});
  }finally{await run?.close();await bridge.close();await rm(root,{recursive:true,force:true});}
});
