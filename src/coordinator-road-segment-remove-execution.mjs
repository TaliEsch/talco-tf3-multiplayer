import {sha256Canonical} from './canonical.mjs';

const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const entity=n=>uint(n)&&n>0;
const identity=s=>typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const common=['schemaVersion','nonce','roundId','operationId','operation','status','updateCount','held'];
const fields=[...common,'snapshotVersion','hostSequence','entity','edgeEntity','ownerCompanyEntity',
  'preparedEffectHash','edgeRemoved','removedNodeCount','nodeConfigurationsMatched',
  'survivingEdgesMatched','removedNodesAbsent','topologyMatched','cost','negativeCost','companyCount'];

// Local entity IDs remain evidence, never cross-instance semantic identity.
// Success is produced only after the native executor independently checks the
// agreed proposal's surviving topology/configuration and native accounting.
export function decodeRoadSegmentRemoveExecutionReceipt(p){
  const fail=()=>{throw new Error('INVALID_ROAD_SEGMENT_REMOVE_EXECUTION_RECEIPT');};
  const count=p?.companyCount,expected=[...fields];
  if(Number.isSafeInteger(count)&&count>=2&&count<=4)
    for(let i=1;i<=count;i++)expected.push(`company${i}`,`balanceBefore${i}`,
      `negativeBefore${i}`,`balanceAfter${i}`,`negativeAfter${i}`);
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.getPrototypeOf(p)!==Object.prototype
    ||!Number.isSafeInteger(count)||count<2||count>4
    ||Object.keys(p).sort().join(',')!==expected.sort().join(',')
    ||p.schemaVersion!==1||p.operation!=='executeHeld'||p.status!=='ok'||p.held!==true
    ||typeof p.nonce!=='string'||!/^[a-f0-9]{32}$/.test(p.nonce)
    ||!identity(p.roundId)||!identity(p.operationId)||!uint(p.updateCount)
    ||p.snapshotVersion!==15||!entity(p.hostSequence)||p.entity!==0||!entity(p.edgeEntity)
    ||!entity(p.ownerCompanyEntity)||p.edgeRemoved!==true
    ||!uint(p.removedNodeCount)||p.removedNodeCount>1
    ||!['nodeConfigurationsMatched','survivingEdgesMatched','removedNodesAbsent','topologyMatched']
      .every(key=>p[key]===true)
    ||typeof p.preparedEffectHash!=='string'||!/^[a-f0-9]{64}$/.test(p.preparedEffectHash)
    ||!Number.isSafeInteger(p.cost)||p.cost<0
    ||p.negativeCost!==0&&p.negativeCost!==1||p.cost===0&&p.negativeCost!==0)fail();
  const companies=[];
  for(let i=1;i<=count;i++){
    const id=p[`company${i}`],before=p[`balanceBefore${i}`],after=p[`balanceAfter${i}`];
    const beforeNegative=p[`negativeBefore${i}`],afterNegative=p[`negativeAfter${i}`];
    if(!entity(id)||i>1&&id<=companies.at(-1).companyEntity
      ||![before,after].every(n=>Number.isSafeInteger(n)&&n>=0)
      ||![beforeNegative,afterNegative].every(n=>n===0||n===1)
      ||before===0&&beforeNegative!==0||after===0&&afterNegative!==0)fail();
    companies.push({companyEntity:id,balanceBefore:beforeNegative?-before:before,
      balanceAfter:afterNegative?-after:after});
  }
  const owner=companies.find(c=>c.companyEntity===p.ownerCompanyEntity);
  const signedCost=p.negativeCost?-p.cost:p.cost;
  if(!owner||BigInt(owner.balanceBefore)-BigInt(signedCost)!==BigInt(owner.balanceAfter)
    ||companies.some(c=>c!==owner&&c.balanceBefore!==c.balanceAfter))fail();
  const state={schemaVersion:1,scope:'held_road_segment_remove_v1',updateCount:p.updateCount,
    speedup:0,hostSequence:p.hostSequence,removedRoad:{preparedEffectHash:p.preparedEffectHash,
      ownerCompanyEntity:p.ownerCompanyEntity,edgeRemoved:true,removedNodeCount:p.removedNodeCount,
      nodeConfigurationsMatched:true,survivingEdgesMatched:true,removedNodesAbsent:true,
      topologyMatched:true,signedCost},accounting:{companies}};
  return {state,localEvidence:{edgeEntity:p.edgeEntity},receipt:{
    ...Object.fromEntries(common.map(key=>[key,p[key]])),ownerCompanyEntity:p.ownerCompanyEntity,
    stateHash:sha256Canonical(state)}};
}
