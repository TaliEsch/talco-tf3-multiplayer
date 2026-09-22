import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NativeRuntimeClient} from '../src/native-runtime-client.mjs';

const exe=process.argv[2]??'E:\\Steam\\steamapps\\common\\Transport Fever 3\\TransportFever3.exe';
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
let client,lastError;
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
  process.stdout.write(`${JSON.stringify({event:'tf3-inprocess-observer-awaiting-world',pid:child.pid,
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
  await client.control('shutdown');
  process.stdout.write(`${JSON.stringify({event:'tf3-inprocess-loader-qualified',pid:child.pid,
    capabilities:client.capabilities,handshake:client.handshake,binding:{sessionId,role:'host'},
    ping:{status:ping.status,state:ping.state,engineObserver:ping.engineObserver,
      observationHits:ping.observationHits,observationThread:ping.observationThread,
      observationActive:ping.observationActive,observationCrossThread:ping.observationCrossThread},
    elapsedMs:Date.now()-launchedAt})}\n`);
}finally{client.close();}
