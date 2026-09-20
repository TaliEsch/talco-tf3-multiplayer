import {parseRoadStopCapture,ROAD_STOP_CAPTURE_MAX_BYTES} from './road-stop-capture.mjs';

// Diagnostic userdata transport only. Do not widen the gameplay IPC parser's
// 4096-byte/identifier-only contract to accommodate these larger captures.
export const ROAD_STOP_ENVELOPE_MAX_BYTES=2*ROAD_STOP_CAPTURE_MAX_BYTES+2048;
const reject=()=>{throw new TypeError('INVALID_ROAD_STOP_CAPTURE_ENVELOPE');};

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
    if(!['schemaVersion','observerRevision','kind','stage','sequence','captureHex'].includes(match[1]))reject();
    fields[match[1]]=match[2]??Number(match[3]);offset=token.lastIndex;
  }
  if(Object.keys(fields).length!==6||fields.schemaVersion!==1||fields.observerRevision!==7
    ||fields.kind!=='native_road_stop_capture'||!['create','apply'].includes(fields.stage)
    ||!Number.isInteger(fields.sequence)||fields.sequence<1||fields.sequence>16
    ||typeof fields.captureHex!=='string'||fields.captureHex.length>2*ROAD_STOP_CAPTURE_MAX_BYTES
    ||fields.captureHex.length%2!==0||! /^[0-9a-f]+$/.test(fields.captureHex))reject();
  let json;
  try{json=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(fields.captureHex,'hex'));}catch{reject();}
  let parsed;
  try{parsed=parseRoadStopCapture(json);}catch{reject();}
  return {observerRevision:7,stage:fields.stage,sequence:fields.sequence,...parsed,
    freshnessVerified:false,reconstructionVerified:false,executionAuthorized:false};
}
