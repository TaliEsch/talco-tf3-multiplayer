import {randomUUID} from 'node:crypto';
import {sha256Canonical} from './canonical.mjs';

const entity=value=>Number.isSafeInteger(value)&&value>0&&value<=2147483647;
const finite=(value,max)=>Number.isFinite(value)&&Math.abs(value)<=max;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const plainPath=value=>typeof value==='string'&&/^[A-Za-z0-9_.:/-]{1,256}$/.test(value);
const depotPath=value=>plainPath(value)&&value.endsWith('/road/road_depot/road_depot.con');
const stationPath=value=>plainPath(value)&&value.endsWith('/street/modular_street_station/modular_terminal.con');
const modelPath=value=>plainPath(value)&&value.endsWith('.mdl');
const placement=(value,path)=>value&&Object.keys(value).sort().join(',')==='resource,seed,x,y,yaw,z'
  &&path(value.resource)&&entity(value.seed)&&finite(value.x,100000)&&finite(value.y,100000)
  &&finite(value.z,10000)&&finite(value.yaw,Math.PI);
const eventFields=['event','code','outcome','companyEntity','targetCompany','slot','depotEntity','vehicleEntity','stationEntity',
  'constructionEntity','lineEntity','stationA','stationB','amount','requestId','updateCount','tickCount','chargedCost'];
const receiptCodes=new Set(['funded','OUTCOME_UNKNOWN_DO_NOT_RETRY','NATIVE_BUILD_ACCOUNTING_VERIFIED',
  'NATIVE_VEHICLE_ACCOUNTING_VERIFIED','NATIVE_STATION_ACCOUNTING_VERIFIED','NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED']);

function canonicalPlan(plan){
  if(!plan||Object.keys(plan).sort().join(',')!=='checkpointHash,depot,fundingAmount,model,originalCompany,stationA,stationB,targetCompany'
    ||!entity(plan.originalCompany)||!entity(plan.targetCompany)||plan.originalCompany===plan.targetCompany
    ||!Number.isSafeInteger(plan.fundingAmount)||plan.fundingAmount<1||plan.fundingAmount>1000000
    ||!placement(plan.depot,depotPath)||!modelPath(plan.model)||!placement(plan.stationA,stationPath)
    ||!placement(plan.stationB,stationPath)||!hash(plan.checkpointHash))throw new Error('INVALID_PHASE2_LOCAL_PLAN');
  return {originalCompany:plan.originalCompany,targetCompany:plan.targetCompany,fundingAmount:plan.fundingAmount,
    depot:{resource:plan.depot.resource,x:plan.depot.x,y:plan.depot.y,z:plan.depot.z,yaw:plan.depot.yaw,seed:plan.depot.seed},
    model:plan.model,
    stationA:{resource:plan.stationA.resource,x:plan.stationA.x,y:plan.stationA.y,z:plan.stationA.z,yaw:plan.stationA.yaw,seed:plan.stationA.seed},
    stationB:{resource:plan.stationB.resource,x:plan.stationB.x,y:plan.stationB.y,z:plan.stationB.z,yaw:plan.stationB.yaw,seed:plan.stationB.seed},
    checkpointHash:plan.checkpointHash};
}
export function phase2LocalPlanHash(plan){return sha256Canonical(canonicalPlan(plan));}

export function createPhase2LocalRun({bridge,logger=()=>{},saveReport,metadata={},now=Date.now}={}){
  if(!bridge||typeof logger!=='function'||typeof saveReport!=='function'||typeof now!=='function')throw new TypeError('INVALID_PHASE2_LOCAL_RUN_OPTIONS');
  let phase='idle',closed=false,reportBroken=false,persisting=Promise.resolve(),transitions=Promise.resolve(),plan=null,binding=null,lastRequestId=0;
  const ids={};
  const report={schemaVersion:1,batchId:randomUUID(),scope:'phase2_local_setup_real_bridge',gameplayVerified:false,multiGameVerified:false,
    outcome:'not_started',phase,startedAt:null,finishedAt:null,checkpointVerified:false,
    metadata:{gameHash:hash(metadata.gameHash)?metadata.gameHash:null,modManifestHash:hash(metadata.modManifestHash)?metadata.modManifestHash:null},receipts:[]};
  const active=()=>!['idle','failed','closed','terminal'].includes(phase);
  function emit(code){logger({level:phase==='failed'?'warn':'info',event:'phase2_local_run',code,gameplayVerified:false});}
  function snapshot(){return structuredClone({...report,phase,assets:{...ids}});}
  async function persist(){
    const copy=snapshot();
    persisting=persisting.then(async()=>{
      if(reportBroken)return;
      try{await saveReport(copy);}catch{reportBroken=true;fail('REPORT_WRITE_FAILED_STOP_RUN');}
    });
    await persisting;
  }
  function fail(code){
    if(['failed','closed','terminal'].includes(phase))return;
    phase='failed';report.outcome=code;report.finishedAt=now();emit(code);void persist();
  }
  function sample(){return bridge.engineObservation?.sample??bridge.engineObservation?.status?.sample;}
  function available(){return bridge.engineObservation?.status?.available===true||bridge.engineObservation?.available===true;}
  function held(){
    const current=sample();
    return available()&&current&&current.speedup===0&&current.companyEntity===binding?.originalCompany
      &&current.updateCount===binding?.updateCount&&Number.isSafeInteger(current.tickCount)&&current.tickCount>=0;
  }
  function boundedRecord(record){
    const bounded={};
    for(const name of eventFields){
      const value=record?.[name];
      if(name==='code'&&typeof value==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(value))bounded[name]=value;
      else if(['event','outcome'].includes(name)&&typeof value==='string'&&/^[a-z0-9_]{1,64}$/.test(value))bounded[name]=value;
      else if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER)bounded[name]=value;
    }
    return bounded;
  }
  function safeReceipt(record){
    const row={at:now()};
    for(const name of eventFields)if(name!=='code'&&['string','number'].includes(typeof record[name]))row[name]=record[name];
    if(receiptCodes.has(record.code))row.code=record.code;
    if(!entity(row.requestId))delete row.requestId;
    if(!Number.isSafeInteger(row.amount)||row.amount<0||row.amount>1000000)delete row.amount;
    return row;
  }
  async function dispatch(next,method,args){
    // A durable snapshot must exist before every irreversible bridge request.
    if(!active()||!held()) {fail('HELD_BRIDGE_CONTEXT_CHANGED');return;}
    phase=`persisting_${next}`;await persist();
    if(closed||reportBroken||!active()||phase!==`persisting_${next}`||!held()) {if(active())fail('HELD_BRIDGE_CONTEXT_CHANGED');return;}
    // Set the externally visible stage immediately before invocation. A bridge
    // logger may synchronously report its result from a controlled test mock.
    phase=next;
    let operation;
    try{if(typeof bridge[method]!=='function')throw new Error('MISSING_BRIDGE_METHOD');operation=bridge[method](args);}
    catch{fail('BRIDGE_REQUEST_FAILED_NO_RETRY');return;}
    Promise.resolve(operation).catch(()=>fail('BRIDGE_REQUEST_FAILED_NO_RETRY'));
  }
  function expected(record){
    return record.companyEntity===binding.originalCompany&&record.targetCompany===plan.targetCompany
      &&record.updateCount===binding.updateCount;
  }
  function verified(record){return record.outcome==='verified'&&expected(record);}
  return {
    async start({plan:input,confirmedHash}={}){
      if(phase!=='idle'||closed)throw new Error('PHASE2_LOCAL_RUN_ALREADY_USED');
      plan=canonicalPlan(input);
      if(!hash(confirmedHash)||confirmedHash!==phase2LocalPlanHash(plan))throw new Error('EXPLICIT_PHASE2_PLAN_CONFIRMATION_REQUIRED');
      const current=sample();
      if(!available()||!current||!entity(current.companyEntity)||current.companyEntity!==plan.originalCompany||current.speedup!==0
        ||!Number.isSafeInteger(current.tickCount)||current.tickCount<0||!Number.isSafeInteger(current.updateCount)||current.updateCount<0)
        throw new Error('PAUSED_FRESH_BRIDGE_OBSERVATION_REQUIRED');
      binding=Object.freeze({originalCompany:current.companyEntity,updateCount:current.updateCount});
      report.startedAt=now();report.outcome='in_progress';report.planHash=confirmedHash;report.checkpointHash=plan.checkpointHash;
      phase='persisting_funding';await persist();
      if(reportBroken||phase==='failed')throw new Error('REPORT_WRITE_FAILED_STOP_RUN');
      await dispatch('funding','requestPhase2Funding',{targetCompany:plan.targetCompany,amount:plan.fundingAmount,confirmed:true});
    },
    onEvent(record){
      record=boundedRecord(record);
      transitions=transitions.then(async()=>{
      if(!active()||closed||typeof record.event!=='string')return;
      if(['bridge_disconnected','engine_observation_unavailable','engine_observation_invalidated'].includes(record.event)){fail(record.event);return;}
      if(!/^phase2_(funding|depot|vehicle|station|service)_result$/.test(record.event))return;
      report.receipts.push(safeReceipt(record));if(report.receipts.length>16){fail('RECEIPT_LIMIT');return;}await persist();
      if(closed||reportBroken||!active())return;
      const stage=record.event==='phase2_station_result'?(record.slot===2?'station2':'station1')
        :{phase2_funding_result:'funding',phase2_depot_result:'depot',phase2_vehicle_result:'vehicle',phase2_service_result:'service'}[record.event];
      if(stage!==phase){fail('UNEXPECTED_OR_DUPLICATE_RECEIPT');return;}
      if(!entity(record.requestId)||record.requestId<=lastRequestId){fail('REQUEST_SEQUENCE_INVALID');return;}
      lastRequestId=record.requestId;
      if(record.outcome==='unknown'||record.outcome==='rejected'||record.code==='OUTCOME_UNKNOWN_DO_NOT_RETRY'){fail('OUTCOME_UNKNOWN_DO_NOT_RETRY');return;}
      if(stage==='funding'){
        if(record.code!=='funded'||record.amount!==plan.fundingAmount||!expected(record)){fail('FUNDING_NOT_VERIFIED');return;}
        await dispatch('depot','requestPhase2Depot',{targetCompany:plan.targetCompany,placement:plan.depot,confirmed:true});
      } else if(stage==='depot') {
        if(!verified(record)||record.code!=='NATIVE_BUILD_ACCOUNTING_VERIFIED'||!entity(record.depotEntity)){fail('DEPOT_NOT_VERIFIED');return;}
        ids.depotEntity=record.depotEntity;
        await dispatch('vehicle','requestPhase2Vehicle',{targetCompany:plan.targetCompany,depotEntity:ids.depotEntity,model:plan.model,confirmed:true});
      } else if(stage==='vehicle') {
        if(!verified(record)||record.code!=='NATIVE_VEHICLE_ACCOUNTING_VERIFIED'||!entity(record.vehicleEntity)||record.vehicleEntity===ids.depotEntity){fail('VEHICLE_NOT_VERIFIED');return;}
        ids.vehicleEntity=record.vehicleEntity;
        await dispatch('station1','requestPhase2Station',{targetCompany:plan.targetCompany,slot:1,placement:plan.stationA,confirmed:true});
      } else if(stage==='station1') {
        if(!verified(record)||record.code!=='NATIVE_STATION_ACCOUNTING_VERIFIED'||record.slot!==1||!entity(record.stationEntity)||Object.values(ids).includes(record.stationEntity)){fail('STATION_A_NOT_VERIFIED');return;}
        ids.stationA=record.stationEntity;
        await dispatch('station2','requestPhase2Station',{targetCompany:plan.targetCompany,slot:2,placement:plan.stationB,confirmed:true});
      } else if(stage==='station2') {
        if(!verified(record)||record.code!=='NATIVE_STATION_ACCOUNTING_VERIFIED'||record.slot!==2||!entity(record.stationEntity)||Object.values(ids).includes(record.stationEntity)){fail('STATION_B_NOT_VERIFIED');return;}
        ids.stationB=record.stationEntity;
        await dispatch('service','requestPhase2Service',{targetCompany:plan.targetCompany,depotEntity:ids.depotEntity,vehicleEntity:ids.vehicleEntity,stationA:ids.stationA,stationB:ids.stationB,confirmed:true});
      } else if(!held()||!verified(record)||record.code!=='NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED'||!entity(record.lineEntity)
        ||new Set([binding.originalCompany,plan.targetCompany,ids.depotEntity,ids.vehicleEntity,ids.stationA,ids.stationB,record.lineEntity]).size!==7
        ||record.depotEntity!==ids.depotEntity||record.vehicleEntity!==ids.vehicleEntity||record.stationA!==ids.stationA||record.stationB!==ids.stationB)fail('SERVICE_NOT_VERIFIED');
      else {
        ids.lineEntity=record.lineEntity;phase='completing';report.outcome='SETUP_VERIFIED_SERVICE_NOT_OBSERVED';report.finishedAt=now();
        await persist();
        if(closed||reportBroken||phase!=='completing'||!held()) {if(active())fail('HELD_BRIDGE_CONTEXT_CHANGED');return;}
        phase='terminal';emit('SETUP_VERIFIED_SERVICE_NOT_OBSERVED');
      }
      }).catch(()=>fail('LOCAL_RUN_TRANSITION_FAILED'));
      return transitions;
    },
    async close(){if(closed)return;closed=true;if(active())fail('LOCAL_RUN_CLOSED_OUTCOME_UNKNOWN');if(phase!=='terminal')phase='closed';await transitions;await persisting;},
    get status(){return snapshot();},
  };
}
