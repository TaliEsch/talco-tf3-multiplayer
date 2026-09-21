import {readFile,stat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {inspectNativeHookCandidates} from '../src/native-hook-candidates.mjs';
import {evaluateStaticBuildProfile} from '../src/native-build-profile.mjs';

const MAX_IMAGE_BYTES=1024*1024*1024;
async function main(){
  const [imagePath]=process.argv.slice(2);
  if(process.argv.length!==3||!isAbsolute(imagePath)) throw new Error('supply one absolute image path');
  const metadata=await stat(imagePath);
  if(!metadata.isFile()||metadata.size>MAX_IMAGE_BYTES) throw new Error('input is not a bounded regular file');
  const report=inspectNativeHookCandidates(await readFile(imagePath));
  return {...report,staticProfile:evaluateStaticBuildProfile(report)};
}
try {
  console.log(JSON.stringify(await main()));
} catch {
  // Do not echo a path, image bytes, or parser internals from an untrusted file.
  console.log(JSON.stringify({error:'static inspection rejected input',evidence:'static-candidate-only',hookReady:false}));
  process.exitCode=1;
}
