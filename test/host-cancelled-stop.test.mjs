import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostCancelledStop} from '../src/host-cancelled-stop.mjs';

const baseline={active:true,saturated:false,callbackHits:'5',sendReturnHits:'6',
  marshalerReturnHits:'7',postSendBodyCorrelatedHits:'8'};
const action={...baseline,callbackHits:'6',sendReturnHits:'7',marshalerReturnHits:'8',postSendBodyCorrelatedHits:'9',
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

function fixture({nativeState=state,nativeAction=action,afterStopFlag=0,rejectCode=null}={}){
  const sent=[];let observer=null,inspections=0,halts=0,pings=0;
  const client={requireCapability:()=>{},control:async()=>({phase:++pings}),
    vehicleCancelArmObservation:ping=>ping.phase===1?{state:'disabled'}:nativeState,
    passiveVehicleActionObservation:ping=>ping.phase===1?baseline:nativeAction,
    armVehicleCancel:async()=>({expectedInvocation:'23'})};
  const connection={playerId:'host',socket:{destroyed:false},
    subscribe(callback){observer=callback;return()=>{observer=null;};},
    send(kind,payload){sent.push({kind,payload});queueMicrotask(()=>{
      if(rejectCode!==null){observer?.({kind:'command_rejected',payload:{code:rejectCode}});return;}
      observer?.({kind:'command_prepare',payload:{command:{originPlayerId:'host',targetCompanyEntity:101,
        targetEntity:77,commandType:'vehicle.setRunning',payload:{running:false},clientSequence:0,hostSequence:1}}});
      observer?.({kind:'command_completed',payload:{hostSequence:1,updateCount:60,stateHash:'a'.repeat(64)}});
    });}};
  const host={authority:{players:()=>[{playerId:'host',companyEntity:101}]},
    coordinator:{phase:'running',halt:()=>{halts++;}}};
  const bridge={connected:true,engineObservation:{available:true},
    inspectVehicleOwner:async()=>{inspections++;return {entity:77,company:101,
      stopFlag:inspections===2?afterStopFlag:0};}};
  const nativeGate={ready:true,client};
  const hostLocal={ready:true,connection};
  return {router:createHostCancelledStop({host,hostLocal,bridge,nativeGate,pollMs:25}),sent,
    get inspections(){return inspections;},get halts(){return halts;}};
}

test('completed native cancellation enters host loopback ordering once and awaits completion',async()=>{
  const f=fixture();
  const {arm,completion}=await f.router.start(77);
  assert.equal(arm.expectedInvocation,'23');
  assert.deepEqual(await completion,{entity:77,company:101,hostSequence:1,
    updateCount:60,stateHash:'a'.repeat(64)});
  assert.equal(f.inspections,2);
  assert.deepEqual(f.sent[0],{kind:'action_request',payload:{clientSequence:0,
    commandType:'vehicle.setRunning',originPlayerId:'host',targetCompanyEntity:101,
    targetEntity:77,payload:{running:false}}});
  assert.equal(f.halts,0);
  await assert.rejects(f.router.start(77),/ALREADY_ATTEMPTED/);
});

test('uncorrelated native completion cannot enter host ordering',async()=>{
  const f=fixture({nativeState:{...state,postSendBody:false}});
  const {completion}=await f.router.start(77);
  await assert.rejects(completion,/NOT_CONFIRMED/);
  assert.equal(f.sent.length,0);
  assert.equal(f.inspections,1);
});

test('normal game application after claimed cancellation blocks host replay',async()=>{
  const f=fixture({afterStopFlag:1});
  const {completion}=await f.router.start(77);
  await assert.rejects(completion,/POSTSTATE_CHANGED/);
  assert.equal(f.sent.length,0);
  assert.equal(f.inspections,2);
});

test('submitted cancellation rejection halts the session without retry',async()=>{
  const f=fixture({rejectCode:'OWNERSHIP_UNAVAILABLE'});
  const {completion}=await f.router.start(77);
  await assert.rejects(completion,/HOST_CANCELLED_STOP_REJECTED:OWNERSHIP_UNAVAILABLE/);
  assert.equal(f.sent.length,1);
  assert.equal(f.halts,1);
});
