// Captured stock-loan offer facts only. This module validates an intent; it
// does not regenerate offers, dispatch a loan event, or authorize a credit.
const company=value=>Number.isSafeInteger(value)&&value>0&&value<=2147483647;
const wholeNonnegative=value=>Number.isSafeInteger(value)&&value>=0;
const wholePositive=value=>Number.isSafeInteger(value)&&value>0;
const percentage=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=1;
const offerTypes=new Set(['Small','Medium','Large','ExtraLarge']);
const payloadFields=['amount','birthDay','companyEntity','duration','offerType','percentage'];
const offerFacts=['amount','birthDay','duration','percentage','type'];

function plainRecord(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)
    &&Object.getPrototypeOf(value)===Object.prototype;
}
function frozenFacts(value){
  return Object.freeze({companyEntity:value.companyEntity,offerType:value.offerType,
    amount:value.amount,duration:value.duration,percentage:value.percentage,birthDay:value.birthDay});
}

export function parseLoanObtainOrderPayload(value,expectedCompany){
  if(!plainRecord(value)||Object.keys(value).sort().join(',')!==payloadFields.join(',')
    ||!company(expectedCompany)||value.companyEntity!==expectedCompany
    ||!offerTypes.has(value.offerType)||!wholePositive(value.amount)||!wholePositive(value.duration)
    ||!percentage(value.percentage)||!wholeNonnegative(value.birthDay))
    throw new TypeError('INVALID_LOAN_OBTAIN_ORDER_PAYLOAD');
  return frozenFacts(value);
}

// Compare against one same-event snapshot of stock availableLoans. Spent slots
// may be represented by the stock script as {type,cooldownUntil}; retain their
// type uniqueness, but never infer that the cooldown has expired. The caller
// remains responsible for acquiring the live snapshot and rechecking it at
// execution; this helper only rejects stale or unsupported facts.
export function assertMatchingLoanOffer(value,availableLoans){
  const payload=parseLoanObtainOrderPayload(value,value?.companyEntity);
  if(!Array.isArray(availableLoans)||Object.getPrototypeOf(availableLoans)!==Array.prototype
    ||availableLoans.length>4||Object.keys(availableLoans).length!==availableLoans.length
    ||Object.keys(availableLoans).some((key,index)=>key!==String(index)))
    throw new TypeError('INVALID_LOAN_OFFER_SNAPSHOT');
  const seen=new Set();
  let match=null,selectedCooling=false;
  for(const offer of availableLoans){
    if(!plainRecord(offer))throw new TypeError('INVALID_LOAN_OFFER_SNAPSHOT');
    const keys=Object.keys(offer).sort();
    if(!offerTypes.has(offer.type))throw new TypeError('INVALID_LOAN_OFFER_SNAPSHOT');
    if(seen.has(offer.type))throw new TypeError('INVALID_LOAN_OFFER_SNAPSHOT');
    seen.add(offer.type);
    if(keys.length===2&&keys[0]==='cooldownUntil'&&keys[1]==='type'){
      if(!wholeNonnegative(offer.cooldownUntil))throw new TypeError('INVALID_LOAN_OFFER_SNAPSHOT');
      if(offer.type===payload.offerType)selectedCooling=true;
      continue;
    }
    if(keys.join(',')!==offerFacts.join(','))throw new TypeError('INVALID_LOAN_OFFER_SNAPSHOT');
    if(!wholePositive(offer.amount)||!wholePositive(offer.duration)
      ||!percentage(offer.percentage)||!wholeNonnegative(offer.birthDay))
      throw new TypeError('INVALID_LOAN_OFFER_SNAPSHOT');
    if(offer.type===payload.offerType){
      if(offer.amount!==payload.amount||offer.duration!==payload.duration
        ||offer.percentage!==payload.percentage||offer.birthDay!==payload.birthDay)
        throw new TypeError('LOAN_OFFER_NOT_CURRENT');
      match=offer;
    }
  }
  if(selectedCooling)throw new TypeError('LOAN_OFFER_NOT_CURRENT');
  if(match===null)throw new TypeError('LOAN_OFFER_NOT_CURRENT');
  return frozenFacts(payload);
}

// The existing userdata mailbox accepts integer scalars only. Preserve an
// exactly representable rate through that codec; never round changed terms.
export function encodeLoanObtainFlat(value,expectedCompany){
  const payload=parseLoanObtainOrderPayload(value,expectedCompany);
  const percentageMillionths=Math.round(payload.percentage*1000000);
  if(!Number.isSafeInteger(percentageMillionths)
    ||percentageMillionths/1000000!==payload.percentage)
    throw new TypeError('LOAN_RATE_NOT_EXACTLY_SERIALIZABLE');
  return Object.freeze({offerType:payload.offerType,amount:payload.amount,
    duration:payload.duration,birthDay:payload.birthDay,percentageMillionths});
}
export function decodeLoanObtainFlat(value,expectedCompany){
  if(!value||!Number.isSafeInteger(value.percentageMillionths)
    ||value.percentageMillionths<1||value.percentageMillionths>1000000)
    throw new TypeError('INVALID_LOAN_RATE_SCALAR');
  return parseLoanObtainOrderPayload({companyEntity:value.companyEntity,
    offerType:value.offerType,amount:value.amount,duration:value.duration,
    percentage:value.percentageMillionths/1000000,birthDay:value.birthDay},expectedCompany);
}
