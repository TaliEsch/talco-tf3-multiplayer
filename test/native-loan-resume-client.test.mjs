import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {NativeRuntimeClient,createRuntimeIpcCredentials,
  validateOrdinaryLoanWorld,validateOrdinaryLoanResumeArmRequest,
  validateOrdinaryLoanResumeArmReceipt} from '../src/native-runtime-client.mjs';

const command={nonce:'a'.repeat(32),digest:'b'.repeat(64),owner:15702,loanId:0,
  epoch:'07'.repeat(16),generation:'1',ttlMs:5000};

test('native loan request preserves zero loan ID and exact lossless wire order',()=>{
  assert.deepEqual(validateOrdinaryLoanResumeArmRequest(command),command);
  assert.deepEqual(Object.keys(validateOrdinaryLoanResumeArmRequest({...command})),
    ['nonce','digest','owner','loanId','epoch','generation','ttlMs']);
  for(const patch of [{nonce:'0'.repeat(32)},{digest:'B'.repeat(64)},
    {epoch:'0'.repeat(32)},{generation:'01'},{generation:'18446744073709551616'},
    {owner:0},{loanId:2147483647},{ttlMs:0},{ttlMs:5001},{extra:true}])
    assert.throws(()=>validateOrdinaryLoanResumeArmRequest({...command,...patch}));
  assert.equal(validateOrdinaryLoanWorld(null),null);
  assert.deepEqual(validateOrdinaryLoanWorld({epoch:command.epoch,generation:'18446744073709551615'}),
    {epoch:command.epoch,generation:'18446744073709551615'});
  assert.throws(()=>validateOrdinaryLoanWorld(undefined));
  assert.throws(()=>validateOrdinaryLoanResumeArmReceipt({status:'accepted',control:'armOrdinaryLoanResume'}));
});

// Owned JS wire peer only: this exercises the real client framing and retry
// barrier, and establishes no native authority or TF3 engine qualification.
async function peer(t,outcome){
  const credentials=createRuntimeIpcCredentials();
  const session=Buffer.alloc(16,7);let arms=0,lastBody=null;
  const server=net.createServer(socket=>{
    let buffered=Buffer.alloc(0);
    socket.on('error',()=>{});
    socket.on('data',chunk=>{
      buffered=Buffer.concat([buffered,chunk]);
      while(buffered.length>=36){
        const size=buffered.readUInt32LE(8);
        if(buffered.length<36+size)return;
        const frame=buffered.subarray(0,36+size);buffered=buffered.subarray(36+size);
        const body=frame.subarray(36).toString();const request=JSON.parse(body);
        let payload,type=4;
        if(frame.readUInt16LE(6)===1){
          assert.equal(request.token,credentials.token);type=2;
          payload={capabilities:['transport.health','session.bind','experiment.ordinary-loan-resume-arm.v1'],
            engineObserver:false,productionQualified:false};
        }else if(request.control==='bind'){
          payload={status:'accepted',boundSessionId:request.sessionId,boundRole:request.role};
        }else if(request.control==='ping'){
          payload={status:'accepted',ordinaryLoanWorld:{epoch:command.epoch,generation:'1'}};
        }else if(request.control==='armOrdinaryLoanResume'){
          ++arms;lastBody=body;
          if(outcome==='timeout')continue;
          if(outcome==='reject'){type=6;payload={code:'LOAN_RESUME_REJECTED'};}
          else payload={status:outcome==='malformed'?'accepted':'armed',control:request.control};
        }else throw new Error('unexpected owned request');
        const encoded=Buffer.from(JSON.stringify(payload));const reply=Buffer.alloc(36+encoded.length);
        reply.writeUInt32LE(0x54463349);reply.writeUInt16LE(1,4);reply.writeUInt16LE(type,6);
        reply.writeUInt32LE(encoded.length,8);frame.copy(reply,12,12,20);
        session.copy(reply,20);encoded.copy(reply,36);socket.write(reply);
      }
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(`\\\\.\\pipe\\${credentials.pipe}`,resolve);});
  const client=await NativeRuntimeClient.connect({...credentials,timeoutMs:100});
  t.after(async()=>{client.close();await new Promise(resolve=>server.close(resolve));});
  await client.bindSession({sessionId:'owned.loan.client:1',role:'participant'});
  return {client,get arms(){return arms;},get lastBody(){return lastBody;}};
}
for(const outcome of ['success','reject','malformed','timeout']){
  test(`native loan client spends its one arm after ${outcome}`,async t=>{
    const fixture=await peer(t,outcome);
    assert.deepEqual(await fixture.client.ordinaryLoanWorld(),{epoch:command.epoch,generation:'1'});
    if(outcome==='success')assert.deepEqual(await fixture.client.armOrdinaryLoanResume(command),
      {status:'armed',control:'armOrdinaryLoanResume'});
    else await assert.rejects(fixture.client.armOrdinaryLoanResume(command));
    await assert.rejects(fixture.client.armOrdinaryLoanResume(command),/ALREADY_ATTEMPTED/);
    assert.equal(fixture.arms,1);
    assert.equal(fixture.lastBody,JSON.stringify({control:'armOrdinaryLoanResume',...command}));
  });
}
