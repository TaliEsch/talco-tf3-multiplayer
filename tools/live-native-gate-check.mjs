import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {createRuntimeIpcCredentials, NativeRuntimeClient} from '../src/native-runtime-client.mjs';

const pid=Number(process.argv[2]);
assert.ok(Number.isInteger(pid)&&pid>0,'usage: node tools/live-native-gate-check.mjs <TF3 PID> [session-id]');
const sessionId=process.argv[3]??`live.qualify.${Date.now()}`;
assert.match(sessionId,/^[A-Za-z0-9_.:-]{1,128}$/);
const controller=fileURLToPath(new URL('../dist/native-runtime/TF3RuntimeController.exe',import.meta.url));
assert.ok(process.platform==='win32'&&existsSync(controller),'build TF3RuntimeController.exe first');

const credentials=createRuntimeIpcCredentials();
const child=spawn(controller,['--pid',String(pid),'--pipe',credentials.pipe],{
  windowsHide:true,
  env:{...process.env,TF3_RUNTIME_TOKEN:credentials.token},
  stdio:['ignore','pipe','pipe'],
});
let stdout='',stderr='',client,shutdownAccepted=false;
child.stdout.on('data',chunk=>{stdout+=chunk;});
child.stderr.on('data',chunk=>{stderr+=chunk;});
const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));

async function connectBounded(){
  let last;
  for(let attempt=0;attempt<120;attempt++){
    try{return await NativeRuntimeClient.connect({...credentials,timeoutMs:5000});}
    catch(error){last=error;await delay(25);}
  }
  throw last??new Error('controller IPC unavailable');
}

try{
  client=await connectBounded();
  assert.equal(client.handshake.engineObserver,true);
  assert.equal(client.handshake.productionQualified,false);
  assert.equal(client.handshake.guiFreezes,true);
  assert.ok(client.capabilities.includes('qualification.debugger.gate'));
  const binding=await client.bindSession({sessionId,role:'host'});
  const held=await client.control('hold');
  assert.equal(held.engineHalted,true);
  await delay(250);
  const stillHeld=await client.control('ping');
  assert.equal(stillHeld.engineHalted,true);
  assert.equal(stillHeld.completedIterations,held.completedIterations);
  const released=await client.control('release');
  assert.equal(released.engineHalted,true);
  assert.equal(released.completedIterations,held.completedIterations+1);
  const after=await client.control('ping');
  assert.equal(after.completedIterations,released.completedIterations);
  const shutdown=await client.control('shutdown');
  shutdownAccepted=true;
  assert.equal(shutdown.engineHalted,false);
  assert.equal(shutdown.state,'resumed_and_detached');
  client.close();
  const result=await Promise.race([exited,delay(5000).then(()=>({timeout:true}))]);
  assert.deepEqual(result,{code:0,signal:null});
  assert.match(stdout,/"restoredAndDetached":true/);
  process.stdout.write(`${JSON.stringify({event:'live-native-gate-qualified',pid,sessionId,binding:{boundSessionId:binding.boundSessionId,boundRole:binding.boundRole},held:{state:held.state,completedIterations:held.completedIterations},released:{state:released.state,completedIterations:released.completedIterations},shutdown:{state:shutdown.state,engineHalted:shutdown.engineHalted},productionQualified:false})}\n`);
}finally{
  if(client&&!shutdownAccepted){
    try{await client.control('shutdown');shutdownAccepted=true;}catch{}
    client.close();
  }
  if(child.exitCode===null&&!shutdownAccepted)child.kill();
  if(stderr)process.stderr.write(stderr);
}
