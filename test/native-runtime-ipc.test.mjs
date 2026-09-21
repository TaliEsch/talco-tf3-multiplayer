import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import net from 'node:net';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {NativeRuntimeClient,createRuntimeIpcCredentials} from '../src/native-runtime-client.mjs';

const host=fileURLToPath(new URL('../dist/native/TF3RuntimeIpcHost.exe',import.meta.url));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function wire(type,id,session,payload){const body=Buffer.from(JSON.stringify(payload));const out=Buffer.alloc(36+body.length);out.writeUInt32LE(0x54463349,0);out.writeUInt16LE(1,4);out.writeUInt16LE(type,6);out.writeUInt32LE(body.length,8);out.writeBigUInt64LE(BigInt(id),12);session.copy(out,20);body.copy(out,36);return out;}
async function rawSocket(pipe){for(let i=0;i<30;i++){try{return await new Promise((resolve,reject)=>{const s=net.createConnection({path:`\\\\.\\pipe\\${pipe}`});s.once('connect',()=>resolve(s));s.once('error',reject);});}catch{await sleep(25);}}throw new Error('native IPC host did not open pipe');}
async function start(){const credentials=createRuntimeIpcCredentials();const child=spawn(host,['--pipe',credentials.pipe,'--token',credentials.token],{windowsHide:true,stdio:'ignore'});for(let attempt=0;attempt<30;attempt++){try{const client=await NativeRuntimeClient.connect({...credentials,timeoutMs:300});return {child,client,credentials};}catch{await sleep(25);}}child.kill();throw new Error('native IPC host did not accept a local client');}

test('owned native IPC host authenticates, preserves control while held, and distinguishes engine halt',{skip:!existsSync(host)},async()=>{
  const {child,client}=await start();
  assert.deepEqual(client.capabilities,['transport.health']);
  assert.equal((await client.control('hold')).state,'held');
  assert.equal((await client.control('ping')).state,'held');
  assert.equal((await client.control('release')).state,'running');
  assert.equal((await client.control('halt')).state,'transport_halt_not_engine_halt');
  assert.equal((await client.control('shutdown')).control,'shutdown');client.close();
  await new Promise(resolve=>child.once('exit',resolve));
});
test('native IPC host fails closed on duplicate correlation and malformed wire frame',{skip:!existsSync(host)},async()=>{
  const credentials=createRuntimeIpcCredentials();const child=spawn(host,['--pipe',credentials.pipe,'--token',credentials.token],{windowsHide:true,stdio:'ignore'});const socket=await rawSocket(credentials.pipe);
  socket.write(wire(1,1,Buffer.alloc(16),{token:credentials.token}));const ack=await new Promise(resolve=>socket.once('data',resolve));const session=ack.subarray(20,36);
  socket.write(wire(3,2,session,{control:'ping'}));await new Promise(resolve=>socket.once('data',resolve));
  socket.write(wire(3,2,session,{control:'ping'}));const duplicate=await new Promise(resolve=>socket.once('data',resolve));assert.match(duplicate.subarray(36).toString(),/DUPLICATE_ID/);
  socket.end(Buffer.from([1,2,3,4]));await new Promise(resolve=>child.once('exit',resolve));socket.destroy();
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
