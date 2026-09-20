import { performance } from 'node:perf_hooks';
import { parseFlatDataFile } from './userdata-ipc.mjs';
const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const fields = 'companyEntity,expiresTick,issuedTick,kind,lastTick,nonce,outcome,phase,reason,requestId,schemaVersion,speedup,tickCount,updateCount';
export function parseWatchdogReceipt(source, request) {
  const p = parseFlatDataFile(source);
  if (Object.keys(p).sort().join(',') !== fields || p.schemaVersion !== 1 || p.kind !== 'watchdog_receipt'
    || p.nonce !== request.nonce || p.requestId !== request.requestId || p.companyEntity !== request.companyEntity
    || p.issuedTick !== request.issuedTick || p.expiresTick !== request.expiresTick
    || ![p.lastTick,p.tickCount,p.updateCount,p.speedup].every(uint)
    || !(p.phase === 'active' && p.outcome === (request.phase === 'renew' ? 'renewed' : 'armed') && p.reason === 'none' && p.tickCount >= p.issuedTick && p.tickCount < p.expiresTick
      || p.phase === 'stopping' && ['outcome_unknown','handler_failed'].includes(p.outcome) && ['expired','clock_reset','context_changed'].includes(p.reason)
      || p.phase === 'stopped' && p.outcome === 'halted' && p.speedup === 0 && ['expired','clock_reset','context_changed'].includes(p.reason))
    || p.reason === 'expired' && p.tickCount < p.expiresTick) throw new TypeError('INVALID_WATCHDOG_RECEIPT');
  return p;
}

// Deliberately publish ONE arm, never renew. Tests autonomous engine expiry;
// does not claim the general coordinator heartbeat/lease integration is complete.
export function createWatchdogProbe({ nonce, requestId, observe, publish, read, remove, logger,
  now = () => performance.now(), timeoutMs = 45000, stableMs = 1500 }) {
  if (!/^[a-f0-9]{32}$/.test(nonce) || !uint(requestId) || requestId < 1
    || ![observe,publish,read,remove,logger,now].every(f => typeof f === 'function')
    || !Number.isFinite(stableMs) || stableMs < 1 || !Number.isFinite(timeoutMs) || timeoutMs <= stableMs) throw new TypeError('INVALID_WATCHDOG_OPTIONS');
  let phase = 'idle', request, receipt, deadline, stableTick, stableAt;
  const emit = (event,code) => logger({level:phase === 'unknown' ? 'warn' : 'info',event,code,
    ...(receipt ? {heldUpdate:receipt.updateCount,tickCount:receipt.tickCount} : {}),gameplayVerified:false});
  async function unknown(code) {
    if (['unknown','closed'].includes(phase)) return;
    phase = 'unknown'; emit('watchdog_test_unknown',code); await remove().catch(() => {});
  }
  return {
    get phase() { return phase; },
    get heldUpdate() { return phase === 'confirmed' ? receipt.updateCount : null; },
    async start() {
      if (phase !== 'idle') throw new Error('WATCHDOG_ALREADY_USED');
      const o = observe(), s = o.sample;
      if (!o.available || !s || s.speedup !== 1 || ![s.companyEntity,s.tickCount,s.updateCount,s.tickCount+100].every(uint)) throw new Error('RUNNING_OBSERVATION_REQUIRED');
      request = {schemaVersion:1,kind:'watchdog_request',nonce,requestId,companyEntity:s.companyEntity,phase:'arm',issuedTick:s.tickCount,expiresTick:s.tickCount+100};
      phase = 'awaiting_arm'; deadline = now()+timeoutMs;
      emit('watchdog_test_started','ENGINE_EXPIRY_TEST_NO_RENEWAL');
      try { await publish(request); } catch { await unknown('DELIVERY_UNKNOWN_PAUSE_MANUALLY'); }
    },
    async poll() {
      if (['idle','unknown','closed'].includes(phase)) return;
      if (phase !== 'confirmed' && now() >= deadline) { await unknown('WATCHDOG_TIMEOUT_PAUSE_MANUALLY'); return; }
      const o=observe(), s=o.sample;
      if (!o.available || !s || s.companyEntity !== request.companyEntity || ![s.tickCount,s.updateCount].every(uint)
        || s.tickCount < request.issuedTick) { await unknown('OBSERVATION_LOST_PAUSE_MANUALLY'); return; }
      if (['awaiting_arm','awaiting_expiry'].includes(phase)) {
        let p; try { p=parseWatchdogReceipt(await read(),request); } catch { return; }
        if (now() >= deadline) { await unknown('WATCHDOG_TIMEOUT_PAUSE_MANUALLY'); return; }
        if (p.phase === 'active') {
          if (phase === 'awaiting_arm') { phase='awaiting_expiry'; emit('watchdog_test_armed','WAITING_FOR_ENGINE_EXPIRY'); await remove().catch(() => {}); }
          return;
        }
        if (p.phase !== 'stopped' || p.reason !== 'expired') { await unknown(p.outcome === 'handler_failed' ? 'ENGINE_STOP_HANDLER_FAILED' : 'ENGINE_STOP_NOT_VERIFIED'); return; }
        receipt=p; phase='settling'; emit('watchdog_test_expired','WAITING_FOR_STABLE_STOP');
        await remove().catch(() => {});
      }
      if (s.tickCount < receipt.tickCount) {
        if (phase === 'confirmed') await unknown('OBSERVATION_REGRESSED');
        return;
      }
      if (s.speedup !== 0 || s.updateCount !== receipt.updateCount) { await unknown('STOP_LOST_PAUSE_MANUALLY'); return; }
      if (stableTick === undefined) { stableTick=s.tickCount; stableAt=now(); }
      if (phase === 'settling' && now()-stableAt >= stableMs && s.tickCount > stableTick) {
        phase='confirmed'; emit('watchdog_test_confirmed','LOCAL_ENGINE_EXPIRY_STOP_CONFIRMED');
      }
    },
    async close() {
      if (!['idle','unknown','closed'].includes(phase)) await unknown('MONITORING_ENDED_STOP_NOT_GUARANTEED');
      phase='closed';
    },
  };
}
