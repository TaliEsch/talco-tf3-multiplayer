import { parseFlatDataFile } from "./userdata-ipc.mjs";
import { sha256Canonical } from "./canonical.mjs";
const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const fields="balance,balanceNegative,companyEntity,entity,heldUpdate,kind,nonce,outcome,ownerCompanyEntity,requestId,revision,schemaVersion,speedup,stopFlag,tickCount,updateCount";
export function parseHeldSnapshot(source, request) {
  const p=parseFlatDataFile(source);
  if(Object.keys(p).sort().join(",")!==fields || p.schemaVersion!==1 || p.kind!=="held_snapshot"
    || p.nonce!==request.nonce || !/^[a-f0-9]{32}$/.test(p.nonce) || p.requestId!==request.requestId
    || p.companyEntity!==request.companyEntity || p.entity!==request.entity || p.heldUpdate!==request.heldUpdate
    || ![p.requestId,p.companyEntity,p.entity,p.heldUpdate,p.ownerCompanyEntity,p.revision,p.speedup,p.tickCount,p.updateCount].every(uint)
    || !Number.isSafeInteger(p.balance) || p.balance<0 || ![0,1].includes(p.balanceNegative) || ![0,1].includes(p.stopFlag)
    || !["captured","hold_lost","expired","not_owner","unavailable","read_failed"].includes(p.outcome)) throw new Error("INVALID_HELD_SNAPSHOT");
  if(p.outcome!=="captured") throw new Error("SNAPSHOT_"+p.outcome.toUpperCase());
  if(p.speedup!==0 || p.updateCount!==request.heldUpdate || p.ownerCompanyEntity!==request.companyEntity
    || p.tickCount<request.issuedTick || p.tickCount>request.expiresTick) throw new Error("SNAPSHOT_POSTCONDITION_FAILED");
  // Deliberately selected-state scope, NOT whole-simulation determinism. Local
  // receipt identity, paused wall-clock ticks and revision are not state hashes.
  const state={schemaVersion:1,scope:"held_vehicle_company_v1",updateCount:p.updateCount,speedup:0,
    company:{entity:p.companyEntity,balance:p.balanceNegative ? -p.balance : p.balance},
    vehicle:{entity:p.entity,ownerCompanyEntity:p.ownerCompanyEntity,running:p.stopFlag===0}};
  return {receipt:p,state,hash:sha256Canonical(state)};
}

export function createHeldSnapshotProbe({nonce,entity,companyEntity,heldUpdate,stopFlag,firstRequestId,observe,publish,read,remove,logger,complete,now=Date.now}) {
  let phase="idle", request, first, deadline=0;
  const requestNext=async id => {
    const s=observe();
    if(!s.available || s.sample.speedup!==0 || s.sample.updateCount!==heldUpdate || s.sample.companyEntity!==companyEntity
      || !uint(s.sample.tickCount+300)) throw new Error("SNAPSHOT_HOLD_LOST");
    request={schemaVersion:1,kind:"snapshot_request",nonce,requestId:id,entity,companyEntity,heldUpdate,issuedTick:s.sample.tickCount,expiresTick:s.sample.tickCount+300};
    deadline=now()+15000; await publish(request);
  };
  async function fail(code) {
    phase="failed"; await remove(); logger({level:"warn",event:"held_snapshot_failed",code,gameplayVerified:false});
  }
  return {
    get phase(){return phase;},
    async start(){
      if(phase!=="idle") throw new Error("SNAPSHOT_ALREADY_USED");
      if(![entity,companyEntity,heldUpdate,firstRequestId,firstRequestId+1].every(uint) || firstRequestId<1 || ![0,1].includes(stopFlag)) throw new Error("INVALID_SNAPSHOT_OPTIONS");
      phase="first";
      try {await requestNext(firstRequestId); logger({level:"info",event:"held_snapshot_started",heldUpdate,gameplayVerified:false});}
      catch {await fail("SNAPSHOT_START_FAILED");}
    },
    async poll(){
      if(!["first","second"].includes(phase)) return;
      const sample=observe();
      if(!sample.available || sample.sample.speedup!==0 || sample.sample.updateCount!==heldUpdate || sample.sample.companyEntity!==companyEntity) {await fail("SNAPSHOT_HOLD_LOST"); return;}
      if(now()>=deadline) {await fail("SNAPSHOT_TIMEOUT"); return;}
      let source;
      try {source=await read();} catch {return;}
      let envelope;
      try {envelope=parseFlatDataFile(source);} catch {return;}
      if(envelope.nonce!==nonce || envelope.requestId!==request.requestId) return;
      let snapshot;
      try {snapshot=parseHeldSnapshot(source,request);} catch {await fail("SNAPSHOT_REJECTED"); return;}
      if(snapshot.receipt.stopFlag!==stopFlag) {await fail("SNAPSHOT_VEHICLE_STATE_MISMATCH"); return;}
      if(phase==="first") {
        first=snapshot; phase="second";
        try {await requestNext(firstRequestId+1);} catch {await fail("SNAPSHOT_SECOND_REQUEST_FAILED");}
      } else {
        if(snapshot.receipt.tickCount<=first.receipt.tickCount) return;
        if(snapshot.hash!==first.hash) {await fail("SNAPSHOT_CHANGED_WHILE_HELD"); return;}
        phase="passed"; await remove();
        logger({level:"info",event:"held_snapshot_verified",code:"SELECTED_STATE_ONLY",hash:snapshot.hash,heldUpdate,gameplayVerified:false});
        await complete(snapshot);
      }
    },
    async close(){phase="closed"; await remove();},
  };
}
