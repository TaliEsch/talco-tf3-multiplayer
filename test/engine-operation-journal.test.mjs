import test from "node:test";
import assert from "node:assert/strict";
import { EngineOperationJournal } from "../src/engine-operation-journal.mjs";
const nonce="a".repeat(32), checkpointHash="b".repeat(64);
const options={nonce,roundId:"round",checkpointHash,companies:new Map([["a",7],["b",8]]),issuedTick:100,expiresTick:400};
const request={schemaVersion:1,nonce,roundId:"round",operationId:"operation",sequence:1,originPlayerId:"a",companyEntity:7,entity:42,revision:12,scheduledUpdate:90,running:false};
const live={tickCount:101,updateCount:90,held:true,ownerCompanyEntity:7,revision:12};
const receipt={outcome:"applied",updateCount:90,ownerCompanyEntity:7,running:false,stateHash:"c".repeat(64)};
function fixture(extra={}){const writes=[];const j=new EngineOperationJournal({...options,persist:s=>writes.push(s),...extra});return {j,writes};}
test("pending barrier is persisted before execution permission; successful duplicate is cached only",()=>{
  const {j,writes}=fixture(); assert.equal(j.claim(request,live).execute,true);
  assert.equal(writes.at(-1).entries[0].outcome,"pending");
  j.complete(request.operationId,receipt,live);
  assert.deepEqual(j.claim(request,live),{execute:false,cached:true,receipt});
  assert.equal(j.snapshot.entries.length,1);
  assert.equal(j.claim({...request,operationId:"two",sequence:2},live).execute,true);
});
for(const extra of [{running:true},{operationId:"other"},{sequence:2}]) test(`conflicting duplicate cannot execute ${JSON.stringify(extra)}`,()=>{
  const {j}=fixture();j.claim(request,live);j.complete(request.operationId,receipt,live);
  assert.throws(()=>j.claim({...request,...extra},live),/CONFLICT/); assert.equal(j.phase,"recovery_required");
});
test("unknown/pending action never retries",()=>{
  const {j}=fixture();j.claim(request,live);
  assert.throws(()=>j.claim(request,live),/OUTCOME_UNKNOWN/);
  assert.throws(()=>j.claim({...request,operationId:"another",sequence:2},live),/FENCED/);
});
for(const extra of [{tickCount:99},{tickCount:400},{ownerCompanyEntity:8},{revision:13},{held:false},{updateCount:91}]) test(`live engine checks deny mutation ${JSON.stringify(extra)}`,()=>{
  const {j}=fixture();assert.throws(()=>j.claim(request,{...live,...extra}));assert.equal(j.snapshot.entries.length,0);
});
test("company identity binding is independent of claimed ownership",()=>{
  const {j}=fixture();assert.throws(()=>j.claim({...request,originPlayerId:"b"},live),/OWNERSHIP/);
});
test("completion requires actual held update, owner, running state and hash",()=>{
  for(const changes of [{outcome:"unknown"},{updateCount:91},{ownerCompanyEntity:8},{running:true},{stateHash:"bad"}]){
    const {j}=fixture();j.claim(request,live);assert.throws(()=>j.complete(request.operationId,{...receipt,...changes},live),/UNKNOWN/);
    assert.equal(j.snapshot.entries[0].outcome,"pending");
  }
});
test("save/reload always requires recovery, including completed journals",()=>{
  for(const completed of [false,true]){
    const {j}=fixture();j.claim(request,live);if(completed)j.complete(request.operationId,receipt,live);
    const restored=fixture({saved:j.snapshot}).j;
    assert.equal(restored.phase,"recovery_required");assert.throws(()=>restored.claim(request,live),/FENCED/);
  }
});
test("storage failure denies execution; asynchronous storage cannot certify a barrier",async()=>{
  let writes=0; const {j}=fixture({persist:()=>{if(++writes===2)throw new Error("disk");}});
  assert.throws(()=>j.claim(request,live),/PERSISTENCE_UNKNOWN/);assert.equal(j.phase,"recovery_required");
  assert.throws(()=>fixture({persist:()=>Promise.reject(new Error("late"))}),/ASYNC_PERSISTENCE_UNSUPPORTED/);
  await new Promise(r=>setImmediate(r));
});
test("journal capacity fences instead of evicting duplicate evidence",()=>{
  const {j}=fixture({maxOperations:1});j.claim(request,live);j.complete(request.operationId,receipt,live);
  assert.throws(()=>j.claim({...request,operationId:"two",sequence:2},live),/JOURNAL_LIMIT/);
  assert.equal(j.snapshot.entries.length,1);
});
test("external snapshots and saved receipts cannot mutate the live journal",()=>{
  const {j,writes}=fixture();j.claim(request,live);j.complete(request.operationId,receipt,live);
  j.snapshot.entries[0].outcome="pending"; writes.at(-1).entries.length=0;
  const duplicate=j.claim(request,live);duplicate.receipt.running=true;
  assert.equal(j.snapshot.entries[0].receipt.running,false);
});
test("persistence callbacks cannot reenter execution authorization",()=>{
  let j, nested=false;
  j=fixture({persist:()=>{if(j&&!nested){nested=true;j.claim(request,live);}}}).j;
  assert.throws(()=>j.claim(request,live),/REENTRANT/);
  assert.equal(j.phase,"recovery_required");
});
