import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, sha256Canonical } from "../src/canonical.mjs";
import { decodeFrame, encodeFrame, makeBody, FrameDecoder } from "../src/protocol.mjs";
import { MAX_FRAME_BYTES } from "../src/constants.mjs";

test("canonical JSON sorts object keys recursively", () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, b: [3, 4] } }), '{"a":{"b":[3,4],"y":2},"z":1}');
  assert.equal(sha256Canonical({ b: 2, a: 1 }), sha256Canonical({ a: 1, b: 2 }));
});

test("encrypted frame round-trips through fragmented input", () => {
  const secret = "correct horse battery staple plus entropy";
  const body = makeBody({ kind: "test", sequence: 3, sessionId: "session", payload: { value: "hello" }, messageId: "message" });
  const encoded = encodeFrame(secret, body);
  const decoder = new FrameDecoder();
  assert.deepEqual(decoder.push(encoded.subarray(0, 5)), []);
  const [frame] = decoder.push(encoded.subarray(5));
  assert.deepEqual(decodeFrame(secret, frame), body);
});

test("tampered frame fails authentication", () => {
  const body = makeBody({ kind: "test", sequence: 0, sessionId: "session", payload: { value: 1 }, messageId: "message" });
  const secret = "0123456789abcdef0123456789abcdef";
  const object = JSON.parse(encodeFrame(secret, body));
  const ciphertext = Buffer.from(object.ciphertext, "base64");
  ciphertext[0] ^= 1;
  object.ciphertext = ciphertext.toString("base64");
  assert.throws(() => decodeFrame(secret, JSON.stringify(object)), /authentication failed/);
});

test("control frame does not expose message contents", () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const body = makeBody({ kind: "test", sequence: 0, sessionId: "private-session", payload: { value: "secret-payload" }, messageId: "message" });
  const wire = encodeFrame(secret, body).toString("utf8");
  assert.equal(wire.includes("private-session"), false);
  assert.equal(wire.includes("secret-payload"), false);
});

test("short session secret is rejected", () => {
  const body = makeBody({ kind: "test", sequence: 0, sessionId: "session", payload: { value: 1 }, messageId: "message" });
  assert.throws(() => encodeFrame("too-short", body), /at least 32/);
});

test("decoder rejects a wire frame beyond the encoded cap", () => {
  const decoder = new FrameDecoder();
  assert.throws(() => decoder.push(Buffer.alloc(MAX_FRAME_BYTES, 0x61)), /too large/);
});
