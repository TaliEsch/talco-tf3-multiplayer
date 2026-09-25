import assert from 'node:assert/strict';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {NativeRuntimeClient} from '../src/native-runtime-client.mjs';
import {startGameBridge} from '../src/game-bridge.mjs';
import {confirmCancelledStop} from '../src/host-cancelled-stop.mjs';

// One-use diagnostic for an already loaded disposable TF3 save. It does not
// start a production Host, release a simulation boundary, or replay a command.
const usage='usage: node tools/live-40401-cancel-check.mjs --pipe <tf3mp_cancel40401_...> --token <64 lowercase hex> --bridge-dir <absolute tf3mp_status_1> --entity <positive ID> --company <positive ID>';
const input=process.argv.slice(2);
const options={};
for(let index=0;index<input.length;index+=2){
  const key=input[index];
  assert.ok(['--pipe','--token','--bridge-dir','--entity','--company'].includes(key)&&!Object.hasOwn(options,key),usage);
  options[key]=input[index+1];
}
assert.equal(Object.keys(options).length,5,usage);
assert.match(options['--pipe']??'',/^tf3mp_cancel40401_[A-Za-z0-9_-]{1,58}$/,usage);
assert.match(options['--token']??'',/^[a-f0-9]{64}$/,usage);
assert.ok(path.isAbsolute(options['--bridge-dir']??'')&&path.basename(options['--bridge-dir'])==='tf3mp_status_1',usage);
for(const name of ['--entity','--company'])assert.match(options[name]??'',/^[1-9][0-9]*$/,usage);
const entity=Number(options['--entity']),company=Number(options['--company']);
assert.ok([entity,company].every(value=>Number.isSafeInteger(value)&&value<=2147483647),usage);

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const lines=createInterface({input:process.stdin});
let bridge,client,arm=null;
const startedAt=Date.now();
try{
  bridge=await startGameBridge({directory:options['--bridge-dir'],intervalMs:100,staleMs:3000,
    logger:event=>process.stderr.write(`${JSON.stringify(event)}\n`)});
  const observationDeadline=Date.now()+30000;
  while((!bridge.connected||!bridge.engineObservation.available)&&Date.now()<observationDeadline)
    await sleep(100);
  assert.ok(bridge.connected&&bridge.engineObservation.available,'CANCEL_40401_BRIDGE_UNAVAILABLE');
  client=await NativeRuntimeClient.connect({pipe:options['--pipe'],token:options['--token'],timeoutMs:3000});
  assert.equal(client.handshake?.productionQualified,false,'CANCEL_40401_MUST_REMAIN_UNQUALIFIED');
  for(const capability of ['transport.health','session.bind','diagnostic.passive-vehicle-action.v1',
    'vehicle.cancel-arm.v1','diagnostic.vehicle-cancel-arm.v1'])client.requireCapability(capability);
  for(const capability of ['simulation.hold','simulation.gate-receipts.v1'])
    assert.equal(client.hasCapability(capability),false,'CANCEL_40401_MUST_NOT_EXPOSE_GAME_GATE');
  const binding=await client.bindSession({sessionId:`cancel40401.check:${startedAt}`,role:'host'});
  assert.equal(binding.boundRole,'host');
  const before=await bridge.inspectVehicleOwner({entity,company});
  assert.equal(before.stopFlag,0,'CANCEL_40401_REQUIRES_RUNNING_VEHICLE');
  assert.equal(bridge.engineObservation.sample?.speedup,1,'CANCEL_40401_REQUIRES_NORMAL_SPEED');
  const baselinePing=await client.control('ping');
  assert.equal(client.vehicleCancelArmObservation(baselinePing).state,'disabled','CANCEL_40401_ARM_ALREADY_USED');
  const baseline=client.passiveVehicleActionObservation(baselinePing);
  assert.ok(baseline.active&&!baseline.saturated,'CANCEL_40401_OBSERVER_UNAVAILABLE');
  process.stdout.write(`${JSON.stringify({event:'cancel40401_ready',entity,company,
    before:{revision:before.revision,stopFlag:before.stopFlag,tickCount:before.tickCount,
      updateCount:before.updateCount},instruction:'Send ARM, then click Stop once immediately; do not retry.'})}\n`);
  const iterator=lines[Symbol.asyncIterator]();
  const command=await iterator.next();
  assert.equal(command.value?.trim(),'ARM','CANCEL_40401_EXPLICIT_ARM_REQUIRED');
  assert.ok(bridge.connected&&bridge.engineObservation.available,'CANCEL_40401_BRIDGE_LOST');
  arm=await client.armVehicleCancel({entity,stopped:1,ttlMs:5000});
  process.stdout.write(`${JSON.stringify({event:'cancel40401_click_now',entity,
    expectedInvocation:arm.expectedInvocation,ttlMs:5000})}\n`);
  const deadline=Date.now()+7000;
  let state=null,action=null;
  while(Date.now()<deadline){
    assert.ok(bridge.connected&&bridge.engineObservation.available,'CANCEL_40401_BRIDGE_LOST_AFTER_ARM');
    const ping=await client.control('ping');
    state=client.vehicleCancelArmObservation(ping);
    if(['expired','revoked','failed'].includes(state.state))throw new Error(`CANCEL_40401_ARM_${state.state.toUpperCase()}`);
    if(state.state==='completed'){
      action=client.passiveVehicleActionObservation(ping);
      break;
    }
    await sleep(50);
  }
  const proof=confirmCancelledStop({arm,state,baseline,action,entity});
  const finalPing=await client.control('ping');
  assert.equal(finalPing.status,'accepted','CANCEL_40401_NATIVE_IPC_NOT_RESPONSIVE');
  const after=await bridge.inspectVehicleOwner({entity,company});
  assert.equal(after.stopFlag,0,'CANCEL_40401_ORIGINAL_STOP_MUTATED_VEHICLE');
  assert.ok(after.tickCount>before.tickCount&&after.updateCount>before.updateCount,
    'CANCEL_40401_WORLD_DID_NOT_ADVANCE');
  process.stdout.write(`${JSON.stringify({event:'tf3-40401-cancel-check',verified:true,
    scope:'single-game-cancellation-only',entity,company,invocation:proof.invocation,
    callbackResultZero:state.callbackResultZero,sendReturn:state.sendReturn,
    postSendBody:state.postSendBody,before:{revision:before.revision,stopFlag:before.stopFlag,
      tickCount:before.tickCount,updateCount:before.updateCount},
    after:{revision:after.revision,stopFlag:after.stopFlag,tickCount:after.tickCount,
      updateCount:after.updateCount},elapsedMs:Date.now()-startedAt})}\n`);
}catch(error){
  process.stderr.write(`${JSON.stringify({event:'tf3-40401-cancel-check-failed',verified:false,
    armSubmitted:arm!==null,code:error?.message??String(error),elapsedMs:Date.now()-startedAt})}\n`);
  process.exitCode=1;
}finally{
  lines.close();
  client?.close();
  await bridge?.close().catch(()=>{});
}
