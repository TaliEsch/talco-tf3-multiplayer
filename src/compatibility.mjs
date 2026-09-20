import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { AUDITED_EXE_SHA256, BUILD_VALIDATION, GAMEPLAY_VERIFIED } from "./constants.mjs";

export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export function describeBuild(hash) {
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) throw new TypeError("invalid game SHA-256");
  const recommended = hash === AUDITED_EXE_SHA256;
  return { hash, supported: true, recommended, validation: recommended ? BUILD_VALIDATION : "unaudited", gameplayVerified: recommended && GAMEPLAY_VERIFIED };
}

export async function readGameBuild(path) {
  return sha256File(path);
}
