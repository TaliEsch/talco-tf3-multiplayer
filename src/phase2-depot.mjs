import {parseFlatDataFile} from './userdata-ipc.mjs';
import {verifyNativeDepotResult} from './native-depot-result.mjs';
const entity=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const finite=(n,max)=>Number.isFinite(n)&&Math.abs(n)<=max;
const balances=['originalBefore','originalAfter','targetBefore','targetAfter'];
const fields=['schemaVersion','kind','nonce','requestId','companyEntity','targetCompany','tickCount','updateCount',
  'outcome','code','resource','constructionEntity','depotEntity','constructionOwner','depotOwner',
  'constructionMembershipPreserved','depotMembershipPreserved','chargedCost',...balances.flatMap(n=>[n,n+'Negative'])];
export function depotRequest({nonce,requestId,sample,targetCompany,placement,confirmed}){
  if(confirmed!==true)throw new Error('EXPLICIT_DEPOT_CONSENT_REQUIRED');
  if(!/^[a-f0-9]{32}$/.test(nonce)||!entity(requestId)||!entity(sample?.companyEntity)
    ||!entity(targetCompany)||sample.companyEntity===targetCompany||sample.speedup!==0
    ||!Number.isSafeInteger(sample.tickCount)||sample.tickCount<0||sample.tickCount>2147483347)
    throw new Error('HELD_COMPANY_CONTEXT_REQUIRED');
  if(!placement||Object.keys(placement).sort().join(',')!=='resource,seed,x,y,yaw,z'
    ||typeof placement.resource!=='string'||! /^[A-Za-z0-9_.:/-]{1,256}$/.test(placement.resource)
    ||!placement.resource.endsWith('/road/road_depot/road_depot.con')
    ||!entity(placement.seed)||!finite(placement.x,100000)||!finite(placement.y,100000)
    ||!finite(placement.z,10000)||!finite(placement.yaw,Math.PI))throw new Error('INVALID_DEPOT_PLACEMENT');
  return Object.freeze({schemaVersion:1,kind:'phase2_depot',nonce,requestId,companyEntity:sample.companyEntity,
    targetCompany,...placement,confirmed:1,issuedTick:sample.tickCount,expiresTick:sample.tickCount+300});
}
export function parseDepotReceipt(source,request){
  // Only this field has a wider literal alphabet. The shared IPC parser remains
  // strict; no escapes, quotes, expressions or executable text are admitted.
  if(typeof source!=='string'||Buffer.byteLength(source)>4096)throw new Error('INVALID_DEPOT_RECEIPT');
  let resource=null,count=0;
  const normalized=source.replace(/\bresource\s*=\s*"([A-Za-z0-9_.:/-]{1,256})"\s*,/g,(_match,value)=>{
    resource=value;count++;return 'resource = "stock_road_depot",';
  });
  if(count!==1)throw new Error('INVALID_DEPOT_RESOURCE');
  const p=parseFlatDataFile(normalized);
  p.resource=resource;
  if(Object.keys(p).sort().join(',')!==[...fields].sort().join(',')||p.schemaVersion!==1
    ||p.kind!=='phase2_depot_receipt'||p.nonce!==request.nonce||p.requestId!==request.requestId
    ||p.companyEntity!==request.companyEntity||p.targetCompany!==request.targetCompany||p.resource!==request.resource
    ||!['verified','rejected','unknown'].includes(p.outcome)||typeof p.code!=='string'||!/^[A-Z0-9_]{1,64}$/.test(p.code)
    ||![p.tickCount,p.updateCount,p.constructionEntity,p.depotEntity,p.constructionOwner,p.depotOwner,p.chargedCost].every(n=>Number.isSafeInteger(n)&&n>=0)
    ||p.tickCount<request.issuedTick||![0,1].includes(p.constructionMembershipPreserved)||![0,1].includes(p.depotMembershipPreserved))
    throw new Error('INVALID_DEPOT_RECEIPT');
  const amounts={};
  for(const name of balances){
    if(!Number.isSafeInteger(p[name])||p[name]<0||![0,1].includes(p[name+'Negative'])
      ||(p[name]===0&&p[name+'Negative']!==0))throw new Error('INVALID_DEPOT_BALANCE');
    amounts[name]=p[name]*(p[name+'Negative']?-1:1);
  }
  if(p.outcome==='verified'){
    const binding={originalCompany:request.companyEntity,targetCompany:request.targetCompany,resource:request.resource,
      sessionId:request.nonce,actionId:request.requestId,consentId:`${request.nonce}-${request.requestId}`};
    const receipt={...binding,...amounts,outcome:p.outcome,code:p.code,constructionEntity:p.constructionEntity,depotEntity:p.depotEntity,
      constructionOwner:p.constructionOwner,depotOwner:p.depotOwner,chargedCost:p.chargedCost,
      constructionMembershipPreserved:p.constructionMembershipPreserved===1,depotMembershipPreserved:p.depotMembershipPreserved===1};
    if(p.tickCount>request.expiresTick||verifyNativeDepotResult(binding,
      {originalBalance:amounts.originalBefore,targetBalance:amounts.targetBefore},receipt).outcome!=='verified')
      throw new Error('UNVERIFIED_DEPOT_RESULT');
  }
  return Object.freeze({...p,balances:Object.freeze(amounts)});
}

export function serializeDepotRequest(request){
  const {x,y,z,yaw,seed,resource}=request;
  const checked=depotRequest({nonce:request.nonce,requestId:request.requestId,
    sample:{companyEntity:request.companyEntity,tickCount:request.issuedTick,speedup:0},
    targetCompany:request.targetCompany,placement:{x,y,z,yaw,seed,resource},confirmed:request.confirmed===1});
  if(Object.keys(request).length!==15||Object.entries(checked).some(([key,value])=>request[key]!==value))
    throw new Error('INVALID_DEPOT_REQUEST');
  // Checked values are finite bounded Lua numeric literals or escape-free ASCII.
  return `function data()\nreturn {\n${Object.entries(checked).map(([k,v])=>`  ${k} = ${JSON.stringify(v)},`).join('\n')}\n}\nend\n`;
}
