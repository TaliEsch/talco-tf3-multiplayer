import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {encodeAsyncEngineRequest,decodeAsyncEngineRequest,createAsyncEngineMailbox} from '../src/async-engine-mailbox.mjs';
import {decodeLineCreateExecutionReceipt} from '../src/coordinator-line-create-execution.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';

const nonce='a'.repeat(32);
const command={protocolVersion:2,hostSequence:1,scheduledUpdate:108,originPlayerId:'remote',
  targetCompanyEntity:55652,targetEntity:730,commandType:'road.line.create',
  payload:{companyEntity:55652,stationA:730,stationB:731},
  clientSequence:11,requestMessageId:'line-11'};
const receipt={schemaVersion:1,nonce,roundId:'round',operationId:'executeHeld',
  operation:'executeHeld',status:'ok',updateCount:108,held:true,
  snapshotVersion:4,hostSequence:1,entity:74001,lineEntity:74001,
  ownerCompanyEntity:55652,stationA:730,stationB:731};
test('line request uses one extra flat station field and is opt-in',()=>{
  for(const operation of ['prepare','executeHeld']){
    const request={schemaVersion:1,roundId:'round',operationId:operation,operation,command};
    assert.throws(()=>encodeAsyncEngineRequest(request,nonce));
    const source=encodeAsyncEngineRequest(request,nonce,{enableLineCreate:true});
    const flat=parseFlatDataFile(source);
    assert.equal(flat.entity,730);assert.equal(flat.stationB,731);
    assert.equal(Object.keys(flat).length,15);
    assert.deepEqual(decodeAsyncEngineRequest(source,nonce,{enableLineCreate:true}),request);
    assert.throws(()=>decodeAsyncEngineRequest(source,nonce));
    assert.throws(()=>decodeAsyncEngineRequest(source.replace('stationB=731','stationB=730'),nonce,{enableLineCreate:true}));
  }
});
test('line receipt accepts only the exact held line and station identity',()=>{
  const decoded=decodeLineCreateExecutionReceipt(receipt);
  assert.equal(decoded.state.line.entity,74001);
  for(const bad of [{stationB:730},{lineEntity:74002},{ownerCompanyEntity:0},
    {held:false},{snapshotVersion:3},{extra:1}])
    assert.throws(()=>decodeLineCreateExecutionReceipt({...receipt,...bad}));
});
test('mailbox rejects mismatched station receipt and accepts correlated world receipt',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-line-create-'));
  const directory=path.join(root,'tf3mp_status_1');await mkdir(directory);
  const request={schemaVersion:1,roundId:'round',operationId:'executeHeld',operation:'executeHeld',command};
  const evidence=[];const delivered=[];
  const mailbox=await createAsyncEngineMailbox({directory,nonce,enableLineCreate:true,
    onExecutionEvidence:value=>evidence.push(value)});
  const participant={receiveEngine:value=>{delivered.push(value);return true;}};
  const write=async value=>writeFile(path.join(directory,'coordination_receipt.lua'),
    `function data() return {${Object.entries(value).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`);
  try{
    await mailbox.publish(request);
    await write({...receipt,stationB:732});await mailbox.poll(participant);
    assert.equal(evidence.length,0);assert.equal(delivered.at(-1).status,'unknown');
    await write(receipt);await mailbox.poll(participant);
    assert.equal(evidence.length,1);assert.equal(delivered.at(-1).status,'ok');
    assert.equal(evidence[0].state.line.stationB,731);
  }finally{await mailbox.close();await rm(root,{recursive:true,force:true});}
});
