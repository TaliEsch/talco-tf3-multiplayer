import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EngineObservationMonitor, parseEngineObservation } from "../src/engine-observation.mjs";
const nonce = "a".repeat(32);
test("observation source uses finance namespace and exposes isolated failures", async () => {
  const source = await readFile(new URL("../mod/content/tf3mp_status_panel.script.tl", import.meta.url), "utf8");
  assert.match(source, /api\.engine\.util\.finance\.getPlayersBalance\(company\)/);
  assert.doesNotMatch(source, /api\.engine\.util\.getPlayersBalance/);
  assert.match(source, /if not observationOk or observationWritten ~= true then return "bridge connected \/ observation unavailable/);
});
const lua = fields => `function data() return {${Object.entries(fields).map(([k,v]) => `${k}=${JSON.stringify(v)},`).join("")} } end`;
const sample = overrides => lua({ schemaVersion: 1, kind: "engine_observation", nonce, counter: 1, tickCount: 100, updateCount: 50,
  speedup: 0, companyEntity: 7, balanceKnown: 1, balanceNegative: 0, balance: 300, ...overrides });
function fixture() {
  let time = 0; const events = [];
  const monitor = new EngineObservationMonitor({ nonce, now: () => time, logger: e => events.push(e) });
  return { monitor, events, setTime: t => { time = t; } };
}
test("engine observation uses strict session-bound non-executable schema", () => {
  assert.equal(parseEngineObservation(sample({ balanceNegative: 1 }), nonce).balance, 300);
  for (const override of [{ nonce: "b".repeat(32) }, { extra: 1 }, { companyEntity: -1 }, { balanceKnown: 0 }, { balance: 0, balanceNegative: 1 }, { speedup: 1.5 }]) {
    assert.throws(() => parseEngineObservation(sample(override), nonce));
  }
  assert.throws(() => parseEngineObservation(sample({}) + ';os.execute("bad")', nonce));
  assert.equal(parseEngineObservation(sample({ balance: 0, balanceKnown: 0 }), nonce).balanceKnown, 0);
});
test("pause observation requires fresh advancing ticks and stable updates; resume needs advancing updates", () => {
  const f = fixture(); f.monitor.accept(sample({})); f.setTime(1600);
  f.monitor.accept(sample({ counter: 2 })); assert.equal(f.events.some(e => e.event === "engine_pause_observed"), false);
  f.monitor.accept(sample({ counter: 3, tickCount: 200 }));
  assert.equal(f.events.filter(e => e.event === "engine_pause_observed").length, 1);
  f.monitor.accept(sample({ counter: 4, tickCount: 210, speedup: 1 }));
  assert.equal(f.events.some(e => e.event === "engine_resume_observed"), false);
  f.monitor.accept(sample({ counter: 5, tickCount: 220, speedup: 1, updateCount: 51 }));
  assert.equal(f.events.filter(e => e.event === "engine_resume_observed").length, 1);
  assert.equal(f.monitor.status.gameplayVerified, false);
});
test("replays and stale samples cannot maintain availability or certify pause", () => {
  const f = fixture(); f.monitor.accept(sample({})); f.setTime(5100);
  assert.equal(f.monitor.accept(sample({})), false); assert.equal(f.monitor.status.available, false);
  f.monitor.accept(sample({ counter: 2, tickCount: 250 }));
  assert.equal(f.events.some(e => e.event === "engine_pause_observed"), false);
});
test("company changes and clock reset invalidate observations until helper restart", () => {
  for (const override of [{ companyEntity: 8 }, { tickCount: 99 }, { updateCount: 49 }]) {
    const f = fixture(); f.monitor.accept(sample({}));
    f.monitor.accept(sample({ counter: 2, ...override }));
    assert.equal(f.monitor.status.fault, "CLOCK_OR_COMPANY_CHANGED");
    assert.equal(f.monitor.accept(sample({ counter: 3, tickCount: 300 })), false);
  }
});
test("updates advancing across paused samples restart observation window", () => {
  const f = fixture(); f.monitor.accept(sample({})); f.setTime(1700);
  f.monitor.accept(sample({ counter: 2, tickCount: 200, updateCount: 51 }));
  assert.equal(f.events.some(e => e.event === "engine_pause_observed"), false);
  assert.equal(f.events.at(-1).code, "UPDATES_ADVANCED_WHILE_PAUSED");
});

test("producer reset is latched even if its counter subsequently catches up",()=>{
  const f=fixture(); f.monitor.accept(sample({counter:30}));
  assert.equal(f.monitor.accept(sample({counter:1,tickCount:101})),false);
  assert.equal(f.monitor.status.fault,"OBSERVATION_PRODUCER_RESET");
  assert.equal(f.monitor.status.available,false);
  assert.equal(f.monitor.accept(sample({counter:31,tickCount:200})),false);
  assert.equal(f.events.filter(e=>e.event==="engine_observation_invalidated").length,1);
});
test("changed data under the same counter invalidates producer identity",()=>{
  for(const changes of [{tickCount:101},{updateCount:51},{speedup:1},{balance:301},{companyEntity:8}]){
    const f=fixture(); f.monitor.accept(sample({}));
    assert.equal(f.monitor.accept(sample(changes)),false);
    assert.equal(f.monitor.status.fault,"OBSERVATION_COUNTER_CONFLICT");
    assert.equal(f.monitor.status.available,false);
  }
});
test("identical duplicate read neither faults nor extends its freshness",()=>{
  const f=fixture(); f.monitor.accept(sample({})); f.setTime(4000);
  assert.equal(f.monitor.accept(sample({})),false);
  assert.equal(f.monitor.status.fault,null); f.setTime(5000);
  assert.equal(f.monitor.status.available,false);
});
