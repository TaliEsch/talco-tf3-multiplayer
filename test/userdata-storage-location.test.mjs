import test from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, open, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createUserdataStorageContext } from "../src/userdata-ipc.mjs";

async function fixture(t, { sibling = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-storage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const canonical = path.join(root, "tf3mp_status_1");
  const presets = path.join(root, "mod_presets");
  await mkdir(canonical);
  if (sibling) await mkdir(presets);
  return { root, canonical, presets };
}

test("legacy storage remains the default and does not require mod_presets", async t => {
  const { canonical } = await fixture(t, { sibling: false });
  const storage = await createUserdataStorageContext(canonical);
  assert.equal(storage.mode, "legacy");
  assert.equal(storage.filePath("bridge.lua"), path.join(canonical, "bridge.lua"));
  assert.deepEqual(storage.conflictPaths("bridge.lua"), [path.join(canonical, "bridge.lua")]);
  await assert.rejects(createUserdataStorageContext(canonical, { mode: "steam25754343-observation" }));
  await assert.rejects(createUserdataStorageContext(canonical, { mode: "future-build" }), /unknown userdata storage mode/);
});

test("explicit current-build storage maps only validated flat Lua basenames", async t => {
  const { canonical, presets } = await fixture(t);
  const storage = await createUserdataStorageContext(canonical, { mode: "steam25754343-observation" });
  assert.equal(storage.canonicalDirectory, canonical);
  assert.equal(storage.engineDirectory, presets);
  assert.equal(storage.filePath("coordination_request.lua"), path.join(presets, ".tf3mp_status_1__coordination_request.lua"));
  for (const name of ["../bridge.lua", "nested/bridge.lua", "nested\\bridge.lua", ".bridge.lua", "bridge.lua/other", "bridge.json", "bridge.lua.lua", "", "a".repeat(129) + ".lua"]) {
    assert.throws(() => storage.filePath(name), /invalid flat Lua basename/);
  }
  assert.throws(() => storage.temporaryPath("../race.tmp"), /invalid flat temporary basename/);
  assert.throws(() => storage.temporaryPath("race.lua"), /invalid flat temporary basename/);
});

test("legacy one-use history remains visible alongside the mapped destination", async t => {
  const { canonical, presets } = await fixture(t);
  const storage = await createUserdataStorageContext(canonical, { mode: "steam25754343-observation" });
  const legacy = path.join(canonical, "loan_due_approval_request.lua");
  await writeFile(legacy, "spent", { flag: "wx" });
  const paths = storage.conflictPaths("loan_due_approval_request.lua");
  assert.deepEqual(paths, [legacy, path.join(presets, ".tf3mp_status_1__loan_due_approval_request.lua")]);
  assert.equal((await lstat(paths[0])).isFile(), true);
  assert.equal(Object.isFrozen(paths), true);
});

test("atomic publication temporary and mapped destination share a real directory", async t => {
  const { canonical, presets } = await fixture(t);
  const storage = await createUserdataStorageContext(canonical, { mode: "steam25754343-observation" });
  const temporary = storage.temporaryPath(".bridge-123.tmp");
  const destination = storage.filePath("bridge.lua");
  assert.equal(path.dirname(temporary), path.dirname(destination));
  const handle = await open(temporary, "wx");
  try { await handle.writeFile("function data() return {} end"); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, destination);
  assert.equal(await readFile(destination, "utf8"), "function data() return {} end");
  assert.equal(path.dirname(destination), presets);
});

test("a linked mod_presets sibling is rejected", async t => {
  const { root, canonical } = await fixture(t, { sibling: false });
  const target = path.join(root, "target");
  await mkdir(target);
  try { await symlink(target, path.join(root, "mod_presets"), "junction"); }
  catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") return t.skip("directory links unavailable");
    throw error;
  }
  await assert.rejects(createUserdataStorageContext(canonical, { mode: "steam25754343-observation" }), /mod_presets must be a real directory/);
});
