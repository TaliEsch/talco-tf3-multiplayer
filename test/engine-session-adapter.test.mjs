import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createEngineSessionAdapter} from '../src/engine-session-adapter.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';
const lua=p=>`function data() return {${Object.entries(p).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`;

for(const locked of [false,true])test(`session adapter requires observed binding, capture and controls for release: locked=${locked}`,async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-adapter-')),directory=path.join(root,'tf3mp_status_1');await mkdir(directory);
  const nonce='a'.repeat(32),sent=[];let controls=locked,health=true,disconnected=0,adapter,time=0;
  const native=new EventEmitter(),nativeControls=[],nativeEvents=[];let nativeClosed=0;
  native.requireCapability=capability=>assert.ok(['session.bind','simulation.hold','engine.halt','simulation.gate-receipts.v1'].includes(capability));
  native.bindSession=async binding=>{assert.deepEqual(binding,{sessionId:'native.session:1',role:'participant'});return {status:'accepted',boundSessionId:binding.sessionId,boundRole:binding.role};};
  native.gateControl=async command=>{nativeControls.push(command);return {status:'halt_requested',...command,haltGeneration:command.generation};};
  native.awaitGateEvent=async command=>({event:'terminal_parked',...command,haltGeneration:command.generation});
  native.close=()=>{nativeClosed++;};
  const lease={phase:'active',get active(){return this.phase==='active';},stop(){this.phase='closed';}};
  const observation={available:true,sample:{counter:1,updateCount:100,speedup:1}};
  const bridge={nonce,get engineObservation(){return observation;},async startCoordinationLease(){return lease;}};
  const request=async()=>{for(let i=0;i<30;i++){try{return parseFlatDataFile(await readFile(path.join(directory,'coordination_request.lua'),'utf8'));}catch{await new Promise(r=>setTimeout(r,5));}}assert.fail('missing request');};
  const waitOperation=async operation=>{for(let i=0;i<50;i++){const r=await request();if(r.operation===operation)return r;await new Promise(r=>setTimeout(r,5));}assert.fail('missing operation '+operation);};
  const reply=async(r,extra={})=>{
    await writeFile(path.join(directory,'coordination_receipt.lua'),lua({schemaVersion:1,nonce,roundId:r.roundId,operationId:r.operationId,
      operation:r.operation,status:'ok',updateCount:100,held:false,...extra}));
    await adapter.poll();
  };
  try {
    adapter=await createEngineSessionAdapter({directory,bridge,playerId:'a',companies:new Map([['a',7],['b',9]]),
      healthy:()=>health,controlsReady:()=>controls,send:(kind,payload)=>sent.push({kind,payload}),disconnect:()=>disconnected++,now:()=>time,
      checkpointEvidenceScope:'local_diagnostic',nativeRuntime:{client:native,sessionId:'native.session:1',role:'participant',gateControl:native.gateControl,awaitGateEvent:native.awaitGateEvent,logger:event=>nativeEvents.push(event)}});
    adapter.receive('coordination_capture',{roundId:'r',updateCount:140,players:[{playerId:'a',companyEntity:7},{playerId:'b',companyEntity:9}]});
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(nativeControls,[],'qualification controller hold is not a world hold and has no release path');
    const bind=await waitOperation('bindSession');await reply(bind);
    const hold=await waitOperation('holdCheckpoint');assert.equal(hold.checkpointHash,undefined);
    await reply(hold,{updateCount:140,held:true,snapshotVersion:1,companyCount:2,company1:7,balance1:100,negative1:0,company2:9,balance2:0,negative2:0});
    assert.equal(adapter.phase,'holding_checkpoint','receipt ahead of telemetry cannot announce a hold');
    native.emit('unknownOutcome',{payload:{status:'accepted',control:'release',updateCount:140,held:false}});
    assert.equal(adapter.phase,'holding_checkpoint','native release traffic is not a game-world receipt');
    assert.equal(sent.some(m=>m.kind==='participant_ready'),false);
    observation.sample={counter:2,updateCount:140,speedup:1};
    await adapter.poll();assert.equal(adapter.phase,'holding_checkpoint','same update still running is not held evidence');
    observation.sample={counter:3,updateCount:140,speedup:0};
    await adapter.poll();
    assert.equal(adapter.phase,'preparing');const ready=sent.find(m=>m.kind==='participant_ready').payload;
    assert.match(ready.checkpointHash,/^[a-f0-9]{64}$/);
    adapter.receive('coordination_ready',{roundId:'r',updateCount:140,checkpointHash:ready.checkpointHash});
    if(locked){
      assert.equal(adapter.phase,'releasing');
      const release=await waitOperation('release');
      observation.sample={counter:4,updateCount:140,speedup:1};
      await reply(release,{updateCount:140,held:false});
      assert.equal(adapter.phase,'running');
      assert.equal(sent.at(-1).kind,'participant_released');
      controls=false;await adapter.poll();
      assert.equal(adapter.fault,'NATIVE_CONTROLS_LOST');
    }
    assert.equal(adapter.phase,'halted');assert.equal(disconnected,1);assert.equal(lease.phase,'closed');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(nativeControls.filter(command=>command.control==='halt').length,1,'participant fault requests one typed native halt without retry');
    assert.deepEqual(nativeControls[0],{control:'halt',epoch:'1',generation:'0'});
    assert.equal(nativeEvents.some(event=>event.event==='native_runtime_halt_confirmed'&&event.gameWorldReceipt===true),true);
    assert.equal(nativeClosed,0,'a confirmed terminal park does not use the fail-stop close');
    const halt=await waitOperation('halt');
    assert.equal(halt.operation,'halt');
    assert.notEqual(adapter.haltState,'confirmed');
    observation.sample={counter:5,updateCount:140,speedup:0};
    await reply(halt,{held:true,updateCount:140});
    assert.equal(adapter.haltState,'confirmed');
    health=false;
    for(let i=0;i<6;i++){
      time+=1000;observation.sample.counter++;
      await adapter.poll();assert.equal(adapter.haltState,'confirmed','fresh stopped observations survive a failed session');
    }
    observation.sample.counter++;observation.sample.speedup=1;
    await adapter.poll();assert.equal(adapter.haltState,'unknown','external resume revokes stopped-state proof');
  } finally {await adapter?.close();await rm(root,{recursive:true,force:true});}
});

test('native runtime disconnect latches the participant, issues one typed halt, and closes fail-stop when terminal state is unknown',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-native-disconnect-')),directory=path.join(root,'tf3mp_status_1');await mkdir(directory);
  const native=new EventEmitter(),controls=[],events=[];let disconnected=0,adapter,nativeClosed=0;
  native.requireCapability=capability=>assert.ok(['session.bind','simulation.hold','engine.halt','simulation.gate-receipts.v1'].includes(capability));
  native.bindSession=async()=>({status:'accepted',boundSessionId:'native.session:2',boundRole:'participant'});
  native.gateControl=async command=>{controls.push(command);return {status:'halt_requested',...command,haltGeneration:command.generation};};
  native.awaitGateEvent=async()=>{throw new Error('NATIVE_GATE_EVENT_UNKNOWN_NO_RETRY');};
  native.close=()=>{nativeClosed++;};
  const lease={phase:'active',get active(){return this.phase==='active';},stop(){this.phase='closed';}};
  const bridge={nonce:'b'.repeat(32),engineObservation:{available:true,sample:{counter:1,updateCount:100,speedup:1}},async startCoordinationLease(){return lease;}};
  try {
    adapter=await createEngineSessionAdapter({directory,bridge,playerId:'a',companies:new Map([['a',7],['b',9]]),healthy:()=>true,
      controlsReady:()=>true,send:()=>{},disconnect:()=>disconnected++,nativeRuntime:{client:native,sessionId:'native.session:2',role:'participant',gateControl:native.gateControl,awaitGateEvent:native.awaitGateEvent,logger:event=>events.push(event)}});
    native.emit('disconnect','NATIVE_RUNTIME_IPC_DISCONNECTED');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(adapter.phase,'halted');assert.equal(adapter.fault,'NATIVE_RUNTIME_DISCONNECTED');assert.equal(disconnected,1);
    assert.deepEqual(controls,[{control:'halt',epoch:'1',generation:'0'}]);
    assert.equal(nativeClosed,1);
    assert.deepEqual(events.filter(event=>event.event==='native_runtime_halt_unknown'),[{level:'error',event:'native_runtime_halt_unknown',reason:'NATIVE_RUNTIME_DISCONNECTED',code:'NATIVE_GATE_EVENT_UNKNOWN_NO_RETRY',control:'halt',epoch:'1',generation:'0',noRetry:true,engineHaltConfirmed:false,failStopClientClosed:true,gameWorldReceipt:false}]);
  } finally {await adapter?.close();await rm(root,{recursive:true,force:true});}
});

test('invalid native binding receipt rejects adapter setup before a lease can start',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-native-bind-')),directory=path.join(root,'tf3mp_status_1');await mkdir(directory);
  const native=new EventEmitter();let leaseStarted=false;
  native.requireCapability=()=>{};native.bindSession=async()=>({status:'accepted',boundSessionId:'other',boundRole:'participant'});
  native.gateControl=async command=>({status:'halt_requested',...command,haltGeneration:command.generation});
  native.awaitGateEvent=async command=>({event:'terminal_parked',...command,haltGeneration:command.generation});
  native.close=()=>{};
  const bridge={nonce:'d'.repeat(32),engineObservation:{available:true,sample:{counter:1,updateCount:100,speedup:1}},async startCoordinationLease(){leaseStarted=true;}};
  try {
    await assert.rejects(createEngineSessionAdapter({directory,bridge,playerId:'a',companies:new Map([['a',7],['b',9]]),healthy:()=>true,
      controlsReady:()=>true,send:()=>{},disconnect:()=>{},nativeRuntime:{client:native,sessionId:'native.session:4',role:'participant',gateControl:native.gateControl,awaitGateEvent:native.awaitGateEvent,logger:()=>{}}}),/INVALID_BIND_RECEIPT/);
    assert.equal(leaseStarted,false);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('adapter reuses the gate binding with real-client semantics instead of rebinding',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-native-hold-')),directory=path.join(root,'tf3mp_status_1');await mkdir(directory);
  const native=new EventEmitter();let adapter;
  let bindCalls=0;
  native.requireCapability=()=>{};
  native.binding=Object.freeze({sessionId:'native.session:3',role:'participant',receipt:Object.freeze({status:'accepted',boundSessionId:'native.session:3',boundRole:'participant'})});
  native.bindSession=async()=>{bindCalls++;throw new Error('NATIVE_RUNTIME_SESSION_ALREADY_BOUND');};
  native.gateControl=async command=>({status:'halt_requested',...command,haltGeneration:command.generation});
  native.awaitGateEvent=async command=>({event:'terminal_parked',...command,haltGeneration:command.generation});
  native.close=()=>{};
  const lease={phase:'active',get active(){return this.phase==='active';},stop(){this.phase='closed';}};
  const bridge={nonce:'c'.repeat(32),engineObservation:{available:true,sample:{counter:1,updateCount:100,speedup:1}},async startCoordinationLease(){return lease;}};
  try {
    adapter=await createEngineSessionAdapter({directory,bridge,playerId:'a',companies:new Map([['a',7],['b',9]]),healthy:()=>true,
      controlsReady:()=>true,send:()=>{},disconnect:()=>{},nativeRuntime:{client:native,sessionId:'native.session:3',role:'participant',gateControl:native.gateControl,awaitGateEvent:native.awaitGateEvent,logger:()=>{}}});
    adapter.receive('coordination_capture',{roundId:'r',updateCount:140,players:[{playerId:'a',companyEntity:7},{playerId:'b',companyEntity:9}]});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(bindCalls,0);assert.equal(adapter.phase,'binding_session');
  } finally {await adapter?.close();await rm(root,{recursive:true,force:true});}
});
