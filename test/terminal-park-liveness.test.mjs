import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createEngineSessionAdapter} from '../src/engine-session-adapter.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';

const lua=value=>`function data() return {${Object.entries(value).map(([key,item])=>`${key}=${JSON.stringify(item)},`).join('')}} end`;

async function waitRequest(directory,operation){
  for(let i=0;i<100;i++){
    try{
      const request=parseFlatDataFile(await readFile(path.join(directory,'coordination_request.lua'),'utf8'));
      if(request.operation===operation)return request;
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.fail(`missing ${operation} request`);
}

async function fixture({nativeOutcome='parked'}={}){
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-terminal-live-'));
  const directory=path.join(root,'tf3mp_status_1');await mkdir(directory);
  const nonce='c'.repeat(32),native=new EventEmitter(),lease={phase:'active',get active(){return this.phase==='active';},stop(){this.phase='closed';}};
  const observation={available:true,sample:{nonce,companyEntity:7,counter:1,tickCount:10,updateCount:100,speedup:1}};
  const bridge={nonce,get engineObservation(){return observation;},async startCoordinationLease(){return lease;}};
  const sent=[],commands=[];let clock=0,adapter;
  native.requireCapability=()=>{};
  native.bindSession=async binding=>({status:'accepted',boundSessionId:binding.sessionId,boundRole:binding.role});
  native.gateControl=async command=>{commands.push(command);return {status:'halt_requested',...command,haltGeneration:command.generation};};
  native.awaitGateEvent=async command=>{
    lease.stop();
    observation.sample={...observation.sample,speedup:1};
    if(nativeOutcome==='unknown')throw new Error('NATIVE_GATE_EVENT_UNKNOWN_NO_RETRY');
    return {event:'terminal_parked',...command,haltGeneration:command.generation};
  };
  native.close=()=>{};
  adapter=await createEngineSessionAdapter({directory,bridge,playerId:'host',companies:new Map([['host',7],['mirror',9]]),
    healthy:()=>true,controlsReady:()=>true,send:(kind,payload)=>sent.push({kind,payload}),disconnect:()=>{},now:()=>clock,
    checkpointEvidenceScope:'local_diagnostic',
    nativeRuntime:{client:native,sessionId:'native.park.live',role:'host',gateControl:native.gateControl,
      awaitGateEvent:native.awaitGateEvent,logger:()=>{}}});

  async function reply(request,extra={},shouldPoll=true){
    await writeFile(path.join(directory,'coordination_receipt.lua'),lua({schemaVersion:1,nonce,
      roundId:request.roundId,operationId:request.operationId,operation:request.operation,status:'ok',
      updateCount:request.updateCount??100,held:false,...extra}));
    if(shouldPoll)await adapter.poll();
  }
  async function establishCheckpoint(){
    assert.equal(adapter.receive('coordination_capture',{roundId:'terminal-round',updateCount:100,
      players:[{playerId:'host',companyEntity:7},{playerId:'mirror',companyEntity:9}]}),true);
    const bind=await waitRequest(directory,'bindSession');await reply(bind);
    const hold=await waitRequest(directory,'holdCheckpoint');
    await reply(hold,{updateCount:100,held:true,snapshotVersion:1,companyCount:2,
      company1:7,balance1:100,negative1:0,company2:9,balance2:100,negative2:0},false);
    observation.sample={...observation.sample,counter:2,tickCount:11,updateCount:100,speedup:0};
    await adapter.poll();
    assert.equal(adapter.checkpointEvidence?.receipt?.roundId,'terminal-round');
    assert.equal(adapter.checkpointEvidence?.receipt?.operation,'holdCheckpoint');
    sent.length=0;
  }
  async function park(){
    await establishCheckpoint();
    if(adapter.fault!==null)throw new Error(`checkpoint setup fault: ${adapter.fault} ${JSON.stringify(adapter.faultEvidence)}`);
    await adapter.halt('LOCAL_RUN_COMPLETE');
    if(adapter.fault!==null)throw new Error(`native park fault: ${adapter.fault} ${JSON.stringify(adapter.faultEvidence)}`);
    assert.equal(adapter.haltState,'confirmed');
    assert.equal(lease.phase,'closed');
    assert.deepEqual(commands,[{control:'halt',epoch:'1',generation:'0'}]);
  }
  return {adapter,bridge,observation,sent,commands,lease,get clock(){return clock;},set clock(value){clock=value;},
    establishCheckpoint,park,async close(){await adapter.close();await rm(root,{recursive:true,force:true});}};
}

test('native park at speed 1 keeps a verified terminal session live for more than thirteen seconds',async()=>{
  const f=await fixture();
  try{
    await f.park();
    const heartbeatStart=f.sent.length;
    f.observation.sample={...f.observation.sample,counter:3,tickCount:12};
    assert.equal(await f.adapter.poll(),true,'the first fresh observation opens the parked heartbeat window');
    for(let second=1;second<=14;second++){
      f.clock=second*1000;
      f.observation.sample={...f.observation.sample,counter:3+second,tickCount:12,updateCount:100};
      assert.equal(await f.adapter.poll(),true);
      assert.equal(f.observation.sample.speedup,1,'native parking does not change the selected game speed');
    }
    assert.equal(f.adapter.fault,null);
    assert.equal(f.adapter.haltState,'confirmed');
    assert.equal(f.adapter.leaseState,'closed');
    assert.deepEqual(f.sent.slice(heartbeatStart).filter(message=>message.kind==='participant_heartbeat'),
      Array.from({length:15},()=>({kind:'participant_heartbeat',payload:{roundId:'terminal-round',updateCount:100}})));
    assert.equal(f.adapter.receive('coordination_heartbeat',{roundId:'terminal-round'}),true,
      'a same-round coordination heartbeat remains accepted after the lease closes');
  }finally{await f.close();}
});

test('terminal park rejects a heartbeat for another round',async()=>{
  const f=await fixture();
  try{
    await f.park();
    f.observation.sample={...f.observation.sample,counter:3,tickCount:12};
    assert.equal(await f.adapter.poll(),true);
    assert.equal(f.adapter.receive('coordination_heartbeat',{roundId:'another-round'}),false);
    assert.equal(f.adapter.fault,'TERMINAL_UNEXPECTED_FRAME');
    assert.equal(f.adapter.haltState,'unknown');
  }finally{await f.close();}
});

test('terminal park rejects gameplay frames instead of reopening a mailbox operation',async()=>{
  const f=await fixture();
  try{
    await f.park();
    assert.equal(f.adapter.haltSource,'native_terminal_parked');
    assert.equal(f.adapter.receive('command_commit',{roundId:'terminal-round',hostSequence:1}),false);
    assert.equal(f.adapter.fault,'TERMINAL_UNEXPECTED_FRAME');
    assert.equal(f.adapter.haltState,'unknown');
    assert.equal(f.sent.some(message=>message.kind==='participant_heartbeat'),false);
    assert.equal(f.commands.length,1);
  }finally{await f.close();}
});

for(const scenario of [
  ['stale counter after three seconds',f=>{},'TERMINAL_OBSERVATION_STALE'],
  ['advanced update count',f=>{f.observation.sample={...f.observation.sample,counter:4,updateCount:101};},'TERMINAL_WORLD_ADVANCED'],
  ['advanced tick count',f=>{f.observation.sample={...f.observation.sample,counter:4,tickCount:13};},'TERMINAL_WORLD_ADVANCED'],
  ['restarted observation producer',f=>{f.observation.sample={...f.observation.sample,counter:2};},'TERMINAL_OBSERVATION_INVALID'],
  ['regressed tick count',f=>{f.observation.sample={...f.observation.sample,counter:4,tickCount:11};},'TERMINAL_OBSERVATION_INVALID'],
  ['changed sample at unchanged counter',f=>{f.observation.sample={...f.observation.sample,tickCount:13};},'TERMINAL_OBSERVATION_CONFLICT'],
  ['missing observation nonce',f=>{const {nonce,...sample}=f.observation.sample;f.observation.sample=sample;},'TERMINAL_OBSERVATION_INVALID'],
  ['wrong observed company',f=>{f.observation.sample={...f.observation.sample,companyEntity:9};},'TERMINAL_OBSERVATION_INVALID'],
])test(`terminal proof is revoked by ${scenario[0]}`,async()=>{
  const f=await fixture();
  try{
    await f.park();
    f.observation.sample={...f.observation.sample,counter:3,tickCount:12};
    assert.equal(await f.adapter.poll(),true);
    scenario[1](f);
    if(scenario[0]==='stale counter after three seconds')f.clock=3000;
    else f.clock=1000;
    assert.equal(await f.adapter.poll(),false);
    assert.equal(f.adapter.haltState,'unknown');
    assert.equal(f.adapter.fault,scenario[2]);
  }finally{await f.close();}
});

test('a fresh observation must arrive within the three second terminal deadline',async()=>{
  const f=await fixture();
  try{
    await f.park();
    f.clock=2999;
    assert.equal(await f.adapter.poll(),true);
    assert.equal(f.adapter.haltState,'confirmed');
    f.clock=3000;
    assert.equal(await f.adapter.poll(),false);
    assert.equal(f.adapter.haltState,'unknown');
    assert.equal(f.adapter.fault,'TERMINAL_PAUSED_OBSERVATION_UNKNOWN');
  }finally{await f.close();}
});

test('an unknown native terminal event sends no participant heartbeat and is never retried',async()=>{
  const f=await fixture({nativeOutcome:'unknown'});
  try{
    await f.establishCheckpoint();
    await f.adapter.halt('LOCAL_RUN_COMPLETE');
    assert.equal(f.adapter.haltState,'unknown');
    f.observation.sample={...f.observation.sample,counter:3,tickCount:12};
    for(let second=1;second<=4;second++){
      f.clock=second*1000;
      f.observation.sample={...f.observation.sample,counter:2+second,tickCount:11,updateCount:100};
      assert.equal(await f.adapter.poll(),false);
    }
    assert.equal(f.adapter.fault,'NATIVE_HALT_UNKNOWN');
    assert.deepEqual(f.sent.filter(message=>message.kind==='participant_heartbeat'),[]);
    assert.equal(f.commands.length,1);
  }finally{await f.close();}
});
