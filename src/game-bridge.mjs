import { randomBytes } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { parseFlatDataFile, requirePlainDirectory } from "./userdata-ipc.mjs";
import { createVehicleTest } from "./vehicle-test.mjs";
import { EngineObservationMonitor } from "./engine-observation.mjs";
import { parseCompanyReceipt } from "./company-probe.mjs";
import { parseFinanceReceipt } from "./finance-probe.mjs";
import { fundingRequest, parseFundingReceipt } from "./phase2-funding.mjs";
import { depotRequest, parseDepotReceipt, serializeDepotRequest } from "./phase2-depot.mjs";
import { vehicleRequest, parseVehicleReceipt, serializeVehicleRequest } from "./phase2-vehicle.mjs";
import { stationRequest, parseStationReceipt, serializeStationRequest } from "./phase2-station.mjs";
import { serviceRequest, parseServiceReceipt, serializeServiceRequest } from "./phase2-service.mjs";
import {serviceObservationRequest,serializeServiceObservationRequest,parseServiceObservationReceipt} from './service-observation.mjs';
import {parsePhase2SetupPlan,serializePhase2SetupConfig} from './phase2-setup.mjs';
import {stationTemplateRequest,parseStationTemplateReceipt} from './station-template-probe.mjs';
import { createPauseProbe } from "./pause-probe.mjs";
import { createControlLease } from "./control-lease.mjs";
import { createHeldSnapshotProbe } from "./held-snapshot.mjs";
import { createHaltProbe } from "./halt-probe.mjs";
import { createWatchdogProbe } from "./watchdog-probe.mjs";
import { createEngineLease } from "./engine-lease.mjs";
import { parseCompanyInspection, companyInspectionRows } from "./company-inspection.mjs";
import {createRoadStopReplayRequest} from './road-stop-replay-request.mjs';
import {checkRoadStopReplayIdentity} from './road-stop-replay-case.mjs';
import {publishRoadStopReplayRequest,readRoadStopReplayReceipt} from './road-stop-replay-mailbox.mjs';

const LIMIT = 4096;
export function parseTelemetry(source, nonce) {
  const value = parseFlatDataFile(source);
  if (Object.keys(value).sort().join(",") !== "counter,kind,nonce,schemaVersion,tickCount,updateCount"
      || value.schemaVersion !== 1 || value.kind !== "telemetry"
      || !/^[0-9a-f]{32}$/.test(value.nonce)
      || ![value.counter, value.tickCount, value.updateCount].every(n => Number.isSafeInteger(n) && n >= 0)) {
    throw new TypeError("invalid bridge telemetry");
  }
  if (value.nonce !== nonce) throw Object.assign(new TypeError("telemetry belongs to another bridge session"), { code: "STALE_SESSION" });
  return value;
}

export function parseEngineReceipt(source, nonce, requestId) {
  const value = parseFlatDataFile(source);
  if (Object.keys(value).sort().join(",") !== "kind,nonce,requestId,schemaVersion,tickCount,updateCount"
      || value.schemaVersion !== 1 || value.kind !== "engine_receipt"
      || value.nonce !== nonce || !/^[0-9a-f]{32}$/.test(value.nonce)
      || value.requestId !== requestId || !Number.isSafeInteger(requestId) || requestId < 1
      || ![value.tickCount, value.updateCount].every(n => Number.isSafeInteger(n) && n >= 0)) {
    throw new TypeError("invalid engine receipt");
  }
  return value;
}

export function parseScheduledReceipt(source, nonce, requestId, scheduledUpdate) {
  const value = parseFlatDataFile(source);
  if (Object.keys(value).sort().join(",") !== "kind,nonce,outcome,requestId,scheduledUpdate,schemaVersion,tickCount,updateCount"
      || value.schemaVersion !== 1 || value.kind !== "scheduled_receipt"
      || value.nonce !== nonce || !/^[0-9a-f]{32}$/.test(value.nonce)
      || value.requestId !== requestId || !Number.isSafeInteger(requestId) || requestId < 1
      || value.scheduledUpdate !== scheduledUpdate || !Number.isSafeInteger(scheduledUpdate) || scheduledUpdate < 1
      || ![value.tickCount, value.updateCount].every(n => Number.isSafeInteger(n) && n >= 0)
      || !["applied", "late", "clock_reset"].includes(value.outcome)
      || value.outcome === "applied" && value.updateCount !== scheduledUpdate
      || value.outcome === "late" && value.updateCount <= scheduledUpdate
      || value.outcome === "clock_reset" && value.updateCount >= scheduledUpdate) {
    throw new TypeError("invalid scheduled receipt");
  }
  return value;
}

async function readBounded(directory, name) {
  const filename = path.join(directory, name);
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > LIMIT) throw new Error("invalid bridge file");
  return readFile(filename, "utf8");
}

// Generic messages admit only local identifiers and unsigned integers. Depot
// placement has a separate strict encoder for bounded coordinates/resource names.
// Raw network payloads never reach the game's executable userdata loader.
async function publish(directory, name, fields) {
  const temporary = path.join(directory, `.bridge-${randomBytes(12).toString("hex")}.tmp`);
  const source = name === 'phase2_depot_request.lua' ? serializeDepotRequest(fields)
    : name === 'phase2_vehicle_request.lua' ? serializeVehicleRequest(fields)
    : name === 'phase2_station_request.lua' ? serializeStationRequest(fields)
    : name === 'phase2_service_request.lua' ? serializeServiceRequest(fields)
    : name === 'phase2_service_observation_request.lua' ? serializeServiceObservationRequest(fields)
    : name === 'phase2_setup.lua' ? serializePhase2SetupConfig(fields) : null;
  const body = source ?? Object.entries(fields).map(([key, value]) => {
    if (!/^[a-zA-Z]+$/.test(key) || !(Number.isSafeInteger(value) && value >= 0 || typeof value === "string" && /^[a-z0-9_]{1,64}$/.test(value))) throw new TypeError("invalid local bridge field");
    return `  ${key} = ${typeof value === "string" ? `"${value}"` : value},`;
  }).join("\n");
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(source ?? `function data()\nreturn {\n${body}\n}\nend\n`); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temporary, path.join(directory, name)); }
  finally { await unlink(temporary).catch(() => {}); }
}

export async function startGameBridge({ directory, logger = () => {}, intervalMs = 500, staleMs = 5000, probeTimeoutMs = 15000, scheduledTimeoutMs = 60000, companyTimeoutMs = 30000 }) {
  if (!path.isAbsolute(directory) || path.basename(directory) !== "tf3mp_status_1") throw new TypeError("invalid bridge directory");
  await mkdir(directory, { recursive: true });
  directory = await requirePlainDirectory(directory);
  // Exclusive ownership prevents two helpers from taking over the same game.
  const lock = await open(path.join(directory, "bridge.lock"), "wx", 0o600);
  const nonce = randomBytes(16).toString("hex");
  const observations = new EngineObservationMonitor({ nonce, logger });
  function phase2HeldContext(context) {
    const observation = observations.status;
    return observation.available && observation.sample?.companyEntity === context.originalCompany
      && observation.sample.speedup === 0 && observation.sample.updateCount === context.updateCount;
  }
  let counter = -1, lastSeen = 0, connected = false, stopped = false, pending = Promise.resolve();
  let closing = null;
  let clock = { tickCount: 0, updateCount: 0 };
  let lastRejectedWarning = 0;
  let lastObservationWarning = 0;
  let probe = null, requestSequence = 0;
  let vehicleTest = null;
  let pauseTest = null;
  let controlLease = null;
  let snapshotProbe = null;
  let haltTest = null;
  let coordinationLease = null;
  let combinedVehicle = false, combinedReady = false, combinedCompleted = false;
  let companyProbe = null, companyTestUsed = false;
  let phase2Funding = null;
  let phase2Depot = null;
  let phase2Vehicle = null;
  let phase2DepotContext = null;
  let phase2Station = null, phase2Service = null, phase2ConstructionContext = null;
  let serviceBinding=null, serviceObservation=null, serviceObservationPhase='unavailable', serviceObservationStart=null;
  let stationProbe = null;
  let roadReplay = null, roadReplayResult = null;
  // Only a verified funding receipt can advance this helper to construction.
  // This is not a reset of the generic diagnostic latch or a retry permission.
  let phase2FundedContext = null;
  let companyInspection = null;
  let depotPreview = false;
  let phase2Setup = null;
  let companyInspectionResult = null, coordinatorSelection = null, selectionId = null;
  let vehicleFaultPublished = false;
  const finishProbe = async (event, receipt) => {
    const scheduled = probe?.scheduledUpdate !== undefined;
    probe = null;
    await unlink(path.join(directory, "engine_request.lua")).catch(() => {});
    if (scheduled) event = event.replace("engine_probe", "timing_probe");
    logger({ level: event.endsWith("_succeeded") ? "info" : "warn", event,
      ...(receipt ? { tickCount: receipt.tickCount, updateCount: receipt.updateCount,
        ...(scheduled ? { scheduledUpdate: receipt.scheduledUpdate, code: receipt.outcome } : {}) } : {}) });
  };
  try { await publish(directory, "bridge.lua", { schemaVersion: 1, nonce, mode: "telemetry" }); }
  catch (error) { await lock.close(); await unlink(path.join(directory, "bridge.lock")); throw error; }
  const poll = async () => {
    if (stopped) return;
    try {
      const filename = path.join(directory, "telemetry.lua");
      const info = await lstat(filename);
      if (!info.isFile() || info.isSymbolicLink() || info.size > LIMIT) throw new Error("invalid telemetry file");
      const value = parseTelemetry(await readFile(filename, "utf8"), nonce);
      if (value.counter > counter) {
        counter = value.counter; lastSeen = Date.now(); clock = { tickCount: value.tickCount, updateCount: value.updateCount };
        await publish(directory, "ack.lua", { schemaVersion: 1, nonce, counter });
        if (!connected) logger({ level: "info", event: "bridge_connected" });
        connected = true;
      }
    } catch (error) {
      // Missing, stale and partially written outboxes are normal during load.
      if (!["ENOENT", "EBUSY", "STALE_SESSION"].includes(error.code) && Date.now() - lastRejectedWarning >= 5000) {
        lastRejectedWarning = Date.now();
        logger({ level: "warn", event: "bridge_sample_rejected" });
      }
    }
    if (connected && Date.now() - lastSeen > staleMs) { connected = false; logger({ level: "warn", event: "bridge_disconnected" }); }
    if (connected) {
      try { observations.accept(await readBounded(directory, "engine_observation.lua")); }
      catch (error) {
        // Fixed codes only: never log raw userdata or credentials. Optional
        // failures do not disconnect telemetry or trigger game notifications.
        if (Date.now() - lastObservationWarning >= 30000) {
          lastObservationWarning = Date.now();
          logger({ level: "warn", event: "engine_observation_unavailable", code: error.code === "ENOENT" ? "OBSERVATION_FILE_MISSING" : "OBSERVATION_SAMPLE_REJECTED" });
        }
      }
    }
    if (roadReplay) {
      let receipt = null;
      const sample = observations.status.sample;
      const lost = !connected || !observations.status.available || sample?.speedup !== 0
        || sample?.updateCount !== roadReplay.updateCount || sample?.companyEntity !== roadReplay.targetCompany;
      if (!lost && Date.now() < roadReplay.deadline) {
        try {
          const candidate = await readRoadStopReplayReceipt(directory,{nonce,requestId:roadReplay.requestId});
          if (candidate.tickCount >= roadReplay.issuedTick && candidate.tickCount <= roadReplay.expiresTick
            && candidate.updateCount === roadReplay.updateCount) receipt = candidate;
        } catch { /* Partial, old or malformed receipts cannot establish an outcome. */ }
      }
      if (receipt || lost || Date.now() >= roadReplay.deadline) {
        const {nonce:_nonce,...evidence} = receipt ?? {outcome:'unknown',code:lost?'REPLAY_OBSERVATION_LOST':'REPLAY_RECEIPT_TIMEOUT'};
        roadReplayResult = Object.freeze({...evidence,replayAcceptanceVerified:false,gameplayVerified:false});
        roadReplay = null; // Never delete the durable request or allow a retry.
        logger({level:receipt?.outcome === 'verified'?'info':'warn',event:'road_stop_replay_result',...roadReplayResult});
      }
    }
    if (companyInspection) {
      let receipt = null, code = null;
      if (Date.now() >= companyInspection.deadline || !connected) code = "INSPECTION_UNAVAILABLE";
      else {
        try { receipt = parseCompanyInspection(await readBounded(directory, "company_inspection.lua"), nonce, companyInspection.requestId, companyInspection.companyEntity); }
        catch { /* A partial/old response cannot produce inspection success. */ }
      }
      if (receipt || code) {
        if(phase2Setup?.status==='inspecting') {
          if(receipt?.outcome==='inspected' && phase2HeldContext(phase2Setup)
            &&receipt.companyEntity===phase2Setup.originalCompany&&receipt.updateCount===phase2Setup.updateCount
            &&receipt.originalKnown===1&&receipt.createdKnown===1&&receipt.createdBalance===0
            &&receipt.createdAssets===0&&receipt.createdVehicles===0&&receipt.createdLines===0) {
            phase2Setup={...phase2Setup,targetCompany:receipt.newCompanyEntity,status:'selecting'};
            await publish(directory,'phase2_setup.lua',{schemaVersion:1,kind:'phase2_setup',nonce,
              originalCompany:phase2Setup.originalCompany,targetCompany:phase2Setup.targetCompany,status:'selecting'});
          } else phase2Setup={...phase2Setup,status:'failed'};
        }
        if (depotPreview) {
          if (receipt?.outcome === 'inspected' && observations.status.available
              && observations.status.sample.companyEntity === receipt.companyEntity) {
            await publish(directory, 'depot_preview.lua', {schemaVersion:1,nonce,
              originalCompany:receipt.companyEntity,targetCompany:receipt.newCompanyEntity});
            logger({level:'info',event:'depot_preview',code:'OPEN_IN_GAME_COMPANY_TOOLS'});
          } else logger({level:'warn',event:'depot_preview',code:'EXISTING_TEST_COMPANY_REQUIRED'});
        }
        if(selectionId)companyInspectionResult=receipt?.outcome==='inspected'?receipt:{outcome:code??receipt?.outcome??'INSPECTION_UNAVAILABLE'};
        companyInspection = null;
        await unlink(path.join(directory, "company_inspect_request.lua")).catch(() => {});
        logger({ level: receipt?.outcome === "inspected" ? "info" : "warn", event: "company_inspection_result", code: code ?? receipt.outcome, gameplayVerified: false });
        if (receipt) for (const row of companyInspectionRows(receipt)) logger({ level: "info", event: "company_snapshot", ...row,
          tickCount: receipt.tickCount, updateCount: receipt.updateCount, gameplayVerified: false });
      }
    }
    if(stationProbe){
      let receipt=null;
      const expired=Date.now()>=stationProbe.deadline||!connected||!observations.status.available;
      if(!expired)try{receipt=parseStationTemplateReceipt(await readBounded(directory,'station_template_receipt.lua'),stationProbe.request);}catch{}
      if(expired||receipt){
        stationProbe=null;
        await unlink(path.join(directory,'station_template_request.lua')).catch(()=>{});
        const {nonce:_nonce,...evidence}=receipt??{};
        logger({level:receipt?.code==='TEMPLATE_EVALUATED'?'info':'warn',...evidence,
          event:'station_template_result',code:receipt?.code??'PROBE_UNAVAILABLE_NO_RETRY',gameplayVerified:false});
      }
    }
    if (phase2Depot) {
      let receipt=null;
      const expired=Date.now()>=phase2Depot.deadline||!connected||!observations.status.available;
      if(!expired){try{receipt=parseDepotReceipt(await readBounded(directory,'phase2_depot_receipt.lua'),phase2Depot.request);}catch{}}
      if(expired||receipt){
        phase2Depot=null;
        await unlink(path.join(directory,'phase2_depot_request.lua')).catch(()=>{});
        if(receipt?.outcome==='verified') phase2DepotContext=Object.freeze({
          originalCompany:receipt.companyEntity,targetCompany:receipt.targetCompany,
          depotEntity:receipt.depotEntity,updateCount:receipt.updateCount,
          originalBalance:receipt.balances.originalAfter,targetBalance:receipt.balances.targetAfter});
        logger({level:receipt?.outcome==='verified'?'info':'warn',event:'phase2_depot_result',
          code:receipt?.code??'OUTCOME_UNKNOWN_DO_NOT_RETRY',outcome:receipt?.outcome??'unknown',
          ...(receipt?{constructionEntity:receipt.constructionEntity,depotEntity:receipt.depotEntity,
            companyEntity:receipt.companyEntity,requestId:receipt.requestId,updateCount:receipt.updateCount,
            targetCompany:receipt.targetCompany,chargedCost:receipt.chargedCost,balances:receipt.balances}:{}),gameplayVerified:false});
      }
    }
    if (phase2Vehicle) {
      let receipt=null;
      const expired=Date.now()>=phase2Vehicle.deadline||!connected||!observations.status.available;
      if(!expired)try{receipt=parseVehicleReceipt(await readBounded(directory,'phase2_vehicle_receipt.lua'),phase2Vehicle.request);}catch{}
      if(receipt?.outcome==='verified'&&(!phase2HeldContext(phase2Vehicle.context)||receipt.balances.originalBefore!==phase2Vehicle.context.originalBalance
        ||receipt.balances.targetBefore!==phase2Vehicle.context.targetBalance||receipt.updateCount!==phase2Vehicle.context.updateCount))
        receipt={...receipt,outcome:'unknown',code:'CONTINUATION_STATE_CHANGED'};
      if(expired||receipt){
        if(receipt?.outcome==='verified') phase2ConstructionContext=Object.freeze({
          ...phase2Vehicle.context,vehicleEntity:receipt.vehicleEntity,nextSlot:1,
          originalBalance:receipt.balances.originalAfter,targetBalance:receipt.balances.targetAfter});
        phase2Vehicle=null;
        await unlink(path.join(directory,'phase2_vehicle_request.lua')).catch(()=>{});
        const {nonce:_nonce,...evidence}=receipt??{};
        logger({level:receipt?.outcome==='verified'?'info':'warn',...evidence,event:'phase2_vehicle_result',
          code:receipt?.code??'OUTCOME_UNKNOWN_DO_NOT_RETRY',outcome:receipt?.outcome??'unknown',gameplayVerified:false});
      }
    }
    if(phase2Station){
      let receipt=null;
      const expired=Date.now()>=phase2Station.deadline||!connected||!observations.status.available;
      if(!expired)try{receipt=parseStationReceipt(await readBounded(directory,'phase2_station_receipt.lua'),phase2Station.request);}catch{}
      const context=phase2Station.context;
      if(receipt?.outcome==='verified'&&(!phase2HeldContext(context)||receipt.balances.originalBefore!==context.originalBalance
        ||receipt.balances.targetBefore!==context.targetBalance||receipt.updateCount!==context.updateCount
        ||[context.depotEntity,context.vehicleEntity,context.stationA,context.constructionA].includes(receipt.stationEntity)
        ||[context.depotEntity,context.vehicleEntity,context.stationA,context.constructionA].includes(receipt.constructionEntity)))
        receipt={...receipt,outcome:'unknown',code:'CONTINUATION_STATE_CHANGED'};
      if(expired||receipt){
        if(receipt?.outcome==='verified') phase2ConstructionContext=Object.freeze({...context,nextSlot:receipt.slot+1,
          ...(receipt.slot===1?{stationA:receipt.stationEntity,constructionA:receipt.constructionEntity}
            :{stationB:receipt.stationEntity,constructionB:receipt.constructionEntity}),
          originalBalance:receipt.balances.originalAfter,targetBalance:receipt.balances.targetAfter});
        phase2Station=null;
        await unlink(path.join(directory,'phase2_station_request.lua')).catch(()=>{});
        const {nonce:_nonce,...evidence}=receipt??{};
        logger({level:receipt?.outcome==='verified'?'info':'warn',...evidence,event:'phase2_station_result',
          code:receipt?.code??'OUTCOME_UNKNOWN_DO_NOT_RETRY',outcome:receipt?.outcome??'unknown',gameplayVerified:false});
      }
    }
    if(phase2Service){
      let receipt=null;
      const expired=Date.now()>=phase2Service.deadline||!connected||!observations.status.available;
      if(!expired)try{receipt=parseServiceReceipt(await readBounded(directory,'phase2_service_receipt.lua'),phase2Service.request);}catch{}
      if(receipt?.outcome==='verified'&&(!phase2HeldContext(phase2Service.context)||receipt.updateCount!==phase2Service.context.updateCount))
        receipt={...receipt,outcome:'unknown',code:'CONTINUATION_STATE_CHANGED'};
      if(expired||receipt){
        if(receipt?.outcome==='verified'){
          serviceBinding=Object.freeze({originalCompany:receipt.companyEntity,targetCompany:receipt.targetCompany,
            vehicleEntity:receipt.vehicleEntity,lineEntity:receipt.lineEntity,updateCount:receipt.updateCount});
          serviceObservationPhase='ready';
        }
        phase2Service=null;
        await unlink(path.join(directory,'phase2_service_request.lua')).catch(()=>{});
        const {nonce:_nonce,...evidence}=receipt??{};
        logger({level:receipt?.outcome==='verified'?'info':'warn',...evidence,event:'phase2_service_result',
          code:receipt?.code??'OUTCOME_UNKNOWN_DO_NOT_RETRY',outcome:receipt?.outcome??'unknown',gameplayVerified:false});
      }
    }
    // Observation permits simulation between two explicit paused endpoints,
    // never between request publication and its correlated engine readback.
    if(serviceObservationPhase==='observing'&&(!connected||!observations.status.available
      ||observations.status.sample.companyEntity!==serviceBinding?.originalCompany
      ||observations.status.sample.updateCount<serviceObservationStart.updateCount)){
      serviceObservationPhase='failed';
      logger({level:'warn',event:'phase2_service_observation_result',code:'OBSERVATION_CONTINUITY_LOST',outcome:'unavailable',gameplayVerified:false});
    }
    if(serviceObservation){
      const active=serviceObservation;
      let receipt=null;
      const expired=Date.now()>=active.deadline||!connected||!observations.status.available||!phase2HeldContext(active.context);
      if(!expired)try{receipt=parseServiceObservationReceipt(await readBounded(directory,'phase2_service_observation_receipt.lua'),active.request);}catch{}
      if(receipt&&receipt.outcome!=='rejected'&&(receipt.updateCount!==active.context.updateCount
        ||(active.request.action==='end'&&(receipt.startGameTime!==serviceObservationStart?.gameTime
          ||receipt.startUpdateCount!==serviceObservationStart?.updateCount))))receipt=null;
      if(expired||receipt){
        serviceObservation=null;
        serviceObservationPhase=receipt?.outcome==='raw_start_captured'?'observing':receipt?.outcome==='raw_end_captured'?'finished':'failed';
        if(receipt?.outcome==='raw_start_captured')serviceObservationStart=receipt;
        await unlink(path.join(directory,'phase2_service_observation_request.lua')).catch(()=>{});
        const {nonce:_nonce,...evidence}=receipt??{};
        logger({level:receipt&&receipt.outcome!=='rejected'?'info':'warn',...evidence,event:'phase2_service_observation_result',
          outcome:receipt?.outcome??'unavailable',code:receipt?.code??'OBSERVATION_UNAVAILABLE',gameplayVerified:false,serviceAccountingVerified:false});
      }
    }
    if (phase2Funding) {
      let receipt=null;
      const expired=Date.now()>=phase2Funding.deadline||!connected||!observations.status.available;
      if(!expired){
        try {receipt=parseFundingReceipt(await readBounded(directory,'phase2_funding_receipt.lua'),phase2Funding.request);}
        catch { /* Missing, malformed or unrelated evidence cannot authorize another credit. */ }
      }
      if(expired||receipt){
        phase2Funding=null;
        await unlink(path.join(directory,'phase2_funding_request.lua')).catch(()=>{});
        if(receipt?.outcome==='funded') phase2FundedContext=Object.freeze({
          originalCompany:receipt.companyEntity,targetCompany:receipt.targetCompany,
          updateCount:receipt.updateCount});
        logger({level:receipt?.outcome==='funded'?'info':'warn',event:'phase2_funding_result',
          code:receipt?.outcome??'OUTCOME_UNKNOWN_DO_NOT_RETRY',
          ...(receipt?{companyEntity:receipt.companyEntity,requestId:receipt.requestId,updateCount:receipt.updateCount,
            targetCompany:receipt.targetCompany,amount:receipt.amount,balances:receipt.balances}:{}),
          gameplayVerified:false});
      }
    }
    if (companyProbe) {
      let receipt = null, code = null;
      if (Date.now() >= companyProbe.deadline || !connected) code = "OUTCOME_UNKNOWN_DO_NOT_RETRY";
      else {
        try { receipt = companyProbe.finance
          ? parseFinanceReceipt(await readBounded(directory, "finance_receipt.lua"), nonce, companyProbe.requestId, companyProbe.companyEntity)
          : parseCompanyReceipt(await readBounded(directory, "company_receipt.lua"), nonce, companyProbe.requestId, companyProbe.companyEntity); }
        catch { /* Only an exact valid receipt can finish this mutation. */ }
      }
      if (receipt || code) {
        const finance = companyProbe.finance;
        companyProbe = null;
        await unlink(path.join(directory, "company_request.lua")).catch(() => {});
        logger({ level: ["created", "passed"].includes(receipt?.outcome) ? "info" : "warn", event: finance ? "finance_test_result" : "company_test_result", code: code ?? receipt.outcome,
          ...(receipt ? { companyEntity: receipt.companyEntity, newCompanyEntity: receipt.newCompanyEntity, updateCount: receipt.updateCount } : {}), gameplayVerified: false });
        if (finance && receipt?.outcome === "passed") for (const name of ["original", "target"]) logger({ level: "info", event: "finance_test_balances",
          companyEntity: name === "original" ? receipt.companyEntity : receipt.newCompanyEntity,
          beforeBalance: receipt.balances[name + "Before"], creditedBalance: receipt.balances[name + "Credit"], afterBalance: receipt.balances[name + "After"], gameplayVerified: false });
      }
    }
    if (probe) {
      if (Date.now() >= probe.deadline) await finishProbe("engine_probe_timeout");
      else if (!connected) await finishProbe("engine_probe_disconnected");
      else {
        try {
          const source = await readBounded(directory, "engine_receipt.lua");
          const receipt = probe.scheduledUpdate === undefined
            ? parseEngineReceipt(source, nonce, probe.requestId)
            : parseScheduledReceipt(source, nonce, probe.requestId, probe.scheduledUpdate);
          await finishProbe(receipt.outcome && receipt.outcome !== "applied" ? "engine_probe_failed" : "engine_probe_succeeded", receipt);
        } catch { /* Missing/partial/old receipts cannot acknowledge a request. */ }
      }
    }
    if(selectionId&&coordinatorSelection===null&&!coordinationLease){
      try {
        const p=parseFlatDataFile(await readBounded(directory,'coordinator_selection.lua'));
        if(Object.keys(p).sort().join(',')==='entity,nonce,schemaVersion,selectionId'&&p.schemaVersion===1&&p.nonce===nonce&&p.selectionId===selectionId
          &&Number.isSafeInteger(p.entity)&&p.entity>=0&&p.entity<=2147483647) coordinatorSelection=p.entity;
      } catch { /* Missing/stale selection is not a gameplay command. */ }
    }
  };
  const timer = setInterval(() => { pending = pending.then(async () => {
    await poll();
    if (haltTest && !stopped) {
      try { await haltTest.poll(); }
      catch { await haltTest.close().catch(() => {}); }
      return; // A stop test owns the terminal helper phase; no later mutations.
    }
    if (pauseTest && !stopped) {
      try { await pauseTest.poll(); }
      catch { await pauseTest.close(); }
    }
    if (controlLease && !stopped) {
      try { await controlLease.poll(); }
      catch { await controlLease.close().catch(() => {}); logger({ level: "warn", event: "control_test_failed", code: "CONTROL_IO_FAILED_STOP_HELPER" }); }
    }
    if (snapshotProbe && !stopped) {
      try { await snapshotProbe.poll(); }
      catch {
        await snapshotProbe.close().catch(() => {});
        logger({level:"warn",event:"held_snapshot_failed",code:"SNAPSHOT_IO_FAILED",gameplayVerified:false});
      }
    }
    if (combinedVehicle && combinedReady && pauseTest?.phase === "passed" && !combinedCompleted) {
      combinedCompleted = true;
      logger({ level: "info", event: "combined_test_passed", code: "LOCAL_HELD_VEHICLE_AND_RESUME_ONLY", gameplayVerified: false });
    }
    if (combinedVehicle && pauseTest?.phase === "held" && !vehicleTest && !stopped) {
      const heldUpdate = pauseTest.heldUpdate;
      const remove = name => unlink(path.join(directory, name)).catch(error => { if (error.code !== "ENOENT") throw error; });
      for (const name of ["vehicle_intent.lua", "vehicle_command.lua", "vehicle_receipt.lua"]) await remove(name);
      vehicleTest = createVehicleTest({ nonce, scheduled: true, leadUpdates: 40, heldUpdate, logger,
        read: name => readBounded(directory, name), publish: (name, fields) => publish(directory, name, fields), remove,
        clock: () => ({ ...observations.status.sample }),
        connected: () => connected && observations.status.available && pauseTest.phase === "held"
          && observations.status.sample.speedup === 0 && observations.status.sample.updateCount === heldUpdate,
        onHeldApplied: async receipt => {
          await publish(directory, "bridge.lua", { schemaVersion: 1, nonce, mode: "pause_test" });
          vehicleFaultPublished = true;
          const firstRequestId = ++requestSequence; requestSequence++;
          snapshotProbe=createHeldSnapshotProbe({nonce,entity:receipt.entity,companyEntity:receipt.company,heldUpdate,stopFlag:receipt.stopFlag,firstRequestId,
            observe:() => observations.status,
            publish:fields => publish(directory,"snapshot_request.lua",fields),
            read:() => readBounded(directory,"snapshot_receipt.lua"),
            remove:() => remove("snapshot_request.lua"),logger,
            complete:async () => {
              combinedReady=true;
              logger({level:"info",event:"combined_test_action_held",heldUpdate,gameplayVerified:false});
            }});
          await snapshotProbe.start();
        } });
      await publish(directory, "bridge.lua", { schemaVersion: 1, nonce, mode: "vehicle_test" });
      logger({ level: "info", event: "combined_test_select_vehicle", heldUpdate, gameplayVerified: false });
    }
    if (vehicleTest && !stopped) {
      try { await vehicleTest.poll(); }
      catch {
        await vehicleTest.close();
        logger({ level: "warn", event: "vehicle_test_rejected", code: "BRIDGE_WRITE_FAILED" });
      }
      if (vehicleTest.faulted && !vehicleFaultPublished) {
        await publish(directory, "bridge.lua", { schemaVersion: 1, nonce, mode: "telemetry" });
        vehicleFaultPublished = true;
      }
    }
  }).catch(() => {}); }, intervalMs);
  return {
    nonce,
    beginPhase2Setup() {
      const operation=pending.then(async()=>{
        if(stopped||!connected||!observations.status.available||observations.status.sample.speedup!==0)
          throw new Error('PAUSED_FRESH_BRIDGE_OBSERVATION_REQUIRED');
        if(phase2Setup||depotPreview||selectionId||haltTest||pauseTest||vehicleTest||probe||companyProbe||companyInspection||companyTestUsed||stationProbe)
          throw new Error('FRESH_SOLO_HOST_REQUIRED');
        phase2Setup={status:'inspecting',originalCompany:observations.status.sample.companyEntity,
          updateCount:observations.status.sample.updateCount,targetCompany:null};
        for(const name of ['phase2_setup.lua','phase2_plan.lua'])await unlink(path.join(directory,name)).catch(e=>{if(e.code!=='ENOENT')throw e;});
        const requestId=++requestSequence;
        await publish(directory,'company_inspect_request.lua',{schemaVersion:1,kind:'company_inspect',nonce,requestId});
        companyInspection={requestId,companyEntity:phase2Setup.originalCompany,deadline:Date.now()+15000};
      });
      pending=operation.catch(()=>{});return operation;
    },
    get phase2SetupState(){return phase2Setup?{...phase2Setup}:null;},
    async readPhase2SetupPlan(checkpointHash) {
      if(stopped||!connected||!['selecting','ready'].includes(phase2Setup?.status)||!phase2HeldContext(phase2Setup))
        throw new Error('PHASE2_SELECTION_CONTEXT_CHANGED');
      return parsePhase2SetupPlan(await readBounded(directory,'phase2_plan.lua'),{nonce,
        originalCompany:phase2Setup.originalCompany,targetCompany:phase2Setup.targetCompany,checkpointHash});
    },
    setPhase2SetupStatus(status) {
      const operation=pending.then(async()=>{
        const next={selecting:['ready','failed'],ready:['running','failed'],running:['complete','failed']};
        if(stopped||!phase2Setup||!next[phase2Setup.status]?.includes(status))throw new Error('INVALID_PHASE2_SETUP_TRANSITION');
        if(status!=='failed'&&(!connected||!phase2HeldContext(phase2Setup)))throw new Error('PHASE2_SELECTION_CONTEXT_CHANGED');
        phase2Setup={...phase2Setup,status};
        await publish(directory,'phase2_setup.lua',{schemaVersion:1,kind:'phase2_setup',nonce,
          originalCompany:phase2Setup.originalCompany,targetCompany:phase2Setup.targetCompany,status});
      });
      pending=operation.catch(()=>{});return operation;
    },
    beginDepotPreview() {
      const operation=pending.then(async()=>{
        if(stopped||!connected||!observations.status.available)throw new Error('OBSERVATION_REQUIRED');
        if(depotPreview||selectionId||haltTest||pauseTest||vehicleTest||probe||companyProbe||companyInspection||companyTestUsed)
          throw new Error('FRESH_SOLO_HOST_REQUIRED');
        depotPreview=true;
        companyTestUsed=true; // Reserve this helper for read-only company tooling.
        await unlink(path.join(directory,'depot_preview.lua')).catch(e=>{if(e.code!=='ENOENT')throw e;});
        const requestId=++requestSequence;
        await publish(directory,'company_inspect_request.lua',{schemaVersion:1,kind:'company_inspect',nonce,requestId});
        companyInspection={requestId,companyEntity:observations.status.sample.companyEntity,deadline:Date.now()+15000};
        logger({level:'info',event:'depot_preview',code:'READ_ONLY_INSPECTION'});
      });
      pending=operation.catch(()=>{});return operation;
    },
    get connected() { return connected; },
    get clock() { return { ...clock }; },
    get engineObservation() { return { ...observations.status, available: connected && observations.status.available }; },
    get haltState() { return haltTest?.phase ?? "not_requested"; },
    get coordinationLeaseState() { return coordinationLease?.phase ?? "not_started"; },
    get coordinatorSetup() {
      return {vehicleEntity:coordinatorSelection,companyEntity:companyInspectionResult?.companyEntity??null,
        secondCompanyEntity:companyInspectionResult?.newCompanyEntity??null,
        inspection:companyInspectionResult?.outcome??'pending'};
    },
    beginCoordinatorSelection() {
      const operation=pending.then(async()=>{
        if(stopped||!connected||!observations.status.available)throw new Error('OBSERVATION_REQUIRED');
        if(selectionId||haltTest||pauseTest||vehicleTest||probe||companyProbe||companyInspection||companyTestUsed)throw new Error('COORDINATOR_SETUP_BUSY');
        selectionId=randomBytes(16).toString('hex');
        const requestId=++requestSequence;
        await publish(directory,'bridge.lua',{schemaVersion:1,nonce,mode:'telemetry',selectionId});
        await publish(directory,'company_inspect_request.lua',{schemaVersion:1,kind:'company_inspect',nonce,requestId});
        companyInspection={requestId,companyEntity:observations.status.sample.companyEntity,deadline:Date.now()+15000};
      });
      pending=operation.catch(()=>{});return operation;
    },
    get coordinationControlsLocked() { return coordinationLease?.active === true && connected && observations.status.available && controlLease?.phase === "locked"; },
    acquireCoordinationControls() {
      const operation=pending.then(async()=>{
        if(stopped||!coordinationLease?.active||!connected||!observations.status.available||observations.status.sample.speedup!==0) throw new Error("COORDINATION_HOLD_REQUIRED");
        if(controlLease) throw new Error("CONTROL_LEASE_ALREADY_USED");
        controlLease=createControlLease({nonce,logger,
          publish:fields=>publish(directory,"control_request.lua",fields),
          read:()=>readBounded(directory,"control_receipt.lua"),
          remove:()=>unlink(path.join(directory,"control_request.lua")).catch(e=>{if(e.code!=="ENOENT")throw e;}),
          held:()=>connected&&observations.status.available&&observations.status.sample.speedup===0,
          valid:()=>!stopped&&connected&&observations.status.available&&coordinationLease.active});
        await controlLease.acquire();
      });
      pending=operation.catch(()=>{});return operation;
    },
    startCoordinationLease({healthy,onFailure}={}) {
      const operation=pending.then(async()=>{
        if(typeof healthy!=="function"||typeof onFailure!=="function") throw new TypeError("SESSION_HEALTH_CALLBACKS_REQUIRED");
        if(stopped||!connected||!observations.status.available) throw new Error("OBSERVATION_REQUIRED");
        if(haltTest||pauseTest||vehicleTest||probe||companyProbe||companyInspection||companyTestUsed) throw new Error("COORDINATION_BUSY_OR_USED");
        let writes=Promise.resolve();
        coordinationLease=createEngineLease({nonce,healthy,onFailure:code=>{
          logger({level:"warn",event:"coordination_lease_failed",code,gameplayVerified:false});
          onFailure(code);
        },observe:()=>({...observations.status,available:connected&&observations.status.available}),
        publish:fields=>{
          const write=writes.then(async()=>{
            if(stopped||coordinationLease.phase==="closed"||coordinationLease.phase==="failed") throw new Error("LEASE_CLOSED");
            await publish(directory,"bridge.lua",{schemaVersion:1,nonce,mode:"watchdog_test"});
            await publish(directory,"watchdog_request.lua",fields);
          });
          writes=write.catch(()=>{});return write;
        }});
        // Reuse exclusive terminal ownership, not halt evidence. No diagnostic
        // can switch bridge modes once the coordinator owns this helper.
        haltTest={phase:"not_requested",poll:async()=>{
          if(controlLease&&!['failed','closed'].includes(coordinationLease.phase)){
            try {await controlLease.poll();} catch {await controlLease.close();}
            if(controlLease.phase==='failed'||controlLease.phase==='closed'){
              coordinationLease.close();onFailure('NATIVE_CONTROLS_LOST');return;
            }
          }
          coordinationLease.poll();await writes;
          try {coordinationLease.receive(await readBounded(directory,"watchdog_receipt.lua"));}
          catch(error) {if(!["ENOENT","EBUSY"].includes(error.code)) logger({level:"warn",event:"coordination_lease_receipt_unavailable",gameplayVerified:false});}
        },close:async()=>{coordinationLease.close();await writes;}};
        coordinationLease.start();await writes;
        return Object.freeze({get phase(){return coordinationLease.phase;},get active(){return coordinationLease.active;},
          stop(){coordinationLease.close();}});
      });
      pending=operation.catch(()=>{});return operation;
    },
    requestWatchdogTest() {
      const operation = pending.then(async () => {
        if (stopped || !connected || !observations.status.available) throw new Error("OBSERVATION_REQUIRED");
        const completedBatch=combinedCompleted&&pauseTest?.phase==="passed"&&controlLease?.phase==="released";
        if(haltTest||!completedBatch&&(pauseTest||vehicleTest)||probe||companyProbe||companyInspection||companyTestUsed) throw new Error("WATCHDOG_TEST_BUSY_OR_USED");
        // Share terminal ownership/fencing with the existing explicit halt test.
        haltTest=createWatchdogProbe({nonce,requestId:++requestSequence,logger,
          observe:()=>({...observations.status,available:connected&&observations.status.available}),
          publish:async fields=>{
            await publish(directory,"bridge.lua",{schemaVersion:1,nonce,mode:"watchdog_test"});
            await publish(directory,"watchdog_request.lua",fields);
          },
          read:()=>readBounded(directory,"watchdog_receipt.lua"),
          remove:()=>unlink(path.join(directory,"watchdog_request.lua")).catch(e=>{if(e.code!=="ENOENT")throw e;})});
        await haltTest.start();
      });
      pending=operation.catch(()=>{});return operation;
    },
    requestHaltTest() {
      const operation=pending.then(async()=>{
        if(stopped||!connected||!observations.status.available) throw new Error("OBSERVATION_REQUIRED");
        const completedBatch=combinedCompleted&&pauseTest?.phase==="passed"&&controlLease?.phase==="released";
        if(haltTest||!completedBatch&&(pauseTest||vehicleTest)||probe||companyProbe||companyInspection||companyTestUsed) throw new Error("HALT_TEST_BUSY_OR_USED");
        haltTest=createHaltProbe({nonce,requestId:++requestSequence,logger,
          observe:()=>({...observations.status,available:connected&&observations.status.available}),
          publish:async fields=>{
            await publish(directory,"bridge.lua",{schemaVersion:1,nonce,mode:"halt_test"});
            await publish(directory,"halt_request.lua",fields);
          },
          read:()=>readBounded(directory,"halt_receipt.lua"),
          remove:()=>unlink(path.join(directory,"halt_request.lua")).catch(e=>{if(e.code!=="ENOENT")throw e;})});
        await haltTest.start();
      });
      pending=operation.catch(()=>{});return operation;
    },
    requestPauseTest({ scheduled = false, withVehicle = false } = {}) {
      const operation = pending.then(async () => {
        if (typeof scheduled !== "boolean" || typeof withVehicle !== "boolean" || withVehicle && !scheduled) throw new Error("INVALID_PAUSE_MODE");
        if (stopped || !connected || !observations.status.available) throw new Error("OBSERVATION_REQUIRED");
        if (haltTest || pauseTest || companyTestUsed || companyInspection || vehicleTest || probe) throw new Error("PAUSE_TEST_BUSY_OR_USED");
        if (observations.status.sample.speedup !== 1) throw new Error("NORMAL_SPEED_REQUIRED");
        combinedVehicle = withVehicle;
        pauseTest = createPauseProbe({ nonce, companyEntity: observations.status.sample.companyEntity, requestId: ++requestSequence,
          publish: (name, fields) => publish(directory, name, fields),
          remove: name => unlink(path.join(directory, name)).catch(error => { if (error.code !== "ENOENT") throw error; }),
          read: name => readBounded(directory, name),
          observe: () => ({ ...observations.status, available: connected && observations.status.available }), logger, scheduled });
        await publish(directory, "bridge.lua", { schemaVersion: 1, nonce, mode: "pause_test" });
        await pauseTest.start();
      });
      pending = operation.catch(() => {}); return operation;
    },
    releasePauseTest() {
      const operation = pending.then(async () => {
        if (haltTest || stopped || !pauseTest) throw new Error("PAUSE_TEST_NOT_HELD");
        if (controlLease && controlLease.phase !== "released") throw new Error("RELEASE_SPEED_CONTROLS_FIRST");
        if (combinedVehicle && !combinedReady) throw new Error("HELD_VEHICLE_ACTION_REQUIRED");
        await pauseTest.resume();
      });
      pending = operation.catch(() => {}); return operation;
    },
    requestControlTest({ release = false } = {}) {
      const operation = pending.then(async () => {
        if (haltTest || stopped || !connected || pauseTest?.phase !== "held" || combinedVehicle && !combinedReady) throw new Error("HELD_TEST_REQUIRED");
        if (release) {
          if (!controlLease) throw new Error("CONTROL_NOT_LOCKED");
          await controlLease.release(); return;
        }
        if (controlLease) throw new Error("CONTROL_TEST_ALREADY_USED");
        controlLease = createControlLease({ nonce, logger,
          publish: fields => publish(directory, "control_request.lua", fields),
          read: () => readBounded(directory, "control_receipt.lua"),
          remove: () => unlink(path.join(directory, "control_request.lua")).catch(e => { if (e.code !== "ENOENT") throw e; }),
          held: () => connected && observations.status.available && pauseTest.phase === "held" });
        await controlLease.acquire();
      });
      pending = operation.catch(() => {}); return operation;
    },
    inspectCompanies() {
      const operation = pending.then(async () => {
        if (stopped || !connected || !observations.status.available) throw new Error("OBSERVATION_REQUIRED");
        if (haltTest || pauseTest || companyInspection || companyProbe || probe || vehicleTest) throw new Error("INSPECTION_BUSY");
        const requestId = ++requestSequence;
        await publish(directory, "company_inspect_request.lua", { schemaVersion: 1, kind: "company_inspect", nonce, requestId });
        companyInspection = { requestId, companyEntity: observations.status.sample.companyEntity, deadline: Date.now() + 15000 };
        logger({ level: "info", event: "company_inspection_started", code: "READ_ONLY" });
      });
      pending = operation.catch(() => {}); return operation;
    },
    requestRoadStopReplay({source,currentIdentity,confirmedCheckpointReloaded}={}) {
      // Snapshot caller data before joining the asynchronous helper queue.
      checkRoadStopReplayIdentity(source,currentIdentity);
      const identity={...currentIdentity};
      if (confirmedCheckpointReloaded !== true) throw new Error('EXPLICIT_REPLAY_CONFIRMATION_REQUIRED');
      const operation=pending.then(async()=>{
        if(stopped||!connected||!observations.status.available||observations.status.sample.speedup!==0)
          throw new Error('PAUSED_FRESH_BRIDGE_OBSERVATION_REQUIRED');
        if(companyTestUsed||roadReplay||phase2Setup||depotPreview||selectionId||haltTest||pauseTest||probe||vehicleTest||companyProbe||companyInspection||stationProbe)
          throw new Error('FRESH_SOLO_HOST_REQUIRED');
        const sample=observations.status.sample;
        const options={nonce,requestId:requestSequence+1,issuedTick:sample.tickCount,expiresTick:sample.tickCount+300,confirmedCheckpointReloaded:true};
        const {request}=createRoadStopReplayRequest(source,options);
        if(request.targetCompany!==sample.companyEntity)throw new Error('REPLAY_COMPANY_MISMATCH');
        companyTestUsed=true;requestSequence++;
        roadReplay={...options,targetCompany:request.targetCompany,updateCount:sample.updateCount,deadline:Date.now()+companyTimeoutMs};
        try {
          await publish(directory,'bridge.lua',{schemaVersion:1,nonce,mode:'company_test'});
          await publishRoadStopReplayRequest(directory,source,options,identity);
          logger({level:'warn',event:'road_stop_replay_started',code:'DISPOSABLE_RELOADED_CHECKPOINT_ONLY',gameplayVerified:false});
        } catch {
          roadReplay=null;
          roadReplayResult=Object.freeze({outcome:'unknown',code:'REPLAY_PUBLICATION_UNKNOWN',replayAcceptanceVerified:false,gameplayVerified:false});
          logger({level:'warn',event:'road_stop_replay_result',...roadReplayResult});
          throw new Error('REPLAY_PUBLICATION_UNKNOWN_DO_NOT_RETRY');
        }
      });
      pending=operation.catch(()=>{});return operation;
    },
    get roadStopReplayResult(){return roadReplayResult?{...roadReplayResult}:null;},
    requestStationTemplateProbe(){
      const operation=pending.then(async()=>{
        if(stopped||!connected||!observations.status.available)throw new Error('OBSERVATION_REQUIRED');
        if(companyTestUsed||companyProbe||companyInspection||haltTest||pauseTest||probe||vehicleTest||selectionId)
          throw new Error('FRESH_SOLO_HOST_REQUIRED');
        const request=stationTemplateRequest(nonce,requestSequence+1,observations.status.sample.tickCount);
        companyTestUsed=true;requestSequence++;
        stationProbe={request,deadline:Date.now()+companyTimeoutMs};
        await publish(directory,'bridge.lua',{schemaVersion:1,nonce,mode:'company_test'});
        await publish(directory,'station_template_request.lua',request);
        logger({level:'info',event:'station_template_started',code:'READ_ONLY_NO_BUILD',gameplayVerified:false});
      });
      pending=operation.catch(()=>{});return operation;
    },
    requestPhase2Depot({targetCompany,placement,confirmed}={}) {
      const operation=pending.then(async()=>{
        if(stopped||!connected||!observations.status.available)throw new Error('OBSERVATION_REQUIRED');
        const sample=observations.status.sample;
        const fundedContinuation=phase2FundedContext!==null
          &&phase2FundedContext.originalCompany===sample.companyEntity
          &&phase2FundedContext.targetCompany===targetCompany
          &&phase2FundedContext.updateCount===sample.updateCount&&sample.speedup===0;
        if((companyTestUsed&&!fundedContinuation)||phase2Funding||phase2Depot
          ||companyProbe||companyInspection||haltTest||pauseTest||probe||vehicleTest||selectionId)
          throw new Error('FRESH_SOLO_HOST_REQUIRED');
        const request=depotRequest({nonce,requestId:requestSequence+1,sample,targetCompany,placement,confirmed});
        phase2FundedContext=null; // Consume continuation before any publication.
        companyTestUsed=true;
        requestSequence++;
        phase2Depot={request,deadline:Date.now()+companyTimeoutMs};
        await unlink(path.join(directory,'company_request.lua')).catch(e=>{if(e.code!=='ENOENT')throw e;});
        await publish(directory,'bridge.lua',{schemaVersion:1,nonce,mode:'company_test'});
        await publish(directory,'phase2_depot_request.lua',request);
        logger({level:'warn',event:'phase2_depot_started',targetCompany,gameplayVerified:false});
      });
      pending=operation.catch(()=>{});return operation;
    },
    requestPhase2Vehicle({targetCompany,depotEntity,model,confirmed}={}) {
      const operation=pending.then(async()=>{
        if(stopped||!connected||!observations.status.available)throw new Error('OBSERVATION_REQUIRED');
        const sample=observations.status.sample;
        if(!phase2DepotContext||phase2DepotContext.originalCompany!==sample.companyEntity
          ||phase2DepotContext.targetCompany!==targetCompany||phase2DepotContext.depotEntity!==depotEntity
          ||phase2DepotContext.updateCount!==sample.updateCount||sample.speedup!==0
          ||phase2Funding||phase2Depot||phase2Vehicle||companyProbe||companyInspection
          ||haltTest||pauseTest||probe||vehicleTest||selectionId)
          throw new Error('VERIFIED_HELD_DEPOT_REQUIRED');
        const request=vehicleRequest({nonce,requestId:requestSequence+1,sample,targetCompany,depotEntity,model,confirmed});
        const context=phase2DepotContext;
        phase2DepotContext=null; // One explicit purchase only; never rearm on missing/late evidence.
        companyTestUsed=true;
        requestSequence++;
        phase2Vehicle={request,context,deadline:Date.now()+companyTimeoutMs};
        await publish(directory,'phase2_vehicle_request.lua',request);
        logger({level:'warn',event:'phase2_vehicle_started',targetCompany,depotEntity,gameplayVerified:false});
      });
      pending=operation.catch(()=>{});return operation;
    },
    requestPhase2Station({targetCompany,slot,placement,confirmed}={}) {
      const operation=pending.then(async()=>{
        if(stopped||!connected||!observations.status.available)throw new Error('OBSERVATION_REQUIRED');
        const sample=observations.status.sample,context=phase2ConstructionContext;
        if(!context||context.originalCompany!==sample.companyEntity||context.targetCompany!==targetCompany
          ||context.updateCount!==sample.updateCount||sample.speedup!==0||context.nextSlot!==slot
          ||phase2Station||phase2Service||phase2Vehicle||phase2Depot||phase2Funding)
          throw new Error('VERIFIED_STATION_SEQUENCE_REQUIRED');
        const request=stationRequest({nonce,requestId:requestSequence+1,sample,targetCompany,slot,placement,confirmed});
        phase2ConstructionContext=null;
        requestSequence++;
        phase2Station={request,context,deadline:Date.now()+companyTimeoutMs};
        await publish(directory,'phase2_station_request.lua',request);
        logger({level:'warn',event:'phase2_station_started',targetCompany,slot,gameplayVerified:false});
      });
      pending=operation.catch(()=>{});return operation;
    },
    requestPhase2Service({targetCompany,depotEntity,vehicleEntity,stationA,stationB,confirmed}={}) {
      const operation=pending.then(async()=>{
        if(stopped||!connected||!observations.status.available)throw new Error('OBSERVATION_REQUIRED');
        const sample=observations.status.sample,context=phase2ConstructionContext;
        if(!context||context.nextSlot!==3||context.originalCompany!==sample.companyEntity
          ||context.targetCompany!==targetCompany||context.depotEntity!==depotEntity||context.vehicleEntity!==vehicleEntity
          ||context.stationA!==stationA||context.stationB!==stationB||context.updateCount!==sample.updateCount||sample.speedup!==0
          ||phase2Station||phase2Service||phase2Vehicle||phase2Depot||phase2Funding)
          throw new Error('VERIFIED_SERVICE_ASSETS_REQUIRED');
        const request=serviceRequest({nonce,requestId:requestSequence+1,sample,targetCompany,depotEntity,vehicleEntity,stationA,stationB,confirmed});
        phase2ConstructionContext=null;
        requestSequence++;
        phase2Service={request,context,deadline:Date.now()+companyTimeoutMs};
        await publish(directory,'phase2_service_request.lua',request);
        logger({level:'warn',event:'phase2_service_started',targetCompany,vehicleEntity,gameplayVerified:false});
      });
      pending=operation.catch(()=>{});return operation;
    },
    get serviceObservationState(){return Object.freeze({phase:serviceObservationPhase,binding:serviceBinding});},
    requestServiceObservation(action){
      const operation=pending.then(async()=>{
        if(stopped||!connected||!observations.status.available||serviceObservation
          ||!serviceBinding||!['start','end'].includes(action)
          ||serviceObservationPhase!==(action==='start'?'ready':'observing')
          ||phase2Station||phase2Service||phase2Vehicle||phase2Depot||phase2Funding||roadReplay
          ||companyProbe||companyInspection||haltTest||pauseTest||probe||vehicleTest||selectionId)
          throw new Error('VERIFIED_SERVICE_OBSERVATION_REQUIRED');
        const sample=observations.status.sample;
        if(action==='start'&&sample.updateCount!==serviceBinding.updateCount)throw new Error('SERVICE_START_CONTEXT_CHANGED');
        if(action==='end'&&sample.updateCount<=serviceObservationStart.updateCount)throw new Error('SIMULATION_DID_NOT_ADVANCE');
        const request=serviceObservationRequest({nonce,requestId:requestSequence+1,action,sample,binding:serviceBinding});
        // Consume the endpoint before awaiting publication. This is not a native
        // mutation, but replacing an uncertain baseline would invalidate evidence.
        serviceObservationPhase='pending';requestSequence++;
        serviceObservation={request,context:{originalCompany:sample.companyEntity,updateCount:sample.updateCount},deadline:Date.now()+companyTimeoutMs};
        await publish(directory,'phase2_service_observation_request.lua',request);
        logger({level:'info',event:'phase2_service_observation_started',action,gameplayVerified:false});
      });
      pending=operation.catch(()=>{});return operation;
    },
    requestPhase2Funding({targetCompany,amount,confirmed}={}) {
      const operation=pending.then(async()=>{
        if(stopped||!connected||!observations.status.available)throw new Error('OBSERVATION_REQUIRED');
        if(companyTestUsed||companyProbe||companyInspection||haltTest||pauseTest||probe||vehicleTest||selectionId)
          throw new Error('FRESH_SOLO_HOST_REQUIRED');
        const request=fundingRequest({nonce,requestId:requestSequence+1,sample:observations.status.sample,
          targetCompany,amount,confirmed});
        companyTestUsed=true; // Consumed before publication; never rearmed by timeout.
        requestSequence++;
        phase2Funding={request,deadline:Date.now()+companyTimeoutMs};
        await unlink(path.join(directory,'company_request.lua')).catch(e=>{if(e.code!=='ENOENT')throw e;});
        await publish(directory,'bridge.lua',{schemaVersion:1,nonce,mode:'company_test'});
        await publish(directory,'phase2_funding_request.lua',request);
        logger({level:'warn',event:'phase2_funding_started',amount,targetCompany,gameplayVerified:false});
      });
      pending=operation.catch(()=>{});return operation;
    },
    requestCompanyTest({ finance = false } = {}) {
      const operation = pending.then(async () => {
        if (typeof finance !== "boolean") throw new Error("BAD_COMPANY_MODE");
        if (stopped || !connected || !observations.status.available) throw new Error("OBSERVATION_REQUIRED");
        if (haltTest || pauseTest || probe || vehicleTest || companyTestUsed || companyInspection) throw new Error("COMPANY_TEST_BUSY_OR_USED");
        const sample = observations.status.sample;
        if (sample.speedup === 0) throw new Error("RUN_SIMULATION_FIRST");
        if (sample.tickCount + 300 > 2147483647) throw new Error("CLOCK_LIMIT");
        companyTestUsed = true; // Latch BEFORE I/O: never retry uncertain publication.
        const requestId = ++requestSequence;
        companyProbe = { requestId, companyEntity: sample.companyEntity, deadline: Date.now() + companyTimeoutMs, finance };
        await publish(directory, "bridge.lua", { schemaVersion: 1, nonce, mode: "company_test" });
        await publish(directory, "company_request.lua", { schemaVersion: 1, kind: finance ? "finance_probe" : "company_probe", nonce, requestId,
          companyEntity: sample.companyEntity, issuedTick: sample.tickCount, expiresTick: sample.tickCount + 300 });
        logger({ level: "warn", event: finance ? "finance_test_started" : "company_test_started", code: "DISPOSABLE_SAVE_ONLY" });
      });
      pending = operation.catch(() => {}); return operation;
    },
    enableVehicleTest({ scheduled = false, leadUpdates = 60 } = {}) {
      const operation = pending.then(async () => {
        if (typeof scheduled !== "boolean") throw new Error("BAD_VEHICLE_MODE");
        if (![20, 40, 60].includes(leadUpdates)) throw new Error("BAD_VEHICLE_LEAD");
        if (stopped || !connected || Date.now() - lastSeen > staleMs) throw new Error("BRIDGE_OFFLINE");
        if (haltTest || pauseTest || probe || vehicleTest || companyTestUsed || companyInspection) throw new Error("VEHICLE_TEST_BUSY");
        const remove = name => unlink(path.join(directory, name)).catch(error => { if (error.code !== "ENOENT") throw error; });
        for (const name of ["vehicle_intent.lua", "vehicle_command.lua", "vehicle_receipt.lua"]) await remove(name);
        // One enable per helper lifetime: sequence numbers must never restart within a nonce.
        vehicleTest = createVehicleTest({ nonce, logger, scheduled, leadUpdates, read: name => readBounded(directory, name),
          publish: (name, fields) => publish(directory, name, fields), remove,
          clock: () => ({ ...clock }), connected: () => connected });
        await publish(directory, "bridge.lua", { schemaVersion: 1, nonce, mode: "vehicle_test" });
        logger({ level: "info", event: "vehicle_test_enabled", code: scheduled ? "SCHEDULED_LOCAL_TEST" : "IMMEDIATE_LOCAL_TEST", leadUpdates });
      });
      pending = operation.catch(() => {});
      return operation;
    },
    disableVehicleTest() {
      const operation = pending.then(async () => {
        if (haltTest || stopped || !vehicleTest) throw new Error("VEHICLE_TEST_NOT_ENABLED");
        await publish(directory, "bridge.lua", { schemaVersion: 1, nonce, mode: "telemetry" });
        await vehicleTest.cancel();
        vehicleFaultPublished = true;
      });
      pending = operation.catch(() => {});
      return operation;
    },
    requestEngineProbe({ scheduled = false, leadUpdates = 60 } = {}) {
      // Serialize publication with polling/close; never accept remote Lua or commands.
      const operation = pending.then(async () => {
        if (stopped || !connected || Date.now() - lastSeen > staleMs) throw new Error("BRIDGE_OFFLINE");
        if (haltTest || pauseTest || probe || vehicleTest || companyTestUsed || companyInspection) throw new Error("ENGINE_PROBE_BUSY");
        if (typeof scheduled !== "boolean" || !Number.isSafeInteger(leadUpdates) || leadUpdates < 8 || leadUpdates > 600) throw new Error("BAD_SCHEDULE");
        const scheduledUpdate = scheduled ? clock.updateCount + leadUpdates : undefined;
        if (scheduled && (!Number.isSafeInteger(scheduledUpdate) || scheduledUpdate > 2147483647)) throw new Error("BAD_SCHEDULE");
        const requestId = ++requestSequence;
        await publish(directory, "engine_request.lua", { schemaVersion: 1, kind: scheduled ? "scheduled_probe" : "engine_probe", nonce, requestId,
          ...(scheduled ? { scheduledUpdate } : {}) });
        probe = { requestId, scheduledUpdate, deadline: Date.now() + (scheduled ? scheduledTimeoutMs : probeTimeoutMs) };
        logger({ level: "info", event: scheduled ? "timing_probe_started" : "engine_probe_started", ...(scheduled ? { scheduledUpdate } : {}) });
        return requestId;
      });
      pending = operation.catch(() => {});
      return operation;
    },
    close() {
      if (closing) return closing;
      closing = (async () => {
      stopped = true; clearInterval(timer); await pending;
      try {
      if (haltTest) await haltTest.close().catch(() => {});
      for(const name of ["halt_request.lua","halt_receipt.lua","watchdog_request.lua","watchdog_receipt.lua"]) await unlink(path.join(directory,name)).catch(()=>{});
      if(selectionId)await unlink(path.join(directory,'coordinator_selection.lua')).catch(()=>{});
      if (snapshotProbe) await snapshotProbe.close().catch(() => {});
      if (controlLease) await controlLease.close().catch(() => logger({ level: "warn", event: "control_test_failed", code: "RESTORE_UNKNOWN_CHECK_GAME" }));
      if (pauseTest) await pauseTest.close();
      await unlink(path.join(directory, "company_inspect_request.lua")).catch(() => {});
      await unlink(path.join(directory, "depot_preview.lua")).catch(() => {});
      for(const name of ['phase2_setup.lua','phase2_plan.lua'])await unlink(path.join(directory,name)).catch(()=>{});
      await unlink(path.join(directory, "company_request.lua")).catch(() => {});
      await unlink(path.join(directory, "phase2_funding_request.lua")).catch(() => {});
      await unlink(path.join(directory,'station_template_request.lua')).catch(()=>{});
      if(stationProbe)logger({level:'warn',event:'station_template_result',code:'PROBE_UNAVAILABLE_NO_RETRY',gameplayVerified:false});
      stationProbe=null;
      if(phase2Funding)logger({level:'warn',event:'phase2_funding_result',code:'OUTCOME_UNKNOWN_DO_NOT_RETRY',gameplayVerified:false});
      phase2Funding=null;
      await unlink(path.join(directory, "phase2_depot_request.lua")).catch(() => {});
      if(phase2Depot)logger({level:'warn',event:'phase2_depot_result',outcome:'unknown',code:'OUTCOME_UNKNOWN_DO_NOT_RETRY',gameplayVerified:false});
      phase2Depot=null;
      await unlink(path.join(directory, "phase2_vehicle_request.lua")).catch(() => {});
      if(phase2Vehicle)logger({level:'warn',event:'phase2_vehicle_result',outcome:'unknown',code:'OUTCOME_UNKNOWN_DO_NOT_RETRY',gameplayVerified:false});
      phase2Vehicle=null;
      phase2DepotContext=null;
      for(const [name,active] of [['station',phase2Station],['service',phase2Service]]){
        await unlink(path.join(directory,`phase2_${name}_request.lua`)).catch(()=>{});
        if(active)logger({level:'warn',event:`phase2_${name}_result`,outcome:'unknown',code:'OUTCOME_UNKNOWN_DO_NOT_RETRY',gameplayVerified:false});
      }
      phase2Station=null;phase2Service=null;phase2ConstructionContext=null;
      await unlink(path.join(directory,'phase2_service_observation_request.lua')).catch(()=>{});
      if(serviceObservation||serviceObservationPhase==='observing')logger({level:'warn',event:'phase2_service_observation_result',outcome:'unavailable',code:'OBSERVATION_CLOSED',gameplayVerified:false});
      serviceObservation=null;serviceBinding=null;serviceObservationPhase='closed';
      if (companyProbe) logger({ level: "warn", event: companyProbe.finance ? "finance_test_result" : "company_test_result", code: "OUTCOME_UNKNOWN_DO_NOT_RETRY" });
      if (vehicleTest) await vehicleTest.close();
      for (const name of ["vehicle_intent.lua", "vehicle_command.lua", "vehicle_receipt.lua"]) await unlink(path.join(directory, name)).catch(() => {});
      await unlink(path.join(directory, "bridge.lua")).catch(() => {});
      await unlink(path.join(directory, "ack.lua")).catch(() => {});
      await unlink(path.join(directory, "engine_request.lua")).catch(() => {});
      await unlink(path.join(directory, "engine_receipt.lua")).catch(() => {});
      } finally {
        await lock.close(); await unlink(path.join(directory, "bridge.lock"));
      }
      })();
      return closing;
    },
  };
}
