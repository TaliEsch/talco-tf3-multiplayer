import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeLoanResourceObservation40408 as decode} from '../tools/probes/loan-resource-readback-40408.mjs';

function inline(value, offset, header) {
  const bytes = Buffer.from(value);
  assert.ok(bytes.length <= 15);
  bytes.copy(header, offset);
  header.writeBigUInt64LE(BigInt(bytes.length), offset + 16);
  header.writeBigUInt64LE(15n, offset + 24);
}
function fixture() {
  const header = Buffer.alloc(64);
  inline('::', 0, header);
  const path = Buffer.from('/game_mechanics/finance/loan.gs.lua\0');
  header.writeBigUInt64LE(0x123400n, 32);
  header.writeBigUInt64LE(BigInt(path.length - 1), 48);
  header.writeBigUInt64LE(63n, 56);
  return {header, path};
}
test('bounded inline and pointed resource fields remain observation only', () => {
  const {header, path} = fixture();
  let calls = 0;
  const result = decode(header, (address, count) => {
    calls++; assert.equal(address, 0x123400n); assert.equal(count, path.length); return path;
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.strings.map(s => s.value), ['::', '/game_mechanics/finance/loan.gs.lua']);
  assert.equal(result.activationPermitted, false);
  assert.equal(result.loanIdentityQualified, false);
  assert.equal(result.worldGenerationQualified, false);
});
test('two empty inline fields do not dereference pointers', () => {
  const header = Buffer.alloc(64); inline('', 0, header); inline('', 32, header);
  assert.deepEqual(decode(header, () => assert.fail('unexpected read')).strings.map(s => s.value), ['', '']);
});
test('invalid lengths are rejected before pointer reads', () => {
  for (const [length, capacity] of [[257n, 511n], [20n, 19n], [16n, 15n]]) {
    const {header} = fixture(); header.writeBigUInt64LE(length, 48); header.writeBigUInt64LE(capacity, 56);
    assert.throws(() => decode(header, () => assert.fail('unexpected read')), /RESOURCE_READBACK_LENGTH/);
  }
});
test('null and overflowing pointer spans are rejected before reads', () => {
  for (const pointer of [0n, (1n << 64n) - 2n]) {
    const {header} = fixture(); header.writeBigUInt64LE(pointer, 32);
    assert.throws(() => decode(header, () => assert.fail('unexpected read')), /RESOURCE_READBACK_ADDRESS/);
  }
});
test('missing, short and failed pointer reads are unknown', () => {
  const {header} = fixture();
  for (const read of [() => undefined, () => Buffer.alloc(1), () => {throw Error('unreadable');}]) {
    assert.throws(() => decode(header, read), /RESOURCE_READBACK_READ_FAILED/);
  }
});
test('terminator, embedded NUL, encoding and controls fail closed', () => {
  for (const kind of ['terminator', 'embedded', 'encoding', 'control']) {
    const {header, path} = fixture();
    if (kind === 'terminator') path[path.length - 1] = 1;
    if (kind === 'embedded') path[2] = 0;
    if (kind === 'encoding') path[2] = 0xff;
    if (kind === 'control') path[2] = 10;
    assert.throws(() => decode(header, () => path), /RESOURCE_READBACK_(TERMINATOR|ENCODING|CONTROL_CHARACTER)/);
  }
});
test('truncated headers and asynchronous readers are rejected', () => {
  assert.throws(() => decode(Buffer.alloc(63), () => Buffer.alloc(1)), /RESOURCE_READBACK_HEADER/);
  const {header, path} = fixture();
  assert.throws(() => decode(header, async () => path), /RESOURCE_READBACK_READ_FAILED/);
});
