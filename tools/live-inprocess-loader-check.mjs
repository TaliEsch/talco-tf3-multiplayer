import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NativeRuntimeClient} from '../src/native-runtime-client.mjs';
import {startGameBridge} from '../src/game-bridge.mjs';

const usage='usage: node tools/live-inprocess-loader-check.mjs [TF3 exe] [--bridge-dir <absolute tf3mp_status_1 directory>]';
const input=process.argv.slice(2);
let requestedExe=null,bridgeDirectory=null;
for(let index=0;index<input.length;index++){
  const argument=input[index];
  if(argument==='--bridge-dir'){
    assert.equal(bridgeDirectory,null,usage);
    bridgeDirectory=input[++index];
    assert.ok(bridgeDirectory&&!bridgeDirectory.startsWith('--'),usage);
  }else{
    assert.ok(!argument.startsWith('--')&&requestedExe===null,usage);
    requestedExe=argument;
  }
}
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
if(bridgeDirectory)bridge=await startGameBridge({directory:bridgeDirectory,intervalMs:100,staleMs:3000,
  logger:event=>process.stderr.write(`${JSON.stringify(event)}\n`)});
for(let attempt=0;attempt<180&&!client;attempt++){
  try{client=await NativeRuntimeClient.connect({pipe,token,timeoutMs:500});}
  catch(error){lastError=error;await new Promise(resolve=>setTimeout(resolve,500));}
}
if(!client)throw new Error(`LIVE_INPROCESS_RUNTIME_UNAVAILABLE:${lastError?.message??'UNKNOWN'}`);
try{
  if(client.handshake.engineObserver!==true)throw new Error(`INPROCESS_OBSERVER_START_FAILED:${client.handshake.observerStartStatus??'UNKNOWN'}`);
  assert.deepEqual(client.capabilities,['transport.health','session.bind','qualification.inprocess.observer']);
  assert.deepEqual(client.handshake,{engineObserver:true,productionQualified:false,guiFreezes:false});
  const sessionId=`loader.check:${launchedAt}`;
  const binding=await client.bindSession({sessionId,role:'host'});
  assert.equal(binding.boundSessionId,sessionId);
  assert.equal(binding.boundRole,'host');
  let ping=await client.control('ping');
  assert.equal(ping.status,'accepted');
  assert.equal(ping.engineObserver,true);
  assert.equal(ping.observationActive,true);
  process.stdout.write(`${JSON.stringify({event:'tf3-inprocess-observer-awaiting-world',launchPid:child.pid,
    observationHits:ping.observationHits,observationThread:ping.observationThread})}\n`);
  const observationDeadline=Date.now()+180000;
  while(ping.observationHits===0&&Date.now()<observationDeadline){
    await new Promise(resolve=>setTimeout(resolve,250));
    ping=await client.control('ping');
  }
  assert.equal(ping.observationCrossThread,false);
  assert.equal(ping.observationSaturated,false);
  assert.ok(Number.isSafeInteger(ping.observationHits)&&ping.observationHits>0,'INPROCESS_OBSERVER_DID_NOT_REACH_WORLD_BOUNDARY');
  assert.ok(Number.isInteger(ping.observationThread)&&ping.observationThread>0);
  let correlation=null;
  if(bridge){
    const bridgeObservationDeadline=Date.now()+180000;
    while((!bridge.connected||!bridge.engineObservation.available)&&Date.now()<bridgeObservationDeadline)await new Promise(resolve=>setTimeout(resolve,100));
    assert.ok(bridge.connected&&bridge.engineObservation.available,'GAME_BRIDGE_OBSERVATION_UNAVAILABLE');
    // Loading a disposable world can consume almost the entire observation
    // allowance. Correlation needs its own window after the bridge is live.
    ping=await client.control('ping');
    const first={observationHits:ping.observationHits,...bridge.engineObservation.sample};
    let previous=first,last=first,samples=1;
    const correlationDeadline=Date.now()+180000;
    while(Date.now()<correlationDeadline&&(last.observationHits-first.observationHits<128||last.updateCount-first.updateCount<8)){
      await new Promise(resolve=>setTimeout(resolve,100));
      ping=await client.control('ping');
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
  await client.control('shutdown');
  shutdownSent=true;
  process.stdout.write(`${JSON.stringify({event:'tf3-inprocess-loader-qualified',launchPid:child.pid,
    capabilities:client.capabilities,handshake:client.handshake,binding:{sessionId,role:'host'},
    ping:{status:ping.status,state:ping.state,engineObserver:ping.engineObserver,
      observationHits:ping.observationHits,observationThread:ping.observationThread,
      observationActive:ping.observationActive,observationCrossThread:ping.observationCrossThread},
    ...(correlation?{correlation}:{}),elapsedMs:Date.now()-launchedAt})}\n`);
}finally{
  if(!shutdownSent)await client.control('shutdown').catch(()=>{});
  client.close();
  await bridge?.close().catch(()=>{});
}
