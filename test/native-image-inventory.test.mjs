import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNativeImage } from '../src/native-image-inventory.mjs';

function image({ exports = false, debug = false, signature = false } = {}) {
  const b = Buffer.alloc(0x800); b.write('MZ'); b.writeUInt32LE(0x80, 0x3c); b.write('PE\0\0', 0x80);
  b.writeUInt16LE(0x8664, 0x84); b.writeUInt16LE(1, 0x86); b.writeUInt16LE(0xf0, 0x94);
  b.writeUInt16LE(0x20b, 0x98); b.writeUInt32LE(16, 0x98 + 108);
  b.write('.rdata', 0x188); b.writeUInt32LE(0x600, 0x190); b.writeUInt32LE(0x1000, 0x194); b.writeUInt32LE(0x600, 0x198); b.writeUInt32LE(0x200, 0x19c); b.writeUInt32LE(0x40000040, 0x1ac);
  if (exports) { b.writeUInt32LE(0x1000, 0x108); b.writeUInt32LE(40, 0x10c); b.writeUInt32LE(1, 0x218); b.writeUInt32LE(0x1120, 0x220); b.writeUInt32LE(0x1130, 0x320); b.write('KnownExport\0', 0x330); }
  if (signature) { b.writeUInt32LE(0x700, 0x128); b.writeUInt32LE(32, 0x12c); }
  if (debug) { b.writeUInt32LE(0x1200, 0x138); b.writeUInt32LE(56, 0x13c); }
  return b;
}
test('reports a bounded PE inventory without image bytes or debug paths', () => {
  const report = parseNativeImage(image({ exports: true, debug: true, signature: true }));
  assert.equal(report.architecture, 'x64'); assert.deepEqual(report.exports.names, ['KnownExport']);
  assert.equal(report.debugInfo.count, 2); assert.equal(report.signatureTable.present, true); assert.equal(report.signatureTable.verified, false);
  assert.deepEqual(report.sections[0], { name: '.rdata', virtualSize: 0x600, rawSize: 0x600, characteristics: '0x40000040', flags: ['initialized_data', 'read'] });
  assert.equal(JSON.stringify(report).includes('KnownExport'), true); assert.equal(JSON.stringify(report).includes('C:\\'), false);
});
test('rejects malformed and truncated headers and absurd export counts', () => {
  assert.throws(() => parseNativeImage(Buffer.from('MZ')), /INVALID_PE: MZ/);
  const truncated = image(); truncated.writeUInt32LE(0x900, 0x3c); assert.throws(() => parseNativeImage(truncated), /TRUNCATED/);
  const badExports = image({ exports: true }); badExports.writeUInt32LE(1_000_001, 0x218); assert.throws(() => parseNativeImage(badExports), /EXPORT_COUNT/);
});

test('respects optional directory count and rejects invalid directory/file ranges', () => {
  const absent=image({exports:true}); absent.writeUInt32LE(0,0x104);
  assert.equal(parseNativeImage(absent).exports.present,false);
  const excessive=image(); excessive.writeUInt32LE(17,0x104);
  assert.throws(()=>parseNativeImage(excessive),/DIRECTORY_TABLE/);
  const signature=image({signature:true}); signature.writeUInt32LE(0x1000,0x128);
  assert.throws(()=>parseNativeImage(signature),/SECURITY_RANGE/);
  const tail=image({exports:true}); tail.writeUInt32LE(0x2000,0x190); tail.writeUInt32LE(0x1700,0x108);
  assert.throws(()=>parseNativeImage(tail),/EXPORT_RANGE/);
});

test('unread export names are explicitly incomplete rather than absent', () => {
  const full=image({exports:true});
  const report=parseNativeImage(full.subarray(0,0x300),{fileSize:full.length});
  assert.equal(report.exports.present,true);
  assert.equal(report.exports.truncated,true);
  assert.deepEqual(report.exports.names,[]);
});
