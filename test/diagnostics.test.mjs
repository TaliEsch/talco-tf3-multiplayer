import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticLogger } from "../src/diagnostics.mjs";

test("local cancel terminal diagnostic keeps bounded counters without raw evidence", () => {
  const records=[];
  const log=diagnosticLogger({write:text=>records.push(JSON.parse(text))});
  const names=["factoryHits", "admissionHits", "correlatedHits", "callbackHits",
    "sendReturnHits", "marshalerReturnHits", "postSendBodyCorrelatedHits", "droppedCandidates"];
  log({event:"local_cancel_stop_terminal_diagnostic",armState:"expired",expectedInvocation:42,
    counterDeltas:Object.fromEntries(names.map(name=>[name,"1"])),secret:"private"});
  assert.equal(records[0].armState,"expired");
  assert.equal(records[0].expectedInvocation,42);
  assert.equal(records[0].counterDeltas.factoryHits,"1");
  assert.equal(records[0].secret,undefined);
});

test("replay workflow retains bounded launcher artifact identities without secrets", () => {
  const records=[];
  const log=diagnosticLogger({write:text=>records.push(JSON.parse(text))});
  const recordId="b".repeat(32),caseDigest="c".repeat(64);
  for(const code of ['RECORDING_STARTED','CAPTURE_SAVED','READY_TO_CONFIRM']) {
    log({event:'road_stop_replay_workflow',code,recordId,caseDigest,nonce:'secret',source:'private'});
    assert.equal(records.at(-1).recordId,recordId);
    assert.equal(records.at(-1).caseDigest,caseDigest);
    assert.equal(records.at(-1).nonce,undefined);
    assert.equal(records.at(-1).source,undefined);
  }
  log({event:'other',recordId,caseDigest});
  assert.equal(records.at(-1).recordId,undefined);
  assert.equal(records.at(-1).caseDigest,undefined);
  log({event:'road_stop_replay_workflow',code:'CAPTURE_UNSUPPORTED',issues:'roadlaneConfigsNil_roadlaneConfigNil',nonce:'private'});
  assert.equal(records.at(-1).issues,'roadlaneConfigsNil_roadlaneConfigNil');
  assert.equal(records.at(-1).nonce,undefined);
  for(const issues of ['private/path','a'.repeat(97),'A_'.repeat(24)+'A']) {
    log({event:'road_stop_replay_workflow',issues});
    assert.equal(records.at(-1).issues,undefined);
  }
  log({event:'unrelated',issues:'Private'});
  assert.equal(records.at(-1).issues,undefined);
  log({event:'road_stop_replay_workflow',recordId:'../private',caseDigest:'secret'});
  assert.equal(records.at(-1).recordId,undefined);
  assert.equal(records.at(-1).caseDigest,undefined);
});

test("station template diagnostic receipts retain approved scalar fields and redact raw evidence", () => {
  let output = "";
  const nonce = "a".repeat(32);
  diagnosticLogger({ write: text => { output += text; } })({
    event: "station_template_receipt", requestId: 3, paramsPresent: 1, modulesPresent: 1,
    moduleCount: 4, subconstructionCount: 2, costKnown: 1, cost: 100, templateIndex: 0,
    platforms: 1, nonce, raw: `receipt-${nonce}`, payload: { nonce }, error: new Error(`failed-${nonce}`)
  });
  const record = JSON.parse(output);
  assert.deepEqual(Object.fromEntries(Object.entries(record).filter(([key]) => key !== "timestamp")), {
    event: "station_template_receipt", requestId: 3, paramsPresent: 1, modulesPresent: 1,
    moduleCount: 4, subconstructionCount: 2, costKnown: 1, cost: 100, templateIndex: 0, platforms: 1
  });
  assert.equal(output.includes(nonce), false);
  assert.equal(output.includes("receipt-"), false);
  assert.equal(output.includes("failed-"), false);
});

test("purchase diagnostics preserve ownership and signed balance evidence but not model paths or nonce", () => {
  let output = "";
  diagnosticLogger({write:text=>{output+=text;}})({event:'phase2_vehicle_result',outcome:'verified',
    targetCompany:20,depotEntity:31,vehicleEntity:32,vehicleOwner:20,depotOwner:20,chargedCost:100,
    originalBefore:5000,originalBeforeNegative:0,originalAfter:5000,originalAfterNegative:0,
    targetBefore:1000,targetBeforeNegative:0,targetAfter:900,targetAfterNegative:0,
    model:'private::/example.mdl',nonce:'secret',balances:{private:'no'}});
  const record=JSON.parse(output);
  assert.equal(record.targetAfter,900);
  assert.equal(record.targetAfterNegative,0);
  assert.equal(record.outcome,'verified');
  assert.equal(record.vehicleOwner,20);
  assert.equal(record.model,undefined);
  assert.equal(record.nonce,undefined);
  assert.equal(record.balances,undefined);
});

test('Stop evidence logger retains bounded correlation fields and redacts raw receipts',()=>{
  const records=[];
  const log=diagnosticLogger({write:text=>records.push(JSON.parse(text))});
  const hash='a'.repeat(64);
  log({event:'engine_execution_evidence',role:'host',roundId:'round-1',operationId:'op-1',
    hostSequence:1,updateCount:160,entity:42,ownerCompanyEntity:7,stopped:true,stateHash:hash,
    nonce:'private',receipt:{nonce:'private'},path:'C:\\private'});
  assert.deepEqual(Object.fromEntries(Object.entries(records[0]).filter(([key])=>key!=='timestamp')),
    {event:'engine_execution_evidence',role:'host',roundId:'round-1',operationId:'op-1',
      hostSequence:1,updateCount:160,entity:42,ownerCompanyEntity:7,stopped:true,stateHash:hash});
  log({event:'peer_command_applied',roundId:'round-1',playerId:'join-1',hostSequence:1,
    updateCount:160,stateHash:hash});
  assert.equal(records[1].roundId,'round-1');
  assert.equal(records[1].stateHash,hash);
  log({event:'command_proposed',admissionUpdate:100,scheduledUpdate:160,scheduleLeadUpdates:60});
  assert.equal(records[2].admissionUpdate,100);
  assert.equal(records[2].scheduleLeadUpdates,60);
  log({event:'engine_checkpoint_evidence',roundId:'round-1',checkpointHash:hash,
    comparisonReady:true,unavailableCount:1});
  assert.equal(records[3].comparisonReady,true);
  assert.equal(records[3].unavailableCount,1);
  log({event:'engine_execution_evidence',roundId:'C:\\private',stateHash:'secret',entity:-1,
    operationId:'x'.repeat(129),stopped:'true'});
  for(const field of ['roundId','stateHash','entity','operationId','stopped'])
    assert.equal(records[4][field],undefined);
  log({event:'unrelated',roundId:'round-1',stateHash:hash,entity:42});
  for(const field of ['roundId','stateHash','entity'])assert.equal(records[5][field],undefined);
});
