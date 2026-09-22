import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import {COORDINATED_NATIVE_CAPABILITIES,openNativeHostJoinGate,resolveNativeHostJoinMode} from '../src/native-host-join.mjs';

class FakeClient extends EventEmitter {
  constructor(capabilities,{bindFails=false,bindReceipt, pingReceipt,productionQualified=true}={}){super();this.capabilities=capabilities;this.closed=false;this.bindFails=bindFails;this.bindReceipt=bindReceipt;this.pingReceipt=pingReceipt;this.bound=null;this.handshake={engineObserver:true,productionQualified};}
  requireCapability(capability){if(!this.capabilities.includes(capability))throw new Error(`NATIVE_RUNTIME_CAPABILITY_UNAVAILABLE:${capability}`);}
  async bindSession(binding){if(this.bindFails)throw new Error('NATIVE_RUNTIME_IPC_BIND_REJECTED');this.bound=binding;return this.bindReceipt??{status:'accepted',...binding};}
  async control(control){if(control!=='ping')throw new Error('UNEXPECTED_CONTROL');return this.pingReceipt??{status:'accepted'};}
  close(){this.closed=true;}
}
const options={nativePipe:'tf3mp_test',nativeToken:'a'.repeat(64)};
const SESSION='12345678-1234-4234-9234-123456789abc';

test('native Host/Join gate is optional only when both credentials are absent',async()=>{
  assert.equal(await openNativeHostJoinGate({options:{},role:'host',sessionId:SESSION}),null);
  await assert.rejects(openNativeHostJoinGate({options:{nativePipe:'tf3mp_test'},role:'host',sessionId:SESSION}),/CREDENTIALS_REQUIRED/);
});

test('CLI mode policy requires native credentials outside an admission-free diagnostic mode',()=>{
  assert.throws(()=>resolveNativeHostJoinMode({}),/NATIVE_RUNTIME_REQUIRED/);
  assert.throws(()=>resolveNativeHostJoinMode({nativePipe:'tf3mp_test'}),/CREDENTIALS_REQUIRED/);
  assert.deepEqual(resolveNativeHostJoinMode(options),{diagnosticOnly:false,credentials:{pipe:'tf3mp_test',token:'a'.repeat(64)}});
  assert.deepEqual(resolveNativeHostJoinMode({'diagnostic-transport-only':true}),{diagnosticOnly:true,credentials:null});
  assert.throws(()=>resolveNativeHostJoinMode({...options,'diagnostic-transport-only':true}),/FORBIDS/);
});

test('native Host/Join gate fails closed before admission for a missing required capability',async()=>{
  const client=new FakeClient(['transport.health']);
  await assert.rejects(openNativeHostJoinGate({options,role:'host',sessionId:SESSION,clientFactory:async()=>client}),/session\.bind/);
  assert.equal(client.closed,true);
});

test('debugger qualification is never treated as production admission',async()=>{
  const client=new FakeClient(COORDINATED_NATIVE_CAPABILITIES,{productionQualified:false});
  await assert.rejects(openNativeHostJoinGate({options,role:'host',sessionId:SESSION,clientFactory:async()=>client}),/NOT_PRODUCTION_QUALIFIED/);
  assert.equal(client.closed,true);
});

test('native Host/Join gate accepts the coordinator identity grammar and rejects unsafe identities before binding',async()=>{
  const valid=new FakeClient(COORDINATED_NATIVE_CAPABILITIES);
  const validGate=await openNativeHostJoinGate({options,role:'host',sessionId:'session.alpha:1',clientFactory:async()=>valid});
  assert.deepEqual(valid.bound,{sessionId:'session.alpha:1',role:'host'});
  validGate.close();
  const client=new FakeClient(COORDINATED_NATIVE_CAPABILITIES);
  await assert.rejects(openNativeHostJoinGate({options,role:'host',sessionId:'unsafe identity',clientFactory:async()=>client}),/INVALID_NATIVE_RUNTIME_GATE_OPTIONS/);
  assert.equal(client.bound,null);
});

test('native Host/Join gate closes the endpoint when authenticated session binding fails',async()=>{
  const client=new FakeClient(COORDINATED_NATIVE_CAPABILITIES,{bindFails:true});
  await assert.rejects(openNativeHostJoinGate({options,role:'host',sessionId:SESSION,clientFactory:async()=>client}),/BIND_REJECTED/);
  assert.equal(client.closed,true);
  assert.equal(client.bound,null);
});

test('native Host/Join gate rejects non-accepted or mismatched binding and ping receipts',async()=>{
  for(const client of [
    new FakeClient(COORDINATED_NATIVE_CAPABILITIES,{bindReceipt:{status:'rejected'}}),
    new FakeClient(COORDINATED_NATIVE_CAPABILITIES,{bindReceipt:{status:'accepted',sessionId:SESSION,role:'participant'}}),
    new FakeClient(COORDINATED_NATIVE_CAPABILITIES,{pingReceipt:{status:'rejected'}}),
  ]) {
    await assert.rejects(openNativeHostJoinGate({options,role:'host',sessionId:SESSION,clientFactory:async()=>client}),/INVALID_BIND_RECEIPT|PING_REJECTED/);
    assert.equal(client.closed,true);
  }
});

test('native Host/Join gate logs uncertain outcomes and revokes readiness on disconnect',async()=>{
  const events=[],client=new FakeClient(COORDINATED_NATIVE_CAPABILITIES);let cleaned=null;
  const gate=await openNativeHostJoinGate({options,role:'join',sessionId:SESSION,clientFactory:async()=>client,logger:event=>events.push(event),onDisconnect:reason=>{cleaned=reason;}});
  assert.equal(gate.ready,true);
  assert.deepEqual(client.bound,{sessionId:SESSION,role:'participant'});
  client.emit('unknownOutcome',{id:7n,reason:'timeout'});
  client.emit('disconnect','NATIVE_RUNTIME_IPC_DISCONNECTED');
  assert.equal(gate.ready,false);
  assert.equal(cleaned,'NATIVE_RUNTIME_IPC_DISCONNECTED');
  assert.equal(events.some(event=>event.event==='native_runtime_unknown_outcome'),true);
  assert.equal(events.some(event=>event.event==='native_runtime_disconnected'&&event.coordinatedGameplayAdmission===false),true);
  gate.close();
});
