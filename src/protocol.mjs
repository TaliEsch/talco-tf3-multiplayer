import { randomUUID } from "node:crypto";
import {
  MAX_FRAME_BYTES,
  MAX_STRING_LENGTH,
  PROTOCOL_VERSION,
} from "./constants.mjs";
import { canonicalJson } from "./canonical.mjs";
import { decryptAead, deriveWireKey, encryptAead } from "./wire-crypto.mjs";

const CONTROL_AAD = "tf3mp-control-v2";

const KINDS = new Set([
  "hello", "admitted", "test", "test_echo", "action_request",
  "command_accepted", "command_rejected", "speed_request", "state_hash",
  "peer_joined", "peer_left", "save_ready", "session_ready", "error",
  "diagnostic_hello", "diagnostic_ready", "diagnostic_ping", "diagnostic_pong",
  "coordination_prepare", "coordination_ready", "coordination_heartbeat", "participant_ready", "participant_heartbeat",
  "command_prepare", "command_prepared", "command_commit", "command_applied", "command_completed", "session_halted",
]);

function assertString(value, name, max = MAX_STRING_LENGTH) {
  if (typeof value !== "string" || value.length < 1 || value.length > max) {
    throw new TypeError(`${name} must be a 1..${max} character string`);
  }
}

function assertSafeInt(value, name, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${name} must be a safe integer >= ${minimum}`);
  }
}

export function validateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new TypeError("body must be an object");
  const expectedKeys = ["kind", "messageId", "payload", "playerId", "sequence", "sessionId", "version"];
  const actualKeys = Object.keys(body).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new TypeError("body fields do not match protocol schema");
  }
  if (body.version !== PROTOCOL_VERSION) throw new TypeError("unsupported protocol version");
  if (!KINDS.has(body.kind)) throw new TypeError("unknown message kind");
  assertString(body.messageId, "messageId", 64);
  assertSafeInt(body.sequence, "sequence");
  assertString(body.sessionId, "sessionId", 64);
  if (body.playerId !== null) assertString(body.playerId, "playerId", 64);
  if (body.payload === null || typeof body.payload !== "object" || Array.isArray(body.payload)) {
    throw new TypeError("payload must be an object");
  }
  return body;
}

export function makeBody({ kind, sequence, sessionId, playerId = null, payload = {}, messageId = randomUUID() }) {
  return validateBody({ version: PROTOCOL_VERSION, kind, messageId, sequence, sessionId, playerId, payload });
}

export function encodeFrame(secret, body) {
  validateBody(body);
  const encrypted = encryptAead(deriveWireKey(secret, "control"), Buffer.from(canonicalJson(body), "utf8"), CONTROL_AAD);
  const bytes = Buffer.from(`${canonicalJson({
    ciphertext: encrypted.ciphertext.toString("base64"),
    nonce: encrypted.nonce.toString("base64"),
    tag: encrypted.tag.toString("base64"),
    wireVersion: 2,
  })}\n`, "utf8");
  if (bytes.length > MAX_FRAME_BYTES) throw new RangeError("frame too large");
  return bytes;
}

export function decodeFrame(secret, line) {
  const bytes = Buffer.isBuffer(line) ? line : Buffer.from(line, "utf8");
  if (bytes.length < 2 || bytes.length > MAX_FRAME_BYTES) throw new RangeError("invalid frame size");
  let envelope;
  try { envelope = JSON.parse(bytes.toString("utf8")); } catch { throw new TypeError("invalid JSON"); }
  const keys = envelope && typeof envelope === "object" ? Object.keys(envelope).sort() : [];
  if (keys.join(",") !== "ciphertext,nonce,tag,wireVersion" || envelope.wireVersion !== 2
      || typeof envelope.ciphertext !== "string" || typeof envelope.nonce !== "string" || typeof envelope.tag !== "string") {
    throw new TypeError("invalid envelope");
  }
  let plaintext;
  try {
    const nonce = Buffer.from(envelope.nonce, "base64"), tag = Buffer.from(envelope.tag, "base64"), ciphertext = Buffer.from(envelope.ciphertext, "base64");
    if (nonce.length !== 12 || tag.length !== 16 || ciphertext.length < 2 || ciphertext.length > MAX_FRAME_BYTES) throw new Error();
    plaintext = decryptAead(deriveWireKey(secret, "control"), nonce, ciphertext, tag, CONTROL_AAD);
  } catch {
    throw new Error("authentication failed");
  }
  let body;
  try { body = JSON.parse(plaintext.toString("utf8")); } catch { throw new TypeError("invalid encrypted JSON"); }
  return validateBody(body);
}

export class FrameDecoder {
  #buffer = Buffer.alloc(0);
  push(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const frames = [];
    let newline;
    while ((newline = this.#buffer.indexOf(0x0a)) >= 0) {
      if (newline >= MAX_FRAME_BYTES) throw new RangeError("frame too large");
      const frame = this.#buffer.subarray(0, newline);
      this.#buffer = this.#buffer.subarray(newline + 1);
      if (frame.length) frames.push(frame);
    }
    if (this.#buffer.length >= MAX_FRAME_BYTES) throw new RangeError("unterminated frame too large");
    return frames;
  }
}
