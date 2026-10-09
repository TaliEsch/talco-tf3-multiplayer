const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const counter=value=>BigInt(value);

export function confirmCancelledStop({arm,state,baseline,action,entity,stopped=1}) {
  if(stopped!==0&&stopped!==1)throw new TypeError('INVALID_NATIVE_CANCEL_DIRECTION');
  const direction=stopped===0?'START':'STOP';
  if(!arm||!state||!baseline||!action||state.state!=='completed'||state.expectedInvocation!==arm.expectedInvocation
    ||state.claimedInvocation!==arm.expectedInvocation||state.claimedEntity!==entity
    ||state.expectedEntity!==entity||state.expectedStopped!==stopped||state.claimedStopped!==stopped
    ||!state.callbackResultZero||!state.sendReturn||!state.postSendBody)
    throw new Error(`NATIVE_${direction}_CANCELLATION_NOT_CONFIRMED`);
  if(!action.active||action.saturated||!action.latestValid||!action.latestCallbackValid
    ||!action.latestMarshalerValid||!action.latestPostSendBodyValid
    ||!action.latestCallbackMatchesAdmissionStorage||!action.latestMarshalerMatchesAdmissionStorage
    ||!action.latestMarshalerMatchesCallbackStorage||!action.latestSendReturnMatchesAdmissionStorage
    ||!action.latestEntryResultZero||!action.latestCallbackShapeMatches
    ||action.latestEntity!==entity||action.latestStopped!==stopped
    ||action.latestCallbackEntity!==entity||action.latestCallbackStopped!==stopped
    ||action.latestMarshalerEntity!==entity||action.latestMarshalerStopped!==stopped
    ||action.latestPostSendBodyEntity!==entity||action.latestPostSendBodyStopped!==stopped
    ||action.latestCallbackResult!==0||action.latestMarshalerResult!==0
    ||action.latestCorrelatedAdmissionInvocation!==arm.expectedInvocation
    ||action.latestSendReturnInvocation!==arm.expectedInvocation
    ||action.latestPostSendBodyInvocation!==arm.expectedInvocation
    ||action.latestPostSendBodyThread!==action.latestCorrelatedAdmissionThread)
    throw new Error(`NATIVE_${direction}_ACTION_NOT_CORRELATED`);
  for(const name of ['factoryHits','admissionHits','correlatedHits','callbackHits',
    'sendReturnHits','marshalerReturnHits','postSendBodyCorrelatedHits'])
    if(counter(action[name])!==counter(baseline[name])+1n)
      throw new Error(`NATIVE_${direction}_ACTION_NOT_EXACTLY_ONCE`);
  if(counter(action.droppedCandidates)!==counter(baseline.droppedCandidates))
    throw new Error(`NATIVE_${direction}_ACTION_NOT_EXACTLY_ONCE`);
  for(const name of ['dispatchVehicleMatchedHits','processorCompleteVehicleMatchedHits'])
    if((stopped===0&&(action[name]===undefined||baseline[name]===undefined))
      ||(action[name]!==undefined&&baseline[name]!==undefined
        &&counter(action[name])!==counter(baseline[name])))
      throw new Error(`NATIVE_${direction}_ORIGINAL_ACTION_DISPATCHED`);
  return Object.freeze(stopped===0
    ?{entity,invocation:arm.expectedInvocation,stopped:0}
    :{entity,invocation:arm.expectedInvocation});
}

// Deliberately one use per helper. The UI click happens after the arm receipt;
// an unknown arm or submission outcome is never retried automatically.
function createCancelledStop({connection,resolveCompany,bridge,nativeGate,healthy,halt,
  pollMs=100,clientSequence=0,logger=()=>{},stopped=1,enableExperimentalStart=false}) {
  if(!connection||typeof resolveCompany!=='function'||!bridge||!nativeGate
    ||typeof healthy!=='function'||typeof halt!=='function'||typeof logger!=='function'
    ||!Number.isSafeInteger(pollMs)||pollMs<25||pollMs>1000
    ||!Number.isSafeInteger(clientSequence)||clientSequence<0
    ||(stopped!==0&&stopped!==1)||typeof enableExperimentalStart!=='boolean')
    throw new TypeError('INVALID_HOST_CANCELLED_STOP_OPTIONS');
  if(stopped===0&&!enableExperimentalStart)
    throw new Error('HOST_CANCELLED_START_EXPERIMENT_DISABLED');
  const running=stopped===0;
  let attempted=false;
  return Object.freeze({
    get attempted(){return attempted;},
    async start(entity){
      if(attempted)throw new Error('HOST_CANCELLED_STOP_ALREADY_ATTEMPTED');
      attempted=true;
      const client=nativeGate.client;
      const playerId=connection?.playerId;
      const companyEntity=resolveCompany();
      if(!Number.isSafeInteger(entity)||entity<1||entity>2147483647
        ||nativeGate.ready!==true||healthy()!==true
        ||!bridge.connected||!bridge.engineObservation?.available
        ||typeof playerId!=='string'||playerId.length===0
        ||!Number.isSafeInteger(companyEntity)||companyEntity<1
        ||typeof connection?.subscribe!=='function'||typeof connection?.send!=='function'
        ||typeof client?.armVehicleCancel!=='function'||typeof client?.control!=='function'
        ||typeof bridge.openSingleStopPermit!=='function'||typeof bridge.closeSingleStopPermit!=='function')
        throw new Error('HOST_CANCELLED_STOP_CONTEXT_UNAVAILABLE');
      client.requireCapability('vehicle.cancel-arm.v1');
      client.requireCapability('diagnostic.vehicle-cancel-arm.v1');
      client.requireCapability('diagnostic.passive-vehicle-action.v1');
      if(running)client.requireCapability('diagnostic.vehicle-start-cancel-arm.v1');
      const first=await bridge.inspectVehicleOwner({entity,company:companyEntity});
      if(first.entity!==entity||first.company!==companyEntity||first.stopFlag!==1-stopped
        ||nativeGate.ready!==true||healthy()!==true)
        throw new Error('HOST_CANCELLED_STOP_PRESTATE_CHANGED');
      const baselinePing=await client.control('ping');
      if(client.vehicleCancelArmObservation(baselinePing).state!=='disabled')
        throw new Error('HOST_CANCELLED_STOP_NATIVE_ARM_USED');
      const baseline=client.passiveVehicleActionObservation(baselinePing);
      if(!baseline.active||baseline.saturated)
        throw new Error('HOST_CANCELLED_STOP_NATIVE_OBSERVER_UNAVAILABLE');
      let arm;
      const armRequestedAt=Date.now();
      try{arm=await client.armVehicleCancel({entity,stopped,ttlMs:5000});}
      catch(error){halt('HOST_CANCELLED_STOP_OUTCOME_UNKNOWN');throw error;}
      let permit;
      try{permit=await bridge.openSingleStopPermit({entity,invocation:arm.expectedInvocation,
        ...(running?{stopped:0}:{})});}
      catch(error){
        halt('HOST_CANCELLED_STOP_OUTCOME_UNKNOWN');
        await bridge.closeSingleStopPermit().catch(()=>{});
        throw error;
      }
      logger({level:'info',event:'host_cancelled_stop_permit_ready',entity,
        expectedInvocation:arm.expectedInvocation,permitDeadlineUnix:permit.deadlineUnix,
        ...(running?{stopped:0,armRequestedAt}:{}),
        gameplayVerified:false});
      let permitOpen=true;
      const completion=(async()=>{
        try{
          const deadline=Date.now()+7000;
          let state,action;
          while(Date.now()<deadline){
            if(nativeGate.ready!==true||healthy()!==true)
              throw new Error('HOST_CANCELLED_STOP_CONTEXT_LOST');
            const ping=await client.control('ping');
            state=client.vehicleCancelArmObservation(ping);
            if(['expired','revoked','failed'].includes(state.state)){
              const terminalAction=client.passiveVehicleActionObservation(ping);
              logger({level:'warn',event:'host_cancelled_stop_native_terminal',entity,
                armState:state.state,expectedInvocation:arm.expectedInvocation,
                claimedInvocation:state.claimedInvocation,
                callbackResultZero:state.callbackResultZero,
                sendReturn:state.sendReturn,postSendBody:state.postSendBody,
                correlatedHitsDelta:String(counter(terminalAction.correlatedHits)-counter(baseline.correlatedHits)),
                callbackHitsDelta:String(counter(terminalAction.callbackHits)-counter(baseline.callbackHits)),
                marshalerReturnHitsDelta:String(counter(terminalAction.marshalerReturnHits)-counter(baseline.marshalerReturnHits)),
                noRetry:true,gameplayVerified:false});
              throw new Error('HOST_CANCELLED_STOP_ARM_TERMINAL');
            }
            if(state.state==='completed'){
              action=client.passiveVehicleActionObservation(ping);
              break;
            }
            await delay(pollMs);
          }
          confirmCancelledStop({arm,state,baseline,action,entity,stopped});
          await bridge.closeSingleStopPermit();
          permitOpen=false;
          const after=await bridge.inspectVehicleOwner({entity,company:companyEntity});
          if(after.entity!==entity||after.company!==companyEntity||after.stopFlag!==1-stopped
            ||nativeGate.ready!==true||healthy()!==true)
            throw new Error('HOST_CANCELLED_STOP_POSTSTATE_CHANGED');
          logger({level:'info',event:'host_cancelled_stop_native_confirmed',entity,
            company:companyEntity,nativeInvocation:arm.expectedInvocation,
            ...(running?{stopped:0}:{}),
            callbackResult:action.latestCallbackResult,marshalerResult:action.latestMarshalerResult,
            callbackThread:action.callbackThread,admissionThread:action.latestCorrelatedAdmissionThread,
            sendReturn:state.sendReturn,postSendBody:state.postSendBody,
            matchedDispatchDelta:action.dispatchVehicleMatchedHits===undefined?null:
              String(counter(action.dispatchVehicleMatchedHits)-counter(baseline.dispatchVehicleMatchedHits)),
            matchedCompletionDelta:action.processorCompleteVehicleMatchedHits===undefined?null:
              String(counter(action.processorCompleteVehicleMatchedHits)-counter(baseline.processorCompleteVehicleMatchedHits)),
            observedStopFlag:after.stopFlag,observedUpdateCount:after.updateCount,
            gameplayVerified:false});
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
                if(sequence!==null||command?.originPlayerId!==playerId||command.targetCompanyEntity!==companyEntity
                  ||command.targetEntity!==entity||command.commandType!=='vehicle.setRunning'
                  ||command.payload?.running!==running||command.clientSequence!==clientSequence)
                  finish(new Error('HOST_CANCELLED_STOP_PREPARE_MISMATCH'));
                else sequence=command.hostSequence;
              } else if(message.kind==='command_completed'&&sequence!==null){
                if(message.payload?.hostSequence!==sequence)
                  finish(new Error('HOST_CANCELLED_STOP_COMPLETION_MISMATCH'));
                else finish(null,Object.freeze({entity,company:companyEntity,
                  hostSequence:sequence,updateCount:message.payload.updateCount,
                  stateHash:message.payload.stateHash,
                  ...(Object.hasOwn(message.payload,'speedup')?{speedup:message.payload.speedup}:{})}));
              }
            });
            const timer=setTimeout(()=>finish(new Error('HOST_CANCELLED_STOP_OUTCOME_UNKNOWN')),30000);
            try{
              if(finished)return;
              if(connection.socket?.destroyed)throw new Error('HOST_CANCELLED_STOP_TRANSPORT_CLOSED');
              connection.send('action_request',{clientSequence,commandType:'vehicle.setRunning',
                originPlayerId:playerId,targetCompanyEntity:companyEntity,targetEntity:entity,
                payload:{running}});
            }catch(error){finish(error);}
          });
          // A coordinator completion is not an independent vehicle result.
          // Completion is broadcast while the checkpoint is still held. Wait
          // for the release receipt and a running GUI clock before starting
          // the final owner inspection, so its paused/running proof context
          // cannot change halfway through the read.
          const releaseDeadline=Date.now()+10000;
          let released=false;
          const expectedSpeed=result.speedup??1;
          if(![1,2,4].includes(expectedSpeed))throw new Error('HOST_CANCELLED_STOP_RELEASE_UNVERIFIED');
          while(Date.now()<releaseDeadline){
            const observation=bridge.engineObservation;
            if(nativeGate.ready!==true||!bridge.connected||!observation?.available)
              throw new Error('HOST_CANCELLED_STOP_RELEASE_UNVERIFIED');
            if(healthy()===true&&observation.sample?.speedup===expectedSpeed
              &&observation.sample.updateCount>=result.updateCount){released=true;break;}
            await delay(pollMs);
          }
          if(!released)throw new Error('HOST_CANCELLED_STOP_RELEASE_UNVERIFIED');
          // Read the owned entity once more after its accepted sequence; an
          // absent or ambiguous postcondition halts this session, not a retry.
          const observed=await bridge.inspectVehicleOwner({entity,company:companyEntity,
            timeoutMs:10000});
          if(observed.entity!==entity||observed.company!==companyEntity
            ||observed.stopFlag!==stopped||observed.updateCount<result.updateCount
            ||nativeGate.ready!==true||healthy()!==true)
            throw new Error('HOST_CANCELLED_STOP_POSTCONDITION_UNKNOWN');
          const completed=Object.freeze({...result,nativeInvocation:arm.expectedInvocation,
            observedStopFlag:observed.stopFlag,
            ...(running?{stopped:0}:{}),
            observedRevision:observed.revision,observedUpdateCount:observed.updateCount,
            observedTickCount:observed.tickCount});
          logger({level:'info',event:'host_cancelled_stop_completed',...completed,
            ...(running?{singleGameStartVerified:true}:{singleGameStopVerified:true}),
            gameplayVerified:false});
          return completed;
        }catch(error){
          // After a one-use native arm, a missing callback or cleanup receipt
          // may mean the original action ran. Park the session even if no
          // semantic action was sent to Host yet.
          halt('HOST_CANCELLED_STOP_OUTCOME_UNKNOWN');
          throw error;
        }finally{
          if(permitOpen)await bridge.closeSingleStopPermit().catch(()=>{});
        }
      })();
      return Object.freeze({arm,completion,...(running?{stopped:0,armRequestedAt}:{})});
    },
  });
}

export function createHostCancelledStop({host,hostLocal,bridge,nativeGate,
  pollMs=100,clientSequence=0,logger=()=>{},stopped=1,enableExperimentalStart=false}) {
  if(!host||!hostLocal)throw new TypeError('INVALID_HOST_CANCELLED_STOP_OPTIONS');
  const connection=hostLocal.connection;
  const resolveCompany=()=>host.authority.players().find(p=>p.playerId===connection?.playerId)?.companyEntity;
  return createCancelledStop({connection,resolveCompany,bridge,nativeGate,
    pollMs,clientSequence,logger,stopped,enableExperimentalStart,
    healthy:()=>hostLocal.ready===true&&host.coordinator.phase==='running'
      &&host.authority.players().some(p=>p.playerId===connection?.playerId&&p.companyEntity===resolveCompany()),
    halt:reason=>host.coordinator.halt(reason)});
}

export function createJoinCancelledStop({connection,companyGrant,joinBootstrap,bridge,nativeGate,
  halt,pollMs=100,clientSequence=0,logger=()=>{},stopped=1,enableExperimentalStart=false}) {
  const companyEntity=companyGrant?.companyEntity;
  if(!companyGrant||!joinBootstrap||typeof halt!=='function')
    throw new TypeError('INVALID_JOIN_CANCELLED_STOP_OPTIONS');
  return createCancelledStop({connection,resolveCompany:()=>companyEntity,bridge,nativeGate,
    pollMs,clientSequence,logger,stopped,enableExperimentalStart,
    healthy:()=>joinBootstrap.failed===false&&joinBootstrap.attachment?.ready===true
      &&joinBootstrap.attachment.adapter?.phase==='running'
      &&bridge.engineObservation?.sample?.companyEntity===companyEntity
      &&connection.socket?.destroyed===false,
    halt});
}
