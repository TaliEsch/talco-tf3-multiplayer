import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseProbeOutbox, processProbeOnce, serializeProbeInbox } from "../src/userdata-ipc.mjs";

const NONCE = "0123456789abcdef0123456789abcdef";

test("strictly parses the flat userdata probe emitted by TF3", () => {
  const source = `function data()\r\nreturn { \r\n\t\tschemaVersion = 1,\r\n\t\tnonce = "${NONCE}",\r\n\t\tcounter = 7,\r\n\t\tkind = "probe",\r\n}\r\nend\r\n`;
  assert.deepEqual({ ...parseProbeOutbox(source) }, { schemaVersion: 1, nonce: NONCE, counter: 7, kind: "probe" });
});

test("probe parser rejects code, nesting, duplicates, unknown fields and oversize input", () => {
  const validFields = `schemaVersion=1,nonce="${NONCE}",counter=0,kind="probe",`;
  for (const source of [
    `function data() os.execute("bad") return {${validFields}} end`,
    `function data() return {schemaVersion=1,nonce="${NONCE}",counter={0},kind="probe",} end`,
    `function data() return {${validFields}counter=1,} end`,
    `function data() return {${validFields}extra=true,} end`,
    `function data() return {${validFields}} end${" ".repeat(4097)}`,
  ]) assert.throws(() => parseProbeOutbox(source), /invalid userdata IPC/);
});

test("probe response serializer emits round-trippable fixed Lua without interpolation escapes", () => {
  const result = serializeProbeInbox({ nonce: NONCE, counter: 9, status: "ok" });
  assert.match(result, /nonce = "0123456789abcdef0123456789abcdef"/);
  assert.match(result, /counter = 9/);
  assert.throws(() => serializeProbeInbox({ nonce: NONCE, counter: 9, status: 'ok"; os.execute("bad")' }), /invalid userdata IPC/);
});

test("one-shot probe atomically publishes a unique response without overwriting", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "tf3mp-ipc-test-"));
  const directory = path.join(parent, "tf3mp_status_1");
  await mkdir(directory);
  const source = `function data()\nreturn {schemaVersion=1,nonce="${NONCE}",counter=12,kind="probe",}\nend\n`;
  await writeFile(path.join(directory, "outbox.lua"), source, "utf8");
  const result = await processProbeOnce(directory);
  assert.equal(result.probe.counter, 12);
  assert.match(await readFile(result.responsePath, "utf8"), /status = "ok"/);
  await assert.rejects(() => processProbeOnce(directory), (error) => error.code === "EEXIST");
});

test("one-shot probe rejects a linked userdata directory", async (t) => {
  if (process.platform === "win32") {
    const parent = await mkdtemp(path.join(os.tmpdir(), "tf3mp-ipc-link-test-"));
    const target = path.join(parent, "tf3mp_status_1");
    const linked = path.join(parent, "tf3mp_status_1_link");
    await mkdir(target);
    await writeFile(path.join(target, "outbox.lua"), `function data() return {schemaVersion=1,nonce="${NONCE}",counter=1,kind="probe",} end`, "utf8");
    try {
      await symlink(target, linked, "junction");
    } catch (error) {
      if (error.code === "EPERM") return t.skip("Windows junction creation is unavailable");
      throw error;
    }
    await assert.rejects(() => processProbeOnce(linked), /real directory/);
  } else {
    t.skip("Windows-only prototype");
  }
});
