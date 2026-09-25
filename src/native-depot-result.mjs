// Post-execution accounting boundary for native-priced placement. No GUI quote
// is required. Input must come from the engine adapter, not a client assertion.
// This cannot authorize spending or prove pre-execution funds enforcement.
const money=n=>Number.isSafeInteger(n);
const entity=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)
  &&Object.keys(v).sort().join(',')===keys.split(',').sort().join(',');
export function verifyNativeDepotResult(binding,before,receipt){
  const unknown=()=>Object.freeze({outcome:'unknown',code:'NATIVE_BUILD_UNVERIFIED'});
  if(!binding||!entity(binding.originalCompany)||!entity(binding.targetCompany)
    ||binding.originalCompany===binding.targetCompany||typeof binding.resource!=='string'
    ||typeof binding.sessionId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(binding.sessionId)
    ||!entity(binding.actionId)||typeof binding.consentId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(binding.consentId)
    ||!exact(before,'originalBalance,targetBalance')||!money(before.originalBalance)
    ||!money(before.targetBalance))return unknown();
  if(!exact(receipt,'actionId,chargedCost,code,consentId,constructionEntity,constructionMembershipPreserved,constructionOwner,depotEntity,depotMembershipPreserved,depotOwner,originalAfter,originalBefore,originalCompany,outcome,resource,sessionId,targetAfter,targetBefore,targetCompany')
    ||receipt.outcome!=='verified'||receipt.code!=='NATIVE_BUILD_ACCOUNTING_VERIFIED'
    ||receipt.sessionId!==binding.sessionId||receipt.actionId!==binding.actionId||receipt.consentId!==binding.consentId
    ||receipt.originalCompany!==binding.originalCompany||receipt.targetCompany!==binding.targetCompany
    ||receipt.resource!==binding.resource
    ||receipt.constructionMembershipPreserved!==true||receipt.depotMembershipPreserved!==true
    ||!entity(receipt.constructionEntity)||!entity(receipt.depotEntity)
    ||new Set([binding.originalCompany,binding.targetCompany,receipt.constructionEntity,receipt.depotEntity]).size!==4
    ||receipt.constructionOwner!==binding.targetCompany||receipt.depotOwner!==binding.targetCompany
    ||!money(receipt.chargedCost)||receipt.chargedCost<=0
    ||!money(receipt.originalBefore)||!money(receipt.targetBefore)
    ||!money(receipt.originalAfter)||!money(receipt.targetAfter)
    ||receipt.originalBefore!==before.originalBalance||receipt.targetBefore!==before.targetBalance
    ||receipt.originalAfter!==before.originalBalance
    ||receipt.targetAfter!==before.targetBalance-receipt.chargedCost)return unknown();
  return Object.freeze({outcome:'verified',companyEntity:binding.targetCompany,
    constructionEntity:receipt.constructionEntity,depotEntity:receipt.depotEntity,
    chargedCost:receipt.chargedCost});
}
