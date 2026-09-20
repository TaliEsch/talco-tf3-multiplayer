import {parseFlatDataFile} from './userdata-ipc.mjs';

const entity=value=>Number.isSafeInteger(value)&&value>0&&value<=2147483647;
const requestFields=['schemaVersion','kind','nonce','requestId','companyEntity','targetCompany','depotEntity','vehicleEntity','stationA','stationB','confirmed','issuedTick','expiresTick'];
const receiptFields=['schemaVersion','kind','nonce','requestId','companyEntity','targetCompany','depotEntity','vehicleEntity','stationA','stationB','tickCount','updateCount','outcome','code','lineEntity','lineOwner','vehicleOwner','stationAOwner','stationBOwner'];

export function serviceRequest({nonce,requestId,sample,targetCompany,depotEntity,vehicleEntity,stationA,stationB,confirmed}){
  if(confirmed!==true)throw new Error('EXPLICIT_SERVICE_CONSENT_REQUIRED');
  if(!/^[a-f0-9]{32}$/.test(nonce)||!entity(requestId)||!entity(sample?.companyEntity)
    ||!entity(targetCompany)||sample.companyEntity===targetCompany||sample.speedup!==0
    ||!Number.isSafeInteger(sample.tickCount)||sample.tickCount<0||sample.tickCount>2147483347)
    throw new Error('HELD_COMPANY_CONTEXT_REQUIRED');
  if(![depotEntity,vehicleEntity,stationA,stationB].every(entity)
    ||new Set([sample.companyEntity,targetCompany,depotEntity,vehicleEntity,stationA,stationB]).size!==6)
    throw new Error('INVALID_SERVICE_INTENT');
  return Object.freeze({schemaVersion:1,kind:'phase2_service',nonce,requestId,companyEntity:sample.companyEntity,
    targetCompany,depotEntity,vehicleEntity,stationA,stationB,confirmed:1,issuedTick:sample.tickCount,expiresTick:sample.tickCount+300});
}

export function serializeServiceRequest(request){
  const checked=serviceRequest({nonce:request?.nonce,requestId:request?.requestId,
    sample:{companyEntity:request?.companyEntity,tickCount:request?.issuedTick,speedup:0},
    targetCompany:request?.targetCompany,depotEntity:request?.depotEntity,vehicleEntity:request?.vehicleEntity,
    stationA:request?.stationA,stationB:request?.stationB,confirmed:request?.confirmed===1});
  if(!request||Object.keys(request).length!==requestFields.length
    ||Object.entries(checked).some(([key,value])=>request[key]!==value))throw new Error('INVALID_SERVICE_REQUEST');
  const source=`function data()\nreturn {\n${Object.entries(checked).map(([key,value])=>`  ${key} = ${JSON.stringify(value)},`).join('\n')}\n}\nend\n`;
  if(Buffer.byteLength(source)>4096)throw new Error('INVALID_SERVICE_REQUEST');
  return source;
}

export function parseServiceReceipt(source,request){
  if(typeof source!=='string'||Buffer.byteLength(source)>4096)throw new Error('INVALID_SERVICE_RECEIPT');
  const receipt=parseFlatDataFile(source);
  if(Object.keys(receipt).sort().join(',')!==[...receiptFields].sort().join(',')
    ||receipt.schemaVersion!==1||receipt.kind!=='phase2_service_receipt'
    ||receipt.nonce!==request?.nonce||receipt.requestId!==request?.requestId
    ||receipt.companyEntity!==request?.companyEntity||receipt.targetCompany!==request?.targetCompany
    ||receipt.depotEntity!==request?.depotEntity||receipt.vehicleEntity!==request?.vehicleEntity
    ||receipt.stationA!==request?.stationA||receipt.stationB!==request?.stationB
    ||!['verified','rejected','unknown'].includes(receipt.outcome)
    ||typeof receipt.code!=='string'||!/^[A-Z0-9_]{1,64}$/.test(receipt.code)
    ||![receipt.tickCount,receipt.updateCount,receipt.lineEntity,receipt.lineOwner,receipt.vehicleOwner,receipt.stationAOwner,receipt.stationBOwner]
      .every(value=>Number.isSafeInteger(value)&&value>=0&&value<=2147483647)
    ||receipt.tickCount<request.issuedTick)throw new Error('INVALID_SERVICE_RECEIPT');
  if(receipt.outcome==='verified'){
    if(receipt.tickCount>request.expiresTick||receipt.code!=='NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED'
      ||!entity(receipt.lineEntity)||receipt.lineOwner!==request.targetCompany||receipt.vehicleOwner!==request.targetCompany
      ||receipt.stationAOwner!==request.targetCompany||receipt.stationBOwner!==request.targetCompany
      ||new Set([request.companyEntity,request.targetCompany,request.depotEntity,request.vehicleEntity,
        request.stationA,request.stationB,receipt.lineEntity]).size!==7)throw new Error('UNVERIFIED_SERVICE_RESULT');
  }
  return Object.freeze({...receipt});
}
