import {NativeRuntimeClient,NATIVE_RUNTIME_CAPABILITIES,validateNativeGateCommand,validateNativeGateReceipt,validateNativeGateEvent} from './native-runtime-client.mjs';

// This controller requires authenticated transport, a persistent session fence
// and the qualified TF3 simulation gate. It still provides no gameplay-command
// capture or vehicle executor.
export const COORDINATED_NATIVE_CAPABILITIES=Object.freeze([
  NATIVE_RUNTIME_CAPABILITIES.transportHealth,
  NATIVE_RUNTIME_CAPABILITIES.sessionBinding,
  // These are mandatory for admission. A runtime which only observes TF3 or
  // accepts diagnostic transport controls is never a multiplayer engine gate.
  NATIVE_RUNTIME_CAPABILITIES.simulationHold,
  NATIVE_RUNTIME_CAPABILITIES.engineHalt,
  NATIVE_RUNTIME_CAPABILITIES.gateReceipts,
]);

const credentialsFor=options=>{
  const pipe=options?.nativePipe??options?.['native-pipe'];
  const token=options?.nativeToken??options?.['native-token'];
  if(pipe===undefined&&token===undefined)return null;
  if(typeof pipe!=='string'||typeof token!=='string')throw new Error('NATIVE_RUNTIME_CREDENTIALS_REQUIRED');
  return {pipe,token};
};

// The diagnostic escape is intentionally incapable of admitting a player. It
// exists for wire/diagnostic checks, not as a fallback multiplayer mode.
export const resolveNativeHostJoinMode=options=>{
  const diagnosticOnly=options?.['diagnostic-transport-only']===true;
  const credentials=credentialsFor(options);
  if(diagnosticOnly){
    if(credentials)throw new Error('DIAGNOSTIC_TRANSPORT_ONLY_FORBIDS_NATIVE_RUNTIME');
    return Object.freeze({diagnosticOnly:true,credentials:null});
  }
  if(!credentials)throw new Error('NATIVE_RUNTIME_REQUIRED');
  return Object.freeze({diagnosticOnly:false,credentials});
};

export async function openNativeHostJoinGate({options,sessionId,role,logger=()=>{},onDisconnect=()=>{},clientFactory=NativeRuntimeClient.connect,heartbeatMs=1000}={}){
  if(!['host','join'].includes(role)||typeof sessionId!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(sessionId)
    ||!Number.isInteger(heartbeatMs)||heartbeatMs<50||heartbeatMs>5000)throw new TypeError('INVALID_NATIVE_RUNTIME_GATE_OPTIONS');
  const credentials=credentialsFor(options);
  if(!credentials)return null;
  let client;
  let binding;
  const nativeRole=role==='join'?'participant':'host';
  try{client=await clientFactory(credentials);}
  catch(error){throw new Error(`NATIVE_RUNTIME_CONNECT_FAILED:${error?.message??'UNKNOWN'}`);}
  try{
    for(const capability of COORDINATED_NATIVE_CAPABILITIES)client.requireCapability(capability);
    // The controller deliberately has no "join" role: every non-host game
    // process is an authenticated participant on the native IPC wire.
    const bindingReceipt=await client.bindSession({sessionId,role:nativeRole});
    if(bindingReceipt?.status!=='accepted'
      ||(bindingReceipt.boundSessionId??bindingReceipt.sessionId)!==sessionId
      ||(bindingReceipt.boundRole??bindingReceipt.role)!==nativeRole) {
      throw new Error('NATIVE_RUNTIME_INVALID_BIND_RECEIPT');
    }
    // This only verifies that the authenticated IPC transport can round-trip a
    // bounded health request.  It does not claim a TF3 simulation boundary.
    const pingReceipt=await client.control('ping');
    if(pingReceipt?.status!=='accepted')throw new Error('NATIVE_RUNTIME_PING_REJECTED');
    // Preserve the runtime's exact-build qualification result through
    // Host/Join. Never turn a passive or fixture runtime into a multiplayer
    // admission fallback.
    if(client.handshake?.productionQualified!==true)throw new Error('NATIVE_RUNTIME_NOT_PRODUCTION_QUALIFIED');
    binding=Object.freeze({sessionId,role:nativeRole,receipt:bindingReceipt});
  }catch(error){client.close();throw error;}
  let open=true;
  let terminal=false;
  let disconnectNotified=false;
  let heartbeatTimer=null,heartbeatInFlight=false;
  const pendingGateCommands=new Map();
  const gateKey=command=>`${command.control}:${command.epoch}:${command.generation}`;
  const reportUnknown=outcome=>logger({level:'error',event:'native_runtime_unknown_outcome',role,sessionId,detail:outcome});
  const rejectGateWaiters=error=>{
    for(const entry of pendingGateCommands.values())for(const waiter of entry.waiters.splice(0))waiter.reject(error);
    pendingGateCommands.clear();
  };
  const releaseClientResources=()=>{
    client.off('unknownOutcome',reportUnknown);
    client.off('disconnect',reportDisconnect);
    client.off('event',gateEvent);
    client.close();
  };
  // All terminal gate outcomes are fail-closed. Remove our listeners before
  // closing the client because its close may synchronously emit disconnect.
  const terminate=(reason,{notify=true}={})=>{
    if(terminal)return;
    terminal=true;
    open=false;
    if(heartbeatTimer!==null){clearInterval(heartbeatTimer);heartbeatTimer=null;}
    rejectGateWaiters(new Error('NATIVE_RUNTIME_GATE_CLOSED'));
    releaseClientResources();
    if(!notify||disconnectNotified)return;
    disconnectNotified=true;
    logger({level:'error',event:'native_runtime_disconnected',role,sessionId,code:reason,coordinatedGameplayAdmission:false});
    Promise.resolve(onDisconnect(reason)).catch(error=>logger({level:'error',event:'native_runtime_disconnect_cleanup_failed',role,sessionId,code:error?.message??'UNKNOWN'}));
  };
  const reportDisconnect=reason=>terminate(reason);
  const heartbeat=async()=>{
    if(!open||heartbeatInFlight)return;
    heartbeatInFlight=true;
    try {
      const receipt=await client.control('ping');
      if(receipt?.status!=='accepted')throw new Error('NATIVE_RUNTIME_PING_REJECTED');
    } catch(error) {
      logger({level:'error',event:'native_runtime_heartbeat_failed',role,sessionId,code:error?.message??'UNKNOWN'});
      terminate('NATIVE_RUNTIME_HEARTBEAT_FAILED');
    } finally {heartbeatInFlight=false;}
  };
  client.on('unknownOutcome',reportUnknown);
  client.on('disconnect',reportDisconnect);
  const eventControl=event=>({boundary_applied:'release',terminal_parked:'halt',detached:'detach'})[event];
  const deliverValidatedEvent=entry=>{
    if(entry.receiptValidated!==true||entry.event===null||entry.waiters.length===0)return;
    const waiters=entry.waiters.splice(0),key=gateKey(entry.command);
    pendingGateCommands.delete(key);
    for(const waiter of waiters)waiter.resolve(entry.event);
  };
  const gateEvent=frame=>{
    const event=frame?.payload;
    if(!event||typeof event!=='object'||Array.isArray(event)){
      reportUnknown({reason:'INVALID_GATE_EVENT',event});
      terminate('NATIVE_RUNTIME_GATE_EVENT_INVALID');
      return;
    }
    const control=eventControl(event.event);
    const candidates=[...pendingGateCommands.values()].filter(entry=>entry.command.control===control
      &&entry.command.epoch===event.epoch&&entry.command.generation===event.generation);
    if(candidates.length!==1){
      reportUnknown({reason:'UNMATCHED_GATE_EVENT',event});
      reportDisconnect('NATIVE_RUNTIME_GATE_EVENT_UNMATCHED');
      return;
    }
    try {
      const entry=candidates[0],command=entry.command,validated=validateNativeGateEvent(event,command);
      entry.event=validated;
      // An event is only half of completion. Keep it private until the exact
      // request receipt has independently validated; otherwise a plausible
      // event could resolve success before a malformed receipt fails closed.
      deliverValidatedEvent(entry);
      logger({level:'info',event:'native_runtime_gate_event',role,sessionId,control:command.control,epoch:command.epoch,generation:command.generation,phase:event.event});
    } catch(error) {
      reportUnknown({reason:'INVALID_GATE_EVENT',event,code:error?.message??'UNKNOWN'});
      terminate('NATIVE_RUNTIME_GATE_EVENT_INVALID');
    }
  };
  client.on('event',gateEvent);
  heartbeatTimer=setInterval(()=>{void heartbeat();},heartbeatMs);
  heartbeatTimer.unref?.();
  logger({level:'info',event:'native_runtime_capability_gate_passed',role,sessionId,capabilities:COORDINATED_NATIVE_CAPABILITIES,engineControlCapabilityAdvertised:true,productionQualified:true});
  return Object.freeze({
    client,
    binding,
    get ready(){return open;},
    // No event is converted into a successful operation until both its exact
    // native receipt and its boundary/park/detach event correlate. The native
    async gateControl(request){
      if(!open)throw new Error('NATIVE_RUNTIME_GATE_CLOSED');
      const command=validateNativeGateCommand(request);
      const key=gateKey(command);
      if(pendingGateCommands.has(key))throw new Error('NATIVE_GATE_COMMAND_ALREADY_PENDING');
      const entry={command,event:null,receiptValidated:false,waiters:[]};
      pendingGateCommands.set(key,entry);
      try {
        const receipt=validateNativeGateReceipt(await client.gateControl(command),command);
        entry.receiptValidated=true;
        logger({level:'info',event:'native_runtime_gate_receipt',role,sessionId,control:command.control,epoch:command.epoch,generation:command.generation,phase:receipt.status});
        if(command.control==='hold')pendingGateCommands.delete(key);
        else deliverValidatedEvent(entry);
        return receipt;
      } catch(error) {
        // A missing, malformed, rejected, or uncorrelated receipt leaves the
        // engine-side effect unknown. Never retry it or leave this runtime
        // available for later commands.
        terminate('NATIVE_RUNTIME_GATE_RECEIPT_FAILED');
        throw error;
      }
    },
    awaitGateEvent(request,{timeoutMs=3000}={}){
      if(!open)return Promise.reject(new Error('NATIVE_RUNTIME_GATE_CLOSED'));
      const command=validateNativeGateCommand(request),entry=pendingGateCommands.get(gateKey(command));
      if(!entry||entry.command.control!==command.control)return Promise.reject(new Error('NATIVE_GATE_EVENT_NOT_PENDING'));
      if(entry.receiptValidated===true&&entry.event!==null){pendingGateCommands.delete(gateKey(command));return Promise.resolve(entry.event);}
      if(!Number.isInteger(timeoutMs)||timeoutMs<50||timeoutMs>30000)return Promise.reject(new TypeError('INVALID_NATIVE_GATE_EVENT_TIMEOUT'));
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{
          entry.waiters=entry.waiters.filter(waiter=>waiter!==waiting);
          reject(new Error('NATIVE_GATE_EVENT_UNKNOWN_NO_RETRY'));
          terminate('NATIVE_RUNTIME_GATE_EVENT_TIMEOUT');
        },timeoutMs);
        const waiting={resolve:event=>{clearTimeout(timer);resolve(event);},reject:error=>{clearTimeout(timer);reject(error);}};
        entry.waiters.push(waiting);
      });
    },
    close(){
      if(terminal){
        // Closing is a resource operation too: callers may close after a
        // terminal event, and this must not leave a custom client listener or
        // socket alive merely because readiness was revoked first.
        rejectGateWaiters(new Error('NATIVE_RUNTIME_GATE_CLOSED'));
        releaseClientResources();
      }else terminate('NATIVE_RUNTIME_GATE_CLOSED',{notify:false});
    },
  });
}
