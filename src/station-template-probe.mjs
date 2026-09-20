import {parseFlatDataFile} from './userdata-ipc.mjs';
const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
export function stationTemplateRequest(nonce,requestId,tickCount){
  if(!/^[a-f0-9]{32}$/.test(nonce)||!uint(requestId)||requestId===0||!uint(tickCount)||tickCount>2147483347)
    throw new Error('INVALID_STATION_PROBE');
  return {schemaVersion:1,kind:'station_template_probe',nonce,requestId,issuedTick:tickCount,expiresTick:tickCount+300};
}
export function parseStationTemplateReceipt(source,request){
  const r=parseFlatDataFile(source);
  const keys='schemaVersion,kind,nonce,requestId,tickCount,updateCount,code,paramsPresent,modulesPresent,moduleCount,subconstructionCount,costKnown,cost,templateIndex,platforms';
  if(Object.keys(r).sort().join(',')!==keys.split(',').sort().join(',')||r.schemaVersion!==1
    ||r.kind!=='station_template_receipt'||r.nonce!==request.nonce||r.requestId!==request.requestId
    ||!uint(r.tickCount)||r.tickCount<request.issuedTick||r.tickCount>request.expiresTick||!uint(r.updateCount)
    ||!['TEMPLATE_EVALUATED','PROBE_FAILED','ALREADY_ATTEMPTED','REQUEST_EXPIRED',
      'RESOURCE_LOOKUP_FAILED','PARAMETER_METADATA_FAILED','GLOBAL_PARAMETERS_FAILED',
      'TEMPLATE_EVALUATION_FAILED','RESULT_INSPECTION_FAILED'].includes(r.code)
    ||![r.paramsPresent,r.modulesPresent,r.costKnown].every(n=>n===0||n===1)
    ||![r.moduleCount,r.subconstructionCount].every(n=>uint(n)&&n<=256)
    ||!Number.isSafeInteger(r.cost)||r.cost<0||r.templateIndex!==0||r.platforms!==1
    ||(!r.costKnown&&r.cost!==0)||(!r.modulesPresent&&r.moduleCount!==0))throw new Error('INVALID_STATION_RECEIPT');
  return Object.freeze(r);
}
