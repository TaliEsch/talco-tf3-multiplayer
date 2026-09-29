import { performance } from 'node:perf_hooks';
import { parseWatchdogReceipt } from './watchdog-probe.mjs';

const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;

// Receipt-driven lease lifetime. The caller must supply fresh engine observations
// and session health, not socket existence. Losing either is terminal. Stopping
// renewal is NOT a claim that TF3 has stopped; require separate halt evidence.
export function createEngineLease({nonce,publish,observe,healthy,onFailure,
  allowHeldArm=false,now=()=>performance.now(),ackTimeoutMs=3000,staleMs=3000}) {
  if(typeof nonce!=='string'||!/^[a-f0-9]{32}$/.test(nonce)
    ||![publish,observe,healthy,onFailure,now].every(f=>typeof f==='function')
    ||typeof allowHeldArm!=='boolean'
    ||![ackTimeoutMs,staleMs].every(n=>Number.isFinite(n)&&n>0)) throw new TypeError('INVALID_LEASE_OPTIONS');
  let phase='idle',request,confirmed,deadline,lastTick,lastCounter,lastUpdate,lastSpeed,freshAt,company;
  function fail(reason) {
    if(phase==='failed'||phase==='closed') return;
    phase='failed';onFailure(reason);
  }
  function sample() {
    if(healthy()!==true) {fail('SESSION_UNHEALTHY');return;}
    const observation=observe(),s=observation?.sample;
    if(!observation?.available||!s||![s.companyEntity,s.counter,s.tickCount,s.updateCount,s.speedup].every(uint)
      ||!uint(s.tickCount+100)||company!==undefined&&s.companyEntity!==company
      ||lastTick!==undefined&&(s.counter<lastCounter||s.tickCount<lastTick||s.updateCount<lastUpdate
        ||s.tickCount===lastTick&&(s.updateCount!==lastUpdate||s.speedup!==lastSpeed))) {
      fail('ENGINE_OBSERVATION_LOST');return;
    }
    // A held TF3 world can keep its engine tick fixed while the game-side
    // observation producer continues publishing fresh, monotonic samples.
    if(lastCounter===undefined||s.tickCount>lastTick
      ||s.speedup===0&&s.counter>lastCounter) freshAt=now();
    if(now()-freshAt>=staleMs) {fail('ENGINE_OBSERVATION_STALE');return;}
    lastCounter=s.counter;lastTick=s.tickCount;lastUpdate=s.updateCount;lastSpeed=s.speedup;
    return s;
  }
  function issue(s,operation) {
    const requestId=(request?.requestId??0)+1;
    if(!uint(requestId)) {fail('LEASE_SEQUENCE_EXHAUSTED');return;}
    request={schemaVersion:1,kind:'watchdog_request',nonce,requestId,companyEntity:s.companyEntity,
      phase:operation,issuedTick:s.tickCount,expiresTick:s.tickCount+100};
    phase='awaiting_receipt';deadline=now()+ackTimeoutMs;
    try {Promise.resolve(publish({...request})).catch(()=>fail('LEASE_PUBLICATION_UNKNOWN'));}
    catch {fail('LEASE_PUBLICATION_UNKNOWN');}
  }
  function validateLifetime(s) {
    // A pending renewal does not extend the last engine-confirmed expiry.
    if(s.tickCount >= (confirmed?.expiresTick??request.expiresTick)) {fail('LEASE_EXPIRED');return false;}
    if(phase==='awaiting_receipt'&&now()>=deadline) {fail('LEASE_ACK_TIMEOUT');return false;}
    return true;
  }
  return {
    get phase(){return phase;},
    // A renewal in flight does not erase the still-live confirmed lease. poll/
    // receive retain the old expiry until a matching new acknowledgment arrives.
    get active(){return confirmed!==undefined&&['active','awaiting_receipt'].includes(phase);},
    get confirmedExpiry(){return confirmed?.expiresTick??null;},
    start() {
      if(phase!=='idle') throw new Error('LEASE_ALREADY_USED');
      const s=sample();if(!s)return;
      if(s.speedup!==1&&!(allowHeldArm&&s.speedup===0)){fail('RUNNING_ENGINE_REQUIRED');return;}
      company=s.companyEntity;issue(s,s.speedup===0?'arm_held':'arm');
    },
    poll() {
      if(!['active','awaiting_receipt'].includes(phase))return;
      const s=sample();if(!s||!validateLifetime(s))return;
      if(phase==='active'&&s.tickCount>=confirmed.issuedTick+40)issue(s,'renew');
    },
    receive(source) {
      if(!['active','awaiting_receipt'].includes(phase))return false;
      const s=sample();if(!s||!validateLifetime(s))return false;
      let receipt;
      try {receipt=parseWatchdogReceipt(source,request);} catch {return false;}
      if(receipt.phase!=='active'){fail('ENGINE_LEASE_STOPPED_OR_UNKNOWN');return false;}
      if(receipt.tickCount>s.tickCount)return false; // Wait for corroborating fresh observation.
      if(phase!=='awaiting_receipt')return false;
      confirmed={...request};phase='active';return true;
    },
    close(){phase='closed';},
  };
}
