import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { startGameBridge } from "./game-bridge.mjs";
import { startHost } from "./host.mjs";
import { connectClient } from "./client.mjs";
import { readGameBuild, describeBuild, sha256File } from "./compatibility.mjs";
import { diagnosticLogger } from "./diagnostics.mjs";
import { hashManifest } from "./manifest.mjs";
import { validateReviewPackage } from "./review-validator.mjs";
import { processProbeOnce } from "./userdata-ipc.mjs";
import { downloadSave, startSaveServer } from "./save-transfer.mjs";
import nodePath from "node:path";
import { createLocalIntegrationBatch } from "./local-integration-batch.mjs";
import { createBatchReportWriter } from "./batch-report.mjs";
import { createLocalCoordinatorRun } from "./local-coordinator-run.mjs";
import {cancelOneLocalStop} from './local-native-cancel-gate.mjs';
import {createPhase2SetupSession} from './phase2-setup-session.mjs';
import {beginRoadStopReplayRecording,finishRoadStopReplayRecording,loadRoadStopReplayRecordingCase,previewRoadStopReplayCaptureDiagnostics,readRoadStopReadbackDiagnostic} from './road-stop-replay-session.mjs';
import {checkRoadStopReplayIdentity} from './road-stop-replay-case.mjs';
import {openNativeHostJoinGate,resolveNativeHostJoinMode} from './native-host-join.mjs';
import {prepareDisposableStartupLoad} from './startup-load.mjs';
import {verifyPreparedJoinSave} from './prepared-join-save.mjs';
import {connectHostLocalParticipant,hasSoleHostLocalParticipant} from './host-local-participant.mjs';
import {loadHostLocalEngineFactory} from './host-local-cli-seam.mjs';
import {liveHostUpdateCount} from './live-host-clock.mjs';
import {createTwoCompanyHostCapture} from './two-company-host-capture.mjs';
import {createHostRosterCapture} from './host-roster-capture.mjs';
import {createHostCancelledStop} from './host-cancelled-stop.mjs';
import {createJoinEngineBootstrap} from './join-engine-bootstrap.mjs';
import {fileURLToPath} from 'node:url';

const firstPartyEngineProvider=fileURLToPath(new URL('./production-engine-binding-provider.mjs',import.meta.url));

function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) result[args[i].slice(2)] = args[++i] ?? true;
  return result;
}
const [command, ...rest] = process.argv.slice(2);
const opt = options(rest);
const rawLog = diagnosticLogger();
let integrationBatch = null, batchStarting = false, observedGameHash = null;
let coordinatorRun=null, coordinatorStarting=false, coordinatorTimer=null;
let depotPreviewOwnsHelper=false;
let phase2Setup=null,phase2Starting=false,phase2Timer=null,observedSaveHash=null;
let roadReplayWorkflow=null,roadReplayBusy=false;
const helperStartedAt=Date.now();
const roadReplayRoot=nodePath.resolve(import.meta.dirname,'..','reports','road-stop-replay');
async function currentReplayIdentity(){
  if(!opt.save||!opt['bridge-dir'])throw new Error('REPLAY_CHECKPOINT_REQUIRED');
  const [saveSha256,gameSha256,modManifestSha256,stagedHash]=await Promise.all([
    sha256File(opt.save),readGameBuild(opt.exe??'E:\\Steam\\steamapps\\common\\Transport Fever 3\\TransportFever3.exe'),
    hashManifest(nodePath.resolve(import.meta.dirname,'..','mod')),
    hashManifest(nodePath.resolve(opt['bridge-dir'],'..','staging_area','tf3mp_status_1')),
  ]);
  if(saveSha256!==observedSaveHash||gameSha256!==observedGameHash||modManifestSha256!==opt['mod-hash']||stagedHash!==modManifestSha256)
    throw new Error('REPLAY_IDENTITY_CHANGED');
  return {saveSha256,gameSha256,modManifestSha256};
}
function replayLog(code,fields={}){rawLog({level:['FAILED_STOP_HELPER','CAPTURE_NOT_AVAILABLE','CAPTURE_INVALID','CAPTURE_UNSUPPORTED','PAUSED_GAME_REQUIRED'].includes(code)?'warn':'info',event:'road_stop_replay_workflow',code,...fields,gameplayVerified:false});}
async function handleRoadReplayLine(line){
  const parts=line.trim().split(/\s+/),operation=parts[0];
  if(operation==='road-replay-diagnostics'){
    if(parts.length!==1)throw new Error('INVALID_REPLAY_COMMAND');
    if(roadReplayWorkflow?.phase==='consumed')throw new Error('REPLAY_OWNS_HELPER_STOP_TO_EXIT');
    const observation=bridge?.engineObservation;
    const placed=observation?.available ? await readRoadStopReadbackDiagnostic({bridgeDirectory:opt['bridge-dir'],freshAfter:helperStartedAt,companyEntity:observation.sample.companyEntity}) : null;
    const preview=placed??await previewRoadStopReplayCaptureDiagnostics({bridgeDirectory:opt['bridge-dir'],freshAfter:helperStartedAt});
    if(stopping||roadReplayWorkflow?.phase==='consumed')throw new Error('REPLAY_OWNS_HELPER_STOP_TO_EXIT');
    replayLog(preview.status,preview.issues?{issues:preview.issues}:{});
    return;
  }
  if(roadReplayBusy||stopping||command!=='host'||!bridge
    ||!hasSoleHostLocalParticipant({host:hostInstance,localParticipant:hostLocalParticipant,nativeGate}))
    throw new Error('FRESH_SOLO_HOST_REQUIRED');
  const start=operation==='road-replay-record'||operation==='road-replay-load';
  if(start&&(vehicleTestActive||integrationBatch||batchStarting||coordinatorRun||coordinatorStarting||phase2Setup||phase2Starting||roadReplayWorkflow))
    throw new Error('FRESH_SOLO_HOST_REQUIRED');
  if((operation==='road-replay-record'&&parts.length!==1)||(operation!=='road-replay-record'&&(!/^[a-f0-9]{32}$/.test(parts[1]??''))))throw new Error('INVALID_REPLAY_COMMAND');
  // Reserve this helper before any await; remote players cannot join mid-test.
  vehicleTestActive=true;roadReplayBusy=true;
  try{
    const observation=bridge.engineObservation;
    if(!bridge.connected||!observation.available||observation.sample.speedup!==0)throw new Error('PAUSED_GAME_REQUIRED');
    const identity=await currentReplayIdentity();
    if(stopping)throw new Error('STOPPED');
    if(operation==='road-replay-record'){
      const recordId=randomBytes(16).toString('hex');
      await beginRoadStopReplayRecording({directory:nodePath.join(roadReplayRoot,recordId),bridgeDirectory:opt['bridge-dir'],checkpoint:identity,companyEntity:observation.sample.companyEntity});
      roadReplayWorkflow={recordId,phase:'recording'};replayLog('RECORDING_STARTED',{recordId});
    }else if(operation==='road-replay-capture'&&parts.length===2){
      if(roadReplayWorkflow?.phase!=='recording'||roadReplayWorkflow.recordId!==parts[1])throw new Error('RECORDING_REQUIRED');
      const artifact=await finishRoadStopReplayRecording({directory:nodePath.join(roadReplayRoot,parts[1]),bridgeDirectory:opt['bridge-dir']});
      checkRoadStopReplayIdentity(artifact.source,identity);
      roadReplayWorkflow={recordId:parts[1],phase:'captured'};replayLog('CAPTURE_SAVED',{recordId:parts[1],caseDigest:artifact.digest});
    }else if(operation==='road-replay-load'&&parts.length===2){
      const artifact=await loadRoadStopReplayRecordingCase(nodePath.join(roadReplayRoot,parts[1]));
      checkRoadStopReplayIdentity(artifact.source,identity);
      if(artifact.companyEntity!==observation.sample.companyEntity)throw new Error('COMPANY_MISMATCH');
      roadReplayWorkflow={recordId:parts[1],phase:'ready',digest:artifact.digest,source:artifact.source};
      replayLog('READY_TO_CONFIRM',{recordId:parts[1],caseDigest:artifact.digest});
    }else if(operation==='road-replay-confirm'&&parts.length===3){
      if(roadReplayWorkflow?.phase!=='ready'||roadReplayWorkflow.recordId!==parts[1]||roadReplayWorkflow.digest!==parts[2])throw new Error('CONFIRMATION_MISMATCH');
      roadReplayWorkflow.phase='consumed';
      await bridge.requestRoadStopReplay({source:roadReplayWorkflow.source,currentIdentity:identity,confirmedCheckpointReloaded:true});
      replayLog('REPLAY_SUBMITTED',{recordId:parts[1]});
    }else throw new Error('INVALID_REPLAY_COMMAND');
  }finally{roadReplayBusy=false;}
}
const log = record => {
  if(record.event === "game_hash" && /^[a-f0-9]{64}$/.test(record.hash ?? "")) observedGameHash=record.hash;
  rawLog(record); integrationBatch?.onEvent(record);void phase2Setup?.onEvent(record);
};
const sessionSecret = opt.secret ?? process.env.TF3MP_SESSION_SECRET;
let bridge;
let hostInstance, nativeGate, vehicleTestActive = false;
let hostCapture=null,hostCaptureAttempted=false;
let hostRosterCapture=null;
let hostCancelledStop=null;
let hostLocalParticipant=null;
let joinConnection=null,joinSessionReady=false,joinCompanyClaimed=false;
async function enableBridge() {
  if (opt["bridge-dir"]) {
    bridge = await startGameBridge({ directory: opt["bridge-dir"], logger: log });
    log({ level: "info", event: "bridge_waiting" });
  }
}
async function waitForLiveBridge(timeoutMs=300000) {
  if(!bridge)throw new Error('LIVE_GAME_BRIDGE_REQUIRED');
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    if(bridge.connected===true&&bridge.engineObservation?.available===true)return;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('LIVE_GAME_BRIDGE_TIMEOUT');
}
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if(coordinatorTimer)clearInterval(coordinatorTimer);
  if(phase2Timer)clearInterval(phase2Timer);
  await phase2Setup?.close();
  if(coordinatorRun)await coordinatorRun.close();
  if (integrationBatch) await integrationBatch.stop();
  nativeGate?.close();
  if (bridge) await bridge.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
if (command === "host" || command === "join") createInterface({ input: process.stdin }).on("line", line => {
  if (line.trim() === "stop") stop();
  else if(line.trim().startsWith('road-replay-'))void handleRoadReplayLine(line).catch(error=>{
    const known=['PAUSED_GAME_REQUIRED','CAPTURE_NOT_AVAILABLE','CAPTURE_INVALID','CAPTURE_UNSUPPORTED','CAPTURE_DIAGNOSTICS_STALE','FRESH_SOLO_HOST_REQUIRED','RECORDING_REQUIRED','REPLAY_CHECKPOINT_REQUIRED','REPLAY_IDENTITY_CHANGED','COMPANY_MISMATCH','CONFIRMATION_MISMATCH','INVALID_REPLAY_COMMAND'];
    const code=roadReplayWorkflow?.phase==='consumed'?'FAILED_STOP_HELPER':known.includes(error?.message)?error.message:'FAILED_STOP_HELPER';
    replayLog(code,code==='CAPTURE_UNSUPPORTED'&&typeof error.issues==='string'?{issues:error.issues}:{});
  });
  else if(roadReplayWorkflow||roadReplayBusy)replayLog('REPLAY_OWNS_HELPER_STOP_TO_EXIT');
  else if(line.trim()==='multiplayer-claim-company-confirmed'){
    const observation=bridge?.engineObservation;
    const companyEntity=observation?.sample?.companyEntity;
    if(command!=='join'||!joinConnection||!joinSessionReady||joinCompanyClaimed
      ||nativeGate?.ready!==true||bridge?.connected!==true||observation?.available!==true
      ||observation.sample.speedup!==0||!Number.isSafeInteger(companyEntity)
      ||companyEntity<1||companyEntity>2147483647)
      rawLog({level:'warn',event:'join_company_claim',code:'QUALIFIED_PAUSED_JOIN_REQUIRED',engineVerified:false});
    else {
      joinCompanyClaimed=true;
      try {
        if(joinConnection.socket.destroyed)throw new Error('JOIN_CONNECTION_CLOSED');
        joinConnection.send('company_claim',{companyEntity});
        rawLog({level:'info',event:'join_company_claim',code:'CLAIM_SENT_AWAIT_HOST_ENGINE_PROOF',
          companyEntity,updateCount:observation.sample.updateCount,engineVerified:false});
      } catch {
        rawLog({level:'error',event:'join_company_claim',code:'CLAIM_DELIVERY_UNKNOWN_STOP_SESSION',engineVerified:false});
        void stop();
      }
    }
  }
  else if(line.trim().startsWith('multiplayer-arm-stop-confirmed')){
    const parts=line.trim().split(/\s+/),entity=Number(parts[1]);
    if(command!=='host'||parts.length!==2||parts[0]!=='multiplayer-arm-stop-confirmed'
      ||!Number.isSafeInteger(entity)||entity<1
      ||!hostCancelledStop||vehicleTestActive||integrationBatch||coordinatorRun||phase2Setup)
      rawLog({level:'warn',event:'multiplayer_cancelled_stop',code:'FRESH_QUALIFIED_HOST_REQUIRED'});
    else void hostCancelledStop.start(entity).then(({arm,completion})=>{
      rawLog({level:'info',event:'multiplayer_cancelled_stop_armed',entity,
        expectedInvocation:arm.expectedInvocation,ttlMs:5000,gameplayVerified:false});
      completion.then(result=>rawLog({level:'info',event:'multiplayer_cancelled_stop_completed',...result,
        gameplayVerified:false})).catch(error=>rawLog({level:'error',event:'multiplayer_cancelled_stop_failed',
        code:error?.message??'UNKNOWN',noRetry:true,gameplayVerified:false}));
    }).catch(error=>rawLog({level:'warn',event:'multiplayer_cancelled_stop_rejected',
      code:error?.message??'UNKNOWN',gameplayVerified:false}));
  }
  else if(['multiplayer-capture-two-confirmed','multiplayer-capture-roster-confirmed'].includes(line.trim())){
    const capture=line.trim()==='multiplayer-capture-two-confirmed'?hostCapture:hostRosterCapture;
    if(command!=='host'||!capture||hostCaptureAttempted||vehicleTestActive||integrationBatch||batchStarting
      ||coordinatorRun||coordinatorStarting||phase2Setup||phase2Starting||depotPreviewOwnsHelper)
      rawLog({level:'warn',event:'multiplayer_capture',code:'FRESH_QUALIFIED_HOST_REQUIRED'});
    else {
      hostCaptureAttempted=true;
      capture.start().then(result=>rawLog({level:'info',event:'multiplayer_capture',
        code:'CAPTURE_SENT_AWAIT_ENGINE_RECEIPTS',...result,gameplayVerified:false}))
        .catch(error=>rawLog({level:'warn',event:'multiplayer_capture',
          code:error?.code??error?.message??'CAPTURE_FAILED_STOP_HELPER',gameplayVerified:false}));
    }
  }
  else if(line.trim()==='phase2-setup') {
    if(command!=='host'||!bridge||!hostInstance||vehicleTestActive||integrationBatch||batchStarting||coordinatorRun||coordinatorStarting||phase2Setup||phase2Starting||!observedSaveHash||hostInstance.authority.players().length!==0)
      rawLog({level:'warn',event:'phase2_setup',code:'FAILED_STOP_HELPER'});
    else {
      vehicleTestActive=true;phase2Starting=true;
      (async()=>{
        const saveReport=await createBatchReportWriter(nodePath.resolve(import.meta.dirname,'..','reports'));
        if(stopping)return;
        phase2Setup=createPhase2SetupSession({bridge,saveReport,logger:rawLog,checkpointHash:observedSaveHash,
          metadata:{gameHash:observedGameHash,modManifestHash:opt['mod-hash']}});
        await phase2Setup.start();
        if(stopping){await phase2Setup.close();return;}
        phase2Timer=setInterval(()=>{void phase2Setup.poll();},250);
      })().catch(()=>rawLog({level:'warn',event:'phase2_setup',code:'FAILED_STOP_HELPER'})).finally(()=>{phase2Starting=false;});
    }
  }
  else if(line.trim().startsWith('phase2-setup-confirm ')) {
    const hash=line.trim().slice('phase2-setup-confirm '.length);
    if(!phase2Setup||!/^[a-f0-9]{64}$/.test(hash))rawLog({level:'warn',event:'phase2_setup',code:'CONFIRMATION_REQUIRED'});
    else phase2Setup.confirm(hash).catch(()=>rawLog({level:'warn',event:'phase2_setup',code:'CONFIRMATION_REJECTED_CHECK_STATUS'}));
  }
  else if(['service-observation-start','service-observation-end'].includes(line.trim())) {
    // Read-only continuation of this helper's verified local setup, not a new
    // asset selector or permission to run the old coordinate setup again.
    if(command!=='host'||!bridge||!hostInstance||hostInstance.authority.players().length!==0
      ||!vehicleTestActive||phase2Setup?.status.phase!=='complete'||stopping)
      rawLog({level:'warn',event:'phase2_service_observation_result',outcome:'unavailable',code:'VERIFIED_SERVICE_SETUP_REQUIRED',gameplayVerified:false});
    else bridge.requestServiceObservation(line.trim().endsWith('-start')?'start':'end')
      .catch(()=>rawLog({level:'warn',event:'phase2_service_observation_result',outcome:'unavailable',code:'PAUSED_SERVICE_OBSERVATION_REQUIRED',gameplayVerified:false}));
  }
  else if(phase2Setup||phase2Starting)rawLog({level:'warn',event:'phase2_setup',code:'SETUP_OWNS_HELPER_STOP_TO_EXIT'});
  else if(depotPreviewOwnsHelper) rawLog({level:'warn',event:'depot_preview',code:'STOP_HELPER_TO_EXIT_PREVIEW'});
  else if(line.trim()==='station-template-probe') {
    if(command!=='host'||!bridge||!hostInstance||vehicleTestActive||integrationBatch||batchStarting||coordinatorRun||coordinatorStarting||hostInstance.authority.players().length!==0)
      rawLog({level:'warn',event:'station_template_result',code:'FRESH_SOLO_HOST_REQUIRED'});
    else {
      vehicleTestActive=true;depotPreviewOwnsHelper=true;
      bridge.requestStationTemplateProbe().catch(()=>rawLog({level:'warn',event:'station_template_result',code:'PROBE_UNAVAILABLE_NO_RETRY'}));
    }
  }
  else if(line.trim()==='depot-preview') {
    if(command!=='host'||!bridge||!hostInstance||vehicleTestActive||integrationBatch||batchStarting||coordinatorRun||coordinatorStarting||hostInstance.authority.players().length!==0)
      rawLog({level:'warn',event:'depot_preview',code:'FRESH_SOLO_HOST_REQUIRED'});
    else {
      vehicleTestActive=true;depotPreviewOwnsHelper=true;
      bridge.beginDepotPreview().catch(()=>rawLog({level:'warn',event:'depot_preview',code:'PREVIEW_UNAVAILABLE_STOP_HELPER'}));
    }
  }
  else if(coordinatorRun||coordinatorStarting) rawLog({level:"warn",event:"coordinator_local_run",code:"RUN_OWNS_HELPER_STOP_TO_EXIT"});
  else if(line.trim()==="coordinator-run-confirmed"||line.trim().startsWith("coordinator-run-confirmed ")
    ||line.trim().startsWith('coordinator-cancel-stop-confirmed ')) {
    const args=line.trim().split(/\s+/);
    const cancelledRun=args[0]==='coordinator-cancel-stop-confirmed';
    const selectInGame=!cancelledRun&&args.length===1;
    let secondCompany=Number(args[1]),vehicleEntity=Number(args[2]);
    let localCompany=bridge?.engineObservation.sample?.companyEntity;
    if(!selectInGame&&(args.length!==3||![secondCompany,vehicleEntity,localCompany].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647)||secondCompany===localCompany))
      rawLog({level:"warn",event:"coordinator_local_run",code:"VERIFIED_COMPANY_AND_VEHICLE_REQUIRED"});
    else if(command!=="host"||!bridge||!hostInstance||vehicleTestActive||integrationBatch||batchStarting
      ||hostInstance.coordinator.phase!=='lobby'
      ||(cancelledRun
        ?nativeGate?.ready!==true||hostInstance.authority.players().length!==1
          ||hostInstance.authority.players()[0].playerId!==hostLocalParticipant?.connection?.playerId
        :hostInstance.authority.players().length!==0))
      rawLog({level:"warn",event:"coordinator_local_run",code:"FRESH_SOLO_HOST_REQUIRED"});
    else {
      vehicleTestActive=true;coordinatorStarting=true;
      (async()=>{
        const saveReport=await createBatchReportWriter(nodePath.resolve(import.meta.dirname,"..","reports"));
        if(stopping)return;
        if(selectInGame){
          await bridge.beginCoordinatorSelection();
          rawLog({level:"info",event:"coordinator_local_run",code:"SELECT_OWN_VEHICLE_USE_FOR_SYNC_TEST"});
          const deadline=Date.now()+120000;
          for(;;){
            if(stopping)return;
            const setup=bridge.coordinatorSetup;
            if(setup.inspection!=='pending'&&setup.inspection!=='inspected'){
              rawLog({level:"warn",event:"coordinator_local_run",code:"LOAD_DISPOSABLE_SAVE_WITH_EXISTING_TEST_COMPANY"});return;
            }
            if(setup.inspection==='inspected'&&setup.vehicleEntity!==null){
              localCompany=setup.companyEntity;secondCompany=setup.secondCompanyEntity;vehicleEntity=setup.vehicleEntity;break;
            }
            if(Date.now()>=deadline)throw new Error('SELECTION_TIMEOUT');
            await new Promise(resolve=>setTimeout(resolve,250));
          }
        }
        coordinatorRun=await createLocalCoordinatorRun({directory:opt["bridge-dir"],bridge,playerId:"local",
          companies:new Map([["local",localCompany],["receipt-mirror",secondCompany]]),vehicleEntity,
          logger:rawLog,saveReport,metadata:{gameHash:observedGameHash,modManifestHash:opt["mod-hash"]},
          commandLimit:cancelledRun?1:4,
          beforeFirstCommand:cancelledRun?({entity,company,recordCancellationEvidence})=>cancelOneLocalStop({
            nativeGate,bridge,entity,company,logger:value=>{
              rawLog(value);recordCancellationEvidence(value);
            }}):null,
          nativeRuntime:cancelledRun?{
            client:nativeGate.client,binding:nativeGate.binding,
            sessionId:nativeGate.binding.sessionId,role:'host',logger:rawLog,
            gateControl:request=>nativeGate.gateControl(request),
            awaitGateEvent:(request,options)=>nativeGate.awaitGateEvent(request,options),
          }:null});
        if(stopping){await coordinatorRun.close();return;}
        coordinatorTimer=setInterval(()=>{void coordinatorRun.poll();},250);
      })().catch(()=>rawLog({level:"warn",event:"coordinator_local_run",code:"SETUP_FAILED_STOP_HELPER_NO_RETRY"}))
        .finally(()=>{coordinatorStarting=false;});
    }
  }
  else if (line.trim() === "integration-batch-confirmed") {
    if (command !== "host" || !bridge || !hostInstance || vehicleTestActive || batchStarting || integrationBatch || hostInstance.authority.players().length !== 0) rawLog({level:"warn",event:"integration_batch",code:"FRESH_SOLO_HOST_REQUIRED"});
    else {
      vehicleTestActive=true; batchStarting=true; // Lock admission before asynchronous report setup.
      createBatchReportWriter(nodePath.resolve(import.meta.dirname,"..","reports")).then(saveReport => {
        if(stopping) return;
        integrationBatch=createLocalIntegrationBatch({bridge,logger:rawLog,saveReport,metadata:{gameHash:observedGameHash,modManifestHash:opt["mod-hash"]}});
        integrationBatch.start();
      }).catch(() => rawLog({level:"warn",event:"integration_batch",code:"REPORT_SETUP_FAILED_RESTART_HELPER"})).finally(() => {batchStarting=false;});
    }
  }
  else if (line.trim() === "integration-batch-controls-confirmed") {
    try { if(!integrationBatch) throw new Error(); integrationBatch.confirmControls(); }
    catch { rawLog({level:"warn",event:"integration_batch",code:"NOT_WAITING_FOR_CONTROL_CONFIRMATION"}); }
  }
  else if (line.trim() === "integration-batch-controls-failed") integrationBatch?.rejectControls();
  else if (batchStarting || integrationBatch) rawLog({level:"warn",event:"integration_batch",code:"BATCH_OWNS_DIAGNOSTICS_STOP_TO_EXIT"});
  else if (["pause-test-confirmed", "pause-test-scheduled-confirmed", "combined-test-confirmed"].includes(line.trim())) {
    if (command !== "host" || !hostInstance || !bridge) log({ level: "warn", event: "pause_test_failed", code: "HOST_REQUIRED" });
    else if (vehicleTestActive || hostInstance.authority.players().length !== 0) log({ level: "warn", event: "pause_test_failed", code: "FRESH_SOLO_HOST_REQUIRED" });
    else {
      vehicleTestActive = true; // Admission remains closed until helper restart.
      bridge.requestPauseTest({ scheduled: line.trim() !== "pause-test-confirmed", withVehicle: line.trim() === "combined-test-confirmed" }).catch(error => log({ level: "warn", event: "pause_test_failed",
        code: ["OBSERVATION_REQUIRED", "NORMAL_SPEED_REQUIRED", "PAUSE_TEST_BUSY_OR_USED"].includes(error.message) ? error.message : "OUTCOME_UNKNOWN_RESUME_MANUALLY" }));
    }
  }
  else if (line.trim() === "pause-test-release") {
    if (command === "host" && bridge) bridge.releasePauseTest().catch(error => log({ level: "warn", event: error.message === "RELEASE_SPEED_CONTROLS_FIRST" ? "control_test_waiting" : error.message === "HELD_VEHICLE_ACTION_REQUIRED" ? "combined_test_waiting" : "pause_test_failed", code: ["HELD_VEHICLE_ACTION_REQUIRED", "RELEASE_SPEED_CONTROLS_FIRST"].includes(error.message) ? error.message : "NOT_HELD_OR_UNKNOWN_RESUME_MANUALLY" }));
  }
  else if (["control-test-confirmed", "control-test-release"].includes(line.trim())) {
    if (command !== "host" || !bridge || !hostInstance || !vehicleTestActive || hostInstance.authority.players().length !== 0) log({ level: "warn", event: "control_test_failed", code: "SOLO_HELD_TEST_REQUIRED" });
    else bridge.requestControlTest({ release: line.trim() === "control-test-release" }).catch(error => log({ level: "warn", event: "control_test_failed", code: ["HELD_TEST_REQUIRED", "CONTROL_TEST_ALREADY_USED", "CONTROL_NOT_LOCKED"].includes(error.message) ? error.message : "CONTROL_REQUEST_FAILED_STOP_HELPER" }));
  }
  else if (line.trim() === "company-inspect") {
    if (!bridge) log({ level: "warn", event: "company_inspection_result", code: "BRIDGE_OFFLINE" });
    else bridge.inspectCompanies().catch(error => log({ level: "warn", event: "company_inspection_result",
      code: ["OBSERVATION_REQUIRED", "INSPECTION_BUSY"].includes(error.message) ? error.message : "INSPECTION_UNAVAILABLE" }));
  }
  else if (["company-test-create-confirmed", "finance-test-confirmed"].includes(line.trim())) {
    const finance = line.trim() === "finance-test-confirmed";
    const event = finance ? "finance_test_result" : "company_test_result";
    if (command !== "host" || !hostInstance || !bridge) log({ level: "warn", event, code: "HOST_REQUIRED" });
    else if (vehicleTestActive || hostInstance.authority.players().length !== 0) log({ level: "warn", event, code: "FRESH_SOLO_HOST_REQUIRED" });
    else {
      vehicleTestActive = true; // Close remote admission synchronously for the helper lifetime.
      bridge.requestCompanyTest({ finance }).catch(error => log({ level: "warn", event,
        code: ["OBSERVATION_REQUIRED", "COMPANY_TEST_BUSY_OR_USED", "RUN_SIMULATION_FIRST", "CLOCK_LIMIT"].includes(error.message) ? error.message : "OUTCOME_UNKNOWN_DO_NOT_RETRY" }));
    }
  }
  else if (line.trim() === "vehicle-test-disable") {
    if (bridge) bridge.disableVehicleTest().catch(() => log({ level: "warn", event: "vehicle_test_rejected", code: "DISABLE_FAILED_CHECK_GAME" }));
  }
  else if (line.trim() === "vehicle-test-enable" || /^vehicle-test-scheduled-enable(?: (20|40|60))?$/.test(line.trim())) {
    if (command !== "host" || !hostInstance || !bridge) log({ level: "warn", event: "vehicle_test_rejected", code: "HOST_REQUIRED" });
    else if (vehicleTestActive) log({ level: "info", event: "vehicle_test_already_enabled" });
    else if (hostInstance.authority.players().length !== 0) log({ level: "warn", event: "vehicle_test_rejected", code: "SOLO_HOST_REQUIRED" });
    else {
      // Close the admission gate synchronously, before asynchronous bridge publication.
      // Keep it closed even after failure: restart the helper to allow remote joining.
      vehicleTestActive = true;
      bridge.enableVehicleTest({ scheduled: line.trim().startsWith("vehicle-test-scheduled-enable"), leadUpdates: Number(line.trim().split(" ")[1] ?? 60) }).catch(error => log({ level: "warn", event: "vehicle_test_rejected",
        code: ["BRIDGE_OFFLINE", "VEHICLE_TEST_BUSY"].includes(error.message) ? error.message : "BRIDGE_WRITE_FAILED" }));
    }
  }
  else if (line.trim() === "engine-probe" || line.trim() === "timing-probe") {
    if (!bridge) log({ level: "warn", event: "engine_probe_rejected", code: "BRIDGE_OFFLINE" });
    else bridge.requestEngineProbe({ scheduled: line.trim() === "timing-probe" }).catch(error => log({ level: "warn", event: "engine_probe_rejected",
      code: ["BRIDGE_OFFLINE", "ENGINE_PROBE_BUSY", "BAD_SCHEDULE"].includes(error.message) ? error.message : "BRIDGE_WRITE_FAILED" }));
  }
}).on("close", () => { stop(); });

if (command === 'prepare-join') {
  if(!sessionSecret||!opt.session||!opt['save-dir']||!opt['bridge-dir'])
    throw new Error('prepare-join requires session secret, --session, --save-dir and --bridge-dir');
  const received=await downloadSave({secret:sessionSecret,sessionId:opt.session,host:opt.host,
    port:opt['save-port']?Number(opt['save-port']):undefined,destinationDir:opt['save-dir']});
  const prepared=await prepareDisposableStartupLoad({sourceSave:received.path,
    saveDirectory:opt['save-dir'],bridgeDirectory:opt['bridge-dir']});
  log({level:'info',event:'join_save_prepared',bytes:prepared.bytes,sha256:prepared.sha256,
    path:prepared.path,requestPath:prepared.requestPath});
} else if (command === "hash-game") {
  const path = opt.exe ?? "E:\\Steam\\steamapps\\common\\Transport Fever 3\\TransportFever3.exe";
  const hash = await sha256File(path);
  const compatibility = describeBuild(hash);
  log({ level: compatibility.recommended ? "info" : "warn", event: "game_hash", ...compatibility });
} else if (command === "hash-mod") {
  const path = opt.path ?? "mod";
  log({ level: "info", event: "mod_manifest_hash", hash: await hashManifest(path) });
} else if (command === "review") {
  log({ level: "info", event: "review_validation", ...(await validateReviewPackage(opt.path ?? "mod")) });
} else if (command === "host") {
  if (!sessionSecret || !opt["mod-hash"]) throw new Error("host requires TF3MP_SESSION_SECRET (or --secret) and --mod-hash");
  const nativeMode=resolveNativeHostJoinMode(opt);
  if(!nativeMode.diagnosticOnly&&(!opt.save||!opt['bridge-dir']))throw new Error('host production mode requires --save and --bridge-dir');
  const exe = opt.exe ?? "E:\\Steam\\steamapps\\common\\Transport Fever 3\\TransportFever3.exe";
  const buildHash = await readGameBuild(exe);
  log({ level: describeBuild(buildHash).recommended ? "info" : "warn", event: "game_hash", ...describeBuild(buildHash) });
  const hostSessionId = opt.session ?? randomUUID();
  if(nativeMode.diagnosticOnly)log({level:'warn',event:'diagnostic_transport_only',coordinatedGameplayAdmission:false});
  else nativeGate=await openNativeHostJoinGate({options:opt,sessionId:hostSessionId,role:'host',logger:log,onDisconnect:()=>stop()});
  const expiresAt = opt.expires ? Number(opt.expires) : null;
  if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())) throw new Error("--expires must be a future Unix timestamp in milliseconds");
  let requiredSave = null;
  if (opt.save) {
    const transfer = await startSaveServer({ secret: sessionSecret, sessionId: hostSessionId, saveFile: opt.save, bind: opt.bind, port: opt["save-port"] ? Number(opt["save-port"]) : undefined, expiresAt, logger: log });
    requiredSave = { bytes: transfer.bytes, sha256: transfer.sha256 };
    observedSaveHash=transfer.sha256;
    log({ level: "info", event: "save_transfer_listening", bytes: transfer.bytes, sha256: transfer.sha256, port: transfer.port });
  }
  await enableBridge();
  if(!nativeMode.diagnosticOnly)await waitForLiveBridge();
  // Do not synthesize an adapter from the native IPC gate or passive bridge
  // telemetry. A separately qualified provider is opt-in and must prove its
  // own live binding, production qualification, and save identity above.
  const localFactory=await loadHostLocalEngineFactory({modulePath:nativeMode.diagnosticOnly?undefined:(opt['host-local-adapter-module']??firstPartyEngineProvider),bridge,nativeGate,
    sessionId:hostSessionId,buildHash,modManifestHash:opt['mod-hash'],requiredSave,verifiedSave:requiredSave,
    engineSessionDirectory:opt['bridge-dir'],logger:log});
  const instance = startHost({ secret: sessionSecret, sessionId: hostSessionId, bind: opt.bind, port: opt.port ? Number(opt.port) : undefined, buildHash, modManifestHash: opt["mod-hash"], requiredSave, expiresAt, logger: log,
    // The verified TF3 Stop needed 60 updates (~11 s at its measured 1x rate).
    // Eight updates is a transport fixture lead, not enough for two engines.
    ...(!nativeMode.diagnosticOnly?{leadUpdates:60,coordinationTimeoutMs:30000}:{}),
    getUpdateCount:()=>liveHostUpdateCount(bridge),
    inspectVehicleOwner:nativeMode.diagnosticOnly?null:async ({targetEntity,targetCompanyEntity})=>{
      if(nativeGate?.ready!==true)throw new Error('NATIVE_GATE_UNAVAILABLE');
      return bridge.inspectVehicleOwner({entity:targetEntity,company:targetCompanyEntity});
    },
    admissionAllowed: () => !nativeMode.diagnosticOnly && nativeGate?.ready===true && localFactory!==null && !vehicleTestActive && !hostCaptureAttempted });
  hostInstance = instance;
  await once(instance.server, "listening");
  if(localFactory){
    const local=connectHostLocalParticipant({host:instance,displayName:opt['host-local-name']??'Host',
      engineBinding:localFactory.engineBinding,createAdapter:localFactory.createAdapter,verifiedSave:localFactory.verifiedSave,
      deferAdapterUntilCapture:true,
      onMessage:(message)=>{
        if(message.kind==='session_ended')log({level:'warn',event:'host_local_participant_ended',gameplayVerified:false});
      }});
    hostLocalParticipant=local;
    if(!nativeMode.diagnosticOnly){
      hostCapture=createTwoCompanyHostCapture({host:instance,bridge,nativeGate,hostLocal:local});
      hostRosterCapture=createHostRosterCapture({host:instance,bridge,nativeGate,hostLocal:local});
    }
    if(!nativeMode.diagnosticOnly)hostCancelledStop=createHostCancelledStop({host:instance,hostLocal:local,
      bridge,nativeGate,logger:log});
    local.attachment.then(()=>{
      const accepted=local.ready;
      log({level:accepted?'info':'warn',event:accepted?'host_local_adapter_attached':'host_local_adapter_rejected',
        ...(accepted?{engineControlVerified:false}:{code:'HOST_LOCAL_ENGINE_ADAPTER_UNAVAILABLE'}),gameplayVerified:false});
    }).catch(()=>log({level:'warn',event:'host_local_adapter_rejected',
      code:'HOST_LOCAL_ENGINE_ADAPTER_UNAVAILABLE',gameplayVerified:false}));
    log({level:'info',event:'host_local_participant_connecting',gameplayVerified:false});
  }
  log({ level: "info", event: "host_listening", sessionId: instance.sessionId });
} else if (command === "join") {
  if (!sessionSecret) throw new Error("join requires TF3MP_SESSION_SECRET (or --secret)");
  for (const required of ["session", "name", "mod-hash"]) if (!opt[required]) throw new Error(`join requires --${required}`);
  const nativeMode=resolveNativeHostJoinMode(opt);
  if(!nativeMode.diagnosticOnly&&(!opt['save-dir']||!opt['bridge-dir']))throw new Error('join production mode requires --save-dir and --bridge-dir');
  if(!nativeMode.diagnosticOnly&&!opt['prepared-save'])throw new Error('join production mode requires --prepared-save from prepare-join before TF3 launch');
  if(opt['prepared-save']&&!opt['save-dir'])throw new Error('prepared Join save requires --save-dir');
  const buildHash = await readGameBuild(opt.exe ?? "E:\\Steam\\steamapps\\common\\Transport Fever 3\\TransportFever3.exe");
  log({ level: describeBuild(buildHash).recommended ? "info" : "warn", event: "game_hash", ...describeBuild(buildHash) });
  if(nativeMode.diagnosticOnly)log({level:'warn',event:'diagnostic_transport_only',coordinatedGameplayAdmission:false});
  else nativeGate=await openNativeHostJoinGate({options:opt,sessionId:opt.session,role:'join',logger:log,onDisconnect:()=>stop()});
  await enableBridge();
  if(!nativeMode.diagnosticOnly)await waitForLiveBridge();
  let testSent = false, bootstrapStarted = false, joinBootstrap;
  const connection=connectClient({ secret: sessionSecret, sessionId: opt.session, host: opt.host, port: opt.port ? Number(opt.port) : undefined, displayName: opt.name, buildHash, modManifestHash: opt["mod-hash"], diagnosticOnly:nativeMode.diagnosticOnly, onMessage: (message, context) => {
    if (message.kind === "session_ended") stop();
    if (message.kind === "session_ready") joinSessionReady=true;
    log({ level: "info", event: "message", kind: message.kind, code: message.payload?.code, payload: message.payload });
    if (message.kind === "admitted" && opt["test-message"] && !testSent) {
      testSent = true;
      context.send("test", { value: String(opt["test-message"]) });
    }
    if (!nativeMode.diagnosticOnly&&message.kind === "admitted"&&!bootstrapStarted) {
      bootstrapStarted=true;
      joinBootstrap.admitted(message).then(()=>log({level:'info',event:'join_engine_provider_ready',gameplayVerified:false}))
        .catch((error)=>log({level:'error',event:'join_engine_bootstrap_failed',code:error.code??error.message??'JOIN_ENGINE_BOOTSTRAP_FAILED'}));
    }
  } });
  joinConnection=connection;
  if(!nativeMode.diagnosticOnly)joinBootstrap=createJoinEngineBootstrap({connection,
    modulePath:opt['join-adapter-module']??firstPartyEngineProvider,bridge,nativeGate,
    sessionId:opt.session,buildHash,modManifestHash:opt['mod-hash'],logger:log,
    downloadSave:async requiredSave=>{
      if(opt['prepared-save']){
        const verified=await verifyPreparedJoinSave({saveFile:opt['prepared-save'],
          saveDirectory:opt['save-dir'],expected:requiredSave});
        log({level:'info',event:'prepared_join_save_verified',bytes:verified.bytes,sha256:verified.sha256});
        return verified;
      }
      const result=await downloadSave({secret:sessionSecret,sessionId:opt.session,host:opt.host,
        port:opt['save-port']?Number(opt['save-port']):undefined,destinationDir:opt['save-dir']});
      if(result.bytes!==requiredSave.bytes||result.sha256!==requiredSave.sha256)throw new Error('CONTROL_SAVE_CHANNEL_METADATA_MISMATCH');
      log({level:'info',event:'save_received',bytes:result.bytes,sha256:result.sha256});
      return result;
    },onAdapter:()=>log({level:'info',event:'join_engine_adapter_attached',gameplayVerified:false}),
    onFailure:error=>log({level:'error',event:'join_engine_adapter_failed',code:error.code??error.message??'JOIN_ENGINE_ADAPTER_FAILED'})});
} else if (command === "generate-secret") {
  process.stdout.write(`${randomBytes(32).toString("hex")}\n`);
} else if (command === "probe-ipc") {
  if (!opt.dir) throw new Error("probe-ipc requires --dir with an absolute dedicated userdata directory");
  const result = await processProbeOnce(opt.dir);
  log({ level: "info", event: "userdata_probe_response", counter: result.probe.counter, nonce: result.probe.nonce, responseFile: `inbox_${result.probe.counter}.lua` });
} else if(command==='prepare-disposable-load'){
  for(const required of ['source','save-dir','bridge-dir'])if(!opt[required])throw new Error(`prepare-disposable-load requires --${required}`);
  const result=await prepareDisposableStartupLoad({sourceSave:opt.source,saveDirectory:opt['save-dir'],bridgeDirectory:opt['bridge-dir']});
  log({level:'info',event:'disposable_load_prepared',saveName:result.saveName,bytes:result.bytes,sha256:result.sha256,path:result.path,requestPath:result.requestPath});
} else {
  process.stderr.write("Usage: node src/cli.mjs <host|join|hash-game|hash-mod|review|generate-secret|probe-ipc|prepare-disposable-load> [options]\nHost save: --save <absolute.sav> [--save-port 37334]; client pull: --save-dir <absolute-directory>\n");
  process.exitCode = 2;
}
