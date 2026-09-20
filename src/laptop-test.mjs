import net from "node:net";
import { randomBytes } from "node:crypto";
import { FrameDecoder, decodeFrame, encodeFrame, makeBody } from "./protocol.mjs";
import { downloadSave } from "./save-transfer.mjs";
import { MAX_SAVE_BYTES } from "./constants.mjs";

export function parseLanCode(code, now = Date.now()) {
  const value = String(code).trim();
  if (value.length > 2048 || !/^TF3MP2-[A-Za-z0-9_-]+$/.test(value)) throw new Error("INVALID_JOIN_CODE");
  const fields = Buffer.from(value.slice(7), "base64url").toString("utf8").split("\n");
  if (fields.length !== 7) throw new Error("INVALID_JOIN_CODE");
  const [host, portText, savePortText, sessionId, secret, modManifestHash, expiry] = fields;
  const octets = host.split(".").map(Number);
  if (net.isIP(host) !== 4 || !(octets[0] === 10 || octets[0] === 192 && octets[1] === 168 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31 || octets[0] === 127)) throw new Error("LAN_CODE_REQUIRED");
  const port = Number(portText), savePort = Number(savePortText), expiresAt = Number(expiry);
  if (![port, savePort].every(n => Number.isInteger(n) && n >= 1 && n <= 65535)
      || !/^[A-Za-z0-9_-]{1,64}$/.test(sessionId) || Buffer.byteLength(secret) < 32 || secret.length > 256
      || !/^[a-f0-9]{64}$/i.test(modManifestHash) || !Number.isSafeInteger(expiresAt)) throw new Error("INVALID_JOIN_CODE");
  if (expiresAt <= now || expiresAt > now + 86400000) throw new Error("EXPIRED_OR_INVALID_CODE");
  return { host, port, savePort, sessionId, secret, modManifestHash: modManifestHash.toLowerCase(), expiresAt };
}

export function probeDiagnostic(details, { timeoutMs = 15000, afterReadyKind = "diagnostic_ping" } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: details.host, port: details.port });
    const decoder = new FrameDecoder(), challenge = randomBytes(16).toString("hex"), seen = new Set();
    let sequence = 0, lastSequence = -1, ready = null, finished = false, connected = false;
    const finish = (error, value) => { if (finished) return; finished = true; clearTimeout(timer); socket.destroy(); if (error) { error.connected = connected; reject(error); } else resolve(value); };
    const timer = setTimeout(() => finish(new Error("CONTROL_TIMEOUT")), timeoutMs);
    const send = (kind, payload = {}) => socket.write(encodeFrame(details.secret, makeBody({ kind, payload, sequence: sequence++, sessionId: details.sessionId })));
    socket.on("connect", () => { connected = true; send("diagnostic_hello"); });
    socket.on("error", e => finish(new Error(e.code ?? "CONNECTION_FAILED")));
    socket.on("close", () => finish(new Error("CONTROL_CLOSED")));
    socket.on("data", data => {
      try {
        for (const frame of decoder.push(data)) {
          let body;
          try { body = decodeFrame(details.secret, frame); } catch { throw new Error("CONTROL_AUTH_FAILED"); }
          if (body.sessionId !== details.sessionId || body.playerId !== null || body.sequence <= lastSequence || seen.has(body.messageId) || seen.size >= 8) throw new Error("INVALID_HOST_REPLY");
          lastSequence = body.sequence; seen.add(body.messageId);
          if (body.kind === "error") throw new Error(/^[A-Z_]{1,64}$/.test(body.payload.code) ? body.payload.code : "HOST_REJECTED");
          if (body.kind === "diagnostic_ready" && ready === null) {
            if (body.payload.gameplayVerified !== false || body.payload.modManifestHash !== details.modManifestHash) throw new Error("INVALID_DIAGNOSTIC_REPLY");
            ready = body.payload;
            send(afterReadyKind, { challenge });
          } else if (body.kind === "diagnostic_pong" && ready && body.payload.challenge === challenge) {
            finish(null, ready); return;
          } else throw new Error("UNEXPECTED_HOST_REPLY");
        }
      } catch (e) { finish(e); }
    });
  });
}

export async function runLaptopTest({ code, destinationDir, logger = () => {} }) {
  const details = parseLanCode(code);
  const result = await probeDiagnostic(details);
  logger({ event: "authenticated_connection_passed" });
  if (!result.save || !Number.isSafeInteger(result.save.bytes) || result.save.bytes < 1 || result.save.bytes > MAX_SAVE_BYTES || !/^[a-f0-9]{64}$/.test(result.save.sha256)) throw new Error("HOST_HAS_NO_VALID_SAVE");
  logger({ event: "save_download_started", bytes: result.save.bytes });
  const save = await downloadSave({ ...details, port: details.savePort, destinationDir });
  if (save.bytes !== result.save.bytes || save.sha256 !== result.save.sha256) throw new Error("CONTROL_SAVE_MISMATCH");
  const report = { event: "laptop_network_test_passed", authenticatedConnection: true, saveVerified: true,
    bytes: save.bytes, sha256: save.sha256, gameplayVerified: false };
  logger(report);
  return report;
}

export async function runLaptopResilienceTest({ code, destinationDir, logger = () => {} }) {
  const details = parseLanCode(code);
  let baseline;
  for (let index = 1; index <= 5; index++) {
    const reply = await probeDiagnostic(details);
    if (baseline && JSON.stringify(reply.save) !== JSON.stringify(baseline.save)) throw new Error("HOST_SAVE_CHANGED");
    baseline = reply;
    logger({ event: "reconnect_passed", attempt: index });
  }
  // The wrong key is locally generated and never written to logs/reports.
  const wrongSecret = randomBytes(32).toString("hex");
  let controlDenied = false;
  try { await probeDiagnostic({ ...details, secret: wrongSecret }); }
  catch (e) {
    if (e.connected && ["CONTROL_AUTH_FAILED", "CONTROL_CLOSED", "ECONNRESET"].includes(e.message)) controlDenied = true;
    else throw new Error("WRONG_KEY_TEST_INCONCLUSIVE");
  }
  if (!controlDenied) throw new Error("WRONG_CONTROL_KEY_ACCEPTED");
  // Prove the service remains reachable with the real credential afterward.
  await probeDiagnostic(details);
  logger({ event: "wrong_control_key_rejected" });

  let restricted = false;
  try { await probeDiagnostic(details, { afterReadyKind: "action_request" }); }
  catch (e) {
    if (e.message === "DIAGNOSTIC_ONLY") restricted = true;
    else throw new Error("GAMEPLAY_RESTRICTION_INCONCLUSIVE");
  }
  if (!restricted) throw new Error("DIAGNOSTIC_GAMEPLAY_NOT_REJECTED");
  logger({ event: "diagnostic_gameplay_rejected" });

  let saveDenied = false;
  try { await downloadSave({ ...details, secret: wrongSecret, port: details.savePort, destinationDir }); }
  catch (e) {
    if (e.message === "save download rejected (401)") saveDenied = true;
    else throw new Error("SAVE_AUTH_TEST_INCONCLUSIVE");
  }
  if (!saveDenied) throw new Error("WRONG_SAVE_KEY_ACCEPTED");
  logger({ event: "wrong_save_key_rejected" });
  const transfer = await runLaptopTest({ code, destinationDir, logger });
  const final = await probeDiagnostic(details);
  if (final.save?.sha256 !== transfer.sha256 || final.save?.bytes !== transfer.bytes) throw new Error("HOST_SAVE_CHANGED");
  const report = { ...transfer, event: "laptop_resilience_test_passed", testVersion: "0.2.0", reconnectsPassed: 5,
    wrongControlKeyRejected: controlDenied, diagnosticGameplayRejected: restricted,
    wrongSaveKeyRejected: saveDenied, healthyAfterTests: true };
  logger(report);
  return report;
}
