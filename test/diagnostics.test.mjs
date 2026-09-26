import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticLogger } from "../src/diagnostics.mjs";

test("Join save progress exposes bounded counts and phase without private metadata", () => {
  const records=[];
  const log=diagnosticLogger({write:text=>records.push(JSON.parse(text))});
  log({event:"join_save_transfer_progress",phase:"downloading",receivedBytes:65536,
    totalBytes:180000,host:"private",secret:"private"});
  assert.equal(records[0].phase,"downloading");
  assert.equal(records[0].receivedBytes,65536);
  assert.equal(records[0].totalBytes,180000);
  assert.equal(records[0].host,undefined);
  assert.equal(records[0].secret,undefined);
});

test("Join preparation emits only a bounded save name for launcher receipt", () => {
  const records=[];
  const log=diagnosticLogger({write:text=>records.push(JSON.parse(text))});
  const saveName=`tf3mp_disposable_${'a'.repeat(32)}`;
  log({event:'join_save_prepared',saveName,path:'C:\\private\\save.sav',requestPath:'C:\\private\\request.lua',bytes:7,sha256:'b'.repeat(64)});
  assert.equal(records[0].saveName,saveName);
  assert.equal(records[0].path,undefined);
  assert.equal(records[0].requestPath,undefined);
  log({event:'join_save_prepared',saveName:'..\\private'});
  assert.equal(records[1].saveName,undefined);
});

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

test("Host Stop permit and terminal diagnostics retain only bounded evidence", () => {
  const records=[];
  const log=diagnosticLogger({write:text=>records.push(JSON.parse(text))});
  log({event:'host_cancelled_stop_permit_ready',entity:77,expectedInvocation:'23',
    permitDeadlineUnix:123,nonce:'private'});
  assert.equal(records[0].entity,77);
  assert.equal(records[0].expectedInvocation,'23');
  assert.equal(records[0].permitDeadlineUnix,123);
  assert.equal(records[0].nonce,undefined);
  log({event:'host_cancelled_stop_native_terminal',armState:'expired',
    correlatedHitsDelta:'0',callbackHitsDelta:'0',marshalerReturnHitsDelta:'0',
    callbackResultZero:false,raw:{secret:true}});
  assert.equal(records[1].armState,'expired');
  assert.equal(records[1].correlatedHitsDelta,'0');
  assert.equal(records[1].callbackResultZero,false);
  assert.equal(records[1].raw,undefined);
  log({event:'host_cancelled_stop_completed',entity:77,company:101,hostSequence:1,
    nativeInvocation:'23',observedStopFlag:1,observedUpdateCount:60,
    stateHash:'a'.repeat(64),singleGameStopVerified:true,nonce:'private'});
  assert.equal(records[2].nativeInvocation,'23');
  assert.equal(records[2].observedStopFlag,1);
  assert.equal(records[2].observedUpdateCount,60);
  assert.equal(records[2].singleGameStopVerified,true);
  assert.equal(records[2].nonce,undefined);
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
  log({event:'host_action_clock',roundId:'round-1',playerId:'join-1',
    hostUpdateCount:100,peerUpdateCount:101});
  assert.equal(records.at(-1).hostUpdateCount,100);
  assert.equal(records.at(-1).peerUpdateCount,101);
  log({event:'engine_checkpoint_evidence',roundId:'round-1',checkpointHash:hash,
    comparisonReady:true,unavailableCount:1});
  assert.equal(records[4].comparisonReady,true);
  assert.equal(records[4].unavailableCount,1);
  log({event:'engine_execution_evidence',roundId:'C:\\private',stateHash:'secret',entity:-1,
    operationId:'x'.repeat(129),stopped:'true'});
  for(const field of ['roundId','stateHash','entity','operationId','stopped'])
    assert.equal(records[5][field],undefined);
  log({event:'unrelated',roundId:'round-1',stateHash:hash,entity:42});
  for(const field of ['roundId','stateHash','entity'])assert.equal(records[6][field],undefined);
});

test('divergence diagnostics retain only bounded comparison evidence',()=>{
  let output='';
  diagnosticLogger({write:text=>{output+=text;}})({event:'session_divergence',sessionId:'session-1',
    kind:'state',roundId:'round-1',playerId:'player-1',companyEntity:7,
    updateCount:160,hostSequence:1,buildHash:'c'.repeat(64),modManifestHash:'d'.repeat(64),
    expectedHash:'a'.repeat(64),observedHash:'b'.repeat(64),
    expectedSource:'participant',expectedPlayerId:'player-0',expectedCompanyEntity:6,
    rawReceipt:{secret:'private'},path:'C:\\private',nonce:'private'});
  const record=JSON.parse(output);
  assert.equal(record.expectedHash,'a'.repeat(64));
  assert.equal(record.observedHash,'b'.repeat(64));
  assert.equal(record.roundId,'round-1');
  assert.equal(record.buildHash,'c'.repeat(64));
  assert.equal(record.modManifestHash,'d'.repeat(64));
  assert.equal(record.expectedSource,'participant');
  assert.equal(record.expectedPlayerId,'player-0');
  assert.equal(record.expectedCompanyEntity,6);
  for(const field of ['rawReceipt','path','nonce'])assert.equal(record[field],undefined);
  let baseline='';
  diagnosticLogger({write:text=>{baseline+=text;}})({event:'session_divergence',
    expectedSource:'operator_baseline',expectedPlayerId:null,expectedCompanyEntity:null});
  assert.equal(JSON.parse(baseline).expectedSource,'operator_baseline');
  assert.equal(JSON.parse(baseline).expectedPlayerId,null);
  assert.equal(JSON.parse(baseline).expectedCompanyEntity,null);
  let invalid='';
  diagnosticLogger({write:text=>{invalid+=text;}})({event:'session_divergence',
    expectedSource:'participant',expectedPlayerId:'private/path',expectedCompanyEntity:6});
  for(const field of ['expectedSource','expectedPlayerId','expectedCompanyEntity'])
    assert.equal(JSON.parse(invalid)[field],undefined);
});
