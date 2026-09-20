import {parseRoadStopCapture,ROAD_STOP_CAPTURE_MAX_BYTES} from './road-stop-capture.mjs';

// Diagnostic userdata transport only. Do not widen the gameplay IPC parser's
// 4096-byte/identifier-only contract to accommodate these larger captures.
export const ROAD_STOP_ENVELOPE_MAX_BYTES=2*ROAD_STOP_CAPTURE_MAX_BYTES+4096;
const reject=()=>{throw new TypeError('INVALID_ROAD_STOP_CAPTURE_ENVELOPE');};
function modelResource(value){
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||Object.keys(value).length!==2||Object.keys(value).sort().join(',')!=='modelId,resourceName'
    ||!Number.isInteger(value.modelId)||value.modelId<0||value.modelId>2147483647
    ||typeof value.resourceName!=='string'||Buffer.byteLength(value.resourceName,'utf8')>1024
    ||!/^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)*\.mdl$/.test(value.resourceName))reject();
  return {...value};
}

export function parseRoadStopCaptureEnvelope(source){
  if(typeof source!=='string'||Buffer.byteLength(source,'utf8')>ROAD_STOP_ENVELOPE_MAX_BYTES)reject();
  const wrapper=/^\s*function\s+data\s*\(\s*\)\s*return\s*\{([\s\S]*?)\}\s*end\s*$/.exec(source);
  if(!wrapper)reject();
  const body=wrapper[1],fields=Object.create(null);
  const token=/\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(?:"([A-Za-z0-9_]+)"|(0|[1-9][0-9]*))\s*,/y;
  let offset=0;
  while(offset<body.length){
    if(body.slice(offset).trim()==='')break;
    token.lastIndex=offset;const match=token.exec(body);
    if(!match||Object.hasOwn(fields,match[1]))reject();
    if(!['schemaVersion','observerRevision','kind','stage','sequence','captureHex','modelNameHex'].includes(match[1]))reject();
    fields[match[1]]=match[2]??Number(match[3]);offset=token.lastIndex;
  }
  const version=fields.schemaVersion;
  if(Object.keys(fields).length!==(version===1?6:7)||![1,2].includes(version)||fields.observerRevision!==7
    ||fields.kind!=='native_road_stop_capture'||!['create','apply'].includes(fields.stage)
    ||!Number.isInteger(fields.sequence)||fields.sequence<1||fields.sequence>16
    ||typeof fields.captureHex!=='string'||fields.captureHex.length>2*ROAD_STOP_CAPTURE_MAX_BYTES
    ||fields.captureHex.length%2!==0||! /^[0-9a-f]+$/.test(fields.captureHex)
    ||version===2&&(typeof fields.modelNameHex!=='string'||!fields.modelNameHex.length||fields.modelNameHex.length>2048
      ||fields.modelNameHex.length%2!==0||!/^[0-9a-f]+$/.test(fields.modelNameHex)))reject();
  let json;
  try{json=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(fields.captureHex,'hex'));}catch{reject();}
  let parsed;
  try{parsed=parseRoadStopCapture(json);}catch{reject();}
  let resource;
  if(version===2){
    let resourceName;try{resourceName=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(fields.modelNameHex,'hex'));}catch{reject();}
    try{resource=modelResource({modelId:parsed.capture.proposal.street.edgeObjectsToAdd[0].modelInstance.modelId,resourceName});}catch{reject();}
  }
  return {observerRevision:7,stage:fields.stage,sequence:fields.sequence,...parsed,...(resource?{modelResource:resource}:{}),
    freshnessVerified:false,reconstructionVerified:false,executionAuthorized:false};
}
