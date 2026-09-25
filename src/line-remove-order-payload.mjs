const entity=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;

export function parseLineRemoveOrderPayload(value,companyEntity,lineEntity){
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||Object.getPrototypeOf(value)!==Object.prototype
    ||Object.keys(value).sort().join(',')!=='companyEntity,lineEntity'
    ||!entity(companyEntity)||!entity(lineEntity)
    ||value.companyEntity!==companyEntity||value.lineEntity!==lineEntity)
    throw new TypeError('INVALID_LINE_REMOVE_ORDER_PAYLOAD');
  return Object.freeze({companyEntity,lineEntity});
}
