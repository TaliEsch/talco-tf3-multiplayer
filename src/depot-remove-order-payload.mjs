const entity=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;

export function parseDepotRemoveOrderPayload(value,companyEntity,depotEntity){
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||Object.getPrototypeOf(value)!==Object.prototype
    ||Object.keys(value).sort().join(',')!=='companyEntity,depotEntity'
    ||!entity(companyEntity)||!entity(depotEntity)
    ||!entity(value.companyEntity)||!entity(value.depotEntity)
    ||value.companyEntity!==companyEntity||value.depotEntity!==depotEntity)
    throw new TypeError('INVALID_DEPOT_REMOVE_ORDER_PAYLOAD');
  return Object.freeze({companyEntity:value.companyEntity,depotEntity:value.depotEntity});
}
