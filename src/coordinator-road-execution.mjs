import { sha256Canonical } from './canonical.mjs';

const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const entity=n=>uint(n)&&n>0;
const identity=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const fields=['schemaVersion','nonce','roundId','operationId','operation','status',
  'updateCount','held','snapshotVersion','hostSequence','entity','ownerCompanyEntity',
  'stopEntity','roadEntity','chargedCost','balance','negative'];
const common=['schemaVersion','nonce','roundId','operationId','operation','status','updateCount','held'];

export function decodeRoadExecutionReceipt(p){
  if(!p||typeof p!=='object'||Array.isArray(p)
    ||Object.keys(p).sort().join(',')!==[...fields].sort().join(',')
    ||typeof p.nonce!=='string'||!/^[a-f0-9]{32}$/.test(p.nonce)
    ||!identity(p.roundId)||!identity(p.operationId)
    ||p.schemaVersion!==1||p.operation!=='executeHeld'||p.status!=='ok'
    ||p.held!==true||p.snapshotVersion!==2||!uint(p.updateCount)
    ||!entity(p.hostSequence)||!entity(p.entity)||!entity(p.ownerCompanyEntity)
    ||!entity(p.stopEntity)||!entity(p.roadEntity)||p.roadEntity===p.entity
    ||!Number.isSafeInteger(p.chargedCost)||p.chargedCost<=0
    ||!Number.isSafeInteger(p.balance)||p.balance<0||![0,1].includes(p.negative)
    ||p.balance===0&&p.negative!==0)throw new Error('INVALID_ROAD_EXECUTION_RECEIPT');
  const state={schemaVersion:1,scope:'held_road_stop_company_balance_v1',
    updateCount:p.updateCount,speedup:0,hostSequence:p.hostSequence,
    roadStop:{sourceRoadEntity:p.entity,roadEntity:p.roadEntity,
      stopEntity:p.stopEntity,ownerCompanyEntity:p.ownerCompanyEntity,
      chargedCost:p.chargedCost},
    company:{companyEntity:p.ownerCompanyEntity,balance:p.negative?-p.balance:p.balance}};
  return {state,receipt:{...Object.fromEntries(common.map(key=>[key,p[key]])),
    ownerCompanyEntity:p.ownerCompanyEntity,stateHash:sha256Canonical(state)}};
}
