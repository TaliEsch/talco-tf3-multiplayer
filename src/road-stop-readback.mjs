import {sha256Canonical} from './canonical.mjs';

// This accepts copied userdata only.  It is deliberately not an admission,
// replay, or engine-execution format.
export const ROAD_STOP_READBACK_MAX_BYTES=140*1024;
export const ROAD_STOP_READBACK_SNAPSHOT_MAX_BYTES=64*1024;
const reject=()=>{throw new TypeError('INVALID_ROAD_STOP_READBACK');};
const exact=(value,keys)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))reject();
  const actual=Object.keys(value).sort(),expected=[...keys].sort();
  if(actual.length!==expected.length||actual.some((key,index)=>key!==expected[index]))reject();
};
const positive=(value)=>{
  if(!Number.isInteger(value)||value<1||value>2147483647)reject();
  return value;
};
const clock=(value)=>{
  if(!Number.isInteger(value)||value<0||value>2147483647)reject();
  return value;
};
const finite=(value)=>{
  if(typeof value!=='number'||!Number.isFinite(value))reject();
  return Object.is(value,-0)?0:value;
};
const safe=(value)=>{
  finite(value);if(!Number.isSafeInteger(value))reject();return value;
};

// JSON.parse does not report duplicate object names.  The small parser below
// does, and only implements JSON (never Lua or JavaScript evaluation).
function strictJson(source){
  let at=0;
  const ws=()=>{while(/[ \t\r\n]/.test(source[at]??''))at++;};
  const string=()=>{
    const start=at++;let escaped=false;
    while(at<source.length){const c=source[at++];
      if(c==='"'&&!escaped){try{return JSON.parse(source.slice(start,at));}catch{reject();}}
      if(c==='\\'){if(at>=source.length)reject();const e=source[at++];
        if(!'"\\/bfnrtu'.includes(e))reject();
        if(e==='u'){const hex=source.slice(at,at+4);if(!/^[0-9a-fA-F]{4}$/.test(hex))reject();at+=4;}
        escaped=false;
      }else if(c.charCodeAt(0)<32)reject();
    }reject();
  };
  const value=(depth,state)=>{if(depth>64||++state.nodes>4096)reject();ws();const c=source[at];
    if(c==='"')return string();
    if(c==='{'){at++;ws();const out=Object.create(null);if(source[at]==='}'){at++;return out;}
      while(true){ws();if(source[at]!=='"')reject();const key=string();ws();if(source[at++]!==':')reject();
        if(Object.hasOwn(out,key))reject();out[key]=value(depth+1,state);ws();if(source[at]==='}'){at++;return out;}if(source[at++]!==',')reject();}
    }
    if(c==='['){at++;ws();const out=[];if(source[at]===']'){at++;return out;}while(true){out.push(value(depth+1,state));ws();if(source[at]===']'){at++;return out;}if(source[at++]!==',')reject();}}
    if(source.startsWith('true',at)){at+=4;return true;}if(source.startsWith('false',at)){at+=5;return false;}if(source.startsWith('null',at)){at+=4;return null;}
    const match=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(at));
    if(!match)reject();at+=match[0].length;const n=Number(match[0]);if(!Number.isFinite(n))reject();return n;
  };
  const result=value(0,{nodes:0});ws();if(at!==source.length)reject();return result;
}

function resource(value){
  if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>1024
    ||! /^(?:::\/)?(?:[A-Za-z0-9_][A-Za-z0-9_.-]*)(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/.test(value)
    ||value.replace(/^::\//,'').split('/').some(part=>part==='.'||part==='..'))reject();
  return value;
}
function tagged(value,depth,state){
  state.nodes++;if(state.nodes>256||depth>4)reject();
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.kind!=='string')reject();
  if(value.kind==='number'){exact(value,['kind','value']);if(typeof value.value!=='number'||!Number.isFinite(value.value)
      ||(Number.isInteger(value.value)&&!Number.isSafeInteger(value.value)))reject();return {kind:'number',value:Object.is(value.value,-0)?0:value.value};}
  if(value.kind==='boolean'){exact(value,['kind','value']);if(typeof value.value!=='boolean')reject();return {kind:'boolean',value:value.value};}
  if(value.kind==='string'){exact(value,['kind','value']);if(typeof value.value!=='string'||Buffer.byteLength(value.value,'utf8')>1024)reject();return {kind:'string',value:value.value};}
  if(value.kind!=='table')reject();exact(value,['kind','entries']);if(!Array.isArray(value.entries)||value.entries.length>64)reject();
  const entries=value.entries.map(entry=>{
    exact(entry,['keyType','key','value']);let key;
    if(entry.keyType==='string'){if(typeof entry.key!=='string'||Buffer.byteLength(entry.key,'utf8')>128||!/^[A-Za-z0-9_]+$/.test(entry.key))reject();key=entry.key;}
    else if(entry.keyType==='number')key=safe(entry.key);else reject();
    return {keyType:entry.keyType,key,value:tagged(entry.value,depth+1,state)};
  });
  entries.sort((a,b)=>a.keyType!==b.keyType?a.keyType==='number'?-1:1:(a.key<b.key?-1:a.key>b.key?1:0));
  if(entries.some((entry,index)=>index&&entry.keyType===entries[index-1].keyType&&entry.key===entries[index-1].key))reject();
  return {kind:'table',entries};
}
function snapshot(value){
  exact(value,['schemaVersion','kind','nonce','observationId','companyEntity','updateCount','tickCount','stopEntity','edgeEntity','param','transform','constructionResource','oneWay','name','left','params']);
  if(value.schemaVersion!==1||value.kind!=='road_stop_readback'||typeof value.nonce!=='string'||!/^[0-9a-f]{32}$/.test(value.nonce))reject();
  const observationId=positive(value.observationId),companyEntity=positive(value.companyEntity),stopEntity=positive(value.stopEntity),edgeEntity=positive(value.edgeEntity);
  const updateCount=clock(value.updateCount),tickCount=clock(value.tickCount),param=finite(value.param);
  if(param<0||param>1||!Array.isArray(value.transform)||value.transform.length!==16)reject();
  if(value.params?.kind!=='table')reject();
  if(typeof value.oneWay!=='boolean'||typeof value.left!=='boolean'||typeof value.name!=='string'||Buffer.byteLength(value.name,'utf8')>1024)reject();
  return {schemaVersion:1,kind:'road_stop_readback',nonce:value.nonce,observationId,companyEntity,updateCount,tickCount,stopEntity,edgeEntity,param,
    transform:value.transform.map(finite),constructionResource:resource(value.constructionResource),oneWay:value.oneWay,name:value.name,left:value.left,params:tagged(value.params,0,{nodes:0})};
}

export function parseRoadStopReadbackEnvelope(source){
  if(typeof source!=='string'||Buffer.byteLength(source,'utf8')>ROAD_STOP_READBACK_MAX_BYTES)reject();
  const wrapper=/^\s*function\s+data\s*\(\s*\)\s*return\s*\{([\s\S]*?)\}\s*end\s*$/.exec(source);if(!wrapper)reject();
  const fields=Object.create(null),body=wrapper[1];let offset=0;
  const token=/\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(?:'([^']*)'|"([^"]*)"|(0|[1-9][0-9]*))\s*,/y;
  while(offset<body.length){if(body.slice(offset).trim()==='')break;token.lastIndex=offset;const match=token.exec(body);
    if(!match||Object.hasOwn(fields,match[1])||!['schemaVersion','kind','nonce','observationId','snapshotHex'].includes(match[1]))reject();
    fields[match[1]]=match[2]??match[3]??Number(match[4]);offset=token.lastIndex;
  }
  exact(fields,['schemaVersion','kind','nonce','observationId','snapshotHex']);
  if(fields.schemaVersion!==1||fields.kind!=='road_stop_readback'||typeof fields.nonce!=='string'||!/^[0-9a-f]{32}$/.test(fields.nonce)||!Number.isInteger(fields.observationId)||fields.observationId<1||fields.observationId>2147483647||typeof fields.snapshotHex!=='string'||!fields.snapshotHex.length||fields.snapshotHex.length%2||!/^[0-9a-f]+$/.test(fields.snapshotHex)||fields.snapshotHex.length>2*ROAD_STOP_READBACK_SNAPSHOT_MAX_BYTES)reject();
  let json;try{json=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(fields.snapshotHex,'hex'));}catch{reject();}
  if(Buffer.byteLength(json,'utf8')>ROAD_STOP_READBACK_SNAPSHOT_MAX_BYTES)reject();
  const result=snapshot(strictJson(json));
  if(result.nonce!==fields.nonce||result.observationId!==fields.observationId)reject();
  return {snapshot:result,digest:sha256Canonical(result),executionAuthorized:false};
}
