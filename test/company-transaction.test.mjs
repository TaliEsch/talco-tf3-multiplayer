import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {CompanyTransaction} from '../src/company-transaction.mjs';
import {sha256Canonical} from '../src/canonical.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(t,timeoutMs=1000){
  const directory=await mkdtemp(path.join(os.tmpdir(),'tf3mp-transaction-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const runner=new CompanyTransaction({directory,timeoutMs});
  const confirmation={amount:1000,company:2};
  const input={checkpointHash:'a'.repeat(64),targetCompany:2,action:'fund',confirmation,
    confirmedHash:sha256Canonical(confirmation),prepare:async()=>({confirmation,context:{}}),
    apply:async()=>({}),verify:async()=>({outcome:'verified'})};
  return {directory,runner,input};
}
test('confirmed operation is durably consumed, including after helper restart',async t=>{
  const {directory,runner,input}=await fixture(t);
  assert.equal((await runner.execute(input)).outcome,'verified');
  await assert.rejects(new CompanyTransaction({directory}).execute(input),/ALREADY_CONSUMED/);
});

test('road-stop replay shares durable company barriers and cannot replay a different capture after uncertainty',async t=>{
  const {directory,runner,input}=await fixture(t);
  const confirmation={caseDigest:'b'.repeat(64),company:2};
  let submissions=0;
  const replay={...input,action:'replay_road_stop',confirmation,
    confirmedHash:sha256Canonical(confirmation),prepare:async()=>({confirmation,context:{}}),
    apply:async()=>{submissions++;throw new Error('receipt lost');}};
  assert.equal((await runner.execute(replay)).outcome,'unknown');
  const restarted=new CompanyTransaction({directory});
  const changed={...confirmation,caseDigest:'c'.repeat(64)};
  await assert.rejects(restarted.execute({...replay,confirmation:changed,confirmedHash:sha256Canonical(changed)}),/ALREADY_CONSUMED/);
  await assert.rejects(restarted.execute(input),/BUSY_OR_UNKNOWN/);
  assert.equal(submissions,1);
});

test('road-stop replay requires explicit confirmation and fresh preparation before submission',async t=>{
  const {runner,input}=await fixture(t);let submissions=0;
  const replay={...input,action:'replay_road_stop',apply:async()=>{submissions++;return {};}};
  await assert.rejects(runner.execute({...replay,confirmedHash:''}),/EXPLICIT_CONFIRMATION/);
  const result=await runner.execute({...replay,prepare:async()=>{throw new Error('baseline road changed');}});
  assert.equal(result.outcome,'rejected');assert.equal(submissions,0);
});
test('missing confirmation never prepares or consumes',async t=>{
  const {directory,runner,input}=await fixture(t);
  input.confirmedHash='';input.prepare=()=>assert.fail('must not prepare');
  await assert.rejects(runner.execute(input),/EXPLICIT_CONFIRMATION/);
  assert.deepEqual(await readdir(directory),[]);
});

test('lossy confirmation values cannot be silently normalized into consent',async t=>{
  const {runner,input,directory}=await fixture(t);
  for(const confirmation of [{amount:NaN},{amount:1000,company:undefined},new Date(0)]){
    await assert.rejects(runner.execute({...input,confirmation,confirmedHash:sha256Canonical(JSON.parse(JSON.stringify(confirmation)))}));
  }
  assert.deepEqual(await readdir(directory),[]);
});
test('fresh quote change prevents mutation',async t=>{
  const {runner,input}=await fixture(t);
  input.prepare=async()=>({confirmation:{amount:1001,company:2}});
  input.apply=()=>assert.fail('must not apply');
  assert.equal((await runner.execute(input)).code,'CONFIRMATION_CHANGED');
});
test('concurrent confirmations can submit only once',async t=>{
  const {runner,input}=await fixture(t);let calls=0;
  input.apply=async()=>{calls++;await delay(10);return {};};
  const results=await Promise.allSettled([runner.execute(input),runner.execute(input)]);
  assert.equal(calls,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
});
test('timeout during preparation cannot submit a late mutation',async t=>{
  const {runner,input}=await fixture(t,10);let calls=0;
  input.prepare=async()=>{await delay(50);return {confirmation:input.confirmation};};
  input.apply=()=>{calls++;};
  assert.equal((await runner.execute(input)).outcome,'unknown');
  await delay(60);assert.equal(calls,0);
});
test('late engine success cannot replace unknown result or permit retry',async t=>{
  const {runner,input,directory}=await fixture(t,10);
  input.apply=async()=>{await delay(50);return {};};
  assert.equal((await runner.execute(input)).outcome,'unknown');
  await delay(60);
  const file=(await readdir(directory)).find(f=>f.endsWith('.result.json'));
  assert.equal(JSON.parse(await readFile(path.join(directory,file),'utf8')).outcome,'unknown');
  await assert.rejects(runner.execute(input),/ALREADY_CONSUMED/);
});
test('engine exceptions and unverified receipts remain unknown',async t=>{
  const {runner,input}=await fixture(t);
  input.apply=async()=>{throw new Error('secret payload');};
  assert.deepEqual(await runner.execute(input),{outcome:'unknown',code:'ENGINE_OUTCOME_UNKNOWN'});
  const other=await fixture(t);
  other.input.action='buy_vehicle';other.input.apply=async()=>({});other.input.verify=async()=>({outcome:'submitted'});
  assert.equal((await other.runner.execute(other.input)).outcome,'unknown');
});

test('unknown result blocks different actions after helper restart',async t=>{
  const {runner,input,directory}=await fixture(t);
  input.apply=async()=>{throw new Error('unknown engine work');};
  assert.equal((await runner.execute(input)).outcome,'unknown');
  input.action='buy_vehicle';input.apply=()=>assert.fail('must not mutate');
  await assert.rejects(new CompanyTransaction({directory}).execute(input),/BUSY_OR_UNKNOWN/);
});

test('different company actions cannot overlap',async t=>{
  const {runner,input}=await fixture(t);
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;});
  const held=new Promise(resolve=>{release=resolve;});
  input.apply=async()=>{entered();await held;return {};};
  const first=runner.execute(input);
  await started;
  try{
    await assert.rejects(runner.execute({...input,action:'build_depot',apply:()=>assert.fail('must not run')}),/BUSY_OR_UNKNOWN/);
  }finally{release();}
  assert.equal((await first).outcome,'verified');
});

test('verified stage releases company barrier for the next distinct stage',async t=>{
  const {runner,input}=await fixture(t);
  assert.equal((await runner.execute(input)).outcome,'verified');
  assert.equal((await runner.execute({...input,action:'build_depot'})).outcome,'verified');
});
