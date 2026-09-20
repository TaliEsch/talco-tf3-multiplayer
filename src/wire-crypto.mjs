import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export function assertSessionSecret(secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new TypeError("session secret must be at least 32 UTF-8 bytes");
  }
}

export function deriveWireKey(secret, purpose) {
  assertSessionSecret(secret);
  return createHmac("sha256", secret).update(`tf3mp-key-v2\n${purpose}`, "utf8").digest();
}

export function encryptAead(key, plaintext, aad, nonce = randomBytes(12)) {
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { nonce, ciphertext, tag: cipher.getAuthTag() };
}

export function decryptAead(key, nonce, ciphertext, tag, aad) {
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
