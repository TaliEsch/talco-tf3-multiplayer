import {confirmCancelledStop} from './host-cancelled-stop.mjs';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// A one-game diagnostic gate for the receipt-mirror coordinator run. It never
// supplies a second engine receipt and never retries an uncertain UI action.
export async function cancelOneLocalStop({nativeGate,bridge,entity,company,logger=()=>{},pollMs=50}) {
  const client=nativeGate?.client;
  if(nativeGate?.ready!==true||!bridge?.connected||!bridge.engineObservation?.available
    ||!Number.isSafeInteger(entity)||entity<1||!Number.isSafeInteger(company)||company<1
    ||typeof logger!=='function'||!Number.isSafeInteger(pollMs)||pollMs<25||pollMs>500
    ||typeof client?.armVehicleCancel!=='function'||typeof client?.control!=='function')
    throw new Error('LOCAL_CANCEL_CONTEXT_UNAVAILABLE');
  for(const capability of ['vehicle.cancel-arm.v1','diagnostic.vehicle-cancel-arm.v1',
    'diagnostic.passive-vehicle-action.v1'])client.requireCapability(capability);
  let first;
  try{first=await bridge.inspectVehicleOwner({entity,company});}
  catch(error){
    const sample=bridge.engineObservation?.sample;
    logger({level:'warn',event:'local_cancel_stop_owner_inspection_failed',entity,company,
      code:error?.message??'UNKNOWN',updateCount:sample?.updateCount??null,
      tickCount:sample?.tickCount??null,speedup:sample?.speedup??null,gameplayVerified:false});
    throw error;
  }
  logger({level:'info',event:'local_cancel_stop_owner_prestate',entity,company,
    issuedUpdate:first.issuedUpdate??null,receiptUpdate:first.updateCount??null,
    paused:first.paused??null,stopFlag:first.stopFlag,gameplayVerified:false});
  if(first.stopFlag!==0||nativeGate.ready!==true||bridge.engineObservation.sample?.speedup!==1)
    throw new Error('LOCAL_CANCEL_PRESTATE_CHANGED');
  const initialPing=await client.control('ping');
  if(client.vehicleCancelArmObservation(initialPing).state!=='disabled')
    throw new Error('LOCAL_CANCEL_ARM_ALREADY_USED');
  const baseline=client.passiveVehicleActionObservation(initialPing);
  if(!baseline.active||baseline.saturated)throw new Error('LOCAL_CANCEL_OBSERVER_UNAVAILABLE');
  const arm=await client.armVehicleCancel({entity,stopped:1,ttlMs:5000});
  logger({level:'info',event:'local_cancel_stop_armed',entity,company,
    expectedInvocation:arm.expectedInvocation,ttlMs:5000,gameplayVerified:false});
  const deadline=Date.now()+7000;
  while(Date.now()<deadline){
    if(nativeGate.ready!==true||!bridge.connected||!bridge.engineObservation?.available)
      throw new Error('LOCAL_CANCEL_CONTEXT_LOST');
    const ping=await client.control('ping');
    const state=client.vehicleCancelArmObservation(ping);
    if(['expired','revoked','failed'].includes(state.state))throw new Error('LOCAL_CANCEL_ARM_TERMINAL');
    if(state.state==='completed'){
      const action=client.passiveVehicleActionObservation(ping);
      const proof=confirmCancelledStop({arm,state,baseline,action,entity});
      const after=await bridge.inspectVehicleOwner({entity,company});
      if(after.stopFlag!==0||nativeGate.ready!==true||!bridge.connected)
        throw new Error('LOCAL_CANCEL_POSTSTATE_CHANGED');
      logger({level:'info',event:'local_cancel_stop_confirmed',entity,company,
        invocation:proof.invocation,gameplayVerified:false});
      return proof;
    }
    await delay(pollMs);
  }
  throw new Error('LOCAL_CANCEL_COMPLETION_TIMEOUT');
}
