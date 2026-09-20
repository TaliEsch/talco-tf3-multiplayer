import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createLocalIntegrationBatch } from "../src/local-integration-batch.mjs";
import { createBatchReportWriter } from "../src/batch-report.mjs";
const tick = () => new Promise(resolve => setImmediate(resolve));
test("batch timing uses monotonic time even when the wall clock moves backwards",async()=>{
  let wall=10000,mono=200;
  const b=createLocalIntegrationBatch({bridge:{requestEngineProbe:async()=>{},requestPauseTest:async()=>{}},
    logger:()=>{},saveReport:async()=>{},now:()=>wall,monotonicNow:()=>mono});
  b.start(); b.onEvent({event:"engine_probe_started"});
  wall=5000; mono=250; b.onEvent({event:"engine_probe_succeeded"});
  await b.flush();
  assert.equal(b.report.timing.samples[0].observedDurationMs,50);
  assert.equal(b.report.events[1].at,5000);
  await b.stop();
});
function fixture(save) {
  const calls=[],events=[],reports=[];
  const bridge=Object.fromEntries(["requestEngineProbe","requestPauseTest","requestControlTest","releasePauseTest","requestWatchdogTest"].map(method => [method,async args => calls.push({method,args})]));
  const b=createLocalIntegrationBatch({bridge,logger:e => events.push(e),saveReport:save ?? (async r => reports.push(r)),now:() => 1,metadata:{gameHash:"a".repeat(64),modManifestHash:"b".repeat(64)}});
  const event=(name,extra={}) => b.onEvent({event:name,...extra});
  const controls=async () => {
    b.start(); await tick(); event("engine_probe_succeeded"); await tick();
    event("pause_test_held",{heldUpdate:108,scheduledUpdate:108});
    event("combined_test_select_vehicle",{heldUpdate:108});
    event("vehicle_test_applied",{code:"applied",updateCount:108,scheduledUpdate:108,hostSequence:1});
    event("held_snapshot_verified",{hash:"c".repeat(64),heldUpdate:108});
    event("combined_test_action_held",{heldUpdate:108}); await tick();
    event("control_test_locked");
  };
  return {b,bridge,calls,events,reports,event,controls};
}
test("guided batch uses real bridge methods in order and requires explicit human confirmation", async () => {
  const f=fixture(); await f.controls();
  assert.deepEqual(f.calls.map(c => c.method),["requestEngineProbe","requestPauseTest","requestControlTest"]);
  assert.deepEqual(f.calls[1].args,{scheduled:true,withVehicle:true});
  assert.equal(f.b.phase,"controls"); assert.equal(f.b.report.humanConfirmation,null);
  f.b.confirmControls(); await tick(); assert.deepEqual(f.calls.at(-1),{method:"requestControlTest",args:{release:true}});
  f.event("control_test_released"); await tick(); assert.equal(f.calls.at(-1).method,"releasePauseTest");
  f.event("pause_test_passed",{heldUpdate:108,updateCount:110}); f.event("combined_test_passed"); await tick();
  assert.equal(f.b.phase,"halting");assert.equal(f.calls.at(-1).method,"requestWatchdogTest");
  f.event("watchdog_test_confirmed",{heldUpdate:112,code:"LOCAL_ENGINE_EXPIRY_STOP_CONFIRMED"});await f.b.flush();
  assert.equal(f.b.report.outcome,"local_only_passed"); assert.equal(f.reports.at(-1).phase,"passed");
  assert.equal(f.b.report.gameplayVerified,false); assert.equal(f.b.report.multiGameVerified,false);
  assert.equal(f.b.report.checks.length,9);
  assert.equal(f.b.report.testPlanVersion,3);
  assert.equal(f.b.report.terminalStop.continuousGuarantee,false);
  assert.throws(() => f.b.start(),/ALREADY_USED/);
});
for(const failure of ["engine_probe_timeout","pause_test_failed","vehicle_test_rejected","control_test_failed","halt_test_unknown","watchdog_test_unknown","bridge_disconnected","engine_observation_unavailable","engine_observation_invalidated"]) test(`batch stops without resume on ${failure}`,async () => {
  const f=fixture(); await f.controls(); const count=f.calls.length;
  f.event(failure); f.event("control_test_released"); f.event("combined_test_passed"); await tick();
  assert.equal(f.b.phase,"failed"); assert.equal(f.calls.length,count);
  assert.throws(() => f.b.confirmControls(),/NOT_READY/);
  assert.equal(f.reports.at(-1).outcome,failure);
});
test("missing or mismatched terminal halt never produces a passed report",async()=>{
  for(const receipt of [null,{heldUpdate:109,code:"LOCAL_ENGINE_EXPIRY_STOP_CONFIRMED"},{heldUpdate:112,code:"requested_only"}]){
    const f=fixture();await f.controls();f.b.confirmControls();f.event("control_test_released");
    f.event("pause_test_passed",{heldUpdate:108,updateCount:110});f.event("combined_test_passed");
    assert.equal(f.b.phase,"halting");
    if(receipt)f.event("watchdog_test_confirmed",receipt);
    assert.notEqual(f.b.phase,"passed");await f.b.stop();
    assert.equal(f.events.some(e=>e.code==="LOCAL_BATCH_PASSED_REPORT_SAVED"),false);
  }
});
test("user-reported bypass and stop do not silently resume or undo action",async () => {
  const f=fixture(); await f.controls(); f.b.rejectControls(); await f.b.stop();
  assert.equal(f.b.report.outcome,"user_reported_control_bypass");
  assert.equal(f.calls.some(c => c.method==="releasePauseTest"),false);
  const g=fixture(); await g.controls(); await g.b.stop();
  assert.equal(g.reports.at(-1).outcome,"interrupted_outcome_unknown");
});
test("wrong held update cannot unlock the next action stage",async () => {
  const f=fixture(); f.b.start(); f.event("engine_probe_succeeded");
  f.event("pause_test_held",{heldUpdate:109,scheduledUpdate:108}); await tick();
  assert.equal(f.b.report.outcome,"hold_mismatch"); assert.equal(f.calls.some(c=>c.method==="requestControlTest"),false);
});
test("missing vehicle and resume receipts cannot certify batch success",async () => {
  const f=fixture(); f.b.start(); f.event("engine_probe_succeeded");
  f.event("pause_test_held",{heldUpdate:108,scheduledUpdate:108}); f.event("combined_test_select_vehicle",{heldUpdate:108});
  f.event("combined_test_action_held",{heldUpdate:108}); assert.equal(f.b.report.outcome,"vehicle_receipt_missing");
  const g=fixture(); await g.controls(); g.b.confirmControls(); g.event("control_test_released"); g.event("combined_test_passed");
  assert.equal(g.b.report.outcome,"resume_receipt_missing");
});
test("bridge publication rejection cannot be interpreted as completed work",async () => {
  const f=fixture(); f.bridge.requestEngineProbe=async () => {throw new Error("unknown");};
  f.b.start(); await tick(); assert.equal(f.b.report.outcome,"bridge_request_failed");
});
test("report storage failure prevents a success announcement",async () => {
  const f=fixture(async () => {throw new Error("disk full");}); f.b.start(); await f.b.flush();
  assert.equal(f.b.phase,"failed"); assert.equal(f.events.some(e=>e.code==="LOCAL_BATCH_PASSED_REPORT_SAVED"),false);
});
test("report redacts payloads and secret-like metadata",async () => {
  const f=fixture(); f.b.start(); f.event("engine_probe_started",{secret:"never-save",payload:{code:"private"}}); await f.b.flush();
  assert.equal(JSON.stringify(f.reports).includes("never-save"),false);
  assert.equal(JSON.stringify(f.reports).includes("private"),false);
});
test("report writer preserves one readable report across updates",async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),"tf3mp-batch-report-"));
  try {
    const writer=await createBatchReportWriter(root); const f=fixture(writer); await f.controls(); await f.b.stop();
    const dirs=await readdir(root); assert.equal(dirs.length,1);
    const report=JSON.parse(await readFile(path.join(root,dirs[0],"report.json"),"utf8"));
    assert.equal(report.outcome,"interrupted_outcome_unknown");
    assert.deepEqual(await readdir(path.join(root,dirs[0])),["report.json"]);
  } finally {await rm(root,{recursive:true,force:true});}
});
