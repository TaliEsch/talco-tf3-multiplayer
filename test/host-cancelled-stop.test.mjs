import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostCancelledStop,createJoinCancelledStop} from '../src/host-cancelled-stop.mjs';

const baseline={active:true,saturated:false,factoryHits:'2',admissionHits:'3',
  correlatedHits:'4',droppedCandidates:'0',callbackHits:'5',sendReturnHits:'6',
  marshalerReturnHits:'7',postSendBodyCorrelatedHits:'8',
  dispatchVehicleMatchedHits:'0',processorCompleteVehicleMatchedHits:'0'};
const action={...baseline,factoryHits:'3',admissionHits:'4',correlatedHits:'5',
  callbackHits:'6',sendReturnHits:'7',marshalerReturnHits:'8',postSendBodyCorrelatedHits:'9',
  active:true,saturated:false,latestValid:true,latestCallbackValid:true,latestMarshalerValid:true,
  latestPostSendBodyValid:true,latestCallbackMatchesAdmissionStorage:true,
  latestMarshalerMatchesAdmissionStorage:true,latestMarshalerMatchesCallbackStorage:true,
  latestSendReturnMatchesAdmissionStorage:true,latestEntryResultZero:true,
  latestCallbackShapeMatches:true,latestEntity:77,latestStopped:1,
  latestCallbackEntity:77,latestCallbackStopped:1,latestMarshalerEntity:77,
  latestMarshalerStopped:1,latestPostSendBodyEntity:77,latestPostSendBodyStopped:1,
  latestCallbackResult:0,latestMarshalerResult:0,
  latestCorrelatedAdmissionInvocation:'23',latestSendReturnInvocation:'23',
  latestPostSendBodyInvocation:'23',latestPostSendBodyThread:11,
  latestCorrelatedAdmissionThread:11};
const state={state:'completed',expectedInvocation:'23',claimedInvocation:'23',
  expectedEntity:77,claimedEntity:77,expectedStopped:1,claimedStopped:1,
  callbackResultZero:true,sendReturn:true,postSendBody:true};

function fixture({stopped=1,enableExperimentalStart=false,
  nativeState={...state,expectedStopped:stopped,claimedStopped:stopped},
  nativeAction={...action,latestStopped:stopped,latestCallbackStopped:stopped,
    latestMarshalerStopped:stopped,latestPostSendBodyStopped:stopped},
  afterStopFlag=1-stopped,completedStopFlag=stopped,
  rejectCode=null,permitError=null,releaseDelayMs=0,
  clientSequence=0,prepareClientSequence=clientSequence,prepareRunning=stopped===0,
  onArm=()=>{},armError=null}={}){
  const sent=[],capabilities=[],arms=[],permitRequests=[],events=[];
  let observer=null,inspections=0,halts=0,pings=0,permits=0,closes=0,
    inspectedWhileHeld=false;
  const client={requireCapability:name=>capabilities.push(name),control:async()=>({phase:++pings}),
    vehicleCancelArmObservation:ping=>ping.phase===1?{state:'disabled'}:nativeState,
    passiveVehicleActionObservation:ping=>ping.phase===1?baseline:nativeAction,
    armVehicleCancel:async request=>{arms.push(request);onArm();if(armError)throw armError;
      return {expectedInvocation:'23'};}};
  const connection={playerId:'host',socket:{destroyed:false},
    subscribe(callback){observer=callback;return()=>{observer=null;};},
    send(kind,payload){sent.push({kind,payload});queueMicrotask(()=>{
      if(rejectCode!==null){observer?.({kind:'command_rejected',payload:{code:rejectCode}});return;}
      observer?.({kind:'command_prepare',payload:{command:{originPlayerId:'host',targetCompanyEntity:101,
        targetEntity:77,commandType:'vehicle.setRunning',payload:{running:prepareRunning},
        clientSequence:prepareClientSequence,hostSequence:1}}});
      if(releaseDelayMs>0){
        host.coordinator.phase='awaiting_release';
        bridge.engineObservation={available:true,sample:{speedup:0,updateCount:60}};
        setTimeout(()=>{
          host.coordinator.phase='running';
          bridge.engineObservation={available:true,sample:{speedup:1,updateCount:60}};
        },releaseDelayMs);
      }
      observer?.({kind:'command_completed',payload:{hostSequence:1,updateCount:60,stateHash:'a'.repeat(64)}});
    });}};
  const host={authority:{players:()=>[{playerId:'host',companyEntity:101}]},
    coordinator:{phase:'running',halt:()=>{halts++;}}};
  const bridge={connected:true,engineObservation:{available:true,sample:{speedup:1,updateCount:60}},
    inspectVehicleOwner:async()=>{inspections++;
      if(inspections===3&&host.coordinator.phase!=='running')inspectedWhileHeld=true;
      return {entity:77,company:101,
      stopFlag:inspections===2?afterStopFlag:inspections===3?completedStopFlag:1-stopped,
      revision:3,updateCount:60,tickCount:120};},
    openSingleStopPermit:async request=>{
      const {entity,invocation}=request;permitRequests.push(request);
      assert.equal(entity,77);assert.equal(invocation,'23');permits++;
      if(permitError)throw new Error(permitError);
      return {deadlineUnix:123};},
    closeSingleStopPermit:async()=>{closes++;}};
  const nativeGate={ready:true,client};
  const hostLocal={ready:true,connection};
  return {router:createHostCancelledStop({host,hostLocal,bridge,nativeGate,
    pollMs:25,clientSequence,stopped,enableExperimentalStart,logger:event=>events.push(event)}),sent,arms,
    capabilities,permitRequests,events,
    get inspections(){return inspections;},get halts(){return halts;},
    get permits(){return permits;},get closes(){return closes;},
    get inspectedWhileHeld(){return inspectedWhileHeld;}};
}

test('completed native cancellation enters host loopback ordering once and awaits completion',async()=>{
  const f=fixture();
  const {arm,completion}=await f.router.start(77);
  assert.equal(arm.expectedInvocation,'23');
  assert.deepEqual(await completion,{entity:77,company:101,hostSequence:1,
    updateCount:60,stateHash:'a'.repeat(64),nativeInvocation:'23',observedStopFlag:1,
    observedRevision:3,observedUpdateCount:60,observedTickCount:120});
  assert.equal(f.inspections,3);
  assert.deepEqual(f.sent[0],{kind:'action_request',payload:{clientSequence:0,
    commandType:'vehicle.setRunning',originPlayerId:'host',targetCompanyEntity:101,
    targetEntity:77,payload:{running:false}}});
  assert.equal(f.halts,0);
  assert.equal(f.permits,1);assert.equal(f.closes,1);
  await assert.rejects(f.router.start(77),/ALREADY_ATTEMPTED/);
});

test('experimental Start requires explicit opt-in and keeps the native and Host directions bound',async()=>{
  assert.throws(()=>fixture({stopped:0}),/HOST_CANCELLED_START_EXPERIMENT_DISABLED/);
  const f=fixture({stopped:0,enableExperimentalStart:true});
  const {completion,armRequestedAt,stopped}=await f.router.start(77);
  assert.equal(stopped,0);assert.ok(armRequestedAt<=Date.now());
  assert.deepEqual(await completion,{entity:77,company:101,hostSequence:1,
    updateCount:60,stateHash:'a'.repeat(64),nativeInvocation:'23',stopped:0,
    observedStopFlag:0,observedRevision:3,observedUpdateCount:60,observedTickCount:120});
  assert.deepEqual(f.arms,[{entity:77,stopped:0,ttlMs:5000}]);
  assert.deepEqual(f.permitRequests,[{entity:77,invocation:'23',stopped:0}]);
  assert.ok(f.capabilities.includes('diagnostic.vehicle-start-cancel-arm.v1'));
  const permit=f.events.find(event=>event.event==='host_cancelled_stop_permit_ready');
  assert.equal(permit.stopped,0);assert.equal(permit.armRequestedAt,armRequestedAt);
  assert.deepEqual(f.sent,[{kind:'action_request',payload:{clientSequence:0,
    commandType:'vehicle.setRunning',originPlayerId:'host',targetCompanyEntity:101,
    targetEntity:77,payload:{running:true}}}]);
  assert.equal(f.inspections,3);assert.equal(f.halts,0);
  await assert.rejects(f.router.start(77),/ALREADY_ATTEMPTED/);
});

test('experimental Start rejects a wrong Host prepare direction and correlated native dispatch',async()=>{
  const wrongPrepare=fixture({stopped:0,enableExperimentalStart:true,prepareRunning:false});
  const {completion}=await wrongPrepare.router.start(77);
  await assert.rejects(completion,/HOST_CANCELLED_STOP_PREPARE_MISMATCH/);
  assert.equal(wrongPrepare.sent.length,1);assert.equal(wrongPrepare.halts,1);
  const dispatched=fixture({stopped:0,enableExperimentalStart:true,
    nativeAction:{...action,latestStopped:0,latestCallbackStopped:0,
      latestMarshalerStopped:0,latestPostSendBodyStopped:0,
      dispatchVehicleMatchedHits:'1'}});
  const second=await dispatched.router.start(77);
  await assert.rejects(second.completion,/NATIVE_START_ORIGINAL_ACTION_DISPATCHED/);
  assert.equal(dispatched.sent.length,0);assert.equal(dispatched.halts,1);
});

test('a changed prepare sequence rejects a submitted cancelled Stop without retry',async()=>{
  const f=fixture({clientSequence:1,prepareClientSequence:0});
  const {completion}=await f.router.start(77);
  await assert.rejects(completion,/HOST_CANCELLED_STOP_PREPARE_MISMATCH/);
  assert.equal(f.sent.length,1);
  assert.equal(f.sent[0].payload.clientSequence,1);
  assert.equal(f.halts,1);
  await assert.rejects(f.router.start(77),/ALREADY_ATTEMPTED/);
});

test('invalid cancellation client sequences are rejected before native arming',()=>{
  let arms=0;
  for(const clientSequence of [-1,1.5,Number.MAX_SAFE_INTEGER+1,NaN,null])
    assert.throws(()=>fixture({clientSequence,onArm:()=>{arms++;}}),
      /INVALID_HOST_CANCELLED_STOP_OPTIONS/);
  assert.equal(arms,0);
});

test('final owner readback waits for the released running game clock',async()=>{
  const f=fixture({releaseDelayMs:50});
  const {completion}=await f.router.start(77);
  assert.equal((await completion).observedStopFlag,1);
  assert.equal(f.inspectedWhileHeld,false);
  assert.equal(f.inspections,3);
  assert.equal(f.halts,0);
});

test('failed GUI Stop permit halts an already armed native action without ordering',async()=>{
  const f=fixture({permitError:'SINGLE_STOP_PERMIT_TIMEOUT'});
  await assert.rejects(f.router.start(77),/SINGLE_STOP_PERMIT_TIMEOUT/);
  assert.equal(f.permits,1);assert.equal(f.closes,1);
  assert.equal(f.sent.length,0);assert.equal(f.halts,1);
});

test('rejected or malformed native arm halts without permit, Host order, or retry',async()=>{
  for(const message of ['NATIVE_RUNTIME_IPC_VEHICLE_CANCEL_REJECTED',
    'INVALID_VEHICLE_CANCEL_ARM_RECEIPT']){
    let arms=0;
    const failure=new Error(message),f=fixture({armError:failure,onArm:()=>{arms++;}});
    await assert.rejects(f.router.start(77),error=>error===failure);
    assert.equal(f.router.attempted,true);
    assert.equal(arms,1);
    assert.equal(f.halts,1);
    assert.equal(f.permits,0);
    assert.equal(f.closes,0);
    assert.equal(f.sent.length,0);
    await assert.rejects(f.router.start(77),/ALREADY_ATTEMPTED/);
    assert.equal(arms,1);
  }
});

test('uncorrelated native completion cannot enter host ordering',async()=>{
  const f=fixture({nativeState:{...state,postSendBody:false}});
  const {completion}=await f.router.start(77);
  await assert.rejects(completion,/NOT_CONFIRMED/);
  assert.equal(f.sent.length,0);
  assert.equal(f.inspections,1);
  assert.equal(f.halts,1);
  assert.equal(f.closes,1);
});

test('extra native factory or dropped candidate cannot enter host ordering',async()=>{
  for(const nativeAction of [{...action,factoryHits:'4'},
    {...action,droppedCandidates:'1'}]){
    const f=fixture({nativeAction});
    const {completion}=await f.router.start(77);
    await assert.rejects(completion,/NOT_EXACTLY_ONCE/);
    assert.equal(f.sent.length,0);
    assert.equal(f.halts,1);
  }
});

test('normal game application after claimed cancellation blocks host replay',async()=>{
  const f=fixture({afterStopFlag:1});
  const {completion}=await f.router.start(77);
  await assert.rejects(completion,/POSTSTATE_CHANGED/);
  assert.equal(f.sent.length,0);
  assert.equal(f.inspections,2);
  assert.equal(f.halts,1);
});

test('matched engine dispatch after native cancellation blocks Host ordering',async()=>{
  const f=fixture({nativeAction:{...action,dispatchVehicleMatchedHits:'1',
    processorCompleteVehicleMatchedHits:'0'}});
  const {completion}=await f.router.start(77);
  await assert.rejects(completion,/NATIVE_STOP_ORIGINAL_ACTION_DISPATCHED/);
  assert.equal(f.sent.length,0);
  assert.equal(f.halts,1);
});

test('submitted cancellation rejection halts the session without retry',async()=>{
  const f=fixture({rejectCode:'OWNERSHIP_UNAVAILABLE'});
  const {completion}=await f.router.start(77);
  await assert.rejects(completion,/HOST_CANCELLED_STOP_REJECTED:OWNERSHIP_UNAVAILABLE/);
  assert.equal(f.sent.length,1);
  assert.equal(f.halts,1);
});

test('Host completion without the owned vehicle postcondition halts without retry',async()=>{
  const f=fixture({completedStopFlag:0});
  const {completion}=await f.router.start(77);
  await assert.rejects(completion,/POSTCONDITION_UNKNOWN/);
  assert.equal(f.sent.length,1);
  assert.equal(f.inspections,3);
  assert.equal(f.halts,1);
});

for(const stopped of [1,0])test(`Join orders its cancelled ${stopped===0?'Start':'Stop'} at client sequence one`,async()=>{
  let subscriber,halts=0,inspections=0;
  const sent=[];
  const client={requireCapability:()=>{},control:async()=>({phase:++client.pings}),pings:0,
    vehicleCancelArmObservation:ping=>ping.phase===1?{state:'disabled'}:
      {...state,expectedStopped:stopped,claimedStopped:stopped},
    passiveVehicleActionObservation:ping=>ping.phase===1?baseline:
      {...action,latestStopped:stopped,latestCallbackStopped:stopped,
        latestMarshalerStopped:stopped,latestPostSendBodyStopped:stopped},
    armVehicleCancel:async()=>({expectedInvocation:'23'})};
  const connection={playerId:'join',socket:{destroyed:false},
    subscribe:fn=>{subscriber=fn;return()=>{subscriber=null;}},
    send:(kind,payload)=>{sent.push({kind,payload});queueMicrotask(()=>{
      subscriber?.({kind:'command_prepare',payload:{command:{originPlayerId:'join',
        targetCompanyEntity:202,targetEntity:77,commandType:'vehicle.setRunning',
        payload:{running:stopped===0},clientSequence:1,hostSequence:2}}});
      subscriber?.({kind:'command_completed',payload:{hostSequence:2,updateCount:60,
        stateHash:'a'.repeat(64),speedup:2}});
    });}};
  const bridge={connected:true,engineObservation:{available:true,sample:{companyEntity:202,speedup:2,updateCount:60}},
    inspectVehicleOwner:async()=>({entity:77,company:202,
      stopFlag:++inspections===3?stopped:1-stopped,
      revision:3,updateCount:60,tickCount:120}),
    openSingleStopPermit:async()=>({deadlineUnix:123}),closeSingleStopPermit:async()=>{}};
  const joinBootstrap={failed:false,attachment:{ready:true,adapter:{phase:'running'}}};
  if(stopped===0)assert.throws(()=>createJoinCancelledStop({connection,
    companyGrant:{companyEntity:202},joinBootstrap,bridge,nativeGate:{ready:true,client},
    halt:()=>{},stopped}),/HOST_CANCELLED_START_EXPERIMENT_DISABLED/);
  const router=createJoinCancelledStop({connection,companyGrant:{companyEntity:202},
    joinBootstrap,bridge,nativeGate:{ready:true,client},halt:()=>{halts++;},
    pollMs:25,clientSequence:1,stopped,enableExperimentalStart:stopped===0});
  const {completion}=await router.start(77);
  assert.equal((await completion).hostSequence,2);
  assert.deepEqual(sent[0],{kind:'action_request',payload:{clientSequence:1,
    commandType:'vehicle.setRunning',originPlayerId:'join',targetCompanyEntity:202,
    targetEntity:77,payload:{running:stopped===0}}});
  assert.equal(inspections,3);assert.equal(halts,0);
  await assert.rejects(router.start(77),/ALREADY_ATTEMPTED/);
});

test('Join cannot arm if its selected game company differs from its grant',async()=>{
  let arms=0,halts=0;
  const client={requireCapability:()=>{},armVehicleCancel:async()=>{arms++;},control:async()=>({})};
  const connection={playerId:'join',socket:{destroyed:false},subscribe:()=>()=>{},send:()=>{}};
  const bridge={connected:true,engineObservation:{available:true,sample:{companyEntity:101}},
    inspectVehicleOwner:async()=>{throw new Error('must not inspect');},
    openSingleStopPermit:async()=>{},closeSingleStopPermit:async()=>{}};
  const router=createJoinCancelledStop({connection,companyGrant:{companyEntity:202},
    joinBootstrap:{failed:false,attachment:{ready:true,adapter:{phase:'running'}}},
    bridge,nativeGate:{ready:true,client},halt:()=>{halts++;}});
  await assert.rejects(router.start(77),/CONTEXT_UNAVAILABLE/);
  assert.equal(arms,0);assert.equal(halts,0);
});

for(const stopped of [0,1])test(`foreign Join ${stopped===0?'Start':'Stop'} is rejected before native permission or transport`,async()=>{
  const effects=[];
  const connection={playerId:'join',socket:{destroyed:false},
    subscribe:()=>{effects.push('subscribe');return()=>{};},send:()=>effects.push('send')};
  const bridge={connected:true,
    engineObservation:{available:true,sample:{companyEntity:28619,updateCount:898,speedup:1}},
    inspectVehicleOwner:async request=>{
      assert.deepEqual(request,{entity:27989,company:28619});
      throw new Error('VEHICLE_OWNER_NOT_CONFIRMED');
    },
    openSingleStopPermit:async()=>effects.push('permit'),
    closeSingleStopPermit:async()=>effects.push('close')};
  const client={requireCapability:()=>{},
    control:async()=>effects.push('control'),armVehicleCancel:async()=>effects.push('arm')};
  const router=createJoinCancelledStop({connection,companyGrant:{companyEntity:28619},
    joinBootstrap:{failed:false,attachment:{ready:true,adapter:{phase:'running'}}},
    bridge,nativeGate:{ready:true,client},halt:()=>effects.push('halt'),
    stopped,enableExperimentalStart:stopped===0});
  await assert.rejects(router.start(27989),/^Error: VEHICLE_OWNER_NOT_CONFIRMED$/);
  assert.deepEqual(effects,[]);
  await assert.rejects(router.start(27989),/ALREADY_ATTEMPTED/);
  assert.deepEqual(effects,[]);
});
