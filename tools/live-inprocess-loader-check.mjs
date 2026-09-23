import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NativeRuntimeClient} from '../src/native-runtime-client.mjs';
import {startGameBridge} from '../src/game-bridge.mjs';
import {createLiveControlIdBudget,LIVE_CONTROL_POLL_INTERVAL_MS,LIVE_CONTROL_WAIT_WINDOW_MS,
  LIVE_VEHICLE_ACTION_WAIT_WINDOW_MS} from './live-inprocess-control-budget.mjs';

const usage='usage: node tools/live-inprocess-loader-check.mjs [TF3 exe] [--bridge-dir <absolute tf3mp_status_1 directory>] [--observe-vehicle-action] [--observe-vehicle-completion] [--cancel-vehicle-stop <entity>] (--gate-detach|--gate-halt)';
// The game-side UI writes an observation only every 30 onStep calls. Reading
// the same file five times is not five independent confirmations of a halt.
async function stableFreshWorld(bridge,label,afterWorld=null){
  const deadline=Date.now()+6000;
  let previous=null,stable=0;
  while(Date.now()<deadline){
    const sample=bridge.engineObservation.available?{...bridge.engineObservation.sample}:null;
    if(sample&&(!previous||sample.counter>previous.counter)){
      if(previous&&sample.updateCount===previous.updateCount&&sample.tickCount===previous.tickCount&&
          (!afterWorld||sample.updateCount>afterWorld.updateCount&&sample.tickCount>afterWorld.tickCount))stable++;
      else stable=0;
      previous=sample;
      if(stable>=2)return sample;
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error(`${label}_PUBLIC_CLOCK_DID_NOT_SETTLE:${JSON.stringify({lastSample:previous})}`);
}
async function nextFreshWorld(bridge,afterCounter,label){
  const deadline=Date.now()+4000;
  while(Date.now()<deadline){
    const sample=bridge.engineObservation.available?{...bridge.engineObservation.sample}:null;
    if(sample&&sample.counter>afterCounter)return sample;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error(`${label}_PUBLIC_OBSERVATION_DID_NOT_REFRESH`);
}
const input=process.argv.slice(2);
let requestedExe=null,bridgeDirectory=null,gateMode=null,observeVehicleAction=false,observeVehicleCompletion=false,cancelStopEntity=null;
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
  }else if(argument==='--observe-vehicle-action'){
    assert.equal(observeVehicleAction,false,usage);observeVehicleAction=true;
  }else if(argument==='--observe-vehicle-completion'){
    assert.equal(observeVehicleCompletion,false,usage);observeVehicleCompletion=true;
  }else if(argument==='--cancel-vehicle-stop'){
    assert.equal(cancelStopEntity,null,usage);
    const value=input[++index];
    assert.ok(/^[1-9][0-9]*$/.test(value??''),usage);
    cancelStopEntity=Number(value);
    assert.ok(Number.isInteger(cancelStopEntity)&&cancelStopEntity<=2147483647,usage);
  }else{
    assert.ok(!argument.startsWith('--')&&requestedExe===null,usage);
    requestedExe=argument;
  }
}
assert.ok(gateMode!==null,usage);
assert.ok(!observeVehicleCompletion||observeVehicleAction,usage);
assert.ok(cancelStopEntity===null||observeVehicleCompletion&&gateMode==='detach',usage);
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
  // Save loading can temporarily starve the IPC worker for more than 500 ms.
  // Keep each control timeout comfortably below the native 15-second lease so
  // a genuine stall still fail-stops, without misclassifying bounded loading.
  try{client=await NativeRuntimeClient.connect({pipe,token,timeoutMs:5000});}
  catch(error){lastError=error;await new Promise(resolve=>setTimeout(resolve,500));}
}
if(!client)throw new Error(`LIVE_INPROCESS_RUNTIME_UNAVAILABLE:${lastError?.message??'UNKNOWN'}`);
try{
  if(client.handshake.engineObserver!==true)throw new Error(`INPROCESS_OBSERVER_START_FAILED:${client.handshake.observerStartStatus??'UNKNOWN'}`);
  const passiveCapabilities=['transport.health','session.bind','qualification.inprocess.observer'];
  const gateCapabilities=[...passiveCapabilities,'qualification.inprocess.gate','simulation.hold','engine.halt','simulation.gate-receipts.v1','engine.detach','diagnostic.passive-vehicle-action.v1','vehicle.cancel-arm.v1','diagnostic.vehicle-cancel-arm.v1'];
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
  const passiveVehicle=client.passiveVehicleActionObservation(ping);
  assert.equal(passiveVehicle.active,true);
  assert.equal(passiveVehicle.saturated,false);
  process.stdout.write(`${JSON.stringify({event:'tf3-inprocess-observer-awaiting-world',launchPid:child.pid,
    observationHits:ping.observationHits,observationThread:ping.observationThread,
    passiveVehicleFactoryHits:passiveVehicle.factoryHits,
    passiveVehicleAdmissionHits:passiveVehicle.admissionHits,
    passiveVehicleCorrelatedHits:passiveVehicle.correlatedHits,
    passiveVehicleThread:passiveVehicle.ownerThread,
    passiveVehicleCrossThread:passiveVehicle.crossThread})}\n`);
  // Loading can execute a few world boundaries behind the Start Game splash.
  // An action-ready window must not begin there: require sustained world
  // updates so the operator can interact during the full diagnostic allowance.
  const minimumWorldHits=observeVehicleAction?128:1;
  const observationDeadline=Date.now()+LIVE_CONTROL_WAIT_WINDOW_MS;
  while(ping.observationHits<minimumWorldHits&&Date.now()<observationDeadline){
    await new Promise(resolve=>setTimeout(resolve,LIVE_CONTROL_POLL_INTERVAL_MS));
    ping=await controlIds.issue(()=>client.control('ping'));
  }
  assert.equal(ping.observationCrossThread,false);
  assert.equal(ping.observationSaturated,false);
  assert.ok(Number.isSafeInteger(ping.observationHits)&&ping.observationHits>=minimumWorldHits,
    'INPROCESS_OBSERVER_DID_NOT_REACH_WORLD_BOUNDARY');
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
      assert.equal(ping.observationCrossThread,false,
        'OBSERVER_OWNER_THREAD_CHANGED_DURING_WORLD_CORRELATION');
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
  let vehicleObservation=null,cancelEvidence=null;
  if(observeVehicleAction){
    const baseline=client.passiveVehicleActionObservation(ping);
    if(cancelStopEntity!==null){
      assert.equal(client.vehicleCancelArmObservation(ping).state,'disabled');
      process.stdout.write(`${JSON.stringify({event:'tf3-cancel-vehicle-awaiting-arm',entity:cancelStopEntity,
        instruction:'Select the vehicle and prepare its Stop control, then send ARM on stdin.'})}\n`);
      let armSignal=false;
      process.stdin.setEncoding('utf8');
      process.stdin.on('data',chunk=>{if(chunk.trim()==='ARM')armSignal=true;});
      const armSignalDeadline=Date.now()+600000;
      while(!armSignal&&Date.now()<armSignalDeadline){
        await new Promise(resolve=>setTimeout(resolve,5000));
        ping=await controlIds.issue(()=>client.control('ping'));
      }
      assert.equal(armSignal,true,'TF3_CANCEL_ARM_SIGNAL_TIMEOUT');
      const arm=await controlIds.issue(()=>client.armVehicleCancel({entity:cancelStopEntity,stopped:1,ttlMs:5000}));
      cancelEvidence={arm};
      process.stdout.write(`${JSON.stringify({event:'tf3-cancel-vehicle-armed',entity:cancelStopEntity,
        expectedInvocation:arm.expectedInvocation,deadlineMs:5000})}\n`);
    }
    // The interaction allowance begins only after the world observer (and, when
    // configured, bridge correlation) has reached its ready boundary above.
    // Emit that boundary so a live operator knows when the full action window
    // is available for a start/stop command.
    process.stdout.write(`${JSON.stringify({event:'tf3-passive-vehicle-action-ready',
      factoryHits:baseline.factoryHits,admissionHits:baseline.admissionHits,
      correlatedHits:baseline.correlatedHits,callbackHits:baseline.callbackHits,worldObservationHits:ping.observationHits,
      worldObservationThread:ping.observationThread,
      ...(correlation?{bridgeCorrelation:correlation.deltas}:{})})}\n`);
    const vehicleActionWindowStartedAt=Date.now();
    const deadline=vehicleActionWindowStartedAt+LIVE_VEHICLE_ACTION_WAIT_WINDOW_MS;
    let current=baseline;
    // The callback receipt is independent passive evidence. One operator
    // action must produce exactly one new receipt in the copied callback
    // storage; the checker never invokes or replays that callback.
    while((BigInt(current.callbackHits)<=BigInt(baseline.callbackHits)||
        observeVehicleCompletion&&(BigInt(current.sendReturnHits)<=BigInt(baseline.sendReturnHits)||
          BigInt(current.marshalerReturnHits)<=BigInt(baseline.marshalerReturnHits)||
          BigInt(current.postSendBodyCorrelatedHits)<=BigInt(baseline.postSendBodyCorrelatedHits)))&&Date.now()<deadline){
      await new Promise(resolve=>setTimeout(resolve,LIVE_CONTROL_POLL_INTERVAL_MS));
      ping=await controlIds.issue(()=>client.control('ping'));
      current=client.passiveVehicleActionObservation(ping);
      assert.equal(current.active,true);
      assert.equal(current.saturated,false,'PASSIVE_VEHICLE_ACTION_COUNTER_SATURATED');
      if(cancelStopEntity!==null){
        const armState=client.vehicleCancelArmObservation(ping);
        if(['expired','revoked','failed'].includes(armState.state))
          throw new Error(`TF3_CANCEL_ARM_TERMINAL:${JSON.stringify(armState)}`);
      }
    }
    const actionCounters=JSON.stringify({baseline,current,
      elapsedMs:Date.now()-vehicleActionWindowStartedAt});
    assert.ok(BigInt(current.factoryHits)>BigInt(baseline.factoryHits),
      `PASSIVE_VEHICLE_FACTORY_NOT_OBSERVED:${actionCounters}`);
    assert.ok(BigInt(current.admissionHits)>BigInt(baseline.admissionHits),
      `PASSIVE_VEHICLE_SUBMISSION_NOT_OBSERVED:${actionCounters}`);
    assert.ok(BigInt(current.correlatedHits)>BigInt(baseline.correlatedHits),
      `PASSIVE_VEHICLE_ACTION_NOT_CORRELATED:${actionCounters}`);
    assert.equal(BigInt(current.callbackHits),BigInt(baseline.callbackHits)+1n,
      `PASSIVE_VEHICLE_CALLBACK_NOT_EXACTLY_ONCE:${actionCounters}`);
    assert.equal(current.latestValid,true,'PASSIVE_VEHICLE_ACTION_NOT_CORRELATED');
    assert.equal(current.latestEntryResultZero,true,
      `PASSIVE_VEHICLE_ENTRY_RESULT_NOT_ZERO:${actionCounters}`);
    assert.equal(current.latestCallbackShapeMatches,true,
      `PASSIVE_VEHICLE_CALLBACK_SHAPE_MISMATCH:${actionCounters}`);
    assert.equal(current.latestCallbackValid,true,
      `PASSIVE_VEHICLE_CALLBACK_NOT_OBSERVED:${actionCounters}`);
    assert.equal(current.latestCallbackMatchesAdmissionStorage,true,
      `PASSIVE_VEHICLE_CALLBACK_STORAGE_MISMATCH:${actionCounters}`);
    assert.equal(current.latestCallbackEntity,current.latestEntity,
      `PASSIVE_VEHICLE_CALLBACK_ENTITY_MISMATCH:${actionCounters}`);
    assert.equal(current.latestCallbackStopped,current.latestStopped,
      `PASSIVE_VEHICLE_CALLBACK_STOPPED_MISMATCH:${actionCounters}`);
    if(observeVehicleCompletion){
      assert.equal(BigInt(current.sendReturnHits),BigInt(baseline.sendReturnHits)+1n,
        `PASSIVE_VEHICLE_SEND_RETURN_NOT_EXACTLY_ONCE:${actionCounters}`);
      assert.equal(BigInt(current.marshalerReturnHits),BigInt(baseline.marshalerReturnHits)+1n,
        `PASSIVE_VEHICLE_MARSHALER_RETURN_NOT_EXACTLY_ONCE:${actionCounters}`);
      assert.equal(BigInt(current.postSendBodyCorrelatedHits),BigInt(baseline.postSendBodyCorrelatedHits)+1n,
        `PASSIVE_VEHICLE_POST_SEND_BODY_NOT_CORRELATED_EXACTLY_ONCE:${actionCounters}`);
      assert.equal(current.latestPostSendBodyValid,true,
        `PASSIVE_VEHICLE_POST_SEND_BODY_RECEIPT_INVALID:${actionCounters}`);
      assert.equal(current.latestPostSendBodyInvocation,current.latestCorrelatedAdmissionInvocation,
        `PASSIVE_VEHICLE_POST_SEND_BODY_ADMISSION_MISMATCH:${actionCounters}`);
      assert.equal(current.latestPostSendBodyInvocation,current.latestSendReturnInvocation,
        `PASSIVE_VEHICLE_POST_SEND_BODY_SEND_RETURN_MISMATCH:${actionCounters}`);
      assert.equal(current.latestPostSendBodyEntity,current.latestEntity,
        `PASSIVE_VEHICLE_POST_SEND_BODY_ENTITY_MISMATCH:${actionCounters}`);
      assert.equal(current.latestPostSendBodyStopped,current.latestStopped,
        `PASSIVE_VEHICLE_POST_SEND_BODY_STOPPED_MISMATCH:${actionCounters}`);
      assert.equal(current.latestPostSendBodyThread,current.latestCorrelatedAdmissionThread,
        `PASSIVE_VEHICLE_POST_SEND_BODY_THREAD_MISMATCH:${actionCounters}`);
      assert.equal(current.latestSendReturnMatchesAdmissionStorage,true,
        `PASSIVE_VEHICLE_SEND_RETURN_STORAGE_MISMATCH:${actionCounters}`);
      assert.equal(current.latestMarshalerValid,true,
        `PASSIVE_VEHICLE_MARSHALER_RETURN_INVALID:${actionCounters}`);
      assert.equal(current.latestMarshalerMatchesAdmissionStorage,true,
        `PASSIVE_VEHICLE_MARSHALER_ADMISSION_STORAGE_MISMATCH:${actionCounters}`);
      assert.equal(current.latestMarshalerMatchesCallbackStorage,true,
        `PASSIVE_VEHICLE_MARSHALER_CALLBACK_STORAGE_MISMATCH:${actionCounters}`);
      assert.equal(current.latestMarshalerEntity,current.latestEntity,
        `PASSIVE_VEHICLE_MARSHALER_ENTITY_MISMATCH:${actionCounters}`);
      assert.equal(current.latestMarshalerStopped,current.latestStopped,
        `PASSIVE_VEHICLE_MARSHALER_STOPPED_MISMATCH:${actionCounters}`);
    }
    if(cancelStopEntity!==null){
      assert.equal(current.latestEntity,cancelStopEntity,'CANCEL_VEHICLE_ENTITY_MISMATCH');
      assert.equal(current.latestStopped,1,'CANCEL_VEHICLE_STOPPED_MISMATCH');
      assert.equal(current.latestCallbackResult,0,'CANCEL_CALLBACK_RESULT_NOT_FALSE');
      assert.equal(current.latestMarshalerResult,0,'CANCEL_MARSHALER_RESULT_NOT_FALSE');
      let armState=client.vehicleCancelArmObservation(ping);
      const armDeadline=Date.now()+5000;
      while(armState.state==='claiming'||armState.state==='claimed'||armState.state==='armed'){
        if(Date.now()>=armDeadline)break;
        await new Promise(resolve=>setTimeout(resolve,LIVE_CONTROL_POLL_INTERVAL_MS));
        ping=await controlIds.issue(()=>client.control('ping'));
        armState=client.vehicleCancelArmObservation(ping);
      }
      assert.equal(armState.state,'completed',`CANCEL_NOT_COMPLETED:${JSON.stringify(armState)}`);
      assert.equal(armState.expectedInvocation,cancelEvidence.arm.expectedInvocation);
      assert.equal(armState.claimedInvocation,cancelEvidence.arm.expectedInvocation);
      assert.equal(armState.claimedEntity,cancelStopEntity);
      assert.equal(armState.claimedStopped,1);
      assert.equal(armState.callbackResultZero,true);
      assert.equal(armState.sendReturn,true);
      assert.equal(armState.postSendBody,true);
      cancelEvidence.observation=armState;
      process.stdout.write(`${JSON.stringify({event:'tf3-cancel-vehicle-native-completed',...cancelEvidence})}\n`);
    }
    vehicleObservation=current;
    process.stdout.write(`${JSON.stringify({event:'tf3-passive-vehicle-action-observed',
      factoryHits:current.factoryHits,admissionHits:current.admissionHits,
      correlatedHits:current.correlatedHits,
      droppedCandidates:current.droppedCandidates,ownerThread:current.ownerThread,
      crossThread:current.crossThread,entity:current.latestEntity,
      stopped:current.latestStopped,entryResultZero:current.latestEntryResultZero,
      callbackHits:current.callbackHits,callbackThread:current.callbackThread,
      correlatedAdmissionThread:current.latestCorrelatedAdmissionThread,
      callbackEntity:current.latestCallbackEntity,callbackStopped:current.latestCallbackStopped,
      callbackResult:current.latestCallbackResult,callbackValid:current.latestCallbackValid,
      callbackMatchesAdmissionStorage:current.latestCallbackMatchesAdmissionStorage,
      admissionProgressKnown:current.latestAdmissionProgressKnown,
      admissionProgressEmpty:current.latestAdmissionProgressEmpty,
      callbackShapeMatches:current.latestCallbackShapeMatches,
      ...(observeVehicleCompletion?{sendReturnHits:current.sendReturnHits,
        sendReturnThread:current.sendReturnThread,
        sendReturnMatchesAdmissionStorage:current.latestSendReturnMatchesAdmissionStorage,
        marshalerReturnHits:current.marshalerReturnHits,
        marshalerReturnThread:current.marshalerReturnThread,
        postSendBodyHits:current.postSendBodyHits,
        postSendBodyThread:current.postSendBodyThread,
        postSendBodyBaselineHits:baseline.postSendBodyHits,
        postSendBodyCorrelatedHits:current.postSendBodyCorrelatedHits,
        postSendBodyCorrelatedBaselineHits:baseline.postSendBodyCorrelatedHits,
        postSendBodyInvocation:current.latestPostSendBodyInvocation,
        postSendBodyEntity:current.latestPostSendBodyEntity,
        postSendBodyStopped:current.latestPostSendBodyStopped,
        postSendBodyReceiptThread:current.latestPostSendBodyThread,
        marshalerEntity:current.latestMarshalerEntity,
        marshalerStopped:current.latestMarshalerStopped,
        marshalerResult:current.latestMarshalerResult,
        marshalerMatchesAdmissionStorage:current.latestMarshalerMatchesAdmissionStorage,
        marshalerMatchesCallbackStorage:current.latestMarshalerMatchesCallbackStorage}:{})})}\n`);
  }
  let gateEvidence=null;
  const epoch=String(launchedAt);
  if(bridge&&gateMode==='detach'){
    // The one-native-boundary/public-clock relation has only been qualified at
    // speed 1.  A loaded save may resume at 2x/4x; allow a bounded UI change
    // while control traffic keeps the native lease alive, but never certify an
    // unqualified speed as one world update.
    const normalSpeedDeadline=Date.now()+LIVE_CONTROL_WAIT_WINDOW_MS;
    let requestedNormalSpeed=false;
    while(bridge.engineObservation.sample?.speedup!==1&&Date.now()<normalSpeedDeadline){
      if(!requestedNormalSpeed){
        process.stdout.write(`${JSON.stringify({event:'tf3-normal-speed-required',
          observedSpeedup:bridge.engineObservation.sample?.speedup??null})}\n`);
        requestedNormalSpeed=true;
      }
      await new Promise(resolve=>setTimeout(resolve,LIVE_CONTROL_POLL_INTERVAL_MS));
      ping=await controlIds.issue(()=>client.control('ping'));
    }
    assert.equal(bridge.engineObservation.sample?.speedup,1,
      'TF3_NORMAL_SPEED_NOT_OBSERVED_BEFORE_WORLD_GATE_CHECK');
  }
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
      haltedBridge=await stableFreshWorld(bridge,'DIRECT_TERMINAL_PARK');
    }
    const parkedPing=await controlIds.issue(()=>client.control('ping'));
    await new Promise(resolve=>setTimeout(resolve,750));
    const parkedPingLater=await controlIds.issue(()=>client.control('ping'));
    assert.equal(parkedPingLater.observationHits,parkedPing.observationHits,
      'TF3_BOUNDARY_ADVANCED_AFTER_DIRECT_TERMINAL_PARK');
    const haltedBridgeLater=bridge?await nextFreshWorld(bridge,haltedBridge.counter,'DIRECT_TERMINAL_PARK'):null;
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
      heldBridge=await stableFreshWorld(bridge,'HELD');
    }
    const heldPing=await controlIds.issue(()=>client.control('ping'));
    await new Promise(resolve=>setTimeout(resolve,750));
    const heldPingLater=await controlIds.issue(()=>client.control('ping'));
    assert.equal(heldPingLater.observationHits,heldPing.observationHits,'TF3_BOUNDARY_ADVANCED_WHILE_HELD');
    const heldBridgeLater=bridge?await nextFreshWorld(bridge,heldBridge.counter,'HELD'):null;
    if(bridge){
      assert.ok(heldBridge&&heldBridgeLater,'GAME_BRIDGE_HELD_OBSERVATION_UNAVAILABLE');
      const heldDiagnostics=JSON.stringify({heldBridge,heldBridgeLater,
        nativeHeldHits:heldPing.observationHits,nativeLaterHits:heldPingLater.observationHits,
        observedSpeedup:heldBridgeLater.speedup});
      assert.equal(heldBridgeLater.updateCount,heldBridge.updateCount,
        `TF3_WORLD_UPDATE_ADVANCED_WHILE_HELD:${heldDiagnostics}`);
      assert.equal(heldBridgeLater.tickCount,heldBridge.tickCount,
        `TF3_WORLD_TICK_ADVANCED_WHILE_HELD:${heldDiagnostics}`);
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
      reheldBridge=await stableFreshWorld(bridge,'REHELD_AFTER_RELEASE',heldBridgeLater);
      assert.equal(reheldBridge.updateCount,heldBridgeLater.updateCount+1,
        `TF3_RELEASE_PUBLIC_UPDATE_NOT_EXACTLY_ONE:${JSON.stringify({heldBridgeLater,reheldBridge})}`);
      assert.equal(reheldBridge.tickCount,heldBridgeLater.tickCount+1,
        `TF3_RELEASE_PUBLIC_TICK_NOT_EXACTLY_ONE:${JSON.stringify({heldBridgeLater,reheldBridge})}`);
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
    ...(correlation?{correlation}:{}),...(vehicleObservation?{vehicleObservation}:{}),
    ...(cancelEvidence?{cancelEvidence}:{}),
    ...(gateEvidence?{gateEvidence}:{}),elapsedMs:Date.now()-launchedAt})}\n`);
}finally{
  if(!shutdownSent){
    try{await controlIds.issue(()=>client.control('shutdown'));}catch{}
  }
  client.close();
  await bridge?.close().catch(()=>{});
}
