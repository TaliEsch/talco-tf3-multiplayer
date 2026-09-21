import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { inspectNativeHookCandidates } from '../src/native-hook-candidates.mjs';

// A synthetic PE32+ image with executable .text, string-only .rdata, and one
// .pdata runtime-function entry. It contains no bytes from a real executable.
function image({ text = 'GameSim::Step', leaTargetRva = 0x2040 } = {}) {
  const bytes = Buffer.alloc(0x800);
  bytes.write('MZ', 0); bytes.writeUInt32LE(0x80, 0x3c);
  bytes.write('PE\0\0', 0x80);
  bytes.writeUInt16LE(0x8664, 0x84); // x64
  bytes.writeUInt16LE(3, 0x86);
  bytes.writeUInt16LE(0xf0, 0x94); // PE32+ optional header
  bytes.writeUInt16LE(0x20b, 0x98);
  bytes.writeUInt32LE(0x3000, 0xd0); // SizeOfImage
  bytes.writeUInt32LE(4, 0x104); // NumberOfRvaAndSizes
  bytes.writeUInt32LE(0x2800, 0x120); // Exception directory RVA
  bytes.writeUInt32LE(12, 0x124); // one RUNTIME_FUNCTION

  section(bytes, 0x188, '.text', 0x1000, 0x200, 0x200, 0x200, 0x60000020);
  section(bytes, 0x1b0, '.rdata', 0x2000, 0x200, 0x200, 0x400, 0x40000040);
  section(bytes, 0x1d8, '.pdata', 0x2800, 0x200, 0x200, 0x600, 0x40000040);

  const instructionRva = 0x1020;
  bytes.set([0x48, 0x8d, 0x0d], 0x220); // lea rcx, [rip + disp32]
  bytes.writeInt32LE(leaTargetRva - (instructionRva + 7), 0x223);
  bytes.write(`${text}\0`, 0x440, 'ascii');
  bytes.writeUInt32LE(0x1000, 0x600); // BeginAddress
  bytes.writeUInt32LE(0x1100, 0x604); // EndAddress
  bytes.writeUInt32LE(0x2840, 0x608); // UnwindInfoAddress
  bytes[0x640]=1; // UNWIND_INFO version 1, no flags or unwind codes
  return bytes;
}

function section(bytes, offset, name, rva, virtualSize, rawSize, rawOffset, characteristics) {
  bytes.write(name, offset, 'ascii');
  bytes.writeUInt32LE(virtualSize, offset + 8);
  bytes.writeUInt32LE(rva, offset + 12);
  bytes.writeUInt32LE(rawSize, offset + 16);
  bytes.writeUInt32LE(rawOffset, offset + 20);
  bytes.writeUInt32LE(characteristics, offset + 36);
}

test('reports a static-only exact-string LEA candidate bounded to its runtime-function range', () => {
  const bytes = image();
  assert.deepEqual(inspectNativeHookCandidates(bytes), {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    peTimestamp: 0,
    sizeOfImage: 0x3000,
    evidence: 'static-candidate-only',
    hookReady: false,
    limitations: [
      'byte-pattern matches are not decoded or verified instruction boundaries or function identities and cannot authorize patching',
      'function-range digests fingerprint on-disk exception-table ranges only; they do not establish live memory integrity, ABI, thread ownership, or hook safety',
    ],
    candidates: [{
      label: 'simulationStep', stringRva: 0x2040, referenceInstructionRva: 0x1020,
      functionRange: { beginRva: 0x1000, endRva: 0x1100 },
      functionRangeSha256: createHash('sha256').update(bytes.subarray(0x200,0x300)).digest('hex'),
      primaryFunctionRange: { beginRva: 0x1000, endRva: 0x1100 },
      unwindChainDepth: 0, unwindVersion: 1, unwindFlags: 0, unwindHandlerRva: null,
      evidence: 'static-candidate-only', hookReady: false,
    }],
  });
});

test('does not report a candidate when the anchor is wrong or the LEA target is unmapped', () => {
  for (const fixture of [image({ text: 'GameSim::Steps' }), image({ leaTargetRva: 0x5000 })]) {
    const report = inspectNativeHookCandidates(fixture);
    assert.deepEqual(report.candidates, []);
    assert.equal(report.evidence, 'static-candidate-only');
    assert.equal(report.hookReady, false);
  }
});

test('fails closed on truncated or malformed PE64 images and missing exception data', () => {
  assert.throws(() => inspectNativeHookCandidates(Buffer.from('MZ')), /invalid PE64 image/);
  assert.throws(() => inspectNativeHookCandidates(image().subarray(0, 0x230)), /invalid PE64 image/);

  const nonX64 = image(); nonX64.writeUInt16LE(0x14c, 0x84);
  assert.throws(() => inspectNativeHookCandidates(nonX64), /invalid PE64 image/);

  const missingPdata = image(); missingPdata.writeUInt32LE(0, 0x120); missingPdata.writeUInt32LE(0, 0x124);
  assert.throws(() => inspectNativeHookCandidates(missingPdata), /invalid PE64 image/);
});

test('sorts disjoint runtime ranges and rejects overlapping ranges', () => {
  const bytes = image();
  bytes.writeUInt32LE(24, 0x124);
  bytes.copy(bytes, 0x60c, 0x600, 0x60c);
  bytes.writeUInt32LE(0x1100, 0x600);
  bytes.writeUInt32LE(0x1200, 0x604);
  assert.equal(inspectNativeHookCandidates(bytes).candidates[0].functionRange.beginRva, 0x1000);
  bytes.writeUInt32LE(0x10f0, 0x600);
  assert.throws(() => inspectNativeHookCandidates(bytes), /invalid PE64 image/);
});

test('range digest and PE identity change when executable bytes or timestamp change', () => {
  const first=image(),second=image();
  second[0x240]^=0xff;
  second.writeUInt32LE(0x12345678,0x88);
  const a=inspectNativeHookCandidates(first),b=inspectNativeHookCandidates(second);
  assert.notEqual(a.sha256,b.sha256);
  assert.notEqual(a.candidates[0].functionRangeSha256,b.candidates[0].functionRangeSha256);
  assert.equal(b.peTimestamp,0x12345678);
  assert.equal(b.sizeOfImage,a.sizeOfImage);
  assert.equal(b.hookReady,false);
});

test('resolves bounded chained unwind fragments to their primary runtime entry',()=>{
  const bytes=image();
  bytes.writeUInt32LE(24,0x124);
  // Move the primary entry to the second slot and make the first entry a
  // fragment whose UNWIND_INFO chains to it.
  bytes.writeUInt32LE(0x1000,0x60c);bytes.writeUInt32LE(0x1010,0x610);bytes.writeUInt32LE(0x2820,0x614);
  bytes.writeUInt32LE(0x1010,0x600);bytes.writeUInt32LE(0x1100,0x604);bytes.writeUInt32LE(0x2830,0x608);
  bytes[0x620]=1;
  bytes[0x630]=(4<<3)|1;
  bytes.writeUInt32LE(0x1000,0x634);bytes.writeUInt32LE(0x1010,0x638);bytes.writeUInt32LE(0x2820,0x63c);
  const report=inspectNativeHookCandidates(bytes);
  assert.equal(report.candidates[0].unwindChainDepth,1);
  assert.equal(report.candidates[0].unwindFlags,4);
  assert.deepEqual(report.candidates[0].primaryFunctionRange,{beginRva:0x1000,endRva:0x1010});
});

test('rejects missing and cyclic chained unwind targets',()=>{
  const fixture=()=>{
    const bytes=image();bytes.writeUInt32LE(24,0x124);
    bytes.writeUInt32LE(0x1010,0x600);bytes.writeUInt32LE(0x1100,0x604);bytes.writeUInt32LE(0x2830,0x608);
    bytes.writeUInt32LE(0x1000,0x60c);bytes.writeUInt32LE(0x1010,0x610);bytes.writeUInt32LE(0x2820,0x614);
    bytes[0x620]=1;bytes[0x630]=(4<<3)|1;
    return bytes;
  };
  const missing=fixture();
  missing.writeUInt32LE(0x1200,0x634);missing.writeUInt32LE(0x1210,0x638);missing.writeUInt32LE(0x2820,0x63c);
  assert.throws(()=>inspectNativeHookCandidates(missing),/invalid PE64 image/);
  const cyclic=fixture();
  cyclic.writeUInt32LE(0x1000,0x634);cyclic.writeUInt32LE(0x1010,0x638);cyclic.writeUInt32LE(0x2820,0x63c);
  cyclic[0x620]=(4<<3)|1;
  cyclic.writeUInt32LE(0x1010,0x624);cyclic.writeUInt32LE(0x1100,0x628);cyclic.writeUInt32LE(0x2830,0x62c);
  assert.throws(()=>inspectNativeHookCandidates(cyclic),/invalid PE64 image/);
});

test('rejects malformed unwind metadata and ignores a cross-boundary reference',()=>{
  const zeroUnwind=image();zeroUnwind.writeUInt32LE(0,0x608);
  assert.throws(()=>inspectNativeHookCandidates(zeroUnwind),/invalid PE64 image/);
  const badVersion=image();badVersion[0x640]=0;
  assert.throws(()=>inspectNativeHookCandidates(badVersion),/invalid PE64 image/);
  const tooManyDirectories=image();tooManyDirectories.writeUInt32LE(0xffffffff,0x104);
  assert.throws(()=>inspectNativeHookCandidates(tooManyDirectories),/invalid PE64 image/);
  const crossing=image();crossing.writeUInt32LE(0x1024,0x604);
  assert.deepEqual(inspectNativeHookCandidates(crossing).candidates,[]);
});
