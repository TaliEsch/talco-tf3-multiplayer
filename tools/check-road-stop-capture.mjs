import {open} from 'node:fs/promises';
import {parseRoadStopCapture,ROAD_STOP_CAPTURE_MAX_BYTES} from '../src/road-stop-capture.mjs';
import {parseRoadStopCaptureEnvelope,ROAD_STOP_ENVELOPE_MAX_BYTES} from '../src/road-stop-capture-envelope.mjs';

// Offline only. This tool neither contacts the helper nor sends game commands.
const userdata=process.argv[2]==='--userdata';
const limit=userdata?ROAD_STOP_ENVELOPE_MAX_BYTES:ROAD_STOP_CAPTURE_MAX_BYTES;
const filename=process.argv[userdata?3:2];
if(!filename || filename.startsWith('--') || process.argv.length!==(userdata?4:3)){
  console.error('Usage: node tools/check-road-stop-capture.mjs [--userdata] <capture-file>');
  process.exitCode=1;
}else{
  let handle;
  try{
    handle=await open(filename,'r');
    const stat=await handle.stat();
    if(!stat.isFile() || stat.size>limit)throw new Error('INVALID_FILE');
    const buffer=Buffer.alloc(limit+1);let length=0;
    while(length<buffer.length){
      const {bytesRead}=await handle.read(buffer,length,buffer.length-length,length);
      if(!bytesRead)break;
      length+=bytesRead;
    }
    if(length>limit || length!==stat.size)throw new Error('CHANGED_FILE');
    const source=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,length));
    const result=userdata?parseRoadStopCaptureEnvelope(source):parseRoadStopCapture(source);
    const {capture,digest}=result;
    const street=capture.proposal.street;
    console.log(JSON.stringify({schemaVersion:1,code:'OFFLINE_CAPTURE_VALID',digest,
      ...(userdata?{observerRevision:result.observerRevision,stage:result.stage,sequence:result.sequence,freshnessVerified:false}:{}),
      addedSegments:street.addedSegments.length,removedSegments:street.removedSegments.length,
      edgeObjects:street.edgeObjectsToAdd.length,
      nativeCaptureVerified:false,reconstructionVerified:false,executionAuthorized:false},null,2));
  }catch{
    // Do not print rejected data, paths, resource names, native errors or stacks.
    console.error('ROAD_STOP_CAPTURE_INVALID_OR_UNREADABLE');process.exitCode=1;
  }finally{await handle?.close();}
}
