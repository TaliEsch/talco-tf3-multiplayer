import { MAX_USERDATA_IPC_BYTES } from "./constants.mjs";
import { randomUUID } from "node:crypto";
import { lstat, link, open, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";

const IDENTIFIER_VALUE = /^[A-Za-z0-9_.:-]{1,128}$/;
const NONCE = /^[0-9a-f]{32}$/;

function fail(message) {
  throw new TypeError(`invalid userdata IPC: ${message}`);
}

export function parseFlatDataFile(source) {
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
      if (!IDENTIFIER_VALUE.test(value)) fail(`string for ${key} is outside the allowlist`);
      offset = end + 1;
    } else {
      const valueMatch = body.slice(offset).match(/^(true|false|0|[1-9][0-9]*)/);
      if (!valueMatch) fail(`invalid scalar for ${key}`);
      value = valueMatch[1] === "true" ? true : valueMatch[1] === "false" ? false : Number(valueMatch[1]);
      if (typeof value === "number" && !Number.isSafeInteger(value)) fail(`${key} is not a safe integer`);
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
