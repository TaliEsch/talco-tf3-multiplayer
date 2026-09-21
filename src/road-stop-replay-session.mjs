import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open} from 'node:fs/promises';
import path from 'node:path';
import {canonicalJson} from './canonical.mjs';
import {ROAD_STOP_ENVELOPE_MAX_BYTES} from './road-stop-capture-envelope.mjs';
import {createRoadStopReplayCase,parseRoadStopReplayCase,ROAD_STOP_REPLAY_CASE_MAX_BYTES} from './road-stop-replay-case.mjs';
import {parseRoadStopReadbackEnvelope} from './road-stop-readback.mjs';
import {parseFlatDataFile} from './userdata-ipc.mjs';

// This module persists offline evidence only.  It deliberately does not write
// replay requests, run commands, or make any claim about a loaded game state.
export const ROAD_STOP_REPLAY_RECORDING_MAX_BYTES=4096;
const RECORDING_FILE='recording.json';
const CASE_FILE='case.json';
const CAPTURE_FILE='road_capture_apply.lua';
const DIAGNOSTIC_CREATE_FILE='road_capture_diagnostic_create.lua';
const DIAGNOSTIC_APPLY_FILE='road_capture_diagnostic_apply.lua';
const fail=()=>{throw new TypeError('INVALID_ROAD_STOP_REPLAY_SESSION');};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const positiveEntity=value=>Number.isInteger(value)&&value>0&&value<=2147483647;

function sameFile(before,after){
  return before.dev===after.dev&&before.ino===after.ino&&before.size===after.size
    &&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs;
}
function sameOpenedFile(directoryEntry,descriptor){
  // Windows lstat reports a synthetic device id (zero), while fstat reports
  // the volume id.  The file index remains stable across both observations.
  return directoryEntry.ino===descriptor.ino
    &&(directoryEntry.dev===0||descriptor.dev===0||directoryEntry.dev===descriptor.dev);
}
function validateCheckpoint(value){
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||Object.keys(value).sort().join(',')!=='gameSha256,modManifestSha256,saveSha256'
    ||!hash(value.saveSha256)||!hash(value.gameSha256)||!hash(value.modManifestSha256))fail();
  return {saveSha256:value.saveSha256,gameSha256:value.gameSha256,modManifestSha256:value.modManifestSha256};
}
function validateRecording(value){
  if(!value||typeof value!=='object'||Array.isArray(value))fail();
  const expected=['schemaVersion','kind','checkpoint','companyEntity','startedAt'];
  if(Object.hasOwn(value,'captureBaselineSha256'))expected.push('captureBaselineSha256');
  if(Object.hasOwn(value,'diagnosticApplyBaselineSha256'))expected.push('diagnosticApplyBaselineSha256');
  if(Object.keys(value).sort().join(',')!==expected.sort().join(',')
    ||value.schemaVersion!==1||value.kind!=='road_replay_recording'
    ||!positiveEntity(value.companyEntity)||!Number.isSafeInteger(value.startedAt)||value.startedAt<0)fail();
  const recording={schemaVersion:1,kind:'road_replay_recording',checkpoint:validateCheckpoint(value.checkpoint),
    companyEntity:value.companyEntity,startedAt:value.startedAt};
  if(Object.hasOwn(value,'captureBaselineSha256')){
    if(!hash(value.captureBaselineSha256))fail();
    recording.captureBaselineSha256=value.captureBaselineSha256;
  }
  if(Object.hasOwn(value,'diagnosticApplyBaselineSha256')){
    if(!hash(value.diagnosticApplyBaselineSha256))fail();
    recording.diagnosticApplyBaselineSha256=value.diagnosticApplyBaselineSha256;
  }
  return recording;
}
async function safeDirectory(value,create){
  if(typeof value!=='string'||!value.length)fail();
  const directory=path.resolve(value);
  if(create)await mkdir(directory,{recursive:true});
  for(let current=directory;;current=path.dirname(current)){
    const stat=await lstat(current);
    if(!stat.isDirectory()||stat.isSymbolicLink())fail();
    if(path.dirname(current)===current)break;
  }
  return directory;
}
async function boundedRegularFile(filename,limit,decode){
  let before;
  try{before=await lstat(filename);}catch{fail();}
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>limit)fail();
  const noFollow=constants.O_NOFOLLOW??0;
  let handle;
  try{handle=await open(filename,constants.O_RDONLY|noFollow);}catch{fail();}
  try{
    const opened=await handle.stat();
    if(!opened.isFile()||opened.nlink!==1||opened.size>limit
      ||!sameOpenedFile(before,opened))fail();
    const buffer=Buffer.alloc(opened.size);
    let offset=0;
    while(offset<buffer.length){
      const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,offset);
      if(!bytesRead)fail();
      offset+=bytesRead;
    }
    const after=await handle.stat();
    if(!sameFile(opened,after))fail();
    let text;
    if(decode){try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{fail();}}
    return {bytes:buffer,text,mtimeMs:after.mtimeMs};
  }finally{await handle.close();}
}
async function writeExclusive(filename,source){
  let handle;
  try{handle=await open(filename,'wx',0o600);}catch{fail();}
  try{await handle.writeFile(source,'utf8');await handle.sync();}catch{fail();}finally{await handle.close();}
}
function digest(bytes){return createHash('sha256').update(bytes).digest('hex');}
function diagnosticFail(){throw new TypeError('INVALID_ROAD_CAPTURE_DIAGNOSTIC');}
function validIssues(value){
  return typeof value==='string'&&Buffer.byteLength(value,'utf8')<=2048
    &&value.split('_').length<=24&&value.split('_').every(token=>/^[A-Za-z][A-Za-z0-9]{0,95}$/.test(token));
}
// This intentionally accepts only the inert userdata return literal exported by
// the mod. It neither evaluates Lua nor treats a clear diagnostic as authority.
export function parseRoadCaptureDiagnostic(source){
  if(typeof source!=='string'||Buffer.byteLength(source,'utf8')>ROAD_STOP_REPLAY_RECORDING_MAX_BYTES)diagnosticFail();
  const wrapper=/^\s*function\s+data\s*\(\s*\)\s*return\s*\{([\s\S]*?)\}\s*end\s*$/.exec(source);
  if(!wrapper)diagnosticFail();
  const fields=Object.create(null),body=wrapper[1];
  const token=/\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(?:"([A-Za-z][A-Za-z0-9_]*)"|([1-9][0-9]*))\s*,/y;
  let offset=0;
  while(offset<body.length){
    if(body.slice(offset).trim()==='')break;
    token.lastIndex=offset;const match=token.exec(body);
    if(!match||Object.hasOwn(fields,match[1]))diagnosticFail();
    if(!['schemaVersion','kind','stage','sequence','issues'].includes(match[1]))diagnosticFail();
    fields[match[1]]=match[2]??Number(match[3]);offset=token.lastIndex;
  }
  if(Object.keys(fields).length!==5||fields.schemaVersion!==1||fields.kind!=='road_capture_diagnostic'
    ||!['create','apply'].includes(fields.stage)||!Number.isInteger(fields.sequence)||fields.sequence<1||fields.sequence>16
    ||!validIssues(fields.issues))diagnosticFail();
  return {schemaVersion:1,kind:'road_capture_diagnostic',stage:fields.stage,sequence:fields.sequence,issues:fields.issues};
}
async function optionalBoundedRegularFile(filename,limit,decode){
  try{return await boundedRegularFile(filename,limit,decode);}catch(error){
    try{await lstat(filename);}catch(missing){if(missing?.code==='ENOENT')return null;}
    throw error;
  }
}
async function readDiagnostic(bridge,stage){
  const filename=path.join(bridge,stage==='create'?DIAGNOSTIC_CREATE_FILE:DIAGNOSTIC_APPLY_FILE);
  const source=await optionalBoundedRegularFile(filename,ROAD_STOP_REPLAY_RECORDING_MAX_BYTES,true);
  if(!source)return null;
  let diagnostic;try{diagnostic=parseRoadCaptureDiagnostic(source.text);}catch{diagnosticFail();}
  if(diagnostic.stage!==stage)diagnosticFail();
  return {...diagnostic,digest:digest(source.bytes),mtimeMs:source.mtimeMs};
}
// Read-only evidence from an already placed object. Never a replay case and never
// an alternate path through finishRoadStopReplayRecording's strict capture gate.
export async function readRoadStopReadbackDiagnostic({bridgeDirectory,freshAfter,companyEntity}={}){
  try{
    if(!Number.isSafeInteger(freshAfter)||freshAfter<0||!positiveEntity(companyEntity))fail();
    const directory=await safeDirectory(bridgeDirectory,false);
    const source=await optionalBoundedRegularFile(path.join(directory,'road_stop_readback.lua'),140*1024,true);
    if(!source||source.mtimeMs<=freshAfter)return null;
    const bridgeFile=await boundedRegularFile(path.join(directory,'bridge.lua'),4096,true);
    const session=parseFlatDataFile(bridgeFile.text);
    const parsed=parseRoadStopReadbackEnvelope(source.text);
    if(session.schemaVersion!==1||parsed.snapshot.nonce!==session.nonce||parsed.snapshot.companyEntity!==companyEntity)return null;
    return {status:'PLACED_STOP_READBACK_ONLY_NOT_REPLAY_READY',companyEntity,updateCount:parsed.snapshot.updateCount};
  }catch{return {status:'PLACED_STOP_READBACK_INVALID'};}
}
export async function previewRoadStopReplayCaptureDiagnostics({bridgeDirectory,freshAfter}={}){
  try{
    if(!Number.isSafeInteger(freshAfter)||freshAfter<0)fail();
    const bridge=await safeDirectory(bridgeDirectory,false);
    const create=await readDiagnostic(bridge,'create');
    if(!create)return {status:'CAPTURE_NOT_AVAILABLE'};
    // Preview is read-only. A diagnostic export contains only unsupported
    // conditions, never a positive replay-readiness result.
    if(create.mtimeMs<=freshAfter)return {status:'CAPTURE_DIAGNOSTICS_STALE'};
    return {status:'CAPTURE_UNSUPPORTED',issues:create.issues};
  }catch{return {status:'CAPTURE_INVALID'};}
}
function artifact(result){
  return {digest:result.digest,companyEntity:result.case.companyEntity,checkpoint:result.case.checkpoint,
    source:result.canonical};
}

export async function beginRoadStopReplayRecording({directory,bridgeDirectory,checkpoint,companyEntity}={}){
  try{
    // Validate caller data before any filesystem work.  This also avoids
    // creating an output directory for a malformed recording request.
    const verifiedCheckpoint=validateCheckpoint(checkpoint);
    if(!positiveEntity(companyEntity))fail();
    const output=await safeDirectory(directory,true);
    const bridge=await safeDirectory(bridgeDirectory,false);
    const recording={schemaVersion:1,kind:'road_replay_recording',checkpoint:verifiedCheckpoint,
      companyEntity,startedAt:Date.now()};
    const capturePath=path.join(bridge,CAPTURE_FILE);
    let captureExists;
    try{await lstat(capturePath);captureExists=true;}catch(error){
      if(error?.code==='ENOENT')captureExists=false;
      else throw error;
    }
    if(captureExists)recording.captureBaselineSha256=digest((await boundedRegularFile(capturePath,ROAD_STOP_ENVELOPE_MAX_BYTES,false)).bytes);
    const diagnostic=await optionalBoundedRegularFile(path.join(bridge,DIAGNOSTIC_APPLY_FILE),ROAD_STOP_REPLAY_RECORDING_MAX_BYTES,false);
    if(diagnostic)recording.diagnosticApplyBaselineSha256=digest(diagnostic.bytes);
    const normalized=validateRecording(recording);
    await writeExclusive(path.join(output,RECORDING_FILE),canonicalJson(normalized));
    return normalized;
  }catch{fail();}
}

export async function finishRoadStopReplayRecording({directory,bridgeDirectory}={}){
  try{
    const output=await safeDirectory(directory,false);
    const bridge=await safeDirectory(bridgeDirectory,false);
    const recordingSource=await boundedRegularFile(path.join(output,RECORDING_FILE),ROAD_STOP_REPLAY_RECORDING_MAX_BYTES,true);
    let recording;try{recording=validateRecording(JSON.parse(recordingSource.text));}catch{fail();}
    let diagnostic;
    try{diagnostic=await readDiagnostic(bridge,'apply');}catch{throw new TypeError('CAPTURE_INVALID');}
    const diagnosticFresh=diagnostic&&diagnostic.mtimeMs>recording.startedAt
      &&(recording.diagnosticApplyBaselineSha256===undefined||diagnostic.digest!==recording.diagnosticApplyBaselineSha256);
    if(diagnosticFresh)throw Object.assign(new TypeError('CAPTURE_UNSUPPORTED'),{issues:diagnostic.issues});
    const capture=await optionalBoundedRegularFile(path.join(bridge,CAPTURE_FILE),ROAD_STOP_ENVELOPE_MAX_BYTES,true);
    if(!capture)throw new TypeError('CAPTURE_NOT_AVAILABLE');
    const captureHash=digest(capture.bytes);
    if(capture.mtimeMs<recording.startedAt
      ||(recording.captureBaselineSha256!==undefined&&captureHash===recording.captureBaselineSha256))throw new TypeError('CAPTURE_INVALID');
    let result;
    try{result=createRoadStopReplayCase({applyEnvelope:capture.text,checkpoint:recording.checkpoint,companyEntity:recording.companyEntity});}catch{throw new TypeError('CAPTURE_INVALID');}
    await writeExclusive(path.join(output,CASE_FILE),result.canonical);
    return artifact(result);
  }catch(error){
    if(['CAPTURE_NOT_AVAILABLE','CAPTURE_INVALID','CAPTURE_UNSUPPORTED'].includes(error?.message))throw error;
    fail();
  }
}

export async function loadRoadStopReplayRecordingCase(directory){
  try{
    const output=await safeDirectory(directory,false);
    const source=await boundedRegularFile(path.join(output,CASE_FILE),ROAD_STOP_REPLAY_CASE_MAX_BYTES,true);
    let parsed;try{parsed=parseRoadStopReplayCase(source.text);}catch{fail();}
    return artifact(parsed);
  }catch{fail();}
}
