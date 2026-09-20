import { sha256Canonical } from "./canonical.mjs";
const uint=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const ident=s=>typeof s==="string"&&/^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const hash=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
const exact=(p,keys)=>p&&typeof p==="object"&&!Array.isArray(p)&&Object.keys(p).sort().join(",")===keys.split(",").sort().join(",");
const error=code=>Object.assign(new Error(code),{code});

// Engine-adapter contract implementation, not wired into TF3 yet. Persistence
// must be synchronous engine state storage. A file write promise is not enough.
// This stores decisions/receipts only; it never stores executable callbacks.
export class EngineOperationJournal {
  #state; #persist; #bindings; #busy=false; #writing=false;
  constructor({nonce,roundId,checkpointHash,companies,issuedTick,expiresTick,persist,maxOperations=256,saved=null}) {
    if(!/^[a-f0-9]{32}$/.test(nonce??"")||!ident(roundId)||!hash(checkpointHash)||!(companies instanceof Map)
      ||companies.size<2||companies.size>4||[...companies].some(([id,c])=>!ident(id)||!uint(c))||new Set(companies.values()).size!==companies.size
      ||!uint(issuedTick)||!uint(expiresTick)||expiresTick<=issuedTick||expiresTick-issuedTick>1800
      ||typeof persist!=="function"||!Number.isInteger(maxOperations)||maxOperations<1||maxOperations>1024) throw error("INVALID_ENGINE_SESSION");
    this.#persist=persist; this.#bindings=new Map(companies);
    if(saved!==null) {
      if(!exact(saved,"schemaVersion,nonce,roundId,checkpointHash,issuedTick,expiresTick,lastTick,lastUpdate,phase,nextSequence,maxOperations,entries")
        ||saved.schemaVersion!==1||saved.nonce!==nonce||saved.roundId!==roundId||saved.checkpointHash!==checkpointHash
        ||!Array.isArray(saved.entries)||saved.entries.length>1024) throw error("INVALID_SAVED_JOURNAL");
      // A reload is never permission to resume a consumed or pending operation.
      this.#state=structuredClone(saved); this.#state.phase="recovery_required"; this.#write(); return;
    }
    this.#state={schemaVersion:1,nonce,roundId,checkpointHash,issuedTick,expiresTick,lastTick:issuedTick,lastUpdate:0,
      phase:"active",nextSequence:1,maxOperations,entries:[]};
    this.#write();
  }
  get phase(){return this.#state.phase;}
  get snapshot(){return structuredClone(this.#state);}
  #write(){
    if(this.#writing){this.#state.phase="recovery_required";throw error("REENTRANT_ENGINE_PERSISTENCE");}
    this.#writing=true;
    try {
      const result=this.#persist(this.snapshot);
      if(result&&typeof result.then==="function") {Promise.resolve(result).catch(()=>{}); throw error("ASYNC_PERSISTENCE_UNSUPPORTED");}
    } catch(e) {this.#state.phase="recovery_required"; throw error(e.code??"JOURNAL_PERSISTENCE_UNKNOWN");}
    finally {this.#writing=false;}
  }
  #fail(code){
    this.#state.phase="recovery_required";
    try{this.#write();}catch{} // Never turn a failed persistence attempt into permission.
    throw error(code);
  }
  #clock(live){
    if(this.phase!=="active") throw error("ENGINE_SESSION_FENCED");
    if(!exact(live,"tickCount,updateCount,held,ownerCompanyEntity,revision")||!uint(live.tickCount)||!uint(live.updateCount)
      ||typeof live.held!=="boolean"||!uint(live.ownerCompanyEntity)||!uint(live.revision)) this.#fail("INVALID_ENGINE_EVIDENCE");
    if(live.tickCount<this.#state.lastTick||live.updateCount<this.#state.lastUpdate) this.#fail("ENGINE_CLOCK_RESET");
    if(live.tickCount>=this.#state.expiresTick) this.#fail("ENGINE_LEASE_EXPIRED");
    this.#state.lastTick=live.tickCount; this.#state.lastUpdate=live.updateCount;
  }
  claim(request,live){
    if(this.#busy||this.#writing) this.#fail("REENTRANT_ENGINE_CLAIM");
    this.#busy=true;
    try{
      this.#clock(live);
      if(!exact(request,"schemaVersion,nonce,roundId,operationId,sequence,originPlayerId,companyEntity,entity,revision,scheduledUpdate,running")
        ||request.schemaVersion!==1||request.nonce!==this.#state.nonce||request.roundId!==this.#state.roundId
        ||!ident(request.operationId)||!ident(request.originPlayerId)||![request.sequence,request.companyEntity,request.entity,request.revision,request.scheduledUpdate].every(uint)
        ||request.sequence<1||typeof request.running!=="boolean") this.#fail("INVALID_ENGINE_OPERATION");
      const fingerprint=sha256Canonical(request);
      const prior=this.#state.entries.find(e=>e.operationId===request.operationId||e.sequence===request.sequence);
      if(prior){
        if(prior.fingerprint!==fingerprint||prior.operationId!==request.operationId||prior.sequence!==request.sequence) this.#fail("ENGINE_OPERATION_CONFLICT");
        if(prior.outcome!=="applied") this.#fail("ENGINE_OUTCOME_UNKNOWN");
        // Cached evidence is labelled as such, never a fresh action or clock read.
        return {execute:false,cached:true,receipt:structuredClone(prior.receipt)};
      }
      if(request.sequence!==this.#state.nextSequence||this.#state.entries.some(e=>e.outcome==="pending")) this.#fail("ENGINE_SEQUENCE_OR_PENDING");
      if(this.#bindings.get(request.originPlayerId)!==request.companyEntity||live.ownerCompanyEntity!==request.companyEntity
        ||live.revision!==request.revision) this.#fail("ENGINE_OWNERSHIP_CHANGED");
      if(!live.held||live.updateCount!==request.scheduledUpdate) this.#fail("ENGINE_HOLD_MISMATCH");
      if(this.#state.entries.length>=this.#state.maxOperations) this.#fail("ENGINE_JOURNAL_LIMIT");
      this.#state.entries.push({operationId:request.operationId,sequence:request.sequence,fingerprint,outcome:"pending",receipt:null,
        companyEntity:request.companyEntity,entity:request.entity,scheduledUpdate:request.scheduledUpdate,running:request.running});
      this.#state.nextSequence++;
      this.#write(); // MUST finish before caller may touch the engine.
      if(this.phase!=="active") throw error("ENGINE_SESSION_FENCED");
      return {execute:true,cached:false,operationId:request.operationId};
    } finally {this.#busy=false;}
  }
  complete(operationId,receipt,live){
    if(this.#busy||this.#writing) this.#fail("REENTRANT_ENGINE_COMPLETION");
    this.#clock(live);
    const entry=this.#state.entries.find(e=>e.operationId===operationId);
    if(!entry||entry.outcome!=="pending") this.#fail("UNEXPECTED_ENGINE_COMPLETION");
    if(!exact(receipt,"outcome,updateCount,ownerCompanyEntity,running,stateHash")||receipt.outcome!=="applied"
      ||receipt.updateCount!==entry.scheduledUpdate||receipt.ownerCompanyEntity!==entry.companyEntity||receipt.running!==entry.running
      ||!hash(receipt.stateHash)||!live.held||live.updateCount!==entry.scheduledUpdate||live.ownerCompanyEntity!==entry.companyEntity) this.#fail("ENGINE_OUTCOME_UNKNOWN");
    entry.receipt=structuredClone(receipt); entry.outcome="applied"; this.#write();
    return structuredClone(entry.receipt);
  }
  fence(){
    if(this.phase!=="active") return;
    this.#state.phase="recovery_required"; this.#write();
    // Fencing permissions is not evidence that the simulation stopped.
  }
}
