import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhase2LocalRun,phase2LocalPlanHash} from '../src/phase2-local-run.mjs';

const depot={resource:'base::/construction/road/road_depot/road_depot.con',x:1,y:2,z:3,yaw:0,seed:1};
const station={resource:'base::/construction/street/modular_street_station/modular_terminal.con',x:4,y:5,z:6,yaw:0,seed:2};
const plan={originalCompany:10,targetCompany:20,fundingAmount:100, depot,model:'base::/vehicle/bus/test.mdl',stationA:station,stationB:{...station,x:7,seed:3},checkpointHash:'c'.repeat(64)};
const canonical={...plan,depot:{resource:depot.resource,x:1,y:2,z:3,yaw:0,seed:1},stationA:{resource:station.resource,x:4,y:5,z:6,yaw:0,seed:2},stationB:{resource:station.resource,x:7,y:5,z:6,yaw:0,seed:3}};
const confirmation=phase2LocalPlanHash(canonical);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({saveReport=async()=>{},syncEvent=false}={}){
  const calls=[],reports=[],bridge={engineObservation:{available:true,sample:{companyEntity:10,tickCount:100,updateCount:80,speedup:0}}};
  let run;
  for(const method of ['requestPhase2Funding','requestPhase2Depot','requestPhase2Vehicle','requestPhase2Station','requestPhase2Service'])bridge[method]=args=>{
    calls.push({method,args});if(syncEvent&&method==='requestPhase2Funding')run.onEvent({event:'phase2_funding_result',requestId:1,code:'funded',amount:100,companyEntity:10,targetCompany:20,updateCount:80});return Promise.resolve();
  };
  run=createPhase2LocalRun({bridge,logger:()=>{},saveReport:async value=>{reports.push(value);return saveReport(value);},now:()=>1});
  return {run,bridge,calls,reports};
}
test('local run requires the canonical explicit plan hash and a held observed company',async()=>{
  const f=fixture();await assert.rejects(f.run.start({plan,confirmedHash:'a'.repeat(64)}),/CONFIRMATION/);
  await assert.rejects(f.run.start({plan:{...plan,depot:{...depot,extra:1}},confirmedHash:confirmation}),/INVALID/);
  f.bridge.engineObservation.sample.speedup=1;
  await assert.rejects(f.run.start({plan,confirmedHash:confirmation}),/PAUSED/);
  assert.equal(f.calls.length,0);
});

test('queued result identity is copied before caller can mutate it',async()=>{
  const f=fixture();await f.run.start({plan,confirmedHash:confirmation});
  const record={event:'phase2_funding_result',requestId:1,code:'funded',amount:100,companyEntity:10,targetCompany:999,updateCount:80};
  const pending=f.run.onEvent(record);record.targetCompany=20;await pending;
  assert.equal(f.run.status.outcome,'FUNDING_NOT_VERIFIED');
  assert.equal(f.calls.length,1);
});
test('local run advances only through real correlated bridge result events and remains paused',async()=>{
  const f=fixture();await f.run.start({plan,confirmedHash:confirmation});
  await f.run.onEvent({event:'phase2_funding_result',requestId:1,code:'funded',amount:100,companyEntity:10,targetCompany:20,updateCount:80});
  await f.run.onEvent({event:'phase2_depot_result',requestId:2,outcome:'verified',code:'NATIVE_BUILD_ACCOUNTING_VERIFIED',companyEntity:10,targetCompany:20,depotEntity:30,updateCount:80});
  await f.run.onEvent({event:'phase2_vehicle_result',requestId:3,outcome:'verified',code:'NATIVE_VEHICLE_ACCOUNTING_VERIFIED',companyEntity:10,targetCompany:20,vehicleEntity:31,updateCount:80});
  await f.run.onEvent({event:'phase2_station_result',requestId:4,outcome:'verified',code:'NATIVE_STATION_ACCOUNTING_VERIFIED',companyEntity:10,targetCompany:20,slot:1,stationEntity:32,updateCount:80});
  await f.run.onEvent({event:'phase2_station_result',requestId:5,outcome:'verified',code:'NATIVE_STATION_ACCOUNTING_VERIFIED',companyEntity:10,targetCompany:20,slot:2,stationEntity:33,updateCount:80});
  await f.run.onEvent({event:'phase2_service_result',requestId:6,outcome:'verified',code:'NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED',companyEntity:10,targetCompany:20,lineEntity:34,depotEntity:30,vehicleEntity:31,stationA:32,stationB:33,updateCount:80});await tick();
  assert.deepEqual(f.calls.map(c=>c.method),['requestPhase2Funding','requestPhase2Depot','requestPhase2Vehicle','requestPhase2Station','requestPhase2Station','requestPhase2Service']);
  assert.equal(f.run.status.outcome,'SETUP_VERIFIED_SERVICE_NOT_OBSERVED');assert.equal(f.run.status.gameplayVerified,false);
  assert.equal(f.calls.some(c=>c.method==='releasePauseTest'),false);
});
test('wrong-stage, duplicate, unknown, changed update, close and report failure stop without a next request',async()=>{
  for(const record of [
    {event:'phase2_depot_result',requestId:1,outcome:'verified',companyEntity:10,targetCompany:20,depotEntity:30,updateCount:80},
    {event:'phase2_funding_result',requestId:1,outcome:'unknown',code:'OUTCOME_UNKNOWN_DO_NOT_RETRY',companyEntity:10,targetCompany:20,updateCount:80},
    {event:'phase2_funding_result',requestId:1,code:'funded',amount:100,companyEntity:10,targetCompany:20,updateCount:81}
  ]){const f=fixture();await f.run.start({plan,confirmedHash:confirmation});f.run.onEvent(record);await f.run.close();assert.equal(f.calls.length,1);}
  const c=fixture();await c.run.start({plan,confirmedHash:confirmation});await c.run.close();c.run.onEvent({event:'phase2_funding_result',requestId:1,code:'funded',amount:100,companyEntity:10,targetCompany:20,updateCount:80});assert.equal(c.calls.length,1);
  const broken=fixture({saveReport:async()=>{throw new Error('disk');}});await assert.rejects(broken.run.start({plan,confirmedHash:confirmation}),/REPORT/);assert.equal(broken.calls.length,0);
});
test('phase advances before synchronous mock logger events and reports exclude nonce/path payloads',async()=>{
  const f=fixture({syncEvent:true});await f.run.start({plan,confirmedHash:confirmation});await tick();
  assert.deepEqual(f.calls.map(c=>c.method),['requestPhase2Funding','requestPhase2Depot']);
  f.run.onEvent({event:'phase2_depot_result',requestId:2,outcome:'unknown',code:'OUTCOME_UNKNOWN_DO_NOT_RETRY',companyEntity:10,targetCompany:20,updateCount:80,nonce:'secret',path:'C:/private'});await f.run.close();
  assert.equal(JSON.stringify(f.reports).includes('secret'),false);assert.equal(JSON.stringify(f.reports).includes('private'),false);
});
test('a report failure before every request prevents that request and final report failure never certifies success',async()=>{
  // Writes 2, 4, 6, 8, 10 and 12 are the durable pre-mutation records.
  for(const failAt of [2,4,6,8,10,12]){
    let writes=0;const f=fixture({saveReport:async()=>{if(++writes===failAt)throw new Error('disk');}});
    await f.run.start({plan,confirmedHash:confirmation}).catch(()=>{});
    const result={event:'phase2_funding_result',requestId:1,code:'funded',amount:100,companyEntity:10,targetCompany:20,updateCount:80};
    if(f.calls.length)await f.run.onEvent(result);
    if(f.calls.length>1)await f.run.onEvent({event:'phase2_depot_result',requestId:2,outcome:'verified',code:'NATIVE_BUILD_ACCOUNTING_VERIFIED',companyEntity:10,targetCompany:20,depotEntity:30,updateCount:80});
    if(f.calls.length>2)await f.run.onEvent({event:'phase2_vehicle_result',requestId:3,outcome:'verified',code:'NATIVE_VEHICLE_ACCOUNTING_VERIFIED',companyEntity:10,targetCompany:20,vehicleEntity:31,updateCount:80});
    if(f.calls.length>3)await f.run.onEvent({event:'phase2_station_result',requestId:4,outcome:'verified',code:'NATIVE_STATION_ACCOUNTING_VERIFIED',companyEntity:10,targetCompany:20,slot:1,stationEntity:32,updateCount:80});
    if(f.calls.length>4)await f.run.onEvent({event:'phase2_station_result',requestId:5,outcome:'verified',code:'NATIVE_STATION_ACCOUNTING_VERIFIED',companyEntity:10,targetCompany:20,slot:2,stationEntity:33,updateCount:80});
    assert.equal(f.run.status.outcome,'REPORT_WRITE_FAILED_STOP_RUN');
  }
  let writes=0,success=false;const final=fixture({saveReport:async()=>{if(++writes===14)throw new Error('final');}});
  const original=final.run;const logged=createPhase2LocalRun({bridge:final.bridge,logger:e=>{if(e.code==='SETUP_VERIFIED_SERVICE_NOT_OBSERVED')success=true;},saveReport:async()=>{if(++writes===14)throw new Error('final');}});
  await logged.start({plan,confirmedHash:confirmation});
  for(const row of [
    {event:'phase2_funding_result',requestId:1,code:'funded',amount:100},
    {event:'phase2_depot_result',requestId:2,outcome:'verified',code:'NATIVE_BUILD_ACCOUNTING_VERIFIED',depotEntity:30},
    {event:'phase2_vehicle_result',requestId:3,outcome:'verified',code:'NATIVE_VEHICLE_ACCOUNTING_VERIFIED',vehicleEntity:31},
    {event:'phase2_station_result',requestId:4,outcome:'verified',code:'NATIVE_STATION_ACCOUNTING_VERIFIED',slot:1,stationEntity:32},
    {event:'phase2_station_result',requestId:5,outcome:'verified',code:'NATIVE_STATION_ACCOUNTING_VERIFIED',slot:2,stationEntity:33},
    {event:'phase2_service_result',requestId:6,outcome:'verified',code:'NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED',lineEntity:34,depotEntity:30,vehicleEntity:31,stationA:32,stationB:33}
  ])await logged.onEvent({...row,companyEntity:10,targetCompany:20,updateCount:80});
  assert.equal(logged.status.outcome,'REPORT_WRITE_FAILED_STOP_RUN');assert.equal(success,false);void original;
});
test('unavailable observations, missing IDs, altered service assets, and close during a pending write cannot advance',async()=>{
  const unavailable=fixture();unavailable.bridge.engineObservation.available=false;
  await assert.rejects(unavailable.run.start({plan,confirmedHash:confirmation}),/PAUSED/);
  const missing=fixture();await missing.run.start({plan,confirmedHash:confirmation});
  await missing.run.onEvent({event:'phase2_funding_result',requestId:1,code:'funded',amount:100,companyEntity:10,targetCompany:20,updateCount:80});
  await missing.run.onEvent({event:'phase2_depot_result',requestId:2,outcome:'verified',code:'NATIVE_BUILD_ACCOUNTING_VERIFIED',companyEntity:10,targetCompany:20,depotEntity:0,updateCount:80});
  assert.equal(missing.calls.length,2);
  let release,delayed=true;const pending=fixture({saveReport:()=>delayed?new Promise(resolve=>{release=()=>{delayed=false;resolve();};}):Promise.resolve()});
  const start=pending.run.start({plan,confirmedHash:confirmation});await tick();const closing=pending.run.close();release();await Promise.allSettled([start,closing]);assert.equal(pending.calls.length,0);
  const altered=fixture();await altered.run.start({plan,confirmedHash:confirmation});
  for(const row of [
    {event:'phase2_funding_result',requestId:1,code:'funded',amount:100},
    {event:'phase2_depot_result',requestId:2,outcome:'verified',code:'NATIVE_BUILD_ACCOUNTING_VERIFIED',depotEntity:30},
    {event:'phase2_vehicle_result',requestId:3,outcome:'verified',code:'NATIVE_VEHICLE_ACCOUNTING_VERIFIED',vehicleEntity:31},
    {event:'phase2_station_result',requestId:4,outcome:'verified',code:'NATIVE_STATION_ACCOUNTING_VERIFIED',slot:1,stationEntity:32},
    {event:'phase2_station_result',requestId:5,outcome:'verified',code:'NATIVE_STATION_ACCOUNTING_VERIFIED',slot:2,stationEntity:33}
  ])await altered.run.onEvent({...row,companyEntity:10,targetCompany:20,updateCount:80});
  await altered.run.onEvent({event:'phase2_service_result',requestId:6,outcome:'verified',code:'NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED',companyEntity:10,targetCompany:20,updateCount:80,lineEntity:34,depotEntity:999,vehicleEntity:31,stationA:32,stationB:33});
  assert.equal(altered.run.status.outcome,'SERVICE_NOT_VERIFIED');
});
