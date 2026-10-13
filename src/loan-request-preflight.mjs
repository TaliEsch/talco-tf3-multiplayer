import {lstat} from 'node:fs/promises';
import {requirePlainDirectory,createUserdataStorageContext} from './userdata-ipc.mjs';

export const LOAN_DISPATCH_REQUEST_NAMES=Object.freeze([
  'loan_installment_arm_request.lua',
  'loan_due_approval_request.lua',
  'loan_installment_next_arm_request.lua',
  'loan_due_next_approval_request.lua',
  'loan_continuation_release_request.lua',
]);

// Prelaunch observation only. Existing requests remain spent history, even if
// malformed or linked. The publisher must still enforce its exclusive create.
export async function assertLoanDispatchSlotsEmpty(directory,{userdataStorageMode='legacy',checkpointSaveRequired=false}={}){
  const resolved=await requirePlainDirectory(directory);
  const storage=await createUserdataStorageContext(resolved,{mode:userdataStorageMode});
  const names=checkpointSaveRequired
    ? [...LOAN_DISPATCH_REQUEST_NAMES,'checkpoint_save_request.lua','checkpoint_save_receipt.lua']
    : LOAN_DISPATCH_REQUEST_NAMES;
  for(const name of names){
    for(const file of storage.conflictPaths(name)){
      try{await lstat(file);}
      catch(error){if(error.code==='ENOENT')continue;throw error;}
      const error=new Error(`LOAN_DISPATCH_HISTORY_REQUIRES_RETIREMENT: ${name}`);
      error.code='LOAN_DISPATCH_HISTORY_REQUIRES_RETIREMENT';
      throw error;
    }
  }
  await requirePlainDirectory(directory);
}
