// Read-only exact-build static leads; instruction-byte matches require decoding.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';
const [path,...queries]=process.argv.slice(2);
if(!path||!isAbsolute(path)||!queries.length) throw Error('Usage: node inspect-userdata-route.mjs ABSOLUTE_IMAGE RVA_OR_string:TEXT ...');
const b=await readFile(path),hash=createHash('sha256').update(b).digest('hex');
if(hash!=='a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5') throw Error('Unreviewed image');
const u32=o=>b.readUInt32LE(o),pe=u32(0x3c),opt=pe+24,base=b.readBigUInt64LE(opt+24),sections=[];
for(let i=0;i<b.readUInt16LE(pe+6);i++) {const o=opt+b.readUInt16LE(pe+20)+40*i; sections.push({rva:u32(o+12),raw:u32(o+20),size:u32(o+16),exec:!!(u32(o+36)&0x20000000)});}
const hex=n=>'0x'+n.toString(16);
function off(rva){const s=sections.find(s=>rva>=s.rva&&rva<s.rva+s.size);if(!s)throw Error('Unmapped RVA');return s.raw+rva-s.rva;}
const fs=[];for(let i=0;i<u32(opt+140);i+=12){const o=off(u32(opt+136)+i);fs.push({begin:u32(o),end:u32(o+4),unwind:u32(o+8)});}
function runtime(rva){const f=fs.find(f=>rva>=f.begin&&rva<f.end);return f?{...Object.fromEntries(Object.entries(f).map(([k,v])=>[k,hex(v)])),sha256:createHash('sha256').update(b.subarray(off(f.begin),off(f.begin)+f.end-f.begin)).digest('hex')}:null;}
const targets=[];
for(const q of queries){if(q.startsWith('string:')){const needle=Buffer.from(q.slice(7)+'\0');for(const s of sections){let at=s.raw;while((at=b.indexOf(needle,at))>=s.raw&&at<s.raw+s.size){targets.push({query:q,rva:s.rva+at-s.raw});at++;}}}else{const rva=Number(q);if(!Number.isInteger(rva)||rva<0||rva>0xffffffff)throw Error('Invalid RVA');targets.push({query:q,rva});}}
for(const t of targets){t.runtime=runtime(t.rva);t.qwords=Array.from({length:6},(_,i)=>hex(b.readBigUInt64LE(off(t.rva)+8*i)));t.references=[];}
const map=new Map(targets.map(t=>[t.rva,t]));
for(const s of sections){for(let i=0;i+8<=s.size;i++){const o=s.raw+i,rva=s.rva+i;
  if(s.exec){if(b[o]===0xe8||b[o]===0xe9){const t=map.get(rva+5+b.readInt32LE(o+1));if(t)t.references.push({kind:b[o]===0xe8?'call-candidate':'jump-candidate',rva:hex(rva),runtime:runtime(rva)});}
  if((b[o]&0xf8)===0x48&&(b[o+1]===0x8d||b[o+1]===0x8b)&&(b[o+2]&0xc7)===5){const t=map.get(rva+7+b.readInt32LE(o+3));if(t)t.references.push({kind:'rip-reference-candidate',rva:hex(rva),runtime:runtime(rva)});}}
  else {const n=b.readBigUInt64LE(o)-base;if(n>=0n&&n<=0xffffffffn){const t=map.get(Number(n));if(t)t.references.push({kind:'absolute-pointer',rva:hex(rva)});}}
}}
console.log(JSON.stringify({hash,activationPermitted:false,findings:targets.map(t=>({...t,rva:hex(t.rva),ascii:b.subarray(off(t.rva),off(t.rva)+128).toString('ascii').split('\0')[0],referenceCount:t.references.length,references:t.references.slice(0,128),referencesTruncated:t.references.length>128}))},null,2));
