import test from "node:test";
import assert from "node:assert/strict";
import { AsyncSessionParticipant } from "../src/async-session-participant.mjs";
import { SessionCoordinator } from "../src/session-coordinator.mjs";
import { EngineOperationJournal } from "../src/engine-operation-journal.mjs";
import { ROAD_STOP_MODEL } from '../src/road-stop-order-payload.mjs';
const checkpointHash = "a".repeat(64), stateHash = "b".repeat(64), roundId = "round";
const companies = new Map([["a",10],["b",11]]);
const command = (hostSequence = 1, scheduledUpdate = 108) => ({protocolVersion:2,hostSequence,scheduledUpdate,
  originPlayerId:"a",targetCompanyEntity:10,targetEntity:20,commandType:"vehicle.setRunning",payload:{running:false},clientSequence:hostSequence,requestMessageId:"request"});
const roster = map => [...map].map(([playerId,companyEntity]) => ({playerId,companyEntity}));

for(const synchronous of [true,false]) test(`publication diagnostics redact errors and never retry (${synchronous})`,async()=>{
  const requests=[];
  const p=new AsyncSessionParticipant({playerId:'a',companies,now:()=>0,send:()=>{},disconnect:()=>{},
    publish:r=>{
      requests.push(r);
      const error=Object.assign(new Error('private-path-and-secret'),{code:'EPERM',publicationStage:'replace'});
      if(synchronous)throw error;
      return Promise.reject(error);
    }});
  p.observe({updateCount:100,held:false});
  p.receive('coordination_prepare',{roundId,updateCount:100,checkpointHash,players:roster(companies)});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(p.fault,'ENGINE_DELIVERY_UNKNOWN');assert.equal(p.haltState,'unknown');
  assert.deepEqual(requests.map(r=>r.operation),['holdCheckpoint','halt']);
  assert.deepEqual(p.faultEvidence,{kind:'request_publication',operation:'holdCheckpoint',errorCode:'EPERM',deliveryStage:'replace',
    haltDelivery:{operation:'halt',errorCode:'EPERM',deliveryStage:'replace'}});
  assert.equal(JSON.stringify(p.faultEvidence).includes('private'),false);
});

test('publication diagnostics snapshot getters and discard arbitrary codes',async()=>{
  for(const error of [null,{code:'private-secret',publicationStage:'C:/private'},
    {get code(){throw new Error('secret');}},
    {get code(){return this.reads++ ? 'secret' : 'EBUSY';},reads:0,publicationStage:'replace'}]) {
    const p=new AsyncSessionParticipant({playerId:'a',companies,now:()=>0,send:()=>{},disconnect:()=>{},
      publish:r=>r.operation==='halt'?Promise.resolve():Promise.reject(error)});
    p.observe({updateCount:100,held:false});
    p.receive('coordination_prepare',{roundId,updateCount:100,checkpointHash,players:roster(companies)});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(p.fault,'ENGINE_DELIVERY_UNKNOWN');
    assert.equal(JSON.stringify(p.faultEvidence).includes('secret'),false);
    assert.ok(['UNCLASSIFIED','EBUSY'].includes(p.faultEvidence.errorCode));
  }
});

test('late publication rejection cannot invalidate an acknowledged operation',async()=>{
  const requests=[];let reject;
  const p=new AsyncSessionParticipant({playerId:'a',companies,now:()=>0,send:()=>{},disconnect:()=>{},
    publish:r=>{requests.push(r);return new Promise((_,no)=>{reject=no;});}});
  p.observe({updateCount:100,held:false});
  p.receive('coordination_prepare',{roundId,updateCount:100,checkpointHash,players:roster(companies)});
  p.receiveEngine(receipt(requests[0]));
  reject(Object.assign(new Error('late'),{code:'EPERM',publicationStage:'replace'}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(p.fault,null);assert.equal(p.faultEvidence,null);assert.equal(requests.length,1);
});
function receipt(r, extra = {}) {
  const p = {schemaVersion:1,roundId:r.roundId,operationId:r.operationId,operation:r.operation,status:"ok",updateCount:100,held:false};
  if (r.operation === "holdCheckpoint") Object.assign(p,{held:true,checkpointHash,updateCount:r.updateCount});
  if (r.operation === "prepare") p.ownerCompanyEntity = 10;
  if (r.operation === "executeHeld") Object.assign(p,{held:true,updateCount:r.command.scheduledUpdate,ownerCompanyEntity:10,stateHash});
  if (r.operation === "release") p.updateCount = r.updateCount;
  if (r.operation === "halt") p.held = true;
  return {...p,...extra};
}
function fixture() {
  let time = 0, closed = 0;
  const requests = [], sends = [];
  const p = new AsyncSessionParticipant({playerId:"a",companies,now:() => time,
    publish:r => {requests.push(r); return Promise.resolve();},send:(kind,payload) => sends.push({kind,payload}),disconnect:() => closed++});
  const reply = extra => p.receiveEngine(receipt(requests.at(-1),extra));
  const start = () => {
    p.observe({updateCount:100,held:false});
    p.receive("coordination_prepare", {roundId,updateCount:100,checkpointHash,players:roster(companies)});
    reply(); p.receive("coordination_ready",{roundId,updateCount:100,checkpointHash}); reply();
    assert.equal(p.phase,"running");
  };
  const prepare = () => { p.receive("command_prepare",{roundId,command:command()}); reply(); };
  const commit = () => p.receive("command_commit",{roundId,command:command()});
  return {p,requests,sends,reply,start,prepare,commit,time:n => {time=n;},closed:() => closed};
}

test('road Stop prepare uses the ordered participant and requires an engine company receipt',()=>{
  const road={...command(),commandType:'road.stop.place',payload:{edgeEntity:20,
    companyEntity:10,param:0.5,left:true,oneWay:false,model:ROAD_STOP_MODEL,name:'TalCo Road Stop'}};
  const accepted=fixture();accepted.start();
  accepted.p.receive('command_prepare',{roundId,command:road});
  assert.equal(accepted.requests.at(-1).operation,'prepare');
  assert.equal(accepted.requests.at(-1).command.commandType,'road.stop.place');
  accepted.reply({ownerCompanyEntity:10});
  assert.equal(accepted.p.phase,'prepared');
  const rejected=fixture();rejected.start();
  rejected.p.receive('command_prepare',{roundId,command:road});
  rejected.reply({ownerCompanyEntity:11});
  assert.equal(rejected.p.fault,'INVALID_PREPARE_RECEIPT');
});

test('preparation receipt overtaken by telemetry never rewinds the live clock or its acknowledgement',()=>{
  const f=fixture();f.start();
  f.p.receive('command_prepare',{roundId,command:command()});
  f.p.observe({updateCount:104,held:false});f.p.poll();
  f.reply({updateCount:102});
  assert.equal(f.p.phase,'prepared');
  assert.equal(f.sends.at(-1).payload.updateCount,104);
  f.commit();f.reply();assert.equal(f.p.phase,'awaiting_completion');
  f.p.receive('command_completed',f.sends.at(-1).payload);
  f.p.observe({updateCount:111,held:false});
  f.reply({updateCount:108});
  assert.equal(f.p.phase,'running');
  assert.equal(f.sends.at(-1).payload.updateCount,111);
  assert.equal(f.sends.at(-1).payload.releaseUpdate,108);
  f.p.observe({updateCount:110,held:false});
  assert.equal(f.p.fault,'CLOCK_RESET','real telemetry regression still halts');
});

test('receipt dated before its request is not accepted as merely delayed',()=>{
  const f=fixture();f.start();
  f.p.receive('command_prepare',{roundId,command:command()});
  f.p.observe({updateCount:104,held:false});
  f.reply({updateCount:99});assert.equal(f.p.fault,'INVALID_RECEIPT_CLOCK');
});

test('failed execution preserves bounded timing evidence after halt replaces its pending request',()=>{
  const f=fixture();f.start();f.prepare();f.commit();
  f.reply({status:'unknown',updateCount:109,held:false,stage:'after_result_entities',secret:'not-for-report'});
  assert.equal(f.p.phase,'halted');
  assert.deepEqual(f.p.faultEvidence,{operation:'executeHeld',phase:'executing',receiptStatus:'unknown',
    receiptUpdate:109,expectedUpdate:108,observedUpdate:100,held:false,hostSequence:1,
    stage:'after_result_entities'});
  const copy=f.p.faultEvidence;copy.receiptUpdate=0;
  assert.equal(f.p.faultEvidence.receiptUpdate,109);
  f.reply({held:true,updateCount:110});
  assert.equal(f.p.faultEvidence.receiptUpdate,109);
});

test('overtaken preparation cannot revive a missed execution deadline',()=>{
  const f=fixture();f.start();
  f.p.receive('command_prepare',{roundId,command:command()});
  f.p.observe({updateCount:108,held:false});
  f.reply({updateCount:102});assert.equal(f.p.phase,'halted');
  assert.equal(f.requests.filter(r=>r.operation==='executeHeld').length,0);
});

for(const speedup of [1,2,4]) for(const outcome of ['matching','wrong','missing'])
test(`barrier release requires observed speed ${speedup}: ${outcome}`,()=>{
  const f=fixture();f.start();f.prepare();f.commit();f.reply();
  const applied=f.sends.at(-1).payload;
  f.p.receive('command_completed',{...applied,speedup});
  assert.equal(f.requests.at(-1).speedup,speedup);
  f.reply(outcome==='missing'?{}:{speedup:outcome==='matching'?speedup:0});
  assert.equal(f.p.phase,outcome==='matching'?'running':'halted');
  if(outcome==='matching')assert.equal(f.sends.at(-1).payload.speedup,speedup);
});

for(const speedup of [0,-1,3,8,'2',null])test(`invalid resume speed ${JSON.stringify(speedup)} never releases`,()=>{
  const f=fixture();f.start();f.prepare();f.commit();f.reply();
  f.p.receive('command_completed',{...f.sends.at(-1).payload,speedup});
  assert.equal(f.p.phase,'halted');
  assert.equal(f.requests.filter(r=>r.operation==='release').length,1); // Startup only.
});
test("async delivery is never mistaken for engine execution, completion requires a matching release receipt", async () => {
  const f = fixture(); f.start(); f.prepare(); f.commit();
  await Promise.resolve(); assert.equal(f.p.phase,"executing");
  assert.equal(f.sends.some(s => s.kind === "command_applied"),false);
  f.reply(); assert.equal(f.p.phase,"awaiting_completion");
  const applied = f.sends.at(-1).payload;
  f.p.receive("command_completed",applied); assert.equal(f.p.phase,"releasing");
  f.reply(); assert.equal(f.p.phase,"running");
  assert.equal(f.requests.filter(r => r.operation === "executeHeld").length,1);
});
test("stale, duplicate and wrong-round engine receipts cannot advance a pending operation", () => {
  const f=fixture(); f.start(); f.prepare(); const old=receipt(f.requests.at(-1)); f.commit();
  assert.equal(f.p.receiveEngine(old),false);
  assert.equal(f.reply({roundId:"other"}),false);
  f.reply(); assert.equal(f.p.receiveEngine(receipt(f.requests.at(-1))),false);
  assert.equal(f.sends.filter(s => s.kind === "command_applied").length,1);
});

test('consecutive command cycles require each execution and release receipt and retain monotonic sequence',()=>{
  const f=fixture();f.start();
  for(let sequence=1;sequence<=4;sequence++) {
    const c=command(sequence,100+sequence*8);
    f.p.receive('command_prepare',{roundId,command:c});
    assert.equal(f.requests.at(-1).operation,'prepare');
    f.reply({updateCount:c.scheduledUpdate-5});
    f.p.receive('command_commit',{roundId,command:c});
    assert.equal(f.requests.at(-1).operation,'executeHeld');
    f.reply();
    const applied=f.sends.at(-1).payload;
    f.p.receive('command_completed',applied);
    assert.equal(f.p.phase,'releasing');
    f.reply();
    assert.equal(f.p.phase,'running');
  }
  assert.equal(f.requests.filter(r=>r.operation==='executeHeld').length,4);
  assert.equal(f.requests.filter(r=>r.operation==='release').length,5);
  f.p.receive('command_prepare',{roundId,command:command(1,200)});
  assert.equal(f.p.phase,'halted');
});
for (const mode of ["owner","early","late","not-held","bad-hash","unknown","extra-field","duplicate-commit","disconnect","observation-past-target"]) {
  test(`async execution failure is latched without replay: ${mode}`, () => {
    const f=fixture(); f.start(); f.prepare(); f.commit(); const request=f.requests.at(-1);
    const changes={owner:{ownerCompanyEntity:11},early:{updateCount:107},late:{updateCount:109},"not-held":{held:false},"bad-hash":{stateHash:"bad"},unknown:{status:"unknown"},"extra-field":{script:"no"}};
    if (changes[mode]) f.reply(changes[mode]);
    else if (mode === "duplicate-commit") f.commit();
    else if (mode === "disconnect") f.p.receive("session_ended",{});
    else f.p.observe({updateCount:109,held:false});
    assert.equal(f.p.phase,"halted"); assert.equal(f.closed(),1);
    assert.equal(f.p.haltState,"pending");
    f.p.receiveEngine(receipt(request)); f.commit(); f.p.poll();
    assert.equal(f.requests.filter(r => r.operation === "executeHeld").length,1);
    assert.equal(f.sends.some(s => s.kind === "command_applied"),false);
  });
}
test("halt is unknown until a separate matching stop receipt, and never causes resume", () => {
  const f=fixture(); f.start(); f.prepare(); f.commit(); const late=receipt(f.requests.at(-1));
  f.p.halt("TEST"); assert.equal(f.p.haltState,"pending");
  assert.equal(f.p.receiveEngine(late),false);
  assert.equal(f.reply({held:false}),false); assert.equal(f.p.haltState,"pending");
  assert.equal(f.reply(),true); assert.equal(f.p.haltState,"confirmed");
  assert.equal(f.p.phase,"halted"); assert.equal(f.closed(),1);
});
test("missing stop receipt becomes unknown and late receipt cannot certify it", () => {
  const f=fixture(); f.start(); f.p.halt("TEST"); const ack=receipt(f.requests.at(-1));
  f.time(15000); f.p.poll(); assert.equal(f.p.haltState,"unknown");
  assert.equal(f.p.receiveEngine(ack),false);
});
for(const failure of ["advance","resume","malformed","stale"]) test(`confirmed engine halt is revoked on ${failure}`, () => {
  const f=fixture(); f.start(); f.p.halt("TEST"); f.reply(); assert.equal(f.p.haltState,"confirmed");
  if(failure === "advance") f.p.observe({updateCount:101,held:true});
  if(failure === "resume") f.p.observe({updateCount:100,held:false});
  if(failure === "malformed") f.p.observe({updateCount:100,held:true,extra:true});
  if(failure === "stale") { f.time(5000); f.p.poll(); }
  assert.equal(f.p.haltState,"unknown"); f.p.observe({updateCount:100,held:true});
  assert.equal(f.p.haltState,"unknown"); assert.equal(f.p.phase,"halted");
  assert.equal(f.requests.filter(r=>r.operation === "halt").length,1);
});
test("fresh observations preserve a confirmed hold without resuming", () => {
  const f=fixture(); f.start(); f.p.halt("TEST"); f.reply();
  for(const time of [3000,6000,9000]) { f.time(time); f.p.observe({updateCount:100,held:true}); f.p.poll(); }
  assert.equal(f.p.haltState,"confirmed"); assert.equal(f.p.phase,"halted");
});
test("host heartbeat cannot extend engine-operation deadline", () => {
  const f=fixture(); f.start(); f.prepare(); f.commit();
  for (const n of [3000,6000,9000,12000,14999]) {
    f.time(n); f.p.receive("coordination_heartbeat",{roundId}); f.p.observe({updateCount:100,held:false}); f.p.poll();
  }
  assert.equal(f.p.phase,"executing"); f.time(15000); f.p.poll(); assert.equal(f.p.fault,"PARTICIPANT_TIMEOUT");
});
test("engine observation loss halts despite live host", () => {
  const f=fixture(); f.start(); f.time(5000); f.p.receive("coordination_heartbeat",{roundId});
  assert.equal(f.p.fault,"ENGINE_OBSERVATION_STALE");
});
test("publication rejection and late promise completion cannot reopen participant", async () => {
  const f=fixture(); f.start(); f.prepare();
  f.p.publish = () => Promise.reject(new Error("delivery uncertain")); f.commit();
  await new Promise(r => setImmediate(r));
  assert.equal(f.p.phase,"halted"); assert.equal(f.p.haltState,"unknown"); assert.equal(f.closed(),1);
});

test("halt delivery failure cannot be recertified by a matching late receipt", async () => {
  const f=fixture(); f.start();
  const issued=[];
  f.p.publish=r=>{issued.push(r); return Promise.reject(new Error('unknown delivery'));};
  f.p.halt('TEST');
  await new Promise(r=>setImmediate(r));
  assert.equal(f.p.haltState,'unknown');
  assert.equal(f.p.receiveEngine(receipt(issued[0])),false);
  assert.equal(f.p.haltState,'unknown');
  assert.equal(issued.length,1);
});
test("inspection ownership rejection prevents execute dispatch", () => {
  const f=fixture(); f.start(); f.p.receive("command_prepare",{roundId,command:command()}); f.reply({ownerCompanyEntity:11});
  assert.equal(f.p.phase,"halted"); assert.equal(f.requests.some(r => r.operation === "executeHeld"),false);
});
test("checkpoint and release need engine evidence", () => {
  const f=fixture(); f.p.observe({updateCount:100,held:false});
  f.p.receive("coordination_prepare",{roundId,updateCount:100,checkpointHash,players:roster(companies)});
  assert.equal(f.p.phase,"holding_checkpoint"); assert.equal(f.sends.length,0);
  f.reply({held:false}); assert.equal(f.p.phase,"halted"); assert.equal(f.sends.length,0);
});

test('engine binding must acknowledge before checkpoint hold and cannot announce readiness',()=>{
  const requests=[],sends=[];
  const p=new AsyncSessionParticipant({playerId:'a',companies,requireEngineBinding:true,now:()=>0,
    publish:r=>requests.push(r),send:(kind,payload)=>sends.push({kind,payload}),disconnect:()=>{}});
  p.observe({updateCount:100,held:false});
  p.receive('coordination_prepare',{roundId,updateCount:100,checkpointHash,players:roster(companies)});
  assert.equal(p.phase,'binding_session');assert.equal(requests[0].operation,'bindSession');
  assert.equal(sends.length,0);
  p.receiveEngine(receipt(requests[0]));
  assert.equal(p.phase,'holding_checkpoint');assert.equal(requests[1].operation,'holdCheckpoint');
  assert.equal(sends.length,0);
  p.receiveEngine(receipt(requests[1]));
  assert.equal(sends.at(-1).kind,'participant_ready');
});

for(const mode of ['on_time','late_binding','missed_hold','too_far','wrong_hash'])test(`scheduled checkpoint startup: ${mode}`,()=>{
  const requests=[],sends=[];
  const p=new AsyncSessionParticipant({playerId:'a',companies,requireEngineBinding:true,now:()=>0,
    publish:r=>requests.push(r),send:(kind,payload)=>sends.push({kind,payload}),disconnect:()=>{}});
  p.observe({updateCount:100,held:false});
  p.receive('coordination_prepare',{roundId,updateCount:mode==='too_far'?701:140,checkpointHash,players:roster(companies)});
  if(mode==='too_far'){assert.equal(p.phase,'halted');return;}
  p.receiveEngine(receipt(requests.at(-1),{updateCount:mode==='late_binding'?141:104}));
  if(mode==='late_binding'){
    assert.equal(p.fault,'CHECKPOINT_DEADLINE_MISSED');
    assert.equal(requests.some(r=>r.operation==='holdCheckpoint'),false);return;
  }
  assert.equal(p.phase,'holding_checkpoint');
  if(mode==='missed_hold'){
    p.observe({updateCount:141,held:false});assert.equal(p.fault,'CHECKPOINT_DEADLINE_MISSED');return;
  }
  p.receiveEngine(receipt(requests.at(-1),{checkpointHash:mode==='wrong_hash'?'f'.repeat(64):checkpointHash}));
  assert.equal(p.phase,mode==='wrong_hash'?'halted':'preparing');
  assert.equal(sends.some(s=>s.kind==='participant_ready'),mode==='on_time');
});
test("release failure cannot announce running", () => {
  const f=fixture(); f.p.observe({updateCount:100,held:false});
  f.p.receive("coordination_prepare",{roundId,updateCount:100,checkpointHash,players:roster(companies)}); f.reply();
  f.p.receive("coordination_ready",{roundId,updateCount:100,checkpointHash}); f.reply({held:true});
  assert.equal(f.p.fault,"RELEASE_NOT_CONFIRMED");
});
test("unsupported speed actions and cross-company requests never reach engine", () => {
  for (const extra of [{commandType:"simulation.speed",targetEntity:null,payload:{speedup:1}},{targetCompanyEntity:11}]) {
    const f=fixture(); f.start(); f.p.receive("command_prepare",{roundId,command:{...command(),...extra}});
    assert.equal(f.p.phase,"halted"); assert.equal(f.requests.some(r => r.operation === "prepare"),false);
  }
});
test("losing the completion hold stops further actions", () => {
  const f=fixture(); f.start(); f.prepare(); f.commit(); f.reply();
  f.p.observe({updateCount:108,held:false}); assert.equal(f.p.fault,"ENGINE_BARRIER_NOT_CONFIRMED");
});

// Existing coordinator wired to delayed engine request/receipt queues. These
// engines are synthetic; neither real sockets nor TF3 are claimed here.
test("async coordinator blocks next command until every engine release is acknowledged", () => {
  const c=new SessionCoordinator({requireReleaseAck:true,now:() => 0});
  c.prepare(roster(companies),{updateCount:100,checkpointHash});
  for(const [id,companyEntity] of companies) c.ready(id,{roundId:c.roundId,updateCount:100,checkpointHash,companyEntity});
  assert.equal(c.phase,"awaiting_release");
  assert.throws(() => c.propose(command(),100),/COORDINATION_NOT_READY|all participants/);
  const ack={roundId:c.roundId,hostSequence:0,releaseUpdate:100,updateCount:100};
  c.released("a",ack); assert.equal(c.phase,"awaiting_release");
  c.released("b",ack); assert.equal(c.phase,"running");
});
test("async coordinator rejects mismatched release receipt", () => {
  const c=new SessionCoordinator({requireReleaseAck:true,now:() => 0});
  c.prepare(roster(companies),{updateCount:100,checkpointHash});
  for(const [id,companyEntity] of companies) c.ready(id,{roundId:c.roundId,updateCount:100,checkpointHash,companyEntity});
  assert.throws(() => c.released("a",{roundId:c.roundId,hostSequence:0,releaseUpdate:99,updateCount:100}),/INVALID_RELEASE_ACK/);
  assert.equal(c.phase,"halted");
});
for (const count of [2,4]) for (const diverge of [false,true]) test(`${count} asynchronous participants through real coordinator, divergence=${diverge}`, () => {
  const map=new Map(Array.from({length:count},(_,i) => [String(i),10+i]));
  const peers=[], queue=[]; let hostUpdate=100;
  const coordinator=new SessionCoordinator({requireReleaseAck:true,now:() => 0,broadcast:(kind,p) => { for(const peer of peers) queue.push(() => peer.receive(kind,structuredClone(p))); }});
  for (const [id] of map) {
    let peer, journal, durable;
    peer=new AsyncSessionParticipant({playerId:id,companies:map,now:() => 0,
      publish:r => { queue.push(() => {
        if(r.operation === "holdCheckpoint") journal=new EngineOperationJournal({nonce:"d".repeat(32),roundId:r.roundId,checkpointHash,
          companies:map,issuedTick:100,expiresTick:400,persist:s=>{durable=s;}});
        const response=receipt(r,r.operation === "prepare" ? {updateCount:hostUpdate} : r.operation === "executeHeld" && diverge && id === "1" ? {stateHash:"c".repeat(64)} : {});
        if(r.operation === "executeHeld") {
          const c=r.command, live={tickCount:110,updateCount:c.scheduledUpdate,held:true,ownerCompanyEntity:10,revision:12};
          const intent={schemaVersion:1,nonce:"d".repeat(32),roundId:r.roundId,operationId:r.operationId,sequence:c.hostSequence,
            originPlayerId:c.originPlayerId,companyEntity:c.targetCompanyEntity,entity:c.targetEntity,revision:12,scheduledUpdate:c.scheduledUpdate,running:c.payload.running};
          assert.equal(journal.claim(intent,live).execute,true);
          assert.equal(durable.entries.at(-1).outcome,"pending");
          journal.complete(r.operationId,{outcome:"applied",updateCount:c.scheduledUpdate,ownerCompanyEntity:10,running:c.payload.running,stateHash:response.stateHash},live);
          assert.equal(journal.claim(intent,live).execute,false);
        }
        if(r.operation === "halt" && journal) journal.fence();
        peer.receiveEngine(response);
      }); },
      disconnect:() => coordinator.disconnected(id),send:(kind,p) => queue.push(() => {
        if(coordinator.phase === "halted") return;
        try {
          if(kind === "participant_ready") coordinator.ready(id,p);
          else if(kind === "participant_released") coordinator.released(id,p);
          else if(kind === "command_prepared") coordinator.prepared(id,p,hostUpdate);
          else if(kind === "command_applied") coordinator.applied(id,p);
          else coordinator.heartbeat(id,p);
        } catch(e) { if(coordinator.phase !== "halted") throw e; }
      })});
    peer.observe({updateCount:100,held:false}); peers.push(peer);
  }
  const drain=() => { let n=0; while(queue.length) { assert.ok(++n < 500); queue.shift()(); } };
  coordinator.prepare(roster(map),{updateCount:100,checkpointHash}); drain();
  assert.ok(peers.every(p => p.phase === "running"));
  for (let seq=1;seq<=3;seq++) {
    const c={...command(seq,100+seq*8),originPlayerId:"0"};
    coordinator.propose(c,hostUpdate); drain();
    if(diverge) { assert.equal(coordinator.phase,"halted"); assert.ok(peers.every(p => p.phase === "halted")); break; }
    hostUpdate=c.scheduledUpdate;
    assert.equal(coordinator.phase,"running"); assert.ok(peers.every(p => p.phase === "running"));
  }
});
