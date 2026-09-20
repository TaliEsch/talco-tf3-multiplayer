import { parseFlatDataFile } from "./userdata-ipc.mjs";
const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
export function parsePauseReceipt(source, request) {
  const p = parseFlatDataFile(source);
  if (Object.keys(p).sort().join(",") !== "companyEntity,heldUpdate,kind,nonce,outcome,phase,requestId,schemaVersion,speedup,tickCount,updateCount"
    || p.schemaVersion !== 1 || p.kind !== "pause_receipt" || p.nonce !== request.nonce
    || !/^[0-9a-f]{32}$/.test(p.nonce) || p.requestId !== request.requestId || !uint(p.requestId) || p.requestId < 1
    || p.phase !== request.phase || p.companyEntity !== request.companyEntity
    || ![p.companyEntity,p.heldUpdate,p.tickCount,p.updateCount,p.speedup].every(uint)
    || !["paused","checked","resumed","early","late","expired","already_attempted","context_changed","hold_lost","outcome_unknown"].includes(p.outcome)) throw new Error("INVALID_PAUSE_RECEIPT");
  const expected = { pause: "paused", check: "checked", resume: "resumed" }[request.phase];
  if (["paused","checked","resumed"].includes(p.outcome) && (p.outcome !== expected
    || p.updateCount !== p.heldUpdate || p.speedup !== (p.phase === "resume" ? 1 : 0)
    || p.phase !== "pause" && p.heldUpdate !== request.heldUpdate
    || request.scheduledUpdate > 0 && p.heldUpdate !== request.scheduledUpdate
    || p.tickCount < request.issuedTick || p.tickCount > request.expiresTick)) throw new Error("INVALID_PAUSE_POSTCONDITION");
  return p;
}

// Local diagnostic only: pause once, send a NEW engine event while paused, then
// wait for explicit user release. Scheduled mode adds an exact-target diagnostic,
// not a verified multiplayer barrier or native-input lock.
export function createPauseProbe({ nonce, companyEntity, requestId, publish, remove, read, observe, logger, now = Date.now, timeoutMs = 15000, scheduled = false }) {
  if (typeof scheduled !== "boolean") throw new Error("INVALID_PAUSE_MODE");
  let scheduledUpdate = 0;
  let phase = "idle", request, deadline = 0, heldUpdate = 0, firstTick = 0, checkedAt = 0, resumedAt = 0;
  const emit = (event, code, extra = {}) => logger({ level: event === "pause_test_failed" ? "warn" : "info", event, code, scheduledUpdate, ...extra, gameplayVerified: false });
  async function fail(code) {
    phase = "failed";
    await remove("pause_request.lua");
    emit("pause_test_failed", code);
  }
  async function send(next) {
    const s = observe();
    if (!s?.available || !uint(s.sample.tickCount) || s.sample.tickCount > 2147481847 || s.sample.companyEntity !== companyEntity) throw new Error("OBSERVATION_REQUIRED");
    phase = next; deadline = now() + (next === "pause" && scheduled ? 45000 : timeoutMs);
    request = { schemaVersion: 1, kind: "pause_probe", nonce, requestId, phase: next, companyEntity, heldUpdate, scheduledUpdate,
      issuedTick: s.sample.tickCount, expiresTick: s.sample.tickCount + 1800 };
    await publish("pause_request.lua", request);
  }
  return {
    get phase() { return phase; },
    get heldUpdate() { return phase === "held" ? heldUpdate : null; },
    async start() {
      if (phase !== "idle" || observe()?.sample?.speedup !== 1) throw new Error("NORMAL_SPEED_REQUIRED");
      if (scheduled) {
        const update = observe()?.sample?.updateCount;
        if (!uint(update) || !uint(update + 40)) throw new Error("CLOCK_LIMIT");
        scheduledUpdate = update + 40;
      }
      try { await send("pause"); emit("pause_test_started", scheduled ? "EXACT_UPDATE_HOLD_TEST" : "MANUAL_RELEASE_REQUIRED"); }
      catch (e) { await fail("PUBLICATION_UNKNOWN_RESUME_MANUALLY"); throw e; }
    },
    async resume() {
      if (phase !== "held") throw new Error("PAUSE_TEST_NOT_HELD");
      const s = observe();
      if (!s.available || s.sample.speedup !== 0 || s.sample.updateCount !== heldUpdate) { await fail("HOLD_LOST_RESUME_MANUALLY"); return; }
      try { await send("resume"); emit("pause_test_releasing", "EXPLICIT_USER_RELEASE"); }
      catch { await fail("RELEASE_UNKNOWN_RESUME_MANUALLY"); }
    },
    async poll() {
      if (["idle","failed","passed","closed"].includes(phase)) return;
      const s = observe();
      if (!s?.available || s.sample.companyEntity !== companyEntity) { await fail("OBSERVATION_LOST_RESUME_MANUALLY"); return; }
      if (phase === "held" || phase === "settling") {
        if (s.sample.speedup !== 0 || s.sample.updateCount !== heldUpdate) { await fail("HOLD_LOST_RESUME_MANUALLY"); return; }
        if (phase === "held") return;
        if (now() >= deadline) { await fail("PAUSED_CLOCK_NOT_ADVANCING"); return; }
        if (now() - checkedAt >= 2000 && s.sample.tickCount > firstTick) await send("check");
        return;
      }
      if (phase === "progress") {
        if (s.sample.updateCount < heldUpdate || s.sample.tickCount < firstTick) { await fail("CLOCK_RESET"); return; }
        if (s.sample.updateCount > heldUpdate && s.sample.speedup === 1 && now() >= resumedAt) {
          phase = "passed"; emit("pause_test_passed", scheduled ? "LOCAL_EXACT_HOLD_EVENT_RESUME_ONLY" : "LOCAL_PAUSE_EVENT_RESUME_ONLY", { heldUpdate, updateCount: s.sample.updateCount }); return;
        }
      } else {
        let p;
        try { p = parsePauseReceipt(await read("pause_receipt.lua"), request); } catch { /* wait for current bounded receipt */ }
        if (p) {
          if (!["paused","checked","resumed"].includes(p.outcome)) { await fail(p.outcome); return; }
          await remove("pause_request.lua");
          if (phase === "pause") { heldUpdate = p.heldUpdate; firstTick = p.tickCount; phase = "settling"; checkedAt = now(); deadline = now() + timeoutMs; }
          else if (phase === "check") {
            if (p.tickCount <= firstTick) { await fail("PAUSED_EVENT_NOT_FRESH"); return; }
            phase = "held"; emit("pause_test_held", "PRESS_RELEASE_PAUSE_TEST", { heldUpdate, tickCount: p.tickCount });
          } else { phase = "progress"; resumedAt = now(); deadline = now() + timeoutMs; }
        }
      }
      if (now() >= deadline && !["held","passed","failed"].includes(phase)) await fail("TIMEOUT_RESUME_MANUALLY");
    },
    async close() {
      const active = !["idle","failed","passed","closed"].includes(phase);
      phase = "closed"; await remove("pause_request.lua");
      if (active) emit("pause_test_failed", "STOPPED_RESUME_MANUALLY");
    },
  };
}
