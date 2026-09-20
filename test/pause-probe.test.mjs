import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPauseProbe, parsePauseReceipt } from "../src/pause-probe.mjs";
const nonce = "a".repeat(32);
const lua = p => `function data() return {${Object.entries(p).map(([k,v]) => `${k}=${JSON.stringify(v)},`).join("")} } end`;
function fixture(scheduled = false) {
  let now = 0, available = true, request, receipt;
  const sample = { tickCount: 100, updateCount: 50, companyEntity: 7, speedup: 1 }, events = [], sends = [];
  const p = createPauseProbe({ nonce, companyEntity: 7, requestId: 1, now: () => now, scheduled,
    publish: async (_name, value) => { request = value; sends.push(value); }, remove: async () => {},
    read: async () => { if (!receipt) throw new Error("missing"); return receipt; },
    observe: () => ({ available, sample: { ...sample } }), logger: e => events.push(e) });
  const respond = (outcome, extra = {}) => { receipt = lua({ schemaVersion: 1, kind: "pause_receipt", nonce, requestId: 1,
    phase: request.phase, companyEntity: 7, heldUpdate: 50, tickCount: sample.tickCount, updateCount: 50, speedup: sample.speedup, outcome, ...extra }); };
  return { p, sample, events, sends, respond, setTime: n => { now = n; }, unavailable: () => { available = false; },
    async held() {
      await p.start(); sample.speedup = 0; sample.tickCount = 101; respond("paused"); await p.poll();
      now = 2100; sample.tickCount = 120; await p.poll(); sample.tickCount = 121; respond("checked"); await p.poll();
      assert.equal(p.phase, "held");
    } };
}
test("pause diagnostic requires a fresh paused event and explicit release plus advancing updates", async () => {
  const f = fixture(); await f.held();
  assert.deepEqual(f.sends.map(s => s.phase), ["pause","check"]);
  f.setTime(30000); f.sample.tickCount = 200; await f.p.poll(); assert.equal(f.p.phase, "held");
  await f.p.resume(); f.sample.speedup = 1; f.sample.tickCount = 201; f.respond("resumed"); await f.p.poll();
  assert.equal(f.p.phase, "progress"); await f.p.poll(); assert.equal(f.p.phase, "progress");
  f.sample.updateCount = 51; await f.p.poll(); assert.equal(f.p.phase, "passed");
  assert.equal(f.events.at(-1).gameplayVerified, false);
});
for (const failure of ["disconnect","hold_lost","company_changed","close"]) test(`pause diagnostic never auto-resumes on ${failure}`, async () => {
  const f = fixture(); await f.held();
  if (failure === "disconnect") f.unavailable();
  if (failure === "hold_lost") f.sample.updateCount++;
  if (failure === "company_changed") f.sample.companyEntity++;
  if (failure === "close") await f.p.close(); else await f.p.poll();
  assert.ok(["closed","failed"].includes(f.p.phase));
  assert.equal(f.sends.some(r => r.phase === "resume"), false);
  await assert.rejects(f.p.resume(), /NOT_HELD/);
});
test("pause timeout consumes attempt and never retries", async () => {
  const f = fixture(); await f.p.start(); f.setTime(16000); await f.p.poll(); await f.p.poll();
  assert.equal(f.p.phase, "failed"); assert.equal(f.sends.length, 1);
  await assert.rejects(f.p.start());
});
test("wrong phase, forged identity and incorrect postconditions cannot acknowledge pause", () => {
  const request = { nonce, requestId: 1, phase: "pause", companyEntity: 7, issuedTick: 100, expiresTick: 200 };
  const receipt = { schemaVersion: 1, kind: "pause_receipt", nonce, requestId: 1, phase: "pause", companyEntity: 7,
    heldUpdate: 50, tickCount: 101, updateCount: 50, speedup: 0, outcome: "paused" };
  assert.equal(parsePauseReceipt(lua(receipt), request).outcome, "paused");
  for (const extra of [{ nonce: "b".repeat(32) }, { requestId: 2 }, { companyEntity: 8 }, { phase: "check" },
    { updateCount: 51 }, { speedup: 1 }, { tickCount: 201 }, { extra: 1 }, { outcome: "resumed" }]) {
    assert.throws(() => parsePauseReceipt(lua({ ...receipt, ...extra }), request));
  }
});
test("normal speed is required and release before held is rejected", async () => {
  const f = fixture(); f.sample.speedup = 2;
  await assert.rejects(f.p.start(), /NORMAL_SPEED_REQUIRED/);
  await assert.rejects(f.p.resume(), /NOT_HELD/); assert.equal(f.sends.length, 0);
});

test("scheduled pause keeps one target through hold, fresh paused event and explicit resume", async () => {
  const f = fixture(true); await f.p.start();
  assert.equal(f.sends[0].scheduledUpdate, 90);
  assert.equal(f.events[0].code, "EXACT_UPDATE_HOLD_TEST");
  f.sample.updateCount = 90; f.sample.tickCount = 160; f.sample.speedup = 0;
  f.respond("paused", { heldUpdate: 90, updateCount: 90 }); await f.p.poll();
  f.setTime(2100); f.sample.tickCount = 180; await f.p.poll();
  f.respond("checked", { heldUpdate: 90, updateCount: 90 }); await f.p.poll();
  assert.equal(f.p.phase, "held"); await f.p.resume();
  assert.ok(f.sends.every(r => r.scheduledUpdate === 90));
  f.sample.speedup = 1; f.sample.tickCount = 190;
  f.respond("resumed", { heldUpdate: 90, updateCount: 90 }); await f.p.poll();
  f.sample.updateCount = 91; await f.p.poll();
  assert.equal(f.p.phase, "passed");
  assert.equal(f.events.at(-1).code, "LOCAL_EXACT_HOLD_EVENT_RESUME_ONLY");
  assert.equal(f.events.at(-1).heldUpdate, f.events.at(-1).scheduledUpdate);
});

for (const code of ["early", "late"]) test(`scheduled ${code} receipt stops without retry or resume`, async () => {
  const f = fixture(true); await f.p.start(); f.respond(code); await f.p.poll();
  assert.equal(f.p.phase, "failed"); assert.equal(f.events.at(-1).code, code);
  await assert.rejects(f.p.resume()); await f.p.poll(); assert.equal(f.sends.length, 1);
});

test("scheduled success at the wrong update is rejected instead of certifying a hold", () => {
  const request = { nonce, requestId: 1, phase: "pause", companyEntity: 7, issuedTick: 100, expiresTick: 200, scheduledUpdate: 90 };
  const receipt = { schemaVersion: 1, kind: "pause_receipt", nonce, requestId: 1, phase: "pause", companyEntity: 7,
    heldUpdate: 89, tickCount: 150, updateCount: 89, speedup: 0, outcome: "paused" };
  assert.throws(() => parsePauseReceipt(lua(receipt), request), /INVALID_PAUSE_POSTCONDITION/);
});

test("scheduled target overflow is rejected before publication", async () => {
  const f = fixture(true); f.sample.updateCount = 2147483640;
  await assert.rejects(f.p.start(), /CLOCK_LIMIT/); assert.equal(f.sends.length, 0);
});
test("engine source latches attempts, limits speed, never resumes from update, GUI never changes speed", async () => {
  const script = await readFile(new URL("../mod/content/tf3mp_status.script.tl", import.meta.url), "utf8");
  const part = script.slice(script.indexOf("local function pauseEvent"), script.indexOf("local function companyEvent"));
  assert.ok(part.indexOf("state:set(current)") < part.indexOf("api.cmd.sendCommand"));
  assert.match(part, /current.pauseTestAttempted = true/);
  assert.match(part, /request.phase == "pause" and 0 or 1/);
  assert.match(part, /old.outcome ~= expected/);
  for (const comparison of ["clock.updateCount < request.scheduledUpdate", "clock.updateCount > request.scheduledUpdate"]) {
    assert.ok(part.indexOf(comparison) >= 0 && part.indexOf(comparison) < part.indexOf("api.cmd.sendCommand"));
  }
  const update = script.slice(script.indexOf("  update = function"), script.indexOf("  handleEvent = function"));
  assert.doesNotMatch(update, /pauseEvent\(|makeGameSetSpeedCmd/);
  const gui = await readFile(new URL("../mod/content/tf3mp_status_panel.script.tl", import.meta.url), "utf8");
  assert.doesNotMatch(gui, /makeGameSetSpeedCmd|GameSpeedPause\s*=(?!=)/);
});
