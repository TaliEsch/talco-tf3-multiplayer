import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NativeRuntimeClient} from '../src/native-runtime-client.mjs';
import {startGameBridge} from '../src/game-bridge.mjs';
import {createLiveControlIdBudget,LIVE_CONTROL_POLL_INTERVAL_MS,LIVE_CONTROL_WAIT_WINDOW_MS} from './live-inprocess-control-budget.mjs';

const usage='usage: node tools/live-inprocess-loader-check.mjs [TF3 exe] [--bridge-dir <absolute tf3mp_status_1 directory>] (--gate-detach|--gate-halt)';
const input=process.argv.slice(2);
let requestedExe=null,bridgeDirectory=null,gateMode=null;
for(let index=0;index<input.length;index++){
  const argument=input[index];
  if(argument==='--bridge-dir'){
    assert.equal(bridgeDirectory,null,usage);
    bridgeDirectory=input[++index];
    assert.ok(bridgeDirectory&&!bridgeDirectory.startsWith('--'),usage);
  }else if(argument==='--gate-detach'){
    assert.equal(gateMode,null,usage);gateMode='detach';
  }else if(argument==='--gate-halt'){
    assert.equal(gateMode,null,usage);gateMode='halt';
  }else{
    assert.ok(!argument.startsWith('--')&&requestedExe===null,usage);
    requestedExe=argument;
  }
}
assert.ok(gateMode!==null,usage);
if(bridgeDirectory!==null)assert.ok(path.isAbsolute(bridgeDirectory)&&path.basename(bridgeDirectory)==='tf3mp_status_1','INVALID_BRIDGE_DIRECTORY');
const exe=requestedExe??'E:\\Steam\\steamapps\\common\\Transport Fever 3\\TransportFever3.exe';
const handoff=fileURLToPath(new URL('../dist/native-loader/TF3NativeSessionHandoff.exe',import.meta.url));
assert.equal(process.platform,'win32','WINDOWS_REQUIRED');
assert.ok(existsSync(exe),'TF3_EXECUTABLE_MISSING');
assert.ok(existsSync(handoff),'NATIVE_SESSION_HANDOFF_MISSING');
const pipe=`tf3mp_live_${randomBytes(10).toString('hex')}`;
const token=randomBytes(32).toString('hex');
const launchedAt=Date.now();
const handoffEnvironment={...process.env,TF3_MP_NATIVE_PIPE:pipe,TF3_MP_NATIVE_TOKEN:token};
const prepared=spawnSync(handoff,['--directory',path.dirname(exe)],{env:handoffEnvironment,stdio:'ignore',windowsHide:true});
assert.equal(prepared.status,0,`NATIVE_SESSION_HANDOFF_FAILED:${prepared.status}`);
const child=spawn(exe,[],{cwd:path.dirname(exe),
  // Deliberately do not pass credentials to TF3.  The one-shot handoff is the
  // only live-game path and must be consumed even when Steam does not relaunch.
  env:process.env,detached:true,stdio:'ignore',windowsHide:false});
child.unref();
let client,bridge,lastError,shutdownSent=false;
const controlIds=createLiveControlIdBudget();
if(bridgeDirectory)bridge=await startGameBridge({directory:bridgeDirectory,intervalMs:100,staleMs:3000,
  logger:event=>process.stderr.write(`${JSON.stringify(event)}\n`)});
for(let attempt=0;attempt<180&&!client;attempt++){
  try{client=await NativeRuntimeClient.connect({pipe,token,timeoutMs:500});}
  catch(error){lastError=error;await new Promise(resolve=>setTimeout(resolve,500));}
}
if(!client)throw new Error(`LIVE_INPROCESS_RUNTIME_UNAVAILABLE:${lastError?.message??'UNKNOWN'}`);
try{
  if(client.handshake.engineObserver!==true)throw new Error(`INPROCESS_OBSERVER_START_FAILED:${client.handshake.observerStartStatus??'UNKNOWN'}`);
  const passiveCapabilities=['transport.health','session.bind','qualification.inprocess.observer'];
  const gateCapabilities=[...passiveCapabilities,'qualification.inprocess.gate','simulation.hold','engine.halt','simulation.gate-receipts.v1','engine.detach'];
  assert.deepEqual(client.capabilities,gateCapabilities);
  assert.deepEqual(client.handshake,{engineObserver:true,productionQualified:true,guiFreezes:true});
  const sessionId=`loader.check:${launchedAt}`;
  const binding=await controlIds.issue(()=>client.bindSession({sessionId,role:'host'}));
  assert.equal(binding.boundSessionId,sessionId);
  assert.equal(binding.boundRole,'host');
  let ping=await controlIds.issue(()=>client.control('ping'));
  assert.equal(ping.status,'accepted');
  assert.equal(ping.engineObserver,true);
  assert.equal(ping.observationActive,true);
  process.stdout.write(`${JSON.stringify({event:'tf3-inprocess-observer-awaiting-world',launchPid:child.pid,
    observationHits:ping.observationHits,observationThread:ping.observationThread})}\n`);
  const observationDeadline=Date.now()+LIVE_CONTROL_WAIT_WINDOW_MS;
  while(ping.observationHits===0&&Date.now()<observationDeadline){
    await new Promise(resolve=>setTimeout(resolve,LIVE_CONTROL_POLL_INTERVAL_MS));
    ping=await controlIds.issue(()=>client.control('ping'));
  }
  assert.equal(ping.observationCrossThread,false);
  assert.equal(ping.observationSaturated,false);
  assert.ok(Number.isSafeInteger(ping.observationHits)&&ping.observationHits>0,'INPROCESS_OBSERVER_DID_NOT_REACH_WORLD_BOUNDARY');
  assert.ok(Number.isInteger(ping.observationThread)&&ping.observationThread>0);
  assert.ok(Number.isSafeInteger(ping.observationMinimumStackHeadroom)&&ping.observationMinimumStackHeadroom>0,
    'INPROCESS_OBSERVER_STACK_HEADROOM_UNAVAILABLE');
  assert.ok(Number.isInteger(ping.observationCfgFlags)&&ping.observationCfgFlags>=0&&
    Number.isInteger(ping.observationCetFlags)&&ping.observationCetFlags>=0,
  'INPROCESS_OBSERVER_MITIGATION_POLICY_UNAVAILABLE');
  assert.equal(ping.observationCfgKnown,true,'INPROCESS_OBSERVER_CFG_POLICY_UNAVAILABLE');
  assert.equal(ping.observationCetKnown,true,'INPROCESS_OBSERVER_CET_POLICY_UNAVAILABLE');
  let correlation=null;
  if(bridge){
    const bridgeObservationDeadline=Date.now()+LIVE_CONTROL_WAIT_WINDOW_MS;
    while((!bridge.connected||!bridge.engineObservation.available)&&Date.now()<bridgeObservationDeadline){
      await new Promise(resolve=>setTimeout(resolve,LIVE_CONTROL_POLL_INTERVAL_MS));
      ping=await controlIds.issue(()=>client.control('ping'));
    }
    assert.ok(bridge.connected&&bridge.engineObservation.available,'GAME_BRIDGE_OBSERVATION_UNAVAILABLE');
    // Loading a disposable world can consume almost the entire observation
    // allowance. Correlation needs its own window after the bridge is live.
    ping=await controlIds.issue(()=>client.control('ping'));
    const first={observationHits:ping.observationHits,...bridge.engineObservation.sample};
    let previous=first,last=first,samples=1;
    const correlationDeadline=Date.now()+LIVE_CONTROL_WAIT_WINDOW_MS;
    while(Date.now()<correlationDeadline&&(last.observationHits-first.observationHits<128||last.updateCount-first.updateCount<8)){
      await new Promise(resolve=>setTimeout(resolve,LIVE_CONTROL_POLL_INTERVAL_MS));
      ping=await controlIds.issue(()=>client.control('ping'));
      const sample=bridge.engineObservation.sample;
      if(!bridge.engineObservation.available||!sample)continue;
      assert.ok(ping.observationHits>=previous.observationHits,'OBSERVER_COUNTER_REGRESSED');
      assert.ok(sample.updateCount>=previous.updateCount&&sample.tickCount>=previous.tickCount,'GAME_BRIDGE_CLOCK_REGRESSED');
      previous=last={observationHits:ping.observationHits,...sample};samples++;
    }
    const deltas={observationHits:last.observationHits-first.observationHits,
      tickCount:last.tickCount-first.tickCount,updateCount:last.updateCount-first.updateCount};
    assert.ok(deltas.observationHits>=128,`OBSERVER_CORRELATION_HITS_INSUFFICIENT:${JSON.stringify({samples,deltas})}`);
    assert.ok(deltas.updateCount>=8,`OBSERVER_CORRELATION_UPDATES_INSUFFICIENT:${JSON.stringify({samples,deltas})}`);
    correlation={samples,first:{observationHits:first.observationHits,counter:first.counter,tickCount:first.tickCount,updateCount:first.updateCount,speedup:first.speedup},
      last:{observationHits:last.observationHits,counter:last.counter,tickCount:last.tickCount,updateCount:last.updateCount,speedup:last.speedup},
      deltas};
  }
  let gateEvidence=null;
  const epoch=String(launchedAt);
  if(gateMode==='halt'){
    // Production adapters fail-stop directly from the initial running
    // generation. Qualify that exact path; held->halt is not a substitute.
    const halt={control:'halt',epoch,generation:'0'};
    const parkedPromise=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('TF3_TERMINAL_PARK_EVENT_TIMEOUT')),10000);
      const listener=frame=>{if(frame.payload?.event==='terminal_parked'&&frame.payload.epoch===epoch&&frame.payload.generation==='0'){
        clearTimeout(timer);client.off('event',listener);resolve(frame.payload);
      }};client.on('event',listener);
    });
    const haltRequested=await controlIds.issue(()=>client.gateControl(halt));
    const terminalParked=await parkedPromise;
    let haltedBridge=null;
    if(bridge){
      const settleDeadline=Date.now()+3000;
      let previous=null,stableSamples=0;
      while(Date.now()<settleDeadline&&stableSamples<5){
        const sample=bridge.engineObservation.available?{...bridge.engineObservation.sample}:null;
        if(sample&&previous&&sample.updateCount===previous.updateCount&&sample.tickCount===previous.tickCount)stableSamples++;
        else stableSamples=0;
        if(sample)previous=sample;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.ok(stableSamples>=5&&previous,'GAME_BRIDGE_DID_NOT_SETTLE_AFTER_DIRECT_TERMINAL_PARK');
      haltedBridge=previous;
    }
    const parkedPing=await controlIds.issue(()=>client.control('ping'));
    await new Promise(resolve=>setTimeout(resolve,750));
    const parkedPingLater=await controlIds.issue(()=>client.control('ping'));
    assert.equal(parkedPingLater.observationHits,parkedPing.observationHits,
      'TF3_BOUNDARY_ADVANCED_AFTER_DIRECT_TERMINAL_PARK');
    const haltedBridgeLater=bridge?.engineObservation.available?{...bridge.engineObservation.sample}:null;
    if(bridge){
      assert.ok(haltedBridge&&haltedBridgeLater,'GAME_BRIDGE_DIRECT_TERMINAL_PARK_OBSERVATION_UNAVAILABLE');
      assert.equal(haltedBridgeLater.updateCount,haltedBridge.updateCount,
        'TF3_WORLD_UPDATE_ADVANCED_AFTER_DIRECT_TERMINAL_PARK');
      assert.equal(haltedBridgeLater.tickCount,haltedBridge.tickCount,
        'TF3_WORLD_TICK_ADVANCED_AFTER_DIRECT_TERMINAL_PARK');
    }
    gateEvidence={haltRequested,terminalParked,terminalHits:parkedPing.observationHits,
      directFromRunning:true,controlTrafficWhileParked:true,
      ...(bridge?{haltedWorld:{tickCount:haltedBridge.tickCount,updateCount:haltedBridge.updateCount}}:{})};
  }else{
    const hold={control:'hold',epoch,generation:'1'};
    const held=await controlIds.issue(()=>client.gateControl(hold));
    assert.equal(held.status,'held');
    let heldBridge=null;
    if(bridge){
      const settleDeadline=Date.now()+3000;
      let previous=null,stableSamples=0;
      while(Date.now()<settleDeadline&&stableSamples<5){
        const sample=bridge.engineObservation.available?{...bridge.engineObservation.sample}:null;
        if(sample&&previous&&sample.updateCount===previous.updateCount&&sample.tickCount===previous.tickCount)stableSamples++;
        else stableSamples=0;
        if(sample)previous=sample;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.ok(stableSamples>=5&&previous,'GAME_BRIDGE_DID_NOT_SETTLE_WHILE_HELD');
      heldBridge=previous;
    }
    const heldPing=await controlIds.issue(()=>client.control('ping'));
    await new Promise(resolve=>setTimeout(resolve,750));
    const heldPingLater=await controlIds.issue(()=>client.control('ping'));
    assert.equal(heldPingLater.observationHits,heldPing.observationHits,'TF3_BOUNDARY_ADVANCED_WHILE_HELD');
    const heldBridgeLater=bridge?.engineObservation.available?{...bridge.engineObservation.sample}:null;
    if(bridge){
      assert.ok(heldBridge&&heldBridgeLater,'GAME_BRIDGE_HELD_OBSERVATION_UNAVAILABLE');
      assert.equal(heldBridgeLater.updateCount,heldBridge.updateCount,'TF3_WORLD_UPDATE_ADVANCED_WHILE_HELD');
      assert.equal(heldBridgeLater.tickCount,heldBridge.tickCount,'TF3_WORLD_TICK_ADVANCED_WHILE_HELD');
    }
    const release={control:'release',epoch,generation:'1'};
    const appliedPromise=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('TF3_RELEASE_APPLIED_EVENT_TIMEOUT')),10000);
      const listener=frame=>{if(frame.payload?.event==='boundary_applied'&&frame.payload.epoch===epoch&&frame.payload.generation==='1'){
        clearTimeout(timer);client.off('event',listener);resolve(frame.payload);
      }};client.on('event',listener);
    });
    const released=await controlIds.issue(()=>client.gateControl(release));
    const applied=await appliedPromise;
    const reheldPing=await controlIds.issue(()=>client.control('ping'));
    assert.equal(reheldPing.observationHits,heldPing.observationHits+1,'TF3_RELEASE_DID_NOT_ADVANCE_EXACTLY_ONE_BOUNDARY');
    let reheldBridge=null;
    if(bridge){
      const reheldDeadline=Date.now()+3000;
      let previous=null,stableSamples=0;
      while(Date.now()<reheldDeadline&&stableSamples<5){
        const sample=bridge.engineObservation.available?{...bridge.engineObservation.sample}:null;
        if(sample&&sample.updateCount>heldBridgeLater.updateCount&&sample.tickCount>heldBridgeLater.tickCount){
          if(previous&&sample.updateCount===previous.updateCount&&sample.tickCount===previous.tickCount)stableSamples++;
          else stableSamples=0;
          previous=sample;
        }
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.ok(stableSamples>=5&&previous,'TF3_WORLD_DID_NOT_ADVANCE_AND_REHOLD_AFTER_RELEASE');
      reheldBridge=previous;
    }
    const detach={control:'detach',epoch,generation:'2'};
    const detachedPromise=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('TF3_DETACHED_EVENT_TIMEOUT')),10000);
      const listener=frame=>{if(frame.payload?.event==='detached'&&frame.payload.epoch===epoch&&frame.payload.generation==='2'){
        clearTimeout(timer);client.off('event',listener);resolve(frame.payload);
      }};client.on('event',listener);
    });
    const preparedDetach=await controlIds.issue(()=>client.gateControl(detach));
    const detached=await detachedPromise;
    const detachedPing=await controlIds.issue(()=>client.control('ping'));
    assert.equal(detachedPing.observationActive,false,'TF3_GATE_STILL_ACTIVE_AFTER_DETACH');
    let resumedBridge=null;
    if(bridge){
      const resumedDeadline=Date.now()+10000;
      while(Date.now()<resumedDeadline){
        const sample=bridge.engineObservation.available?bridge.engineObservation.sample:null;
        if(sample&&sample.updateCount>reheldBridge.updateCount&&sample.tickCount>reheldBridge.tickCount){
          resumedBridge={...sample};break;
        }
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.ok(resumedBridge,'TF3_WORLD_DID_NOT_RESUME_AFTER_DETACH');
    }
    gateEvidence={held,heldHits:heldPing.observationHits,released,applied,
      reheldHits:reheldPing.observationHits,preparedDetach,detached,
      detachedActive:detachedPing.observationActive,
      ...(bridge?{heldWorld:{tickCount:heldBridge.tickCount,updateCount:heldBridge.updateCount},
        reheldWorld:{tickCount:reheldBridge.tickCount,updateCount:reheldBridge.updateCount},
        resumedWorld:{tickCount:resumedBridge.tickCount,updateCount:resumedBridge.updateCount}}:{})};
  }
  await controlIds.issue(()=>client.control('shutdown'));
  shutdownSent=true;
  process.stdout.write(`${JSON.stringify({event:'tf3-inprocess-loader-qualified',launchPid:child.pid,
    capabilities:client.capabilities,handshake:client.handshake,binding:{sessionId,role:'host'},
    ping:{status:ping.status,state:ping.state,engineObserver:ping.engineObserver,
      observationHits:ping.observationHits,observationThread:ping.observationThread,
      observationMinimumStackHeadroom:ping.observationMinimumStackHeadroom,
      observationCfgFlags:ping.observationCfgFlags,observationCetFlags:ping.observationCetFlags,
      observationCfgKnown:ping.observationCfgKnown,observationCetKnown:ping.observationCetKnown,
      observationActive:ping.observationActive,observationCrossThread:ping.observationCrossThread},
    ...(correlation?{correlation}:{}),...(gateEvidence?{gateEvidence}:{}),elapsedMs:Date.now()-launchedAt})}\n`);
}finally{
  if(!shutdownSent){
    try{await controlIds.issue(()=>client.control('shutdown'));}catch{}
  }
  client.close();
  await bridge?.close().catch(()=>{});
}
