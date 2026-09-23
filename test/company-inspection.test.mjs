import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseCompanyInspection, companyInspectionRows } from "../src/company-inspection.mjs";
import { startGameBridge } from "../src/game-bridge.mjs";
import { diagnosticLogger } from "../src/diagnostics.mjs";
const nonce = "a".repeat(32);
const lua = p => `function data() return {${Object.entries(p).map(([k,v]) => `${k}=${JSON.stringify(v)},`).join("")} } end`;
const receipt = overrides => ({ schemaVersion: 1, kind: "company_inspection", nonce, requestId: 1, outcome: "inspected", tickCount: 100, updateCount: 50,
  companyEntity: 7, newCompanyEntity: 8, originalBalance: 100, originalKnown: 1, originalNegative: 1, originalAssets: 12, originalVehicles: 2, originalLines: 1,
  createdBalance: 0, createdKnown: 0, createdNegative: 0, createdAssets: 0, createdVehicles: 0, createdLines: 0, ...overrides });
async function until(predicate) { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 5)); } assert.fail("inspection timed out"); }
for(const outcome of ['inspected','no_test_company']) test(`depot preview enables only from correlated company inspection: ${outcome}`,async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-depot-preview-'));
  const directory=path.join(root,'tf3mp_status_1'),events=[];
  const bridge=await startGameBridge({directory,intervalMs:5,logger:e=>events.push(e)});
  try {
    await assert.rejects(bridge.beginDepotPreview(),/OBSERVATION_REQUIRED/);
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:50}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:50,
      speedup:1,companyEntity:7,balance:100,balanceKnown:1,balanceNegative:0}));
    await until(()=>bridge.engineObservation.available);
    await bridge.beginDepotPreview();
    await assert.rejects(bridge.beginDepotPreview(),/FRESH_SOLO_HOST_REQUIRED/);
    await assert.rejects(bridge.requestCompanyTest(),/BUSY/);
    await assert.rejects(bridge.enableVehicleTest(),/BUSY/);
    await assert.rejects(readFile(path.join(directory,'depot_preview.lua')),{code:'ENOENT'});
    await writeFile(path.join(directory,'company_inspection.lua'),lua(receipt({nonce:bridge.nonce,requestId:1,outcome})));
    await until(()=>events.some(e=>e.event==='depot_preview'&&e.code!=='READ_ONLY_INSPECTION'));
    if(outcome==='inspected') {
      const config=await readFile(path.join(directory,'depot_preview.lua'),'utf8');
      assert.match(config,/originalCompany = 7/);assert.match(config,/targetCompany = 8/);
      assert.ok(config.includes(bridge.nonce));
    } else await assert.rejects(readFile(path.join(directory,'depot_preview.lua')),{code:'ENOENT'});
    await assert.rejects(readFile(path.join(directory,'company_request.lua')),{code:'ENOENT'});
    await bridge.close();
    await assert.rejects(readFile(path.join(directory,'depot_preview.lua')),{code:'ENOENT'});
  } finally {await bridge.close();await rm(root,{recursive:true,force:true});}
});
test("inspection parses distinct companies, negative balances and unknown balances without mixing them", () => {
  const rows = companyInspectionRows(parseCompanyInspection(lua(receipt()), nonce, 1, 7));
  assert.equal(rows[0].balance, -100); assert.equal(rows[0].companyEntity, 7); assert.equal(rows[0].vehicleCount, 2);
  assert.equal(rows[1].balanceKnown, false); assert.equal(rows[1].companyEntity, 8);
  assert.deepEqual(companyInspectionRows(receipt({ outcome: "read_failed" })), []);
});
test("inspection refuses mismatched identity, extra fields, impossible balances and script injection", () => {
  for (const p of [{ nonce: "b".repeat(32) }, { requestId: 2 }, { companyEntity: 9 }, { newCompanyEntity: 7 }, { newCompanyEntity: 0 },
    { originalKnown: 0 }, { originalAssets: -1 }, { createdNegative: 1 }, { extra: 1 }, { outcome: "success" }]) {
    assert.throws(() => parseCompanyInspection(lua(receipt(p)), nonce, 1, 7));
  }
  assert.throws(() => parseCompanyInspection(lua(receipt()) + ';os.execute("bad")', nonce, 1, 7));
});
test("inspection publishes only read-only requests and can be repeated after completion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-company-inspect-")), directory = path.join(root, "tf3mp_status_1"), events = [];
  const bridge = await startGameBridge({ directory, intervalMs: 5, logger: e => events.push(e) });
  try {
    await assert.rejects(bridge.inspectCompanies(), /OBSERVATION_REQUIRED/);
    await writeFile(path.join(directory, "telemetry.lua"), lua({ schemaVersion: 1, kind: "telemetry", nonce: bridge.nonce, counter: 1, tickCount: 100, updateCount: 50 }));
    await writeFile(path.join(directory, "engine_observation.lua"), lua({ schemaVersion: 1, kind: "engine_observation", nonce: bridge.nonce, counter: 1, tickCount: 100, updateCount: 50,
      speedup: 0, companyEntity: 7, balance: 100, balanceKnown: 1, balanceNegative: 0 }));
    await until(() => bridge.engineObservation.available);
    for (let requestId = 1; requestId <= 2; requestId++) {
      await bridge.inspectCompanies();
      await assert.rejects(bridge.inspectCompanies(), /INSPECTION_BUSY/);
      await assert.rejects(bridge.requestCompanyTest(), /COMPANY_TEST_BUSY_OR_USED/);
      await assert.rejects(readFile(path.join(directory, "company_request.lua")), { code: "ENOENT" });
      assert.match(await readFile(path.join(directory, "bridge.lua"), "utf8"), /mode = "telemetry"/);
      await writeFile(path.join(directory, "company_inspection.lua"), lua(receipt({ nonce: bridge.nonce, requestId })));
      await until(() => events.filter(e => e.event === "company_inspection_result").length === requestId);
      await assert.rejects(readFile(path.join(directory, "company_inspect_request.lua")), { code: "ENOENT" });
    }
    assert.equal(events.filter(e => e.event === "company_snapshot").length, 4);
    assert.equal(events.some(e => e.gameplayVerified === true), false);
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});

test('host pair discovery requires the paused engine company and exact update',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-host-pair-'));
  const directory=path.join(root,'tf3mp_status_1');
  const bridge=await startGameBridge({directory,intervalMs:5});
  try{
    await assert.rejects(bridge.discoverHostCompanyPair(),/PAUSED_FRESH_BRIDGE_OBSERVATION_REQUIRED/);
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,
      counter:1,tickCount:100,updateCount:50}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,
      counter:1,tickCount:100,updateCount:50,speedup:0,companyEntity:7,balance:100,balanceKnown:1,balanceNegative:0}));
    await until(()=>bridge.engineObservation.available);
    const pair=bridge.discoverHostCompanyPair();
    await until(async()=>{try{return (await readFile(path.join(directory,'company_inspect_request.lua'),'utf8')).includes('requestId = 1');}catch{return false;}});
    await assert.rejects(bridge.discoverHostCompanyPair(),/HOST_COMPANY_PAIR_BUSY/);
    await writeFile(path.join(directory,'company_inspection.lua'),lua(receipt({nonce:bridge.nonce,requestId:1,tickCount:101,updateCount:50})));
    assert.deepEqual(await pair,{hostCompanyEntity:7,secondCompanyEntity:8,updateCount:50,tickCount:101,requestId:1});
    await until(async()=>{try{await readFile(path.join(directory,'company_inspect_request.lua'));return false;}catch{return true;}});
  }finally{await bridge.close();await rm(root,{recursive:true,force:true});}
});
test("GUI inspection uses documented read APIs and never issues commands", async () => {
  const source = await readFile(new URL("../mod/content/tf3mp_status_panel.script.tl", import.meta.url), "utf8");
  const region = source.slice(source.indexOf("local function exchangeCompanyInspection"), source.indexOf("local function dispatchPauseAtUpdate"));
  assert.match(region, /api\.engine\.util\.finance\.getPlayersBalance\(entity\)/);
  assert.match(region, /requireOwnedByPlayer = entity/);
  assert.match(region, /api\.engine\.system\.lineSystem\.getLinesForPlayer\(entity\)/);
  assert.doesNotMatch(region, /api\.cmd|makeGame|makeVehicle|sendCommand/);
});
test("company diagnostic output retains scalar statistics but not nested data or secrets", () => {
  let text = ""; diagnosticLogger({ write: s => { text += s; } })({ event: "company_snapshot", companyEntity: 7, balance: -100, balanceKnown: true,
    assetCount: 12, vehicleCount: 2, lineCount: 1, nonce, secret: nonce, payload: receipt() });
  const p = JSON.parse(text); assert.equal(p.balance, -100); assert.equal(p.vehicleCount, 2);
  assert.equal(p.secret, undefined); assert.equal(p.nonce, undefined); assert.equal(p.payload, undefined);
});
