import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';

export const MAX_IMAGE_BYTES = 1024 * 1024 * 1024;
const DEFAULT_INSPECTION_BYTES = 64 * 1024 * 1024;
const MAX_SECTIONS = 96;
const MAX_EXPORTS = 512;
const MAX_DEBUG_ENTRIES = 128;

const machineNames = new Map([[0x014c, 'x86'], [0x8664, 'x64'], [0xaa64, 'arm64'], [0x01c0, 'arm'], [0x0200, 'ia64']]);
const sectionFlags = [[0x00000020, 'code'], [0x00000040, 'initialized_data'], [0x00000080, 'uninitialized_data'], [0x20000000, 'execute'], [0x40000000, 'read'], [0x80000000, 'write']];

function fail(code) { throw new Error(`INVALID_PE: ${code}`); }
function range(buffer, offset, length) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset > buffer.length || length > buffer.length - offset) fail('TRUNCATED');
}
function u16(buffer, offset) { range(buffer, offset, 2); return buffer.readUInt16LE(offset); }
function u32(buffer, offset) { range(buffer, offset, 4); return buffer.readUInt32LE(offset); }
function ascii(buffer, offset, max = 256) {
  range(buffer, offset, 1); const end = Math.min(buffer.length, offset + max); let at = offset;
  while (at < end && buffer[at] !== 0) at += 1;
  if (at === end) return null;
  return buffer.subarray(offset, at).toString('ascii');
}
function hex(value) { return `0x${value.toString(16).padStart(8, '0')}`; }

function rvaOffset(rva, length, sections, fileSize) {
  for (const section of sections) {
    if (rva >= section.virtualAddress) {
      const offset = section.rawOffset + (rva - section.virtualAddress);
      const relative = rva - section.virtualAddress;
      if (relative <= section.rawSize && length <= section.rawSize - relative && offset <= fileSize && length <= fileSize - offset) return offset;
    }
  }
  return null;
}

/** Parse an already-read, unmodified prefix of a PE image. Never returns image bytes. */
export function parseNativeImage(buffer, { fileSize = buffer.length } = {}) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('buffer must be a Buffer');
  if (!Number.isSafeInteger(fileSize) || fileSize < buffer.length) throw new TypeError('invalid fileSize');
  if (buffer.length < 0x40 || buffer[0] !== 0x4d || buffer[1] !== 0x5a) fail('MZ');
  const peOffset = u32(buffer, 0x3c);
  range(buffer, peOffset, 24);
  if (buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') fail('PE_SIGNATURE');
  const machine = u16(buffer, peOffset + 4);
  const sectionCount = u16(buffer, peOffset + 6);
  const optionalSize = u16(buffer, peOffset + 20);
  if (sectionCount === 0 || sectionCount > MAX_SECTIONS) fail('SECTION_COUNT');
  const optionalOffset = peOffset + 24;
  range(buffer, optionalOffset, optionalSize);
  const magic = u16(buffer, optionalOffset);
  if (magic !== 0x10b && magic !== 0x20b) fail('OPTIONAL_HEADER');
  const numberOfDirectoriesOffset = optionalOffset + (magic === 0x10b ? 92 : 108);
  if (optionalSize < numberOfDirectoriesOffset - optionalOffset + 4) fail('DIRECTORY_TABLE');
  const numberOfDirectories = u32(buffer, numberOfDirectoriesOffset);
  const directoryOffset = optionalOffset + (magic === 0x10b ? 96 : 112);
  if (numberOfDirectories > 16 || optionalSize < directoryOffset - optionalOffset + numberOfDirectories * 8) fail('DIRECTORY_TABLE');
  const sectionOffset = optionalOffset + optionalSize;
  range(buffer, sectionOffset, sectionCount * 40);
  const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const at = sectionOffset + index * 40;
    const name = buffer.subarray(at, at + 8).toString('ascii').replace(/\0.*$/, '');
    const virtualSize = u32(buffer, at + 8), virtualAddress = u32(buffer, at + 12), rawSize = u32(buffer, at + 16), rawOffset = u32(buffer, at + 20), characteristics = u32(buffer, at + 36);
    if (rawSize && (rawOffset > fileSize || rawSize > fileSize - rawOffset)) fail('SECTION_RANGE');
    sections.push({ name, virtualSize, rawSize, characteristics: hex(characteristics), flags: sectionFlags.filter(([bit]) => (characteristics & bit) !== 0).map(([, name]) => name), virtualAddress, rawOffset });
  }
  const directory = index => index < numberOfDirectories ? { rva: u32(buffer, directoryOffset + index * 8), size: u32(buffer, directoryOffset + index * 8 + 4) } : { rva: 0, size: 0 };
  const exportsDirectory = directory(0), security = directory(4), debug = directory(6);
  for (const entry of [exportsDirectory, security, debug]) {
    if ((entry.rva === 0) !== (entry.size === 0)) fail('DIRECTORY_RANGE');
  }
  const safeSections = sections.map(({ virtualAddress, rawOffset, ...section }) => section);
  const result = {
    format: 'pe', architecture: machineNames.get(machine) ?? `unknown-${hex(machine)}`, machine: hex(machine),
    sections: safeSections,
    signatureTable: { present: security.rva !== 0 && security.size !== 0, fileOffset: security.rva || null, size: security.size || null, verified: false },
    debugInfo: { present: debug.rva !== 0 && debug.size !== 0, count: null, truncated: false },
    exports: { present: exportsDirectory.rva !== 0 && exportsDirectory.size !== 0, inspected: false, names: [], truncated: false },
  };
  if (security.rva && security.size && (security.rva > fileSize || security.size > fileSize - security.rva)) fail('SECURITY_RANGE');
  if (debug.rva && debug.size) {
    const at = rvaOffset(debug.rva, debug.size, sections, fileSize);
    if (at === null) fail('DEBUG_RANGE');
    if (debug.size % 28 !== 0) fail('DEBUG_TABLE');
    result.debugInfo.truncated = debug.size / 28 > MAX_DEBUG_ENTRIES;
    if (at + debug.size <= buffer.length) result.debugInfo.count = Math.min(debug.size / 28, MAX_DEBUG_ENTRIES);
  }
  if (exportsDirectory.rva && exportsDirectory.size) {
    const at = rvaOffset(exportsDirectory.rva, 40, sections, fileSize);
    if (at === null) fail('EXPORT_RANGE');
    if (at !== null && at + 40 <= buffer.length) {
      result.exports.inspected = true;
      const numberOfNames = u32(buffer, at + 24), namesRva = u32(buffer, at + 32);
      if (numberOfNames > 1_000_000) fail('EXPORT_COUNT');
      result.exports.truncated = numberOfNames > MAX_EXPORTS;
      const namesLength = Math.min(numberOfNames, MAX_EXPORTS) * 4;
      const namesAt = rvaOffset(namesRva, namesLength, sections, fileSize);
      if (namesAt !== null && namesAt + namesLength <= buffer.length) {
        for (let index = 0; index < Math.min(numberOfNames, MAX_EXPORTS); index += 1) {
          const nameRva = u32(buffer, namesAt + index * 4);
          const nameAt = rvaOffset(nameRva, 256, sections, fileSize);
          if (nameAt === null || nameAt >= buffer.length) { result.exports.truncated = true; break; }
          const name = ascii(buffer, nameAt);
          if (name === null) { result.exports.truncated = true; break; }
          result.exports.names.push(name);
        }
      } else result.exports.truncated = true;
    } else result.exports.truncated = true;
  }
  return result;
}

async function sha256(handle, size) {
  const hash = createHash('sha256');
  const chunk = Buffer.alloc(1024 * 1024);
  for (let position = 0; position < size;) {
    const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, size - position), position);
    if (bytesRead === 0) throw new Error('INPUT_CHANGED_DURING_READ');
    hash.update(chunk.subarray(0, bytesRead)); position += bytesRead;
  }
  return hash.digest('hex');
}

/** Read-only inventory. Parsing is deliberately limited to a prefix; hashing covers the whole input. */
export async function inventoryNativeImage(path, { maxInspectionBytes = DEFAULT_INSPECTION_BYTES } = {}) {
  if (!Number.isSafeInteger(maxInspectionBytes) || maxInspectionBytes < 4096 || maxInspectionBytes > MAX_IMAGE_BYTES) throw new TypeError('invalid maxInspectionBytes');
  const handle = await open(path, 'r');
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error('INPUT_NOT_FILE');
    if (metadata.size > MAX_IMAGE_BYTES) throw new Error('INPUT_TOO_LARGE');
    const readLength = Math.min(metadata.size, maxInspectionBytes);
    const prefix = Buffer.alloc(readLength);
    const { bytesRead } = await handle.read(prefix, 0, readLength, 0);
    const image = parseNativeImage(prefix.subarray(0, bytesRead), { fileSize: metadata.size });
    const digest = await sha256(handle, metadata.size);
    const finalMetadata = await handle.stat();
    if (finalMetadata.size !== metadata.size || finalMetadata.mtimeMs !== metadata.mtimeMs || finalMetadata.ctimeMs !== metadata.ctimeMs) throw new Error('INPUT_CHANGED_DURING_READ');
    return { sha256: digest, fileSize: metadata.size, inspectedBytes: bytesRead, ...image };
  } finally { await handle.close(); }
}
