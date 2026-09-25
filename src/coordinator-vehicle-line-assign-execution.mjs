import {sha256Canonical} from './canonical.mjs';

const entity=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const ident=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const common=['schemaVersion','nonce','roundId','operationId','operation','status','updateCount','held'];
const fields=[...common,'snapshotVersion','hostSequence','entity','vehicleEntity','lineEntity','ownerCompanyEntity','lineOwnerCompanyEntity'];

export function decodeVehicleLineAssignExecutionReceipt(p){
  if(!p||typeof p!=='object'||Array.isArray(p)
    ||Object.keys(p).sort().join(',')!==fields.sort().join(',')
    ||typeof p.nonce!=='string'||!/^[a-f0-9]{32}$/.test(p.nonce)
    ||!ident(p.roundId)||!ident(p.operationId)||p.schemaVersion!==1
    ||p.operation!=='executeHeld'||p.status!=='ok'||p.held!==true
    ||p.snapshotVersion!==5||!uint(p.updateCount)||!entity(p.hostSequence)
    ||!entity(p.vehicleEntity)||p.entity!==p.vehicleEntity
    ||!entity(p.lineEntity)||p.lineEntity===p.vehicleEntity
    ||!entity(p.ownerCompanyEntity)||p.lineOwnerCompanyEntity!==p.ownerCompanyEntity)
    throw new Error('INVALID_VEHICLE_LINE_ASSIGN_EXECUTION_RECEIPT');
  const state={schemaVersion:1,scope:'held_road_vehicle_line_assign_v1',
    updateCount:p.updateCount,speedup:0,hostSequence:p.hostSequence,
    vehicle:{entity:p.vehicleEntity,ownerCompanyEntity:p.ownerCompanyEntity,lineEntity:p.lineEntity},
    line:{entity:p.lineEntity,ownerCompanyEntity:p.lineOwnerCompanyEntity}};
  return {state,receipt:{...Object.fromEntries(common.map(key=>[key,p[key]])),
    ownerCompanyEntity:p.ownerCompanyEntity,stateHash:sha256Canonical(state)}};
}
