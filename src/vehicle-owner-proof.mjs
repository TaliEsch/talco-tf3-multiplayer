// A running TF3 world advances while its GUI and engine exchange a read-only
// receipt. Bound that transport delay; executeHeld still rechecks ownership in
// the engine at the scheduled update. A paused world requires exact equality.
export const MAX_VEHICLE_OWNER_PROOF_LAG_UPDATES = 32;

export function ownerProofClockCurrent({issuedUpdate,receiptUpdate,hostUpdate,paused}) {
  if(![issuedUpdate,receiptUpdate,hostUpdate].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647)
    ||typeof paused!=='boolean')return false;
  return receiptUpdate>=issuedUpdate && hostUpdate>=receiptUpdate
    && (paused ? hostUpdate===issuedUpdate : hostUpdate-receiptUpdate<=MAX_VEHICLE_OWNER_PROOF_LAG_UPDATES);
}
