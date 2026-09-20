import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile as writeRaw, rename, unlink, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startGameBridge } from "../src/game-bridge.mjs";
import { parseFlatDataFile } from "../src/userdata-ipc.mjs";
import { createLocalIntegrationBatch } from "../src/local-integration-batch.mjs";
const lua = p => `function data() return {${Object.entries(p).map(([k,v]) => `${k}=${JSON.stringify(v)},`).join("")} } end`;
// Happy-path samples must be complete: direct truncation/writes can race the
// 10ms reader and unintentionally inject an observation failure into this test.
let writeSequence = 0;
async function writeFile(filename, source) {
  const temporary = filename + ".test-" + (++writeSequence);
  await writeRaw(temporary, source);
  try {
    // Windows may briefly deny replacement while the 10ms reader has the old
    // file open. Retry publication of this same synthetic sample, not commands.
    for(let attempt=0;;attempt++) {
      try { await rename(temporary,filename); break; }
      catch(error) {
        if(attempt >= 19 || !["EPERM","EBUSY","EACCES"].includes(error.code)) throw error;
        await new Promise(resolve => setTimeout(resolve,10));
      }
    }
  } finally { await unlink(temporary).catch(error => {if(error.code !== "ENOENT") throw error;}); }
}
async function until(predicate) {
  for (let i = 0; i < 400; i++) { if (await predicate()) return; await new Promise(r => setTimeout(r, 10)); }
  assert.fail("pause bridge timed out");
}
test('real bridge owns renewable lease files exclusively and stops renewal on session failure',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-coordination-lease-'));
  const directory=path.join(root,'tf3mp_status_1'),failures=[];
  const bridge=await startGameBridge({directory,intervalMs:10});
  let counter=0,healthy=true;
  async function sample(tickCount,speedup=1){
    counter++;
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,counter,tickCount,updateCount:50,speedup,companyEntity:7,balanceKnown:1,balanceNegative:0,balance:100}));
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,counter,tickCount,updateCount:50}));
    await until(()=>bridge.engineObservation.sample?.counter===counter);
  }
  async function receipt(r,tickCount,speedup=1){
    await writeFile(path.join(directory,'watchdog_receipt.lua'),lua({schemaVersion:1,kind:'watchdog_receipt',nonce:bridge.nonce,
      requestId:r.requestId,companyEntity:7,issuedTick:r.issuedTick,expiresTick:r.expiresTick,
      lastTick:tickCount,tickCount,updateCount:50,speedup,phase:'active',outcome:r.phase==='arm'?'armed':'renewed',reason:'none'}));
  }
  try {
    await sample(100);
    const lease=await bridge.startCoordinationLease({healthy:()=>healthy,onFailure:code=>failures.push(code)});
    assert.equal(lease.active,false);assert.equal(bridge.haltState,'not_requested');
    const arm=parseFlatDataFile(await readFile(path.join(directory,'watchdog_request.lua'),'utf8'));
    assert.equal(arm.phase,'arm');await receipt(arm,100);await until(()=>lease.active);
    await sample(140,0);
    let renew;
    await until(async()=>{renew=parseFlatDataFile(await readFile(path.join(directory,'watchdog_request.lua'),'utf8'));return renew.phase==='renew';});
    assert.equal(renew.requestId,arm.requestId+1);await receipt(renew,140,0);await until(()=>lease.phase==='active');
    await bridge.acquireCoordinationControls();assert.equal(bridge.coordinationControlsLocked,false);
    await writeFile(path.join(directory,'control_receipt.lua'),lua({schemaVersion:1,kind:'control_receipt',nonce:bridge.nonce,phase:'acquire',outcome:'acquired'}));
    await until(()=>bridge.coordinationControlsLocked);
    await sample(141,1);assert.equal(bridge.coordinationControlsLocked,true);
    await assert.rejects(bridge.acquireCoordinationControls(),/HOLD_REQUIRED|ALREADY_USED/);
    for(const method of ['requestWatchdogTest','requestHaltTest','requestPauseTest','enableVehicleTest','requestEngineProbe','requestCompanyTest','inspectCompanies'])
      await assert.rejects(bridge[method](),/BUSY/);
    healthy=false;await until(()=>lease.phase==='failed');assert.deepEqual(failures,['SESSION_UNHEALTHY']);
    await sample(180,0);
    const after=parseFlatDataFile(await readFile(path.join(directory,'watchdog_request.lua'),'utf8'));
    assert.equal(after.requestId,renew.requestId);assert.equal(bridge.haltState,'not_requested');
    await assert.rejects(bridge.startCoordinationLease({healthy:()=>true,onFailure:()=>{}}),/BUSY/);
    await bridge.close();assert.equal(lease.phase,'closed');
  } finally {await bridge.close();await rm(root,{recursive:true,force:true});}
});

test('coordinator setup reads existing company and nonce-bound vehicle selection without mutating the game',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-selection-')),directory=path.join(root,'tf3mp_status_1');
  const bridge=await startGameBridge({directory,intervalMs:10});
  try{
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:50,speedup:1,companyEntity:7,balanceKnown:1,balanceNegative:0,balance:100}));
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:50}));
    await until(()=>bridge.engineObservation.available);await bridge.beginCoordinatorSelection();
    const config=parseFlatDataFile(await readFile(path.join(directory,'bridge.lua'),'utf8'));
    const req=parseFlatDataFile(await readFile(path.join(directory,'company_inspect_request.lua'),'utf8'));
    assert.equal(config.mode,'telemetry');
    await writeFile(path.join(directory,'coordinator_selection.lua'),lua({schemaVersion:1,nonce:bridge.nonce,selectionId:'f'.repeat(32),entity:42}));
    const result={schemaVersion:1,kind:'company_inspection',nonce:bridge.nonce,requestId:req.requestId,outcome:'inspected',tickCount:100,updateCount:50,companyEntity:7,newCompanyEntity:9};
    for(const prefix of ['original','created'])for(const suffix of ['Balance','Known','Negative','Assets','Vehicles','Lines'])result[prefix+suffix]=suffix==='Known'?1:0;
    await writeFile(path.join(directory,'company_inspection.lua'),lua(result));
    await until(()=>bridge.coordinatorSetup.inspection==='inspected');assert.equal(bridge.coordinatorSetup.vehicleEntity,null);
    await writeFile(path.join(directory,'coordinator_selection.lua'),lua({schemaVersion:1,nonce:bridge.nonce,selectionId:config.selectionId,entity:42}));
    await until(()=>bridge.coordinatorSetup.vehicleEntity===42);assert.equal(bridge.coordinatorSetup.secondCompanyEntity,9);
    await assert.rejects(readFile(path.join(directory,'coordination_request.lua')),{code:'ENOENT'});
    await assert.rejects(bridge.beginCoordinatorSelection(),/BUSY/);
  }finally{await bridge.close();await rm(root,{recursive:true,force:true});}
});

test("real bridge rejects producer restart and never publishes a subsequent hold",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"tf3mp-producer-reset-"));
  const directory=path.join(root,"tf3mp_status_1"),events=[];
  const bridge=await startGameBridge({directory,intervalMs:10,logger:e=>events.push(e)});
  const observation=counter=>lua({schemaVersion:1,kind:"engine_observation",nonce:bridge.nonce,
    counter,tickCount:100,updateCount:50,speedup:1,companyEntity:7,balanceKnown:1,balanceNegative:0,balance:100});
  try {
    await writeFile(path.join(directory,"engine_observation.lua"),observation(20));
    await writeFile(path.join(directory,"telemetry.lua"),lua({schemaVersion:1,kind:"telemetry",nonce:bridge.nonce,counter:20,tickCount:100,updateCount:50}));
    await until(()=>bridge.engineObservation.available);
    await writeFile(path.join(directory,"engine_observation.lua"),observation(1));
    await until(()=>bridge.engineObservation.fault==="OBSERVATION_PRODUCER_RESET");
    await writeFile(path.join(directory,"engine_observation.lua"),observation(21));
    await assert.rejects(bridge.requestPauseTest({scheduled:true}),/OBSERVATION_REQUIRED/);
    await assert.rejects(readFile(path.join(directory,"pause_request.lua")),{code:"ENOENT"});
    assert.equal(bridge.engineObservation.available,false);
    assert.equal(events.filter(e=>e.event==="engine_observation_invalidated").length,1);
  } finally {await bridge.close();await rm(root,{recursive:true,force:true});}
});
test("real file bridge confirms a halt receipt with fresh observations and fences all later actions",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"tf3mp-halt-")),directory=path.join(root,"tf3mp_status_1"),events=[];
  const bridge=await startGameBridge({directory,intervalMs:10,logger:e=>events.push(e)});
  let counter=0;
  async function sample(tickCount,updateCount,speedup){
    counter++;
    await writeFile(path.join(directory,"engine_observation.lua"),lua({schemaVersion:1,kind:"engine_observation",nonce:bridge.nonce,counter,tickCount,updateCount,speedup,companyEntity:7,balanceKnown:1,balanceNegative:0,balance:100}));
    await writeFile(path.join(directory,"telemetry.lua"),lua({schemaVersion:1,kind:"telemetry",nonce:bridge.nonce,counter,tickCount,updateCount}));
    await until(()=>bridge.engineObservation.sample?.counter===counter);
  }
  try{
    await sample(100,50,1);await bridge.requestHaltTest();
    assert.equal(bridge.haltState,"awaiting_receipt");
    const request=parseFlatDataFile(await readFile(path.join(directory,"halt_request.lua"),"utf8"));
    await sample(102,51,0);
    await writeFile(path.join(directory,"halt_receipt.lua"),lua({schemaVersion:1,kind:"halt_receipt",nonce:bridge.nonce,requestId:request.requestId,companyEntity:7,tickCount:101,updateCount:51,speedup:0,outcome:"halted"}));
    await until(()=>bridge.haltState==="settling");
    await new Promise(r=>setTimeout(r,1550));
    assert.equal(bridge.haltState,"settling");
    await sample(112,51,0);await until(()=>bridge.haltState==="confirmed");
    for(const method of ["requestHaltTest","requestPauseTest","enableVehicleTest","requestCompanyTest","requestEngineProbe","inspectCompanies"])
      await assert.rejects(bridge[method](),/BUSY/);
    await assert.rejects(bridge.releasePauseTest(),/NOT_HELD/);
    await sample(113,52,1);await until(()=>bridge.haltState==="unknown");
    assert.equal(events.filter(e=>e.event==="halt_test_confirmed").length,1);
    await assert.rejects(readFile(path.join(directory,"halt_request.lua")),{code:"ENOENT"});
  }finally{await bridge.close();await rm(root,{recursive:true,force:true});}
});

test('repeated old bridge shutdown cannot remove a replacement helper lock',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-close-once-')),directory=path.join(root,'tf3mp_status_1');
  const first=await startGameBridge({directory,intervalMs:10});
  let replacement;
  try {
    const a=first.close(),b=first.close();assert.equal(a,b);await a;
    replacement=await startGameBridge({directory,intervalMs:10});
    await first.close();await readFile(path.join(directory,'bridge.lock'));
    await assert.rejects(startGameBridge({directory,intervalMs:10}),{code:'EEXIST'});
  } finally {await first.close();await replacement?.close();await rm(root,{recursive:true,force:true});}
});

for (const outcome of ["expired", "missing"]) test(`real watchdog mailbox handles ${outcome} receipts without renewals or later commands`,async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"tf3mp-watchdog-")),directory=path.join(root,"tf3mp_status_1"),events=[];
  const bridge=await startGameBridge({directory,intervalMs:10,logger:e=>events.push(e)});
  let counter=0;
  async function sample(tickCount,updateCount,speedup){
    counter++;
    await writeFile(path.join(directory,"engine_observation.lua"),lua({schemaVersion:1,kind:"engine_observation",nonce:bridge.nonce,counter,tickCount,updateCount,speedup,companyEntity:7,balanceKnown:1,balanceNegative:0,balance:100}));
    await writeFile(path.join(directory,"telemetry.lua"),lua({schemaVersion:1,kind:"telemetry",nonce:bridge.nonce,counter,tickCount,updateCount}));
    await until(()=>bridge.engineObservation.sample?.counter===counter);
  }
  try {
    await sample(100,50,1);await bridge.requestWatchdogTest();
    assert.equal(bridge.haltState,"awaiting_arm");
    const request=parseFlatDataFile(await readFile(path.join(directory,"watchdog_request.lua"),"utf8"));
    assert.equal(request.expiresTick,200);assert.equal(request.phase,"arm");
    assert.equal(parseFlatDataFile(await readFile(path.join(directory,"bridge.lua"),"utf8")).mode,"watchdog_test");
    if(outcome==="expired") {
      const receipt={schemaVersion:1,kind:"watchdog_receipt",nonce:bridge.nonce,requestId:request.requestId,companyEntity:7,
        issuedTick:100,expiresTick:200,lastTick:101,tickCount:101,updateCount:51,speedup:1,phase:"active",outcome:"armed",reason:"none"};
      await writeFile(path.join(directory,"watchdog_receipt.lua"),lua(receipt));
      await until(()=>bridge.haltState==="awaiting_expiry");
      await assert.rejects(readFile(path.join(directory,"watchdog_request.lua")),{code:"ENOENT"});
      await sample(201,150,0);
      await writeFile(path.join(directory,"watchdog_receipt.lua"),lua({...receipt,lastTick:200,tickCount:200,updateCount:150,speedup:0,phase:"stopped",outcome:"halted",reason:"expired"}));
      await until(()=>bridge.haltState==="settling");
      await new Promise(r=>setTimeout(r,1550));await sample(212,150,0);
      await until(()=>bridge.haltState==="confirmed");
      assert.equal(events.filter(e=>e.event==="watchdog_test_confirmed").length,1);
    } else {
      await sample(201,150,0); // Pausing without a receipt is not watchdog proof.
      assert.equal(bridge.haltState,"awaiting_arm");
      assert.equal(events.filter(e=>e.event==="watchdog_test_confirmed").length,0);
    }
    for(const method of ["requestWatchdogTest","requestHaltTest","requestPauseTest","enableVehicleTest","requestEngineProbe"])
      await assert.rejects(bridge[method](),/BUSY/);
    await bridge.close();
    for(const filename of ["watchdog_request.lua","watchdog_receipt.lua"])
      await assert.rejects(readFile(path.join(directory,filename)),{code:"ENOENT"});
    assert.ok(events.some(e=>e.event==="watchdog_test_unknown"));
  } finally {await bridge.close();await rm(root,{recursive:true,force:true});}
});

for (const mode of ["immediate", "scheduled", "combined", "controls", "batch"]) test(`real file bridge isolates ${mode} pause, requires release and cleans up`, async () => {
  const scheduled = mode !== "immediate", withVehicle = mode === "combined" || mode === "batch";
  const heldUpdate = scheduled ? 90 : 50;
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-pause-")), directory = path.join(root, "tf3mp_status_1"), events = [];
  let batch;
  const reports=[];
  const bridge = await startGameBridge({ directory, intervalMs: 10, logger: e => { events.push(e); batch?.onEvent(e); } });
  if(mode === "batch") batch=createLocalIntegrationBatch({bridge,logger:e => events.push(e),saveReport:async r => reports.push(r)});
  let counter = 0;
  const sample = async (tickCount, updateCount, speedup) => {
    counter++;
    await writeFile(path.join(directory, "engine_observation.lua"), lua({ schemaVersion: 1, kind: "engine_observation", nonce: bridge.nonce,
      counter, tickCount, updateCount, speedup, companyEntity: 7, balanceKnown: 1, balanceNegative: 0, balance: 100 }));
    await writeFile(path.join(directory, "telemetry.lua"), lua({ schemaVersion: 1, kind: "telemetry", nonce: bridge.nonce, counter, tickCount, updateCount }));
    await until(() => bridge.engineObservation.sample?.counter === counter);
  };
  const request = async () => parseFlatDataFile(await readFile(path.join(directory, "pause_request.lua"), "utf8"));
  const respond = async (req, outcome, tickCount, speedup) => writeFile(path.join(directory, "pause_receipt.lua"), lua({
    schemaVersion: 1, kind: "pause_receipt", nonce: bridge.nonce, requestId: req.requestId, phase: req.phase,
    companyEntity: 7, heldUpdate, tickCount, updateCount: heldUpdate, speedup, outcome }));
  try {
    await assert.rejects(bridge.requestPauseTest(), /OBSERVATION_REQUIRED/);
    await sample(100, 50, 1);
    if(batch) {
      batch.start(); let probe;
      await until(async () => {try {probe=parseFlatDataFile(await readFile(path.join(directory,"engine_request.lua"),"utf8")); return true;} catch {return false;}});
      await writeFile(path.join(directory,"engine_receipt.lua"),lua({schemaVersion:1,kind:"engine_receipt",nonce:bridge.nonce,requestId:probe.requestId,tickCount:100,updateCount:50}));
      await until(async () => {try {await request(); return true;} catch {return false;}});
    } else await bridge.requestPauseTest({ scheduled, withVehicle });
    const first = await request(); assert.equal(first.phase, "pause");
    assert.equal(first.scheduledUpdate, scheduled ? heldUpdate : 0);
    for (const method of ["requestPauseTest", "inspectCompanies", "requestCompanyTest", "enableVehicleTest", "requestEngineProbe"]) await assert.rejects(bridge[method](), /BUSY/);
    await sample(101, heldUpdate, 0); await respond(first, "paused", 101, 0);
    await sample(110, heldUpdate, 0);
    let check;
    await until(async () => { try { check = await request(); return check.phase === "check"; } catch { return false; } });
    await sample(120, heldUpdate, 0); await respond(check, "checked", 120, 0);
    await until(() => events.some(e => e.event === "pause_test_held"));
    await assert.rejects(readFile(path.join(directory, "pause_request.lua")), { code: "ENOENT" });
    if (withVehicle) {
      await until(() => events.some(e => e.event === "combined_test_select_vehicle"));
      await assert.rejects(bridge.releasePauseTest(), /HELD_VEHICLE_ACTION_REQUIRED/);
      await writeFile(path.join(directory, "vehicle_intent.lua"), lua({ schemaVersion: 1, kind: "vehicle_intent", nonce: bridge.nonce, requestId: 1, entity: 42, stopFlag: 1 }));
      let cmd;
      const waitPhase = async phase => until(async () => { try { cmd = parseFlatDataFile(await readFile(path.join(directory, "vehicle_command.lua"), "utf8")); return cmd.phase === phase; } catch { return false; } });
      const vehicleResponse = async outcome => writeFile(path.join(directory, "vehicle_receipt.lua"), lua({ schemaVersion: 2, kind: "vehicle_receipt", nonce: bridge.nonce,
        actionId: cmd.actionId, entity: 42, phase: cmd.phase, company: 7, localPlayer: 7, revision: 12, stopFlag: 1, tickCount: 120,
        updateCount: heldUpdate, hostSequence: cmd.hostSequence, scheduledUpdate: cmd.scheduledUpdate, outcome }));
      await waitPhase("inspect"); assert.equal(cmd.schemaVersion, 2); await vehicleResponse("inspected");
      await waitPhase("commit"); assert.equal(cmd.scheduledUpdate, heldUpdate); await vehicleResponse("applied");
      let previousId=0;
      for(let i=0;i<2;i++) {
        let snapshot;
        await until(async () => {try {snapshot=parseFlatDataFile(await readFile(path.join(directory,"snapshot_request.lua"),"utf8")); return snapshot.requestId>previousId;} catch {return false;}});
        previousId=snapshot.requestId;
        await assert.rejects(bridge.releasePauseTest(),/HELD_VEHICLE_ACTION_REQUIRED/);
        await writeFile(path.join(directory,"snapshot_receipt.lua"),lua({schemaVersion:1,kind:"held_snapshot",nonce:bridge.nonce,
          requestId:snapshot.requestId,companyEntity:7,entity:42,heldUpdate,tickCount:121+i,updateCount:heldUpdate,speedup:0,
          ownerCompanyEntity:7,revision:12,stopFlag:1,balance:100,balanceNegative:0,outcome:"captured"}));
      }
      await until(() => events.some(e => e.event === "combined_test_action_held"));
    }
    if (mode === "controls" || batch) {
      if(batch) await until(async () => {try {await readFile(path.join(directory,"control_request.lua")); return true;} catch {return false;}});
      else await bridge.requestControlTest();
      const req = parseFlatDataFile(await readFile(path.join(directory, "control_request.lua"), "utf8"));
      assert.equal(req.phase, "acquire");
      await assert.rejects(bridge.releasePauseTest(), /RELEASE_SPEED_CONTROLS_FIRST/);
      const ack = async (phase, outcome) => writeFile(path.join(directory, "control_receipt.lua"), lua({schemaVersion:1, kind:"control_receipt", nonce:bridge.nonce, phase, outcome}));
      await ack("acquire", "acquired"); await until(() => events.some(e => e.event === "control_test_locked"));
      if(batch) {batch.confirmControls(); await until(() => batch.phase === "restoring");}
      else await bridge.requestControlTest({ release:true });
      await until(async () => {const r=parseFlatDataFile(await readFile(path.join(directory,"control_request.lua"),"utf8")); return r.phase === "release";});
      await assert.rejects(bridge.releasePauseTest(), /RELEASE_SPEED_CONTROLS_FIRST/);
      await ack("release", "released"); await until(() => events.some(e => e.event === "control_test_released"));
      await assert.rejects(readFile(path.join(directory, "control_request.lua")), {code:"ENOENT"});
    }
    if(batch) await until(async () => {try {return (await request()).phase === "resume";} catch {return false;}});
    else await bridge.releasePauseTest();
    const release = await request(); assert.equal(release.phase, "resume");
    await respond(release, "resumed", 121, 1); await sample(122, heldUpdate + 1, 1);
    await until(() => events.some(e => e.event === "pause_test_passed"));
    if (withVehicle) await until(() => events.some(e => e.event === "combined_test_passed"));
    if(batch) {
      let stop;
      await until(async()=>{try{stop=parseFlatDataFile(await readFile(path.join(directory,"watchdog_request.lua"),"utf8"));return true;}catch{return false;}});
      assert.equal(batch.phase,"halting");
      await sample(stop.expiresTick+1,heldUpdate+2,0);
      await writeFile(path.join(directory,"watchdog_receipt.lua"),lua({schemaVersion:1,kind:"watchdog_receipt",nonce:bridge.nonce,requestId:stop.requestId,companyEntity:7,
        issuedTick:stop.issuedTick,expiresTick:stop.expiresTick,lastTick:stop.expiresTick,tickCount:stop.expiresTick,updateCount:heldUpdate+2,speedup:0,phase:"stopped",outcome:"halted",reason:"expired"}));
      await until(()=>bridge.haltState==="settling");
      await new Promise(r=>setTimeout(r,1550));await sample(stop.expiresTick+15,heldUpdate+2,0);
      await until(()=>batch.phase==="passed");
      await batch.flush();assert.equal(reports.at(-1).outcome,"local_only_passed");
      assert.equal(reports.at(-1).terminalStop.heldUpdate,heldUpdate+2);
    }
    assert.equal(events.at(-1).gameplayVerified, false);
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});
