import {parseFlatDataFile} from './userdata-ipc.mjs';

const entity=value=>Number.isSafeInteger(value)&&value>=1&&value<=2147483647;
const keys=['schemaVersion','kind','nonce','requestId','outcome','tickCount','updateCount',
  'companyCount','hostCompany','companyA','companyB','companyC','companyD'];

export function validateCompanyRoster(companies){
  if(!Array.isArray(companies)||companies.length<2||companies.length>4
    ||companies.some(value=>!entity(value))||new Set(companies).size!==companies.length)
    throw new TypeError('INVALID_COMPANY_ROSTER');
  return Object.freeze([...companies]);
}

export function parseRosterInspection(source,{nonce,requestId,companies,issuedUpdate}){
  const expected=validateCompanyRoster(companies);
  const p=parseFlatDataFile(source);
  if(Object.keys(p).sort().join(',')!==[...keys].sort().join(',')
    ||p.schemaVersion!==1||p.kind!=='roster_inspection'||p.nonce!==nonce
    ||!/^[0-9a-f]{32}$/.test(p.nonce)||p.requestId!==requestId
    ||!Number.isSafeInteger(requestId)||requestId<1
    ||!Number.isSafeInteger(issuedUpdate)||issuedUpdate<0
    ||!Number.isSafeInteger(p.tickCount)||p.tickCount<0
    ||p.updateCount!==issuedUpdate||p.companyCount!==expected.length
    ||p.hostCompany!==expected[0]
    ||!['verified','company_changed','not_paused','clock_changed','company_missing','read_failed'].includes(p.outcome))
    throw new TypeError('INVALID_ROSTER_INSPECTION');
  for(const [index,key] of ['companyA','companyB','companyC','companyD'].entries())
    if(p[key]!== (expected[index]??0))throw new TypeError('ROSTER_INSPECTION_MISMATCH');
  return Object.freeze({outcome:p.outcome,companies:expected,hostCompanyEntity:p.hostCompany,
    tickCount:p.tickCount,updateCount:p.updateCount,requestId:p.requestId});
}
