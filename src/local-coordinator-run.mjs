import { SessionCoordinator } from './session-coordinator.mjs';
import { createEngineSessionAdapter } from './engine-session-adapter.mjs';
import { randomUUID } from 'node:crypto';

// Controlled single-game exercise of the real adapter/coordinator. Other roster
// members are explicitly receipt mirrors, NOT independent engines or peers.
// This remains useful as a regression harness after real network integration.
export async function createLocalCoordinatorRun({directory,bridge,playerId,companies,vehicleEntity,
  logger=()=>{},saveReport,now=Date.now,leadUpdates=60,metadata={}}) {
  if(!(companies instanceof Map)||companies.size!==2||!companies.has(playerId)
    ||!Number.isSafeInteger(vehicleEntity)||vehicleEntity<0||vehicleEntity>2147483647
    ||!Number.isSafeInteger(leadUpdates)||leadUpdates<40||leadUpdates>150
    ||typeof saveReport!=='function') throw new TypeError('INVALID_LOCAL_RUN_OPTIONS');
  const messages=[],reports=[];
  const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)?value:null;
  const report={schemaVersion:1,batchId:randomUUID(),scope:'single_game_real_adapter_with_receipt_mirror',
    metadata:{gameHash:hash(metadata.gameHash),modManifestHash:hash(metadata.modManifestHash)},
    gameplayVerified:false,multiGameVerified:false,realEngineCount:1,simulatedParticipantCount:1,
    outcome:'in_progress',haltState:'not_requested',checks:[],events:[],startedAt:now(),finishedAt:null};
  let phase='arming',adapter,sequence=0,controlsStarted=false,closed=false,polling=null,persisting=Promise.resolve();
  let terminalDeadline=0,reportFailed=false,lastRelease=null;
  const timings=new Map();
  const coordinator=new SessionCoordinator({now,requireReleaseAck:true,timeoutMs:30000,
    broadcast:(kind,payload)=>messages.push({kind,payload})});
  function event(code,data={}) {
    report.events.push({at:now(),code,...data});
    logger({level:phase==='failed'?'warn':'info',event:'coordinator_local_run',code,...data,gameplayVerified:false});
  }
  function persist() {
    const snapshot=structuredClone({...report,phase});
    persisting=persisting.then(()=>saveReport(snapshot)).catch(()=>{
      reportFailed=true;phase='failed';report.outcome='report_write_failed';adapter?.halt('REPORT_WRITE_FAILED');
    });return persisting;
  }
  function fail(code) {
    if(phase==='failed'||phase==='passed'||closed)return;
    phase='failed';report.outcome=code;report.finishedAt=now();event(code);adapter?.halt(code);persist();
  }
  adapter=await createEngineSessionAdapter({directory,bridge,playerId,companies,now,
    checkpointEvidenceScope:'local_diagnostic',
    healthy:()=>!closed&&!reportFailed&&phase!=='failed',controlsReady:()=>bridge.coordinationControlsLocked,
    disconnect:()=>{if(phase!=='stopping')fail(adapter?.fault??'ADAPTER_DISCONNECTED');},
    send:(kind,payload)=>reports.push({kind,payload})});
  event('LOCAL_ONLY_NO_BUILDING_OR_NATIVE_ACTIONS');await persist();
  const roster=[...companies].map(([playerId,companyEntity])=>({playerId,companyEntity}));
  function processReport({kind,payload}) {
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
      for(const member of roster)coordinator.applied(member.playerId,payload);
      const timing=timings.get(payload.hostSequence);
      report.checks.push({hostSequence:payload.hostSequence,updateCount:payload.updateCount,stateHash:payload.stateHash,
        ...timing,appliedAfterMs:now()-timing.proposedAt,updateError:payload.updateCount-timing.scheduledUpdate});
      event('ACTUAL_HELD_ACTION_RECEIPT',{hostSequence:payload.hostSequence,updateCount:payload.updateCount});
    } else if(kind==='participant_released') {
      for(const member of roster)coordinator.released(member.playerId,payload);
      lastRelease={at:now(),updateCount:payload.updateCount,speedup:payload.speedup};
      const check=report.checks.find(c=>c.hostSequence===payload.hostSequence);
      if(check){check.releasedAfterMs=now()-check.proposedAt;check.releaseUpdate=payload.updateCount;check.observedReleaseSpeed=payload.speedup;}
      event('ACTUAL_RELEASE_RECEIPT',{hostSequence:payload.hostSequence,updateCount:payload.updateCount,speedup:payload.speedup});
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
      if(adapter.haltState==='confirmed') {
        phase='passed';report.outcome='local_cycle_and_explicit_halt_passed';report.finishedAt=now();
        await persist();
        if(!reportFailed)event('LOCAL_RUN_PASSED_GAME_HELD');
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
    for(let i=0;i<32&&reports.length;i++)if(!processReport(reports.shift()))break;
    for(let i=0;i<32&&messages.length;i++) {
      const message=messages.shift();
      if(!adapter.receive(message.kind,message.payload)){fail(adapter.fault??'MESSAGE_REJECTED');return;}
    }
    if(coordinator.phase==='running'&&adapter.phase==='running') {
      if(sequence===4){phase='stopping';terminalDeadline=now()+20000;adapter.halt('LOCAL_RUN_COMPLETE');event('VERIFYING_EXPLICIT_ENGINE_STOP');}
      else {
        // Observe the actual update rate after a speed change; simulation speed
        // is not assumed to multiply callback frequency. Allow telemetry lag.
        if(!lastRelease||now()-lastRelease.at<2000)return;
        const update=bridge.engineObservation.sample.updateCount;
        const speed=bridge.engineObservation.sample.speedup;
        if(speed!==lastRelease.speedup){if(now()-lastRelease.at>=5000)fail('RUNNING_SPEED_NOT_OBSERVED');return;}
        const measuredUpdatesPerSecond=(update-lastRelease.updateCount)*1000/(now()-lastRelease.at);
        const lead=Math.min(600,Math.max(leadUpdates,Math.ceil(measuredUpdatesPerSecond*10)));
        sequence++;
        const resumeSpeed=[2,4,1,1][sequence-1];
        coordinator.setResumeSpeed(resumeSpeed);
        timings.set(sequence,{proposedAt:now(),proposedUpdate:update,scheduledUpdate:update+lead,sourceSpeed:speed,measuredUpdatesPerSecond,requestedReleaseSpeed:resumeSpeed});
        coordinator.propose({protocolVersion:2,hostSequence:sequence,scheduledUpdate:update+lead,
          originPlayerId:playerId,targetCompanyEntity:companies.get(playerId),targetEntity:vehicleEntity,
          commandType:'vehicle.setRunning',payload:{running:sequence%2===0},clientSequence:sequence,requestMessageId:'local-run:'+sequence},update);
        phase='cycling';event('VEHICLE_ACTION_SCHEDULED',{hostSequence:sequence,scheduledUpdate:update+lead,resumeSpeed});
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
