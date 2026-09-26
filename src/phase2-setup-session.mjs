import {createPhase2LocalRun} from './phase2-local-run.mjs';
import {correlateRawServiceInterval} from './service-observation.mjs';

// Local disposable-save setup only. The submitted plan is not permission to
// mutate: a separate launcher confirmation must match its canonical hash.
export function createPhase2SetupSession({bridge,saveReport,logger=()=>{},checkpointHash,metadata={},now=Date.now}) {
  if(!bridge||typeof saveReport!=='function'||typeof logger!=='function'||typeof now!=='function'
    ||!/^([a-f0-9]{64})$/.test(checkpointHash))throw new TypeError('INVALID_PHASE2_SETUP_OPTIONS');
  let phase='idle',plan=null,run=null,closed=false,busy=false,deadline=0,invalidReads=0;
  let serviceEvidence=[],servicePersistence=Promise.resolve();
  const emit=(code,extra={})=>logger({level:phase==='failed'?'warn':'info',event:'phase2_setup',code,...extra,gameplayVerified:false});
  async function fail() {
    if(phase==='failed'||closed)return;
    phase='failed';plan=null;
    await run?.close();
    await bridge.setPhase2SetupStatus('failed').catch(()=>{});
    emit('FAILED_STOP_HELPER');
  }
  return {
    async start() {
      if(phase!=='idle'||closed)throw new Error('PHASE2_SETUP_ALREADY_USED');
      phase='inspecting';deadline=now()+600000;
      try {await bridge.beginPhase2Setup();} catch(error){await fail();throw error;}
    },
    async poll() {
      if(closed||busy||['idle','complete','failed'].includes(phase))return;
      busy=true;
      try {
        if(phase!=='running'&&now()>=deadline){await fail();return;}
        const setup=bridge.phase2SetupState;
        const observation=bridge.engineObservation;
        if(!setup||setup.status==='failed'||!observation.available||observation.sample?.speedup!==0
          ||observation.sample.companyEntity!==setup.originalCompany||observation.sample.updateCount!==setup.updateCount){await fail();return;}
        if(phase==='inspecting'&&setup.status==='selecting'){
          phase='selecting';emit('SELECT_LOCATIONS');
        }
        if(phase==='selecting'){
          // A partially written UI proposal is not execution or consent. Wait
          // for a complete bounded plan until the selection deadline expires.
          let candidate;
          try{candidate=await bridge.readPhase2SetupPlan(checkpointHash);invalidReads=0;}
          catch(error){
            if(error.code!=='ENOENT'&&++invalidReads>=4)await fail();
            return;
          }
          if(closed)return;
          plan=candidate;
          await bridge.setPhase2SetupStatus('ready');
          if(closed)return;
          phase='ready';emit('PLAN_READY',{planHash:plan.planHash,originalCompany:plan.plan.originalCompany,
            targetCompany:plan.plan.targetCompany,fundingAmount:plan.plan.fundingAmount});
        }
        if(phase==='running'&&run.status.phase==='failed'){await fail();return;}
        if(phase==='running'&&run.status.phase==='terminal'){
          await bridge.setPhase2SetupStatus('complete');
          if(closed)return;
          phase='complete';emit('SETUP_VERIFIED_SERVICE_NOT_OBSERVED');
        }
      }catch{await fail();}finally{busy=false;}
    },
    async confirm(planHash) {
      if(closed||phase!=='ready'||busy||!plan||planHash!==plan.planHash)
        throw new Error('MATCHING_PHASE2_PLAN_CONFIRMATION_REQUIRED');
      // Consume the confirmation before awaiting any publication or report.
      phase='running';const selected=plan;plan=null;
      try {
        const current=await bridge.readPhase2SetupPlan(checkpointHash);
        if(current.planHash!==selected.planHash)throw new Error('CONFIRMED_PLAN_CHANGED');
        if(closed)return;
        await bridge.setPhase2SetupStatus('running');
        if(closed)return;
        run=createPhase2LocalRun({bridge,saveReport,logger,metadata,now});
        await run.start({plan:selected.plan,confirmedHash:selected.planHash});
        if(!closed)emit('RUNNING');
      }catch(error){await fail();throw error;}
    },
    onEvent(record){
      if(record?.event!=='phase2_service_observation_result')return run?.onEvent(record);
      // Extend the same acceptance artifact; a setup report alone does not
      // establish operation. Keep raw evidence separate from its setup outcome.
      if(closed||phase!=='complete'||!run)return;
      const row={};
      const fields=['action','outcome','code','requestId','originalCompany','targetCompany','vehicleEntity','lineEntity',
        'tickCount','updateCount','gameTime','startGameTime','startUpdateCount','endGameTime','endUpdateCount',
        'accountNetWindowStart','accountNetWindowEnd','accountNet','intervalNet','intervalMaintenanceVehicle',
        'intervalMaintenanceInfrastructure','intervalMaintenanceOther','intervalMaintenanceVehicleMaintenance',
        'startVisitedMask','endVisitedMask','startStopIndex','endStopIndex'];
      for(const field of fields){
        const value=record[field];
        if(['action','outcome','code'].includes(field)){
          if(typeof value==='string'&&/^[A-Za-z_]{1,64}$/.test(value))row[field]=value;
        }else if(Number.isSafeInteger(value))row[field]=value;
      }
      servicePersistence=servicePersistence.then(async()=>{
        if(phase!=='complete')return;
        if(serviceEvidence.length>=2)throw new Error('SERVICE_EVIDENCE_LIMIT');
        serviceEvidence.push(row);
        const paired=serviceEvidence.length===2
          ?correlateRawServiceInterval(serviceEvidence[0],serviceEvidence[1]):null;
        await saveReport({...run.status,serviceObservation:{scope:'raw_endpoint_account_reads',
          pairedRawIntervalCorrelated:paired!==null,routeStateChanged:paired?.routeStateChanged??false,
          serviceAccountingVerified:false,continuousOwnershipVerified:false,completedTripVerified:false,
          receipts:structuredClone(serviceEvidence)}});
      }).catch(async()=>{await fail();emit('SERVICE_REPORT_WRITE_FAILED_STOP_HELPER');});
      return servicePersistence;
    },
    async close(){if(closed)return;closed=true;plan=null;await run?.close();await servicePersistence;phase='closed';},
    get status(){return {phase,run:run?.status??null};},
  };
}
