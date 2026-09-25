// The bounded command body for the TF3 build-40396 SimpleStreetProposal path.
// Authorization and engine completion are separate from parsing this data.
export const ROAD_STOP_MODEL = '::/stations/street/small_stops/small_mid.mdl';

const entity = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
const fields = ['edgeEntity','companyEntity','param','left','oneWay','model','name'];

export function parseRoadStopOrderPayload(value, edgeEntity, companyEntity) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join(',') !== [...fields].sort().join(',')
    || !entity(edgeEntity) || !entity(companyEntity)
    || value.edgeEntity !== edgeEntity || value.companyEntity !== companyEntity
    || typeof value.param !== 'number' || !Number.isFinite(value.param)
    || value.param < 0 || value.param > 1 || Object.is(value.param,-0)
    || typeof value.left !== 'boolean' || typeof value.oneWay !== 'boolean'
    || value.model !== ROAD_STOP_MODEL
    || typeof value.name !== 'string' || Buffer.byteLength(value.name,'utf8') > 1024
    || Buffer.from(value.name,'utf8').toString('utf8') !== value.name
    || value.name.includes('\0')) throw new TypeError('INVALID_ROAD_STOP_ORDER_PAYLOAD');
  return Object.freeze(Object.fromEntries(fields.map(key => [key,value[key]])));
}

// The coordination mailbox deliberately has a small scalar Lua parser. Carry
// UTF-8 as fixed-size hexadecimal identifiers and the exact JS number spelling
// as an identifier string; neither requires executable or nested Lua input.
export function encodeRoadStopFlat(value, edgeEntity, companyEntity) {
  const payload=parseRoadStopOrderPayload(value,edgeEntity,companyEntity);
  const hex=Buffer.from(payload.name,'utf8').toString('hex');
  const chunks=hex.match(/.{1,128}/g)??[];
  return Object.freeze({paramText:String(payload.param),left:payload.left,oneWay:payload.oneWay,
    nameChunkCount:chunks.length,
    ...Object.fromEntries(chunks.map((chunk,index)=>[`nameChunk${index+1}`,chunk]))});
}

export function decodeRoadStopFlat(value) {
  if (!value || !Number.isSafeInteger(value.nameChunkCount)
    || value.nameChunkCount < 0 || value.nameChunkCount > 16
    || typeof value.paramText !== 'string' || !/^(?:0|1|0\.[0-9]+|[0-9]+(?:\.[0-9]+)?e-[0-9]+)$/.test(value.paramText))
    throw new TypeError('INVALID_ROAD_STOP_ORDER_WIRE');
  let hex='';
  for(let index=1;index<=value.nameChunkCount;index++){
    const chunk=value[`nameChunk${index}`];
    if(typeof chunk!=='string'||chunk.length<2||chunk.length>128||chunk.length%2!==0
      ||!/^[0-9a-f]+$/.test(chunk)||index<value.nameChunkCount&&chunk.length!==128)
      throw new TypeError('INVALID_ROAD_STOP_ORDER_WIRE');
    hex+=chunk;
  }
  const param=Number(value.paramText);
  if(String(param)!==value.paramText)throw new TypeError('INVALID_ROAD_STOP_ORDER_WIRE');
  const name=Buffer.from(hex,'hex').toString('utf8');
  try{return parseRoadStopOrderPayload({edgeEntity:value.entity,companyEntity:value.companyEntity,
    param,left:value.left,oneWay:value.oneWay,model:ROAD_STOP_MODEL,name},
    value.entity,value.companyEntity);}
  catch{throw new TypeError('INVALID_ROAD_STOP_ORDER_WIRE');}
}
