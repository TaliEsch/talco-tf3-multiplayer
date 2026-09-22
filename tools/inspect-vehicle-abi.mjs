// Read-only exact-build investigation. CALL-byte matches remain candidates until
// independently decoded with disassemble-native-candidate.ps1. No image bytes
// or proprietary disassembly are written by this helper.
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';

const expected='a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5';
const path=process.argv[2];
if(process.argv.length!==3||!isAbsolute(path)) throw new Error('Supply the absolute exact-build image path');
const metadata=await stat(path);
if(!metadata.isFile()||metadata.size>1024*1024*1024) throw new Error('Image is not a bounded regular file');
const bytes=await readFile(path);
const hash=createHash('sha256').update(bytes).digest('hex');
if(hash!==expected) throw new Error('Image does not match reviewed build');
const u32=o=>bytes.readUInt32LE(o), u16=o=>bytes.readUInt16LE(o);
const pe=u32(0x3c), opt=pe+24, sections=[];
for(let i=0;i<u16(pe+6);i++){
  const o=opt+u16(pe+20)+i*40;
  sections.push({rva:u32(o+12),raw:u32(o+20),size:u32(o+16),execute:!!(u32(o+36)&0x20000000)});
}
function offset(rva,length=1){
  const s=sections.find(s=>rva>=s.rva&&rva-s.rva+length<=s.size);
  if(!s) throw new Error('Unmapped RVA');
  return s.raw+rva-s.rva;
}
const exceptionRva=u32(opt+112+24), exceptionSize=u32(opt+112+28);
const functions=[];
for(let i=0;i<exceptionSize;i+=12){
  const o=offset(exceptionRva+i,12);
  functions.push({begin:u32(o),end:u32(o+4),unwind:u32(o+8)});
}
const hex=n=>'0x'+n.toString(16);
function runtime(rva){
  const f=functions.find(f=>rva>=f.begin&&rva<f.end);
  if(!f) return null;
  const o=offset(f.unwind,4), count=bytes[o+2], flags=bytes[o]>>3;
  const extra=offset(f.unwind+4+((count+1)&~1)*2,4);
  return {begin:hex(f.begin),end:hex(f.end),unwind:hex(f.unwind),version:bytes[o]&7,flags,
    prologue:bytes[o+1],slots:count,frame:bytes[o+3],
    handler:flags&3?hex(u32(extra)):null,
    chained:flags&4?{begin:hex(u32(extra)),end:hex(u32(extra+4)),unwind:hex(u32(extra+8))}:null,
    rangeSha256:createHash('sha256').update(bytes.subarray(offset(f.begin),offset(f.begin)+f.end-f.begin)).digest('hex')};
}
const targets=[0x9eee60,0x9d3120,0x9d2b20];
const findings=targets.map(target=>({target:hex(target),runtime:runtime(target),directCallCandidates:[],addressReferences:[]}));
for(const s of sections.filter(s=>s.execute)){
  for(let i=0;i+7<=s.size;i++){
    const o=s.raw+i,rva=s.rva+i;
    if(bytes[o]===0xe8){
      const target=rva+5+bytes.readInt32LE(o+1),f=findings.find(f=>f.target===hex(target));
      if(f) f.directCallCandidates.push({call:hex(rva),return:hex(rva+5),runtime:runtime(rva)});
    }
    if((bytes[o]&0xf8)===0x48&&bytes[o+1]===0x8d&&(bytes[o+2]&0xc7)===5){
      const target=rva+7+bytes.readInt32LE(o+3),f=findings.find(f=>f.target===hex(target));
      if(f) f.addressReferences.push({lea:hex(rva),runtime:runtime(rva)});
    }
  }
}
console.log(JSON.stringify({imageSha256:hash,evidence:'read-only static candidates; decode before use',activationPermitted:false,findings},null,2));
