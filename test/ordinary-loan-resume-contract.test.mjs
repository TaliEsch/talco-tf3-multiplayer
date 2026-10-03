import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOrdinaryLoanResumeGrant} from '../src/ordinary-loan-resume-contract.mjs';

function fixture(){
  const sourceSaveSha256='a'.repeat(64);
  const oldNonce='b'.repeat(32),newNonce='c'.repeat(32);
  const roster=[3141,55652];
  const players={host:3141,join:55652};
  const checkpoint={operation:'obtainedLoanCheckpoint',status:'ok',held:true,
    snapshotVersion:2,callbackCount:1,nonce:oldNonce,roundId:'saved.round',
    executeOperationId:'obtain.1',hostSequence:1,updateCount:3614,
    heldGameTime:722800,loanLastPayDay:722800,loanTimesPaid:0,
    companyEntity:3141,loanId:0,freeId:1,companyCount:2,
    company1:3141,balanceAfter1:14000,negativeAfter1:0,
    company2:55652,balanceAfter2:20000,negativeAfter2:0,
    persistedHistoryHash:'d'.repeat(64),authorizationHash:'e'.repeat(64)};
  const grant={schemaVersion:1,phase:'consumed',kind:'ordinary_loan_resume',
    nonce:newNonce,roundId:'resume-1',sourceSaveSha256,
    persistedHistoryHash:checkpoint.persistedHistoryHash,
    obtainAuthorizationHash:checkpoint.authorizationHash,
    ownerCompanyEntity:3141,loanId:0,selectedCompanyEntity:3141,
    heldUpdate:3614,issuedTick:100,expiresTick:110};
  const obtainedBinding={nonce:oldNonce,roundId:'saved.round',phase:'action_held',
    localPlayerId:'host',players:structuredClone(players),companies:[...roster]};
  const activeBinding={nonce:newNonce,roundId:'resume-1',sourceSaveSha256,
    phase:'authenticated_held',localPlayerId:'host',players:structuredClone(players),
    companies:[...roster]};
  const loanState={freeId:1,obtainedLoans:[{id:0,type:'Small',amount:4000,
    duration:35064000,percentage:0.12,lastPayDay:722800,timesPaid:0}],
    tf3mpLoanOwners:{0:{ownerCompanyEntity:3141}},
    tf3mpLoanObtainAttempt:{status:'complete',stage:'verified',callbackCount:1,
      nonce:oldNonce,roundId:'saved.round',operationId:'obtain.1',
      hostSequence:1,companyEntity:3141,request:{originPlayerId:'host'}},
    tf3mpLoanObtainReceipt:{status:'complete',callbackCount:1,
      companyEntity:3141,loanId:0,updateCount:3614,gameTime:722800,
      companyCount:2,company1:3141,balanceAfter1:14000,
      company2:55652,balanceAfter2:20000}};
  const context={checkpoint,sourceSaveSha256,obtainedBinding,activeBinding,
    selectedCompanyEntity:3141,clock:{tickCount:105,updateCount:3614,gameTime:722800},
    speedup:0,lease:{phase:'active',nonce:newNonce,
      companyEntity:3141,lastTick:99,expiresTick:130},loanState};
  return {grant,context};
}

test('fresh held resume semantic binds saved obtain and active host roster',()=>{
  const {grant,context}=fixture();
  const result=validateOrdinaryLoanResumeGrant(grant,context);
  assert.deepEqual(result,grant);
  assert.notStrictEqual(result,grant);
  assert.throws(()=>{result.nonce='f'.repeat(32);},TypeError);
});

test('selected join company can resume while original saved local player was host',()=>{
  const {grant,context}=fixture();
  grant.selectedCompanyEntity=55652;
  context.selectedCompanyEntity=55652;
  context.activeBinding.localPlayerId='join';
  context.lease.companyEntity=55652;
  assert.deepEqual(validateOrdinaryLoanResumeGrant(grant,context),grant);
});

test('fresh admission UUIDs retain company ownership without rewriting saved origin',()=>{
  const {grant,context}=fixture();
  const obtained=structuredClone(context.obtainedBinding);
  const freshHost='413fe8b5-6da5-45e8-aeb9-d97bb27a363a';
  const freshJoin='fa064575-b80b-42ac-8a8d-5370e6947c12';
  context.activeBinding.players={[freshHost]:3141,[freshJoin]:55652};
  context.activeBinding.localPlayerId=freshJoin;
  context.selectedCompanyEntity=grant.selectedCompanyEntity=context.lease.companyEntity=55652;
  assert.deepEqual(validateOrdinaryLoanResumeGrant(grant,context),grant);
  assert.deepEqual(context.obtainedBinding,obtained);
  assert.equal(context.activeBinding.players.host,undefined);
});

for(const [name,mutate] of [
  ['extra grant field',(g)=>g.extra=1],
  ['unconsumed grant',(g)=>g.phase='issued'],
  ['foreign source',(g)=>g.sourceSaveSha256='f'.repeat(64)],
  ['foreign history',(g)=>g.persistedHistoryHash='f'.repeat(64)],
  ['foreign obtain authorization',(g)=>g.obtainAuthorizationHash='f'.repeat(64)],
  ['foreign owner',(g)=>g.ownerCompanyEntity=55652],
  ['foreign loan ID',(g)=>g.loanId=1],
  ['reused obtain nonce',(g,c)=>g.nonce=c.obtainedBinding.nonce],
  ['stale grant tick',(g,c)=>c.clock.tickCount=g.expiresTick+1],
  ['long grant window',(g)=>g.expiresTick=g.issuedTick+61],
  ['changed held update',(g)=>g.heldUpdate++],
  ['unheld speed',(g,c)=>c.speedup=1],
  ['expired lease',(g,c)=>c.lease.expiresTick=c.clock.tickCount],
  ['foreign lease',(g,c)=>c.lease.companyEntity=55652],
  ['foreign selected company',(g)=>g.selectedCompanyEntity=9999],
  ['active binding wrong source',(g,c)=>c.activeBinding.sourceSaveSha256='f'.repeat(64)],
  ['running phase is not held resume admission',(g,c)=>c.activeBinding.phase='running'],
  ['active binding wrong roster',(g,c)=>c.activeBinding.companies=[3141,60000]],
  ['active mapping missing owner',(g,c)=>delete c.activeBinding.players.host],
  ['active mapping duplicate company',(g,c)=>c.activeBinding.players.join=3141],
  ['active mapping foreign company',(g,c)=>c.activeBinding.players.host=60000],
  ['active local ownership mismatch',(g,c)=>c.activeBinding.localPlayerId='join'],
  ['saved roster changed',(g,c)=>c.obtainedBinding.companies=[3141,60000]],
  ['saved borrower changed',(g,c)=>c.obtainedBinding.players.host=55652],
  ['checkpoint unknown',(g,c)=>c.checkpoint.status='unknown'],
  ['obtain attempt unknown',(g,c)=>c.loanState.tf3mpLoanObtainAttempt.status='unknown'],
  ['obtain receipt unknown',(g,c)=>c.loanState.tf3mpLoanObtainReceipt.status='unknown'],
  ['obtain receipt balance changed',(g,c)=>c.loanState.tf3mpLoanObtainReceipt.balanceAfter2++],
  ['ordinary attempt pending',(g,c)=>c.loanState.tf3mpOrdinaryLoanAttempt={phase:'unknown'}],
  ['legacy attempt pending',(g,c)=>c.loanState.tf3mpLoanAttempt={phase:'unknown'}],
  ['completed history already present',(g,c)=>c.loanState.tf3mpOrdinaryLoanHistory=[]],
])test(`${name} rejects resume binding`,()=>{
  const {grant,context}=fixture();mutate(grant,context);
  assert.throws(()=>validateOrdinaryLoanResumeGrant(grant,context),TypeError);
});
