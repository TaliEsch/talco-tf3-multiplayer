import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { startSaveServer, downloadSave } from "../src/save-transfer.mjs";

const SECRET = "0123456789abcdef0123456789abcdef";

test("client pulls and verifies the host save over loopback", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-save-"));
  const hostDir = path.join(root, "host"), clientDir = path.join(root, "client");
  await Promise.all([import("node:fs/promises").then(({ mkdir }) => mkdir(hostDir)), import("node:fs/promises").then(({ mkdir }) => mkdir(clientDir))]);
  const source = path.join(hostDir, "source.sav");
  const content = Buffer.alloc(180_000); for (let i = 0; i < content.length; i++) content[i] = i % 251;
  await writeFile(source, content);
  const transfer = await startSaveServer({ secret: SECRET, sessionId: "loopback", saveFile: source, port: 0 });
  try {
    const received = await downloadSave({ secret: SECRET, sessionId: "loopback", port: transfer.port, destinationDir: clientDir });
    assert.deepEqual(await readFile(received.path), content);
    assert.equal(received.sha256, transfer.sha256);
  } finally { transfer.server.close(); await rm(root, { recursive: true, force: true }); }
});

test("wrong secret cannot pull the host save", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-save-auth-"));
  const hostDir = path.join(root, "host"), clientDir = path.join(root, "client");
  const { mkdir } = await import("node:fs/promises"); await mkdir(hostDir); await mkdir(clientDir);
  const source = path.join(hostDir, "source.sav"); await writeFile(source, "private test fixture");
  const transfer = await startSaveServer({ secret: SECRET, sessionId: "auth", saveFile: source, port: 0 });
  try {
    await assert.rejects(downloadSave({ secret: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", sessionId: "auth", port: transfer.port, destinationDir: clientDir }), /rejected/);
  } finally { transfer.server.close(); await rm(root, { recursive: true, force: true }); }
});

test("save bytes are not exposed on the wire", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-save-wire-"));
  const hostDir = path.join(root, "host");
  const { mkdir } = await import("node:fs/promises"); await mkdir(hostDir);
  const marker = Buffer.from("TF3MP-PLAINTEXT-MARKER-DO-NOT-EXPOSE".repeat(4096));
  const source = path.join(hostDir, "source.sav"); await writeFile(source, marker);
  const sessionId = "wire-test";
  const transfer = await startSaveServer({ secret: SECRET, sessionId, saveFile: source, port: 0 });
  try {
    const timestamp = String(Date.now()), nonce = randomBytes(16).toString("hex");
    const auth = createHmac("sha256", SECRET).update(`tf3mp-save-v1\n${sessionId}\n${timestamp}\n${nonce}`, "utf8").digest("hex");
    const response = await new Promise((resolve, reject) => {
      const request = http.get({ port: transfer.port, path: "/v1/session-save", headers: {
        "x-tf3mp-session": sessionId, "x-tf3mp-time": timestamp, "x-tf3mp-nonce": nonce, "x-tf3mp-auth": auth,
      } }, resolve);
      request.on("error", reject);
    });
    const chunks = []; for await (const chunk of response) chunks.push(chunk);
    const wire = Buffer.concat(chunks);
    assert.equal(response.headers["x-tf3mp-save-version"], "2");
    assert.equal(wire.includes(Buffer.from("TF3MP-PLAINTEXT-MARKER-DO-NOT-EXPOSE")), false);
  } finally { transfer.server.close(); await rm(root, { recursive: true, force: true }); }
});
