import {parseFlatDataFile} from './userdata-ipc.mjs';

const uint=value=>Number.isSafeInteger(value)&&value>=0&&value<=2147483647;

// A read-only admission receipt. Public roads have ownerCompany=0; an owned
// road is admissible only for its owner. The held executor still rechecks the
// road and company immediately before native submission.
export function parseRoadPreflightReceipt(source,{nonce,requestId,company,entity}) {
  const value=parseFlatDataFile(source);
  if(Object.keys(value).sort().join(',')!==
      'company,entity,kind,nonce,outcome,ownerCompany,requestId,revision,schemaVersion,tickCount,updateCount'
    ||value.schemaVersion!==1||value.kind!=='road_preflight_receipt'
    ||value.nonce!==nonce||!/^[0-9a-f]{32}$/.test(nonce)
    ||value.requestId!==requestId||!uint(requestId)||requestId<1
    ||value.company!==company||!uint(company)||company<1
    ||value.entity!==entity||!uint(entity)||entity<1
    ||!['found','missing','occupied','not_owner','unknown'].includes(value.outcome)
    ||![value.ownerCompany,value.revision,value.tickCount,value.updateCount].every(uint)
    ||value.outcome==='found'&&value.ownerCompany!==0&&value.ownerCompany!==company
    ||value.outcome!=='found'&&value.revision!==0)
    throw new TypeError('invalid road preflight receipt');
  return Object.freeze({...value});
}
