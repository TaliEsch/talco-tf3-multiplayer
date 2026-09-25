import assert from 'node:assert/strict';
import path from 'node:path';
import {NativeRuntimeClient,validateNativeGateEvent} from '../src/native-runtime-client.mjs';
import {startGameBridge} from '../src/game-bridge.mjs';

const usage='usage: node tools/live-40401-boundary-check.mjs --pipe <tf3mp_boundary40401_...> --token <64 lowercase hex> --bridge-dir <absolute tf3mp_status_1 directory>';
const expectedCapabilities=['transport.health','session.bind','qualification.inprocess.observer',
  'qualification.inprocess.gate','simulation.hold','engine.halt','simulation.gate-receipts.v1','engine.detach'];
const input=process.argv.slice(2);
let pipe=null,token=null,bridgeDirectory=null;
for(let index=0;index<input.length;index++){
  const argument=input[index];
  if(argument==='--pipe'){
    assert.equal(pipe,null,usage);pipe=input[++index];assert.ok(pipe&&!pipe.startsWith('--'),usage);
  }else if(argument==='--token'){
    assert.equal(token,null,usage);token=input[++index];assert.ok(token&&!token.startsWith('--'),usage);
  }else if(argument==='--bridge-dir'){
    assert.equal(bridgeDirectory,null,usage);bridgeDirectory=input[++index];assert.ok(bridgeDirectory&&!bridgeDirectory.startsWith('--'),usage);
  }else assert.fail(usage);
}
assert.match(pipe??'',/^tf3mp_boundary40401_[A-Za-z0-9_-]{1,58}$/,usage);
assert.match(token??'',/^[a-f0-9]{64}$/,usage);
assert.ok(bridgeDirectory&&path.isAbsolute(bridgeDirectory)&&path.basename(bridgeDirectory)==='tf3mp_status_1',usage);

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForBridge(bridge,label,deadlineMs=15000){
  const deadline=Date.now()+deadlineMs;
  let previousCounter=-1;
  while(Date.now()<deadline){
    const observation=bridge.engineObservation;
    const sample=observation.available?observation.sample:null;
    if(bridge.connected&&sample&&sample.counter>previousCounter){
      previousCounter=sample.counter;
      return {...sample};
    }
    await sleep(100);
  }
  throw new Error(`${label}_GAME_BRIDGE_OBSERVATION_UNAVAILABLE`);
}
async function stableHeldWorld(bridge,afterWorld){
  const deadline=Date.now()+6000;
  let previous=null,stable=0;
  while(Date.now()<deadline){
    const observation=bridge.engineObservation;
    const sample=observation.available?observation.sample:null;
    if(sample&&sample.counter>(previous?.counter??afterWorld.counter)){
      assert.ok(sample.tickCount>=afterWorld.tickCount&&sample.updateCount>=afterWorld.updateCount,
        'GAME_BRIDGE_CLOCK_REGRESSED_DURING_HOLD');
      // The boundary can complete one update between the pre-hold sample and
      // the held receipt. Establish the held clock from fresh post-receipt
      // samples, then require consecutive agreement.
      if(previous&&sample.tickCount===previous.tickCount&&sample.updateCount===previous.updateCount)stable++;
      else stable=1;
      previous={...sample};
      if(stable>=2)return previous;
    }
    await sleep(100);
  }
  throw new Error(`GAME_BRIDGE_CLOCK_DID_NOT_SETTLE_WHILE_HELD:${JSON.stringify({lastSample:previous})}`);
}
async function waitForProgress(bridge,afterWorld){
  const deadline=Date.now()+6000;
  while(Date.now()<deadline){
    const observation=bridge.engineObservation;
    const sample=observation.available?observation.sample:null;
    if(sample&&sample.counter>afterWorld.counter&&sample.updateCount>afterWorld.updateCount&&sample.tickCount>afterWorld.tickCount)
      return {...sample};
    await sleep(100);
  }
  throw new Error('GAME_BRIDGE_CLOCK_DID_NOT_PROGRESS_AFTER_RELEASE');
}
function waitForEvent(client,request,timeoutMs,label){
  return new Promise((resolve,reject)=>{
    const finish=(error,value)=>{
      clearTimeout(timer);client.off('event',listener);
      if(error)reject(error);else resolve(value);
    };
    const listener=frame=>{
      if(frame.payload?.epoch!==request.epoch||frame.payload?.generation!==request.generation)return;
      try{finish(null,validateNativeGateEvent(frame.payload,request));}
      catch(error){finish(error);}
    };
    const timer=setTimeout(()=>finish(new Error(`${label}_TIMEOUT`)),timeoutMs);
    client.on('event',listener);
  });
}

let bridge,client,detached=false;
const startedAt=Date.now();
const sessionId=`boundary40401.check:${startedAt}`;
const epoch=String(startedAt);
try{
  bridge=await startGameBridge({directory:bridgeDirectory,intervalMs:100,staleMs:3000,
    logger:event=>process.stderr.write(`${JSON.stringify(event)}\n`)});
  let lastError=null;
  for(let attempt=0;attempt<40&&!client;attempt++){
    try{client=await NativeRuntimeClient.connect({pipe,token,timeoutMs:2500});}
    catch(error){lastError=error;await sleep(250);}
  }
  assert.ok(client,`BOUNDARY_40401_RUNTIME_UNAVAILABLE:${lastError?.message??'UNKNOWN'}`);
  assert.deepEqual(client.capabilities,expectedCapabilities,'BOUNDARY_40401_CAPABILITIES_MISMATCH');
  assert.deepEqual(client.handshake,{engineObserver:true,productionQualified:false,guiFreezes:false},
    'BOUNDARY_40401_HANDSHAKE_MISMATCH');
  assert.equal(client.hasCapability('vehicle.cancel-arm.v1'),false,'BOUNDARY_40401_CANCELLATION_MUST_BE_UNAVAILABLE');
  assert.equal(client.hasCapability('diagnostic.vehicle-cancel-arm.v1'),false,'BOUNDARY_40401_CANCELLATION_DIAGNOSTICS_MUST_BE_UNAVAILABLE');

  const binding=await client.bindSession({sessionId,role:'host'});
  assert.equal(binding.boundSessionId,sessionId);
  assert.equal(binding.boundRole,'host');
  let ping=await client.control('ping');
  assert.equal(ping.status,'accepted');
  assert.equal(ping.engineObserver,true);
  assert.equal(ping.observationActive,true);
  assert.equal(ping.observationCrossThread,false);
  assert.ok(Number.isSafeInteger(ping.observationHits)&&ping.observationHits>0,'BOUNDARY_40401_OBSERVER_NOT_ACTIVE');

  const before=await waitForBridge(bridge,'PRE_HOLD');
  assert.equal(before.speedup,1,'TF3_NORMAL_SPEED_REQUIRED_FOR_BOUNDARY_CLOCK_CHECK');
  const baselineProgress=await waitForProgress(bridge,before);
  const hold={control:'hold',epoch,generation:'1'};
  const held=await client.gateControl(hold);
  assert.equal(held.status,'held');
  let heldWorld=await stableHeldWorld(bridge,baselineProgress);

  const heldPings=[];
  const holdDeadline=Date.now()+1500;
  while(Date.now()<holdDeadline){
    ping=await client.control('ping');
    assert.equal(ping.status,'accepted');
    assert.equal(ping.observationActive,true);
    assert.equal(ping.observationCrossThread,false);
    assert.ok(Number.isSafeInteger(ping.observationHits)&&ping.observationHits>=0);
    heldPings.push({atMs:Date.now()-startedAt,observationHits:ping.observationHits});
    const sample=bridge.engineObservation.available?bridge.engineObservation.sample:null;
    assert.ok(sample&&sample.tickCount===heldWorld.tickCount&&sample.updateCount===heldWorld.updateCount,
      `GAME_BRIDGE_CLOCK_CHANGED_WHILE_HELD:${JSON.stringify({heldWorld,sample})}`);
    await sleep(200);
  }
  assert.ok(heldPings.length>=4,'BOUNDARY_40401_HELD_PING_COVERAGE_INSUFFICIENT');
  const heldFinal=await waitForBridge(bridge,'HELD_FINAL');
  assert.equal(heldFinal.tickCount,heldWorld.tickCount,'GAME_BRIDGE_TICK_CHANGED_WHILE_HELD');
  assert.equal(heldFinal.updateCount,heldWorld.updateCount,'GAME_BRIDGE_UPDATE_CHANGED_WHILE_HELD');
  heldWorld=heldFinal;

  const release={control:'release',epoch,generation:'1'};
  const appliedPromise=waitForEvent(client,release,10000,'BOUNDARY_40401_RELEASE_EVENT');
  const released=await client.gateControl(release);
  assert.equal(released.status,'permit_consumed');
  const applied=await appliedPromise;
  const progressedWorld=await waitForProgress(bridge,heldWorld);
  assert.equal(progressedWorld.tickCount,heldWorld.tickCount+1,'BOUNDARY_40401_RELEASE_TICK_DELTA_INVALID');
  assert.equal(progressedWorld.updateCount,heldWorld.updateCount+1,'BOUNDARY_40401_RELEASE_UPDATE_DELTA_INVALID');

  const detach={control:'detach',epoch,generation:'2'};
  const detachedPromise=waitForEvent(client,detach,10000,'BOUNDARY_40401_DETACH_EVENT');
  const detachPrepared=await client.gateControl(detach);
  assert.equal(detachPrepared.status,'detach_prepared');
  const detachEvent=await detachedPromise;
  detached=true;
  const finalPing=await client.control('ping');
  assert.equal(finalPing.status,'accepted');
  assert.equal(finalPing.observationActive,false,'BOUNDARY_40401_OBSERVER_REMAINED_ACTIVE_AFTER_DETACH');
  const report={event:'tf3-40401-boundary-check',verified:true,scope:'exact-40401-boundary-only',
    productionQualified:client.handshake.productionQualified,cancellationAvailable:false,
    capabilities:client.capabilities,handshake:client.handshake,
    binding:{sessionId,role:'host'},
    held:{receipt:held,pingCount:heldPings.length,firstObservationHits:heldPings[0].observationHits,
      lastObservationHits:heldPings.at(-1).observationHits,world:{tickCount:heldWorld.tickCount,updateCount:heldWorld.updateCount}},
    released:{receipt:released,event:applied,world:{tickCount:progressedWorld.tickCount,updateCount:progressedWorld.updateCount},
      tickDelta:progressedWorld.tickCount-heldWorld.tickCount,updateDelta:progressedWorld.updateCount-heldWorld.updateCount},
    detached:{receipt:detachPrepared,event:detachEvent,observerActive:finalPing.observationActive},
    elapsedMs:Date.now()-startedAt};
  process.stdout.write(`${JSON.stringify(report)}\n`);
}catch(error){
  process.stderr.write(`${JSON.stringify({event:'tf3-40401-boundary-check-failed',verified:false,
    detached,error:error?.stack??String(error),elapsedMs:Date.now()-startedAt})}\n`);
  process.exitCode=1;
}finally{
  client?.close();
  await bridge?.close().catch(()=>{});
}
