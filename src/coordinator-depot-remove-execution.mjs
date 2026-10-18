import {sha256Canonical} from './canonical.mjs';

const entity=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const identity=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const common=['schemaVersion','nonce','roundId','operationId','operation','status','updateCount','held'];
const fields=[...common,'snapshotVersion','hostSequence','entity','depotEntity',
  'constructionEntity','ownerCompanyEntity','depotRemoved','constructionRemoved','cost','negativeCost'];

export function decodeDepotRemoveExecutionReceipt(p){
  const count=p?.companyCount;
  const expected=[...fields,'companyCount'];
  if(Number.isSafeInteger(count)&&count>=2&&count<=4)
    for(let i=1;i<=count;i++)expected.push(`company${i}`,`balanceBefore${i}`,
      `negativeBefore${i}`,`balanceAfter${i}`,`negativeAfter${i}`);
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.getPrototypeOf(p)!==Object.prototype
    ||!Number.isSafeInteger(count)||count<2||count>4
    ||Object.keys(p).sort().join(',')!==expected.sort().join(',')
    ||typeof p.nonce!=='string'||!/^[a-f0-9]{32}$/.test(p.nonce)
    ||!identity(p.roundId)||!identity(p.operationId)
    ||p.schemaVersion!==1||p.operation!=='executeHeld'||p.status!=='ok'
    ||p.held!==true||p.snapshotVersion!==14||!uint(p.updateCount)
    ||!entity(p.hostSequence)||!entity(p.entity)||p.depotEntity!==p.entity
    ||!entity(p.constructionEntity)||p.constructionEntity===p.depotEntity
    ||!entity(p.ownerCompanyEntity)||p.depotRemoved!==true||p.constructionRemoved!==true
    ||!Number.isSafeInteger(p.cost)||p.cost<0
    ||p.negativeCost!==0&&p.negativeCost!==1||p.cost===0&&p.negativeCost!==0)
    throw new Error('INVALID_DEPOT_REMOVE_EXECUTION_RECEIPT');
  const companies=[];
  for(let i=1;i<=count;i++){
    const id=p[`company${i}`],before=p[`balanceBefore${i}`],after=p[`balanceAfter${i}`];
    const beforeNegative=p[`negativeBefore${i}`],afterNegative=p[`negativeAfter${i}`];
    if(!entity(id)||i>1&&id<=companies.at(-1).companyEntity
      ||![before,after].every(value=>Number.isSafeInteger(value)&&value>=0)
      ||![beforeNegative,afterNegative].every(value=>value===0||value===1)
      ||before===0&&beforeNegative!==0||after===0&&afterNegative!==0)
      throw new Error('INVALID_DEPOT_REMOVE_EXECUTION_RECEIPT');
    companies.push({companyEntity:id,balanceBefore:beforeNegative?-before:before,
      balanceAfter:afterNegative?-after:after});
  }
  const owner=companies.find(company=>company.companyEntity===p.ownerCompanyEntity);
  if(!owner)throw new Error('INVALID_DEPOT_REMOVE_EXECUTION_RECEIPT');
  const signedCost=p.negativeCost===1?-p.cost:p.cost;
  if(BigInt(owner.balanceBefore)-BigInt(signedCost)!==BigInt(owner.balanceAfter)
    ||companies.some(company=>company!==owner&&company.balanceAfter!==company.balanceBefore))
    throw new Error('INVALID_DEPOT_REMOVE_EXECUTION_RECEIPT');
  const state={schemaVersion:1,scope:'held_road_depot_remove_v1',updateCount:p.updateCount,
    speedup:0,hostSequence:p.hostSequence,removedDepot:{depotEntity:p.depotEntity,
      constructionEntity:p.constructionEntity,ownerCompanyEntity:p.ownerCompanyEntity,signedCost},
    accounting:{companies}};
  return {state,receipt:{...Object.fromEntries(common.map(key=>[key,p[key]])),
    ownerCompanyEntity:p.ownerCompanyEntity,stateHash:sha256Canonical(state)}};
}
