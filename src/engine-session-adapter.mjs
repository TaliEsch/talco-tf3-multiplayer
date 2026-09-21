import { createAsyncEngineMailbox } from './async-engine-mailbox.mjs';
import { AsyncSessionParticipant } from './async-session-participant.mjs';

// Local composition only. Caller owns authenticated transport and must establish
// common save/build identity and actual control coverage before remote admission.
// No synthetic engine receipts, automatic game launch, or automatic retry.
export async function createEngineSessionAdapter({directory,bridge,playerId,companies,
  send,disconnect,healthy,controlsReady,now=Date.now,nativeRuntime=null,checkpointEvidenceScope='production',
  onCheckpointEvidence=()=>{}}) {
  if(!bridge||typeof bridge.startCoordinationLease!=='function'
    ||![send,disconnect,healthy,controlsReady,now,onCheckpointEvidence].every(f=>typeof f==='function')) throw new TypeError('INVALID_ADAPTER_OPTIONS');
  if(nativeRuntime!==null&&(!nativeRuntime||typeof nativeRuntime.sessionId!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(nativeRuntime.sessionId)
    ||!['host','participant'].includes(nativeRuntime.role)||typeof nativeRuntime.client?.requireCapability!=='function'
    ||typeof nativeRuntime.client?.bindSession!=='function'||typeof nativeRuntime.client?.control!=='function'
    ||typeof nativeRuntime.client?.on!=='function'||typeof nativeRuntime.client?.off!=='function'
    ||typeof nativeRuntime.logger!=='function')) throw new TypeError('INVALID_NATIVE_RUNTIME_ADAPTER_OPTIONS');
  if(!['production','local_diagnostic'].includes(checkpointEvidenceScope))throw new TypeError('INVALID_CHECKPOINT_EVIDENCE_SCOPE');
  let checkpointEvidence=null;
  const mailbox=await createAsyncEngineMailbox({directory,nonce:bridge.nonce,
    requireCompleteCheckpointCoverage:checkpointEvidenceScope==='production',onCheckpointEvidence:evidence=>{
      checkpointEvidence=structuredClone(evidence);onCheckpointEvidence(structuredClone(evidence));
    }});
  let participant,lease,closed=false,lastCounter=-1,polling=null,closing=null,nativeHaltIssued=false;
  const stopRenewal=()=>lease?.stop();
  // Native IPC is a session fence only. Its debugger/qualification receipts do
  // not describe TF3 world state, ownership, command execution, or release.
  const nativeHalt=reason=>{
    if(!nativeRuntime||nativeHaltIssued)return;
    nativeHaltIssued=true;
    Promise.resolve(nativeRuntime.client.control('halt')).then(receipt=>{
      nativeRuntime.logger({level:'info',event:'native_runtime_halt_receipt',reason,
        accepted:receipt?.status==='accepted',control:receipt?.control??null,gameWorldReceipt:false});
    }).catch(error=>nativeRuntime.logger({level:'error',event:'native_runtime_halt_unknown',reason,
      code:error?.message??'UNKNOWN',noRetry:true,gameWorldReceipt:false}));
  };
  const nativeDisconnected=reason=>{
    nativeRuntime?.logger({level:'error',event:'native_runtime_disconnected',reason,gameWorldReceipt:false});
    participant?.halt('NATIVE_RUNTIME_DISCONNECTED');
  };
  try {
    // One operation includes the scheduled wait plus separate held-event and
    // receipt exchanges. Match the local coordinator's 30s bounded deadline;
    // heartbeat, observation freshness and exact-update checks stay unchanged.
    participant=new AsyncSessionParticipant({playerId,companies,requireEngineBinding:true,now,timeoutMs:30000,
      publish:request=>{
        if(request.operation!=='halt'&&(!lease?.active||!healthy())) throw new Error('ENGINE_LEASE_NOT_ACTIVE');
        if(['release','prepare','executeHeld'].includes(request.operation)&&controlsReady()!==true) throw new Error('NATIVE_CONTROLS_NOT_LOCKED');
        return mailbox.publish(request);
      },send,disconnect:()=>{stopRenewal();nativeHalt(participant?.fault??'PARTICIPANT_DISCONNECTED');disconnect();}});
    if(nativeRuntime){
      nativeRuntime.client.requireCapability('session.bind');
      // This is authenticated controller identity binding, deliberately outside
      // AsyncSessionParticipant.receiveEngine(). The latter accepts only
      // correlated mailbox/world receipts.
      const requestedBinding={sessionId:nativeRuntime.sessionId,role:nativeRuntime.role};
      // openNativeHostJoinGate binds this real client before adapter creation.
      // Reuse only an exactly matching persistent binding; a transport receipt is
      // still never game-world or checkpoint proof.
      const existingBinding=nativeRuntime.binding??nativeRuntime.client.binding;
      if(existingBinding&&(existingBinding.sessionId!==requestedBinding.sessionId||existingBinding.role!==requestedBinding.role))
        throw new Error('NATIVE_RUNTIME_BINDING_MISMATCH');
      const bindingReceipt=existingBinding
        ?existingBinding.receipt
        :await nativeRuntime.client.bindSession(requestedBinding);
      if(bindingReceipt?.status!=='accepted'
        ||(bindingReceipt.boundSessionId??bindingReceipt.sessionId)!==nativeRuntime.sessionId
        ||(bindingReceipt.boundRole??bindingReceipt.role)!==nativeRuntime.role) throw new Error('NATIVE_RUNTIME_INVALID_BIND_RECEIPT');
      nativeRuntime.logger({level:'info',event:'native_runtime_binding_receipt',sessionId:nativeRuntime.sessionId,
        role:nativeRuntime.role,accepted:true,gameWorldReceipt:false});
      nativeRuntime.client.on('disconnect',nativeDisconnected);
    }
    lease=await bridge.startCoordinationLease({healthy:()=>!closed&&participant.phase!=='halted'&&healthy()===true,
      onFailure:code=>participant.halt(code)});
  } catch(error) {nativeRuntime?.client.off('disconnect',nativeDisconnected);nativeRuntime?.client.close?.();stopRenewal();await mailbox.close();throw error;}

  function observe() {
    const observation=bridge.engineObservation,s=observation?.sample;
    if(!observation?.available||!s){participant.halt('ENGINE_OBSERVATION_LOST');return false;}
    if(!Number.isSafeInteger(s.counter)||s.counter<lastCounter){participant.halt('OBSERVATION_PRODUCER_RESET');return false;}
    if(s.counter>lastCounter){lastCounter=s.counter;participant.observe({updateCount:s.updateCount,held:s.speedup===0});}
    return participant.phase!=='halted';
  }
  function check() {
    if(closed)return false;
    // Stopped sessions still need fresh observations to retain/revoke halt proof.
    if(participant.phase==='halted'){observe();return false;}
    if(!healthy()){participant.halt('SESSION_UNHEALTHY');return false;}
    if(['failed','closed'].includes(lease.phase)&&participant.phase!=='halted'){participant.halt('ENGINE_LEASE_LOST');return false;}
    if(!observe())return false;
    if(['running','inspecting','prepared','executing','awaiting_completion','releasing'].includes(participant.phase)&&controlsReady()!==true){
      participant.halt('NATIVE_CONTROLS_LOST');return false;
    }
    return true;
  }
  return {
    get phase(){return closed?'closed':participant.phase;},
    get leaseState(){return lease.phase;},
    get haltState(){return participant.haltState;},
    get fault(){return participant.fault;},
    get faultEvidence(){return participant.faultEvidence;},
    get checkpointEvidence(){return checkpointEvidence===null?null:structuredClone(checkpointEvidence);},
    receive(kind,payload){
      if(!check())return false;
      if(!lease.active){participant.halt('ENGINE_LEASE_NOT_ACTIVE');return false;}
      const accepted=participant.receive(kind,payload);
      return accepted;
    },
    poll(){
      if(closed)return Promise.resolve(false);
      if(polling)return polling;
      polling=(async()=>{
        check();participant.poll();
        try {return await mailbox.poll({receiveEngine:receipt=>{
          // Engine events and telemetry use different files. A receipt may win
          // that race: wait for telemetry rather than announcing a barrier while
          // the bridge still sees running state. Existing deadlines remain active.
          const observation=bridge.engineObservation,s=observation?.sample;
          if(receipt.status==='ok'
            && (!observation?.available||!s||s.updateCount<receipt.updateCount
              ||receipt.held===true&&s.updateCount===receipt.updateCount&&s.speedup!==0))return false;
          return participant.receiveEngine(receipt);
        }});} catch {participant.halt('ENGINE_MAILBOX_UNAVAILABLE');return false;}
      })().finally(()=>{polling=null;});
      return polling;
    },
    halt(code='EXPLICIT_STOP'){participant.halt(code);},
    close(){
      if(closing)return closing;
      closed=true;stopRenewal();nativeRuntime?.client.off('disconnect',nativeDisconnected);nativeHalt('ADAPTER_CLOSED');
      // Teardown is not halt proof. Caller should request halt and keep polling
      // its receipt before closing when possible; expiry remains the fallback.
      closing=(async()=>{await polling;await mailbox.close();})();
      return closing;
    },
  };
}
