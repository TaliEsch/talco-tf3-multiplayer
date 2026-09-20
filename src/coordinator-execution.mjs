import { sha256Canonical } from './canonical.mjs';

const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const identity = s => typeof s === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const common = ['schemaVersion','nonce','roundId','operationId','operation','status','updateCount','held'];
const fields = [...common,'snapshotVersion','hostSequence','entity','ownerCompanyEntity','stopFlag','balance','negative'];

// Hash actual post-action observations, never an expected hash supplied with an
// intent. This deliberately describes selected state, not the whole simulation.
export function decodeExecutionReceipt(p) {
  if (!p || typeof p !== 'object' || Object.keys(p).sort().join(',') !== [...fields].sort().join(',')
    || typeof p.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(p.nonce)
    || !identity(p.roundId) || !identity(p.operationId)) throw new Error('INVALID_EXECUTION_FIELDS');
  if (p.schemaVersion !== 1 || p.operation !== 'executeHeld' || p.status !== 'ok'
    || p.held !== true || p.snapshotVersion !== 1 || !uint(p.updateCount)
    || !uint(p.hostSequence) || p.hostSequence === 0 || !uint(p.entity) || !uint(p.ownerCompanyEntity)
    || ![0,1].includes(p.stopFlag) || ![0,1].includes(p.negative)
    || !Number.isSafeInteger(p.balance) || p.balance < 0 || Object.is(p.balance,-0)
    || p.balance === 0 && p.negative !== 0) throw new Error('INVALID_EXECUTION_SNAPSHOT');
  const state = {
    schemaVersion:1, scope:'held_vehicle_company_balance_v1',
    updateCount:p.updateCount, speedup:0, hostSequence:p.hostSequence,
    vehicle:{entity:p.entity,ownerCompanyEntity:p.ownerCompanyEntity,stopped:p.stopFlag === 1},
    company:{companyEntity:p.ownerCompanyEntity,balance:p.negative ? -p.balance : p.balance},
  };
  return {state,receipt:{...Object.fromEntries(common.map(k=>[k,p[k]])),
    ownerCompanyEntity:p.ownerCompanyEntity,stateHash:sha256Canonical(state)}};
}
