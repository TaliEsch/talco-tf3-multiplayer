import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, appendFile, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { validateReviewPackage } from "../src/review-validator.mjs";

test('review rejects changed station/service modules and weakened session admission', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tf3mp-station-service-review-'));
  try {
    await cp(new URL('../mod', import.meta.url), root, {recursive:true});
    for (const kind of ['station', 'service']) {
      const file = path.join(root, 'content', `tf3mp_${kind}_command.lua`);
      const source = await readFile(file, 'utf8');
      await appendFile(file, '\n-- changed\n');
      await assert.rejects(validateReviewPackage(root), new RegExp(`${kind} adapter differs`));
      await writeFile(file, source);
    }
    const file = path.join(root, 'content', 'tf3mp_status.script.tl');
    const source = await readFile(file, 'utf8');
    for (const marker of ['station1.sessionId ~= request.nonce', 'station2.sessionId ~= request.nonce']) {
      await writeFile(file, source.replace(marker, 'false'));
      await assert.rejects(validateReviewPackage(root), /missing station\/service admission guard/);
    }
  } finally { await rm(root, {recursive:true, force:true}); }
});

test('review rejects changed purchase adapter or weakened purchase admission',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-purchase-review-'));
  try {
    await cp(new URL('../mod',import.meta.url),root,{recursive:true});
    const adapter=path.join(root,'content','tf3mp_vehicle_command.lua');
    const original=await readFile(adapter,'utf8');
    await appendFile(adapter,'\n-- unreviewed\n');
    await assert.rejects(validateReviewPackage(root),/vehicle adapter differs/);
    await writeFile(adapter,original);
    const file=path.join(root,'content','tf3mp_status.script.tl');
    const source=await readFile(file,'utf8');
    const start=source.indexOf('local function phase2VehicleEvent');
    for(const marker of ['if count ~= 11','depot.sessionId ~= request.nonce','current.nativeVehicleAttempted == true']) {
      await writeFile(file,source.slice(0,start)+source.slice(start).replace(marker,'false'));
      await assert.rejects(validateReviewPackage(root),/phase2 vehicle guard/);
    }
  }finally{await rm(root,{recursive:true,force:true});}
});

test('review rejects changed depot adapter or removed engine admission guards',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-depot-review-'));
  try {
    await cp(new URL('../mod',import.meta.url),root,{recursive:true});
    const module=path.join(root,'content','tf3mp_depot_command.lua');
    const original=await readFile(module,'utf8');
    await appendFile(module,'\n-- unreviewed change\n');
    await assert.rejects(validateReviewPackage(root),/depot adapter differs/);
    await writeFile(module,original);
    const file=path.join(root,'content','tf3mp_status.script.tl');
    const source=await readFile(file,'utf8');
    const start=source.indexOf('local function phase2DepotEvent');
    for(const marker of ['request.confirmed ~= 1','current.nativeDepotAttempted == true','if count ~= 15']) {
      await writeFile(file,source.slice(0,start)+source.slice(start).replace(marker,'false'));
      await assert.rejects(validateReviewPackage(root),/phase2 depot guard/);
    }
  } finally {await rm(root,{recursive:true,force:true});}
});

test('review rejects managed window losing its builtin window identity',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-window-identity-'));
  try {
    await cp(new URL('../mod',import.meta.url),root,{recursive:true});
    const file=path.join(root,'content','tf3mp_depot_tools.script.lua');
    const source=await readFile(file,'utf8');
    await writeFile(file,source.replace('react.RegisterWrapperRecipe("TalCoDepotToolsWindow", builtin.Window,','react.RegisterRecipe("TalCoDepotToolsWindow",'));
    await assert.rejects(validateReviewPackage(root),/window requires.*wrapper metadata/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('review rejects Lua resource exported as an ordinary require module',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-resource-export-'));
  try {
    await cp(new URL('../mod',import.meta.url),root,{recursive:true});
    const file=path.join(root,'content','tf3mp_depot_tools.script.lua');
    const source=await readFile(file,'utf8');
    await writeFile(file,source.replace(/function data\(\)\s+return \{TalCoDepotTools=Tools\}\s+end/,'return {TalCoDepotTools=Tools}'));
    await assert.rejects(validateReviewPackage(root),/resource must export.*data/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test("review rejects removing halt latch or observed stop postcondition",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"tf3mp-halt-review-"));
  try{
    await cp(new URL("../mod",import.meta.url),root,{recursive:true});
    const file=path.join(root,"content","tf3mp_status.script.tl"),source=await readFile(file,"utf8");
    for(const marker of ["current.haltTestAttempted = true","afterClock.updateCount == beforeUpdate and afterSpeed.speedup == 0"]){
      await writeFile(file,source.replace(marker,"false"));
      await assert.rejects(validateReviewPackage(root),/halt/);
    }
  }finally{await rm(root,{recursive:true,force:true});}
});

test("review rejects removing pre/post held-vehicle checks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-held-review-"));
  try {
    await cp(new URL("../mod", import.meta.url), root, { recursive: true });
    const file = path.join(root, "content", "tf3mp_status.script.tl"), source = await readFile(file, "utf8");
    for (const marker of ['if not vehicleHoldValid(current, request)', 'after.stopFlag == request.stopFlag and vehicleHoldValid(current, request)', 'old.schemaVersion ~= request.schemaVersion']) {
      await writeFile(file, source.replace(marker, 'false'));
      await assert.rejects(validateReviewPackage(root), /missing held-vehicle guard/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("review rejects company creation without the saved pre-mutation barrier", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-company-review-"));
  try {
    await cp(new URL("../mod", import.meta.url), root, { recursive: true });
    const file = path.join(root, "content", "tf3mp_status.script.tl");
    const source = await readFile(file, "utf8");
    await writeFile(file, source.replace("current.companyTestAttempted = true\n  state:set(current)", "current.companyTestAttempted = true"));
    await assert.rejects(validateReviewPackage(root), /missing company-test guard/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("review requires both exact-delivery boundaries before vehicle mutation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-exact-review-"));
  try {
    await cp(new URL("../mod", import.meta.url), root, { recursive: true });
    const file = path.join(root, "content", "tf3mp_status.script.tl");
    const source = await readFile(file, "utf8");
    for (const boundary of ['<', '>']) {
      await writeFile(file, source.replace(`if clock.updateCount ${boundary} request.scheduledUpdate then`, 'if false then'));
      await assert.rejects(validateReviewPackage(root), /missing vehicle-test guard/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("review rejects cross-callback locals and saved vehicle execution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-context-review-"));
  try {
    await cp(new URL("../mod", import.meta.url), root, { recursive: true });
    const file = path.join(root, "content", "tf3mp_status.script.tl");
    const source = await readFile(file, "utf8");
    await writeFile(file, source + '\nlocal inspectedVehicleKey = ""\n');
    await assert.rejects(validateReviewPackage(root), /cross-callback Lua locals/);
    await writeFile(file, source.replace("current.vehicleInbox = {}", "vehicleEvent(state, current, current.vehicleInbox)"));
    await assert.rejects(validateReviewPackage(root), /discard saved vehicle work/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("review requires receipt subscription and migration for existing saves", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-subscription-review-"));
  try {
    await cp(new URL("../mod", import.meta.url), root, { recursive: true });
    const file = path.join(root, "content", "tf3mp_status.script.tl");
    const source = await readFile(file, "utf8");
    await writeFile(file, source.replace('state:subscribeToEvent("tf3mp_get_engine_receipt")', ''));
    await assert.rejects(validateReviewPackage(root), /missing script event subscription/);
    await writeFile(file, source.replace('current.eventSubscriptionsVersion ~= 25', 'false'));
    await assert.rejects(validateReviewPackage(root), /missing event subscription migration/);
    await writeFile(file, source.replace('roadStopOrderPrepare.handle(state, param as table, api)', 'nil'));
    await assert.rejects(validateReviewPackage(root), /ordered road Stop preparation route/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("review rejects unsupported log.info in the engine script", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-logger-review-"));
  try {
    await cp(new URL("../mod", import.meta.url), root, { recursive: true });
    const file = path.join(root, "content", "tf3mp_status.script.tl");
    const source = await readFile(file, "utf8");
    assert.match(source, /log\.message\(/);
    await writeFile(file, source.replace("log.message(", "log.info("));
    await assert.rejects(validateReviewPackage(root), /unsupported TF3 logger/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("source mod package passes controlled-load review validation", async () => {
  const result = await validateReviewPackage(new URL("../mod", import.meta.url));
  assert.equal(result.modId, "tf3mp_status_1");
  assert.equal(result.contentFiles, 38);
  assert.equal(result.executableFiles, 0);
  assert.equal(result.readyForControlledLoadReview, true);
});

test("review rejects reintroducing restricted userdata calls into the panel", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-panel-review-"));
  try {
    await cp(new URL("../mod", import.meta.url), root, { recursive: true });
    await appendFile(path.join(root, "content", "tf3mp_status_panel.script.tl"), '\napp.getAllUserdata("tf3mp_status_1")\n');
    await assert.rejects(validateReviewPackage(root), /restricted userdata APIs/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("review rejects exchange moved back into the restricted engine reader", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-reader-review-"));
  try {
    await cp(new URL("../mod", import.meta.url), root, { recursive: true });
    const file = path.join(root, "content", "tf3mp_status_panel.script.tl");
    const source = await readFile(file, "utf8");
    await writeFile(file, source.replace("local makeState = function() : Tf3MpPanelState", "local makeState = function() : Tf3MpPanelState\n    exchangeTelemetry(0, 0)"));
    await assert.rejects(validateReviewPackage(root), /restricted engine reader/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("review requires a protected callback and a stop-after-failure guard", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-protected-review-"));
  try {
    await cp(new URL("../mod", import.meta.url), root, { recursive: true });
    const file = path.join(root, "content", "tf3mp_status_panel.script.tl");
    const source = await readFile(file, "utf8");
    await writeFile(file, source.replaceAll("bridgeFailed = true", "bridgeFailed = false"));
    await assert.rejects(validateReviewPackage(root), /missing protected bridge marker/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
