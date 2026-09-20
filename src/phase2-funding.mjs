import {parseFlatDataFile} from './userdata-ipc.mjs';
const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const entity=n=>uint(n)&&n>0;
const fields=['schemaVersion','kind','nonce','requestId','companyEntity','targetCompany','amount','tickCount','updateCount','outcome',
  'originalBefore','originalBeforeNegative','originalAfter','originalAfterNegative',
  'targetBefore','targetBeforeNegative','targetAfter','targetAfterNegative'];

// Local guided-test boundary, not a remotely callable gameplay request.
export function fundingRequest({nonce,requestId,sample,targetCompany,amount,confirmed}) {
  if(confirmed!==true||!Number.isSafeInteger(amount)||amount<1||amount>1000000)
    throw new Error('EXPLICIT_BOUNDED_FUNDING_REQUIRED');
  if(!/^[a-f0-9]{32}$/.test(nonce)||!entity(requestId)||!entity(sample?.companyEntity)
    ||!entity(targetCompany)||targetCompany===sample.companyEntity||!uint(sample.tickCount)
    ||sample.tickCount>2147483347||sample.speedup!==0)throw new Error('HELD_COMPANY_CONTEXT_REQUIRED');
  return Object.freeze({schemaVersion:1,kind:'phase2_funding',nonce,requestId,
    companyEntity:sample.companyEntity,targetCompany,amount,confirmed:1,
    issuedTick:sample.tickCount,expiresTick:sample.tickCount+300});
}
export function parseFundingReceipt(source,request) {
  const p=parseFlatDataFile(source);
  if(Object.keys(p).sort().join(',')!==[...fields].sort().join(',')||p.schemaVersion!==1
    ||p.kind!=='phase2_funding_receipt'||p.nonce!==request.nonce||p.requestId!==request.requestId
    ||p.companyEntity!==request.companyEntity||p.targetCompany!==request.targetCompany||p.amount!==request.amount
    ||!uint(p.tickCount)||!uint(p.updateCount)||p.tickCount<request.issuedTick
    ||!['funded','rejected','already_attempted','outcome_unknown'].includes(p.outcome))
    throw new Error('INVALID_FUNDING_RECEIPT');
  const balances={};
  for(const name of ['originalBefore','originalAfter','targetBefore','targetAfter']){
    if(!Number.isSafeInteger(p[name])||p[name]<0||![0,1].includes(p[name+'Negative'])
      ||(p[name]===0&&p[name+'Negative']!==0))throw new Error('INVALID_FUNDING_BALANCE');
    balances[name]=p[name]*(p[name+'Negative']?-1:1);
  }
  if(p.outcome==='funded'&&(p.tickCount>request.expiresTick
    ||!Number.isSafeInteger(balances.targetBefore+p.amount)
    ||balances.targetAfter!==balances.targetBefore+p.amount
    ||balances.originalBefore!==balances.originalAfter))throw new Error('UNVERIFIED_FUNDING');
  return Object.freeze({...p,balances:Object.freeze(balances)});
}
