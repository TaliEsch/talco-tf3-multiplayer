// A bounded purchase intent. Cost and outcome are established by TF3, not by
// this request. depotEntity identifies the VEHICLE_DEPOT child.
const entity=value=>Number.isSafeInteger(value)&&value>0&&value<=2147483647;
const fields=['companyEntity','depotEntity','model'];

export function parseVehicleBuyOrderPayload(value,companyEntity,depotEntity){
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||Object.getPrototypeOf(value)!==Object.prototype
    ||Object.keys(value).sort().join(',')!==fields.join(',')
    ||!entity(companyEntity)||!entity(depotEntity)
    ||value.companyEntity!==companyEntity||value.depotEntity!==depotEntity
    ||typeof value.model!=='string'||value.model.length<5||value.model.length>256
    ||value.model.includes('..')
    ||!/^[A-Za-z0-9_.:/%-]+\.mdl$/.test(value.model))
    throw new TypeError('INVALID_VEHICLE_BUY_ORDER_PAYLOAD');
  return Object.freeze(Object.fromEntries(fields.map(key=>[key,value[key]])));
}
