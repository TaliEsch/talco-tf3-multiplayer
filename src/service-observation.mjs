import {parseFlatDataFile} from './userdata-ipc.mjs';

const MAX_INT=2147483647;
const entity=value=>Number.isSafeInteger(value)&&value>0&&value<=MAX_INT;
const unsigned=value=>Number.isSafeInteger(value)&&value>=0;
const requestKeys=['schemaVersion','kind','nonce','requestId','action','originalCompany','targetCompany','vehicleEntity','lineEntity','issuedTick','expiresTick'];
const identityKeys=['nonce','requestId','action','originalCompany','targetCompany','vehicleEntity','lineEntity','issuedTick','expiresTick'];
const rawKeys=['startGameTime','startUpdateCount','endGameTime','endUpdateCount','accountNetWindowStart','accountNetWindowEnd','accountNet','intervalNet','intervalMaintenanceVehicle','intervalMaintenanceInfrastructure','intervalMaintenanceOther','intervalMaintenanceVehicleMaintenance','startVisitedMask','endVisitedMask','startStopIndex','endStopIndex'];
const receiptKeys=['schemaVersion','kind',...identityKeys,'outcome','code','tickCount','updateCount','gameTime',...rawKeys];
const signedKeys=new Set(['accountNet','intervalNet','intervalMaintenanceVehicle','intervalMaintenanceInfrastructure','intervalMaintenanceOther','intervalMaintenanceVehicleMaintenance']);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');

// Read-only, local post-assignment observation. A caller cannot select arbitrary
// assets: both the bridge and engine bind these IDs to a verified service receipt.
export function serviceObservationRequest({nonce,requestId,action,sample,binding}={}){
  if(typeof nonce!=='string'||!/^[a-f0-9]{32}$/.test(nonce)||!entity(requestId)||!['start','end'].includes(action)
    ||!sample||sample.speedup!==0||!entity(sample.companyEntity)||!unsigned(sample.tickCount)||sample.tickCount>MAX_INT-300
    ||!binding||binding.originalCompany!==sample.companyEntity
    ||![binding.originalCompany,binding.targetCompany,binding.vehicleEntity,binding.lineEntity].every(entity)
    ||new Set([binding.originalCompany,binding.targetCompany,binding.vehicleEntity,binding.lineEntity]).size!==4)
    throw new Error('VERIFIED_PAUSED_SERVICE_REQUIRED');
  return Object.freeze({schemaVersion:1,kind:'phase2_service_observation',nonce,requestId,action,
    originalCompany:binding.originalCompany,targetCompany:binding.targetCompany,vehicleEntity:binding.vehicleEntity,lineEntity:binding.lineEntity,
    issuedTick:sample.tickCount,expiresTick:sample.tickCount+300});
}

export function serializeServiceObservationRequest(request){
  const checked=serviceObservationRequest({nonce:request?.nonce,requestId:request?.requestId,action:request?.action,
    sample:{companyEntity:request?.originalCompany,speedup:0,tickCount:request?.issuedTick},binding:request});
  if(!exact(request,requestKeys)||Object.keys(checked).some(key=>checked[key]!==request[key]))throw new Error('INVALID_SERVICE_OBSERVATION_REQUEST');
  return `function data()\nreturn {\n${Object.entries(checked).map(([key,value])=>`  ${key} = ${JSON.stringify(value)},`).join('\n')}\n}\nend\n`;
}

export function parseServiceObservationReceipt(source,request){
  if(typeof source!=='string'||Buffer.byteLength(source)>4096)throw new Error('INVALID_SERVICE_OBSERVATION_RECEIPT');
  serializeServiceObservationRequest(request);
  // Keep the common IPC grammar unsigned. Only the six raw account fields may
  // carry signed integer literals; no expressions, escapes or exponent syntax.
  const negatives=new Set();
  const normalized=source.replace(/\b(accountNet|intervalNet|intervalMaintenanceVehicle|intervalMaintenanceInfrastructure|intervalMaintenanceOther|intervalMaintenanceVehicleMaintenance)\s*=\s*-([1-9][0-9]*)\s*,/g,(_match,key,magnitude)=>{
    if(negatives.has(key))throw new Error('DUPLICATE_SERVICE_OBSERVATION_FIELD');
    negatives.add(key);return `${key} = ${magnitude},`;
  });
  const receipt=parseFlatDataFile(normalized);
  for(const key of negatives)receipt[key]=-receipt[key];
  if(!exact(receipt,receiptKeys)||receipt.schemaVersion!==1||receipt.kind!=='phase2_service_observation_receipt'
    ||identityKeys.some(key=>receipt[key]!==request[key])
    ||!['raw_start_captured','raw_end_captured','rejected'].includes(receipt.outcome)
    ||typeof receipt.code!=='string'||!/^[A-Z0-9_]{1,64}$/.test(receipt.code)
    ||!['tickCount','updateCount','gameTime',...rawKeys].every(key=>signedKeys.has(key)?Number.isSafeInteger(receipt[key]):unsigned(receipt[key]))
    ||receipt.startVisitedMask>3||receipt.endVisitedMask>3||receipt.startStopIndex>1||receipt.endStopIndex>1)
    throw new Error('INVALID_SERVICE_OBSERVATION_RECEIPT');
  if(receipt.outcome!=='rejected'){
    const start=request.action==='start';
    if(receipt.outcome!==(start?'raw_start_captured':'raw_end_captured')||receipt.code!==(start?'RAW_START_CAPTURED':'RAW_END_CAPTURED')
      ||receipt.tickCount<request.issuedTick||receipt.tickCount>request.expiresTick
      ||receipt.accountNetWindowEnd!==receipt.gameTime||receipt.accountNetWindowStart>receipt.accountNetWindowEnd
      ||(start?(receipt.startGameTime!==receipt.gameTime||receipt.startUpdateCount!==receipt.updateCount)
        :(receipt.endGameTime!==receipt.gameTime||receipt.endUpdateCount!==receipt.updateCount
          ||receipt.endGameTime<=receipt.startGameTime||receipt.endUpdateCount<=receipt.startUpdateCount)))
      throw new Error('UNVERIFIED_SERVICE_OBSERVATION');
  }
  return Object.freeze({...receipt,gameplayVerified:false,serviceAccountingVerified:false});
}

// This proves that two bounded raw reads refer to one observed interval. It
// does not turn vehicle-level net totals into company revenue or a completed
// trip: those meanings need separate TF3 evidence.
export function correlateRawServiceInterval(start,end){
  const rows=[start,end];
  if(rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))return null;
  const textFields=['action','outcome','code'];
  const numericFields=['requestId','originalCompany','targetCompany','vehicleEntity','lineEntity',
    'tickCount','updateCount','gameTime',...rawKeys];
  if(rows.some(row=>textFields.some(key=>typeof row[key]!=='string')
    ||numericFields.some(key=>!Number.isSafeInteger(row[key]))))return null;
  if(start.action!=='start'||start.outcome!=='raw_start_captured'||start.code!=='RAW_START_CAPTURED'
    ||end.action!=='end'||end.outcome!=='raw_end_captured'||end.code!=='RAW_END_CAPTURED'
    ||!entity(start.requestId)||!entity(end.requestId)||end.requestId<=start.requestId
    ||[start.originalCompany,start.targetCompany,start.vehicleEntity,start.lineEntity].some(value=>!entity(value))
    ||new Set([start.originalCompany,start.targetCompany,start.vehicleEntity,start.lineEntity]).size!==4
    ||['originalCompany','targetCompany','vehicleEntity','lineEntity'].some(key=>start[key]!==end[key])
    ||end.tickCount<=start.tickCount||end.updateCount<=start.updateCount||end.gameTime<=start.gameTime
    ||start.startUpdateCount!==start.updateCount||start.startGameTime!==start.gameTime
    ||end.startUpdateCount!==start.updateCount||end.startGameTime!==start.gameTime
    ||end.endUpdateCount!==end.updateCount||end.endGameTime!==end.gameTime
    ||start.accountNetWindowStart<0||end.accountNetWindowStart<0
    ||start.accountNetWindowEnd!==start.gameTime||end.accountNetWindowEnd!==end.gameTime
    ||start.accountNetWindowStart>start.gameTime||end.accountNetWindowStart>end.gameTime
    ||start.startVisitedMask<0||start.startVisitedMask>3||end.endVisitedMask<0||end.endVisitedMask>3
    ||end.startVisitedMask!==start.startVisitedMask
    ||start.startStopIndex<0||start.startStopIndex>1||end.endStopIndex<0||end.endStopIndex>1
    ||end.startStopIndex!==start.startStopIndex)return null;
  return Object.freeze({startUpdateCount:start.updateCount,endUpdateCount:end.updateCount,
    routeStateChanged:end.endVisitedMask!==start.startVisitedMask||end.endStopIndex!==start.startStopIndex});
}
