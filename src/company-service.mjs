import {sha256Canonical} from './canonical.mjs';

// Authoritative validation boundary for the Phase 2 adapter. These records must
// come from engine inspection, never from a player's claimed owner or balance.
// This module does not issue game commands or certify a live service by itself.
const entity=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const money=n=>Number.isSafeInteger(n);
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.split(',').sort().join(',');
const requireThat=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});};
function context(p,s){
  requireThat(entity(p?.originalCompany)&&entity(p?.targetCompany)&&p.originalCompany!==p.targetCompany
    &&hash(p.checkpointHash)&&p.soloDisposableTest===true,'INVALID_COMPANY_POLICY');
  requireThat(s?.originalCompany===p.originalCompany&&s.targetCompany===p.targetCompany
    &&s.checkpointHash===p.checkpointHash&&s.soloDisposableTest===true,'COMPANY_CONTEXT_CHANGED');
  requireThat(money(s.originalBalance)&&money(s.targetBalance),'BALANCE_UNAVAILABLE');
}

export function validateTestFunding(policy,snapshot,amount){
  context(policy,snapshot);
  requireThat(money(policy.maxTestFunding)&&policy.maxTestFunding>0&&policy.maxTestFunding<=1000000
    &&money(amount)&&amount>0&&amount<=policy.maxTestFunding
    &&money(snapshot.targetBalance+amount),'INVALID_TEST_FUNDING');
  return Object.freeze({kind:'test_funding',targetCompany:policy.targetCompany,amount,
    contextHash:sha256Canonical({checkpointHash:policy.checkpointHash,originalCompany:policy.originalCompany,
      targetCompany:policy.targetCompany,originalBalance:snapshot.originalBalance,targetBalance:snapshot.targetBalance,amount})});
}

export function verifyTestFunding(policy,before,confirmation,result){
  const expected=validateTestFunding(policy,before,confirmation?.amount);
  requireThat(sha256Canonical(expected)===sha256Canonical(confirmation),'FUNDING_CONFIRMATION_CHANGED');
  requireThat(exact(result,'commandSucceeded,payer,originalBalance,targetBalance')&&result.commandSucceeded===true
    &&result.payer===policy.targetCompany&&result.originalBalance===before.originalBalance
    &&result.targetBalance===before.targetBalance+confirmation.amount,'FUNDING_OUTCOME_UNKNOWN');
  return Object.freeze({outcome:'verified',amount:confirmation.amount,companyEntity:policy.targetCompany});
}

export function validateVehicleQuote(policy,snapshot,quote){
  context(policy,snapshot);
  requireThat(money(policy.maxVehicleCost)&&policy.maxVehicleCost>0,'INVALID_VEHICLE_BUDGET');
  requireThat(exact(quote,'depotEntity,depotOwner,roadConnected,carrier,configHash,cost,payer,vehicleCount,available')
    &&entity(quote.depotEntity)&&quote.depotOwner===policy.targetCompany&&quote.payer===policy.targetCompany
    &&quote.roadConnected===true&&quote.carrier==='road'&&quote.vehicleCount===1&&quote.available===true
    &&hash(quote.configHash),'INVALID_VEHICLE_QUOTE');
  requireThat(money(quote.cost)&&quote.cost>0&&quote.cost<=policy.maxVehicleCost
    &&snapshot.targetBalance>=quote.cost,'INSUFFICIENT_FUNDS_OR_PRICE');
  return Object.freeze({kind:'vehicle_purchase',companyEntity:policy.targetCompany,depotEntity:quote.depotEntity,
    configHash:quote.configHash,cost:quote.cost,checkpointHash:policy.checkpointHash});
}

export function revalidateVehicleConfirmation(policy,snapshot,quote,confirmation){
  const fresh=validateVehicleQuote(policy,snapshot,quote);
  requireThat(sha256Canonical(fresh)===sha256Canonical(confirmation),'VEHICLE_CONFIRMATION_CHANGED');
  return fresh;
}

export function verifyVehiclePurchase(policy,before,quote,confirmation,result){
  revalidateVehicleConfirmation(policy,before,quote,confirmation);
  requireThat(exact(result,'commandSucceeded,newVehicle,vehicleEntity,vehicleOwner,depotEntity,configHash,payer,originalBalance,targetBalance')
    &&result.commandSucceeded===true&&result.newVehicle===true&&entity(result.vehicleEntity)
    &&![policy.originalCompany,policy.targetCompany,confirmation.depotEntity].includes(result.vehicleEntity)
    &&result.vehicleOwner===policy.targetCompany&&result.payer===policy.targetCompany
    &&result.depotEntity===confirmation.depotEntity&&result.configHash===confirmation.configHash
    &&result.originalBalance===before.originalBalance&&result.targetBalance===before.targetBalance-confirmation.cost,
  'PURCHASE_OUTCOME_UNKNOWN');
  return Object.freeze({outcome:'verified',companyEntity:policy.targetCompany,vehicleEntity:result.vehicleEntity,cost:confirmation.cost});
}

export function validateServiceAssignment(policy,inspection){
  requireThat(entity(policy?.targetCompany)&&entity(policy?.originalCompany)&&policy.targetCompany!==policy.originalCompany,'INVALID_COMPANY_POLICY');
  requireThat(exact(inspection,'vehicleEntity,vehicleOwner,lineEntity,lineOwner,stopCount,routeReachable,carrier')
    &&entity(inspection.vehicleEntity)&&entity(inspection.lineEntity)&&inspection.vehicleEntity!==inspection.lineEntity
    &&inspection.vehicleOwner===policy.targetCompany&&inspection.lineOwner===policy.targetCompany
    &&inspection.stopCount===2&&inspection.routeReachable===true&&inspection.carrier==='road','INVALID_SERVICE_ASSIGNMENT');
  return Object.freeze({...inspection});
}

// A balance delta alone is insufficient: normal simulation continues to charge
// the original service too. Require attributable journal evidence and observed
// operation of this specific vehicle, without treating missing income as zero.
export function verifyServiceOperation(policy,assignment,evidence){
  validateServiceAssignment(policy,assignment);
  requireThat(exact(evidence,'companyEntity,vehicleEntity,lineEntity,fromUpdate,toUpdate,visitedStops,operatingExpense,revenue,expenseCompany,revenueCompany')
    &&evidence.companyEntity===policy.targetCompany&&evidence.vehicleEntity===assignment.vehicleEntity
    &&evidence.lineEntity===assignment.lineEntity&&Number.isSafeInteger(evidence.fromUpdate)&&evidence.fromUpdate>=0
    &&Number.isSafeInteger(evidence.toUpdate)&&evidence.toUpdate>evidence.fromUpdate
    &&Array.isArray(evidence.visitedStops)&&evidence.visitedStops.length===2
    &&new Set(evidence.visitedStops).size===2&&evidence.visitedStops.every(n=>n===0||n===1)
    &&money(evidence.operatingExpense)&&evidence.operatingExpense>0&&money(evidence.revenue)&&evidence.revenue>0
    &&evidence.expenseCompany===policy.targetCompany&&evidence.revenueCompany===policy.targetCompany,'SERVICE_NOT_VERIFIED');
  return Object.freeze({outcome:'verified',companyEntity:policy.targetCompany,vehicleEntity:assignment.vehicleEntity,
    lineEntity:assignment.lineEntity,operatingExpense:evidence.operatingExpense,revenue:evidence.revenue});
}
