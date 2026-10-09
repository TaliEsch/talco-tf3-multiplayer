import { parseFlatDataFile } from "./userdata-ipc.mjs";
export function parseControlReceipt(source, nonce, phase) {
  const p = parseFlatDataFile(source);
  if (Object.keys(p).sort().join(",") !== "kind,nonce,outcome,phase,schemaVersion" || p.schemaVersion !== 1
    || p.kind !== "control_receipt" || p.nonce !== nonce || !/^[0-9a-f]{32}$/.test(p.nonce) || p.phase !== phase
    || !["acquire","release"].includes(phase) || !["acquired","released","conflict","unavailable"].includes(p.outcome)
    || p.outcome === "acquired" && phase !== "acquire" || p.outcome === "released" && phase !== "release") throw new Error("INVALID_CONTROL_RECEIPT");
  return p;
}

// One diagnostic lease per helper. GUI changes its speed field and latches the
// reviewed native replacements. Acquisition waits for original manager teardown;
// this still does not prove coverage of every input or recall queued commands.
export function createControlLease({ nonce, publish, remove, read, held, valid = held, logger, now = Date.now }) {
  let phase = "idle", deadline = 0;
  const emit = (event, code) => logger({ level: event === "control_test_failed" ? "warn" : "info", event, code, gameplayVerified: false });
  async function fail(code) {
    phase = "failed";
    try { await remove(); } finally { emit("control_test_failed", code); }
  }
  return {
    get phase() { return phase; },
    async acquire() {
      if (phase !== "idle" || !held()) throw new Error("HELD_TEST_REQUIRED");
      phase = "acquire"; deadline = now() + 15000;
      try { await publish({ schemaVersion: 1, kind: "control_request", nonce, phase }); emit("control_test_started", "WAIT_FOR_GUI_ACK"); }
      catch { await fail("CONTROL_PUBLICATION_FAILED"); }
    },
    async release() {
      if (phase !== "locked") throw new Error("CONTROL_NOT_LOCKED");
      phase = "release"; deadline = now() + 15000;
      try { await publish({ schemaVersion: 1, kind: "control_request", nonce, phase }); }
      catch { await fail("RESTORE_UNKNOWN_STOP_HELPER"); }
    },
    async poll() {
      if (["idle","released","failed","closed"].includes(phase)) return;
      if (!valid() || phase === "acquire" && !held()) { await fail("HOLD_LOST_RESTORING_CONTROLS"); return; }
      const expected = phase === "locked" ? "acquire" : phase;
      let receipt;
      try { receipt = parseControlReceipt(await read(), nonce, expected); } catch { /* missing/partial/old is not an ack */ }
      if (receipt) {
        if (["conflict","unavailable"].includes(receipt.outcome)) { await fail("GUI_CONTROL_" + receipt.outcome.toUpperCase()); return; }
        if (phase === "acquire" && receipt.outcome === "acquired") { phase = "locked"; emit("control_test_locked", "TRY_NATIVE_SPEED_INPUTS_WHILE_HELD"); }
        if (phase === "release" && receipt.outcome === "released") {
          await remove();
          // Teardown callers observe phase directly. Do not report completion
          // before request removal, or resurrect a lease closed during removal.
          if (phase !== "release") return;
          emit("control_test_released", "NOW_RELEASE_PAUSE_TEST");
          phase = "released";
        }
      }
      if (!["locked","released"].includes(phase) && now() >= deadline) await fail("GUI_ACK_TIMEOUT_STOP_HELPER");
    },
    async close() { phase = "closed"; await remove(); },
  };
}
