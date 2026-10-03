// Observation only: exact-image ResName layout from comparator 0x9ff30.
// The caller must keep the observed invocation alive and stationary while
// capturing the 64-byte header and reading any pointed-to string storage.
// Neither this decoder nor a matching name grants execution authority.
const MAX_STRING_BYTES = 256;
const UINT64_MAX = (1n << 64n) - 1n;
const decoder = new TextDecoder('utf-8', {fatal: true});
function fail(code) { throw new Error('RESOURCE_READBACK_' + code); }

export function decodeLoanResourceObservation40408(header, readSpan) {
  if (!Buffer.isBuffer(header) || header.length !== 64) fail('HEADER');
  if (typeof readSpan !== 'function') fail('READER');
  const strings = [];
  for (const offset of [0, 32]) {
    const length = header.readBigUInt64LE(offset + 16);
    const capacity = header.readBigUInt64LE(offset + 24);
    if (length > BigInt(MAX_STRING_BYTES) || length > capacity) fail('LENGTH');
    let bytes, storage;
    if (capacity < 16n) {
      if (length > 15n) fail('INLINE_LENGTH');
      bytes = header.subarray(offset, offset + Number(length) + 1);
      storage = 'inline';
    } else {
      const address = header.readBigUInt64LE(offset);
      const count = Number(length) + 1;
      if (address === 0n || address > UINT64_MAX - BigInt(count - 1)) fail('ADDRESS');
      try { bytes = readSpan(address, count); }
      catch { fail('READ_FAILED'); }
      if (!Buffer.isBuffer(bytes) || bytes.length !== count) fail('READ_FAILED');
      storage = 'pointer';
    }
    if (bytes[Number(length)] !== 0 || bytes.subarray(0, Number(length)).includes(0)) fail('TERMINATOR');
    let value;
    try { value = decoder.decode(bytes.subarray(0, Number(length))); }
    catch { fail('ENCODING'); }
    if (/[\x00-\x1f\x7f]/u.test(value)) fail('CONTROL_CHARACTER');
    strings.push({value, length: Number(length), capacity: capacity.toString(), storage});
  }
  return {scope: 'resource-observation-exact-40408', strings,
    activationPermitted: false, loanIdentityQualified: false, worldGenerationQualified: false};
}
