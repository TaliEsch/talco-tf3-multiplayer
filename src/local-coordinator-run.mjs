import { SessionCoordinator } from './session-coordinator.mjs';
import { createEngineSessionAdapter } from './engine-session-adapter.mjs';
import { randomUUID } from 'node:crypto';
import {parseRoadStopOrderPayload} from './road-stop-order-payload.mjs';
import {parseDepotBuildOrderPayload} from './depot-build-order-payload.mjs';
import {parseVehicleBuyOrderPayload} from './vehicle-buy-order-payload.mjs';
import {parseFundingReceipt} from './phase2-funding.mjs';
import {ownerProofClockCurrent} from './vehicle-owner-proof.mjs';

// Controlled single-game exercise of the real adapter/coordinator. Other roster
// members are explicitly receipt mirrors, NOT independent engines or peers.
// This remains useful as a regression harness after real network integration.
export async function createLocalCoordinatorRun({directory,bridge,playerId,companies,vehicleEntity,
  logger=()=>{},saveReport,now=Date.now,leadUpdates=60,metadata={},
  beforeFirstCommand=null,commandLimit=4,nativeRuntime=null,roadStopPayload=null,
  roadStopOriginPlayerId=playerId,depotBuildPayload=null,depotBuildOriginPlayerId=playerId,
  vehicleBuyModel=null,verifiedFundingEvidence=null}) {
  const depotVehicleRun=vehicleBuyModel!==null;
  if(!(companies instanceof Map)||companies.size!==2||!companies.has(playerId)
    ||!Number.isSafeInteger(vehicleEntity)||vehicleEntity<0||vehicleEntity>2147483647
    ||!Number.isSafeInteger(leadUpdates)||leadUpdates<40||leadUpdates>150
    ||(beforeFirstCommand!==null&&typeof beforeFirstCommand!=='function')
    ||!Number.isSafeInteger(commandLimit)||commandLimit<1||commandLimit>4
    ||typeof saveReport!=='function'||roadStopPayload!==null&&beforeFirstCommand!==null
    ||depotBuildPayload!==null&&(roadStopPayload!==null||beforeFirstCommand!==null
      ||commandLimit!==(depotVehicleRun?2:1)||vehicleEntity!==0||!companies.has(depotBuildOriginPlayerId))
    ||depotVehicleRun&&(depotBuildPayload===null||typeof vehicleBuyModel!=='string')
    ||!depotVehicleRun&&verifiedFundingEvidence!==null
    ||!companies.has(roadStopOriginPlayerId)
    ||roadStopPayload===null&&roadStopOriginPlayerId!==playerId)
    throw new TypeError('INVALID_LOCAL_RUN_OPTIONS');
  const roadCompany=companies.get(roadStopOriginPlayerId);
  const roadIntents=roadStopPayload===null?null:(Array.isArray(roadStopPayload)?roadStopPayload:[roadStopPayload]);
  if(roadIntents!==null&&(roadIntents.length!==commandLimit
    ||roadIntents[0]?.edgeEntity!==vehicleEntity
    ||new Set(roadIntents.map(intent=>intent?.edgeEntity)).size!==roadIntents.length))
    throw new TypeError('INVALID_LOCAL_RUN_OPTIONS');
  const roadStop=roadIntents===null?null:roadIntents.map(intent=>parseRoadStopOrderPayload(
    intent,intent.edgeEntity,roadCompany));
  const depotCompany=companies.get(depotBuildOriginPlayerId);
  const depotBuild=depotBuildPayload===null?null:parseDepotBuildOrderPayload(depotBuildPayload,depotCompany);
  // Reject a malformed second intent before the first construction mutates TF3.
  if(depotVehicleRun)parseVehicleBuyOrderPayload({companyEntity:depotCompany,
    depotEntity:1,model:vehicleBuyModel},depotCompany,1);
  let fundingReceipt=null;
  if(depotVehicleRun){
    const evidence=verifiedFundingEvidence;
    if(!evidence||typeof evidence!=='object'||Array.isArray(evidence)
      ||Object.keys(evidence).sort().join(',')!=='receiptSource,request'
      ||typeof evidence.receiptSource!=='string'
      ||!evidence.request||typeof evidence.request!=='object'||Array.isArray(evidence.request)
      ||Object.keys(evidence.request).sort().join(',')!==
        'amount,companyEntity,confirmed,expiresTick,issuedTick,kind,nonce,requestId,schemaVersion,targetCompany'
      ||evidence.request?.schemaVersion!==1||evidence.request?.kind!=='phase2_funding'
      ||evidence.request?.confirmed!==1||evidence.request?.nonce!==bridge.nonce
      ||!Number.isSafeInteger(evidence.request?.amount)||evidence.request.amount<1
      ||evidence.request.amount>1000000
      ||!Number.isSafeInteger(evidence.request.issuedTick)||evidence.request.issuedTick<0
      ||evidence.request.expiresTick!==evidence.request.issuedTick+300
      ||evidence.request?.targetCompany!==depotCompany)
      throw new TypeError('VERIFIED_FUNDING_EVIDENCE_REQUIRED');
    try{fundingReceipt=parseFundingReceipt(evidence.receiptSource,evidence.request);}
    catch{throw new TypeError('VERIFIED_FUNDING_EVIDENCE_REQUIRED');}
    if(fundingReceipt.outcome!=='funded'||fundingReceipt.balances.targetAfter<=0
      ||!Number.isSafeInteger(bridge.engineObservation?.sample?.updateCount)
      ||fundingReceipt.updateCount>bridge.engineObservation.sample.updateCount)
      throw new TypeError('VERIFIED_FUNDING_EVIDENCE_REQUIRED');
  }
  const messages=[],reports=[];
  const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)?value:null;
  const report={schemaVersion:1,batchId:randomUUID(),scope:depotVehicleRun
    ?'single_game_ordered_depot_then_vehicle_with_receipt_mirror':depotBuild
    ?'single_game_ordered_depot_with_receipt_mirror':roadStop
    ?'single_game_ordered_road_stop_with_receipt_mirror':beforeFirstCommand
      ?'single_game_cancelled_stop_with_receipt_mirror':'single_game_real_adapter_with_receipt_mirror',
    metadata:{gameHash:hash(metadata.gameHash),modManifestHash:hash(metadata.modManifestHash)},
    gameplayVerified:false,multiGameVerified:false,realEngineCount:1,simulatedParticipantCount:1,
    outcome:'in_progress',haltState:'not_requested',haltSource:nativeRuntime?'native_terminal_parked':'game_mailbox',
    checks:[],events:[],roadPreflights:[],independentRoadReadbacks:[],
    ...(depotVehicleRun?{fundingEvidence:{targetCompany:depotCompany,
      amount:fundingReceipt.amount,receiptUpdate:fundingReceipt.updateCount,
      targetAfter:fundingReceipt.balances.targetAfter},independentVehicleReadback:false}:{}),
    startedAt:now(),finishedAt:null};
  let phase='arming',adapter,sequence=0,controlsStarted=false,closed=false,polling=null,persisting=Promise.resolve();
  let firstCommandGate=beforeFirstCommand===null?'passed':'pending';
  let roadPreflight=roadStop?'pending':'not_required';
  let terminalDeadline=0,reportFailed=false,lastRelease=null;
  let verifiedDepotEntity=null,verifiedDepotBalance=null;
  const timings=new Map();
  const coordinator=new SessionCoordinator({now,requireReleaseAck:true,timeoutMs:30000,
    broadcast:(kind,payload)=>messages.push({kind,payload})});
  function event(code,data={}) {
    report.events.push({at:now(),code,...data});
    logger({level:phase==='failed'?'warn':'info',event:'coordinator_local_run',code,...data,gameplayVerified:false});
  }
  function failureContext() {
    const observation=bridge.engineObservation;
    const sample=observation?.sample;
    return {bridgeConnected:bridge.connected===true,
      observationAvailable:observation?.available===true,
      updateCount:sample?.updateCount??null,tickCount:sample?.tickCount??null,
      speedup:sample?.speedup??null,companyEntity:sample?.companyEntity??null,
      firstCommandGate,lastReleaseAgeMs:lastRelease?now()-lastRelease.at:null};
  }
  function persist() {
    const snapshot=structuredClone({...report,phase});
    persisting=persisting.then(()=>saveReport(snapshot)).catch(()=>{
      reportFailed=true;phase='failed';report.outcome='report_write_failed';
      report.failureContext=failureContext();adapter?.halt('REPORT_WRITE_FAILED');
    });return persisting;
  }
  function fail(code) {
    if(phase==='failed'||phase==='passed'||closed)return;
    report.failureContext=failureContext();
    phase='failed';report.outcome=code;report.finishedAt=now();event(code);adapter?.halt(code);persist();
  }
  function recordCancellationEvidence(value) {
    if(!beforeFirstCommand||!value)return;
    const sample=bridge.engineObservation?.sample;
    if(value.event==='local_cancel_stop_owner_inspection_failed')
      event('OWNER_INSPECTION_FAILED',{code:value.code,updateCount:value.updateCount,
        tickCount:value.tickCount,speedup:value.speedup});
    else if(value.event==='local_cancel_stop_owner_prestate')
      event('OWNER_PRESTATE_RECEIPT',{issuedUpdate:value.issuedUpdate,
        receiptUpdate:value.receiptUpdate,paused:value.paused,stopFlag:value.stopFlag});
    else if(['local_cancel_stop_armed','local_cancel_stop_confirmed'].includes(value.event))
      event(value.event==='local_cancel_stop_armed'?'NATIVE_STOP_ARMED':'NATIVE_STOP_CONFIRMED',{
      entity:value.entity,company:value.company,invocation:value.expectedInvocation??value.invocation,
      ttlMs:value.ttlMs??null,updateCount:sample?.updateCount??null,
      tickCount:sample?.tickCount??null,speedup:sample?.speedup??null});
    else return;
    persist();
  }
  adapter=await createEngineSessionAdapter({directory,bridge,playerId,companies,now,
    enableDepotBuild:depotBuild!==null,enableVehicleBuy:depotVehicleRun,
    nativeRuntime,checkpointEvidenceScope:nativeRuntime===null?'local_diagnostic':'production',
    healthy:()=>!closed&&!reportFailed&&phase!=='failed',controlsReady:()=>bridge.coordinationControlsLocked,
    disconnect:()=>{if(phase!=='stopping')fail(adapter?.fault??'ADAPTER_DISCONNECTED');},
    send:(kind,payload)=>reports.push({kind,payload})});
  event(depotVehicleRun?'LOCAL_ONLY_DEPOT_THEN_VEHICLE':depotBuild?'LOCAL_ONLY_ONE_DEPOT_BUILD'
    :roadStop?'LOCAL_ONLY_ONE_ROAD_STOP':'LOCAL_ONLY_NO_BUILDING_OR_NATIVE_ACTIONS');await persist();
  const roster=[...companies].map(([playerId,companyEntity])=>({playerId,companyEntity}));
  async function processReport({kind,payload}) {
    if(kind==='participant_ready') {
      // Do not release startup until actual local controls acknowledge acquisition.
      if(!bridge.coordinationControlsLocked){reports.unshift({kind,payload});return false;}
      for(const member of roster)coordinator.ready(member.playerId,{...payload,companyEntity:member.companyEntity});
      event('OBSERVED_CHECKPOINT_AGREED_LOCAL_MIRROR',{updateCount:payload.updateCount});
    } else if(kind==='participant_heartbeat') {
      for(const member of roster)coordinator.heartbeat(member.playerId,payload);
    } else if(kind==='command_prepared') {
      for(const member of roster)coordinator.prepared(member.playerId,payload,bridge.engineObservation.sample.updateCount);
      const timing=timings.get(payload.hostSequence);
      timing.preparedAfterMs=now()-timing.proposedAt;
      timing.preparedUpdate=payload.updateCount;
    } else if(kind==='command_applied') {
      const timing=timings.get(payload.hostSequence);
      const state=adapter.acceptedExecutionState;
      const intent=roadStop?.[payload.hostSequence-1];
      if(roadStop&&(!intent||!state||state.scope!=='held_road_stop_company_balance_v1'
        ||state.hostSequence!==payload.hostSequence||state.updateCount!==payload.updateCount
        ||state.roadStop?.sourceRoadEntity!==intent.edgeEntity
        ||state.roadStop?.ownerCompanyEntity!==roadCompany
        ||!Number.isSafeInteger(state.roadStop?.stopEntity)||state.roadStop.stopEntity<1
        ||!Number.isSafeInteger(state.roadStop?.roadEntity)||state.roadStop.roadEntity<1
        ||state.roadStop.roadEntity===intent.edgeEntity
        ||!Number.isSafeInteger(state.roadStop?.chargedCost)||state.roadStop.chargedCost<1
        ||!Number.isSafeInteger(state.company?.balance)))
        throw new Error('ACCEPTED_ROAD_POSTCONDITION_MISSING');
      if(depotBuild&&payload.hostSequence===1&&(!state||state.scope!=='held_stock_road_depot_company_balance_v1'
        ||state.hostSequence!==payload.hostSequence||state.updateCount!==payload.updateCount
        ||state.depot?.ownerCompanyEntity!==depotCompany
        ||!Number.isSafeInteger(state.depot?.constructionEntity)||state.depot.constructionEntity<1
        ||!Number.isSafeInteger(state.depot?.depotEntity)||state.depot.depotEntity<1
        ||state.depot.constructionEntity===state.depot.depotEntity
        ||!Number.isSafeInteger(state.depot?.chargedCost)||state.depot.chargedCost<1
        ||!Number.isSafeInteger(state.company?.balance)))
        throw new Error('ACCEPTED_DEPOT_POSTCONDITION_MISSING');
      if(depotVehicleRun&&payload.hostSequence===2&&(!state
        ||state.scope!=='held_road_vehicle_purchase_company_balance_v1'
        ||state.hostSequence!==2||state.updateCount!==payload.updateCount
        ||state.vehicle?.depotEntity!==verifiedDepotEntity
        ||state.vehicle?.ownerCompanyEntity!==depotCompany
        ||!Number.isSafeInteger(state.vehicle?.entity)||state.vehicle.entity<1
        ||state.vehicle.entity===verifiedDepotEntity
        ||state.depot?.entity!==verifiedDepotEntity
        ||state.depot?.ownerCompanyEntity!==depotCompany
        ||state.company?.companyEntity!==depotCompany
        ||!Number.isSafeInteger(state.company?.balanceBefore)||state.company.balanceBefore<=0
        ||!Number.isSafeInteger(state.company?.chargedCost)||state.company.chargedCost<1
        ||state.company.balanceBefore-state.company.balance!==state.company.chargedCost
        ||state.hostCompany?.balanceBefore!==state.hostCompany?.balanceAfter))
        throw new Error('ACCEPTED_VEHICLE_POSTCONDITION_MISSING');
      if(roadStop){
        const readback=await bridge.inspectOrderedRoadReadback({hostSequence:payload.hostSequence,
          company:state.roadStop.ownerCompanyEntity,
          localCompany:companies.get(playerId),
          sourceRoad:state.roadStop.sourceRoadEntity,road:state.roadStop.roadEntity,
          stop:state.roadStop.stopEntity,update:payload.updateCount,
          balance:state.company.balance,charge:state.roadStop.chargedCost});
        report.independentRoadReadback={code:readback.code,
          ...(readback.stage?{stage:readback.stage}:{}),hostSequence:payload.hostSequence,
          updateCount:payload.updateCount};
        report.independentRoadReadbacks.push(report.independentRoadReadback);
        event('INDEPENDENT_ROAD_READBACK',report.independentRoadReadback);
        await persist();
        if(readback.code!=='observed')throw new Error('ORDERED_ROAD_READBACK_UNKNOWN');
      }
      if(depotBuild&&payload.hostSequence===1){
        const readback=await bridge.inspectOrderedDepotReadback({hostSequence:payload.hostSequence,
          company:state.depot.ownerCompanyEntity,localCompany:companies.get(playerId),
          construction:state.depot.constructionEntity,depot:state.depot.depotEntity,
          update:payload.updateCount,balance:state.company.balance,charge:state.depot.chargedCost});
        report.independentDepotReadback={code:readback.code,
          ...(readback.stage?{stage:readback.stage}:{}),hostSequence:payload.hostSequence,
          updateCount:payload.updateCount};
        event('INDEPENDENT_DEPOT_READBACK',report.independentDepotReadback);
        await persist();
        if(readback.code!=='observed')throw new Error('ORDERED_DEPOT_READBACK_UNKNOWN');
        verifiedDepotEntity=state.depot.depotEntity;
        verifiedDepotBalance=state.company.balance;
      }
      for(const member of roster)coordinator.applied(member.playerId,payload);
      report.checks.push({hostSequence:payload.hostSequence,updateCount:payload.updateCount,stateHash:payload.stateHash,
        ...(depotBuild&&payload.hostSequence===1?{depotPostcondition:{constructionEntity:state.depot.constructionEntity,
          depotEntity:state.depot.depotEntity,ownerCompanyEntity:state.depot.ownerCompanyEntity,
          chargedCost:state.depot.chargedCost,companyBalance:state.company.balance}}:{}),
        ...(depotVehicleRun&&payload.hostSequence===2?{vehiclePostcondition:{vehicleEntity:state.vehicle.entity,
          depotEntity:state.vehicle.depotEntity,ownerCompanyEntity:state.vehicle.ownerCompanyEntity,
          chargedCost:state.company.chargedCost,balanceBefore:state.company.balanceBefore,
          companyBalance:state.company.balance,hostCompanyUnchanged:true}}:{}),
        ...(roadStop?{roadPostcondition:{sourceRoadEntity:state.roadStop.sourceRoadEntity,
          roadEntity:state.roadStop.roadEntity,stopEntity:state.roadStop.stopEntity,
          ownerCompanyEntity:state.roadStop.ownerCompanyEntity,
          chargedCost:state.roadStop.chargedCost,companyBalance:state.company.balance}}:{}),
        ...timing,appliedAfterMs:now()-timing.proposedAt,updateError:payload.updateCount-timing.scheduledUpdate});
      event('ACTUAL_HELD_ACTION_RECEIPT',{hostSequence:payload.hostSequence,updateCount:payload.updateCount});
    } else if(kind==='participant_released') {
      for(const member of roster)coordinator.released(member.playerId,payload);
      lastRelease={at:now(),updateCount:payload.updateCount,speedup:payload.speedup};
      const check=report.checks.find(c=>c.hostSequence===payload.hostSequence);
      if(check){check.releasedAfterMs=now()-check.proposedAt;check.releaseUpdate=payload.updateCount;check.observedReleaseSpeed=payload.speedup;}
      event('ACTUAL_RELEASE_RECEIPT',{hostSequence:payload.hostSequence,updateCount:payload.updateCount,speedup:payload.speedup});
      if(roadStop&&payload.hostSequence<roadStop.length)roadPreflight='pending';
    } else throw new Error('UNEXPECTED_LOCAL_REPORT');
    return true;
  }
  async function tick() {
    if(closed||phase==='passed')return;
    await adapter.poll();
    if(adapter.faultEvidence && !report.engineFailure){
      report.engineFailure=adapter.faultEvidence;
      event('ENGINE_FAILURE_DETAILS',report.engineFailure);await persist();
    }
    // Continue consuming the stop receipt after failure. A failed action never
    // becomes successful, but callers still need to know whether the game held.
    if(report.haltState!==adapter.haltState){report.haltState=adapter.haltState;await persist();}
    if(phase==='failed')return;
    if(phase==='stopping') {
      if(nativeRuntime&&adapter.phase==='halted') {fail(adapter.fault??'ADAPTER_HALTED_DURING_STOP');return;}
      if(adapter.haltState==='confirmed') {
        phase='passed';report.outcome='local_cycle_and_explicit_halt_passed';report.finishedAt=now();
        await persist();
        if(!reportFailed)event('LOCAL_RUN_PASSED_GAME_HELD',{haltSource:adapter.haltSource});
      } else if(adapter.haltState==='unknown'||now()>=terminalDeadline)fail('STOP_NOT_VERIFIED');
      return;
    }
    if(adapter.phase==='halted'){fail(adapter.fault??'ADAPTER_HALTED');return;}
    if(phase==='arming') {
      if(bridge.coordinationLeaseState!=='active')return;
      const s=bridge.engineObservation.sample;
      coordinator.setResumeSpeed(1);
      coordinator.capture(roster,{updateCount:s.updateCount+leadUpdates});phase='capturing';event('CAPTURE_STARTED');
    }
    coordinator.poll(bridge.engineObservation.sample.updateCount);
    if(adapter.phase==='preparing'&&!controlsStarted) {
      if(bridge.engineObservation.sample.speedup===0){
        await bridge.acquireCoordinationControls();controlsStarted=true;event('WAITING_FOR_EXISTING_CONTROL_LOCK');
      }
    }
    // Bounded queue draining prevents callbacks from recursively applying work.
    for(let i=0;i<32&&reports.length;i++)if(!await processReport(reports.shift()))break;
    for(let i=0;i<32&&messages.length;i++) {
      const message=messages.shift();
      if(!adapter.receive(message.kind,message.payload)){fail(adapter.fault??'MESSAGE_REJECTED');return;}
    }
    if(coordinator.phase==='running'&&adapter.phase==='running') {
      if(firstCommandGate==='pending'&&lastRelease&&now()-lastRelease.at>=2000){
        firstCommandGate='waiting';
        Promise.resolve().then(()=>beforeFirstCommand({entity:vehicleEntity,company:companies.get(playerId),
          recordCancellationEvidence}))
          .then(()=>{if(!closed&&phase!=='failed'){firstCommandGate='passed';event('NATIVE_CANCELLATION_CONFIRMED');}})
          .catch(error=>fail(error?.message??'NATIVE_CANCELLATION_UNKNOWN'));
        event('AWAITING_NATIVE_CANCELLATION');
      }
      if(firstCommandGate!=='passed')return;
      if(sequence===commandLimit){phase='stopping';terminalDeadline=now()+20000;adapter.halt('LOCAL_RUN_COMPLETE');event('VERIFYING_EXPLICIT_ENGINE_STOP');}
      else {
        // Observe the actual update rate after a speed change; simulation speed
        // is not assumed to multiply callback frequency. Allow telemetry lag.
        if(!lastRelease||now()-lastRelease.at<2000)return;
        const update=bridge.engineObservation.sample.updateCount;
        const speed=bridge.engineObservation.sample.speedup;
        if(speed!==lastRelease.speedup){if(now()-lastRelease.at>=5000)fail('RUNNING_SPEED_NOT_OBSERVED');return;}
        if(depotVehicleRun&&sequence===1){
          if(verifiedDepotEntity===null||verifiedDepotBalance===null){fail('VERIFIED_DEPOT_REQUIRED');return;}
          if(verifiedDepotBalance<=0){fail('VEHICLE_FUNDING_PRECONDITION_FAILED');return;}
        }
        if(roadStop&&roadPreflight==='pending'){
          const intent=roadStop[sequence];
          roadPreflight='checking';
          Promise.resolve().then(()=>bridge.inspectRoadPreflight({entity:intent.edgeEntity,
            company:roadCompany})).then(receipt=>{
            if(closed||phase==='failed')return;
            if(receipt?.outcome!=='found'||receipt.entity!==intent.edgeEntity
              ||receipt.company!==roadCompany
              ||receipt.ownerCompany!==0&&receipt.ownerCompany!==receipt.company)
              throw new Error('ROAD_PREFLIGHT_NOT_CONFIRMED');
            roadPreflight=receipt;
            report.roadPreflight={entity:receipt.entity,company:receipt.company,
              ownerCompany:receipt.ownerCompany,revision:receipt.revision,hostSequence:sequence+1,
              issuedUpdate:receipt.issuedUpdate,receiptUpdate:receipt.updateCount,
              paused:receipt.paused};
            report.roadPreflights.push(report.roadPreflight);
            event('LOCAL_ROAD_PREFLIGHT_VERIFIED',report.roadPreflight);persist();
          }).catch(error=>fail(error?.message==='ROAD_PREFLIGHT_NOT_CONFIRMED'
            ?'ROAD_PREFLIGHT_NOT_CONFIRMED':'ROAD_PREFLIGHT_UNAVAILABLE'));
          return;
        }
        if(roadStop){
          if(roadPreflight==='checking')return;
          if(!ownerProofClockCurrent({issuedUpdate:roadPreflight.issuedUpdate,
            receiptUpdate:roadPreflight.updateCount,hostUpdate:update,
            paused:roadPreflight.paused})){fail('ROAD_PREFLIGHT_STALE');return;}
        }
        const measuredUpdatesPerSecond=(update-lastRelease.updateCount)*1000/(now()-lastRelease.at);
        const lead=Math.min(600,Math.max(leadUpdates,Math.ceil(measuredUpdatesPerSecond*10)));
        sequence++;
        const resumeSpeed=roadStop||depotBuild?1:[2,4,1,1][sequence-1];
        const buying=depotVehicleRun&&sequence===2;
        const buyPayload=buying?parseVehicleBuyOrderPayload({companyEntity:depotCompany,
          depotEntity:verifiedDepotEntity,model:vehicleBuyModel},depotCompany,verifiedDepotEntity):null;
        coordinator.setResumeSpeed(resumeSpeed);
        timings.set(sequence,{proposedAt:now(),proposedUpdate:update,scheduledUpdate:update+lead,sourceSpeed:speed,measuredUpdatesPerSecond,requestedReleaseSpeed:resumeSpeed});
        coordinator.propose({protocolVersion:2,hostSequence:sequence,scheduledUpdate:update+lead,
          originPlayerId:depotBuild?depotBuildOriginPlayerId:roadStop?roadStopOriginPlayerId:playerId,
          targetCompanyEntity:depotBuild?depotCompany:roadStop?roadCompany:companies.get(playerId),
          targetEntity:buying?verifiedDepotEntity:depotBuild?0:roadStop?roadStop[sequence-1].edgeEntity:vehicleEntity,
          commandType:buying?'road.vehicle.buy':depotBuild?'road.depot.build':roadStop?'road.stop.place':'vehicle.setRunning',
          payload:buyPayload??depotBuild??(roadStop?roadStop[sequence-1]:{running:sequence%2===0}),clientSequence:sequence,
          requestMessageId:'local-run:'+sequence},update);
        phase='cycling';event(buying?'VEHICLE_BUY_SCHEDULED':depotBuild?'DEPOT_BUILD_SCHEDULED'
          :roadStop?'ROAD_STOP_SCHEDULED':'VEHICLE_ACTION_SCHEDULED',
          {hostSequence:sequence,scheduledUpdate:update+lead,resumeSpeed});
      }
    }
    await persist();
  }
  return {
    get phase(){return phase;},get report(){return structuredClone({...report,phase});},
    poll(){if(polling)return polling;polling=tick().catch(error=>{
      const code=error?.code??error?.message;
      fail(typeof code==='string'&&/^[A-Z][A-Z0-9_]{2,79}$/.test(code)?code:'LOCAL_RUN_FAILED_NO_RETRY');
    }).finally(()=>{polling=null;});return polling;},
    async close(){if(closed)return;if(phase!=='passed'&&phase!=='failed')fail('LOCAL_RUN_STOPPED');closed=true;await polling;await persisting;await adapter.close();},
  };
}
