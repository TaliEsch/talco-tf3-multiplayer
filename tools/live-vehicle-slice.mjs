import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {lstat,open,readFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startGameBridge} from '../src/game-bridge.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';

const directory=path.resolve(process.argv[2]??'');
assert.equal(path.basename(directory),'tf3mp_status_1','usage: node tools/live-vehicle-slice.mjs <absolute bridge directory>');
const targetOnly=process.argv[3]===undefined?null:Number(process.argv[3]);
assert.ok(targetOnly===null||targetOnly===0||targetOnly===1,'optional target stop flag must be 0 or 1');
const events=[];
const logger=event=>{events.push(event);process.stderr.write(`${JSON.stringify(event)}\n`);};
const bridge=await startGameBridge({directory,logger,intervalMs:250,staleMs:10000});

async function until(predicate,timeoutMs,label){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){const value=await predicate();if(value)return value;await delay(100);}
  throw new Error(`LIVE_VEHICLE_${label}_TIMEOUT`);
}
async function publish(name,fields){
  const temporary=path.join(directory,`.live-${randomBytes(12).toString('hex')}.tmp`);
  const body=Object.entries(fields).map(([key,value])=>{
    assert.match(key,/^[A-Za-z]+$/);assert.ok(Number.isSafeInteger(value)&&value>=0||typeof value==='string'&&/^[a-z0-9_]{1,64}$/.test(value));
    return `  ${key} = ${typeof value==='string'?`"${value}"`:value},`;
  }).join('\n');
  const handle=await open(temporary,'wx',0o600);
  try{await handle.writeFile(`function data()\nreturn {\n${body}\n}\nend\n`);await handle.sync();}finally{await handle.close();}
  try{await rename(temporary,path.join(directory,name));}finally{await unlink(temporary).catch(()=>{});}
}
async function readReceipt(name){
  const filename=path.join(directory,name),info=await lstat(filename);
  assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.size<=4096);
  return parseFlatDataFile(await readFile(filename,'utf8'));
}
function validateDiscovery(value,requestId,company){
  assert.deepEqual(Object.keys(value).sort(),['company','entity','kind','nonce','outcome','requestId','revision','schemaVersion','stopFlag','tickCount','updateCount'].sort());
  assert.equal(value.schemaVersion,1);assert.equal(value.kind,'vehicle_discovery_receipt');assert.equal(value.nonce,bridge.nonce);
  assert.equal(value.requestId,requestId);assert.equal(value.company,company);assert.equal(value.outcome,'found');
  assert.ok(Number.isSafeInteger(value.entity)&&value.entity>0);assert.ok(Number.isSafeInteger(value.revision)&&value.revision>=0);
  assert.ok([0,1].includes(value.stopFlag));return value;
}
function validateApplied(value,requestId,entity,stopFlag){
  assert.equal(value.schemaVersion,1);assert.equal(value.kind,'vehicle_receipt');assert.equal(value.nonce,bridge.nonce);
  assert.equal(value.actionId,requestId);assert.equal(value.entity,entity);assert.equal(value.stopFlag,stopFlag);
  assert.equal(value.phase,'commit');assert.equal(value.outcome,'applied');assert.ok(value.hostSequence>=requestId);
  return value;
}

try{
  await until(()=>bridge.connected&&bridge.engineObservation.available&&bridge.engineObservation.sample,30000,'BRIDGE');
  const company=bridge.engineObservation.sample.companyEntity;
  await bridge.enableVehicleTest({scheduled:false});
  await publish('vehicle_discovery_request.lua',{schemaVersion:1,kind:'vehicle_discovery_request',nonce:bridge.nonce,requestId:1,company});
  const discovered=await until(async()=>{try{return validateDiscovery(await readReceipt('vehicle_discovery_receipt.lua'),1,company);}catch{return null;}},30000,'DISCOVERY');
  logger({level:'info',event:'live_vehicle_discovered',company,entity:discovered.entity,stopFlag:discovered.stopFlag,revision:discovered.revision});
  if(targetOnly!==null&&discovered.stopFlag===targetOnly){
    process.stdout.write(`${JSON.stringify({event:'live-vehicle-target-already-satisfied',company,entity:discovered.entity,stopFlag:targetOnly})}\n`);
  }else if(targetOnly!==null){
    await publish('vehicle_intent.lua',{schemaVersion:1,kind:'vehicle_intent',nonce:bridge.nonce,requestId:1,entity:discovered.entity,stopFlag:targetOnly});
    const receipt=await until(async()=>{try{return validateApplied(await readReceipt('vehicle_receipt.lua'),1,discovered.entity,targetOnly);}catch{return null;}},60000,'TARGET_ACTION');
    await until(()=>events.some(event=>event.event==='vehicle_test_applied'&&event.hostSequence===receipt.hostSequence),10000,'TARGET_HELPER_ACK');
    process.stdout.write(`${JSON.stringify({event:'live-vehicle-target-qualified',company,entity:discovered.entity,fromStopFlag:discovered.stopFlag,toStopFlag:targetOnly,actionId:receipt.actionId,hostSequence:receipt.hostSequence,updateCount:receipt.updateCount,outcome:receipt.outcome})}\n`);
  }else{
  const originalStopFlag=discovered.stopFlag,targetStopFlag=originalStopFlag===0?1:0;
  await publish('vehicle_intent.lua',{schemaVersion:1,kind:'vehicle_intent',nonce:bridge.nonce,requestId:1,entity:discovered.entity,stopFlag:targetStopFlag});
  const first=await until(async()=>{try{return validateApplied(await readReceipt('vehicle_receipt.lua'),1,discovered.entity,targetStopFlag);}catch{return null;}},60000,'FIRST_ACTION');
  await until(()=>events.some(event=>event.event==='vehicle_test_applied'&&event.hostSequence===first.hostSequence),10000,'FIRST_HELPER_ACK');
  // The first receipt establishes a known postcondition, so issuing the exact
  // inverse is not an uncertain retry; it restores the disposable test state.
  await publish('vehicle_intent.lua',{schemaVersion:1,kind:'vehicle_intent',nonce:bridge.nonce,requestId:2,entity:discovered.entity,stopFlag:originalStopFlag});
  const restored=await until(async()=>{try{return validateApplied(await readReceipt('vehicle_receipt.lua'),2,discovered.entity,originalStopFlag);}catch{return null;}},60000,'RESTORE_ACTION');
  await until(()=>events.some(event=>event.event==='vehicle_test_applied'&&event.hostSequence===restored.hostSequence),10000,'RESTORE_HELPER_ACK');
  process.stdout.write(`${JSON.stringify({event:'live-vehicle-slice-qualified',company,entity:discovered.entity,originalStopFlag,first:{actionId:first.actionId,hostSequence:first.hostSequence,updateCount:first.updateCount,stopFlag:first.stopFlag,outcome:first.outcome},restored:{actionId:restored.actionId,hostSequence:restored.hostSequence,updateCount:restored.updateCount,stopFlag:restored.stopFlag,outcome:restored.outcome}})}\n`);
  }
}finally{
  await bridge.close();
  for(const name of ['vehicle_discovery_request.lua','vehicle_discovery_receipt.lua'])await unlink(path.join(directory,name)).catch(()=>{});
}
