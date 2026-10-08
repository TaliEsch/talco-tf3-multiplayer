import { MAX_USERDATA_IPC_BYTES } from "./constants.mjs";
import { randomUUID } from "node:crypto";
import { lstat, link, open, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";

const IDENTIFIER_VALUE = /^[A-Za-z0-9_.:-]{1,128}$/;
const VEHICLE_MODEL_VALUE = /^[A-Za-z0-9_.:/%-]{1,252}\.mdl$/;
const NONCE = /^[0-9a-f]{32}$/;

function fail(message) {
  throw new TypeError(`invalid userdata IPC: ${message}`);
}

export function parseFlatDataFile(source, { allowTemporaryEdgeEntitySentinel = false } = {}) {
  if (typeof allowTemporaryEdgeEntitySentinel !== "boolean") fail("sentinel option must be boolean");
  if (typeof source !== "string") fail("source must be text");
  if (Buffer.byteLength(source, "utf8") > MAX_USERDATA_IPC_BYTES) fail("file exceeds 4096 bytes");
  const wrapper = source.match(/^\s*function\s+data\s*\(\s*\)\s*return\s*\{([\s\S]*?)\}\s*end\s*$/);
  if (!wrapper) fail("wrapper does not match function data/return table form");
  const body = wrapper[1];
  const result = Object.create(null);
  let offset = 0;
  const skipWhitespace = () => { while (/\s/.test(body[offset] ?? "")) offset++; };
  while (true) {
    skipWhitespace();
    if (offset >= body.length) break;
    const keyMatch = body.slice(offset).match(/^([A-Za-z][A-Za-z0-9_]*)/);
    if (!keyMatch) fail("invalid field name");
    const key = keyMatch[1];
    if (Object.hasOwn(result, key)) fail(`duplicate field ${key}`);
    offset += key.length;
    skipWhitespace();
    if (body[offset++] !== "=") fail(`missing equals after ${key}`);
    skipWhitespace();
    let value;
    if (body[offset] === '"') {
      offset++;
      const end = body.indexOf('"', offset);
      if (end < 0) fail(`unterminated string for ${key}`);
      value = body.slice(offset, end);
      if (!(key === 'model' && VEHICLE_MODEL_VALUE.test(value) && !value.includes('..'))
        && !IDENTIFIER_VALUE.test(value)) fail(`string for ${key} is outside the allowlist`);
      offset = end + 1;
    } else {
      const signedBalance = ['originalBefore','originalAfter','referenceBefore',
        'referenceAfter','targetBefore','targetAfter'].includes(key);
      const signedTemporaryEdge = allowTemporaryEdgeEntitySentinel && key === "temporaryEdgeEntity";
      const valueMatch = body.slice(offset).match(signedBalance || signedTemporaryEdge
        ? /^(true|false|0|-?[1-9][0-9]*)/
        : /^(true|false|0|[1-9][0-9]*)/);
      if (!valueMatch) fail(`invalid scalar for ${key}`);
      value = valueMatch[1] === "true" ? true : valueMatch[1] === "false" ? false : Number(valueMatch[1]);
      if (typeof value === "number" && !Number.isSafeInteger(value)) fail(`${key} is not a safe integer`);
      if (typeof value === "number" && value < 0 && !(signedBalance || (signedTemporaryEdge && value === -1))) {
        fail(`${key} is negative outside its allowlist`);
      }
      offset += valueMatch[1].length;
    }
    skipWhitespace();
    if (body[offset++] !== ",") fail(`missing comma after ${key}`);
    result[key] = value;
  }
  return result;
}

function requireExactFields(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail("field set does not match the probe schema");
  }
}

export function parseProbeOutbox(source) {
  const value = parseFlatDataFile(source);
  requireExactFields(value, ["schemaVersion", "nonce", "counter", "kind"]);
  if (value.schemaVersion !== 1) fail("unsupported schema version");
  if (!NONCE.test(value.nonce)) fail("nonce must be 32 lowercase hex characters");
  if (!Number.isSafeInteger(value.counter) || value.counter < 0) fail("counter must be a nonnegative safe integer");
  if (value.kind !== "probe") fail("kind must be probe");
  return Object.freeze({ ...value });
}

function checkedIdentifier(value, name) {
  if (typeof value !== "string" || !IDENTIFIER_VALUE.test(value)) fail(`${name} is outside the identifier allowlist`);
  return value;
}

export function serializeProbeInbox({ nonce, counter, status }) {
  if (!NONCE.test(nonce)) fail("nonce must be 32 lowercase hex characters");
  if (!Number.isSafeInteger(counter) || counter < 0) fail("counter must be a nonnegative safe integer");
  checkedIdentifier(status, "status");
  if (status !== "ok") fail("status must be ok");
  const text = `function data()\nreturn {\n  schemaVersion = 1,\n  nonce = "${nonce}",\n  counter = ${counter},\n  status = "${status}",\n}\nend\n`;
  if (Buffer.byteLength(text, "utf8") > MAX_USERDATA_IPC_BYTES) fail("serialized response exceeds limit");
  return text;
}

export async function requirePlainDirectory(directory) {
  if (typeof directory !== "string" || !path.isAbsolute(directory)) fail("directory must be an absolute path");
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("directory must be a real directory, not a link");
  const resolved = await realpath(directory);
  if (path.resolve(directory).toLowerCase() !== path.resolve(resolved).toLowerCase()) fail("directory must not traverse a link");
  if (path.basename(resolved).toLowerCase() !== "tf3mp_status_1") fail("directory name must be tf3mp_status_1");
  return resolved;
}

const LUA_BASENAME = /^[A-Za-z][A-Za-z0-9_]{0,127}\.lua$/;
const TEMP_BASENAME = /^\.[A-Za-z][A-Za-z0-9_-]{0,127}\.tmp$/;
const OBSERVATION_MODE = "steam25754343-observation";

// The default preserves the original private-directory layout. The current
// build's allowlisted userdata location is selected only by an explicit mode.
export async function createUserdataStorageContext(directory, { mode = "legacy" } = {}) {
  if (mode !== "legacy" && mode !== OBSERVATION_MODE) fail("unknown userdata storage mode");
  const canonicalDirectory = await requirePlainDirectory(directory);
  let engineDirectory = canonicalDirectory;
  if (mode === OBSERVATION_MODE) {
    const candidate = path.join(path.dirname(canonicalDirectory), "mod_presets");
    const info = await lstat(candidate);
    if (!info.isDirectory() || info.isSymbolicLink()) fail("mod_presets must be a real directory");
    engineDirectory = await realpath(candidate);
    if (path.resolve(candidate).toLowerCase() !== path.resolve(engineDirectory).toLowerCase()
      || path.dirname(engineDirectory).toLowerCase() !== path.dirname(canonicalDirectory).toLowerCase()
      || path.basename(engineDirectory).toLowerCase() !== "mod_presets") {
      fail("mod_presets must be a plain sibling of the bridge directory");
    }
  }
  const checkedLua = name => {
    if (typeof name !== "string" || !LUA_BASENAME.test(name)) fail("invalid flat Lua basename");
    return name;
  };
  const filePath = name => path.join(engineDirectory,
    mode === OBSERVATION_MODE ? `.tf3mp_status_1__${checkedLua(name)}` : checkedLua(name));
  const legacyFilePath = name => path.join(canonicalDirectory, checkedLua(name));
  const temporaryPath = name => {
    if (typeof name !== "string" || !TEMP_BASENAME.test(name)) fail("invalid flat temporary basename");
    return path.join(engineDirectory, name);
  };
  const conflictPaths = name => mode === OBSERVATION_MODE
    ? Object.freeze([legacyFilePath(name), filePath(name)])
    : Object.freeze([filePath(name)]);
  return Object.freeze({ mode, canonicalDirectory, engineDirectory,
    filePath, legacyFilePath, temporaryPath, conflictPaths });
}

export async function processProbeOnce(directory) {
  const resolvedDirectory = await requirePlainDirectory(directory);
  const outboxPath = path.join(resolvedDirectory, "outbox.lua");
  const outboxInfo = await lstat(outboxPath);
  if (!outboxInfo.isFile() || outboxInfo.isSymbolicLink()) fail("outbox.lua must be a regular file");
  if (outboxInfo.size > MAX_USERDATA_IPC_BYTES) fail("outbox.lua exceeds 4096 bytes");
  const probe = parseProbeOutbox(await readFile(outboxPath, "utf8"));
  const finalPath = path.join(resolvedDirectory, `inbox_${probe.counter}.lua`);
  const temporaryPath = path.join(resolvedDirectory, `.tf3mp-probe-${randomUUID()}.tmp`);
  let temporaryExists = false;
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    temporaryExists = true;
    try {
      await handle.writeFile(serializeProbeInbox({ nonce: probe.nonce, counter: probe.counter, status: "ok" }), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(temporaryPath, finalPath);
    await unlink(temporaryPath);
    temporaryExists = false;
    return Object.freeze({ probe, responsePath: finalPath });
  } finally {
    if (temporaryExists) await unlink(temporaryPath).catch(() => {});
  }
}
