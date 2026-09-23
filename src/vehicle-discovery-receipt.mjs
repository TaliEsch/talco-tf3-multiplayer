import {parseFlatDataFile} from './userdata-ipc.mjs';

const uint=value=>Number.isSafeInteger(value)&&value>=0&&value<=2147483647;

export function parseVehicleDiscoveryReceipt(source,{nonce,requestId,company}) {
  const value=parseFlatDataFile(source);
  if(Object.keys(value).sort().join(',')!=='company,entity,kind,nonce,outcome,requestId,revision,schemaVersion,stopFlag,tickCount,updateCount'
    ||value.schemaVersion!==1||value.kind!=='vehicle_discovery_receipt'
    ||value.nonce!==nonce||!/^[0-9a-f]{32}$/.test(nonce)
    ||value.requestId!==requestId||!uint(requestId)||requestId<1
    ||value.company!==company||!uint(company)
    ||!['found','missing','not_owner'].includes(value.outcome)
    ||![value.entity,value.revision,value.tickCount,value.updateCount].every(uint)
    ||![0,1].includes(value.stopFlag)
    ||value.outcome!=='found'&&[value.entity,value.revision,value.stopFlag].some(v=>v!==0))
    throw new TypeError('invalid vehicle discovery receipt');
  return Object.freeze({...value});
}
