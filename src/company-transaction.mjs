import {mkdir, open, unlink} from 'node:fs/promises';
import path from 'node:path';
import {sha256Canonical} from './canonical.mjs';

// Local diagnostic transaction boundary, not a network endpoint. The eventual
// engine adapter must independently persist its own consume-before-command latch.
// A durable claim deliberately survives failure/crash: never infer non-execution
// from an absent receipt, nor delete a claim to make a retry possible.
export class CompanyTransaction {
  #directory;
  #timeout;
  constructor({directory, timeoutMs=15000}) {
    if (!path.isAbsolute(directory) || !Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>120000)
      throw new Error('INVALID_TRANSACTION_OPTIONS');
    this.#directory=directory;
    this.#timeout=timeoutMs;
  }

  async execute({checkpointHash, targetCompany, action, confirmation, confirmedHash, prepare, apply, verify}) {
    if (!/^[a-f0-9]{64}$/.test(checkpointHash) || !Number.isSafeInteger(targetCompany) || targetCompany<=0
      || targetCompany>2147483647 || !['fund','build_depot','buy_vehicle','create_line','assign_service'].includes(action)
      || !confirmation || typeof confirmation!=='object' || Array.isArray(confirmation)
      || [prepare,apply,verify].some(f=>typeof f!=='function')) throw new Error('INVALID_TRANSACTION');
    // Copy before any await: callers cannot change what was visibly confirmed.
    // Refuse lossy JSON coercion (NaN -> null, omitted undefined, toJSON edits).
    const suppliedHash=sha256Canonical(confirmation);
    const approved=JSON.parse(JSON.stringify(confirmation));
    const confirmationHash=sha256Canonical(approved);
    if (suppliedHash!==confirmationHash||confirmedHash!==confirmationHash) throw new Error('EXPLICIT_CONFIRMATION_REQUIRED');
    const key=sha256Canonical({checkpointHash,targetCompany,action});
    await mkdir(this.#directory,{recursive:true});
    let claim;
    try {claim=await open(path.join(this.#directory,`${key}.claim.json`),'wx');}
    catch(error) {if(error.code==='EEXIST')throw new Error('TRANSACTION_ALREADY_CONSUMED');throw error;}
    try {
      await claim.writeFile(JSON.stringify({schemaVersion:1,checkpointHash,targetCompany,action,confirmationHash}));
      await claim.sync();
    } finally {await claim.close();}

    // Serialize different actions too: a purchase must not race funding/building.
    // Unknown execution or a helper crash deliberately retains this barrier,
    // blocking every later mutation for this company/checkpoint after restart.
    const sessionKey=sha256Canonical({checkpointHash,targetCompany});
    const barrierPath=path.join(this.#directory,`${sessionKey}.active.json`);
    let barrier;
    try {barrier=await open(barrierPath,'wx');}
    catch(error){if(error.code==='EEXIST')throw new Error('COMPANY_TRANSACTION_BUSY_OR_UNKNOWN');throw error;}
    try {await barrier.writeFile(JSON.stringify({schemaVersion:1,key,checkpointHash,targetCompany,action}));await barrier.sync();}
    finally {await barrier.close();}

    let timer;
    let active=true;
    const timeout=new Promise(resolve=>{timer=setTimeout(()=>{active=false;resolve({outcome:'unknown',code:'TRANSACTION_TIMEOUT'});},this.#timeout);});
    const work=(async()=>{
      let submitted=false;
      try {
        // prepare must perform fresh engine inspection and return the identical
        // confirmation plus adapter-owned execution context. It may not mutate.
        const fresh=await prepare(approved);
        if(!active)return {outcome:'unknown',code:'TRANSACTION_TIMEOUT'};
        if(sha256Canonical(fresh?.confirmation)!==confirmationHash)
          return {outcome:'rejected',code:'CONFIRMATION_CHANGED'};
        submitted=true;
        const receipt=await apply(fresh.context);
        if(!active)return {outcome:'unknown',code:'TRANSACTION_TIMEOUT'};
        const evidence=await verify(receipt,fresh.context);
        if(!active)return {outcome:'unknown',code:'TRANSACTION_TIMEOUT'};
        if(evidence?.outcome!=='verified')throw new Error('UNVERIFIED_RECEIPT');
        return {outcome:'verified',evidence};
      } catch {
        // Do not persist arbitrary exception messages (payloads/secrets).
        return {outcome:submitted?'unknown':'rejected',code:submitted?'ENGINE_OUTCOME_UNKNOWN':'PREPARATION_FAILED'};
      }
    })();
    const result=await Promise.race([work,timeout]);
    active=false;
    clearTimeout(timer);
    // Late completion cannot change the terminal record. Storage failure is
    // unknown to the caller even if the engine may have completed successfully.
    const record=await open(path.join(this.#directory,`${key}.result.json`),'wx');
    try {await record.writeFile(JSON.stringify({schemaVersion:1,key,...result}));await record.sync();}
    finally {await record.close();}
    // Never remove the barrier before the terminal evidence is durably recorded.
    // No automatic cleanup for unknown results, even if a late callback succeeds.
    if(result.outcome!=='unknown')await unlink(barrierPath);
    return result;
  }
}
