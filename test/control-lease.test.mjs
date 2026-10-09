import test from "node:test";
import assert from "node:assert/strict";
import { createControlLease, parseControlReceipt } from "../src/control-lease.mjs";
const nonce = "a".repeat(32);
const lua = p => `function data() return {${Object.entries(p).map(([k,v]) => `${k}=${JSON.stringify(v)},`).join("")} } end`;
function fixture() {
  let time = 0, holding = true, receipt = "", removed = 0;
  const sends = [], events = [];
  const p = createControlLease({ nonce, now: () => time, held: () => holding,
    publish: async value => sends.push(value), remove: async () => { removed++; },
    read: async () => receipt, logger: e => events.push(e) });
  return { p, sends, events, removed: () => removed, time: n => { time = n; }, lose: () => { holding = false; },
    reply: (phase, outcome, extra = {}) => { receipt = lua({schemaVersion:1, kind:"control_receipt", nonce, phase, outcome, ...extra}); } };
}
test("controls require explicit acquire/restore acknowledgements, never resume the game", async () => {
  const f = fixture(); await f.p.acquire(); await f.p.poll(); assert.equal(f.p.phase, "acquire");
  f.reply("acquire", "acquired"); await f.p.poll(); assert.equal(f.p.phase, "locked");
  f.time(90000); await f.p.poll(); assert.equal(f.p.phase, "locked");
  await f.p.release(); await f.p.poll(); assert.equal(f.p.phase, "release");
  f.reply("release", "released"); await f.p.poll(); assert.equal(f.p.phase, "released");
  assert.equal(f.removed(), 1); assert.deepEqual(f.sends.map(s => s.phase), ["acquire", "release"]);
  assert.ok(f.events.every(e => e.gameplayVerified === false));
  await assert.rejects(f.p.acquire(), /HELD_TEST_REQUIRED/);
});
for (const reason of ["timeout", "hold lost", "conflict", "unavailable", "close", "wrong nonce", "restore timeout"]) test(`control lease fails closed: ${reason}`, async () => {
  const f = fixture(); await f.p.acquire();
  if (reason === "restore timeout") { f.reply("acquire", "acquired"); await f.p.poll(); await f.p.release(); }
  if (reason === "hold lost") f.lose();
  if (["conflict", "unavailable"].includes(reason)) f.reply("acquire", reason);
  if (reason === "wrong nonce") f.reply("acquire", "acquired", { nonce: "b".repeat(32) });
  if (["timeout", "wrong nonce", "restore timeout"].includes(reason)) f.time(15001);
  if (reason === "close") await f.p.close(); else await f.p.poll();
  assert.ok(["closed", "failed"].includes(f.p.phase)); assert.equal(f.removed(), 1);
  await assert.rejects(f.p.release(), /CONTROL_NOT_LOCKED/);
  assert.ok(f.sends.every(s => !Object.hasOwn(s, "speedup")));
});
test("control receipt rejects extra keys and contradictory phases", () => {
  const valid = {schemaVersion:1, kind:"control_receipt", nonce, phase:"acquire", outcome:"acquired"};
  for (const extra of [{code:"extra"}, {outcome:"released"}, {schemaVersion:2}, {nonce:"x"}]) {
    assert.throws(() => parseControlReceipt(lua({...valid,...extra}), nonce, "acquire"), /INVALID_CONTROL_RECEIPT/);
  }
});

test('coordinated controls acquire only while held then remain locked during valid running session',async()=>{
  let holding=true,valid=true;
  const p=createControlLease({nonce,held:()=>holding,valid:()=>valid,publish:async()=>{},remove:async()=>{},logger:()=>{},
    read:async()=>lua({schemaVersion:1,kind:'control_receipt',nonce,phase:'acquire',outcome:'acquired'})});
  await p.acquire();await p.poll();assert.equal(p.phase,'locked');
  holding=false;await p.poll();assert.equal(p.phase,'locked');
  valid=false;await p.poll();assert.equal(p.phase,'failed');
});

for (const closeDuringRemoval of [false, true]) test(`release waits for request removal; concurrent close=${closeDuringRemoval}`, async()=>{
  let receipt='', finishRemoval, enteredRemoval;
  const entered=new Promise(resolve=>{enteredRemoval=resolve;});
  const removal=new Promise(resolve=>{finishRemoval=resolve;});
  const events=[];
  let removals=0;
  const p=createControlLease({nonce,held:()=>true,publish:async()=>{},
    read:async()=>receipt,logger:event=>events.push(event),
    remove:async()=>{if(++removals===1){enteredRemoval();await removal;}}});
  await p.acquire();
  receipt=lua({schemaVersion:1,kind:'control_receipt',nonce,phase:'acquire',outcome:'acquired'});
  await p.poll();await p.release();
  receipt=lua({schemaVersion:1,kind:'control_receipt',nonce,phase:'release',outcome:'released'});
  const polling=p.poll();await entered;
  assert.equal(p.phase,'release');
  assert.equal(events.some(event=>event.event==='control_test_released'),false);
  if(closeDuringRemoval)await p.close();
  finishRemoval();await polling;
  assert.equal(p.phase,closeDuringRemoval?'closed':'released');
  assert.equal(events.filter(event=>event.event==='control_test_released').length,closeDuringRemoval?0:1);
});
