import {parseFlatDataFile} from './userdata-ipc.mjs';

const entity=value=>Number.isSafeInteger(value)&&value>0&&value<=2147483647;
const nonnegative=value=>Number.isSafeInteger(value)&&value>=0&&value<=2147483647;
const keys=value=>Object.keys(value).sort().join(',');
const observedFields=['schemaVersion','kind','code','nonce','requestId','hostSequence',
  'company','localCompany','sourceRoad','road','stop','update','balance','balanceNegative',
  'localBalance','localBalanceNegative','charge'];
const unknownFields=['schemaVersion','kind','code','nonce','requestId','stage'];
const stages=new Set(['request','clock','balance','local_balance','source_road','stop','attachment']);

export function parseOrderedRoadReadback(source,request){
  const value=parseFlatDataFile(source);
  if(value.schemaVersion!==1||value.kind!=='ordered_road_readback_receipt'
    ||value.nonce!==request.nonce||!/^([0-9a-f]{32})$/.test(value.nonce)
    ||value.requestId!==request.requestId)throw new TypeError('INVALID_ORDERED_ROAD_READBACK');
  if(value.code==='unknown'&&keys(value)===unknownFields.sort().join(',')
    &&stages.has(value.stage))return Object.freeze({...value});
  if(value.code!=='observed'||keys(value)!==observedFields.sort().join(',')
    ||!entity(value.hostSequence)||!entity(value.company)||!entity(value.localCompany)
    ||!entity(value.sourceRoad)
    ||!entity(value.road)||!entity(value.stop)||!nonnegative(value.update)
    ||!Number.isSafeInteger(value.balance)||value.balance<0
    ||![0,1].includes(value.balanceNegative)
    ||value.balance===0&&value.balanceNegative!==0
    ||!Number.isSafeInteger(value.localBalance)||value.localBalance<0
    ||![0,1].includes(value.localBalanceNegative)
    ||value.localBalance===0&&value.localBalanceNegative!==0
    ||!Number.isSafeInteger(value.charge)||value.charge<1
    ||value.hostSequence!==request.hostSequence||value.company!==request.company
    ||value.localCompany!==request.localCompany
    ||value.sourceRoad!==request.sourceRoad||value.road!==request.road
    ||value.stop!==request.stop||value.update!==request.update
    ||value.balance!==request.balance||value.balanceNegative!==request.balanceNegative
    ||value.localBalance!==request.localBalance
    ||value.localBalanceNegative!==request.localBalanceNegative
    ||value.charge!==request.charge)
    throw new TypeError('INVALID_ORDERED_ROAD_READBACK');
  return Object.freeze({...value});
}
