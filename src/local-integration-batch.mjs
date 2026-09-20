import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { summarizeBatchTiming } from "./batch-timing.mjs";

// Guided orchestration of existing LOCAL engine diagnostics. This is not the
// AsyncSessionParticipant adapter and never admits remote gameplay commands.
export function createLocalIntegrationBatch({ bridge, logger, saveReport, now = Date.now, monotonicNow = () => performance.now(), metadata = {} }) {
  let monotonicStart=null;
  let phase = "idle", pending = Promise.resolve(), heldUpdate = null, resumedUpdate = null, action = null, reportBroken = false;
  const safeHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : null;
  const report = { schemaVersion:1, batchId:randomUUID(), scope:"local_bridge_integration",
    testPlanVersion:3,
    gameplayVerified:false, multiGameVerified:false, startedAt:null, finishedAt:null,
    metadata:{ gameHash:safeHash(metadata.gameHash), modManifestHash:safeHash(metadata.modManifestHash) },
    phase, outcome:"not_started", checks:[], humanConfirmation:null, events:[] };
  const active = () => !["idle","passed","failed","stopped"].includes(phase);
  function emit(code) { logger({level:phase === "failed" ? "warn" : "info",event:"integration_batch",code,gameplayVerified:false}); }
  function persist() {
    report.timing=summarizeBatchTiming(report.events);
    const snapshot=structuredClone({...report,phase});
    pending=pending.then(() => { if(!reportBroken) return saveReport(snapshot); }).catch(() => {
      // A missing report must not be presented as a complete test batch.
      phase="failed"; report.outcome="report_write_failed"; report.finishedAt=now();
      reportBroken=true;
      emit("REPORT_WRITE_FAILED_STOP_HELPER");
    });
    return pending;
  }
  function fail(code) {
    if(!active()) return;
    phase="failed"; report.outcome=code; report.finishedAt=now(); persist(); emit("FAILED_STOP_HELPER_NO_RETRY");
  }
  function run(method,args) {
    // Bridge logger callbacks run inside the bridge's serialized poll. Defer
    // requests and never await them inside that callback (would deadlock).
    Promise.resolve().then(() => {
      if(!active()) return;
      return bridge[method](args);
    }).catch(() => fail("bridge_request_failed"));
  }
  function transition(next,code) { phase=next; persist(); emit(code); }
  function check(name) { if(!report.checks.includes(name)) report.checks.push(name); }
  return {
    get active() { return active(); },
    get phase() { return phase; },
    get report() { return structuredClone({...report,phase}); },
    start() {
      if(phase !== "idle") throw new Error("BATCH_ALREADY_USED");
      report.startedAt=now(); report.outcome="in_progress";
      monotonicStart=monotonicNow();
      transition("probe","ENGINE_PROBE_RUNNING"); run("requestEngineProbe");
    },
    confirmControls() {
      if(phase !== "controls") throw new Error("BATCH_NOT_READY_FOR_CONFIRMATION");
      report.humanConfirmation={speedButtonsBlocked:true,keyboardShortcutsBlocked:true,nativeVehicleToggleBlocked:true,nativeManagerRestricted:true,simulationStayedPaused:true,at:now()};
      check("user_confirmed_speed_buttons_and_shortcuts");
      // Explicit confirmation authorizes restore AND resume, in that order,
      // with the existing separate engine acknowledgements still mandatory.
      transition("restoring","RESTORING_CONTROLS_THEN_RESUMING"); run("requestControlTest",{release:true});
    },
    rejectControls() { fail("user_reported_control_bypass"); },
    onEvent(e) {
      if(!active()) return;
      const relevant = /^(engine_probe_|pause_test_|combined_test_|vehicle_test_|control_test_|held_snapshot_|halt_test_|watchdog_test_|bridge_disconnected|engine_observation_unavailable|engine_observation_invalidated)/.test(e.event ?? "");
      if(!relevant) return;
      // No secrets, raw payloads, paths, save contents or player names.
      const row={at:now()};
      const elapsedMs=monotonicNow()-monotonicStart;
      if(Number.isFinite(elapsedMs)&&elapsedMs>=0) row.elapsedMs=elapsedMs;
      for(const k of ["event","code","updateCount","scheduledUpdate","heldUpdate","hostSequence","tickCount"])
        if(["string","number"].includes(typeof e[k])) row[k]=e[k];
      if(report.events.length >= 128) { fail("event_limit"); return; }
      report.events.push(row);
      if(e.event === "held_snapshot_verified" && /^[a-f0-9]{64}$/.test(e.hash ?? "")) {
        check("selected_state_stable_while_held");
        report.selectedStateEvidence={scope:"held_vehicle_company_v1",hash:e.hash,heldUpdate:e.heldUpdate};
      }
      if (["engine_probe_timeout","engine_probe_failed","engine_probe_disconnected","engine_probe_rejected","pause_test_failed","vehicle_test_rejected","control_test_failed","held_snapshot_failed","halt_test_unknown","watchdog_test_unknown","bridge_disconnected","engine_observation_unavailable","engine_observation_invalidated"].includes(e.event)) { fail(e.event); return; }
      if(phase === "probe" && e.event === "engine_probe_succeeded") {
        check("engine_probe"); transition("holding","EXACT_HOLD_RUNNING"); run("requestPauseTest",{scheduled:true,withVehicle:true});
      } else if(phase === "holding" && e.event === "pause_test_held") {
        if(e.heldUpdate !== e.scheduledUpdate || !Number.isSafeInteger(e.heldUpdate)) { fail("hold_mismatch"); return; }
        heldUpdate=e.heldUpdate; check("exact_hold_and_paused_event"); persist();
      } else if(phase === "holding" && e.event === "combined_test_select_vehicle") {
        if(heldUpdate === null || e.heldUpdate !== heldUpdate) { fail("hold_mismatch"); return; }
        transition("vehicle","CLICK_MP_STOP_ONCE");
      } else if(phase === "vehicle" && e.event === "vehicle_test_applied") {
        if(e.updateCount !== heldUpdate || e.scheduledUpdate !== heldUpdate || e.code !== "applied") { fail("vehicle_update_mismatch"); return; }
        action={updateCount:e.updateCount,hostSequence:e.hostSequence}; persist();
      } else if(phase === "vehicle" && e.event === "combined_test_action_held") {
        if(!action || e.heldUpdate !== heldUpdate) { fail("vehicle_receipt_missing"); return; }
        if(!report.selectedStateEvidence || report.selectedStateEvidence.heldUpdate!==heldUpdate) { fail("snapshot_receipt_missing"); return; }
        check("vehicle_action_at_held_update"); transition("locking","LOCKING_SPEED_CONTROLS"); run("requestControlTest");
      } else if(phase === "locking" && e.event === "control_test_locked") {
        check("speed_flag_acknowledged"); transition("controls","TRY_BUTTONS_AND_SHORTCUTS_THEN_CONFIRM");
      } else if(phase === "restoring" && e.event === "control_test_released") {
        check("speed_flag_restored"); transition("resuming","RESUMING_AFTER_CONFIRMATION"); run("releasePauseTest");
      } else if(phase === "resuming" && e.event === "pause_test_passed") {
        if(e.heldUpdate !== heldUpdate || !(e.updateCount > heldUpdate)) { fail("resume_mismatch"); return; }
        resumedUpdate=e.updateCount;
        check("resume_progress"); persist();
      } else if(phase === "resuming" && e.event === "combined_test_passed") {
        if(!report.checks.includes("resume_progress")) { fail("resume_receipt_missing"); return; }
        transition("halting","VERIFYING_TERMINAL_ENGINE_STOP");run("requestWatchdogTest");
      } else if(phase === "halting" && e.event === "watchdog_test_confirmed") {
        if(!Number.isSafeInteger(e.heldUpdate)||e.heldUpdate<resumedUpdate||e.code!=="LOCAL_ENGINE_EXPIRY_STOP_CONFIRMED") {fail("watchdog_receipt_mismatch");return;}
        check("terminal_engine_expiry_stop_observed");
        report.terminalStop={mechanism:"engine_lease_expiry",heldUpdate:e.heldUpdate,observedAt:now(),continuousGuarantee:false};
        phase="passed"; report.outcome="local_only_passed"; report.finishedAt=now();
        persist().then(() => { if(phase === "passed") emit("LOCAL_BATCH_PASSED_REPORT_SAVED"); });
      } else persist();
    },
    async stop() {
      if(active()) { phase="stopped"; report.outcome="interrupted_outcome_unknown"; report.finishedAt=now(); persist(); }
      await pending;
    },
    async flush() { await pending; },
  };
}
