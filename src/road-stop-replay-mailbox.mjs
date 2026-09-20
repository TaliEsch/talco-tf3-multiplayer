import { randomBytes } from "node:crypto";
import { lstat, link, open, unlink } from "node:fs/promises";
import path from "node:path";
import { createRoadStopReplayRequest } from "./road-stop-replay-request.mjs";
import { checkRoadStopReplayIdentity } from "./road-stop-replay-case.mjs";
import { parseFlatDataFile, requirePlainDirectory } from "./userdata-ipc.mjs";

const LIMIT = 4096;
const NONCE = /^[a-f0-9]{32}$/;
const positiveInt32 = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
const positiveSafeInt = value => Number.isSafeInteger(value) && value > 0;
const nonnegativeSafeInt = value => Number.isSafeInteger(value) && value >= 0;
const RECEIPT_CODES = Object.freeze({
  verified: new Set(["ROAD_STOP_OWNER_AND_DEBIT_OBSERVED"]),
  rejected: new Set([
    "EXPLICIT_REPLAY_CONSENT_REQUIRED", "STATE_UNAVAILABLE", "REPLAY_CONSUMED_OR_COMPANY_UNKNOWN",
    "REPLAY_PREPARATION_UNQUALIFIED", "ENGINE_TIME_UNAVAILABLE", "REQUEST_OUTSIDE_WINDOW",
    "TARGET_COMPANY_CHANGED", "DEPENDENCY_UNAVAILABLE",
  ]),
  unknown: new Set([
    "ENGINE_OUTCOME_UNKNOWN", "CONSUME_PERSISTENCE_UNKNOWN", "ENGINE_CALLBACK_MISSING",
    "ENGINE_SEND_FAILED", "DISPATCH_FAILED",
  ]),
});

// Deliberately expose only stable, payload-free failures.  In particular, this
// mailbox never reports a userdata path, request body, or operating-system text.
function fail(code) {
  throw new Error(code);
}

function exactFields(value, names) {
  const actual = Object.keys(value).sort();
  const expected = [...names].sort();
  return actual.length === expected.length && actual.every((name, index) => name === expected[index]);
}

function snapshotIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype || !exactFields(value, ["saveSha256", "gameSha256", "modManifestSha256"])) {
    fail("ROAD_STOP_REPLAY_IDENTITY_MISMATCH");
  }
  const snapshot = {
    saveSha256: value.saveSha256,
    gameSha256: value.gameSha256,
    modManifestSha256: value.modManifestSha256,
  };
  if (!Object.values(snapshot).every(item => typeof item === "string" && /^[a-f0-9]{64}$/.test(item))) {
    fail("ROAD_STOP_REPLAY_IDENTITY_MISMATCH");
  }
  return Object.freeze(snapshot);
}

async function readRegularBounded(directory, name, unavailableCode) {
  const filename = path.join(directory, name);
  let info;
  try {
    info = await lstat(filename, { bigint: true });
  } catch {
    fail(unavailableCode);
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size > LIMIT) fail(unavailableCode);
  let handle;
  try {
    handle = await open(filename, "r");
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.size > BigInt(LIMIT) || opened.ino !== info.ino
      || info.dev !== 0n && opened.dev !== 0n && opened.dev !== info.dev) fail(unavailableCode);
    const bytes = Buffer.alloc(LIMIT + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat({ bigint: true });
    if (bytesRead > LIMIT || BigInt(bytesRead) !== opened.size || after.ino !== opened.ino || after.size !== opened.size
      || opened.dev !== 0n && after.dev !== 0n && after.dev !== opened.dev) fail(unavailableCode);
    let source;
    try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, bytesRead)); }
    catch { fail(unavailableCode); }
    return source;
  } catch {
    fail(unavailableCode);
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function verifyBridge(directory, nonce) {
  const source = await readRegularBounded(directory, "bridge.lua", "ROAD_STOP_REPLAY_BRIDGE_UNAVAILABLE");
  let bridge;
  try {
    bridge = parseFlatDataFile(source);
  } catch {
    fail("ROAD_STOP_REPLAY_BRIDGE_UNAVAILABLE");
  }
  if (!exactFields(bridge, ["schemaVersion", "nonce", "mode"])
    || bridge.schemaVersion !== 1 || bridge.nonce !== nonce || bridge.mode !== "company_test") {
    fail("ROAD_STOP_REPLAY_BRIDGE_UNAVAILABLE");
  }
}

function verifyIdentity(source, currentIdentity) {
  try {
    checkRoadStopReplayIdentity(source, currentIdentity);
  } catch {
    fail("ROAD_STOP_REPLAY_IDENTITY_MISMATCH");
  }
}

/**
 * Publish one fully copied replay request.  `currentIdentity` is intentionally
 * separate from `options`: it is local precondition evidence, not codec input.
 * An existing request is a durable consume barrier and is never replaced.
 */
export async function publishRoadStopReplayRequest(directory, source, options, currentIdentity) {
  let request;
  try {
    request = createRoadStopReplayRequest(source, options);
  } catch {
    fail("INVALID_ROAD_STOP_REPLAY_REQUEST");
  }
  const nonce = request.request.nonce;
  const identity = snapshotIdentity(currentIdentity);
  verifyIdentity(source, identity);

  let resolvedDirectory;
  try {
    resolvedDirectory = await requirePlainDirectory(directory);
  } catch {
    fail("ROAD_STOP_REPLAY_DIRECTORY_UNAVAILABLE");
  }
  await verifyBridge(resolvedDirectory, nonce);

  const finalPath = path.join(resolvedDirectory, "native_road_stop_replay_request.lua");
  const temporaryPath = path.join(resolvedDirectory, `.road-stop-replay-${randomBytes(12).toString("hex")}.tmp`);
  let temporaryExists = false;
  try {
    let handle;
    try {
      handle = await open(temporaryPath, "wx", 0o600);
      temporaryExists = true;
      await handle.writeFile(request.lua, "utf8");
      await handle.sync();
    } catch {
      fail("ROAD_STOP_REPLAY_PUBLICATION_FAILED");
    } finally {
      await handle?.close().catch(() => {});
    }

    // Recheck every mutable admission condition directly before the consuming
    // link operation.  No retry is safe once that operation is uncertain.
    try {
      resolvedDirectory = await requirePlainDirectory(resolvedDirectory);
    } catch {
      fail("ROAD_STOP_REPLAY_DIRECTORY_UNAVAILABLE");
    }
    verifyIdentity(source, identity);
    await verifyBridge(resolvedDirectory, nonce);
    try {
      await link(temporaryPath, finalPath);
    } catch (error) {
      if (error?.code === "EEXIST") fail("ROAD_STOP_REPLAY_REQUEST_ALREADY_CONSUMED");
      fail("ROAD_STOP_REPLAY_PUBLICATION_FAILED");
    }
    try {
      await unlink(temporaryPath);
    } catch {
      // The request has already been consumed; its engine outcome is unknown.
      fail("ROAD_STOP_REPLAY_PUBLICATION_OUTCOME_UNKNOWN");
    }
    temporaryExists = false;
    return Object.freeze({
      request: request.request,
      requestPath: finalPath,
      replayAcceptanceVerified: false,
      gameplayVerified: false,
    });
  } finally {
    if (temporaryExists) await unlink(temporaryPath).catch(() => {});
  }
}

export async function readRoadStopReplayReceipt(directory, { nonce, requestId } = {}) {
  if (!NONCE.test(nonce) || !positiveInt32(requestId)) fail("INVALID_ROAD_STOP_REPLAY_RECEIPT_REQUEST");
  let resolvedDirectory;
  try {
    resolvedDirectory = await requirePlainDirectory(directory);
  } catch {
    fail("ROAD_STOP_REPLAY_DIRECTORY_UNAVAILABLE");
  }
  const source = await readRegularBounded(resolvedDirectory, "native_road_stop_replay_receipt.lua", "ROAD_STOP_REPLAY_RECEIPT_UNAVAILABLE");
  let receipt;
  try {
    receipt = parseFlatDataFile(source);
  } catch {
    fail("INVALID_ROAD_STOP_REPLAY_RECEIPT");
  }
  const required = ["schemaVersion", "kind", "nonce", "requestId", "tickCount", "updateCount", "code", "outcome"];
  const extended = [...required, "stopEntity", "chargedCost"];
  if ((!exactFields(receipt, required) && !exactFields(receipt, extended))
    || receipt.schemaVersion !== 1 || receipt.kind !== "native_road_stop_replay_receipt"
    || receipt.nonce !== nonce || !NONCE.test(receipt.nonce) || receipt.requestId !== requestId
    || !positiveInt32(receipt.requestId) || ![receipt.tickCount, receipt.updateCount].every(nonnegativeSafeInt)
    || typeof receipt.code !== "string" || !["verified", "rejected", "unknown"].includes(receipt.outcome)
    || !RECEIPT_CODES[receipt.outcome].has(receipt.code)) {
    fail("INVALID_ROAD_STOP_REPLAY_RECEIPT");
  }
  const hasObserved = Object.hasOwn(receipt, "stopEntity");
  if (hasObserved !== Object.hasOwn(receipt, "chargedCost")
    || hasObserved && (!positiveInt32(receipt.stopEntity) || !positiveSafeInt(receipt.chargedCost))
    || receipt.outcome === "verified" && (receipt.code !== "ROAD_STOP_OWNER_AND_DEBIT_OBSERVED" || !hasObserved)) {
    fail("INVALID_ROAD_STOP_REPLAY_RECEIPT");
  }
  return Object.freeze({ ...receipt, replayAcceptanceVerified: false, gameplayVerified: false });
}
