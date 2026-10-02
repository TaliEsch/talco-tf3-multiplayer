import {assertMatchingLoanOffer,parseLoanObtainOrderPayload} from './loan-obtain-order-payload.mjs';
import {sha256Canonical} from './canonical.mjs';
import {PROTOCOL_VERSION} from './constants.mjs';

const MAX_ENTITY=2147483647;
const MAX_SAFE=Number.MAX_SAFE_INTEGER;
const HASH=/^[a-f0-9]{64}$/;
const HELD_FIELDS=['roundId','hostSequence','scheduledUpdate','companyEntity','targetCompanyEntity',
  'heldGameTime','freeId','monthDuration','availableLoans','loanStateHash'];
const SHARED_FIELDS=['roundId','hostSequence','scheduledUpdate','targetCompanyEntity',
  'heldGameTime','freeId','monthDuration','availableLoans','loanStateHash'];
const AUTH_FIELDS=[...SHARED_FIELDS,'cooldownUntil','authorizationHash'];
const COMMAND_FIELDS=['protocolVersion','hostSequence','scheduledUpdate','originPlayerId',
  'targetCompanyEntity','targetEntity','commandType','payload','clientSequence','requestMessageId'];

function invalid(code){throw new TypeError(code);}
function integer(value,min=0,max=MAX_ENTITY){return Number.isSafeInteger(value)&&value>=min&&value<=max;}
function exact(value,fields){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)
    &&Object.getPrototypeOf(value)===Object.prototype
    &&Object.keys(value).sort().join(',')===[...fields].sort().join(',');
}
function clone(value){
  if(Array.isArray(value))return value.map(clone);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,clone(item)]));
  return value;
}
function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
}
function nonemptyString(value,max){return typeof value==='string'&&value.length>=1&&value.length<=max;}
function round(value){return nonemptyString(value,64);}
function commandFacts(command,roundId){
  if(!exact(command,COMMAND_FIELDS)||command.protocolVersion!==PROTOCOL_VERSION
    ||!round(roundId)||!integer(command.hostSequence,1)||!integer(command.scheduledUpdate,0)
    ||!nonemptyString(command.originPlayerId,64)
    ||!integer(command.targetCompanyEntity,1)||command.targetEntity!==0
    ||command.commandType!=='finance.loan.obtain'||!integer(command.clientSequence,0)
    ||!nonemptyString(command.requestMessageId,128))
    invalid('INVALID_LOAN_OBTAIN_COMMAND');
  let offer;
  try{offer=parseLoanObtainOrderPayload(command.payload,command.targetCompanyEntity);}
  catch{invalid('INVALID_LOAN_OBTAIN_COMMAND_PAYLOAD');}
  return {offer,targetCompanyEntity:command.targetCompanyEntity,
    hostSequence:command.hostSequence,scheduledUpdate:command.scheduledUpdate};
}
function expectedLoanStateHash(availableLoans,freeId){
  return sha256Canonical({schemaVersion:1,availableLoans,obtainedLoans:[],freeId,owners:[]});
}
function validateHeld(value){
  if(!exact(value,HELD_FIELDS)||!round(value.roundId)||!integer(value.hostSequence,1)
    ||!integer(value.scheduledUpdate,0)||!integer(value.companyEntity,1)
    ||!integer(value.targetCompanyEntity,1)||!integer(value.heldGameTime,0)
    ||!integer(value.freeId,0)||!integer(value.monthDuration,1)
    ||!Array.isArray(value.availableLoans)||!HASH.test(value.loanStateHash??''))
    invalid('INVALID_LOAN_OBTAIN_HELD');
  validateAvailableLoans(value.availableLoans);
  if(expectedLoanStateHash(value.availableLoans,value.freeId)!==value.loanStateHash)
    invalid('LOAN_OBTAIN_SHARED_STATE_HASH_MISMATCH');
  return value;
}
function validateAvailableLoans(offers){
  if(!Array.isArray(offers)||offers.length!==4||Object.keys(offers).length!==offers.length
    ||Object.keys(offers).some((key,index)=>key!==String(index)))invalid('INVALID_LOAN_OBTAIN_AVAILABLE_OFFERS');
  const seen=new Set();
  for(const offer of offers){
    if(offer===null||typeof offer!=='object'||Array.isArray(offer)
      ||Object.getPrototypeOf(offer)!==Object.prototype
      ||typeof offer.type!=='string'||!['Small','Medium','Large','ExtraLarge'].includes(offer.type)
      ||seen.has(offer.type))invalid('INVALID_LOAN_OBTAIN_AVAILABLE_OFFERS');
    seen.add(offer.type);
    const keys=Object.keys(offer).sort().join(',');
    if(keys==='cooldownUntil,type'){
      if(!integer(offer.cooldownUntil,0))invalid('INVALID_LOAN_OBTAIN_AVAILABLE_OFFERS');
    }else if(keys==='amount,birthDay,duration,percentage,type'){
      if(!Number.isSafeInteger(offer.amount)||offer.amount<=0
        ||!integer(offer.duration,1)||!integer(offer.birthDay,0)
        ||typeof offer.percentage!=='number'||!Number.isFinite(offer.percentage)
        ||offer.percentage<=0||offer.percentage>1
        ||Math.round(offer.percentage*1e6)/1e6!==offer.percentage)
        invalid('INVALID_LOAN_OBTAIN_AVAILABLE_OFFERS');
    }else invalid('INVALID_LOAN_OBTAIN_AVAILABLE_OFFERS');
  }
}
function validateOffers(command,availableLoans){
  try{return assertMatchingLoanOffer(command.payload,availableLoans);}
  catch(error){invalid(error?.message==='LOAN_OFFER_NOT_CURRENT'
    ?'LOAN_OBTAIN_OFFER_NOT_CURRENT':'INVALID_LOAN_OBTAIN_AVAILABLE_OFFERS');}
}
function sharedFacts(held){
  return {roundId:held.roundId,hostSequence:held.hostSequence,
    scheduledUpdate:held.scheduledUpdate,targetCompanyEntity:held.targetCompanyEntity,
    heldGameTime:held.heldGameTime,freeId:held.freeId,monthDuration:held.monthDuration,
    availableLoans:clone(held.availableLoans),loanStateHash:held.loanStateHash};
}

export function loanObtainSharedFacts(held){
  validateHeld(held);
  return freeze(sharedFacts(held));
}

export function parseLoanObtainHeld(payload,command,roundId){
  const cmd=commandFacts(command,roundId);
  validateHeld(payload);
  if(payload.roundId!==roundId||payload.hostSequence!==cmd.hostSequence
    ||payload.scheduledUpdate!==cmd.scheduledUpdate
    ||payload.targetCompanyEntity!==cmd.targetCompanyEntity)
    invalid('LOAN_OBTAIN_HELD_COMMAND_MISMATCH');
  validateOffers(command,payload.availableLoans);
  return freeze({roundId:payload.roundId,hostSequence:payload.hostSequence,
    scheduledUpdate:payload.scheduledUpdate,companyEntity:payload.companyEntity,
    targetCompanyEntity:payload.targetCompanyEntity,heldGameTime:payload.heldGameTime,
    freeId:payload.freeId,monthDuration:payload.monthDuration,
    availableLoans:clone(payload.availableLoans),loanStateHash:payload.loanStateHash});
}

export function createLoanObtainAuthorization(held,cooldownMonths){
  validateHeld(held);
  if(!integer(cooldownMonths,4,8))invalid('INVALID_LOAN_OBTAIN_COOLDOWN_MONTHS');
  const cooldownUntil=held.heldGameTime+cooldownMonths*held.monthDuration;
  if(!integer(cooldownUntil,0,MAX_ENTITY))invalid('LOAN_OBTAIN_COOLDOWN_OVERFLOW');
  const shared=sharedFacts(held);
  return freeze({...shared,cooldownUntil,authorizationHash:sha256Canonical({...shared,cooldownUntil})});
}

export function parseLoanObtainAuthorization(payload,command,roundId){
  const cmd=commandFacts(command,roundId);
  if(!exact(payload,AUTH_FIELDS))invalid('INVALID_LOAN_OBTAIN_AUTHORIZATION');
  const held={roundId:payload.roundId,hostSequence:payload.hostSequence,
    scheduledUpdate:payload.scheduledUpdate,companyEntity:payload.targetCompanyEntity,
    targetCompanyEntity:payload.targetCompanyEntity,heldGameTime:payload.heldGameTime,
    freeId:payload.freeId,monthDuration:payload.monthDuration,
    availableLoans:payload.availableLoans,loanStateHash:payload.loanStateHash};
  validateHeld(held);
  if(payload.roundId!==roundId||payload.hostSequence!==cmd.hostSequence
    ||payload.scheduledUpdate!==cmd.scheduledUpdate
    ||payload.targetCompanyEntity!==cmd.targetCompanyEntity)
    invalid('LOAN_OBTAIN_AUTHORIZATION_COMMAND_MISMATCH');
  validateOffers(command,payload.availableLoans);
  if(!integer(payload.cooldownUntil,0,MAX_ENTITY))invalid('INVALID_LOAN_OBTAIN_COOLDOWN');
  const cooldownDelta=payload.cooldownUntil-payload.heldGameTime;
  if(cooldownDelta<0||cooldownDelta%payload.monthDuration!==0
    ||cooldownDelta/payload.monthDuration<4||cooldownDelta/payload.monthDuration>8)
    invalid('INVALID_LOAN_OBTAIN_COOLDOWN');
  const {authorizationHash,...unsigned}=payload;
  if(!HASH.test(authorizationHash??'')||sha256Canonical(unsigned)!==authorizationHash)
    invalid('LOAN_OBTAIN_AUTHORIZATION_HASH_MISMATCH');
  return freeze({...clone(payload)});
}

// Packet-level validation is independent of the retained command. The Host
// and participant still compare these facts with that command and their roster.
export function validateLoanObtainWirePayload(kind,payload){
  if(kind==='loan_obtain_held')return loanObtainSharedFacts(payload);
  if(kind!=='loan_obtain_authorize'||!exact(payload,AUTH_FIELDS))invalid('INVALID_LOAN_OBTAIN_WIRE_PAYLOAD');
  const held={...Object.fromEntries(SHARED_FIELDS.map(key=>[key,payload[key]])),
    companyEntity:payload.targetCompanyEntity};
  validateHeld(held);
  const months=(payload.cooldownUntil-payload.heldGameTime)/payload.monthDuration;
  const expected=createLoanObtainAuthorization(held,months);
  if(sha256Canonical(payload)!==sha256Canonical(expected))invalid('INVALID_LOAN_OBTAIN_WIRE_AUTHORIZATION');
  return expected;
}
