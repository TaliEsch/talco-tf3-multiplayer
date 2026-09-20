import { sha256Canonical } from './canonical.mjs';
const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;

// Local engine receipt -> adapter receipt. This is a selected company/clock
// snapshot, NOT a save-file hash or proof of whole-world equivalence.
export function decodeCheckpointReceipt(p) {
  if(!p||typeof p!=='object'||!/^[a-f0-9]{32}$/.test(p.nonce??'')
    ||![p.roundId,p.operationId].every(v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(v))) throw new Error('INVALID_CHECKPOINT_IDENTITY');
  const common=['schemaVersion','nonce','roundId','operationId','operation','status','updateCount','held'];
  if(p.schemaVersion!==1||p.operation!=='holdCheckpoint'||p.status!=='ok'||p.held!==true||!uint(p.updateCount)
    ||p.snapshotVersion!==1||!Number.isInteger(p.companyCount)||p.companyCount<2||p.companyCount>4) throw new Error('INVALID_CHECKPOINT_SNAPSHOT');
  const keys=[...common,'snapshotVersion','companyCount'];
  const companies=[];
  for(let i=1;i<=p.companyCount;i++) {
    keys.push(`company${i}`,`balance${i}`,`negative${i}`);
    if(!uint(p[`company${i}`])||!Number.isSafeInteger(p[`balance${i}`])||p[`balance${i}`]<0
      ||![0,1].includes(p[`negative${i}`])||p[`balance${i}`]===0&&p[`negative${i}`]!==0) throw new Error('INVALID_CHECKPOINT_COMPANY');
    companies.push({companyEntity:p[`company${i}`],balance:p[`negative${i}`]?-p[`balance${i}`]:p[`balance${i}`]});
  }
  if(Object.keys(p).sort().join(',')!==keys.sort().join(',')||new Set(companies.map(c=>c.companyEntity)).size!==companies.length) throw new Error('INVALID_CHECKPOINT_FIELDS');
  companies.sort((a,b)=>a.companyEntity-b.companyEntity);
  const state={schemaVersion:1,scope:'held_company_balances_v1',updateCount:p.updateCount,speedup:0,companies};
  return {state,receipt:{...Object.fromEntries(common.map(k=>[k,p[k]])),checkpointHash:sha256Canonical(state)}};
}
