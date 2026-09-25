// One already-owned ROAD vehicle and one already-owned ROAD line.
const entity=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
export function parseVehicleLineAssignOrderPayload(value,companyEntity,vehicleEntity){
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||Object.getPrototypeOf(value)!==Object.prototype
    ||Object.keys(value).sort().join(',')!=='companyEntity,lineEntity,vehicleEntity'
    ||!entity(companyEntity)||!entity(vehicleEntity)||!entity(value.lineEntity)
    ||value.companyEntity!==companyEntity||value.vehicleEntity!==vehicleEntity
    ||value.lineEntity===vehicleEntity)throw new TypeError('INVALID_VEHICLE_LINE_ASSIGN_PAYLOAD');
  return Object.freeze({companyEntity,vehicleEntity,lineEntity:value.lineEntity});
}
