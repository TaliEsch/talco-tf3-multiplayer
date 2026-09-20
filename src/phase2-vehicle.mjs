import {parseFlatDataFile} from './userdata-ipc.mjs';

const entity=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const money=n=>Number.isSafeInteger(n)&&Math.abs(n)<=9007199254740991;
const modelPath=v=>typeof v==='string'&&/^[A-Za-z0-9_.:/-]{1,256}$/.test(v)&&v.endsWith('.mdl');
const balances=['originalBefore','originalAfter','targetBefore','targetAfter'];
const requestFields=['schemaVersion','kind','nonce','requestId','companyEntity','targetCompany','depotEntity','model','confirmed','issuedTick','expiresTick'];
const receiptFields=['schemaVersion','kind','nonce','requestId','companyEntity','targetCompany','depotEntity','model',
  'tickCount','updateCount','outcome','code','vehicleEntity','vehicleOwner','depotOwner','chargedCost',
  ...balances.flatMap(name=>[name,name+'Negative'])];

export function vehicleRequest({nonce,requestId,sample,targetCompany,depotEntity,model,confirmed}){
  if(confirmed!==true)throw new Error('EXPLICIT_VEHICLE_CONSENT_REQUIRED');
  if(!/^[a-f0-9]{32}$/.test(nonce)||!entity(requestId)||!entity(sample?.companyEntity)
    ||!entity(targetCompany)||sample.companyEntity===targetCompany||sample.speedup!==0
    ||!Number.isSafeInteger(sample.tickCount)||sample.tickCount<0||sample.tickCount>2147483347)
    throw new Error('HELD_COMPANY_CONTEXT_REQUIRED');
  if(!entity(depotEntity)||!modelPath(model))throw new Error('INVALID_VEHICLE_INTENT');
  return Object.freeze({schemaVersion:1,kind:'phase2_vehicle',nonce,requestId,companyEntity:sample.companyEntity,
    targetCompany,depotEntity,model,confirmed:1,issuedTick:sample.tickCount,expiresTick:sample.tickCount+300});
}

export function serializeVehicleRequest(request){
  const checked=vehicleRequest({nonce:request?.nonce,requestId:request?.requestId,
    sample:{companyEntity:request?.companyEntity,tickCount:request?.issuedTick,speedup:0},
    targetCompany:request?.targetCompany,depotEntity:request?.depotEntity,model:request?.model,
    confirmed:request?.confirmed===1});
  if(!request||Object.keys(request).length!==requestFields.length
    ||Object.entries(checked).some(([key,value])=>request[key]!==value))throw new Error('INVALID_VEHICLE_REQUEST');
  const source=`function data()\nreturn {\n${Object.entries(checked).map(([key,value])=>`  ${key} = ${JSON.stringify(value)},`).join('\n')}\n}\nend\n`;
  if(Buffer.byteLength(source)>4096)throw new Error('INVALID_VEHICLE_REQUEST');
  return source;
}

export function parseVehicleReceipt(source,request){
  if(typeof source!=='string'||Buffer.byteLength(source)>4096)throw new Error('INVALID_VEHICLE_RECEIPT');
  let model=null,models=0;
  const normalized=source.replace(/\bmodel\s*=\s*"([A-Za-z0-9_.:/-]{1,256})"\s*,/g,(_match,value)=>{
    model=value;models++;return 'model = "stock_vehicle",';
  });
  if(models!==1||!modelPath(model))throw new Error('INVALID_VEHICLE_MODEL');
  const receipt=parseFlatDataFile(normalized);
  receipt.model=model;
  if(Object.keys(receipt).sort().join(',')!==[...receiptFields].sort().join(',')
    ||receipt.schemaVersion!==1||receipt.kind!=='phase2_vehicle_receipt'
    ||receipt.nonce!==request?.nonce||receipt.requestId!==request?.requestId
    ||receipt.companyEntity!==request?.companyEntity||receipt.targetCompany!==request?.targetCompany
    ||receipt.depotEntity!==request?.depotEntity||receipt.model!==request?.model
    ||!['verified','rejected','unknown'].includes(receipt.outcome)
    ||typeof receipt.code!=='string'||!/^[A-Z0-9_]{1,64}$/.test(receipt.code)
    ||![receipt.tickCount,receipt.updateCount,receipt.vehicleEntity,receipt.vehicleOwner,receipt.depotOwner]
      .every(n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647)
    ||!money(receipt.chargedCost)||receipt.chargedCost<0
    ||receipt.tickCount<request.issuedTick)throw new Error('INVALID_VEHICLE_RECEIPT');
  const amounts={};
  for(const name of balances){
    if(!money(receipt[name])||receipt[name]<0||![0,1].includes(receipt[name+'Negative'])
      ||(receipt[name]===0&&receipt[name+'Negative']!==0))throw new Error('INVALID_VEHICLE_BALANCE');
    amounts[name]=receipt[name]*(receipt[name+'Negative']?-1:1);
  }
  if(receipt.outcome==='verified'){
    const debit=amounts.targetBefore-amounts.targetAfter;
    if(receipt.tickCount>request.expiresTick||receipt.code!=='NATIVE_VEHICLE_ACCOUNTING_VERIFIED'
      ||!entity(receipt.vehicleEntity)||receipt.vehicleOwner!==request.targetCompany||receipt.depotOwner!==request.targetCompany
      ||new Set([request.companyEntity,request.targetCompany,request.depotEntity,receipt.vehicleEntity]).size!==4
      ||!money(receipt.chargedCost)||receipt.chargedCost<=0||amounts.originalAfter!==amounts.originalBefore
      ||amounts.targetAfter<0||debit<=0||debit!==receipt.chargedCost)throw new Error('UNVERIFIED_VEHICLE_RESULT');
  }
  return Object.freeze({...receipt,balances:Object.freeze(amounts)});
}
