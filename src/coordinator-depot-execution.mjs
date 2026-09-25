import {sha256Canonical} from './canonical.mjs';

const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const entity=n=>uint(n)&&n>0;
const identity=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const common=['schemaVersion','nonce','roundId','operationId','operation','status','updateCount','held'];
const fields=[...common,'snapshotVersion','hostSequence','entity','ownerCompanyEntity',
  'constructionEntity','depotEntity','chargedCost','balance','negative'];

export function decodeDepotExecutionReceipt(p){
  if(!p||typeof p!=='object'||Array.isArray(p)
    ||Object.keys(p).sort().join(',')!==[...fields].sort().join(',')
    ||typeof p.nonce!=='string'||!/^[a-f0-9]{32}$/.test(p.nonce)
    ||!identity(p.roundId)||!identity(p.operationId)
    ||p.schemaVersion!==1||p.operation!=='executeHeld'||p.status!=='ok'
    ||p.held!==true||p.snapshotVersion!==3||!uint(p.updateCount)
    ||!entity(p.hostSequence)||p.entity!==0||!entity(p.ownerCompanyEntity)
    ||!entity(p.constructionEntity)||!entity(p.depotEntity)
    ||p.constructionEntity===p.depotEntity
    ||![p.chargedCost,p.balance].every(n=>Number.isSafeInteger(n)&&n>=0)
    ||p.chargedCost===0||![0,1].includes(p.negative)
    ||p.balance===0&&p.negative!==0)throw new Error('INVALID_DEPOT_EXECUTION_RECEIPT');
  const state={schemaVersion:1,scope:'held_stock_road_depot_company_balance_v1',
    updateCount:p.updateCount,speedup:0,hostSequence:p.hostSequence,
    depot:{constructionEntity:p.constructionEntity,depotEntity:p.depotEntity,
      ownerCompanyEntity:p.ownerCompanyEntity,chargedCost:p.chargedCost},
    company:{companyEntity:p.ownerCompanyEntity,balance:p.negative?-p.balance:p.balance}};
  return {state,receipt:{...Object.fromEntries(common.map(key=>[key,p[key]])),
    ownerCompanyEntity:p.ownerCompanyEntity,stateHash:sha256Canonical(state)}};
}
