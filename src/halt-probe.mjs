import { performance } from "node:perf_hooks";
import { parseFlatDataFile } from "./userdata-ipc.mjs";
const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;

export function parseHaltReceipt(source,request) {
  const p=parseFlatDataFile(source);
  if(Object.keys(p).sort().join(",")!=="companyEntity,kind,nonce,outcome,requestId,schemaVersion,speedup,tickCount,updateCount"
    ||p.schemaVersion!==1||p.kind!=="halt_receipt"||p.nonce!==request.nonce||p.requestId!==request.requestId
    ||p.companyEntity!==request.companyEntity||![p.tickCount,p.updateCount,p.speedup].every(uint)
    ||!["halted","expired","context_changed","already_attempted","outcome_unknown"].includes(p.outcome)
    ||p.outcome==="halted"&&(p.speedup!==0||p.tickCount<request.issuedTick||p.tickCount>=request.expiresTick)) throw new TypeError("INVALID_HALT_RECEIPT");
  return p;
}

// Diagnostic fresh-event stop. Does not resume, retry, or claim a watchdog.
export function createHaltProbe({nonce,requestId,observe,publish,read,remove,logger,now=()=>performance.now(),timeoutMs=15000,stableMs=1500}) {
  if(!/^[a-f0-9]{32}$/.test(nonce)||!uint(requestId)||requestId<1
    ||![observe,publish,read,remove,logger,now].every(f=>typeof f==="function")
    ||!Number.isFinite(stableMs)||stableMs<1||!Number.isFinite(timeoutMs)||timeoutMs<=stableMs) throw new TypeError("INVALID_HALT_OPTIONS");
  let phase="idle",request=null,receipt=null,deadline=0,receivedAt=0,stableTick=null;
  function emit(event,code) {logger({level:phase==="unknown"?"warn":"info",event,code,
    ...(receipt?{heldUpdate:receipt.updateCount,tickCount:receipt.tickCount}:{}),gameplayVerified:false});}
  async function unknown(code) {
    if(phase==="unknown"||phase==="closed") return;
    phase="unknown"; emit("halt_test_unknown",code);
    await remove().catch(()=>{}); // Removal cannot recall already-delivered work.
  }
  return {
    get phase(){return phase;},
    get heldUpdate(){return phase==="confirmed"?receipt.updateCount:null;},
    async start(){
      if(phase!=="idle") throw new Error("HALT_ALREADY_USED");
      const o=observe(),s=o.sample;
      if(!o.available||!s||![s.companyEntity,s.tickCount,s.updateCount].every(uint)||!uint(s.tickCount+300)) throw new Error("HALT_OBSERVATION_REQUIRED");
      request={schemaVersion:1,kind:"halt_request",nonce,requestId,companyEntity:s.companyEntity,issuedTick:s.tickCount,expiresTick:s.tickCount+300};
      phase="awaiting_receipt"; deadline=now()+timeoutMs;
      emit("halt_test_started","STOP_REQUESTED_NOT_CONFIRMED");
      try{await publish(request);}catch{await unknown("DELIVERY_UNKNOWN_PAUSE_MANUALLY");}
    },
    async poll(){
      if(["idle","unknown","closed"].includes(phase)) return;
      if(phase!=="confirmed"&&now()>=deadline){await unknown("HALT_TIMEOUT_PAUSE_MANUALLY");return;}
      const o=observe(),s=o.sample;
      if(!o.available||!s||s.companyEntity!==request.companyEntity||!uint(s.tickCount)||!uint(s.updateCount)) {await unknown("OBSERVATION_LOST_PAUSE_MANUALLY");return;}
      if(s.tickCount<request.issuedTick){await unknown("CLOCK_RESET_PAUSE_MANUALLY");return;}
      if(phase==="awaiting_receipt") {
        if(now()>=deadline){await unknown("RECEIPT_TIMEOUT_PAUSE_MANUALLY");return;}
        let p;
        try{p=parseHaltReceipt(await read(),request);}catch{return;}
        if(p.outcome!=="halted"){await unknown(p.outcome);return;}
        receipt=p;phase="settling";receivedAt=now();
        emit("halt_test_receipt","WAITING_FOR_STABLE_OBSERVATIONS");
        await remove().catch(()=>{});
      }
      // Observations may lag behind the receipt briefly; never call that proof.
      if(s.tickCount<receipt.tickCount) {
        if(phase==="confirmed"||now()>=deadline) await unknown("OBSERVATION_BEHIND_HALT");
        return;
      }
      if(s.speedup!==0||s.updateCount!==receipt.updateCount){await unknown("HALT_LOST_PAUSE_MANUALLY");return;}
      if(stableTick===null){stableTick=s.tickCount;receivedAt=now();}
      if(phase==="settling"&&now()-receivedAt>=stableMs&&s.tickCount>stableTick) {
        phase="confirmed";emit("halt_test_confirmed","LOCAL_ENGINE_HALTED_MANUAL_RESUME_ONLY");
      } else if(phase==="settling"&&now()>=deadline) await unknown("HALT_STABILITY_TIMEOUT");
    },
    async close(){
      if(!["idle","unknown","closed"].includes(phase)) await unknown("MONITORING_ENDED_HALT_NOT_GUARANTEED");
      phase="closed";
    },
  };
}
