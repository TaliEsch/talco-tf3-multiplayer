// Pure semantic check for a fresh ordinary-loan resume grant. The caller must
// authenticate the Host sender, consume the grant in the current game event,
// and independently run the Lua saved-origin qualification before activation.
const HASH=/^[0-9a-f]{64}$/;
const NONCE=/^[0-9a-f]{32}$/;
const IDENT=/^[A-Za-z0-9_.:-]{1,128}$/;
const MAX=Number.MAX_SAFE_INTEGER;
const FIELDS=['schemaVersion','phase','kind','nonce','roundId','sourceSaveSha256',
  'persistedHistoryHash','obtainAuthorizationHash','ownerCompanyEntity','loanId',
  'selectedCompanyEntity','heldUpdate','issuedTick','expiresTick'];
const LEGACY=['tf3mpLoanAdmission','tf3mpLoanAttempt','tf3mpLoanHistory',
  'tf3mpLoanAuthorization','tf3mpLoanNextAuthorization','tf3mpLoanNextIntent',
  'tf3mpLoanContinuation'];
const ORDINARY=['tf3mpOrdinaryLoanOrigin','tf3mpOrdinaryLoanOriginPin',
  'tf3mpOrdinaryLoanCandidate','tf3mpOrdinaryLoanAttempt',
  'tf3mpOrdinaryLoanHistory'];
const invalid=()=>{throw new TypeError('INVALID_ORDINARY_LOAN_RESUME_GRANT');};
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const uint=(value,max=MAX)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
const positive=(value,max=MAX)=>uint(value,max)&&value>0;
const hash=value=>typeof value==='string'&&HASH.test(value);
const nonce=value=>typeof value==='string'&&NONCE.test(value);
const ident=value=>typeof value==='string'&&IDENT.test(value);
const exact=(value,fields)=>record(value)&&Object.keys(value).length===fields.length
  &&fields.every(field=>Object.hasOwn(value,field));
const same=(a,b)=>{
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'
    ||Array.isArray(a)!==Array.isArray(b))return false;
  const ak=Object.keys(a),bk=Object.keys(b);
  return ak.length===bk.length&&ak.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));
};
const freeze=value=>{
  if(value&&typeof value==='object'){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
};

function roster(companies,players){
  if(!Array.isArray(companies)||companies.length<2||companies.length>4
    ||Object.keys(companies).length!==companies.length||!record(players))invalid();
  if(companies.some((id,index)=>!positive(id,2147483647)
    ||index>0&&id<=companies[index-1]))invalid();
  const mapped=Object.entries(players);
  if(mapped.length!==companies.length
    ||mapped.some(([player,id])=>!ident(player)||!companies.includes(id))
    ||new Set(mapped.map(([,id])=>id)).size!==companies.length)invalid();
  return companies;
}

export function validateOrdinaryLoanResumeGrant(grant,{checkpoint,
  sourceSaveSha256,obtainedBinding,activeBinding,selectedCompanyEntity,
  clock,speedup,lease,loanState}={}){
  if(!exact(grant,FIELDS)||grant.schemaVersion!==1||grant.phase!=='consumed'
    ||grant.kind!=='ordinary_loan_resume'||!nonce(grant.nonce)
    ||!ident(grant.roundId)||!hash(grant.sourceSaveSha256)
    ||!hash(grant.persistedHistoryHash)||!hash(grant.obtainAuthorizationHash)
    ||!positive(grant.ownerCompanyEntity,2147483647)
    ||!uint(grant.loanId,2147483646)
    ||!positive(grant.selectedCompanyEntity,2147483647)
    ||!uint(grant.heldUpdate,2147483647)
    ||!uint(grant.issuedTick)||!uint(grant.expiresTick)
    ||grant.expiresTick<grant.issuedTick
    ||grant.expiresTick-grant.issuedTick>60
    ||!hash(sourceSaveSha256)||grant.sourceSaveSha256!==sourceSaveSha256)
    invalid();
  if(!record(checkpoint)||checkpoint.operation!=='obtainedLoanCheckpoint'
    ||checkpoint.status!=='ok'||checkpoint.held!==true
    ||checkpoint.snapshotVersion!==2||checkpoint.callbackCount!==1
    ||!hash(checkpoint.persistedHistoryHash)||!hash(checkpoint.authorizationHash)
    ||!nonce(checkpoint.nonce)||!ident(checkpoint.roundId)
    ||!ident(checkpoint.executeOperationId)
    ||!positive(checkpoint.hostSequence)
    ||!uint(checkpoint.updateCount,2147483647)
    ||!uint(checkpoint.heldGameTime)||!uint(checkpoint.loanLastPayDay)
    ||!uint(checkpoint.loanTimesPaid)||checkpoint.loanTimesPaid!==0
    ||!positive(checkpoint.companyEntity,2147483647)
    ||!uint(checkpoint.loanId,2147483646)
    ||checkpoint.freeId!==checkpoint.loanId+1
    ||!uint(checkpoint.companyCount,4)||checkpoint.companyCount<2
    ||grant.persistedHistoryHash!==checkpoint.persistedHistoryHash
    ||grant.obtainAuthorizationHash!==checkpoint.authorizationHash
    ||grant.ownerCompanyEntity!==checkpoint.companyEntity
    ||grant.loanId!==checkpoint.loanId
    ||grant.heldUpdate!==checkpoint.updateCount)
    invalid();
  const ids=[];
  for(let i=1;i<=checkpoint.companyCount;i++){
    const id=checkpoint[`company${i}`];
    const magnitude=checkpoint[`balanceAfter${i}`];
    const negative=checkpoint[`negativeAfter${i}`];
    if(!positive(id,2147483647)||i>1&&id<=ids[i-2]
      ||!uint(magnitude)||![0,1].includes(negative)
      ||negative===1&&magnitude===0)invalid();
    ids.push(id);
  }
  if(!ids.includes(checkpoint.companyEntity)
    ||!positive(selectedCompanyEntity,2147483647)
    ||grant.selectedCompanyEntity!==selectedCompanyEntity
    ||!ids.includes(selectedCompanyEntity))invalid();
  if(!record(obtainedBinding)||!nonce(obtainedBinding.nonce)
    ||!ident(obtainedBinding.roundId)
    ||!ident(obtainedBinding.localPlayerId)
    ||!['prepared','action_held'].includes(obtainedBinding.phase)
    ||obtainedBinding.nonce!==checkpoint.nonce
    ||obtainedBinding.roundId!==checkpoint.roundId
    ||(obtainedBinding.nextSequence??1)!==checkpoint.hostSequence
    ||grant.nonce===obtainedBinding.nonce
    ||obtainedBinding.soloStopTest===true
    ||obtainedBinding.passiveJoinStop===true
    ||!same(roster(obtainedBinding.companies,obtainedBinding.players),ids)
    ||!record(loanState)||!record(loanState.tf3mpLoanObtainAttempt)
    ||!record(loanState.tf3mpLoanObtainReceipt))invalid();
  const attempt=loanState.tf3mpLoanObtainAttempt;
  const receipt=loanState.tf3mpLoanObtainReceipt;
  if(attempt.status!=='complete'||attempt.stage!=='verified'||attempt.callbackCount!==1
    ||receipt.status!=='complete'||receipt.callbackCount!==1
    ||attempt.nonce!==checkpoint.nonce||attempt.roundId!==checkpoint.roundId
    ||attempt.operationId!==checkpoint.executeOperationId
    ||attempt.hostSequence!==checkpoint.hostSequence
    ||attempt.companyEntity!==checkpoint.companyEntity
    ||receipt.companyEntity!==checkpoint.companyEntity
    ||receipt.loanId!==checkpoint.loanId
    ||receipt.updateCount!==checkpoint.updateCount
    ||receipt.gameTime!==checkpoint.heldGameTime
    ||loanState.freeId!==checkpoint.freeId
    ||!Array.isArray(loanState.obtainedLoans)||loanState.obtainedLoans.length!==1
    ||Object.keys(loanState.obtainedLoans).length!==1
    ||!record(loanState.obtainedLoans[0])
    ||loanState.obtainedLoans[0].id!==checkpoint.loanId
    ||loanState.obtainedLoans[0].timesPaid!==0
    ||loanState.obtainedLoans[0].lastPayDay!==checkpoint.loanLastPayDay
    ||!record(loanState.tf3mpLoanOwners)
    ||loanState.tf3mpLoanOwners[checkpoint.loanId]?.ownerCompanyEntity!==checkpoint.companyEntity
    ||receipt.companyCount!==checkpoint.companyCount
    ||LEGACY.some(key=>loanState[key]!=null)
    ||ORDINARY.some(key=>loanState[key]!=null))invalid();
  for(let i=1;i<=checkpoint.companyCount;i++){
    const balance=checkpoint[`balanceAfter${i}`]
      *(checkpoint[`negativeAfter${i}`]===1?-1:1);
    if(receipt[`company${i}`]!==checkpoint[`company${i}`]
      ||receipt[`balanceAfter${i}`]!==balance)invalid();
  }
  const originPlayerId=attempt.request?.originPlayerId;
  if(!ident(originPlayerId)
    ||!ids.includes(obtainedBinding.players[obtainedBinding.localPlayerId])
    ||obtainedBinding.players[originPlayerId]!==checkpoint.companyEntity)invalid();
  // Player IDs belong to an admission. The saved mapping above proves the old
  // borrower; the fresh roster independently binds these same company entities.
  if(!record(activeBinding)||activeBinding.phase!=='authenticated_held'
    ||activeBinding.nonce!==grant.nonce||activeBinding.roundId!==grant.roundId
    ||activeBinding.sourceSaveSha256!==sourceSaveSha256
    ||activeBinding.soloStopTest===true||activeBinding.passiveJoinStop===true
    ||!ident(activeBinding.localPlayerId)
    ||!same(roster(activeBinding.companies,activeBinding.players),ids)
    ||activeBinding.players[activeBinding.localPlayerId]!==selectedCompanyEntity)
    invalid();
  if(!record(clock)||!uint(clock.tickCount)||!uint(clock.updateCount,2147483647)
    ||!uint(clock.gameTime)||clock.updateCount!==checkpoint.updateCount
    ||clock.gameTime!==checkpoint.heldGameTime
    ||clock.tickCount<grant.issuedTick||clock.tickCount>grant.expiresTick
    ||speedup!==0||!record(lease)||lease.phase!=='active'
    ||lease.nonce!==grant.nonce||lease.companyEntity!==selectedCompanyEntity
    ||!uint(lease.lastTick)||!uint(lease.expiresTick)
    ||clock.tickCount<lease.lastTick||clock.tickCount>=lease.expiresTick)
    invalid();
  return freeze(structuredClone(grant));
}
