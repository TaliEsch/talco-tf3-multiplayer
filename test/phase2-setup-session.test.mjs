import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {startGameBridge} from '../src/game-bridge.mjs';
import {createPhase2SetupSession} from '../src/phase2-setup-session.mjs';
const lua=value=>`function data() return {${Object.entries(value).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`;
async function until(check){for(let i=0;i<500;i++){if(await check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('setup timeout');}
const fileExists=async file=>{try{await readFile(file);return true;}catch{return false;}};

for(const mode of ['confirm','wrong_hash','changed_plan','resumed','not_empty','close','expired','report_failure'])test(`guided setup through real mailboxes: ${mode}`,async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-setup-'));
  const directory=path.join(root,'tf3mp_status_1'),events=[],reports=[];
  let session,time=0;
  const bridge=await startGameBridge({directory,intervalMs:5,logger:e=>{events.push(e);void session?.onEvent(e);}});
  try {
    const observation={schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,counter:1,tickCount:100,
      updateCount:80,speedup:0,companyEntity:10,balance:5000,balanceKnown:1,balanceNegative:0};
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua(observation));
    await until(()=>bridge.engineObservation.available);
    session=createPhase2SetupSession({bridge,saveReport:async r=>{if(mode==='report_failure')throw new Error('disk');reports.push(r);},logger:e=>events.push(e),checkpointHash:'c'.repeat(64),now:()=>time});
    await session.start();
    const inspected={schemaVersion:1,kind:'company_inspection',nonce:bridge.nonce,requestId:1,outcome:'inspected',
      tickCount:101,updateCount:80,companyEntity:10,newCompanyEntity:20,
      originalBalance:5000,originalKnown:1,originalNegative:0,originalAssets:5,originalVehicles:1,originalLines:1,
      createdBalance:0,createdKnown:1,createdNegative:0,createdAssets:mode==='not_empty'?1:0,createdVehicles:0,createdLines:0};
    await writeFile(path.join(directory,'company_inspection.lua'),lua(inspected));
    await until(()=>bridge.phase2SetupState.status!=='inspecting');await session.poll();
    if(mode==='not_empty'){assert.equal(session.status.phase,'failed');return;}
    assert.equal(session.status.phase,'selecting');
    const plan={schemaVersion:1,kind:'phase2_plan',nonce:bridge.nonce,revision:1,originalCompany:10,targetCompany:20,
      fundingAmount:1000000,model:'base::/vehicle/bus/test.mdl'};
    for(const [prefix,x] of [['depot',1],['stationA',10],['stationB',20]])Object.assign(plan,{
      [prefix+'Resource']:prefix==='depot'?'base::/road/road_depot/road_depot.con':'base::/street/modular_street_station/modular_terminal.con',
      [prefix+'X']:x,[prefix+'Y']:2,[prefix+'Z']:3,[prefix+'Yaw']:0,[prefix+'Seed']:prefix==='depot'?1:prefix==='stationA'?2:3});
    await writeFile(path.join(directory,'phase2_plan.lua'),lua(plan));await session.poll();
    assert.equal(session.status.phase,'ready');
    assert.equal(await fileExists(path.join(directory,'phase2_funding_request.lua')),false);
    assert.equal(reports.length,0);
    const hash=events.find(e=>e.code==='PLAN_READY').planHash;
    if(mode==='changed_plan'){
      await writeFile(path.join(directory,'phase2_plan.lua'),lua({...plan,depotX:99}));
      await assert.rejects(session.confirm(hash),/CONFIRMED_PLAN_CHANGED/);
      assert.equal(session.status.phase,'failed');
      assert.equal(await fileExists(path.join(directory,'phase2_funding_request.lua')),false);return;
    }
    if(mode==='wrong_hash'){
      await assert.rejects(session.confirm('a'.repeat(64)),/CONFIRMATION/);
      assert.equal(await fileExists(path.join(directory,'phase2_funding_request.lua')),false);return;
    }
    if(mode==='resumed'){
      await writeFile(path.join(directory,'engine_observation.lua'),lua({...observation,counter:2,tickCount:102,speedup:1}));
      await until(()=>bridge.engineObservation.sample.speedup===1);
      await session.poll();assert.equal(session.status.phase,'failed');
      await assert.rejects(session.confirm(hash));return;
    }
    if(mode==='expired'){time=600001;await session.poll();assert.equal(session.status.phase,'failed');return;}
    if(mode==='close'){await session.close();await assert.rejects(session.confirm(hash));return;}
    if(mode==='report_failure'){
      await assert.rejects(session.confirm(hash),/REPORT/);assert.equal(session.status.phase,'failed');
      assert.equal(await fileExists(path.join(directory,'phase2_funding_request.lua')),false);return;
    }
    await session.confirm(hash);
    assert.equal(session.status.phase,'running');
    assert.ok(reports.length>0);
    await until(()=>fileExists(path.join(directory,'phase2_funding_request.lua')));
    assert.match(await readFile(path.join(directory,'phase2_funding_request.lua'),'utf8'),/amount = 1000000/);
    await assert.rejects(session.confirm(hash));
  }finally{await session?.close();await bridge.close();await rm(root,{recursive:true,force:true});}
});
