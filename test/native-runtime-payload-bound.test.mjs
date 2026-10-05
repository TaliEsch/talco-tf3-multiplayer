import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import {NativeRuntimeClient,createRuntimeIpcCredentials} from '../src/native-runtime-client.mjs';

const MAGIC=0x54463349,VERSION=1,HEADER=36,MAX_PAYLOAD=8192;
const skip=process.platform!=='win32';

function encode(type,id,session,payload){
  const body=Buffer.isBuffer(payload)?payload:Buffer.from(JSON.stringify(payload));
  const frame=Buffer.alloc(HEADER+body.length);
  frame.writeUInt32LE(MAGIC,0);frame.writeUInt16LE(VERSION,4);frame.writeUInt16LE(type,6);
  frame.writeUInt32LE(body.length,8);frame.writeBigUInt64LE(BigInt(id),12);
  session.copy(frame,20);body.copy(frame,HEADER);
  return frame;
}

function frameReader(socket){
  let buffer=Buffer.alloc(0),failure=null;
  const queued=[],waiters=[];
  const reject=error=>{
    failure=error;
    while(waiters.length)waiters.shift().reject(error);
  };
  socket.on('data',chunk=>{
    buffer=Buffer.concat([buffer,chunk]);
    while(buffer.length>=HEADER){
      const size=buffer.readUInt32LE(8);
      if(buffer.length<HEADER+size)break;
      queued.push(buffer.subarray(0,HEADER+size));
      buffer=buffer.subarray(HEADER+size);
      if(waiters.length)waiters.shift().resolve(queued.shift());
    }
  });
  socket.once('error',reject);
  socket.once('close',()=>reject(new Error('test pipe closed')));
  return ()=>{
    if(queued.length)return Promise.resolve(queued.shift());
    if(failure)return Promise.reject(failure);
    return new Promise((resolve,rejectPromise)=>waiters.push({resolve,reject:rejectPromise}));
  };
}

async function fixture(t){
  const credentials=createRuntimeIpcCredentials();
  const server=net.createServer();
  let socket=null,client=null;
  t.after(async()=>{
    client?.close();socket?.destroy();
    if(server.listening)await new Promise(resolve=>server.close(resolve));
  });
  const accepted=new Promise(resolve=>server.once('connection',resolve));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(`\\\\.\\pipe\\${credentials.pipe}`,resolve);
  });
  const connecting=NativeRuntimeClient.connect({...credentials,timeoutMs:1500});
  socket=await accepted;
  const read=frameReader(socket);
  const hello=await read();
  assert.equal(hello.readUInt16LE(6),1);
  assert.equal(hello.readBigUInt64LE(12),1n);
  assert.deepEqual(JSON.parse(hello.subarray(HEADER).toString()),{token:credentials.token});
  const session=Buffer.from('0123456789abcdef0123456789abcdef','hex');
  socket.write(encode(2,1n,session,{engineObserver:false,capabilities:[],productionQualified:false,guiFreezes:false}));
  client=await connecting;
  return {client,socket,read,session};
}

test('native runtime client accepts a correlated receipt with an exactly 8192-byte body',{skip,timeout:5000},async t=>{
  const {client,socket,read}=await fixture(t);
  const pending=client.control('ping');
  const request=await read();
  assert.equal(request.readUInt16LE(6),3);
  assert.equal(request.readBigUInt64LE(12),2n);
  assert.deepEqual(JSON.parse(request.subarray(HEADER).toString()),{control:'ping'});

  const receipt={status:'accepted',control:'ping',padding:''};
  const empty=Buffer.from(JSON.stringify(receipt));
  receipt.padding='x'.repeat(MAX_PAYLOAD-empty.length);
  const body=Buffer.from(JSON.stringify(receipt));
  assert.equal(body.length,MAX_PAYLOAD);
  socket.write(encode(4,request.readBigUInt64LE(12),request.subarray(20,36),body));

  const result=await pending;
  assert.equal(result.status,'accepted');
  assert.equal(result.control,'ping');
  assert.equal(result.padding.length,MAX_PAYLOAD-empty.length);
});

test('native runtime client rejects an 8193-byte response header and rejects the pending request without retry',{skip,timeout:5000},async t=>{
  const {client,socket,read,session}=await fixture(t);
  const pending=client.control('ping');
  const request=await read();
  assert.equal(request.readUInt16LE(6),3);
  assert.equal(request.readBigUInt64LE(12),2n);
  assert.deepEqual(JSON.parse(request.subarray(HEADER).toString()),{control:'ping'});

  const oversized=Buffer.alloc(HEADER);
  oversized.writeUInt32LE(MAGIC,0);oversized.writeUInt16LE(VERSION,4);oversized.writeUInt16LE(4,6);
  oversized.writeUInt32LE(MAX_PAYLOAD+1,8);oversized.writeBigUInt64LE(request.readBigUInt64LE(12),12);
  session.copy(oversized,20);
  const closed=new Promise(resolve=>socket.once('close',resolve));
  socket.write(oversized); // Deliberately omit the body: the header alone must fail closed.

  await assert.rejects(pending,/NATIVE_RUNTIME_IPC_MALFORMED_FRAME/);
  await closed;
});
