import { createAsyncEngineMailbox } from './async-engine-mailbox.mjs';
import { AsyncSessionParticipant } from './async-session-participant.mjs';

// Local composition only. Caller owns authenticated transport and must establish
// common save/build identity and actual control coverage before remote admission.
// No synthetic engine receipts, automatic game launch, or automatic retry.
export async function createEngineSessionAdapter({directory,bridge,playerId,companies,
  send,disconnect,healthy,controlsReady,now=Date.now}) {
  if(!bridge||typeof bridge.startCoordinationLease!=='function'
    ||![send,disconnect,healthy,controlsReady,now].every(f=>typeof f==='function')) throw new TypeError('INVALID_ADAPTER_OPTIONS');
  const mailbox=await createAsyncEngineMailbox({directory,nonce:bridge.nonce});
  let participant,lease,closed=false,lastCounter=-1,polling=null,closing=null;
  const stopRenewal=()=>lease?.stop();
  try {
    // One operation includes the scheduled wait plus separate held-event and
    // receipt exchanges. Match the local coordinator's 30s bounded deadline;
    // heartbeat, observation freshness and exact-update checks stay unchanged.
    participant=new AsyncSessionParticipant({playerId,companies,requireEngineBinding:true,now,timeoutMs:30000,
      publish:request=>{
        if(request.operation!=='halt'&&(!lease?.active||!healthy())) throw new Error('ENGINE_LEASE_NOT_ACTIVE');
        if(['release','prepare','executeHeld'].includes(request.operation)&&controlsReady()!==true) throw new Error('NATIVE_CONTROLS_NOT_LOCKED');
        return mailbox.publish(request);
      },send,disconnect:()=>{stopRenewal();disconnect();}});
    lease=await bridge.startCoordinationLease({healthy:()=>!closed&&participant.phase!=='halted'&&healthy()===true,
      onFailure:code=>participant.halt(code)});
  } catch(error) {stopRenewal();await mailbox.close();throw error;}

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
    receive(kind,payload){
      if(!check())return false;
      if(!lease.active){participant.halt('ENGINE_LEASE_NOT_ACTIVE');return false;}
      return participant.receive(kind,payload);
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
      closed=true;stopRenewal();
      // Teardown is not halt proof. Caller should request halt and keep polling
      // its receipt before closing when possible; expiry remains the fallback.
      closing=(async()=>{await polling;await mailbox.close();})();
      return closing;
    },
  };
}
