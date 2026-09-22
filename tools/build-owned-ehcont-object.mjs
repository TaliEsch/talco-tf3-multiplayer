// Add transparent EHCONT metadata to one owned assembly COFF object.
// MSVC's assembler lacks LLVM's .symidx directive; EHCONT uses COFF symbol
// indices (not RVA relocations). The table names exactly OwnedColdGate.
// Format reference: LLVM lld/test/COFF/guard-ehcont.s and Microsoft's PE/COFF.
// No executable bytes, patching, or game integration are present here.
import {readFileSync, writeFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';

const [input, output, ...extra] = process.argv.slice(2);
if (!input || !output || !isAbsolute(input) || !isAbsolute(output) || extra.length ||
    !input.endsWith('.obj') || !output.endsWith('.obj') || input === output) {
  throw new Error('Supply distinct absolute input and output .obj paths.');
}
const original = readFileSync(input);
if (original.readUInt16LE(0) !== 0x8664 || original.readUInt16LE(16) !== 0) throw new Error('Expected ordinary AMD64 COFF.');
const sections = original.readUInt16LE(2);
const symbolOffset = original.readUInt32LE(8);
const symbolCount = original.readUInt32LE(12);
const strings = symbolOffset + symbolCount * 18;
const stringSize = original.readUInt32LE(strings);
if (strings + stringSize !== original.length) throw new Error('Unexpected trailing object data.');
let gateIndex = -1, featureIndex = -1;
for (let i = 0; i < symbolCount;) {
  const offset = symbolOffset + i * 18;
  const nameStart = original.readUInt32LE(offset) === 0
    ? strings + original.readUInt32LE(offset + 4) : offset;
  const nameEnd = original.readUInt32LE(offset) === 0
    ? original.indexOf(0, nameStart) : Math.min(original.indexOf(0, nameStart), offset + 8);
  const name = original.toString('ascii', nameStart, nameEnd);
  if (name === 'OwnedColdGate' && original.readInt16LE(offset + 12) > 0) gateIndex = i;
  if (name === '@feat.00') featureIndex = i;
  i += 1 + original.readUInt8(offset + 17);
}
if (gateIndex < 0 || featureIndex < 0) throw new Error('Owned gate and feature symbols are required.');
const headerEnd = 20 + sections * 40;
const sectionName = Buffer.from('.gehcont$y\0', 'ascii');
const dataOffset = original.length + 40 + sectionName.length;
const bytes = Buffer.concat([
  original.subarray(0, headerEnd), Buffer.alloc(40), original.subarray(headerEnd),
  sectionName, Buffer.alloc(4),
]);
bytes.writeUInt16LE(sections + 1, 2);
bytes.writeUInt32LE(symbolOffset + 40, 8);
for (let i = 0; i < sections; ++i) {
  for (const field of [20, 24, 28]) {
    const offset = 20 + i * 40 + field;
    const pointer = bytes.readUInt32LE(offset);
    if (pointer !== 0) bytes.writeUInt32LE(pointer + 40, offset);
  }
}
bytes.write(`/${stringSize}`, headerEnd, 'ascii');
bytes.writeUInt32LE(4, headerEnd + 16);
bytes.writeUInt32LE(dataOffset, headerEnd + 20);
bytes.writeUInt32LE(0x40300040, headerEnd + 36);
bytes.writeUInt32LE(gateIndex, dataOffset);
bytes.writeUInt32LE(stringSize + sectionName.length, strings + 40);
const features = symbolOffset + 40 + featureIndex * 18 + 8;
bytes.writeUInt32LE(bytes.readUInt32LE(features) | 0x4000, features);
writeFileSync(output, bytes);
