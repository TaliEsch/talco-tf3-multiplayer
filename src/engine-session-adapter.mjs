import { createAsyncEngineMailbox } from './async-engine-mailbox.mjs';
import { AsyncSessionParticipant } from './async-session-participant.mjs';

// Local composition only. Caller owns authenticated transport and must establish
// common save/build identity and actual control coverage before remote admission.
// No synthetic engine receipts, automatic game launch, or automatic retry.
export async function createEngineSessionAdapter({directory,bridge,playerId,companies,
  send,disconnect,healthy,controlsReady,now=Date.now,nativeRuntime=null,checkpointEvidenceScope='production',
  onCheckpointEvidence=()=>{},enableDepotBuild=false}) {
  if(!bridge||typeof bridge.startCoordinationLease!=='function'
    ||![send,disconnect,healthy,controlsReady,now,onCheckpointEvidence].every(f=>typeof f==='function')) throw new TypeError('INVALID_ADAPTER_OPTIONS');
  if(nativeRuntime!==null&&(!nativeRuntime||typeof nativeRuntime.sessionId!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(nativeRuntime.sessionId)
    ||!['host','participant'].includes(nativeRuntime.role)||typeof nativeRuntime.client?.requireCapability!=='function'
    ||typeof nativeRuntime.client?.bindSession!=='function'||typeof nativeRuntime.client?.close!=='function'
    ||typeof nativeRuntime.client?.on!=='function'||typeof nativeRuntime.client?.off!=='function'
    ||typeof nativeRuntime.gateControl!=='function'||typeof nativeRuntime.awaitGateEvent!=='function'
    ||typeof nativeRuntime.logger!=='function')) throw new TypeError('INVALID_NATIVE_RUNTIME_ADAPTER_OPTIONS');
  if(!['production','local_diagnostic'].includes(checkpointEvidenceScope))throw new TypeError('INVALID_CHECKPOINT_EVIDENCE_SCOPE');
  if(typeof enableDepotBuild!=='boolean')throw new TypeError('INVALID_DEPOT_CAPABILITY');
  let checkpointEvidence=null,executionEvidence=null,acceptedExecutionState=null,faultLogged=false;
  // Trace output must never change an accepted engine outcome.
  const logEngine=event=>{try{nativeRuntime?.logger?.(event);}catch{}};
  const mailbox=await createAsyncEngineMailbox({directory,nonce:bridge.nonce,enableDepotBuild,
    requireCompleteCheckpointCoverage:checkpointEvidenceScope==='production',onCheckpointEvidence:evidence=>{
      checkpointEvidence=structuredClone(evidence);onCheckpointEvidence(structuredClone(evidence));
    },onExecutionEvidence:evidence=>{executionEvidence=evidence;}});
  let participant,lease,closed=false,lastCounter=-1,polling=null,closing=null,nativeHaltPromise=null,orderlyStop=null;
  let nativeHaltState='not_requested',nativeConnectionLost=false;
  // This adapter has not issued a native hold, so the only legal fail-stop
  // coordinate for a freshly bound production gate is generation zero.  A
  // failed terminal request is never retried at another coordinate.
  const nativeHaltEpoch='1';
  const stopRenewal=()=>lease?.stop();
  // Binding receipts remain transport-only.  A typed terminal_parked event is
  // separately required before this adapter records an engine halt.
  const nativeHalt=reason=>{
    if(!nativeRuntime)return Promise.resolve();
    if(nativeHaltPromise)return nativeHaltPromise;
    nativeHaltState='pending';
    const command=Object.freeze({control:'halt',epoch:nativeHaltEpoch,generation:'0'});
    const failStop=error=>{
      nativeHaltState='unknown';
      // A closed IPC endpoint is not evidence that TF3 stopped.  It merely
      // prevents any later control from being mistaken for a retry.
      nativeRuntime.client.off('disconnect',nativeDisconnected);
      try {nativeRuntime.client.close();} catch {}
      nativeRuntime.logger({level:'error',event:'native_runtime_halt_unknown',reason,
        code:error?.message??'UNKNOWN',control:command.control,epoch:command.epoch,generation:command.generation,
        noRetry:true,engineHaltConfirmed:false,failStopClientClosed:true,gameWorldReceipt:false});
    };
    nativeHaltPromise=(async()=>{
      try {
        const receipt=await nativeRuntime.gateControl(command);
        if(!receipt||receipt.status!=='halt_requested'||receipt.control!==command.control
          ||receipt.epoch!==command.epoch||receipt.generation!==command.generation
          ||receipt.haltGeneration!==command.generation)throw new Error('NATIVE_RUNTIME_HALT_RECEIPT_INVALID');
        const parked=await nativeRuntime.awaitGateEvent(command,{timeoutMs:3000});
        if(nativeConnectionLost||!parked||parked.event!=='terminal_parked'||parked.epoch!==command.epoch
          ||parked.generation!==command.generation||parked.haltGeneration!==command.generation)throw new Error('NATIVE_RUNTIME_HALT_EVENT_INVALID');
        nativeHaltState='confirmed';
        nativeRuntime.logger({level:'info',event:'native_runtime_halt_confirmed',reason,
          control:command.control,epoch:command.epoch,generation:command.generation,
          engineHaltConfirmed:true,gameWorldReceipt:true});
      } catch(error) {failStop(error);}
      return nativeHaltState;
    })();
    return nativeHaltPromise;
  };
  const nativeDisconnected=reason=>{
    nativeConnectionLost=true;
    nativeHaltState='unknown';
    nativeRuntime?.logger({level:'error',event:'native_runtime_disconnected',reason,gameWorldReceipt:false});
    participant?.halt('NATIVE_RUNTIME_DISCONNECTED');
  };
  try {
    // One operation includes the scheduled wait plus separate held-event and
    // receipt exchanges. Match the local coordinator's 30s bounded deadline;
    // heartbeat, observation freshness and exact-update checks stay unchanged.
    participant=new AsyncSessionParticipant({playerId,companies,requireEngineBinding:true,
      enableDepotBuild,now,timeoutMs:30000,
      publish:request=>{
        if(request.operation!=='halt'&&(!lease?.active||!healthy())) throw new Error('ENGINE_LEASE_NOT_ACTIVE');
        if(['release','prepare','executeHeld'].includes(request.operation)&&controlsReady()!==true) throw new Error('NATIVE_CONTROLS_NOT_LOCKED');
        return mailbox.publish(request);
      },send,disconnect:()=>{stopRenewal();nativeHalt(participant?.fault??'PARTICIPANT_DISCONNECTED');disconnect();}});
    if(nativeRuntime){
      nativeRuntime.client.requireCapability('session.bind');
      nativeRuntime.client.requireCapability('simulation.hold');
      nativeRuntime.client.requireCapability('engine.halt');
      nativeRuntime.client.requireCapability('simulation.gate-receipts.v1');
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
    get haltState(){return orderlyStop?nativeHaltState:participant.haltState;},
    get haltSource(){return orderlyStop?'native_terminal_parked':'game_mailbox';},
    get fault(){return participant.fault;},
    get faultEvidence(){return participant.faultEvidence;},
    get checkpointEvidence(){return checkpointEvidence===null?null:structuredClone(checkpointEvidence);},
    get acceptedExecutionState(){return acceptedExecutionState===null?null:structuredClone(acceptedExecutionState);},
    receive(kind,payload){
      if(!check())return false;
      if(!lease.active){participant.halt('ENGINE_LEASE_NOT_ACTIVE');return false;}
      const accepted=participant.receive(kind,payload);
      return accepted;
    },
    poll(){
      if(closed)return Promise.resolve(false);
      // The completed local run parks the engine itself. No mailbox operation
      // can complete afterward, and a stopped lease is expected here.
      if(orderlyStop)return Promise.resolve(nativeHaltState==='confirmed');
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
          const accepted=participant.receiveEngine(receipt);
          if(accepted)logEngine({level:'info',event:'engine_operation_receipt',
            role:nativeRuntime?.role??'local',roundId:receipt.roundId,operationId:receipt.operationId,
            operation:receipt.operation,updateCount:receipt.updateCount,held:receipt.held,
            ...(receipt.checkpointHash?{checkpointHash:receipt.checkpointHash}:{}),
            ...(receipt.ownerCompanyEntity?{ownerCompanyEntity:receipt.ownerCompanyEntity}:{}),
            ...(receipt.stateHash?{stateHash:receipt.stateHash}:{}),
            phase:participant.phase,gameplayVerified:false});
          if(accepted&&receipt.operation==='holdCheckpoint'
            &&checkpointEvidence?.receipt.operationId===receipt.operationId
            &&checkpointEvidence.receipt.roundId===receipt.roundId){
            logEngine({level:'info',event:'engine_checkpoint_evidence',role:nativeRuntime?.role??'local',
              roundId:receipt.roundId,operationId:receipt.operationId,updateCount:receipt.updateCount,
              checkpointHash:receipt.checkpointHash,comparisonReady:checkpointEvidence.coverage.comparisonReady,
              unavailableCount:checkpointEvidence.coverage.unavailable.length,gameplayVerified:false});
          }
          if(accepted&&receipt.operation==='executeHeld'
            &&executionEvidence?.receipt.operationId===receipt.operationId
            &&executionEvidence.receipt.roundId===receipt.roundId){
            const observed=executionEvidence.state;
            acceptedExecutionState=structuredClone(observed);
            logEngine({level:'info',event:'engine_execution_evidence',role:nativeRuntime?.role??'local',
              roundId:receipt.roundId,operationId:receipt.operationId,
              hostSequence:observed.hostSequence,updateCount:observed.updateCount,
              ...(observed.depot?{constructionEntity:observed.depot.constructionEntity,
                depotEntity:observed.depot.depotEntity,chargedCost:observed.depot.chargedCost,
                ownerCompanyEntity:observed.depot.ownerCompanyEntity,
                companyBalance:observed.company.balance}
                :observed.roadStop?{sourceRoadEntity:observed.roadStop.sourceRoadEntity,
                roadEntity:observed.roadStop.roadEntity,stopEntity:observed.roadStop.stopEntity,
                chargedCost:observed.roadStop.chargedCost,
                ownerCompanyEntity:observed.roadStop.ownerCompanyEntity,
                companyBalance:observed.company.balance}
                :{entity:observed.vehicle.entity,ownerCompanyEntity:observed.vehicle.ownerCompanyEntity,
                  stopped:observed.vehicle.stopped}),stateHash:receipt.stateHash,
              gameplayVerified:false});
            executionEvidence=null;
          }
          else if(participant.phase==='halted'&&!faultLogged){
            faultLogged=true;
            logEngine({level:'error',event:'engine_operation_fault',role:nativeRuntime?.role??'local',
              fault:participant.fault,
              expectedUpdate:participant.faultEvidence?.expectedUpdate,
              observedUpdate:participant.faultEvidence?.observedUpdate,gameplayVerified:false});
          }
          return accepted;
        }});} catch {participant.halt('ENGINE_MAILBOX_UNAVAILABLE');return false;}
      })().finally(()=>{polling=null;});
      return polling;
    },
    halt(code='EXPLICIT_STOP'){
      // The native terminal event is the completion proof for a normal run.
      // Once that boundary parks, a Lua mailbox request cannot execute. Faults
      // still issue the game-side halt immediately through participant.halt().
      if(code==='LOCAL_RUN_COMPLETE'&&nativeRuntime){
        if(!orderlyStop)orderlyStop=nativeHalt(code).then(state=>{
          stopRenewal();
          if(state!=='confirmed')participant.halt('NATIVE_HALT_UNKNOWN');
        });
        return orderlyStop;
      }
      participant.halt(code);
    },
    close(){
      if(closing)return closing;
      closed=true;stopRenewal();nativeRuntime?.client.off('disconnect',nativeDisconnected);
      // Teardown awaits the one typed halt attempt.  On an unknown outcome the
      // native endpoint is closed, but no engine-stop proof is fabricated.
      closing=(async()=>{await nativeHalt('ADAPTER_CLOSED');await orderlyStop;await polling;await mailbox.close();})();
      return closing;
    },
  };
}
