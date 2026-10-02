import {decodeLoanObtainFlat} from './loan-obtain-order-payload.mjs';

const MAX_SAFE=Number.MAX_SAFE_INTEGER;
const MAX_COMPANY=2147483647;
const NONCE=/^[0-9a-f]{32}$/;
const IDENTIFIER=/^[A-Za-z0-9_.:-]{1,128}$/;
const OFFER_TYPES=new Set(['Small','Medium','Large','ExtraLarge']);
const BASE_FIELDS=['schemaVersion','kind','status','nonce','roundId','companyEntity','counter',
  'tickCount','updateCount','gameTime','freeId','obtainedLoanCount','offerCount'];

function invalid(reason){throw new TypeError(`INVALID_LOAN_OFFER_OBSERVATION:${reason}`);}
function safeInteger(value,min=0,max=MAX_SAFE){return Number.isSafeInteger(value)&&value>=min&&value<=max;}
function exactKeys(value,expected){
  const actual=Object.keys(value).sort(),wanted=[...expected].sort();
  return actual.length===wanted.length&&actual.every((key,index)=>key===wanted[index]);
}
function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validateContext(context){
  if(context===null||typeof context!=='object'||Array.isArray(context)
    ||!exactKeys(context,['expectedNonce','expectedCompanyEntity','expectedRoundId','expectedUpdateCount'])
    ||!NONCE.test(context.expectedNonce??'')
    ||!safeInteger(context.expectedCompanyEntity,1,MAX_COMPANY)
    ||typeof context.expectedRoundId!=='string'||!IDENTIFIER.test(context.expectedRoundId)
    ||!safeInteger(context.expectedUpdateCount,0,MAX_COMPANY)) invalid('CONTEXT');
}

export function decodeLoanOfferObservation(value,context){
  validateContext(context);
  if(value===null||typeof value!=='object'||Array.isArray(value))invalid('RECORD');
  const baseCount=value.offerCount;
  if(!safeInteger(baseCount,0,4))invalid('OFFER_COUNT');
  const expected=[...BASE_FIELDS];
  const availableLoans=[];
  const seen=new Set();
  for(let index=1;index<=baseCount;index++){
    const prefix=`offer${index}`;
    const type=value[`${prefix}Type`],state=value[`${prefix}State`];
    if(typeof type!=='string'||!OFFER_TYPES.has(type)||seen.has(type))invalid('OFFER_IDENTITY');
    seen.add(type);
    if(state==='available'){
      expected.push(`${prefix}Type`,`${prefix}State`,`${prefix}Amount`,`${prefix}Duration`,
        `${prefix}PercentageMillionths`,`${prefix}BirthDay`);
      const raw={companyEntity:value.companyEntity,offerType:type,amount:value[`${prefix}Amount`],
        duration:value[`${prefix}Duration`],birthDay:value[`${prefix}BirthDay`],
        percentageMillionths:value[`${prefix}PercentageMillionths`]};
      if(!safeInteger(raw.amount,1)||!safeInteger(raw.duration,1)||!safeInteger(raw.birthDay)
        ||!safeInteger(raw.percentageMillionths,1,1000000))invalid('OFFER_FACTS');
      let offer;
      try{offer=decodeLoanObtainFlat(raw,context.expectedCompanyEntity);}
      catch{invalid('OFFER_FACTS');}
      availableLoans.push({type:offer.offerType,amount:offer.amount,duration:offer.duration,
        percentage:offer.percentage,birthDay:offer.birthDay});
    }else if(state==='cooldown'){
      expected.push(`${prefix}Type`,`${prefix}State`,`${prefix}CooldownUntil`);
      const cooldownUntil=value[`${prefix}CooldownUntil`];
      if(!safeInteger(cooldownUntil))invalid('COOLDOWN');
      availableLoans.push({type,cooldownUntil});
    }else invalid('OFFER_STATE');
  }
  if(!exactKeys(value,expected))invalid('FIELDS');
  if(value.schemaVersion!==1||value.kind!=='loan_offer_observation'||value.status!=='ok'
    ||value.nonce!==context.expectedNonce||value.roundId!==context.expectedRoundId
    ||value.companyEntity!==context.expectedCompanyEntity
    ||!safeInteger(value.counter,1,MAX_COMPANY)||!safeInteger(value.tickCount,0,MAX_COMPANY)
    ||!safeInteger(value.updateCount,0,MAX_COMPANY)||value.updateCount!==context.expectedUpdateCount
    ||!safeInteger(value.gameTime)||!safeInteger(value.freeId,0,MAX_COMPANY)
    ||!safeInteger(value.obtainedLoanCount,0,4))invalid('IDENTITY_OR_CLOCK');
  return deepFreeze({schemaVersion:1,kind:'loan_offer_observation',status:'ok',
    nonce:value.nonce,roundId:value.roundId,companyEntity:value.companyEntity,
    counter:value.counter,tickCount:value.tickCount,updateCount:value.updateCount,
    gameTime:value.gameTime,freeId:value.freeId,obtainedLoanCount:value.obtainedLoanCount,
    availableLoans});
}
