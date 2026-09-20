import {open} from 'node:fs/promises';
import {parseRoadStopCapture} from '../src/road-stop-capture.mjs';

// Offline only. This tool neither contacts the helper nor sends game commands.
const limit=256*1024;
const filename=process.argv[2];
if(!filename || process.argv.length!==3){
  console.error('Usage: node tools/check-road-stop-capture.mjs <capture.json>');
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
    const {capture,digest}=parseRoadStopCapture(source);
    const street=capture.proposal.street;
    console.log(JSON.stringify({schemaVersion:1,code:'OFFLINE_CAPTURE_VALID',digest,
      addedSegments:street.addedSegments.length,removedSegments:street.removedSegments.length,
      edgeObjects:street.edgeObjectsToAdd.length,
      nativeCaptureVerified:false,reconstructionVerified:false,executionAuthorized:false},null,2));
  }catch{
    // Do not print rejected data, paths, resource names, native errors or stacks.
    console.error('ROAD_STOP_CAPTURE_INVALID_OR_UNREADABLE');process.exitCode=1;
  }finally{await handle?.close();}
}
