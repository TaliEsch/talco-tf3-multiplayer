// Private exact-build inputs; emits hashes and RVAs only, never game code.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const [imagePath, metadataPath, simulationPath, outputPath, stateGetterPath] = process.argv.slice(2);
assert.ok(imagePath && metadataPath && simulationPath && outputPath);
const image = await readFile(imagePath);
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
const simulation = JSON.parse(await readFile(simulationPath, 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = 'de1daad3a13f3b7e9f79903361bb43769cf4f15e59271a263aefe1f075f23ef2';
assert.equal(digest(image), expected);
assert.equal(metadata.imageSha256, expected);
assert.equal(simulation.imageSha256, expected);
assert.equal(image.readUInt16LE(0), 0x5a4d);
const pe = image.readUInt32LE(0x3c);
assert.equal(image.readUInt32LE(pe), 0x4550);
assert.equal(image.readUInt16LE(pe + 4), 0x8664);
const sections = image.readUInt16LE(pe + 6);
const optionalBytes = image.readUInt16LE(pe + 20);
assert.equal(image.readUInt16LE(pe + 24), 0x20b);
const sectionStart = pe + 24 + optionalBytes;
assert.ok(sections > 0 && sections < 100 && sectionStart + sections * 40 <= image.length);
function rvaBytes(rva, size) {
  assert.ok(Number.isSafeInteger(rva) && Number.isSafeInteger(size) && rva > 0 && size > 0);
  for (let i = 0; i < sections; ++i) {
    const entry = sectionStart + i * 40;
    const base = image.readUInt32LE(entry + 12);
    const rawSize = image.readUInt32LE(entry + 16);
    const rawOffset = image.readUInt32LE(entry + 20);
    if (rva >= base && rva - base < rawSize && size <= rawSize - (rva - base)) {
      const offset = rawOffset + rva - base;
      assert.ok(offset + size <= image.length);
      return image.subarray(offset, offset + size);
    }
  }
  throw new Error('PIN_OUTSIDE_RAW_IMAGE');
}
const pins = [];
function pin(rva, size, sha256) {
  rva = Number(rva);
  assert.match(sha256, /^[a-f0-9]{64}$/);
  assert.equal(digest(rvaBytes(rva, size)), sha256);
  pins.push({ rva, size, sha256 });
}
function functionPins(fn) {
  pin(fn.beginRva, fn.size, fn.sha256);
  for (const row of fn.pdata) {
    pin(row.entryRva, 12, row.entrySha256);
    pin(row.unwind.rva, row.unwind.headerCodesTrailerHex.length / 2, row.unwind.sha256);
  }
}
const names = ['gettop', 'checkstack', 'type', 'tolstring', 'pushboolean', 'settop',
  'pushcclosure', 'setglobal', 'pcallk', 'stockRegistrar'];
assert.deepEqual(metadata.functions.map(fn => fn.name), names);
for (const fn of metadata.functions) functionPins(fn);
functionPins(metadata.registrationCall.caller);
pin(metadata.registrationCall.context.beginRva, metadata.registrationCall.context.hex.length / 2,
  metadata.registrationCall.context.sha256);
pin(simulation.functionCode.beginRva, simulation.functionCode.byteLength, simulation.functionCode.sha256);
pin(simulation.runtimeFunction.rva, simulation.runtimeFunction.byteLength, simulation.runtimeFunction.sha256);
pin(simulation.unwind.rva, simulation.unwind.prefixThroughImmediateHandlerData.byteLength,
  simulation.unwind.prefixThroughImmediateHandlerData.sha256);
let stateGetter = null;
if (stateGetterPath) {
  stateGetter = JSON.parse(await readFile(stateGetterPath, 'utf8'));
  assert.equal(stateGetter.imageSha256, expected);
  assert.equal(stateGetter.notActivation, true);
  assert.equal(stateGetter.activationPermitted, false);
  assert.equal(stateGetter.callableAbiLiveQualified, false);
  assert.equal(stateGetter.scope, 'exact-40408-loan-state-getter-static-evidence');
  assert.ok(Array.isArray(stateGetter.functions) && stateGetter.functions.length > 0);
  assert.ok(Array.isArray(stateGetter.supportFunctions) && stateGetter.supportFunctions.length > 0);
  assert.ok(Array.isArray(stateGetter.dataPins));
  const admittedFunctions = new Set();
  for (const fn of [...stateGetter.functions, ...stateGetter.supportFunctions]) {
    assert.ok(fn && typeof fn.name === 'string' && !admittedFunctions.has(fn.name), 'DUPLICATE_STATE_GETTER_FUNCTION');
    assert.match(fn.name, /^[A-Za-z_][A-Za-z0-9_]*$/);
    admittedFunctions.add(fn.name);
    assert.deepEqual(fn.baseRelocationRvas ?? [], [], `RELOCATED_CODE_SPAN_${fn.name}`);
    for (const row of fn.pdata ?? []) {
      assert.deepEqual(row.baseRelocationRvas ?? [], [], `RELOCATED_PDATA_SPAN_${fn.name}`);
      assert.deepEqual(row.unwind?.baseRelocationRvas ?? [], [], `RELOCATED_UNWIND_SPAN_${fn.name}`);
    }
    functionPins(fn);
  }
  // Relocation-dependent vtable/RTTI pointers are structural RVAs only. Hash
  // direct file bytes solely for spans with no DIR64 relocations; do not mask.
  for (const row of stateGetter.dataPins) {
    assert.ok(row && typeof row.name === 'string' && Array.isArray(row.baseRelocationRvas));
    if (row.baseRelocationRvas.length) continue;
    pin(row.rva, row.byteLength, row.sha256);
  }
  assert.equal(stateGetter.closureLayout?.expectedFunctionRva != null, true);
  assert.equal(stateGetter.receiverLayout?.vtableRva != null, true);
  assert.equal(stateGetter.classLookup?.keyCellRva != null, true);
  assert.equal(Number(stateGetter.closureLayout.expectedFunctionRva),
    Number(stateGetter.supportFunctions.find(fn => fn.name === 'getterThunk')?.beginRva));
  assert.equal(Number(stateGetter.receiverLayout.vtableRva),
    Number(stateGetter.dataPins.find(row => row.name === 'UserdataPtrVtableFirstSlot')?.rva));
  assert.equal(Number(stateGetter.classLookup.keyCellRva),
    Number(stateGetter.dataPins.find(row => row.name === 'mutableClassRegistryKeyCell')?.rva));
  assert.equal(stateGetter.absentApi?.name, 'lua_tocfunction');
  assert.equal(stateGetter.absentApi?.status?.includes('No admitted RVA'), true);
}
// Reject relocations within any admitted span: file hashes must equal mapped hashes.
const directory = pe + 24 + 112 + 5 * 8;
const relocationRva = image.readUInt32LE(directory);
const relocationSize = image.readUInt32LE(directory + 4);
if (relocationSize) {
  const relocations = rvaBytes(relocationRva, relocationSize);
  let offset = 0;
  while (offset < relocations.length) {
    assert.ok(offset + 8 <= relocations.length);
    const page = relocations.readUInt32LE(offset);
    const bytes = relocations.readUInt32LE(offset + 4);
    assert.ok(bytes >= 8 && bytes % 2 === 0 && offset + bytes <= relocations.length);
    for (let j = offset + 8; j < offset + bytes; j += 2) {
      const entry = relocations.readUInt16LE(j);
      const kind = entry >>> 12;
      if (!kind) continue;
      assert.equal(kind, 10);
      const address = page + (entry & 0xfff);
      assert.ok(pins.every(p => address + 8 <= p.rva || address >= p.rva + p.size), 'RELOCATED_PIN');
    }
    offset += bytes;
  }
}
const cppDigest = hex => `{${hex.match(/../g).map(x => '0x' + x).join(',')}}`;
const text = `#pragma once\n#include <array>\n#include <cstdint>\nnamespace tf3loanpins {\n` +
  `struct Pin { std::uint32_t rva, bytes; std::array<unsigned char,32> hash; };\n` +
  `inline constexpr std::array<unsigned char,32> image_hash = ${cppDigest(expected)};\n` +
  names.map(name => `inline constexpr std::uint32_t ${name} = ${Number(metadata.functions.find(x => x.name === name).beginRva)};\n`).join('') +
  (stateGetter ? (() => {
    const existing = new Set(names);
    const apiConstants = stateGetter.functions
      .filter(fn => !existing.has(fn.name))
      .map(fn => `inline constexpr std::uint32_t ${fn.name} = ${Number(fn.beginRva)};\n`).join('');
    const support = new Map(stateGetter.supportFunctions.map(fn => [fn.name, fn]));
    const structural = [
      ['getterThunk', support.get('getterThunk')?.beginRva],
      ['userdataVtable', stateGetter.receiverLayout.vtableRva],
      ['classRegistryKeyCell', stateGetter.classLookup.keyCellRva]
    ];
    for (const [name, rva] of structural) assert.ok(rva != null, `MISSING_STRUCTURAL_RVA_${name}`);
    const structuralConstants = `// Structural RVAs only; relocated vtable bytes are not compared to file bytes.\n` + structural.map(([name, rva]) =>
      `inline constexpr std::uint32_t ${name} = ${Number(rva)};\n`).join('');
    return apiConstants + structuralConstants;
  })() : '') +
  `inline constexpr Pin pins[] = {\n${pins.map(p => `{${p.rva},${p.size},${cppDigest(p.sha256)}}`).join(',\n')}\n};\n}\n`;
await writeFile(outputPath, text);
console.log(JSON.stringify(stateGetter
  ? { scope: 'inert-loan-diagnostic-pins', pins: pins.length, imageSha256: expected,
      stateGetterEvidence: true, activationPermitted: false }
  : { scope: 'inert-loan-diagnostic-pins', pins: pins.length, imageSha256: expected,
      activationPermitted: false }));
