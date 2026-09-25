// Stock road depot only. This is an intent, never a native cost or authority
// claim; game-side validation and its observed postcondition are separate.
export const ROAD_DEPOT_RESOURCE='::/depots/road/road_depot/road_depot.con';
const entity=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
const finite=(n,bound)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=bound&&!Object.is(n,-0);
const fields=['companyEntity','resource','x','y','z','yaw','seed'];

export function parseDepotBuildOrderPayload(value,companyEntity){
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||Object.getPrototypeOf(value)!==Object.prototype
    ||Object.keys(value).sort().join(',')!==[...fields].sort().join(',')
    ||!entity(companyEntity)||value.companyEntity!==companyEntity
    ||value.resource!==ROAD_DEPOT_RESOURCE||!entity(value.seed)
    ||!finite(value.x,100000)||!finite(value.y,100000)
    ||!finite(value.z,10000)||!finite(value.yaw,Math.PI+0.000001))
    throw new TypeError('INVALID_DEPOT_BUILD_ORDER_PAYLOAD');
  return Object.freeze(Object.fromEntries(fields.map(key=>[key,value[key]])));
}

// The coordination mailbox accepts identifier strings and integers only.
// Carry canonical number spellings; the stock resource is implicit on the wire.
export function encodeDepotBuildFlat(value,companyEntity){
  const p=parseDepotBuildOrderPayload(value,companyEntity);
  return Object.freeze({xText:String(p.x),yText:String(p.y),zText:String(p.z),
    yawText:String(p.yaw),seed:p.seed});
}

export function decodeDepotBuildFlat(value){
  const numeric={};
  for(const [key,textKey] of [['x','xText'],['y','yText'],['z','zText'],['yaw','yawText']]){
    const text=value?.[textKey];
    if(typeof text!=='string'||!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e-[0-9]+)?$/.test(text))
      throw new TypeError('INVALID_DEPOT_BUILD_ORDER_WIRE');
    numeric[key]=Number(text);
    if(String(numeric[key])!==text)throw new TypeError('INVALID_DEPOT_BUILD_ORDER_WIRE');
  }
  return parseDepotBuildOrderPayload({companyEntity:value.companyEntity,
    resource:ROAD_DEPOT_RESOURCE,...numeric,seed:value.seed},value.companyEntity);
}
