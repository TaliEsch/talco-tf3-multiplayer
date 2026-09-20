import test from 'node:test';
import assert from 'node:assert/strict';
import { createWatchdogProbe, parseWatchdogReceipt } from '../src/watchdog-probe.mjs';
const encode = p => `function data() return {${Object.entries(p).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`;
function fixture() {
  let time=0, request, receipt, available=true;
  const sample={companyEntity:3,tickCount:100,updateCount:80,speedup:1}, published=[], events=[];
  const probe=createWatchdogProbe({nonce:'a'.repeat(32),requestId:1,observe:()=>({available,sample}),now:()=>time,
    publish:async r=>{request=r;published.push(r);},read:async()=>encode(receipt??{}),remove:async()=>{},logger:e=>events.push(e),stableMs:10,timeoutMs:1000});
  return {probe,sample,published,events,setTime:t=>time=t,disconnect:()=>available=false,
    receipt(phase='active',overrides={}) {
      receipt={schemaVersion:1,kind:'watchdog_receipt',nonce:request.nonce,requestId:1,companyEntity:3,
        issuedTick:100,expiresTick:200,lastTick:phase==='active'?101:200,tickCount:phase==='active'?101:200,
        updateCount:phase==='active'?81:150,speedup:phase==='active'?1:0,phase,
        outcome:phase==='active'?'armed':'halted',reason:phase==='active'?'none':'expired',...overrides};
      return receipt;
    },get request(){return request;}};
}
test('watchdog arm publication is not execution; expiry requires stable fresh engine observations',async()=>{
  const f=fixture();await f.probe.start();assert.equal(f.probe.phase,'awaiting_arm');
  await f.probe.poll();assert.equal(f.probe.phase,'awaiting_arm');
  f.receipt();await f.probe.poll();assert.equal(f.probe.phase,'awaiting_expiry');
  f.receipt('stopped');await f.probe.poll();assert.equal(f.probe.phase,'settling');
  Object.assign(f.sample,{tickCount:201,updateCount:150,speedup:0});await f.probe.poll();
  f.setTime(20);f.sample.tickCount=202;await f.probe.poll();assert.equal(f.probe.phase,'confirmed');
  assert.equal(f.published.length,1);assert.equal(f.probe.heldUpdate,150);
  f.sample.speedup=1;await f.probe.poll();assert.equal(f.probe.phase,'unknown');
});
test('late or disconnected watchdog tests cannot certify a stop or renew',async()=>{
  for(const failure of ['late','disconnect']){
    const f=fixture();await f.probe.start();f.receipt('stopped');
    if(failure==='late')f.setTime(1000);else f.disconnect();
    await f.probe.poll();assert.equal(f.probe.phase,'unknown');
    f.setTime(0);await f.probe.poll();assert.equal(f.probe.phase,'unknown');assert.equal(f.published.length,1);
  }
});
test('watchdog receipt rejects wrong identity, premature expiry, unknown fields and false success',async()=>{
  const f=fixture();await f.probe.start();const good=f.receipt('stopped');
  assert.equal(parseWatchdogReceipt(encode(good),f.request).phase,'stopped');
  for(const patch of [{nonce:'b'.repeat(32)},{companyEntity:4},{requestId:2},{expiresTick:201},{tickCount:199},
    {speedup:1},{outcome:'armed'},{extra:1}]){
    assert.throws(()=>parseWatchdogReceipt(encode({...good,...patch}),f.request),/INVALID_WATCHDOG_RECEIPT/);
  }
});

test('watchdog handler exception is terminal unknown, never retried or certified by a late receipt',async()=>{
  const f=fixture();await f.probe.start();f.receipt();await f.probe.poll();
  f.receipt('stopping',{outcome:'handler_failed',speedup:1});await f.probe.poll();
  assert.equal(f.probe.phase,'unknown');
  assert.equal(f.events.at(-1).code,'ENGINE_STOP_HANDLER_FAILED');
  f.receipt('stopped');await f.probe.poll();
  assert.equal(f.probe.phase,'unknown');assert.equal(f.published.length,1);
});
