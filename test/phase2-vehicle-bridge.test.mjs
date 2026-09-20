import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {startGameBridge} from '../src/game-bridge.mjs';
const lua=value=>`function data() return {${Object.entries(value).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`;
async function until(fn){for(let i=0;i<400;i++){if(await fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('mailbox timeout');}
const placement={resource:'base::/construction/road/road_depot/road_depot.con',seed:1,x:1,y:2,z:3,yaw:0};
const balances={originalBefore:5000,originalBeforeNegative:0,originalAfter:5000,originalAfterNegative:0,
  targetBefore:1000,targetBeforeNegative:0,targetAfter:900,targetAfterNegative:0};
for(const mode of ['verified','unknown_depot','changed_update','changed_depot','changed_company','timeout','close','unknown_vehicle']) {
  test(`vehicle purchase continuation through real mailboxes: ${mode}`,async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-purchase-'));
    const directory=path.join(root,'tf3mp_status_1'),events=[];
    const bridge=await startGameBridge({directory,intervalMs:5,companyTimeoutMs:mode==='timeout'?250:2500,logger:e=>events.push(e)});
    try{
      const sample={schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,counter:1,tickCount:100,
        updateCount:80,speedup:0,companyEntity:10,balance:5000,balanceKnown:1,balanceNegative:0};
      await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80}));
      await writeFile(path.join(directory,'engine_observation.lua'),lua(sample));
      await until(()=>bridge.engineObservation.available);
      const purchase={targetCompany:20,depotEntity:31,model:'base::/vehicle/bus/test.mdl',confirmed:true};
      await assert.rejects(bridge.requestPhase2Vehicle(purchase),/VERIFIED_HELD_DEPOT_REQUIRED/);
      await bridge.requestPhase2Depot({targetCompany:20,placement,confirmed:true});
      await writeFile(path.join(directory,'phase2_depot_receipt.lua'),lua({schemaVersion:1,kind:'phase2_depot_receipt',
        nonce:bridge.nonce,requestId:1,companyEntity:10,targetCompany:20,tickCount:101,updateCount:80,
        outcome:mode==='unknown_depot'?'unknown':'verified',code:'NATIVE_BUILD_ACCOUNTING_VERIFIED',resource:placement.resource,
        constructionEntity:30,depotEntity:31,constructionOwner:20,depotOwner:20,constructionMembershipPreserved:1,
        depotMembershipPreserved:1,chargedCost:100,...balances}));
      await until(()=>events.some(e=>e.event==='phase2_depot_result'));
      if(mode==='changed_update'){
        await writeFile(path.join(directory,'engine_observation.lua'),lua({...sample,counter:2,tickCount:102,updateCount:81}));
        await until(()=>bridge.engineObservation.sample?.updateCount===81);
      }
      if(['unknown_depot','changed_update','changed_depot','changed_company'].includes(mode)){
        await assert.rejects(bridge.requestPhase2Vehicle({...purchase,
          depotEntity:mode==='changed_depot'?32:31,targetCompany:mode==='changed_company'?21:20}),/VERIFIED_HELD_DEPOT_REQUIRED/);
        await assert.rejects(readFile(path.join(directory,'phase2_vehicle_request.lua')),{code:'ENOENT'});
        return;
      }
      await assert.rejects(bridge.requestPhase2Vehicle({...purchase,confirmed:false}),/EXPLICIT/);
      await bridge.requestPhase2Vehicle(purchase);
      assert.match(await readFile(path.join(directory,'phase2_vehicle_request.lua'),'utf8'),/requestId = 2/);
      await assert.rejects(bridge.requestPhase2Vehicle(purchase),/VERIFIED_HELD_DEPOT_REQUIRED/);
      const receipt={schemaVersion:1,kind:'phase2_vehicle_receipt',nonce:bridge.nonce,requestId:2,
        companyEntity:10,targetCompany:20,depotEntity:31,model:purchase.model,tickCount:102,updateCount:80,
        outcome:'verified',code:'NATIVE_VEHICLE_ACCOUNTING_VERIFIED',vehicleEntity:32,vehicleOwner:20,depotOwner:20,
        chargedCost:100,...balances,targetBefore:900,targetAfter:800};
      if(mode==='verified'||mode==='unknown_vehicle')await writeFile(path.join(directory,'phase2_vehicle_receipt.lua'),
        lua({...receipt,...(mode==='unknown_vehicle'?{outcome:'unknown',code:'ENGINE_OUTCOME_UNKNOWN'}:{})}));
      if(mode==='close')await bridge.close();
      await until(()=>events.some(e=>e.event==='phase2_vehicle_result'));
      const result=events.find(e=>e.event==='phase2_vehicle_result');
      assert.equal(result.outcome,mode==='verified'?'verified':'unknown');
      assert.equal(result.nonce,undefined);
      await assert.rejects(readFile(path.join(directory,'phase2_vehicle_request.lua')),{code:'ENOENT'});
      await writeFile(path.join(directory,'phase2_vehicle_receipt.lua'),lua(receipt));
      await new Promise(r=>setTimeout(r,30));
      assert.equal(events.filter(e=>e.event==='phase2_vehicle_result').length,1);
      await assert.rejects(bridge.requestPhase2Vehicle(purchase));
    }finally{await bridge.close();await rm(root,{recursive:true,force:true});}
  });
}
