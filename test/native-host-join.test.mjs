import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import {COORDINATED_NATIVE_CAPABILITIES,openNativeHostJoinGate,resolveNativeHostJoinMode} from '../src/native-host-join.mjs';

class FakeClient extends EventEmitter {
  constructor(capabilities,{bindFails=false,bindReceipt, pingReceipt,productionQualified=true}={}){super();this.capabilities=capabilities;this.closed=false;this.bindFails=bindFails;this.bindReceipt=bindReceipt;this.pingReceipt=pingReceipt;this.bound=null;this.handshake={engineObserver:true,productionQualified};}
  requireCapability(capability){if(!this.capabilities.includes(capability))throw new Error(`NATIVE_RUNTIME_CAPABILITY_UNAVAILABLE:${capability}`);}
  async bindSession(binding){if(this.bindFails)throw new Error('NATIVE_RUNTIME_IPC_BIND_REJECTED');this.bound=binding;return this.bindReceipt??{status:'accepted',...binding};}
  async control(control){if(control!=='ping')throw new Error('UNEXPECTED_CONTROL');return this.pingReceipt??{status:'accepted'};}
  async gateControl(command){return {status:command.control==='release'?'permit_consumed':command.control==='hold'?'held':command.control==='halt'?'halt_requested':'detach_prepared',...command,[command.control==='release'?'permitConsumedGeneration':command.control==='hold'?'heldGeneration':command.control==='halt'?'haltGeneration':'detachGeneration']:command.generation};}
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

test('production admission requires real simulation hold and engine halt, not a production boolean alone',async()=>{
  const client=new FakeClient(['transport.health','session.bind'],{productionQualified:true});
  await assert.rejects(openNativeHostJoinGate({options,role:'host',sessionId:SESSION,clientFactory:async()=>client}),/simulation\.hold/);
  assert.equal(client.closed,true);
});

test('production admission requires typed gate receipts before Host/Join can open',async()=>{
  const client=new FakeClient(COORDINATED_NATIVE_CAPABILITIES.filter(capability=>capability!=='simulation.gate-receipts.v1'));
  await assert.rejects(openNativeHostJoinGate({options,role:'host',sessionId:SESSION,clientFactory:async()=>client}),/simulation\.gate-receipts\.v1/);
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

test('native Host/Join heartbeat keeps the native lease alive and fails closed when ping stalls',async()=>{
  const client=new FakeClient(COORDINATED_NATIVE_CAPABILITIES);let pings=0,cleanup=null;
  client.control=async control=>{
    assert.equal(control,'ping');pings++;
    if(pings===1)return {status:'accepted'};
    throw new Error('NATIVE_RUNTIME_IPC_TIMEOUT');
  };
  const gate=await openNativeHostJoinGate({options,role:'host',sessionId:SESSION,clientFactory:async()=>client,
    heartbeatMs:50,onDisconnect:reason=>{cleanup=reason;}});
  for(let i=0;i<20&&gate.ready;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(gate.ready,false);
  assert.equal(cleanup,'NATIVE_RUNTIME_HEARTBEAT_FAILED');
  assert.equal(client.closed,true);
  assert.ok(pings>=2);
  gate.close();
});

test('typed native gate commands preserve uint64 identifiers and require correlated terminal events',async()=>{
  const client=new FakeClient([...COORDINATED_NATIVE_CAPABILITIES,'simulation.gate-receipts.v1','engine.detach']);
  const events=[];
  const gate=await openNativeHostJoinGate({options,role:'host',sessionId:SESSION,clientFactory:async()=>client,logger:event=>events.push(event)});
  const request={control:'release',epoch:'18446744073709551615',generation:'72057594037927935'};
  const receipt=await gate.gateControl(request);
  assert.equal(receipt.permitConsumedGeneration,request.generation);
  const applied=gate.awaitGateEvent(request);
  client.emit('event',{payload:{event:'boundary_applied',epoch:request.epoch,generation:request.generation,releaseAppliedGeneration:request.generation}});
  assert.equal((await applied).event,'boundary_applied');
  assert.equal(events.some(event=>event.event==='native_runtime_gate_event'&&event.phase==='boundary_applied'),true);
  await assert.rejects(gate.gateControl({control:'release',epoch:'01',generation:'1'}),/INVALID_NATIVE_GATE_COMMAND/);
  gate.close();
});

test('gate events use control type when hold and detach share an epoch and generation, then clean up both records',async()=>{
  const client=new FakeClient([...COORDINATED_NATIVE_CAPABILITIES,'simulation.gate-receipts.v1','engine.detach']);
  let releaseHold,delayFirstHold=true;
  const immediateGateControl=client.gateControl.bind(client);
  client.gateControl=command=>{
    if(command.control!=='hold'||!delayFirstHold)return immediateGateControl(command);
    delayFirstHold=false;
    return new Promise(resolve=>{releaseHold=()=>resolve({status:'held',...command,heldGeneration:command.generation});});
  };
  const gate=await openNativeHostJoinGate({options,role:'host',sessionId:SESSION,clientFactory:async()=>client});
  const correlation={epoch:'17',generation:'9'};
  const hold={control:'hold',...correlation},detach={control:'detach',...correlation};

  const held=gate.gateControl(hold);
  assert.equal((await gate.gateControl(detach)).status,'detach_prepared');
  const detached=gate.awaitGateEvent(detach);
  client.emit('event',{payload:{event:'detached',...correlation,detachGeneration:correlation.generation}});
  assert.equal((await detached).event,'detached');

  // Resolving the still-pending hold after the detach event proves that the
  // event was correlated by control as well as its shared numeric identity.
  releaseHold();
  assert.equal((await held).status,'held');
  assert.equal((await gate.gateControl(hold)).status,'held');
  assert.equal((await gate.gateControl(detach)).status,'detach_prepared');
  gate.close();
});

test('unmatched and invalid terminal events permanently revoke the gate and clean every waiter exactly once',async()=>{
  for(const invalidEvent of [
    {event:'boundary_applied',epoch:'3',generation:'8',releaseAppliedGeneration:'8'},
    {event:'boundary_applied',epoch:'3',generation:'7',releaseAppliedGeneration:'0'},
    null,
  ]) {
    const client=new FakeClient(COORDINATED_NATIVE_CAPABILITIES);
    const disconnects=[];
    const gate=await openNativeHostJoinGate({options,role:'host',sessionId:SESSION,clientFactory:async()=>client,onDisconnect:reason=>disconnects.push(reason)});
    const request={control:'release',epoch:'3',generation:'7'};
    await gate.gateControl(request);
    const waiters=[gate.awaitGateEvent(request),gate.awaitGateEvent(request)];
    client.emit('event',{payload:invalidEvent});
    for(const waiter of waiters)await assert.rejects(waiter,/NATIVE_RUNTIME_GATE_CLOSED/);
    assert.equal(gate.ready,false);
    assert.equal(client.closed,true);
    assert.equal(disconnects.length,1);
    assert.equal(client.listenerCount('event'),0);
    assert.equal(client.listenerCount('disconnect'),0);
    gate.close();
    assert.equal(disconnects.length,1);
  }
});

test('a failed gate receipt revokes readiness and rejects every pending event waiter without retry',async()=>{
  const client=new FakeClient(COORDINATED_NATIVE_CAPABILITIES);
  let finishReceipt;
  client.gateControl=command=>new Promise(resolve=>{finishReceipt=()=>resolve({status:'held',...command,heldGeneration:command.generation});});
  const disconnects=[];
  const gate=await openNativeHostJoinGate({options,role:'host',sessionId:SESSION,clientFactory:async()=>client,onDisconnect:reason=>disconnects.push(reason)});
  const request={control:'release',epoch:'4',generation:'2'};
  const receipt=gate.gateControl(request);
  const waiters=[gate.awaitGateEvent(request),gate.awaitGateEvent(request)];
  finishReceipt();
  await assert.rejects(receipt,/NATIVE_GATE_RECEIPT_PHASE_INVALID/);
  for(const waiter of waiters)await assert.rejects(waiter,/NATIVE_RUNTIME_GATE_CLOSED/);
  assert.equal(gate.ready,false);
  assert.equal(client.closed,true);
  assert.deepEqual(disconnects,['NATIVE_RUNTIME_GATE_RECEIPT_FAILED']);
  assert.equal(client.listenerCount('event'),0);
  assert.equal(client.listenerCount('disconnect'),0);
});

test('a terminal event cannot resolve before its matching receipt validates',async()=>{
  const client=new FakeClient(COORDINATED_NATIVE_CAPABILITIES);
  let finishReceipt;
  client.gateControl=command=>new Promise(resolve=>{finishReceipt=()=>resolve({status:'permit_consumed',...command,permitConsumedGeneration:command.generation});});
  const gate=await openNativeHostJoinGate({options,role:'host',sessionId:SESSION,clientFactory:async()=>client});
  const request={control:'release',epoch:'9',generation:'4'};
  const receipt=gate.gateControl(request);
  let resolved=false;
  const event=gate.awaitGateEvent(request).then(value=>{resolved=true;return value;});
  client.emit('event',{payload:{event:'boundary_applied',epoch:'9',generation:'4',releaseAppliedGeneration:'4'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(resolved,false,'event remains provisional until the receipt is valid');
  finishReceipt();
  assert.equal((await receipt).status,'permit_consumed');
  assert.equal((await event).event,'boundary_applied');
  gate.close();
});

test('a gate event timeout makes every outstanding gate operation terminal and explicit close remains idempotent',async()=>{
  const client=new FakeClient(COORDINATED_NATIVE_CAPABILITIES);
  const disconnects=[];
  const gate=await openNativeHostJoinGate({options,role:'host',sessionId:SESSION,clientFactory:async()=>client,onDisconnect:reason=>disconnects.push(reason)});
  const first={control:'release',epoch:'5',generation:'1'},second={control:'halt',epoch:'5',generation:'2'};
  await gate.gateControl(first);
  await gate.gateControl(second);
  const timedOut=gate.awaitGateEvent(first,{timeoutMs:50});
  const other=gate.awaitGateEvent(second);
  await assert.rejects(timedOut,/NATIVE_GATE_EVENT_UNKNOWN_NO_RETRY/);
  await assert.rejects(other,/NATIVE_RUNTIME_GATE_CLOSED/);
  assert.equal(gate.ready,false);
  assert.equal(client.closed,true);
  assert.deepEqual(disconnects,['NATIVE_RUNTIME_GATE_EVENT_TIMEOUT']);
  assert.equal(client.listenerCount('event'),0);
  assert.equal(client.listenerCount('disconnect'),0);
  gate.close();
  assert.deepEqual(disconnects,['NATIVE_RUNTIME_GATE_EVENT_TIMEOUT']);
});
