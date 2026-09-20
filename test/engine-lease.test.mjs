import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngineLease} from '../src/engine-lease.mjs';
const encode=p=>`function data() return {${Object.entries(p).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`;
function fixture(publishOverride) {
  let time=0,health=true,available=true;
  const requests=[],failures=[],s={companyEntity:3,tickCount:100,updateCount:80,speedup:1};
  const lease=createEngineLease({nonce:'a'.repeat(32),publish:r=>{requests.push(r);return publishOverride?.(r);},
    observe:()=>({available,sample:s}),healthy:()=>health,onFailure:r=>failures.push(r),now:()=>time});
  function receipt(request=requests.at(-1),overrides={}) {
    return encode({schemaVersion:1,kind:'watchdog_receipt',nonce:request.nonce,requestId:request.requestId,
      companyEntity:request.companyEntity,issuedTick:request.issuedTick,expiresTick:request.expiresTick,
      lastTick:s.tickCount,tickCount:s.tickCount,updateCount:s.updateCount,speedup:s.speedup,
      phase:'active',outcome:request.phase==='arm'?'armed':'renewed',reason:'none',...overrides});
  }
  return {lease,requests,failures,s,receipt,time:t=>time=t,loseHealth:()=>health=false,disconnect:()=>available=false};
}
test('lease requires engine receipts and renews during paused simulation with advancing engine ticks',()=>{
  const f=fixture();f.lease.start();assert.equal(f.lease.active,false);
  assert.equal(f.lease.receive(f.receipt()),true);assert.equal(f.lease.confirmedExpiry,200);
  Object.assign(f.s,{tickCount:140,speedup:0});f.lease.poll();
  assert.equal(f.requests.at(-1).phase,'renew');assert.equal(f.lease.confirmedExpiry,200);
  assert.equal(f.lease.active,true);
  assert.equal(f.lease.receive(f.receipt()),true);assert.equal(f.lease.confirmedExpiry,240);
  for(let tick=180;tick<=260;tick+=40){f.s.tickCount=tick;f.lease.poll();assert.equal(f.lease.receive(f.receipt()),true);}
  assert.equal(f.requests.length,5);assert.equal(f.failures.length,0);
});
test('pending renewal never extends confirmed expiry or accepts a stale arm acknowledgment',()=>{
  const f=fixture();f.lease.start();const old=f.receipt();f.lease.receive(old);
  f.s.tickCount=140;f.lease.poll();assert.equal(f.lease.receive(old),false);
  assert.equal(f.lease.receive(f.receipt(undefined,{outcome:'armed'})),false);
  f.s.tickCount=200;f.lease.poll();assert.equal(f.lease.phase,'failed');
  assert.equal(f.lease.receive(f.receipt()),false);assert.equal(f.requests.length,2);
});
for(const mode of ['disconnect','health','stale','clock_reset','company','timeout','stopped'])test(`lease terminally stops renewal on ${mode}`,()=>{
  const f=fixture();f.lease.start();f.lease.receive(f.receipt());
  if(mode==='disconnect')f.disconnect();
  if(mode==='health')f.loseHealth();
  if(mode==='stale')f.time(3000);
  if(mode==='clock_reset')f.s.tickCount=99;
  if(mode==='company')f.s.companyEntity=4;
  if(mode==='timeout'){f.s.tickCount=140;f.lease.poll();f.time(3000);f.s.tickCount=141;}
  if(mode==='stopped')f.lease.receive(f.receipt(undefined,{phase:'stopping',outcome:'outcome_unknown',reason:'context_changed'}));
  f.lease.poll();assert.equal(f.lease.phase,'failed');const count=f.requests.length;
  f.s.tickCount=180;f.lease.poll();assert.equal(f.requests.length,count);assert.equal(f.failures.length,1);
  assert.throws(()=>f.lease.start(),/ALREADY_USED/);
});
test('unknown publication is not retried and late rejection cannot reopen a closed lease',async()=>{
  let reject;
  const f=fixture(()=>new Promise((_,r)=>reject=r));f.lease.start();f.lease.close();reject(new Error('lost'));
  await Promise.resolve();assert.equal(f.lease.phase,'closed');assert.equal(f.requests.length,1);
  const g=fixture(()=>{throw new Error('lost');});g.lease.start();
  assert.equal(g.lease.phase,'failed');g.lease.poll();assert.equal(g.requests.length,1);
});
