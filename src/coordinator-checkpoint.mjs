import { sha256Canonical } from './canonical.mjs';
const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const domains=['townsGrowth','economy','topology','vehicles','companies','linesServices','rngHiddenState'];
const publicDomains=domains.filter(domain=>domain!=='rngHiddenState');
const unavailable=new Set(['unavailable','unsupported','read_failed']);

// Local engine receipt -> adapter receipt. This is a selected company/clock
// snapshot, NOT a save-file hash or proof of whole-world equivalence.
export function decodeCheckpointReceipt(p) {
  if(!p||typeof p!=='object'||!/^[a-f0-9]{32}$/.test(p.nonce??'')
    ||![p.roundId,p.operationId].every(v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(v))) throw new Error('INVALID_CHECKPOINT_IDENTITY');
  const common=['schemaVersion','nonce','roundId','operationId','operation','status','updateCount','held'];
  if(p.schemaVersion!==1||p.operation!=='holdCheckpoint'||p.status!=='ok'||p.held!==true||!uint(p.updateCount)
    ||![1,2].includes(p.snapshotVersion)||!Number.isInteger(p.companyCount)||p.companyCount<2||p.companyCount>4) throw new Error('INVALID_CHECKPOINT_SNAPSHOT');
  const keys=[...common,'snapshotVersion','companyCount'];
  const companies=[];
  for(let i=1;i<=p.companyCount;i++) {
    keys.push(`company${i}`,`balance${i}`,`negative${i}`);
    if(!uint(p[`company${i}`])||!Number.isSafeInteger(p[`balance${i}`])||p[`balance${i}`]<0
      ||![0,1].includes(p[`negative${i}`])||p[`balance${i}`]===0&&p[`negative${i}`]!==0) throw new Error('INVALID_CHECKPOINT_COMPANY');
    companies.push({companyEntity:p[`company${i}`],balance:p[`negative${i}`]?-p[`balance${i}`]:p[`balance${i}`]});
  }
  const coverage={};
  if(p.snapshotVersion===2)for(const domain of domains) {
      const status=p[`${domain}Status`],digest=p[`${domain}Hash`];
      keys.push(`${domain}Status`,`${domain}Hash`);
      if(status==='observed'&&hash(digest))coverage[domain]={availability:'observed',digest};
      else if(unavailable.has(status)&&digest===status)coverage[domain]={availability:status};
      else throw new Error('INVALID_CHECKPOINT_COVERAGE');
    }
  if(Object.keys(p).sort().join(',')!==keys.sort().join(',')||new Set(companies.map(c=>c.companyEntity)).size!==companies.length) throw new Error('INVALID_CHECKPOINT_FIELDS');
  companies.sort((a,b)=>a.companyEntity-b.companyEntity);
  const complete=p.snapshotVersion===2&&Object.values(coverage).every(value=>value.availability==='observed');
  // TF3 build 40379 exposes no public RNG-state reader. A checkpoint is still
  // meaningful for comparison when every public world domain is observed and
  // that one blind spot is represented explicitly (never as read_failed).
  const comparisonReady=p.snapshotVersion===2
    &&publicDomains.every(domain=>coverage[domain].availability==='observed')
    &&['observed','unavailable'].includes(coverage.rngHiddenState.availability);
  const state=p.snapshotVersion===1
    ?{schemaVersion:1,scope:'held_company_balances_v1',updateCount:p.updateCount,speedup:0,companies}
    :{schemaVersion:2,scope:'held_canonical_world_v2',updateCount:p.updateCount,speedup:0,companies,domains:coverage};
  return {state,coverage:{complete,comparisonReady,unavailable:p.snapshotVersion===1?[...domains]:domains.filter(domain=>coverage[domain].availability!=='observed')},
    receipt:{...Object.fromEntries(common.map(k=>[k,p[k]])),checkpointHash:sha256Canonical(state)}};
}
