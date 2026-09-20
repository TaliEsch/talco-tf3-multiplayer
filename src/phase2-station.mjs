import {parseFlatDataFile} from './userdata-ipc.mjs';

const entity=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const amount=n=>Number.isSafeInteger(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
const finite=(n,max)=>Number.isFinite(n)&&Math.abs(n)<=max;
const resourcePath=value=>typeof value==='string'&&/^[A-Za-z0-9_.:/-]{1,256}$/.test(value)
  &&value.endsWith('/street/modular_street_station/modular_terminal.con');
const balances=['originalBefore','originalAfter','targetBefore','targetAfter'];
const requestFields=['schemaVersion','kind','nonce','requestId','companyEntity','targetCompany','slot','resource',
  'x','y','z','yaw','seed','confirmed','issuedTick','expiresTick'];
const receiptFields=['schemaVersion','kind','nonce','requestId','companyEntity','targetCompany','slot','resource',
  'tickCount','updateCount','outcome','code','constructionEntity','stationEntity','constructionOwner','stationOwner',
  'constructionMembershipPreserved','stationMembershipPreserved','chargedCost',
  ...balances.flatMap(name=>[name,name+'Negative'])];

export function stationRequest({nonce,requestId,sample,targetCompany,slot,placement,confirmed}){
  if(confirmed!==true)throw new Error('EXPLICIT_STATION_CONSENT_REQUIRED');
  if(!/^[a-f0-9]{32}$/.test(nonce)||!entity(requestId)||!entity(sample?.companyEntity)
    ||!entity(targetCompany)||sample.companyEntity===targetCompany||sample.speedup!==0
    ||!Number.isSafeInteger(sample.tickCount)||sample.tickCount<0||sample.tickCount>2147483347)
    throw new Error('HELD_COMPANY_CONTEXT_REQUIRED');
  if(![1,2].includes(slot)||!placement||Object.keys(placement).sort().join(',')!=='resource,seed,x,y,yaw,z'
    ||!resourcePath(placement.resource)||!entity(placement.seed)||!finite(placement.x,100000)
    ||!finite(placement.y,100000)||!finite(placement.z,10000)||!finite(placement.yaw,Math.PI))
    throw new Error('INVALID_STATION_PLACEMENT');
  return Object.freeze({schemaVersion:1,kind:'phase2_station',nonce,requestId,companyEntity:sample.companyEntity,
    targetCompany,slot,...placement,confirmed:1,issuedTick:sample.tickCount,expiresTick:sample.tickCount+300});
}

export function serializeStationRequest(request){
  const checked=stationRequest({nonce:request?.nonce,requestId:request?.requestId,
    sample:{companyEntity:request?.companyEntity,tickCount:request?.issuedTick,speedup:0},
    targetCompany:request?.targetCompany,slot:request?.slot,
    placement:{resource:request?.resource,x:request?.x,y:request?.y,z:request?.z,yaw:request?.yaw,seed:request?.seed},
    confirmed:request?.confirmed===1});
  if(!request||Object.keys(request).length!==requestFields.length
    ||Object.entries(checked).some(([key,value])=>request[key]!==value))throw new Error('INVALID_STATION_REQUEST');
  const source=`function data()\nreturn {\n${Object.entries(checked).map(([key,value])=>`  ${key} = ${JSON.stringify(value)},`).join('\n')}\n}\nend\n`;
  if(Buffer.byteLength(source)>4096)throw new Error('INVALID_STATION_REQUEST');
  return source;
}

export function parseStationReceipt(source,request){
  if(typeof source!=='string'||Buffer.byteLength(source)>4096)throw new Error('INVALID_STATION_RECEIPT');
  let resource=null,resources=0;
  const normalized=source.replace(/\bresource\s*=\s*"([A-Za-z0-9_.:/-]{1,256})"\s*,/g,(_match,value)=>{
    resource=value;resources++;return 'resource = "stock_station",';
  });
  if(resources!==1||!resourcePath(resource))throw new Error('INVALID_STATION_RESOURCE');
  const receipt=parseFlatDataFile(normalized);
  receipt.resource=resource;
  if(Object.keys(receipt).sort().join(',')!==[...receiptFields].sort().join(',')
    ||receipt.schemaVersion!==1||receipt.kind!=='phase2_station_receipt'
    ||receipt.nonce!==request?.nonce||receipt.requestId!==request?.requestId
    ||receipt.companyEntity!==request?.companyEntity||receipt.targetCompany!==request?.targetCompany
    ||receipt.slot!==request?.slot||receipt.resource!==request?.resource
    ||!['verified','rejected','unknown'].includes(receipt.outcome)
    ||typeof receipt.code!=='string'||!/^[A-Z0-9_]{1,64}$/.test(receipt.code)
    ||![receipt.tickCount,receipt.updateCount,receipt.constructionEntity,receipt.stationEntity,
      receipt.constructionOwner,receipt.stationOwner].every(n=>amount(n)&&n<=2147483647)
    ||!amount(receipt.chargedCost)
    ||receipt.tickCount<request.issuedTick
    ||![0,1].includes(receipt.constructionMembershipPreserved)||![0,1].includes(receipt.stationMembershipPreserved))
    throw new Error('INVALID_STATION_RECEIPT');
  const amounts={};
  for(const name of balances){
    if(!amount(receipt[name])||![0,1].includes(receipt[name+'Negative'])
      ||(receipt[name]===0&&receipt[name+'Negative']!==0))throw new Error('INVALID_STATION_BALANCE');
    amounts[name]=receipt[name]*(receipt[name+'Negative']?-1:1);
  }
  if(receipt.outcome==='verified'){
    const debit=amounts.targetBefore-amounts.targetAfter;
    if(receipt.tickCount>request.expiresTick||receipt.code!=='NATIVE_STATION_ACCOUNTING_VERIFIED'
      ||!entity(receipt.constructionEntity)||!entity(receipt.stationEntity)
      ||receipt.constructionOwner!==request.targetCompany||receipt.stationOwner!==request.targetCompany
      ||new Set([request.companyEntity,request.targetCompany,receipt.constructionEntity,receipt.stationEntity]).size!==4
      ||receipt.constructionMembershipPreserved!==1||receipt.stationMembershipPreserved!==1
      ||receipt.chargedCost<=0||amounts.originalAfter!==amounts.originalBefore
      ||amounts.targetAfter<0||debit<=0||debit!==receipt.chargedCost)throw new Error('UNVERIFIED_STATION_RESULT');
  }
  return Object.freeze({...receipt,balances:Object.freeze(amounts)});
}
