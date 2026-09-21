import {createHash} from 'node:crypto';

const MAX_IMAGE_BYTES=1024*1024*1024;
const MAX_SECTIONS=96;
const MAX_STRING_MATCHES=256;
const MAX_REFERENCES=256;
const MAX_RUNTIME_FUNCTIONS=1024*1024;
const MAX_UNWIND_CHAIN_DEPTH=32;

// Labels are deliberately stable metadata, rather than copied bytes from a
// game image. They are only anchors for static review candidates.
export const NATIVE_HOOK_STRING_LABELS=Object.freeze([
  ['simulationStep','GameSim::Step'],
  ['gameSimulationLoop','CGame::RunGameSimLoop'],
  ['commandListAddLambda','CommandList::Add::<lambda_1>::operator ()'],
  ['townDeveloperDevelop','TownDeveloper::Develop'],
  ['simulationApplyCommand','Simulation Thread: Apply Command'],
]);

function invalid(){ throw new Error('invalid PE64 image'); }
function range(offset,length,total){ return Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset<=total&&length<=total-offset; }
function u16(bytes,offset){ if(!range(offset,2,bytes.length)) invalid(); return bytes.readUInt16LE(offset); }
function u32(bytes,offset){ if(!range(offset,4,bytes.length)) invalid(); return bytes.readUInt32LE(offset); }
function i32(bytes,offset){ if(!range(offset,4,bytes.length)) invalid(); return bytes.readInt32LE(offset); }
function overlaps(a,b){ return a.start<b.end&&b.start<a.end; }

function parseImage(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<64||bytes.length>MAX_IMAGE_BYTES||u16(bytes,0)!==0x5a4d) invalid();
  const peOffset=u32(bytes,0x3c);
  if(!range(peOffset,24,bytes.length)||u32(bytes,peOffset)!==0x00004550) invalid();
  const fileHeader=peOffset+4;
  if(u16(bytes,fileHeader)!==0x8664) invalid();
  const peTimestamp=u32(bytes,fileHeader+4);
  const sectionCount=u16(bytes,fileHeader+2);
  const optionalSize=u16(bytes,fileHeader+16);
  if(sectionCount===0||sectionCount>MAX_SECTIONS||optionalSize<112) invalid();
  const optionalOffset=fileHeader+20;
  if(!range(optionalOffset,optionalSize,bytes.length)||u16(bytes,optionalOffset)!==0x20b) invalid();
  const imageSize=u32(bytes,optionalOffset+56);
  const directoryCount=u32(bytes,optionalOffset+108);
  const availableDirectories=Math.floor((optionalSize-112)/8);
  if(imageSize===0||directoryCount<4||directoryCount>availableDirectories||optionalSize<112+(4*8)) invalid();
  const sectionTable=optionalOffset+optionalSize;
  if(!range(sectionTable,sectionCount*40,bytes.length)) invalid();
  const headersEnd=sectionTable+(sectionCount*40);
  const sections=[];
  for(let index=0;index<sectionCount;index++){
    const offset=sectionTable+(index*40);
    const virtualSize=u32(bytes,offset+8);
    const rva=u32(bytes,offset+12);
    const rawSize=u32(bytes,offset+16);
    const rawOffset=u32(bytes,offset+20);
    const characteristics=u32(bytes,offset+36);
    const mappedSize=Math.max(virtualSize,rawSize);
    if(mappedSize===0||rva===0||rva+mappedSize>imageSize||!range(rawOffset,rawSize,bytes.length)||
       (rawSize>0&&rawOffset<headersEnd)) invalid();
    const current={rva,virtualEnd:rva+mappedSize,rawOffset,rawEnd:rawOffset+rawSize,characteristics};
    for(const prior of sections){
      if(overlaps({start:current.rva,end:current.virtualEnd},{start:prior.rva,end:prior.virtualEnd})||
         (rawSize>0&&prior.rawEnd>prior.rawOffset&&overlaps({start:current.rawOffset,end:current.rawEnd},{start:prior.rawOffset,end:prior.rawEnd}))) invalid();
    }
    sections.push(current);
  }
  const exceptionDirectoryOffset=optionalOffset+112+(3*8);
  const exceptionRva=u32(bytes,exceptionDirectoryOffset);
  const exceptionSize=u32(bytes,exceptionDirectoryOffset+4);
  if(exceptionRva===0||exceptionSize===0||exceptionSize%12!==0||exceptionSize/12>MAX_RUNTIME_FUNCTIONS) invalid();
  return {imageSize,peTimestamp,sections,exceptionRva,exceptionSize};
}

function rvaToOffset(image,rva,length){
  for(const section of image.sections){
    if(rva>=section.rva&&rva-section.rva<=section.rawEnd-section.rawOffset&&length<=section.rawEnd-section.rawOffset-(rva-section.rva)) return section.rawOffset+(rva-section.rva);
  }
  return null;
}
function offsetToRva(image,offset,length){
  for(const section of image.sections){
    if(offset>=section.rawOffset&&offset-section.rawOffset<=section.rawEnd-section.rawOffset&&length<=section.rawEnd-section.rawOffset-(offset-section.rawOffset)) return section.rva+(offset-section.rawOffset);
  }
  return null;
}
function readRuntimeFunctions(bytes,image){
  const directoryOffset=rvaToOffset(image,image.exceptionRva,image.exceptionSize);
  if(directoryOffset===null) invalid();
  const functions=[];
  for(let offset=directoryOffset;offset<directoryOffset+image.exceptionSize;offset+=12){
    const beginRva=u32(bytes,offset),endRva=u32(bytes,offset+4),unwindRva=u32(bytes,offset+8);
    if(beginRva>=endRva||endRva>image.imageSize||unwindRva===0||unwindRva>=image.imageSize||(unwindRva&3)!==0) invalid();
    const current={beginRva,endRva,unwindRva};
    functions.push(current);
  }
  functions.sort((a,b)=>a.beginRva-b.beginRva);
  for(let index=1;index<functions.length;index++){
    if(functions[index].beginRva<functions[index-1].endRva) invalid();
  }
  return functions;
}

function unwindInfo(bytes,image,entry){
  const headerOffset=rvaToOffset(image,entry.unwindRva,4);
  if(headerOffset===null)invalid();
  const version=bytes[headerOffset]&7,flags=bytes[headerOffset]>>>3,countOfCodes=bytes[headerOffset+2];
  if((version!==1&&version!==2)||(flags&~7)!==0||((flags&4)!==0&&(flags&3)!==0))invalid();
  const optionalRva=entry.unwindRva+((4+(countOfCodes*2)+3)&~3);
  if(optionalRva>image.imageSize)invalid();
  let chainedTo=null,handlerRva=null;
  if((flags&4)!==0){
    const offset=rvaToOffset(image,optionalRva,12);
    if(offset===null)invalid();
    chainedTo={beginRva:u32(bytes,offset),endRva:u32(bytes,offset+4),unwindRva:u32(bytes,offset+8)};
    if(chainedTo.beginRva>=chainedTo.endRva||chainedTo.endRva>image.imageSize||chainedTo.unwindRva===0
      ||chainedTo.unwindRva>=image.imageSize||(chainedTo.unwindRva&3)!==0)invalid();
  }else if((flags&3)!==0){
    const offset=rvaToOffset(image,optionalRva,4);
    if(offset===null)invalid();
    handlerRva=u32(bytes,offset);
    if(handlerRva===0||handlerRva>=image.imageSize)invalid();
  }
  return {version,flags,chainedTo,handlerRva};
}

function runtimeKey(entry){return `${entry.beginRva}:${entry.endRva}:${entry.unwindRva}`;}
function resolvePrimaryRuntimeFunction(bytes,image,functions,entry){
  const byKey=new Map(functions.map(value=>[runtimeKey(value),value]));
  const visited=new Set();let current=entry,depth=0,firstInfo;
  for(;;){
    const key=runtimeKey(current);
    if(visited.has(key)||depth>MAX_UNWIND_CHAIN_DEPTH)invalid();
    visited.add(key);
    const info=unwindInfo(bytes,image,current);
    firstInfo??=info;
    if(!info.chainedTo)return {primary:current,chainDepth:depth,firstInfo};
    current=byKey.get(runtimeKey(info.chainedTo));
    if(!current)invalid();
    depth++;
  }
}
function findRange(functions,rva){
  let low=0,high=functions.length-1;
  while(low<=high){
    const middle=low+Math.floor((high-low)/2),entry=functions[middle];
    if(rva<entry.beginRva) high=middle-1;
    else if(rva>=entry.endRva) low=middle+1;
    else return entry;
  }
  return null;
}

export function inspectNativeHookCandidates(bytes){
  const image=parseImage(bytes);
  const functions=readRuntimeFunctions(bytes,image);
  const stringRvas=new Map();
  let stringMatches=0;
  for(const [label,text] of NATIVE_HOOK_STRING_LABELS){
    const needle=Buffer.from(`${text}\0`,'ascii');
    for(let searchFrom=0;;){
      const index=bytes.indexOf(needle,searchFrom);
      if(index===-1) break;
      searchFrom=index+1;
      const rva=offsetToRva(image,index,needle.length);
      if(rva===null) continue;
      stringMatches++;
      if(stringMatches>MAX_STRING_MATCHES) invalid();
      const matches=stringRvas.get(rva)??[];
      matches.push(label);
      stringRvas.set(rva,matches);
    }
  }
  const candidates=[];
  for(const section of image.sections){
    if((section.characteristics&0x20000000)===0) continue;
    for(let offset=section.rawOffset;offset+7<=section.rawEnd;offset++){
      const rex=bytes[offset],opcode=bytes[offset+1],modrm=bytes[offset+2];
      if((rex!==0x48&&rex!==0x4c)||opcode!==0x8d||(modrm&0xc7)!==0x05) continue;
      const instructionRva=section.rva+(offset-section.rawOffset);
      const targetRva=instructionRva+7+i32(bytes,offset+3);
      if(targetRva<0||targetRva>0xffffffff) continue;
      const labels=stringRvas.get(targetRva);
      if(!labels) continue;
      const functionRange=findRange(functions,instructionRva);
      if(!functionRange||instructionRva+7>functionRange.endRva) continue;
      const resolved=resolvePrimaryRuntimeFunction(bytes,image,functions,functionRange);
      const functionLength=functionRange.endRva-functionRange.beginRva;
      const functionOffset=rvaToOffset(image,functionRange.beginRva,functionLength);
      const functionRangeSha256=functionOffset===null?null:createHash('sha256')
        .update(bytes.subarray(functionOffset,functionOffset+functionLength)).digest('hex');
      for(const label of labels){
        candidates.push({label,stringRva:targetRva,referenceInstructionRva:instructionRva,functionRange:{beginRva:functionRange.beginRva,endRva:functionRange.endRva},functionRangeSha256,
          primaryFunctionRange:{beginRva:resolved.primary.beginRva,endRva:resolved.primary.endRva},unwindChainDepth:resolved.chainDepth,
          unwindVersion:resolved.firstInfo.version,unwindFlags:resolved.firstInfo.flags,unwindHandlerRva:resolved.firstInfo.handlerRva,
          evidence:'static-candidate-only',hookReady:false});
        if(candidates.length>MAX_REFERENCES) invalid();
      }
    }
  }
  return {
    sha256:createHash('sha256').update(bytes).digest('hex'),
    peTimestamp:image.peTimestamp,
    sizeOfImage:image.imageSize,
    evidence:'static-candidate-only',
    hookReady:false,
    limitations:['byte-pattern matches are not decoded or verified instruction boundaries or function identities and cannot authorize patching','function-range digests fingerprint on-disk exception-table ranges only; they do not establish live memory integrity, ABI, thread ownership, or hook safety'],
    candidates,
  };
}
