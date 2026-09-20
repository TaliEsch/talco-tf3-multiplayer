import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHaltProbe,parseHaltReceipt } from "../src/halt-probe.mjs";
const nonce="a".repeat(32);
const lua=p=>`function data() return {${Object.entries(p).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join("")} } end`;
function fixture(){
  let time=0,source="";const writes=[],events=[];
  const observation={available:true,sample:{companyEntity:7,tickCount:100,updateCount:50,speedup:1}};
  const p=createHaltProbe({nonce,requestId:1,observe:()=>observation,publish:async r=>writes.push(r),
    read:async()=>source,remove:async()=>{},logger:e=>events.push(e),now:()=>time,timeoutMs:5000,stableMs:100});
  return {p,writes,events,observation,setTime:t=>time=t,
    respond:(extra={})=>source=lua({schemaVersion:1,kind:"halt_receipt",nonce,requestId:1,companyEntity:7,tickCount:101,updateCount:51,speedup:0,outcome:"halted",...extra}),
    async confirm(){await p.start();this.respond();Object.assign(observation.sample,{tickCount:102,updateCount:51,speedup:0});await p.poll();time=101;observation.sample.tickCount=103;await p.poll();}};
}
test("halt requires receipt plus later advancing ticks at a stable paused update",async()=>{
  const f=fixture();await f.p.start();assert.equal(f.p.phase,"awaiting_receipt");
  f.respond();Object.assign(f.observation.sample,{tickCount:102,updateCount:51,speedup:0});await f.p.poll();
  f.setTime(101);await f.p.poll();assert.equal(f.p.phase,"settling");
  f.observation.sample.tickCount=103;await f.p.poll();assert.equal(f.p.phase,"confirmed");assert.equal(f.p.heldUpdate,51);
  assert.equal(f.writes.length,1);assert.throws(()=>parseHaltReceipt(lua({}),f.writes[0]));
});
for(const changes of [{speedup:1},{updateCount:52},{companyEntity:8}]) test(`halt confirmation revoked by ${JSON.stringify(changes)}`,async()=>{
  const f=fixture();await f.confirm();Object.assign(f.observation.sample,changes);await f.p.poll();
  assert.equal(f.p.phase,"unknown");assert.equal(f.p.heldUpdate,null);assert.equal(f.writes.length,1);
  await assert.rejects(f.p.start(),/ALREADY_USED/);
});
test("stale observation or closed monitor never implies continued engine safety",async()=>{
  const f=fixture();await f.confirm();f.observation.available=false;await f.p.poll();assert.equal(f.p.phase,"unknown");
  const g=fixture();await g.confirm();await g.p.close();assert.equal(g.p.heldUpdate,null);assert.equal(g.events.at(-1).event,"halt_test_unknown");
});
test("missing receipt times out once without retry and ignores late success",async()=>{
  const f=fixture();await f.p.start();f.setTime(5000);await f.p.poll();assert.equal(f.p.phase,"unknown");
  f.respond();await f.p.poll();assert.equal(f.p.phase,"unknown");assert.equal(f.writes.length,1);
});
test("late stable observations cannot confirm a timed-out halt",async()=>{
  const f=fixture();await f.p.start();f.respond();
  Object.assign(f.observation.sample,{tickCount:102,updateCount:51,speedup:0});await f.p.poll();
  f.setTime(5000);f.observation.sample.tickCount=103;await f.p.poll();
  assert.equal(f.p.phase,"unknown");assert.equal(f.events.some(e=>e.event==="halt_test_confirmed"),false);
});
test("publication failure consumes the stop attempt without retry",async()=>{
  let attempts=0;
  const p=createHaltProbe({nonce,requestId:1,observe:()=>({available:true,sample:{companyEntity:7,tickCount:100,updateCount:50}}),
    publish:async()=>{attempts++;throw new Error("write failed");},read:async()=>"",remove:async()=>{},logger:()=>{}});
  await p.start();assert.equal(p.phase,"unknown");await assert.rejects(p.start(),/ALREADY_USED/);assert.equal(attempts,1);
});
test("negative engine result is unknown, not permission to resume or retry",async()=>{
  for(const outcome of ["expired","context_changed","already_attempted","outcome_unknown"]){
    const f=fixture();await f.p.start();f.respond({outcome});await f.p.poll();assert.equal(f.p.phase,"unknown");assert.equal(f.writes.length,1);
  }
});
test("halt receipt rejects wrong identity, nonzero speed, expired success and extra fields",async()=>{
  const f=fixture();await f.p.start();
  const base={schemaVersion:1,kind:"halt_receipt",nonce,requestId:1,companyEntity:7,tickCount:101,updateCount:51,speedup:0,outcome:"halted"};
  for(const extra of [{nonce:"b".repeat(32)},{requestId:2},{companyEntity:8},{speedup:1},{tickCount:400},{tickCount:99},{payload:1}])
    assert.throws(()=>parseHaltReceipt(lua({...base,...extra}),f.writes[0]));
});
test("halt engine handler only stops in a fresh event and persists before attempting",async()=>{
  const source=await readFile(new URL("../mod/content/tf3mp_status.script.tl",import.meta.url),"utf8");
  const body=source.slice(source.indexOf("local function haltEvent"),source.indexOf("local function pauseEvent"));
  assert.match(body,/current.haltTestAttempted = true/);
  assert.ok(body.indexOf("state:set(current)")<body.indexOf("api.cmd.sendCommand"));
  assert.equal((body.match(/makeGameSetSpeedCmd\(0\)/g)||[]).length,1);
  assert.match(body,/afterClock.updateCount == beforeUpdate and afterSpeed.speedup == 0/);
  const update=source.slice(source.indexOf("  update = function"),source.indexOf("  handleEvent = function"));
  assert.doesNotMatch(update,/haltEvent\(|makeGameSetSpeedCmd/);
});
