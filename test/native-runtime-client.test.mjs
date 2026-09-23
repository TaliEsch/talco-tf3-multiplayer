import assert from 'node:assert/strict';
import test from 'node:test';
import {NativeRuntimeClient,NATIVE_RUNTIME_CAPABILITIES,createRuntimeIpcCredentials,
  validatePassiveVehicleActionObservation} from '../src/native-runtime-client.mjs';

test('native runtime client rejects unsafe connection and controls',()=>{
  assert.throws(()=>new NativeRuntimeClient({pipe:'../bad',token:'a'.repeat(64)}),/INVALID/);
  assert.throws(()=>new NativeRuntimeClient({pipe:'safe',token:'A'.repeat(64)}),/INVALID/);
  const c=new NativeRuntimeClient({pipe:'safe',token:'a'.repeat(64)});
  assert.rejects(c.control('anything'),/NOT_CONNECTED/); c.close();
});
test('native runtime credentials are safe and distinct',()=>{
  const a=createRuntimeIpcCredentials(),b=createRuntimeIpcCredentials();assert.match(a.pipe,/^[A-Za-z0-9_-]{1,80}$/);assert.match(a.token,/^[a-f0-9]{64}$/);assert.notDeepEqual(a,b);
});
test('native runtime capability contract names execution gates without enabling them',()=>{
  assert.equal(NATIVE_RUNTIME_CAPABILITIES.transportHealth,'transport.health');
  assert.equal(NATIVE_RUNTIME_CAPABILITIES.vehicleExecute,'vehicle.execute.v1');
  const c=new NativeRuntimeClient({pipe:'safe',token:'a'.repeat(64)});
  assert.throws(()=>c.requireCapability(NATIVE_RUNTIME_CAPABILITIES.vehicleExecute),/CAPABILITY_UNAVAILABLE/);c.close();
});
test('passive vehicle diagnostics require a complete pointer-free lossless snapshot',()=>{
  const valid={passiveVehicleFactoryHits:'18446744073709551615',passiveVehicleAdmissionHits:'9',
    passiveVehicleCorrelatedHits:'8',passiveVehicleDroppedCandidates:'2',passiveVehicleThread:321,passiveVehicleLatestEntity:66005,
    passiveVehicleLatestStopped:1,passiveVehicleLatestValid:true,
    passiveVehicleLatestEntryResultZero:true,passiveVehicleLatestCallbackShapeMatches:true,passiveVehicleActive:true,
    passiveVehicleCrossThread:false,passiveVehicleSaturated:true,passiveVehicleCallbackHits:'8',passiveVehicleCallbackThread:321,
    passiveVehicleLatestCallbackEntity:66005,passiveVehicleLatestCallbackStopped:1,passiveVehicleLatestCallbackResult:0,
    passiveVehicleLatestCallbackValid:true,passiveVehicleLatestCallbackMatchesAdmissionStorage:true,
    passiveVehicleLatestAdmissionProgressKnown:true,passiveVehicleLatestAdmissionProgressEmpty:false,
    passiveVehicleLatestCorrelatedAdmissionThread:321,
    passiveVehicleSendReturnHits:'8',passiveVehicleSendReturnThread:321,
    passiveVehicleLatestSendReturnMatchesAdmissionStorage:true,
    passiveVehicleMarshalerReturnHits:'8',passiveVehicleMarshalerReturnThread:321,
    passiveVehicleLatestMarshalerEntity:66005,passiveVehicleLatestMarshalerStopped:1,
    passiveVehicleLatestMarshalerResult:0,passiveVehicleLatestMarshalerValid:true,
    passiveVehicleLatestMarshalerMatchesAdmissionStorage:true,
    passiveVehicleLatestMarshalerMatchesCallbackStorage:true};
  assert.deepEqual(validatePassiveVehicleActionObservation(valid),{
    factoryHits:valid.passiveVehicleFactoryHits,admissionHits:'9',correlatedHits:'8',droppedCandidates:'2',ownerThread:321,
    latestEntity:66005,latestStopped:1,latestValid:true,latestEntryResultZero:true,
    latestCallbackShapeMatches:true,active:true,crossThread:false,saturated:true,callbackHits:'8',callbackThread:321,
    latestCallbackEntity:66005,latestCallbackStopped:1,latestCallbackResult:0,latestCallbackValid:true,
    latestCallbackMatchesAdmissionStorage:true,latestAdmissionProgressKnown:true,latestAdmissionProgressEmpty:false,
    latestCorrelatedAdmissionThread:321,sendReturnHits:'8',sendReturnThread:321,
    latestSendReturnMatchesAdmissionStorage:true,marshalerReturnHits:'8',marshalerReturnThread:321,
    latestMarshalerEntity:66005,latestMarshalerStopped:1,latestMarshalerResult:0,
    latestMarshalerValid:true,latestMarshalerMatchesAdmissionStorage:true,
    latestMarshalerMatchesCallbackStorage:true});
  for(const change of [
    {passiveVehicleFactoryHits:18446744073709551615n},
    {passiveVehicleFactoryHits:'18446744073709551616'},
    {passiveVehicleLatestStopped:2},
    {passiveVehicleLatestCallbackShapeMatches:1},
    {passiveVehicleLatestCallbackResult:256},
    {passiveVehicleLatestCallbackValid:false,passiveVehicleLatestCallbackMatchesAdmissionStorage:true},
    {passiveVehicleLatestAdmissionProgressKnown:false,passiveVehicleLatestAdmissionProgressEmpty:true},
    {passiveVehicleLatestCorrelatedAdmissionThread:0x1_0000_0000},
    {passiveVehicleSendReturnHits:'18446744073709551616'},
    {passiveVehicleSendReturnThread:0x1_0000_0000},
    {passiveVehicleLatestSendReturnMatchesAdmissionStorage:1},
    {passiveVehicleMarshalerReturnHits:8},
    {passiveVehicleLatestMarshalerResult:256},
    {passiveVehicleLatestMarshalerValid:false,passiveVehicleLatestMarshalerMatchesCallbackStorage:true},
    {passiveVehicleLatestEntity:0,passiveVehicleLatestValid:false,passiveVehicleActive:false},
    {passiveVehicleNativePointer:'7ff600000000'},
  ]) {
    const candidate={...valid,...change};
    assert.throws(()=>validatePassiveVehicleActionObservation(candidate),/INVALID_PASSIVE_VEHICLE_ACTION_OBSERVATION/);
  }
});
test('explicit close emits one disconnect notification even when socket shutdown follows',async()=>{
  const c=new NativeRuntimeClient({pipe:'safe',token:'a'.repeat(64)});const reasons=[];
  c.on('disconnect',reason=>reasons.push(reason));
  c.close();c.close();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(reasons,['NATIVE_RUNTIME_IPC_CLOSED']);
});
