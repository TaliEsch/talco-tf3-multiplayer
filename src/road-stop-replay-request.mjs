import {parseRoadStopReplayCase} from './road-stop-replay-case.mjs';

// This is a data codec for a future local adapter.  It does not write a
// userdata file, schedule work, or treat the replay-case digest as authority.
export const ROAD_STOP_REPLAY_REQUEST_MAX_BYTES=1024*1024;
const MAX_DEPTH=32;
const MAX_NODES=20000;
const fail=()=>{throw new TypeError('INVALID_ROAD_STOP_REPLAY_REQUEST');};
const nonce=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const positiveInt32=value=>Number.isInteger(value)&&value>0&&value<=2147483647;
const tick=value=>Number.isInteger(value)&&value>=0&&value<=2147483647;
const plainObject=value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  return prototype===Object.prototype||prototype===null;
};

function luaString(value){
  if(typeof value!=='string')fail();
  for(let index=0;index<value.length;index++){
    const unit=value.charCodeAt(index);
    if(unit>=0xD800&&unit<=0xDBFF){
      if(++index>=value.length||value.charCodeAt(index)<0xDC00||value.charCodeAt(index)>0xDFFF)fail();
    }else if(unit>=0xDC00&&unit<=0xDFFF)fail();
  }
  let encoded='"';
  for(const byte of Buffer.from(value,'utf8')){
    // Decimal escapes are understood by the Lua versions used by TF3.  Always
    // emitting three digits keeps an escape distinct from a following digit.
    if(byte===34)encoded+='\\"';
    else if(byte===92)encoded+='\\\\';
    else if(byte>=32&&byte<=126)encoded+=String.fromCharCode(byte);
    else encoded+=`\\${String(byte).padStart(3,'0')}`;
  }
  return encoded+'"';
}

function luaData(value){
  let nodes=0;
  const visit=(entry,depth)=>{
    if(++nodes>MAX_NODES||depth>MAX_DEPTH)fail();
    // The normalized capture uses null only for optional object components.
    // Lua's nil is the corresponding data-only representation for those.
    if(entry===null)return 'nil';
    if(typeof entry==='string')return luaString(entry);
    if(typeof entry==='number'){
      if(!Number.isFinite(entry))fail();
      return Object.is(entry,-0)?'0':String(entry);
    }
    if(typeof entry==='boolean')return entry?'true':'false';
    if(Array.isArray(entry))return `{${entry.map((item,index)=>{
      visit(index+1,depth+1); // Lua scans the generated numeric key too.
      return visit(item,depth+1);
    }).join(',')}}`;
    if(!plainObject(entry))fail();
    const fields=Object.keys(entry);
    if(fields.some(key=>!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)))fail();
    return `{${fields.map(key=>{
      visit(key,depth+1); // Match the dispatcher's key-and-item traversal.
      return `${key}=${visit(entry[key],depth+1)}`;
    }).join(',')}}`;
  };
  return visit(value,0);
}

function options(value){
  if(!plainObject(value)
    ||Object.keys(value).sort().join(',')!=='confirmedCheckpointReloaded,expiresTick,issuedTick,nonce,requestId')fail();
  if(value.confirmedCheckpointReloaded!==true||!nonce(value.nonce)||!positiveInt32(value.requestId)
    ||!tick(value.issuedTick)||!tick(value.expiresTick)||value.expiresTick<=value.issuedTick
    ||value.expiresTick-value.issuedTick>300)fail();
  return value;
}

export function createRoadStopReplayRequest(source,requestOptions){
  const replay=parseRoadStopReplayCase(source);
  const checked=options(requestOptions);
  const request={schemaVersion:1,kind:'native_road_stop_replay',nonce:checked.nonce,requestId:checked.requestId,
    issuedTick:checked.issuedTick,expiresTick:checked.expiresTick,confirmed:1,caseDigest:replay.digest,
    capture:replay.case.capture,modelResource:replay.case.modelResource,targetCompany:replay.case.companyEntity,
    sessionId:checked.nonce,actionId:checked.requestId,consentId:`replay_${checked.requestId}`};
  const lua=`function data()\nreturn ${luaData(request)}\nend\n`;
  if(Buffer.byteLength(lua,'utf8')>ROAD_STOP_REPLAY_REQUEST_MAX_BYTES)fail();
  return {request:Object.freeze(request),lua};
}
