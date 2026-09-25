import {sha256Canonical} from './canonical.mjs';

const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const entity=n=>uint(n)&&n>0;
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
const signedMoney=n=>Number.isSafeInteger(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER;
const identity=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const common=['schemaVersion','nonce','roundId','operationId','operation','status','updateCount','held'];
const fields=[...common,'snapshotVersion','hostSequence','entity','ownerCompanyEntity',
  'vehicleEntity','depotEntity','chargedCost','balance','negative','targetBefore',
  'originalBefore','originalAfter'];

// All numbers come from the held game-world readback. The callback alone is
// never enough to acknowledge a purchase or its native debit.
export function decodeVehicleBuyExecutionReceipt(p){
  if(!p||typeof p!=='object'||Array.isArray(p)
    ||Object.keys(p).sort().join(',')!==[...fields].sort().join(',')
    ||typeof p.nonce!=='string'||!/^[a-f0-9]{32}$/.test(p.nonce)
    ||!identity(p.roundId)||!identity(p.operationId)
    ||p.schemaVersion!==1||p.operation!=='executeHeld'||p.status!=='ok'
    ||p.held!==true||p.snapshotVersion!==3||!uint(p.updateCount)
    ||!entity(p.hostSequence)||!entity(p.entity)||p.vehicleEntity!==p.entity
    ||!entity(p.ownerCompanyEntity)||!entity(p.depotEntity)
    ||p.depotEntity===p.entity
    ||![p.chargedCost,p.balance,p.targetBefore].every(money)
    ||![p.originalBefore,p.originalAfter].every(signedMoney)
    ||p.chargedCost===0||p.negative!==0
    ||p.targetBefore-p.balance!==p.chargedCost
    ||p.originalBefore!==p.originalAfter)
    throw new Error('INVALID_VEHICLE_BUY_EXECUTION_RECEIPT');
  const state={schemaVersion:1,scope:'held_road_vehicle_purchase_company_balance_v1',
    updateCount:p.updateCount,speedup:0,hostSequence:p.hostSequence,
    vehicle:{entity:p.vehicleEntity,depotEntity:p.depotEntity,
      ownerCompanyEntity:p.ownerCompanyEntity},
    depot:{entity:p.depotEntity,ownerCompanyEntity:p.ownerCompanyEntity},
    company:{companyEntity:p.ownerCompanyEntity,balance:p.balance,
      balanceBefore:p.targetBefore,chargedCost:p.chargedCost},
    hostCompany:{balanceBefore:p.originalBefore,balanceAfter:p.originalAfter}};
  return {state,receipt:{...Object.fromEntries(common.map(key=>[key,p[key]])),
    ownerCompanyEntity:p.ownerCompanyEntity,stateHash:sha256Canonical(state)}};
}
