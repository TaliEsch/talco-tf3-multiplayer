// Read-only, hash-pinned candidate search. A pointer match is not hook qualification.
import {readFile, lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';

const expected = '086d69c141acaac1016e942beac28f469da0c5cb2de4b7f4c6f0d3fd7fd75dc1';
const imagePath = process.argv[2];
if (process.argv.length !== 3 || !isAbsolute(imagePath)) throw new Error('Supply absolute TF3 image path');
const meta = await lstat(imagePath);
if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 1024 * 1024 * 1024) {
  throw new Error('Expected a bounded regular file');
}
const image = await readFile(imagePath);
if (createHash('sha256').update(image).digest('hex') !== expected) {
  throw new Error('TF3 image does not match build 40396');
}
const u16 = offset => image.readUInt16LE(offset);
const u32 = offset => image.readUInt32LE(offset);
const pe = u32(0x3c);
if (u16(0) !== 0x5a4d || u32(pe) !== 0x4550 || u16(pe + 4) !== 0x8664) {
  throw new Error('Expected PE64 image');
}
const optional = pe + 24;
if (u16(optional) !== 0x20b) throw new Error('Expected PE32+ optional header');
const base = image.readBigUInt64LE(optional + 24);
const sectionStart = optional + u16(pe + 20);
const sections = Array.from({length: u16(pe + 6)}, (_, index) => {
  const at = sectionStart + index * 40;
  return {rva: u32(at + 12), size: u32(at + 16), raw: u32(at + 20),
    executable: !!(u32(at + 36) & 0x20000000)};
});
const targets = [
  ['callback_invoke_candidate', 0xe3e810],
  ['adapter_1201b0', 0x1201b0],
  ['adapter_6ab630', 0x6ab630],
  ['adapter_27c8810', 0x27c8810],
  ['adapter_120420', 0x120420],
];
const matches = Object.fromEntries(targets.map(([name]) => [name, []]));
const oldAdapters = [
  ['adapter_a', 0x367cc00, 0x1201b0],
  ['adapter_b', 0x367cb20, 0x1201b0],
  ['adapter_c', 0x36cab88, 0x6ab630],
  ['adapter_d', 0x3788880, 0x27c8810],
  ['adapter_e', 0x367cc38, 0x120420],
];
const adapterCandidates = Object.fromEntries(oldAdapters.map(([name]) => [name, []]));
for (const section of sections.filter(item => !item.executable)) {
  for (let index = 0; index + 8 <= section.size; index += 8) {
    const raw = section.raw + index;
    if (raw + 8 > image.length) throw new Error('Section extends beyond image');
    const pointer = image.readBigUInt64LE(raw);
    for (const [name, rva] of targets) {
      if (pointer === base + BigInt(rva)) matches[name].push(`0x${(section.rva + index).toString(16)}`);
    }
    const possibleTable = section.rva + index - 0x10;
    for (const [name, oldTable, oldTarget] of oldAdapters) {
      const targetRva = pointer - base;
      if (Math.abs(possibleTable - oldTable) <= 0x2000 &&
          targetRva >= BigInt(oldTarget - 0x20) && targetRva <= BigInt(oldTarget + 0x20)) {
        adapterCandidates[name].push({table: `0x${possibleTable.toString(16)}`,
          invoke: `0x${targetRva.toString(16)}`});
      }
    }
  }
}
console.log(JSON.stringify({imageSha256: expected, imageBase: `0x${base.toString(16)}`,
  evidence: 'static pointer candidates only; no activation', matches, adapterCandidates}, null, 2));
