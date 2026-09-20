import http from "node:http";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { link, lstat, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DEFAULT_BIND, DEFAULT_SAVE_PORT, MAX_SAVE_BYTES, SAVE_ENCRYPTION_CHUNK_BYTES, SAVE_REQUEST_TTL_MS } from "./constants.mjs";
import { sha256File } from "./compatibility.mjs";
import { decryptAead, deriveWireKey, encryptAead } from "./wire-crypto.mjs";

const PATH = "/v1/session-save";

function validateCommon(secret, sessionId) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) throw new TypeError("session secret must be at least 32 UTF-8 bytes");
  if (typeof sessionId !== "string" || sessionId.length < 1 || sessionId.length > 64) throw new TypeError("invalid session ID");
}

function signature(secret, sessionId, timestamp, nonce) {
  return createHmac("sha256", secret).update(`tf3mp-save-v1\n${sessionId}\n${timestamp}\n${nonce}`, "utf8").digest("hex");
}

function metadataSignature(secret, sessionId, bytes, sha256, baseNonce) {
  return createHmac("sha256", secret).update(`tf3mp-save-metadata-v2\n${sessionId}\n${bytes}\n${sha256}\n${baseNonce}`, "utf8").digest("hex");
}

function chunkAad(sessionId, counter, length) {
  return `tf3mp-save-chunk-v2\n${sessionId}\n${counter}\n${length}`;
}

function nonceFor(baseNonce, counter) {
  const nonce = Buffer.alloc(12);
  baseNonce.copy(nonce, 0);
  nonce.writeUInt32BE(counter, 8);
  return nonce;
}

function encryptSaveStream(secret, sessionId, baseNonce) {
  const key = deriveWireKey(secret, "save");
  let counter = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      try {
        for (let offset = 0; offset < chunk.length; offset += SAVE_ENCRYPTION_CHUNK_BYTES) {
          const plain = chunk.subarray(offset, Math.min(offset + SAVE_ENCRYPTION_CHUNK_BYTES, chunk.length));
          if (counter > 0xffffffff) throw new RangeError("save has too many encryption chunks");
          const encrypted = encryptAead(key, plain, chunkAad(sessionId, counter, plain.length), nonceFor(baseNonce, counter));
          const header = Buffer.alloc(8); header.writeUInt32BE(plain.length, 0); header.writeUInt32BE(counter, 4);
          this.push(Buffer.concat([header, encrypted.ciphertext, encrypted.tag]));
          counter++;
        }
        callback();
      } catch (error) { callback(error); }
    },
  });
}

function decryptSaveStream(secret, sessionId, baseNonce) {
  const key = deriveWireKey(secret, "save");
  let buffered = Buffer.alloc(0), expectedCounter = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      try {
        buffered = Buffer.concat([buffered, chunk]);
        while (buffered.length >= 8) {
          const length = buffered.readUInt32BE(0), counter = buffered.readUInt32BE(4);
          if (length < 1 || length > SAVE_ENCRYPTION_CHUNK_BYTES || counter !== expectedCounter) throw new Error("invalid encrypted save record");
          const recordBytes = 8 + length + 16;
          if (buffered.length < recordBytes) break;
          const ciphertext = buffered.subarray(8, 8 + length), tag = buffered.subarray(8 + length, recordBytes);
          this.push(decryptAead(key, nonceFor(baseNonce, counter), ciphertext, tag, chunkAad(sessionId, counter, length)));
          buffered = buffered.subarray(recordBytes); expectedCounter++;
        }
        if (buffered.length > SAVE_ENCRYPTION_CHUNK_BYTES + 24) throw new Error("oversized encrypted save record");
        callback();
      } catch { callback(new Error("encrypted save authentication failed")); }
    },
    flush(callback) { callback(buffered.length === 0 && expectedCounter > 0 ? null : new Error("truncated encrypted save")); },
  });
}

function equalHex(left, right) {
  if (!/^[0-9a-f]{64}$/i.test(left ?? "") || !/^[0-9a-f]{64}$/i.test(right ?? "")) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export async function startSaveServer({ secret, sessionId, saveFile, bind = DEFAULT_BIND, port = DEFAULT_SAVE_PORT, expiresAt = null, logger = () => {} }) {
  validateCommon(secret, sessionId);
  if (!path.isAbsolute(saveFile)) throw new TypeError("host save path must be absolute");
  const source = await stat(saveFile);
  if (!source.isFile() || source.size < 1 || source.size > MAX_SAVE_BYTES) throw new RangeError("save file is empty, unavailable, or too large");
  const saveSha256 = await sha256File(saveFile);
  const usedNonces = new Map();
  let activeTransfers = 0;
  const server = http.createServer({ requestTimeout: 10_000, headersTimeout: 5_000, maxHeaderSize: 8_192 }, (request, response) => {
    const fail = (status) => { response.writeHead(status, { "content-type": "text/plain", "cache-control": "no-store" }); response.end("request rejected\n"); };
    if (request.method !== "GET" || request.url !== PATH) { fail(404); return; }
    const requestedSession = request.headers["x-tf3mp-session"];
    const timestampText = request.headers["x-tf3mp-time"];
    const nonce = request.headers["x-tf3mp-nonce"];
    const received = request.headers["x-tf3mp-auth"];
    const timestamp = Number(timestampText);
    for (const [seenNonce, seenAt] of usedNonces) if (Date.now() - seenAt > SAVE_REQUEST_TTL_MS * 2) usedNonces.delete(seenNonce);
    if ((expiresAt !== null && Date.now() > expiresAt) || activeTransfers >= 4 || requestedSession !== sessionId || !Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > SAVE_REQUEST_TTL_MS
        || typeof nonce !== "string" || !/^[0-9a-f]{32}$/i.test(nonce) || usedNonces.has(nonce)
        || typeof received !== "string" || !equalHex(received, signature(secret, sessionId, timestampText, nonce))) {
      logger({ level: "warn", event: "save_request_rejected" }); fail(401); return;
    }
    if (usedNonces.size >= 256) { fail(429); return; }
    usedNonces.set(nonce, Date.now());
    activeTransfers++;
    response.once("close", () => { activeTransfers--; });
    response.setTimeout(30_000, () => response.destroy());
    const baseNonce = randomBytes(8), baseNonceHex = baseNonce.toString("hex");
    response.writeHead(200, {
      "content-type": "application/octet-stream", "x-tf3mp-plain-length": source.size,
      "x-tf3mp-save-sha256": saveSha256, "x-tf3mp-save-version": "2",
      "x-tf3mp-base-nonce": baseNonceHex,
      "x-tf3mp-meta-auth": metadataSignature(secret, sessionId, source.size, saveSha256, baseNonceHex),
      "cache-control": "no-store",
    });
    const stream = createReadStream(saveFile);
    stream.on("error", () => response.destroy());
    response.on("close", () => stream.destroy());
    pipeline(stream, encryptSaveStream(secret, sessionId, baseNonce), response).catch(() => response.destroy());
    logger({ level: "info", event: "save_transfer_started", bytes: source.size, sha256: saveSha256 });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, bind, () => { server.off("error", reject); resolve(); });
  });
  server.maxConnections = 16;
  server.keepAliveTimeout = 1_000;
  return { server, port: server.address().port, bytes: source.size, sha256: saveSha256 };
}

export async function downloadSave({ secret, sessionId, host = "127.0.0.1", port = DEFAULT_SAVE_PORT, destinationDir }) {
  validateCommon(secret, sessionId);
  if (!path.isAbsolute(destinationDir)) throw new TypeError("save destination must be absolute");
  const destinationInfo = await lstat(destinationDir);
  if (!destinationInfo.isDirectory() || destinationInfo.isSymbolicLink()) throw new TypeError("save destination must be an existing non-linked directory");
  const safeSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
  const finalPath = path.join(destinationDir, `TF3MP_${safeSession}.sav`);
  const partPath = path.join(destinationDir, `.tf3mp-${randomBytes(16).toString("hex")}.part`);
  try { await lstat(finalPath); throw new Error("download destination already exists"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const timestamp = String(Date.now());
  const nonce = randomBytes(16).toString("hex");
  const response = await new Promise((resolve, reject) => {
    const request = http.get({ host, port, path: PATH, headers: {
      "x-tf3mp-session": sessionId, "x-tf3mp-time": timestamp, "x-tf3mp-nonce": nonce,
      "x-tf3mp-auth": signature(secret, sessionId, timestamp, nonce),
    } }, resolve);
    request.on("error", reject);
    request.setTimeout(30_000, () => request.destroy(new Error("save transfer timed out")));
  });
  if (response.statusCode !== 200) { response.resume(); throw new Error(`save download rejected (${response.statusCode})`); }
  const expectedBytes = Number(response.headers["x-tf3mp-plain-length"]);
  const expectedHash = response.headers["x-tf3mp-save-sha256"];
  const baseNonceHex = response.headers["x-tf3mp-base-nonce"], metadataAuth = response.headers["x-tf3mp-meta-auth"];
  if (response.headers["x-tf3mp-save-version"] !== "2" || !Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > MAX_SAVE_BYTES
      || !/^[0-9a-f]{64}$/i.test(expectedHash ?? "") || !/^[0-9a-f]{16}$/i.test(baseNonceHex ?? "")
      || typeof metadataAuth !== "string" || !equalHex(metadataAuth, metadataSignature(secret, sessionId, expectedBytes, expectedHash, baseNonceHex))) {
    response.destroy(); throw new Error("invalid save response metadata");
  }
  const hash = createHash("sha256");
  let receivedBytes = 0;
  const plaintext = decryptSaveStream(secret, sessionId, Buffer.from(baseNonceHex, "hex"));
  plaintext.on("data", (chunk) => { receivedBytes += chunk.length; if (receivedBytes > MAX_SAVE_BYTES) plaintext.destroy(new Error("save exceeds size limit")); else hash.update(chunk); });
  try {
    await pipeline(response, plaintext, createWriteStream(partPath, { flags: "wx", mode: 0o600 }));
    const receivedHash = hash.digest("hex");
    if (receivedBytes !== expectedBytes || !equalHex(receivedHash, expectedHash)) throw new Error("save size/hash verification failed");
    await link(partPath, finalPath);
    await unlink(partPath);
    return { path: finalPath, bytes: receivedBytes, sha256: receivedHash };
  } catch (error) {
    try { await unlink(partPath); } catch {}
    throw error;
  }
}
