import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("host releases bridge lock when launcher input closes, allowing a fresh host", { timeout: 15000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-lifecycle-"));
  const directory = path.join(root, "tf3mp_status_1");
  const fixture = path.join(root, "synthetic-build-and-save.bin");
  await writeFile(fixture, "Synthetic test fixture, never a game executable or user save.");
  const children = [];
  try {
    for (let run = 0; run < 2; run++) {
      const child = spawn(process.execPath, [fileURLToPath(new URL("../src/cli.mjs", import.meta.url)), "host",
        "--exe", fixture, "--save", fixture, "--mod-hash", "a".repeat(64),
        "--bind", "127.0.0.1", "--port", "0", "--save-port", "0", "--bridge-dir", directory], {
        env: { ...process.env, TF3MP_SESSION_SECRET: "0123456789abcdef0123456789abcdef" },
        stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
      });
      children.push(child);
      const exit = once(child, "exit");
      child.stderr.resume();
      await new Promise((resolve, reject) => {
        let buffer = "";
        const timer = setTimeout(() => reject(new Error("host did not become ready")), 5000);
        child.once("error", error => { clearTimeout(timer); reject(error); });
        child.once("exit", code => { clearTimeout(timer); reject(new Error(`host exited before readiness: ${code}`)); });
        child.stdout.on("data", chunk => {
          buffer += chunk.toString();
          if (buffer.includes('"event":"host_listening"')) { clearTimeout(timer); resolve(); }
        });
      });
      await readFile(path.join(directory, "bridge.lock"));
      // This models closing the launcher's redirected stdin, not a TF3 launch.
      child.stdin.end();
      assert.deepEqual(await exit, [0, null]);
      for (const name of ["bridge.lock", "bridge.lua", "ack.lua", "engine_request.lua"])
        await assert.rejects(readFile(path.join(directory, name)), { code: "ENOENT" });
    }
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) {
      const ended = once(child, "exit"); child.kill(); await ended;
    }
    await rm(root, { recursive: true, force: true });
  }
});
