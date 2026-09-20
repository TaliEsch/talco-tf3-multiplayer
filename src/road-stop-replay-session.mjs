import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,open} from 'node:fs/promises';
import path from 'node:path';
import {canonicalJson} from './canonical.mjs';
import {ROAD_STOP_ENVELOPE_MAX_BYTES} from './road-stop-capture-envelope.mjs';
import {createRoadStopReplayCase,parseRoadStopReplayCase,ROAD_STOP_REPLAY_CASE_MAX_BYTES} from './road-stop-replay-case.mjs';

// This module persists offline evidence only.  It deliberately does not write
// replay requests, run commands, or make any claim about a loaded game state.
export const ROAD_STOP_REPLAY_RECORDING_MAX_BYTES=4096;
const RECORDING_FILE='recording.json';
const CASE_FILE='case.json';
const CAPTURE_FILE='road_capture_apply.lua';
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
  if(Object.keys(value).sort().join(',')!==expected.sort().join(',')
    ||value.schemaVersion!==1||value.kind!=='road_replay_recording'
    ||!positiveEntity(value.companyEntity)||!Number.isSafeInteger(value.startedAt)||value.startedAt<0)fail();
  const recording={schemaVersion:1,kind:'road_replay_recording',checkpoint:validateCheckpoint(value.checkpoint),
    companyEntity:value.companyEntity,startedAt:value.startedAt};
  if(Object.hasOwn(value,'captureBaselineSha256')){
    if(!hash(value.captureBaselineSha256))fail();
    recording.captureBaselineSha256=value.captureBaselineSha256;
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
    const capture=await boundedRegularFile(path.join(bridge,CAPTURE_FILE),ROAD_STOP_ENVELOPE_MAX_BYTES,true);
    const captureHash=digest(capture.bytes);
    if(capture.mtimeMs<recording.startedAt
      ||(recording.captureBaselineSha256!==undefined&&captureHash===recording.captureBaselineSha256))fail();
    let result;
    try{result=createRoadStopReplayCase({applyEnvelope:capture.text,checkpoint:recording.checkpoint,companyEntity:recording.companyEntity});}catch{fail();}
    await writeExclusive(path.join(output,CASE_FILE),result.canonical);
    return artifact(result);
  }catch{fail();}
}

export async function loadRoadStopReplayRecordingCase(directory){
  try{
    const output=await safeDirectory(directory,false);
    const source=await boundedRegularFile(path.join(output,CASE_FILE),ROAD_STOP_REPLAY_CASE_MAX_BYTES,true);
    let parsed;try{parsed=parseRoadStopReplayCase(source.text);}catch{fail();}
    return artifact(parsed);
  }catch{fail();}
}
