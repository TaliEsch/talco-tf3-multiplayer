import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHost } from "../src/host.mjs";
import { startSaveServer } from "../src/save-transfer.mjs";
import { parseLanCode, probeDiagnostic, runLaptopTest, runLaptopResilienceTest } from "../src/laptop-test.mjs";
const secret = "a".repeat(64), mod = "b".repeat(64), sessionId = "laptop-test";
const code = (port, savePort, host = "127.0.0.1", expires = Date.now() + 60000) => "TF3MP2-" + Buffer.from([host, port, savePort, sessionId, secret, mod, expires].join("\n")).toString("base64url");

test("laptop codes require private IPv4 and valid expiry without TF3 hashes", () => {
  assert.equal(parseLanCode(code(37333, 37334)).sessionId, sessionId);
  for (const bad of ["junk", code(0, 2), code(2, 3, "8.8.8.8"), code(2, 3, "example.com"), code(2, 3, "127.0.0.1", 1)]) assert.throws(() => parseLanCode(bad));
});

for (const resilience of [false, true]) test(`laptop ${resilience ? "resilience batch" : "basic test"} verifies save without becoming a player`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-laptop-"));
  let transfer, host;
  try {
    const saveFile = path.join(root, "fixture.sav"), destinationDir = path.join(root, "download");
    await writeFile(saveFile, "synthetic non-game save data"); await mkdir(destinationDir);
    transfer = await startSaveServer({ secret, sessionId, saveFile, port: 0 });
    host = startHost({ secret, sessionId, buildHash: "c".repeat(64), modManifestHash: mod, port: 0,
      requiredSave: { bytes: transfer.bytes, sha256: transfer.sha256 } });
    await once(host.server, "listening");
    const runner = resilience ? runLaptopResilienceTest : runLaptopTest;
    const result = await runner({ code: code(host.server.address().port, transfer.port), destinationDir });
    assert.equal(result.saveVerified, true);
    assert.equal(result.gameplayVerified, false);
    assert.equal(result.sha256, transfer.sha256);
    assert.equal(host.authority.players().length, 0);
    assert.equal(JSON.stringify(result).includes(secret), false);
    if (resilience) {
      assert.equal(result.reconnectsPassed, 5);
      for (const key of ["wrongControlKeyRejected", "diagnosticGameplayRejected", "wrongSaveKeyRejected", "healthyAfterTests"]) assert.equal(result[key], true);
    }
  } finally {
    if (host) await new Promise(r => host.server.close(r));
    if (transfer) await new Promise(r => transfer.server.close(r));
    await rm(root, { recursive: true, force: true });
  }
});

test("diagnostic connection cannot upgrade to gameplay or pass wrong credentials", async () => {
  const events = [];
  const host = startHost({ secret, sessionId, buildHash: "c".repeat(64), modManifestHash: mod, port: 0, logger: e => events.push(e) });
  await once(host.server, "listening");
  const details = parseLanCode(code(host.server.address().port, 37334));
  try {
    for (const afterReadyKind of ["hello", "action_request", "speed_request", "save_ready"]) {
      await assert.rejects(probeDiagnostic(details, { afterReadyKind, timeoutMs: 2000 }));
    }
    assert.equal(events.filter(e => e.code === "DIAGNOSTIC_ONLY").length, 4);
    await assert.rejects(probeDiagnostic({ ...details, secret: "z".repeat(64) }, { timeoutMs: 2000 }));
    assert.equal(host.authority.players().length, 0);
  } finally { await new Promise(r => host.server.close(r)); }
});
