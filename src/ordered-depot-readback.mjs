import {parseFlatDataFile} from './userdata-ipc.mjs';

const entity=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const keys=value=>Object.keys(value).sort().join(',');
const observedFields=['schemaVersion','kind','code','nonce','requestId','hostSequence',
  'company','localCompany','construction','depot','update','balance','balanceNegative',
  'localBalance','localBalanceNegative','charge'];
const unknownFields=['schemaVersion','kind','code','nonce','requestId','stage'];
const stages=new Set(['request','clock','balance','local_balance','construction','depot']);

export function parseOrderedDepotReadback(source,request){
  const value=parseFlatDataFile(source);
  if(value.schemaVersion!==1||value.kind!=='ordered_depot_readback_receipt'
    ||value.nonce!==request.nonce||!/^[0-9a-f]{32}$/.test(value.nonce)
    ||value.requestId!==request.requestId)throw new TypeError('INVALID_ORDERED_DEPOT_READBACK');
  if(value.code==='unknown'&&keys(value)===unknownFields.sort().join(',')
    &&stages.has(value.stage))return Object.freeze({...value});
  if(value.code!=='observed'||keys(value)!==observedFields.sort().join(',')
    ||![value.hostSequence,value.company,value.localCompany,value.construction,
      value.depot,value.charge].every(entity)
    ||value.construction===value.depot||!uint(value.update)
    ||![value.balance,value.localBalance].every(uint)
    ||![value.balanceNegative,value.localBalanceNegative].every(n=>n===0||n===1)
    ||value.balance===0&&value.balanceNegative!==0
    ||value.localBalance===0&&value.localBalanceNegative!==0
    ||observedFields.some(key=>value[key]!==request[key]&&key!=='code'&&key!=='kind'))
    throw new TypeError('INVALID_ORDERED_DEPOT_READBACK');
  return Object.freeze({...value});
}
