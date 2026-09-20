import {open} from 'node:fs/promises';
import {summarizeNativePlacementLog} from '../src/native-placement-report.mjs';
const file=process.argv[2];
if(!file){console.error('Usage: node tools/read-native-placement-log.mjs <TF3 stdout.txt>');process.exitCode=1;}
else {
  let handle;
  try {
    handle=await open(file,'r');const info=await handle.stat();
    if(!info.isFile()||info.size>32*1024*1024)throw new Error('LOG_TOO_LARGE_OR_INVALID');
    const buffer=Buffer.alloc(info.size+1);let length=0;
    while(length<buffer.length){const {bytesRead}=await handle.read(buffer,length,buffer.length-length,length);if(!bytesRead)break;length+=bytesRead;}
    if(length>info.size)throw new Error('LOG_CHANGED_TRY_AGAIN');
    console.log(JSON.stringify(summarizeNativePlacementLog(buffer.subarray(0,length).toString('utf8')),null,2));
  } catch {console.error('Could not read a bounded placement log. Check the path and try again after logging stops.');process.exitCode=1;}
  finally {await handle?.close();}
}
