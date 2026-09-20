import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHeldSnapshot, createHeldSnapshotProbe } from "../src/held-snapshot.mjs";
const nonce="a".repeat(32);
const lua=p=>`function data() return {${Object.entries(p).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join("")}} end`;
const req={nonce,requestId:1,entity:42,companyEntity:7,heldUpdate:90,issuedTick:100,expiresTick:400};
const data={schemaVersion:1,kind:"held_snapshot",nonce,requestId:1,entity:42,companyEntity:7,heldUpdate:90,tickCount:101,updateCount:90,
  speedup:0,ownerCompanyEntity:7,revision:12,stopFlag:1,balance:100,balanceNegative:0,outcome:"captured"};
test("selected-state hash excludes receipt identity and paused clock ticks, but includes money/ownership/action",()=>{
  const a=parseHeldSnapshot(lua(data),req);
  assert.equal(a.hash,parseHeldSnapshot(lua({...data,tickCount:102,revision:13}),req).hash);
  for(const changes of [{balance:99},{balanceNegative:1},{stopFlag:0}]) assert.notEqual(a.hash,parseHeldSnapshot(lua({...data,...changes}),req).hash);
  assert.equal(a.state.scope,"held_vehicle_company_v1");
});
for(const changes of [{nonce:"b".repeat(32)},{requestId:2},{entity:43},{ownerCompanyEntity:8},{updateCount:91},{speedup:1},{tickCount:401},{balanceNegative:2},{extra:true},{outcome:"hold_lost"}]) test(`snapshot rejects mismatched or unsafe evidence ${JSON.stringify(changes)}`,()=>{
  assert.throws(()=>parseHeldSnapshot(lua({...data,...changes}),req));
});
function fixture(){
  let request,source="",time=0,available=true,completed=0;
  const events=[],sent=[];
  const p=createHeldSnapshotProbe({nonce,entity:42,companyEntity:7,heldUpdate:90,stopFlag:1,firstRequestId:1,
    observe:()=>({available,sample:{updateCount:90,tickCount:100,companyEntity:7,speedup:0}}),publish:async r=>{request=r;sent.push(r);},
    read:async()=>source,remove:async()=>{},logger:e=>events.push(e),complete:async()=>{completed++;},now:()=>time});
  return {p,events,sent,completed:()=>completed,time:n=>{time=n;},lose:()=>{available=false;},reply:extra=>{source=lua({...data,requestId:request.requestId,...extra});}};
}
test("two fresh paused snapshots are required before completion",async()=>{
  const f=fixture(); await f.p.start(); f.reply({tickCount:101}); await f.p.poll();
  assert.equal(f.p.phase,"second"); assert.equal(f.completed(),0);
  f.reply({tickCount:101}); await f.p.poll(); assert.equal(f.completed(),0);
  f.reply({tickCount:102}); await f.p.poll(); await f.p.poll();
  assert.equal(f.p.phase,"passed"); assert.equal(f.completed(),1); assert.equal(f.sent.length,2);
});
for(const fault of ["changed","timeout","lost","wrong_state","close"]) test(`snapshot pair fails closed: ${fault}`,async()=>{
  const f=fixture(); await f.p.start(); f.reply({tickCount:101}); await f.p.poll();
  if(fault==="changed") f.reply({tickCount:102,balance:99});
  if(fault==="wrong_state") f.reply({tickCount:102,stopFlag:0});
  if(fault==="timeout") f.time(15000);
  if(fault==="lost") f.lose();
  if(fault==="close") await f.p.close(); else await f.p.poll();
  assert.ok(["failed","closed"].includes(f.p.phase)); assert.equal(f.completed(),0);
});
test("engine snapshot path is read-only and requires the existing checked hold",async()=>{
  const source=await readFile(new URL("../mod/content/tf3mp_status.script.tl",import.meta.url),"utf8");
  const region=source.slice(source.indexOf("local function snapshotEvent"),source.indexOf("local function companyEvent"));
  assert.doesNotMatch(region,/api\.cmd|checkpointHash|stateHash/);
  assert.match(region,/held.outcome ~= "checked"/);
  assert.match(region,/vehicle.company ~= request.companyEntity/);
  assert.match(region,/getPlayersBalance/);
});
