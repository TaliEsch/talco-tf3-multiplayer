import {sha256Canonical} from './canonical.mjs';

const entity=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const identity=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const common=['schemaVersion','nonce','roundId','operationId','operation','status','updateCount','held'];
const fields=[...common,'snapshotVersion','hostSequence','entity','lineEntity',
  'ownerCompanyEntity','stationA','stationB'];

// Only a held game-world line and unchanged station identity acknowledge this
// free line-creation command. Service income and route operation are separate.
export function decodeLineCreateExecutionReceipt(p){
  if(!p||typeof p!=='object'||Array.isArray(p)
    ||Object.keys(p).sort().join(',')!==[...fields].sort().join(',')
    ||typeof p.nonce!=='string'||!/^[a-f0-9]{32}$/.test(p.nonce)
    ||!identity(p.roundId)||!identity(p.operationId)
    ||p.schemaVersion!==1||p.operation!=='executeHeld'||p.status!=='ok'
    ||p.held!==true||p.snapshotVersion!==4||!uint(p.updateCount)
    ||!entity(p.hostSequence)||!entity(p.entity)||p.lineEntity!==p.entity
    ||!entity(p.ownerCompanyEntity)||!entity(p.stationA)||!entity(p.stationB)
    ||p.stationA===p.stationB||p.lineEntity===p.stationA
    ||p.lineEntity===p.stationB)
    throw new Error('INVALID_LINE_CREATE_EXECUTION_RECEIPT');
  const state={schemaVersion:1,scope:'held_road_line_create_v1',
    updateCount:p.updateCount,speedup:0,hostSequence:p.hostSequence,
    line:{entity:p.lineEntity,ownerCompanyEntity:p.ownerCompanyEntity,
      stationA:p.stationA,stationB:p.stationB}};
  return {state,receipt:{...Object.fromEntries(common.map(key=>[key,p[key]])),
    ownerCompanyEntity:p.ownerCompanyEntity,stateHash:sha256Canonical(state)}};
}
