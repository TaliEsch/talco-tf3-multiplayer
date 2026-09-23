import test from 'node:test';
import assert from 'node:assert/strict';
import {cancelOneLocalStop} from '../src/local-native-cancel-gate.mjs';

const baseline={active:true,saturated:false,factoryHits:'0',admissionHits:'0',
  correlatedHits:'0',droppedCandidates:'0',callbackHits:'0',sendReturnHits:'0',
  marshalerReturnHits:'0',postSendBodyCorrelatedHits:'0'};
const action={...baseline,factoryHits:'1',admissionHits:'1',correlatedHits:'1',
  callbackHits:'1',sendReturnHits:'1',marshalerReturnHits:'1',postSendBodyCorrelatedHits:'1',
  latestValid:true,latestCallbackValid:true,latestMarshalerValid:true,
  latestPostSendBodyValid:true,latestCallbackMatchesAdmissionStorage:true,
  latestMarshalerMatchesAdmissionStorage:true,latestMarshalerMatchesCallbackStorage:true,
  latestSendReturnMatchesAdmissionStorage:true,latestEntryResultZero:true,
  latestCallbackShapeMatches:true,latestEntity:42,latestStopped:1,
  latestCallbackEntity:42,latestCallbackStopped:1,latestMarshalerEntity:42,
  latestMarshalerStopped:1,latestPostSendBodyEntity:42,latestPostSendBodyStopped:1,
  latestCallbackResult:0,latestMarshalerResult:0,
  latestCorrelatedAdmissionInvocation:'1',latestSendReturnInvocation:'1',
  latestPostSendBodyInvocation:'1',latestPostSendBodyThread:7,
  latestCorrelatedAdmissionThread:7};
const completed={state:'completed',expectedInvocation:'1',claimedInvocation:'1',
  expectedEntity:42,claimedEntity:42,expectedStopped:1,claimedStopped:1,
  callbackResultZero:true,sendReturn:true,postSendBody:true};

function fixture({afterFlag=0,nativeAction=action}={}){
  let pings=0,inspections=0,arms=0;
  const client={requireCapability:()=>{},control:async()=>({index:++pings}),
    vehicleCancelArmObservation:ping=>ping.index===1?{state:'disabled'}:completed,
    passiveVehicleActionObservation:ping=>ping.index===1?baseline:nativeAction,
    armVehicleCancel:async()=>{arms++;return {expectedInvocation:'1'};}};
  const nativeGate={ready:true,client};
  const bridge={connected:true,engineObservation:{available:true,sample:{speedup:1}},
    inspectVehicleOwner:async()=>({stopFlag:++inspections===2?afterFlag:0})};
  return {nativeGate,bridge,get arms(){return arms;},get inspections(){return inspections;}};
}

test('one-game cancellation requires exact native proof and unchanged Stop flag',async()=>{
  const f=fixture(),events=[];
  const proof=await cancelOneLocalStop({...f,entity:42,company:7,logger:e=>events.push(e)});
  assert.equal(proof.invocation,'1');
  assert.equal(f.arms,1);assert.equal(f.inspections,2);
  assert.deepEqual(events.map(e=>e.event),['local_cancel_stop_owner_prestate',
    'local_cancel_stop_armed','local_cancel_stop_confirmed']);
});

test('one-game cancellation rejects native ambiguity and changed game state',async()=>{
  for(const options of [{nativeAction:{...action,admissionHits:'2'}},{afterFlag:1}]){
    const f=fixture(options);
    await assert.rejects(cancelOneLocalStop({...f,entity:42,company:7}),
      /NOT_EXACTLY_ONCE|POSTSTATE_CHANGED/);
    assert.equal(f.arms,1);
  }
});
