import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import net from 'node:net';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {NativeRuntimeClient,createRuntimeIpcCredentials,validateNativeGateCommand,validateNativeGateEvent,validateNativeGateReceipt,validatePassiveVehicleActionObservation} from '../src/native-runtime-client.mjs';

const host=fileURLToPath(new URL('../dist/native/TF3RuntimeIpcHost.exe',import.meta.url));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function controlStep(client,control){try{return await client.control(control);}catch(error){error.message=`${error.message}:${control}`;throw error;}}

test('typed native gate contracts retain exact uint64 epoch/generation and distinguish receipt from applied event',()=>{
  const request=validateNativeGateCommand({control:'release',epoch:'18446744073709551615',generation:'72057594037927935'});
  const receipt=validateNativeGateReceipt({status:'permit_consumed',control:'release',epoch:request.epoch,generation:request.generation,permitConsumedGeneration:request.generation},request);
  assert.equal(receipt.status,'permit_consumed');
  assert.throws(()=>validateNativeGateEvent({event:'boundary_applied',epoch:request.epoch,generation:request.generation,releaseAppliedGeneration:'1'},request),/EVENT_PHASE_INVALID/);
  assert.equal(validateNativeGateEvent({event:'boundary_applied',epoch:request.epoch,generation:request.generation,releaseAppliedGeneration:request.generation},request).event,'boundary_applied');
  assert.throws(()=>validateNativeGateCommand({control:'halt',epoch:'01',generation:'0'}),/INVALID_NATIVE_GATE_COMMAND/);
});
function wire(type,id,session,payload){const body=Buffer.from(JSON.stringify(payload));const out=Buffer.alloc(36+body.length);out.writeUInt32LE(0x54463349,0);out.writeUInt16LE(1,4);out.writeUInt16LE(type,6);out.writeUInt32LE(body.length,8);out.writeBigUInt64LE(BigInt(id),12);session.copy(out,20);body.copy(out,36);return out;}
function rawWire(type,id,session,json){const body=Buffer.from(json);const out=Buffer.alloc(36+body.length);out.writeUInt32LE(0x54463349,0);out.writeUInt16LE(1,4);out.writeUInt16LE(type,6);out.writeUInt32LE(body.length,8);out.writeBigUInt64LE(BigInt(id),12);session.copy(out,20);body.copy(out,36);return out;}
async function rawSocket(pipe){for(let i=0;i<30;i++){try{return await new Promise((resolve,reject)=>{const s=net.createConnection({path:`\\\\.\\pipe\\${pipe}`});s.once('connect',()=>resolve(s));s.once('error',reject);});}catch{await sleep(25);}}throw new Error('native IPC host did not open pipe');}
function frameReader(socket){
  let buffer=Buffer.alloc(0),failure=null;const waiters=[];
  const pump=()=>{while(waiters.length&&buffer.length>=36){const size=buffer.readUInt32LE(8);if(buffer.length<36+size)return;const frame=buffer.subarray(0,36+size);buffer=buffer.subarray(36+size);waiters.shift().resolve(frame);}};
  const reject=error=>{failure=error;while(waiters.length)waiters.shift().reject(error);};
  socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);pump();});
  socket.once('error',reject);socket.once('end',()=>reject(new Error('native IPC socket ended before a complete frame')));
  return ()=>failure?Promise.reject(failure):new Promise((resolve,rejectPromise)=>{waiters.push({resolve,reject:rejectPromise});pump();});
}
async function start(){const credentials=createRuntimeIpcCredentials();const child=spawn(host,['--pipe',credentials.pipe,'--token',credentials.token],{windowsHide:true,stdio:'ignore'});for(let attempt=0;attempt<30;attempt++){try{const client=await NativeRuntimeClient.connect({...credentials,timeoutMs:300});return {child,client,credentials};}catch{await sleep(25);}}child.kill();throw new Error('native IPC host did not accept a local client');}
async function startQualifiedGateFixture({leaseMs}={}){const credentials=createRuntimeIpcCredentials();const args=['--owned-qualified-gate-fixture'];if(leaseMs!==undefined)args.push('--gate-lease-ms',String(leaseMs));args.push('--pipe',credentials.pipe,'--token',credentials.token);const child=spawn(host,args,{windowsHide:true,stdio:'ignore'});for(let attempt=0;attempt<30;attempt++){try{const client=await NativeRuntimeClient.connect({...credentials,timeoutMs:500});return {child,client,credentials};}catch{await sleep(25);}}child.kill();throw new Error('native qualified gate fixture did not accept a local client');}

test('in-process IPC mode authenticates and persists one session binding without claiming engine control',{skip:!existsSync(host)},async()=>{
  const credentials=createRuntimeIpcCredentials();
  const child=spawn(host,['--in-process','--pipe',credentials.pipe,'--token',credentials.token],{windowsHide:true,stdio:'ignore'});
  let client;
  for(let attempt=0;attempt<30&&!client;attempt++){
    try{client=await NativeRuntimeClient.connect({...credentials,timeoutMs:300});}catch{await sleep(25);}
  }
  assert.ok(client,'in-process IPC host did not accept a local client');
  assert.deepEqual(client.capabilities,['transport.health','session.bind']);
  assert.deepEqual(client.handshake,{engineObserver:false,productionQualified:false,guiFreezes:false});
  const receipt=await client.bindSession({sessionId:'owned.fixture:1',role:'host'});
  assert.equal(receipt.boundSessionId,'owned.fixture:1');
  assert.equal(receipt.boundRole,'host');
  assert.equal(receipt.productionQualified,false);
  await assert.rejects(client.bindSession({sessionId:'owned.fixture:1',role:'host'}),/ALREADY_BOUND/);
  assert.equal((await client.control('ping')).state,'running');
  await client.control('shutdown');client.close();
  await new Promise(resolve=>child.once('exit',resolve));
});

test('in-process observer receipt exposes bounded stack and mitigation diagnostics without claiming control',{skip:!existsSync(host)},async()=>{
  const credentials=createRuntimeIpcCredentials();
  const child=spawn(host,['--in-process-observer','--pipe',credentials.pipe,'--token',credentials.token],{windowsHide:true,stdio:'ignore'});
  let client;
  for(let attempt=0;attempt<30&&!client;attempt++){
    try{client=await NativeRuntimeClient.connect({...credentials,timeoutMs:300});}catch{await sleep(25);}
  }
  assert.ok(client,'in-process observer fixture did not accept a local client');
  assert.deepEqual(client.capabilities,['transport.health','session.bind','qualification.inprocess.observer']);
  assert.equal(client.handshake.productionQualified,false);
  const ping=await client.control('ping');
  assert.equal(ping.observationHits,7);
  assert.equal(ping.observationMinimumStackHeadroom,65536);
  assert.equal(ping.observationThread,123);
  assert.equal(ping.observationCfgFlags,1);
  assert.equal(ping.observationCetFlags,261);
  assert.equal(ping.observationCfgKnown,true);
  assert.equal(ping.observationCetKnown,true);
  assert.equal(ping.observationActive,true);
  assert.equal(ping.observationCrossThread,false);
  assert.equal(ping.observationSaturated,false);
  assert.ok(Buffer.byteLength(JSON.stringify(ping))<4096);
  await client.control('shutdown');client.close();
  await new Promise(resolve=>child.once('exit',resolve));
});

test('authenticated passive vehicle diagnostics expose no native pointers or execution authority',{skip:!existsSync(host)},async()=>{
  const credentials=createRuntimeIpcCredentials();
  const child=spawn(host,['--in-process-passive-vehicle','--pipe',credentials.pipe,'--token',credentials.token],{windowsHide:true,stdio:'ignore'});
  let client;
  for(let attempt=0;attempt<30&&!client;attempt++){
    try{client=await NativeRuntimeClient.connect({...credentials,timeoutMs:300});}catch{await sleep(25);}
  }
  assert.ok(client,'passive vehicle fixture did not accept a local client');
  assert.deepEqual(client.capabilities,['transport.health','session.bind','diagnostic.passive-vehicle-action.v1']);
  assert.deepEqual(client.handshake,{engineObserver:false,productionQualified:false,guiFreezes:false});
  const ping=await client.control('ping');
  assert.deepEqual(client.passiveVehicleActionObservation(ping),{factoryHits:'12',admissionHits:'9',correlatedHits:'8',droppedCandidates:'2',ownerThread:321,latestEntity:66005,latestStopped:1,latestValid:true,latestEntryResultZero:true,latestCallbackShapeMatches:true,active:true,crossThread:false,saturated:false});
  assert.throws(()=>validatePassiveVehicleActionObservation({...ping,passiveVehicleFactoryHits:12}),/INVALID_PASSIVE_VEHICLE_ACTION_OBSERVATION/);
  assert.ok(Buffer.byteLength(JSON.stringify(ping))<4096);
  await client.control('shutdown');client.close();
  await new Promise(resolve=>child.once('exit',resolve));
});

test('owned native IPC host authenticates, preserves control while held, and distinguishes engine halt',{skip:!existsSync(host)},async()=>{
  const {child,client}=await start();
  assert.deepEqual(client.capabilities,['transport.health']);
  assert.equal((await controlStep(client,'hold')).state,'held');
  assert.equal((await controlStep(client,'ping')).state,'held');
  assert.equal((await controlStep(client,'release')).state,'running');
  assert.equal((await controlStep(client,'halt')).state,'transport_halt_not_engine_halt');
  assert.equal((await controlStep(client,'shutdown')).control,'shutdown');client.close();
  await new Promise(resolve=>child.once('exit',resolve));
});
test('owned qualified-provider fixture preserves canonical uint64 controls, delayed events, and ping while held',{skip:!existsSync(host)},async()=>{
  const {child,client}=await startQualifiedGateFixture();
  assert.equal(client.handshake.productionQualified,false);
  assert.deepEqual(client.capabilities,['transport.health','session.bind','qualification.inprocess.gate','simulation.hold','engine.halt','simulation.gate-receipts.v1','engine.detach']);
  await client.bindSession({sessionId:'owned.gate:1',role:'host'});
  const epoch='18446744073709551615',generation='72057594037927935';
  const held=await client.gateControl({control:'hold',epoch,generation});
  assert.deepEqual(held,{status:'held',control:'hold',epoch,generation,heldGeneration:generation});
  // This reaches the pipe worker while the modeled native boundary is held;
  // the worker does not wait for a later simulation event to answer it.
  assert.equal((await client.control('ping')).state,'running');
  const applied=new Promise(resolve=>client.on('event',event=>{if(event.payload?.event==='boundary_applied')resolve(event.payload);}));
  const releasePromise=client.gateControl({control:'release',epoch,generation});
  assert.equal((await client.control('ping')).state,'running');
  const released=await releasePromise;
  assert.equal(released.permitConsumedGeneration,generation);
  assert.deepEqual(await applied,{event:'boundary_applied',epoch,generation,releaseAppliedGeneration:generation});
  await assert.rejects(client.gateControl({control:'release',epoch,generation}),/GATE_REJECTED/);
  await client.control('shutdown');client.close();await new Promise(resolve=>child.once('exit',resolve));
});
test('qualified native gate provider rejects noncanonical and out-of-order traffic without retrying',{skip:!existsSync(host)},async()=>{
  const credentials=createRuntimeIpcCredentials();const child=spawn(host,['--owned-qualified-gate-fixture','--pipe',credentials.pipe,'--token',credentials.token],{windowsHide:true,stdio:'ignore'});const socket=await rawSocket(credentials.pipe);
  socket.write(wire(1,1,Buffer.alloc(16),{token:credentials.token}));const ack=await new Promise(resolve=>socket.once('data',resolve));const session=ack.subarray(20,36);
  socket.write(rawWire(3,2,session,'{"control":"bind","sessionId":"owned.raw.gate:1","role":"host"}'));await new Promise(resolve=>socket.once('data',resolve));
  socket.write(rawWire(3,3,session,'{"control":"hold","generation":"7","epoch":"1"}'));const reordered=await new Promise(resolve=>socket.once('data',resolve));assert.match(reordered.subarray(36).toString(),/INVALID_CONTROL/);
  socket.write(rawWire(3,4,session,'{"control":"release","epoch":"1","generation":"01"}'));const malformed=await new Promise(resolve=>socket.once('data',resolve));assert.match(malformed.subarray(36).toString(),/INVALID_CONTROL/);
  socket.write(rawWire(3,5,session,'{"control":"release","epoch":"1","generation":"7"}'));const outOfOrder=await new Promise(resolve=>socket.once('data',resolve));assert.match(outOfOrder.subarray(36).toString(),/GATE_REJECTED/);
  socket.write(wire(3,6,session,{control:'shutdown'}));await new Promise(resolve=>socket.once('data',resolve));socket.destroy();await new Promise(resolve=>child.once('exit',resolve));
});
test('native IPC host fails closed on duplicate correlation and malformed wire frame',{skip:!existsSync(host)},async()=>{
  const credentials=createRuntimeIpcCredentials();const child=spawn(host,['--pipe',credentials.pipe,'--token',credentials.token],{windowsHide:true,stdio:'ignore'});const socket=await rawSocket(credentials.pipe);
  socket.write(wire(1,1,Buffer.alloc(16),{token:credentials.token}));const ack=await new Promise(resolve=>socket.once('data',resolve));const session=ack.subarray(20,36);
  socket.write(wire(3,2,session,{control:'ping'}));await new Promise(resolve=>socket.once('data',resolve));
  socket.write(wire(3,2,session,{control:'ping'}));const duplicate=await new Promise(resolve=>socket.once('data',resolve));assert.match(duplicate.subarray(36).toString(),/DUPLICATE_ID/);
  socket.end(Buffer.from([1,2,3,4]));await new Promise(resolve=>child.once('exit',resolve));socket.destroy();
});
test('native IPC high-water replay barrier permits long monotonic sessions and rejects old correlations',{skip:!existsSync(host),timeout:20000},async()=>{
  const credentials=createRuntimeIpcCredentials();const child=spawn(host,['--pipe',credentials.pipe,'--token',credentials.token],{windowsHide:true,stdio:'ignore'});const socket=await rawSocket(credentials.pipe);
  const readFrame=frameReader(socket);socket.write(wire(1,1,Buffer.alloc(16),{token:credentials.token}));const ack=await readFrame();const session=ack.subarray(20,36);
  // This crosses the former 512-entry lifetime cache.  A single monotonic
  // high-water mark must retain neither the history nor a fixed session cap.
  for(let id=2;id<=600;id++){socket.write(wire(3,id,session,{control:'ping'}));const receipt=await readFrame();assert.match(receipt.subarray(36).toString(),/"control":"ping"/);}
  socket.write(wire(3,599,session,{control:'ping'}));const replay=await readFrame();assert.match(replay.subarray(36).toString(),/OUT_OF_ORDER_ID/);
  socket.write(wire(3,601,session,{control:'shutdown'}));await readFrame();socket.destroy();await new Promise(resolve=>child.once('exit',resolve));
});
test('qualified in-process gate lease exits on authenticated connected silence while running',{skip:!existsSync(host),timeout:5000},async()=>{
  const {child,client}=await startQualifiedGateFixture({leaseMs:200});
  await client.bindSession({sessionId:'owned.lease:1',role:'host'});
  assert.equal((await client.control('ping')).state,'running');
  const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('qualified gate lease did not expire')),3000);child.once('exit',value=>{clearTimeout(timer);resolve(value);});});
  assert.equal(code,17);
  client.close();
});
test('in-process IPC rejects native rebinding and ambiguous duplicate JSON keys',{skip:!existsSync(host)},async()=>{
  const credentials=createRuntimeIpcCredentials();const child=spawn(host,['--in-process','--pipe',credentials.pipe,'--token',credentials.token],{windowsHide:true,stdio:'ignore'});const socket=await rawSocket(credentials.pipe);
  socket.write(wire(1,1,Buffer.alloc(16),{token:credentials.token}));const ack=await new Promise(resolve=>socket.once('data',resolve));const session=ack.subarray(20,36);
  socket.write(rawWire(3,2,session,'{"control":"bind","sessionId":"owned.raw:1","role":"host"}'));const bound=await new Promise(resolve=>socket.once('data',resolve));assert.match(bound.subarray(36).toString(),/"status":"accepted"/);
  socket.write(rawWire(3,3,session,'{"control":"bind","sessionId":"owned.raw:2","role":"host"}'));const rebound=await new Promise(resolve=>socket.once('data',resolve));assert.match(rebound.subarray(36).toString(),/SESSION_ALREADY_BOUND/);
  socket.write(rawWire(3,4,session,'{"control":"shutdown","control":"ping"}'));const ambiguous=await new Promise(resolve=>socket.once('data',resolve));assert.match(ambiguous.subarray(36).toString(),/INVALID_CONTROL/);
  socket.write(wire(3,5,session,{control:'shutdown'}));await new Promise(resolve=>socket.once('data',resolve));socket.destroy();await new Promise(resolve=>child.once('exit',resolve));
});
test('in-process IPC abandons a connected peer stalled mid-header',{skip:!existsSync(host),timeout:8000},async()=>{
  const credentials=createRuntimeIpcCredentials();const child=spawn(host,['--in-process','--pipe',credentials.pipe,'--token',credentials.token],{windowsHide:true,stdio:'ignore'});const socket=await rawSocket(credentials.pipe);
  socket.write(Buffer.from([0x49]));
  const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('native stalled-header deadline did not fire')),7000);child.once('exit',value=>{clearTimeout(timer);resolve(value);});});
  assert.equal(code,12);socket.destroy();
});
test('runtime client reports a handshake timeout without retrying',async()=>{
  const credentials=createRuntimeIpcCredentials();const server=net.createServer(socket=>socket.on('data',()=>{}));
  await new Promise(resolve=>server.listen(`\\\\.\\pipe\\${credentials.pipe}`,resolve));
  await assert.rejects(NativeRuntimeClient.connect({...credentials,timeoutMs:50}),/TIMEOUT/);
  await new Promise(resolve=>server.close(resolve));
});
test('runtime client accepts the controller binding receipt fields without treating it as engine evidence',async()=>{
  const credentials=createRuntimeIpcCredentials(),session=Buffer.alloc(16,5);let requests=0;
  const server=net.createServer(socket=>socket.on('data',chunk=>{
    const id=chunk.readBigUInt64LE(12),type=chunk.readUInt16LE(6);requests++;
    if(type===1)socket.write(wire(2,id,session,{capabilities:['transport.health','session.bind'],engineObserver:true,productionQualified:false,guiFreezes:true}));
    else socket.write(wire(4,id,session,{status:'accepted',control:'bind',boundSessionId:'safe.session:1',boundRole:'participant',engineObserver:true,productionQualified:false}));
  }));
  await new Promise(resolve=>server.listen(`\\\\.\\pipe\\${credentials.pipe}`,resolve));
  const client=await NativeRuntimeClient.connect({...credentials,timeoutMs:200});
  assert.deepEqual(client.handshake,{engineObserver:true,productionQualified:false,guiFreezes:true});
  const receipt=await client.bindSession({sessionId:'safe.session:1',role:'participant'});
  assert.equal(receipt.boundSessionId,'safe.session:1');assert.equal(receipt.boundRole,'participant');assert.equal(requests,2);
  client.close();await new Promise(resolve=>server.close(resolve));
});
test('runtime client marks a late receipt as an unknown outcome and does not replay it',async()=>{
  const credentials=createRuntimeIpcCredentials();const session=Buffer.alloc(16,7);
  const server=net.createServer(socket=>{let buffer=Buffer.alloc(0),hello=false;socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);while(buffer.length>=36){const size=buffer.readUInt32LE(8);if(buffer.length<36+size)return;const frame=buffer.subarray(0,36+size);buffer=buffer.subarray(36+size);const id=frame.readBigUInt64LE(12);if(!hello){hello=true;socket.write(wire(2,id,session,{capabilities:['transport.health'],engineObserver:false}));}else setTimeout(()=>socket.write(wire(4,id,session,{status:'accepted',control:'ping',state:'running',engineObserver:false})),90);}});});
  await new Promise(resolve=>server.listen(`\\\\.\\pipe\\${credentials.pipe}`,resolve));const client=await NativeRuntimeClient.connect({...credentials,timeoutMs:50});assert.deepEqual(client.handshake,{engineObserver:false});const late=new Promise(resolve=>client.on('unknownOutcome',outcome=>{if(outcome.payload?.control==='ping')resolve(outcome);}));await assert.rejects(client.control('ping'),/TIMEOUT/);const outcome=await late;assert.equal(outcome.reason,undefined);assert.equal(outcome.payload.control,'ping');client.close();await new Promise(resolve=>server.close(resolve));
});
test('runtime client fails pending control closed on disconnect',async()=>{
  const credentials=createRuntimeIpcCredentials();const session=Buffer.alloc(16,3);const server=net.createServer(socket=>{let hello=false;socket.on('data',chunk=>{const id=chunk.readBigUInt64LE(12);if(!hello){hello=true;socket.write(wire(2,id,session,{capabilities:['transport.health'],engineObserver:false}));}else socket.destroy();});});
  await new Promise(resolve=>server.listen(`\\\\.\\pipe\\${credentials.pipe}`,resolve));const client=await NativeRuntimeClient.connect({...credentials,timeoutMs:200});await assert.rejects(client.control('ping'),/DISCONNECTED/);client.close();await new Promise(resolve=>server.close(resolve));
});
