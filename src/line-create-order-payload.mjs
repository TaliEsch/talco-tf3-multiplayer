// One owned ROAD line between two existing station entities. No caller-owned
// group, terminal, price or payer fields cross this boundary.
const entity=value=>Number.isSafeInteger(value)&&value>0&&value<=2147483647;
const fields=['companyEntity','stationA','stationB'];

export function parseLineCreateOrderPayload(value,companyEntity,stationA){
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||Object.getPrototypeOf(value)!==Object.prototype
    ||Object.keys(value).sort().join(',')!==fields.join(',')
    ||!entity(companyEntity)||!entity(stationA)||!entity(value.stationB)
    ||stationA===value.stationB||value.companyEntity!==companyEntity
    ||value.stationA!==stationA)
    throw new TypeError('INVALID_LINE_CREATE_ORDER_PAYLOAD');
  return Object.freeze(Object.fromEntries(fields.map(key=>[key,value[key]])));
}
