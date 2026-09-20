import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {startGameBridge} from '../src/game-bridge.mjs';
const lua=value=>`function data() return {${Object.entries(value).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`;
async function until(fn){for(let i=0;i<500;i++){if(await fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('mailbox timeout');}
const depot={resource:'base::/construction/road/road_depot/road_depot.con',seed:1,x:1,y:2,z:3,yaw:0};
const station={...depot,resource:'base::/street/modular_street_station/modular_terminal.con',x:10};
const money=(before,after)=>({originalBefore:5000,originalBeforeNegative:0,originalAfter:5000,originalAfterNegative:0,
  targetBefore:before,targetBeforeNegative:0,targetAfter:after,targetAfterNegative:0});
for(const mode of ['verified','unknown_station','balance_changed','update_changed','timeout','close','unknown_service','station_resumed','service_resumed']) {
  test(`station and service continuation through actual files: ${mode}`,async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-station-service-'));
    const directory=path.join(root,'tf3mp_status_1'),events=[];
    const bridge=await startGameBridge({directory,intervalMs:5,companyTimeoutMs:mode==='timeout'?250:2500,logger:e=>events.push(e)});
    const sample={schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,counter:1,tickCount:100,
      updateCount:80,speedup:0,companyEntity:10,balance:5000,balanceKnown:1,balanceNegative:0};
    const base={schemaVersion:1,nonce:bridge.nonce,companyEntity:10,targetCompany:20,tickCount:101,updateCount:80,outcome:'verified'};
    const service={targetCompany:20,depotEntity:31,vehicleEntity:32,stationA:34,stationB:36,confirmed:true};
    const eventCount=name=>events.filter(e=>e.event===name).length;
    try{
      await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80}));
      await writeFile(path.join(directory,'engine_observation.lua'),lua(sample));
      await until(()=>bridge.engineObservation.available);
      await assert.rejects(bridge.requestPhase2Service(service),/VERIFIED_SERVICE_ASSETS/);
      await assert.rejects(bridge.requestPhase2Station({targetCompany:20,slot:1,placement:station,confirmed:true}),/VERIFIED_STATION_SEQUENCE/);
      await bridge.requestPhase2Depot({targetCompany:20,placement:depot,confirmed:true});
      await writeFile(path.join(directory,'phase2_depot_receipt.lua'),lua({...base,kind:'phase2_depot_receipt',requestId:1,
        code:'NATIVE_BUILD_ACCOUNTING_VERIFIED',resource:depot.resource,constructionEntity:30,depotEntity:31,
        constructionOwner:20,depotOwner:20,constructionMembershipPreserved:1,depotMembershipPreserved:1,chargedCost:100,...money(1000,900)}));
      await until(()=>eventCount('phase2_depot_result')===1);
      await bridge.requestPhase2Vehicle({targetCompany:20,depotEntity:31,model:'base::/vehicle/bus/test.mdl',confirmed:true});
      await writeFile(path.join(directory,'phase2_vehicle_receipt.lua'),lua({...base,kind:'phase2_vehicle_receipt',requestId:2,
        code:'NATIVE_VEHICLE_ACCOUNTING_VERIFIED',depotEntity:31,model:'base::/vehicle/bus/test.mdl',vehicleEntity:32,
        vehicleOwner:20,depotOwner:20,chargedCost:100,...money(900,800)}));
      await until(()=>eventCount('phase2_vehicle_result')===1);
      await assert.rejects(bridge.requestPhase2Station({targetCompany:20,slot:2,placement:station,confirmed:true}),/VERIFIED_STATION_SEQUENCE/);
      await assert.rejects(bridge.requestPhase2Station({targetCompany:20,slot:1,placement:station,confirmed:false}),/EXPLICIT/);
      await bridge.requestPhase2Station({targetCompany:20,slot:1,placement:station,confirmed:true});
      const first={...base,kind:'phase2_station_receipt',requestId:3,slot:1,resource:station.resource,
        code:'NATIVE_STATION_ACCOUNTING_VERIFIED',constructionEntity:33,stationEntity:34,
        constructionOwner:20,stationOwner:20,constructionMembershipPreserved:1,stationMembershipPreserved:1,
        chargedCost:100,...money(800,700)};
      if(mode==='station_resumed'){
        await writeFile(path.join(directory,'engine_observation.lua'),lua({...sample,counter:2,tickCount:101,speedup:1}));
        await until(()=>bridge.engineObservation.sample?.speedup===1);
      }
      if(mode==='close')await bridge.close();
      else if(mode!=='timeout')await writeFile(path.join(directory,'phase2_station_receipt.lua'),lua({...first,
        ...(mode==='unknown_station'?{outcome:'unknown',code:'ENGINE_OUTCOME_UNKNOWN'}:{}),
        ...(mode==='balance_changed'?money(801,701):{}),...(mode==='update_changed'?{updateCount:81}:{})}));
      await until(()=>eventCount('phase2_station_result')===1);
      if(!['verified','unknown_service','service_resumed'].includes(mode)){
        assert.equal(events.find(e=>e.event==='phase2_station_result').outcome,'unknown');
        await writeFile(path.join(directory,'phase2_station_receipt.lua'),lua(first));
        await new Promise(r=>setTimeout(r,25));
        assert.equal(eventCount('phase2_station_result'),1);
        await assert.rejects(bridge.requestPhase2Station({targetCompany:20,slot:2,placement:station,confirmed:true}));
        await assert.rejects(bridge.requestPhase2Service(service));
        return;
      }
      await assert.rejects(bridge.requestPhase2Service(service),/VERIFIED_SERVICE_ASSETS/);
      await bridge.requestPhase2Station({targetCompany:20,slot:2,placement:{...station,x:40},confirmed:true});
      await writeFile(path.join(directory,'phase2_station_receipt.lua'),lua({...first,requestId:4,slot:2,constructionEntity:35,stationEntity:36,...money(700,600)}));
      await until(()=>eventCount('phase2_station_result')===2);
      await assert.rejects(bridge.requestPhase2Service({...service,stationB:34}),/VERIFIED_SERVICE_ASSETS/);
      await assert.rejects(bridge.requestPhase2Service({...service,confirmed:false}),/EXPLICIT/);
      await bridge.requestPhase2Service(service);
      if(mode==='service_resumed'){
        await writeFile(path.join(directory,'engine_observation.lua'),lua({...sample,counter:2,tickCount:101,speedup:1}));
        await until(()=>bridge.engineObservation.sample?.speedup===1);
      }
      assert.match(await readFile(path.join(directory,'phase2_service_request.lua'),'utf8'),/requestId = 5/);
      await writeFile(path.join(directory,'phase2_service_receipt.lua'),lua({...base,kind:'phase2_service_receipt',requestId:5,
        depotEntity:31,vehicleEntity:32,stationA:34,stationB:36,lineEntity:37,lineOwner:20,vehicleOwner:20,stationAOwner:20,stationBOwner:20,
        code:mode!=='unknown_service'?'NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED':'ENGINE_OUTCOME_UNKNOWN',
        outcome:mode!=='unknown_service'?'verified':'unknown'}));
      await until(()=>eventCount('phase2_service_result')===1);
      const result=events.find(e=>e.event==='phase2_service_result');
      assert.equal(result.outcome,mode==='verified'?'verified':'unknown');
      assert.equal(result.nonce,undefined);
      assert.equal(result.gameplayVerified,false);
      await assert.rejects(bridge.requestPhase2Service(service),/VERIFIED_SERVICE_ASSETS/);
      await assert.rejects(readFile(path.join(directory,'phase2_service_request.lua')),{code:'ENOENT'});
    }finally{await bridge.close();await rm(root,{recursive:true,force:true});}
  });
}
