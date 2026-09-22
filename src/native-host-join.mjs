import {NativeRuntimeClient,NATIVE_RUNTIME_CAPABILITIES} from './native-runtime-client.mjs';

// This controller currently qualifies only its authenticated transport and
// persistent session fence.  In particular it does not provide a TF3 world
// observer or vehicle executor.
export const COORDINATED_NATIVE_CAPABILITIES=Object.freeze([
  NATIVE_RUNTIME_CAPABILITIES.transportHealth,
  NATIVE_RUNTIME_CAPABILITIES.sessionBinding,
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

export async function openNativeHostJoinGate({options,sessionId,role,logger=()=>{},onDisconnect=()=>{},clientFactory=NativeRuntimeClient.connect}={}){
  if(!['host','join'].includes(role)||typeof sessionId!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(sessionId))throw new TypeError('INVALID_NATIVE_RUNTIME_GATE_OPTIONS');
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
    // The current debugger controller explicitly says it is not production
    // qualified.  Never turn its fixture/debugger controls into a multiplayer
    // admission fallback.
    if(client.handshake?.productionQualified!==true)throw new Error('NATIVE_RUNTIME_NOT_PRODUCTION_QUALIFIED');
    binding=Object.freeze({sessionId,role:nativeRole,receipt:bindingReceipt});
  }catch(error){client.close();throw error;}
  let open=true;
  const reportUnknown=outcome=>logger({level:'error',event:'native_runtime_unknown_outcome',role,sessionId,detail:outcome});
  const reportDisconnect=reason=>{
    if(!open)return;
    open=false;
    logger({level:'error',event:'native_runtime_disconnected',role,sessionId,code:reason,coordinatedGameplayAdmission:false});
    Promise.resolve(onDisconnect(reason)).catch(error=>logger({level:'error',event:'native_runtime_disconnect_cleanup_failed',role,sessionId,code:error?.message??'UNKNOWN'}));
  };
  client.on('unknownOutcome',reportUnknown);
  client.on('disconnect',reportDisconnect);
  logger({level:'info',event:'native_runtime_capability_gate_passed',role,sessionId,capabilities:COORDINATED_NATIVE_CAPABILITIES,engineControlVerified:false,productionQualified:true});
  return Object.freeze({
    client,
    binding,
    get ready(){return open;},
    close(){
      if(!open)return;
      open=false;
      client.off('unknownOutcome',reportUnknown);
      client.off('disconnect',reportDisconnect);
      client.close();
    },
  });
}
