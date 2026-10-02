import {parseLoanObtainHeld,parseLoanObtainAuthorization} from './loan-obtain-hold-contract.mjs';
import {sha256Canonical} from './canonical.mjs';

const MAX_ENTITY=2147483647;
const MAX_SAFE=Number.MAX_SAFE_INTEGER;
const NONCE=/^[0-9a-f]{32}$/;
const HASH=/^[a-f0-9]{64}$/;
const OFFERS=['Small','Medium','Large','ExtraLarge'];
const COMMON=['schemaVersion','nonce','roundId','operationId','operation','status','updateCount','held'];
const HELD_BASE=['hostSequence','companyEntity','targetCompanyEntity','heldGameTime','freeId','monthDuration',
  'offerCount','obtainedLoanCount','ownerCount','loanMarkersAbsent'];
const EXEC_BASE=['hostSequence','companyEntity','loanId','amount','duration','percentageMillionths',
  'offerType','loanLastPayDay','loanTimesPaid','freeId','heldGameTime','cooldownUntil',
  'callbackCount','companyCount','offerCount'];

function invalid(code){throw new TypeError(code);}
function integer(value,min=0,max=MAX_ENTITY){return Number.isSafeInteger(value)&&value>=min&&value<=max;}
function exact(value,fields){
  const prototype=value&&typeof value==='object'?Object.getPrototypeOf(value):undefined;
  return value!==null&&typeof value==='object'&&!Array.isArray(value)
    &&(prototype===Object.prototype||prototype===null)
    &&Object.keys(value).sort().join(',')===[...fields].sort().join(',');
}
function clone(value){
  if(Array.isArray(value))return value.map(clone);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)]));
  return value;
}
function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
}
function validIdentity(value,max=128){return typeof value==='string'&&value.length>0&&value.length<=max;}
function contextBase(raw,{nonce,command,roundId,operationId}){
  if(!NONCE.test(nonce??'')||!validIdentity(roundId,64)||!validIdentity(operationId,128)
    ||!command||!Number.isSafeInteger(command.hostSequence)||command.hostSequence<1
    ||!Number.isSafeInteger(command.scheduledUpdate)||command.scheduledUpdate<0)
    invalid('INVALID_LOAN_OBTAIN_RECEIPT_CONTEXT');
}
function decodeOffers(raw,offerCount){
  if(offerCount!==4)invalid('INVALID_LOAN_OBTAIN_OFFER_COUNT');
  const availableLoans=[],seen=new Set();
  for(let index=1;index<=4;index++){
    const type=raw[`offer${index}Type`],state=raw[`offer${index}State`];
    if(!OFFERS.includes(type)||seen.has(type))invalid('INVALID_LOAN_OBTAIN_OFFER_IDENTITY');
    seen.add(type);
    if(state==='available'){
      const amount=raw[`offer${index}Amount`],duration=raw[`offer${index}Duration`];
      const rate=raw[`offer${index}PercentageMillionths`],birthDay=raw[`offer${index}BirthDay`];
      if(!Number.isSafeInteger(amount)||amount<=0||!integer(duration,1)
        ||!integer(rate,1,1000000)||!integer(birthDay,0))invalid('INVALID_LOAN_OBTAIN_OFFER_FACTS');
      availableLoans.push({type,amount,duration,percentage:rate/1000000,birthDay});
    }else if(state==='cooldown'){
      const cooldownUntil=raw[`offer${index}CooldownUntil`];
      if(!integer(cooldownUntil,0))invalid('INVALID_LOAN_OBTAIN_OFFER_COOLDOWN');
      availableLoans.push({type,cooldownUntil});
    }else invalid('INVALID_LOAN_OBTAIN_OFFER_STATE');
  }
  return availableLoans;
}
function offerKeys(offers){
  const keys=[];
  for(let index=1;index<=4;index++){
    const offer=offers[index-1],prefix=`offer${index}`;
    if(Object.hasOwn(offer,'cooldownUntil'))keys.push(`${prefix}Type`,`${prefix}State`,`${prefix}CooldownUntil`);
    else keys.push(`${prefix}Type`,`${prefix}State`,`${prefix}Amount`,`${prefix}Duration`,
      `${prefix}PercentageMillionths`,`${prefix}BirthDay`);
  }
  return keys;
}
function commonValid(raw,expected,operation){
  if(raw.schemaVersion!==1||raw.nonce!==expected.nonce||raw.roundId!==expected.roundId
    ||raw.operationId!==expected.operationId||raw.operation!==operation||raw.status!=='ok'
    ||raw.updateCount!==expected.command.scheduledUpdate||raw.held!==true
    ||raw.hostSequence!==expected.command.hostSequence)invalid('LOAN_OBTAIN_RECEIPT_CORRELATION');
}
function selectedOffer(offers,type){return offers.find(offer=>offer.type===type);}

export function decodeLoanObtainHeldReceipt(raw,context){
  contextBase(raw,context);
  const base=[...COMMON,...HELD_BASE];
  const offers=decodeOffers(raw,raw.offerCount);
  if(!exact(raw,[...base,...offerKeys(offers)]))invalid('INVALID_LOAN_OBTAIN_HELD_RECEIPT_FIELDS');
  commonValid(raw,context,'holdLoanObtain');
  if(!integer(raw.companyEntity,1)||raw.companyEntity!==context.localCompanyEntity
    ||!integer(raw.targetCompanyEntity,1)||!integer(raw.heldGameTime,0)
    ||!integer(raw.freeId,0)||!integer(raw.monthDuration,1)
    ||raw.obtainedLoanCount!==0||raw.ownerCount!==0||raw.loanMarkersAbsent!==1)
    invalid('LOAN_OBTAIN_HELD_RECEIPT_STATE_INVALID');
  const command=context.command;
  const availableLoans=offers;
  const stateHash=sha256Canonical({schemaVersion:1,availableLoans,obtainedLoans:[],freeId:raw.freeId,owners:[]});
  const held={roundId:context.roundId,hostSequence:raw.hostSequence,scheduledUpdate:raw.updateCount,
    companyEntity:raw.companyEntity,targetCompanyEntity:raw.targetCompanyEntity,
    heldGameTime:raw.heldGameTime,freeId:raw.freeId,monthDuration:raw.monthDuration,
    availableLoans,loanStateHash:stateHash};
  let loanHeld;
  try{loanHeld=parseLoanObtainHeld(held,command,context.roundId);}
  catch{invalid('LOAN_OBTAIN_HELD_REPORT_INVALID');}
  if(loanHeld.targetCompanyEntity!==command.targetCompanyEntity)
    invalid('LOAN_OBTAIN_HELD_TARGET_MISMATCH');
  const receipt=freeze({schemaVersion:1,roundId:raw.roundId,operationId:raw.operationId,
    operation:raw.operation,status:raw.status,updateCount:raw.updateCount,held:raw.held,loanHeld});
  return freeze({receipt,state:loanHeld});
}

export function decodeLoanObtainExecutionReceipt(raw,context){
  contextBase(raw,context);
  if(!Array.isArray(context.companies)||context.companies.length<2||context.companies.length>4
    ||context.companies.some(company=>!integer(company,1))
    ||new Set(context.companies).size!==context.companies.length)
    invalid('INVALID_LOAN_OBTAIN_COMPANY_ROSTER');
  const companies=[...context.companies].sort((a,b)=>a-b);
  const command=context.command;
  let authorization;
  try{authorization=parseLoanObtainAuthorization(context.authorization,command,context.roundId);}
  catch{invalid('INVALID_LOAN_OBTAIN_AUTHORIZATION');}
  if(!companies.includes(command.targetCompanyEntity)
    ||authorization.targetCompanyEntity!==command.targetCompanyEntity)
    invalid('LOAN_OBTAIN_AUTHORIZATION_TARGET_MISMATCH');
  const base=[...COMMON,...EXEC_BASE];
  for(let index=1;index<=companies.length;index++)base.push(`company${index}`,`balanceBefore${index}`,
    `negativeBefore${index}`,`balanceAfter${index}`,`negativeAfter${index}`);
  const offers=decodeOffers(raw,raw.offerCount);
  if(!exact(raw,[...base,...offerKeys(offers)]))invalid('INVALID_LOAN_OBTAIN_EXECUTION_RECEIPT_FIELDS');
  commonValid(raw,context,'executeHeld');
  const payload=command.payload;
  const expectedLoanId=authorization.freeId;
  if(raw.companyEntity!==command.targetCompanyEntity||raw.companyEntity!==authorization.targetCompanyEntity
    ||raw.loanId!==expectedLoanId||!integer(raw.loanId,0)||!integer(raw.freeId,0)
    ||raw.freeId!==expectedLoanId+1
    ||raw.offerType!==payload.offerType||raw.amount!==payload.amount||raw.amount>MAX_SAFE
    ||raw.duration!==payload.duration||raw.percentageMillionths!==Math.round(payload.percentage*1000000)
    ||raw.loanLastPayDay!==authorization.heldGameTime||raw.loanTimesPaid!==0
    ||raw.heldGameTime!==authorization.heldGameTime||raw.cooldownUntil!==authorization.cooldownUntil
    ||raw.callbackCount!==1||raw.companyCount!==companies.length)
    invalid('LOAN_OBTAIN_EXECUTION_FACT_MISMATCH');
  const chosen=selectedOffer(authorization.availableLoans,payload.offerType);
  if(!chosen||Object.hasOwn(chosen,'cooldownUntil')||chosen.amount!==payload.amount
    ||chosen.duration!==payload.duration||chosen.percentage!==payload.percentage
    ||chosen.birthDay!==payload.birthDay)invalid('LOAN_OBTAIN_AUTHORIZED_OFFER_INVALID');
  const afterOffers=authorization.availableLoans.map(offer=>offer.type===payload.offerType
    ?{type:offer.type,cooldownUntil:authorization.cooldownUntil}:clone(offer));
  if(!sameOffers(offers,afterOffers))invalid('LOAN_OBTAIN_POST_OFFERS_CHANGED');
  const balancesBefore=[],balancesAfter=[];
  for(let index=1;index<=companies.length;index++){
    const companyEntity=companies[index-1];
    if(raw[`company${index}`]!==companyEntity)invalid('LOAN_OBTAIN_BALANCE_ROSTER_MISMATCH');
    const beforeMagnitude=raw[`balanceBefore${index}`],afterMagnitude=raw[`balanceAfter${index}`];
    const beforeNegative=raw[`negativeBefore${index}`],afterNegative=raw[`negativeAfter${index}`];
    if(!integer(beforeMagnitude,0,MAX_SAFE)||!integer(afterMagnitude,0,MAX_SAFE)
      ||![0,1].includes(beforeNegative)||![0,1].includes(afterNegative)
      ||beforeNegative===1&&beforeMagnitude===0||afterNegative===1&&afterMagnitude===0)
      invalid('LOAN_OBTAIN_BALANCE_INVALID');
    const before=beforeNegative===1?-beforeMagnitude:beforeMagnitude;
    const after=afterNegative===1?-afterMagnitude:afterMagnitude;
    if(companyEntity===command.targetCompanyEntity){
      if(before+payload.amount!==after||!Number.isSafeInteger(before+payload.amount))
        invalid('LOAN_OBTAIN_OWNER_CREDIT_MISMATCH');
    }else if(before!==after)invalid('LOAN_OBTAIN_REFERENCE_BALANCE_CHANGED');
    balancesBefore.push({companyEntity,balance:before});
    balancesAfter.push({companyEntity,balance:after});
  }
  const state={loan:{id:raw.loanId,type:payload.offerType,amount:raw.amount,duration:raw.duration,
      percentage:raw.percentageMillionths/1000000,lastPayDay:raw.loanLastPayDay,timesPaid:raw.loanTimesPaid},
    owner:{loanId:raw.loanId,ownerCompanyEntity:raw.companyEntity,type:payload.offerType,
      amount:raw.amount,duration:raw.duration,percentage:raw.percentageMillionths/1000000},
    freeId:raw.freeId,availableLoans:clone(offers),balancesBefore,balancesAfter,
    updateCount:raw.updateCount,gameTime:raw.heldGameTime};
  const receipt=freeze({schemaVersion:1,roundId:raw.roundId,operationId:raw.operationId,
    operation:raw.operation,status:raw.status,updateCount:raw.updateCount,held:raw.held,
    ownerCompanyEntity:raw.companyEntity,stateHash:sha256Canonical(state)});
  return freeze({receipt,state});
}

function sameOffers(actual,expected){
  if(actual.length!==expected.length)return false;
  return actual.every((offer,index)=>{
    const wanted=expected[index];
    if(offer.type!==wanted.type)return false;
    if(Object.hasOwn(wanted,'cooldownUntil'))return Object.keys(offer).length===2
      &&offer.cooldownUntil===wanted.cooldownUntil;
    return Object.keys(offer).length===5&&offer.amount===wanted.amount
      &&offer.duration===wanted.duration&&offer.percentage===wanted.percentage
      &&offer.birthDay===wanted.birthDay;
  });
}
