const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const counter=value=>BigInt(value);

export function confirmCancelledStop({arm,state,baseline,action,entity}) {
  if(!arm||!state||!baseline||!action||state.state!=='completed'||state.expectedInvocation!==arm.expectedInvocation
    ||state.claimedInvocation!==arm.expectedInvocation||state.claimedEntity!==entity
    ||state.expectedEntity!==entity||state.expectedStopped!==1||state.claimedStopped!==1
    ||!state.callbackResultZero||!state.sendReturn||!state.postSendBody)
    throw new Error('NATIVE_STOP_CANCELLATION_NOT_CONFIRMED');
  if(!action.active||action.saturated||!action.latestValid||!action.latestCallbackValid
    ||!action.latestMarshalerValid||!action.latestPostSendBodyValid
    ||!action.latestCallbackMatchesAdmissionStorage||!action.latestMarshalerMatchesAdmissionStorage
    ||!action.latestMarshalerMatchesCallbackStorage||!action.latestSendReturnMatchesAdmissionStorage
    ||!action.latestEntryResultZero||!action.latestCallbackShapeMatches
    ||action.latestEntity!==entity||action.latestStopped!==1
    ||action.latestCallbackEntity!==entity||action.latestCallbackStopped!==1
    ||action.latestMarshalerEntity!==entity||action.latestMarshalerStopped!==1
    ||action.latestPostSendBodyEntity!==entity||action.latestPostSendBodyStopped!==1
    ||action.latestCallbackResult!==0||action.latestMarshalerResult!==0
    ||action.latestCorrelatedAdmissionInvocation!==arm.expectedInvocation
    ||action.latestSendReturnInvocation!==arm.expectedInvocation
    ||action.latestPostSendBodyInvocation!==arm.expectedInvocation
    ||action.latestPostSendBodyThread!==action.latestCorrelatedAdmissionThread)
    throw new Error('NATIVE_STOP_ACTION_NOT_CORRELATED');
  for(const name of ['factoryHits','admissionHits','correlatedHits','callbackHits',
    'sendReturnHits','marshalerReturnHits','postSendBodyCorrelatedHits'])
    if(counter(action[name])!==counter(baseline[name])+1n)
      throw new Error('NATIVE_STOP_ACTION_NOT_EXACTLY_ONCE');
  if(counter(action.droppedCandidates)!==counter(baseline.droppedCandidates))
    throw new Error('NATIVE_STOP_ACTION_NOT_EXACTLY_ONCE');
  return Object.freeze({entity,invocation:arm.expectedInvocation});
}

// Deliberately one use per helper. The UI click happens after the arm receipt;
// an unknown arm or submission outcome is never retried automatically.
export function createHostCancelledStop({host,hostLocal,bridge,nativeGate,pollMs=100,logger=()=>{}}) {
  if(!host||!hostLocal||!bridge||!nativeGate||typeof logger!=='function'
    ||!Number.isSafeInteger(pollMs)||pollMs<25||pollMs>1000)
    throw new TypeError('INVALID_HOST_CANCELLED_STOP_OPTIONS');
  let attempted=false;
  return Object.freeze({
    get attempted(){return attempted;},
    async start(entity){
      if(attempted)throw new Error('HOST_CANCELLED_STOP_ALREADY_ATTEMPTED');
      attempted=true;
      const client=nativeGate.client;
      const connection=hostLocal.connection;
      const playerId=connection?.playerId;
      const player=host.authority.players().find(p=>p.playerId===playerId);
      if(!Number.isSafeInteger(entity)||entity<1||entity>2147483647
        ||nativeGate.ready!==true||hostLocal.ready!==true||host.coordinator.phase!=='running'
        ||!bridge.connected||!bridge.engineObservation?.available
        ||!Number.isSafeInteger(player?.companyEntity)||player.companyEntity<0
        ||typeof connection?.subscribe!=='function'||typeof connection?.send!=='function'
        ||typeof client?.armVehicleCancel!=='function'||typeof client?.control!=='function')
        throw new Error('HOST_CANCELLED_STOP_CONTEXT_UNAVAILABLE');
      client.requireCapability('vehicle.cancel-arm.v1');
      client.requireCapability('diagnostic.vehicle-cancel-arm.v1');
      client.requireCapability('diagnostic.passive-vehicle-action.v1');
      const first=await bridge.inspectVehicleOwner({entity,company:player.companyEntity});
      if(first.stopFlag!==0||nativeGate.ready!==true||host.coordinator.phase!=='running')
        throw new Error('HOST_CANCELLED_STOP_PRESTATE_CHANGED');
      const baselinePing=await client.control('ping');
      if(client.vehicleCancelArmObservation(baselinePing).state!=='disabled')
        throw new Error('HOST_CANCELLED_STOP_NATIVE_ARM_USED');
      const baseline=client.passiveVehicleActionObservation(baselinePing);
      if(!baseline.active||baseline.saturated)
        throw new Error('HOST_CANCELLED_STOP_NATIVE_OBSERVER_UNAVAILABLE');
      const arm=await client.armVehicleCancel({entity,stopped:1,ttlMs:5000});
      const completion=(async()=>{
        let sent=false;
        try{
          const deadline=Date.now()+7000;
          let state,action;
          while(Date.now()<deadline){
            if(nativeGate.ready!==true||host.coordinator.phase!=='running'||!hostLocal.ready)
              throw new Error('HOST_CANCELLED_STOP_CONTEXT_LOST');
            const ping=await client.control('ping');
            state=client.vehicleCancelArmObservation(ping);
            if(['expired','revoked','failed'].includes(state.state))
              throw new Error('HOST_CANCELLED_STOP_ARM_TERMINAL');
            if(state.state==='completed'){
              action=client.passiveVehicleActionObservation(ping);
              break;
            }
            await delay(pollMs);
          }
          confirmCancelledStop({arm,state,baseline,action,entity});
          const after=await bridge.inspectVehicleOwner({entity,company:player.companyEntity});
          if(after.stopFlag!==0||nativeGate.ready!==true||host.coordinator.phase!=='running'
            ||!hostLocal.ready||!host.authority.players().some(p=>p.playerId===playerId&&p.companyEntity===player.companyEntity))
            throw new Error('HOST_CANCELLED_STOP_POSTSTATE_CHANGED');
          const result=await new Promise((resolve,reject)=>{
            let sequence=null,finished=false;
            const finish=(error,value)=>{
              if(finished)return;
              finished=true;clearTimeout(timer);unsubscribe();
              if(error)reject(error);else resolve(value);
            };
            const unsubscribe=connection.subscribe(message=>{
              if(message.kind==='command_rejected')finish(new Error(`HOST_CANCELLED_STOP_REJECTED:${message.payload?.code??'UNKNOWN'}`));
              else if(message.kind==='session_halted'||message.kind==='session_ended')
                finish(new Error('HOST_CANCELLED_STOP_SESSION_HALTED'));
              else if(message.kind==='command_prepare'){
                const command=message.payload?.command;
                if(sequence!==null||command?.originPlayerId!==playerId||command.targetCompanyEntity!==player.companyEntity
                  ||command.targetEntity!==entity||command.commandType!=='vehicle.setRunning'
                  ||command.payload?.running!==false||command.clientSequence!==0)
                  finish(new Error('HOST_CANCELLED_STOP_PREPARE_MISMATCH'));
                else sequence=command.hostSequence;
              } else if(message.kind==='command_completed'&&sequence!==null){
                if(message.payload?.hostSequence!==sequence)
                  finish(new Error('HOST_CANCELLED_STOP_COMPLETION_MISMATCH'));
                else finish(null,Object.freeze({entity,company:player.companyEntity,
                  hostSequence:sequence,updateCount:message.payload.updateCount,
                  stateHash:message.payload.stateHash}));
              }
            });
            const timer=setTimeout(()=>finish(new Error('HOST_CANCELLED_STOP_OUTCOME_UNKNOWN')),30000);
            try{
              if(finished)return;
              if(connection.socket?.destroyed)throw new Error('HOST_CANCELLED_STOP_TRANSPORT_CLOSED');
              connection.send('action_request',{clientSequence:0,commandType:'vehicle.setRunning',
                originPlayerId:playerId,targetCompanyEntity:player.companyEntity,targetEntity:entity,
                payload:{running:false}});
              sent=true;
            }catch(error){finish(error);}
          });
          logger({level:'info',event:'host_cancelled_stop_completed',...result,gameplayVerified:false});
          return result;
        }catch(error){
          if(sent)host.coordinator.halt('HOST_CANCELLED_STOP_OUTCOME_UNKNOWN');
          throw error;
        }
      })();
      return Object.freeze({arm,completion});
    },
  });
}
