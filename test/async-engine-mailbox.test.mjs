import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,mkdir,readFile,writeFile,rm,link,rename } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createAsyncEngineMailbox,encodeAsyncEngineRequest,decodeAsyncEngineRequest,isUnpublishedEngineSource } from "../src/async-engine-mailbox.mjs";
import { ROAD_STOP_MODEL } from '../src/road-stop-order-payload.mjs';
import {replaceUnpublished} from '../src/unpublished-replace.mjs';
import { parseFlatDataFile } from "../src/userdata-ipc.mjs";
import { AsyncSessionParticipant } from "../src/async-session-participant.mjs";
const nonce="a".repeat(32);
const request={schemaVersion:1,roundId:"round",operationId:"one",operation:"release",updateCount:100};

test('unpublished source inspection rejects changed, oversized, missing and linked files',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-unpublished-'));
  const pending=path.join(root,'pending'),source=encodeAsyncEngineRequest(request,nonce);
  try{
    await writeFile(pending,source);
    assert.equal(await isUnpublishedEngineSource(pending,source),true);
    assert.equal(await isUnpublishedEngineSource(pending,source.replace('one','two')),false);
    assert.equal(await isUnpublishedEngineSource(pending,'x'.repeat(4097)),false);
    assert.equal(await isUnpublishedEngineSource(root,source),false);
    await assert.rejects(isUnpublishedEngineSource(path.join(root,'missing'),source),{code:'ENOENT'});
    await link(pending,path.join(root,'other-link'));
    assert.equal(await isUnpublishedEngineSource(pending,source),false);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('Windows replacement retry publishes original bytes and never overwrites after consumed source',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-replace-'));
  const pending=path.join(root,'pending'),destination=path.join(root,'request.lua'),source=encodeAsyncEngineRequest(request,nonce);
  const denied=Object.assign(new Error('sharing conflict'),{code:'EPERM'});
  try{
    await writeFile(pending,source);await writeFile(destination,'old');let attempts=0;
    await replaceUnpublished({platform:'win32',assertActive:()=>{},wait:async()=>{},
      verifyUnpublished:()=>isUnpublishedEngineSource(pending,source),
      replace:async()=>{if(++attempts===1)throw denied;await rename(pending,destination);}});
    assert.equal(attempts,2);assert.equal(await readFile(destination,'utf8'),source);
    assert.equal(decodeAsyncEngineRequest(await readFile(destination,'utf8'),nonce).operationId,'one');
    attempts=0;
    await assert.rejects(replaceUnpublished({platform:'win32',assertActive:()=>{},wait:async()=>{},
      verifyUnpublished:()=>isUnpublishedEngineSource(pending,source),replace:async()=>{attempts++;throw denied;}}),e=>e===denied);
    assert.equal(attempts,1);assert.equal(await readFile(destination,'utf8'),source);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('mailbox publication failures retain original error and precise safe stage',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-publication-stage-'));
  const directory=path.join(root,'tf3mp_status_1');await mkdir(directory);
  const m=await createAsyncEngineMailbox({directory,nonce});
  const requestPath=path.join(directory,'coordination_request.lua');
  try {
    await mkdir(requestPath);
    await assert.rejects(m.publish(request),error=>{
      assert.equal(error.message,'unsafe mailbox file');
      assert.equal(error.publicationStage,'path_check');return true;
    });
    await rm(requestPath,{recursive:true});
    await m.publish({...request,operationId:'next'});
    assert.equal(decodeAsyncEngineRequest(await readFile(requestPath,'utf8'),nonce).operationId,'next');
  }finally{await m.close();await rm(root,{recursive:true,force:true});}
});

test('engine mailbox preserves complete player/company command identity in both phases',()=>{
  for(const operation of ['prepare','executeHeld']) {
    const r={schemaVersion:1,roundId:'round',operationId:operation,operation,command:{protocolVersion:2,
      hostSequence:1,scheduledUpdate:108,originPlayerId:'player-a',targetCompanyEntity:7,targetEntity:42,
      commandType:'vehicle.setRunning',payload:{running:false},clientSequence:11,requestMessageId:'client-request-11'}};
    const source=encodeAsyncEngineRequest(r,nonce),p=parseFlatDataFile(source);
    assert.equal(p.originPlayerId,'player-a');assert.equal(p.requestMessageId,'client-request-11');
    assert.deepEqual(decodeAsyncEngineRequest(source,nonce),r);
    for(const key of ['originPlayerId','requestMessageId','protocolVersion','commandType']) {
      const missing=source.replace(new RegExp(` ${key}=[^\\n]+\\n`),'');
      assert.throws(()=>decodeAsyncEngineRequest(missing,nonce));
    }
    assert.throws(()=>decodeAsyncEngineRequest(source,'b'.repeat(32)),/nonce/);
    assert.throws(()=>decodeAsyncEngineRequest(source.replace('return {','return { extra=1,'),nonce),/fields/);
  }
});

test('road Stop scalar codec publishes bounded prepare and held execution',async()=>{
  const name='TalCo ' + 'é'.repeat(90);
  const command={protocolVersion:2,hostSequence:1,scheduledUpdate:108,originPlayerId:'player-a',
    targetCompanyEntity:3141,targetEntity:53417,commandType:'road.stop.place',
    payload:{edgeEntity:53417,companyEntity:3141,param:0.0000001,left:true,oneWay:false,
      model:ROAD_STOP_MODEL,name},clientSequence:11,requestMessageId:'road-11'};
  for(const operation of ['prepare','executeHeld']){
    const request={schemaVersion:1,roundId:'round',operationId:operation,operation,command};
    const source=encodeAsyncEngineRequest(request,nonce);
    assert.deepEqual(decodeAsyncEngineRequest(source,nonce),request);
    assert.throws(()=>decodeAsyncEngineRequest(source.replace(' paramText="1e-7",',' paramText="2",'),nonce));
    assert.throws(()=>decodeAsyncEngineRequest(source.replace(' nameChunkCount=3,',' nameChunkCount=2,'),nonce));
    const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-road-mailbox-'));
    const directory=path.join(root,'tf3mp_status_1');
    await mkdir(directory);
    const mailbox=await createAsyncEngineMailbox({directory,nonce});
    try{
      await mailbox.publish(request);
      assert.equal(await readFile(path.join(directory,'coordination_request.lua'),'utf8'),source);
    }finally{await mailbox.close();await rm(root,{recursive:true,force:true});}
  }
});

test('largest accepted road Stop name remains inside the coordination IPC bound',()=>{
  const command={protocolVersion:2,hostSequence:1,scheduledUpdate:108,originPlayerId:'player-a',
    targetCompanyEntity:3141,targetEntity:53417,commandType:'road.stop.place',
    payload:{edgeEntity:53417,companyEntity:3141,param:0.5,left:true,oneWay:false,
      model:ROAD_STOP_MODEL,name:'n'.repeat(1024)},clientSequence:11,requestMessageId:'road-12'};
  const request={schemaVersion:1,roundId:'round',operationId:'prepare',operation:'prepare',command};
  const source=encodeAsyncEngineRequest(request,nonce);
  assert.ok(Buffer.byteLength(source,'utf8')<=4096);
  assert.deepEqual(decodeAsyncEngineRequest(source,nonce),request);
});

test('engine binding codec preserves distinct two-to-four-company rosters',()=>{
  for(const count of [2,3,4]) {
    const r={schemaVersion:1,roundId:'round',operationId:'bind',operation:'bindSession',localPlayerId:'p1',
      players:Array.from({length:count},(_,i)=>({playerId:`p${i+1}`,companyEntity:i+10}))};
    const encoded=encodeAsyncEngineRequest(r,nonce);
    assert.deepEqual(decodeAsyncEngineRequest(encoded,nonce),r);
    for(const players of [[],r.players.slice(0,1),[...r.players,r.players[0]],r.players.map(v=>({...v,companyEntity:10})),r.players.map(v=>({...v,playerId:'same'}))]) {
      assert.throws(()=>encodeAsyncEngineRequest({...r,players},nonce));
    }
    assert.throws(()=>encodeAsyncEngineRequest({...r,localPlayerId:'absent'},nonce));
    assert.throws(()=>decodeAsyncEngineRequest(encoded.replace('return {','return {company5=999,'),nonce));
  }
});

test('engine request inverse rejects stale shape, executable input and unsupported operations',()=>{
  for(const operation of ['release','holdCheckpoint','halt']) {
    const r={schemaVersion:1,roundId:'r',operationId:operation,operation,
      ...(operation==='release'?{updateCount:1}:operation==='holdCheckpoint'?{updateCount:1,checkpointHash:'c'.repeat(64)}:{})};
    assert.deepEqual(decodeAsyncEngineRequest(encodeAsyncEngineRequest(r,nonce),nonce),r);
  }
  for(const source of ['os.execute("cmd")','function data() return {operation="purchase",} end'])
    assert.throws(()=>decodeAsyncEngineRequest(source,nonce));
});
test("receipt participant traverses real asynchronous files for checkpoint and release", async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),"tf3mp-async-pipeline-")),directory=path.join(root,"tf3mp_status_1");
  // Synthetic legacy engine supplies a precomputed digest. Real mailbox default
  // requires independently captured raw checkpoint fields.
  await mkdir(directory); const m=await createAsyncEngineMailbox({directory,nonce,requireCheckpointSnapshot:false});
  const sends=[], checkpointHash="c".repeat(64), companies=new Map([["a",1],["b",2]]);
  const p=new AsyncSessionParticipant({playerId:"a",companies,publish:r => m.publish(r),send:(kind,payload) => sends.push({kind,payload}),disconnect:() => {}});
  async function roundtrip(operation,extra) {
    let r;
    for(let i=0;i<100;i++) {
      try { r=parseFlatDataFile(await readFile(path.join(directory,"coordination_request.lua"),"utf8")); if(r.operation===operation) break; } catch {}
      await new Promise(resolve => setTimeout(resolve,5));
    }
    assert.equal(r?.operation,operation);
    const fields={schemaVersion:1,nonce,roundId:r.roundId,operationId:r.operationId,operation,status:"ok",updateCount:100,...extra};
    await writeFile(path.join(directory,"coordination_receipt.lua"),`function data() return {${Object.entries(fields).map(([k,v]) => `${k}=${JSON.stringify(v)},`).join("")}} end`);
    assert.equal(await m.poll(p),true);
  }
  try {
    p.observe({updateCount:100,held:false});
    p.receive("coordination_prepare",{roundId:"round",checkpointHash,updateCount:100,players:[{playerId:"a",companyEntity:1},{playerId:"b",companyEntity:2}]});
    assert.equal(p.phase,"holding_checkpoint");
    await roundtrip("holdCheckpoint",{held:true,checkpointHash}); assert.equal(sends.at(-1).kind,"participant_ready");
    p.receive("coordination_ready",{roundId:"round",checkpointHash,updateCount:100});
    await roundtrip("release",{held:false}); assert.equal(p.phase,"running");
    assert.equal(sends.at(-1).kind,"participant_released");
  } finally { await m.close(); await rm(root,{recursive:true,force:true}); }
});
test("mailbox codec refuses scripts, arbitrary fields and unsupported operations", () => {
  for(const extra of [{roundId:'x"; os.exit()'}, {operation:"purchase"}, {updateCount:-1}, {extra:1}, {operationId:"../bad"}]) {
    assert.throws(() => encodeAsyncEngineRequest({...request,...extra},nonce));
  }
  assert.equal(parseFlatDataFile(encodeAsyncEngineRequest(request,nonce)).updateCount,100);
});
test("halt preempts queued release and blocks all later engine work", async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),"tf3mp-async-halt-")),directory=path.join(root,"tf3mp_status_1");
  await mkdir(directory); const m=await createAsyncEngineMailbox({directory,nonce});
  try {
    const releasing=m.publish(request);
    const stopping=m.publish({schemaVersion:1,roundId:"round",operationId:"stop",operation:"halt"});
    const results=await Promise.allSettled([releasing,stopping]);
    assert.equal(results[0].status,"rejected"); assert.match(results[0].reason.message,/cancelled/);
    assert.equal(results[1].status,"fulfilled");
    assert.equal(parseFlatDataFile(await readFile(path.join(directory,"coordination_request.lua"),"utf8")).operation,"halt");
    await assert.rejects(m.publish({...request,operationId:"later"}),/halted/);
    await assert.rejects(m.publish({schemaVersion:1,roundId:"round",operationId:"stop-again",operation:"halt"}),/halted/);
  } finally {await m.close(); await rm(root,{recursive:true,force:true});}
});
test("close cancels queued operations instead of publishing during teardown", async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),"tf3mp-async-close-")),directory=path.join(root,"tf3mp_status_1");
  await mkdir(directory); const m=await createAsyncEngineMailbox({directory,nonce});
  try {
    const pending=m.publish(request); const closed=m.close();
    const results=await Promise.allSettled([pending,closed]);
    assert.equal(results[0].status,"rejected"); assert.equal(results[1].status,"fulfilled");
    await assert.rejects(readFile(path.join(directory,"coordination_request.lua")),{code:"ENOENT"});
  } finally {await m.close(); await rm(root,{recursive:true,force:true});}
});
test("real mailbox serializes requests, scopes receipts, bounds reads and cleans up", async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),"tf3mp-async-")),directory=path.join(root,"tf3mp_status_1");
  await mkdir(directory); const m=await createAsyncEngineMailbox({directory,nonce});
  const file=path.join(directory,"coordination_receipt.lua"); let received=0;
  const participant={receiveEngine:p => {received++; assert.equal(p.operation,"release"); return true;}};
  try {
    await assert.rejects(createAsyncEngineMailbox({directory,nonce}),{code:"EEXIST"});
    await Promise.all([m.publish(request),m.publish({...request,operationId:"two"})]);
    assert.equal(parseFlatDataFile(await readFile(path.join(directory,"coordination_request.lua"),"utf8")).operationId,"two");
    assert.equal(await m.poll(participant),false);
    await writeFile(file,"function data() return {"); assert.equal(await m.poll(participant),false);
    await writeFile(file,`function data() return {nonce="${"b".repeat(32)}",operation="release",} end`); assert.equal(await m.poll(participant),false);
    await writeFile(file,`function data() return {nonce="${nonce}",operation="release",} end`); assert.equal(await m.poll(participant),true);
    assert.equal(received,1);
    await writeFile(file,"x".repeat(4097)); await assert.rejects(m.poll(participant),/oversized/);
    await m.close(); await assert.rejects(readFile(path.join(directory,"coordination_request.lua")),{code:"ENOENT"});
    await assert.rejects(m.publish(request),/closed/);
  } finally { await m.close(); await rm(root,{recursive:true,force:true}); }
});
