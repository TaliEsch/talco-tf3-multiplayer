import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTestFunding,verifyTestFunding,validateVehicleQuote,revalidateVehicleConfirmation,
  verifyVehiclePurchase,validateServiceAssignment,verifyServiceOperation} from '../src/company-service.mjs';

function fixture(){
  const policy={originalCompany:10,targetCompany:20,checkpointHash:'a'.repeat(64),soloDisposableTest:true,maxTestFunding:100000,maxVehicleCost:20000};
  const snapshot={originalCompany:10,targetCompany:20,checkpointHash:policy.checkpointHash,soloDisposableTest:true,originalBalance:999000,targetBalance:50000};
  const quote={depotEntity:30,depotOwner:20,roadConnected:true,carrier:'road',configHash:'b'.repeat(64),cost:10000,payer:20,vehicleCount:1,available:true};
  const result={commandSucceeded:true,newVehicle:true,vehicleEntity:40,vehicleOwner:20,depotEntity:30,configHash:quote.configHash,payer:20,originalBalance:999000,targetBalance:40000};
  const assignment={vehicleEntity:40,vehicleOwner:20,lineEntity:50,lineOwner:20,stopCount:2,routeReachable:true,carrier:'road'};
  const evidence={companyEntity:20,vehicleEntity:40,lineEntity:50,fromUpdate:100,toUpdate:300,visitedStops:[0,1],operatingExpense:20,revenue:100,expenseCompany:20,revenueCompany:20};
  return {policy,snapshot,quote,result,assignment,evidence};
}
test('bounded funding confirms an explicit amount and only the target balance changes',()=>{
  const f=fixture(),c=validateTestFunding(f.policy,f.snapshot,1000);
  assert.equal(verifyTestFunding(f.policy,f.snapshot,c,{commandSucceeded:true,payer:20,originalBalance:999000,targetBalance:51000}).outcome,'verified');
  for(const amount of [0,-1,100001,1.5,NaN,Infinity,'1000'])assert.throws(()=>validateTestFunding(f.policy,f.snapshot,amount));
  for(const change of [{payer:10},{originalBalance:998000},{targetBalance:50000},{commandSucceeded:false}])
    assert.throws(()=>verifyTestFunding(f.policy,f.snapshot,c,{commandSucceeded:true,payer:20,originalBalance:999000,targetBalance:51000,...change}),/OUTCOME_UNKNOWN/);
  assert.throws(()=>verifyTestFunding(f.policy,{...f.snapshot,targetBalance:50001},c,{}),/CONFIRMATION_CHANGED/);
});
test('purchase quote binds depot, configuration, company, price and checkpoint',()=>{
  const f=fixture(),c=validateVehicleQuote(f.policy,f.snapshot,f.quote);
  assert.equal(verifyVehiclePurchase(f.policy,f.snapshot,f.quote,c,f.result).vehicleEntity,40);
  for(const change of [{cost:9999},{configHash:'c'.repeat(64)},{depotEntity:31}])
    assert.throws(()=>revalidateVehicleConfirmation(f.policy,f.snapshot,{...f.quote,...change},c),/CONFIRMATION_CHANGED/);
});
test('unusable or foreign depot and invalid vehicle quote cannot be confirmed',()=>{
  const f=fixture();
  for(const change of [{depotOwner:10},{payer:10},{roadConnected:false},{carrier:'rail'},{vehicleCount:2},{available:false},
    {cost:0},{cost:20001},{configHash:'bad'},{cost:NaN},{script:'return true'}])
    assert.throws(()=>validateVehicleQuote(f.policy,f.snapshot,{...f.quote,...change}));
});
test('missing or insufficient balances, company sharing and changed saves fail closed',()=>{
  const f=fixture();
  for(const change of [{targetBalance:null},{targetBalance:9999},{originalBalance:Infinity},{checkpointHash:'c'.repeat(64)},
    {originalCompany:11},{targetCompany:21},{soloDisposableTest:false}])
    assert.throws(()=>validateVehicleQuote(f.policy,{...f.snapshot,...change},f.quote));
  assert.throws(()=>validateVehicleQuote({...f.policy,targetCompany:10},f.snapshot,f.quote));
});
test('purchase receipt requires a new target-owned vehicle and exact isolated spending',()=>{
  const f=fixture(),c=validateVehicleQuote(f.policy,f.snapshot,f.quote);
  for(const change of [{vehicleEntity:30},{vehicleEntity:20},{vehicleOwner:10},{payer:10},{depotEntity:31},
    {newVehicle:false},{commandSucceeded:false},{configHash:'c'.repeat(64)},{originalBalance:998999},{targetBalance:39999},
    {targetBalance:50000},{extra:true}])
    assert.throws(()=>verifyVehiclePurchase(f.policy,f.snapshot,f.quote,c,{...f.result,...change}),/OUTCOME_UNKNOWN/);
});
test('company-specific vehicle and line ownership must both match before assignment',()=>{
  const f=fixture();assert.equal(validateServiceAssignment(f.policy,f.assignment).lineEntity,50);
  for(const change of [{vehicleOwner:10},{lineOwner:10},{routeReachable:false},{stopCount:1},{carrier:'rail'},
    {lineEntity:40},{extra:true}])assert.throws(()=>validateServiceAssignment(f.policy,{...f.assignment,...change}));
});
test('service proof needs visited stops plus expenses and income attributable to this company',()=>{
  const f=fixture();assert.equal(verifyServiceOperation(f.policy,f.assignment,f.evidence).outcome,'verified');
  for(const change of [{expenseCompany:10},{revenueCompany:10},{companyEntity:10},{vehicleEntity:41},{lineEntity:51},
    {operatingExpense:0},{revenue:0},{revenue:null},{toUpdate:100},{visitedStops:[0,0]},{visitedStops:[0,2]},{extra:true}])
    assert.throws(()=>verifyServiceOperation(f.policy,f.assignment,{...f.evidence,...change}),/SERVICE_NOT_VERIFIED/);
});
