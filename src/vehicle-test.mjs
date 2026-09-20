import { HostAuthority } from "./lockstep.mjs";
import { parseFlatDataFile } from "./userdata-ipc.mjs";

const integer = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const keys = value => Object.keys(value).sort().join(",");
export function parseVehicleIntent(source, nonce) {
  const v = parseFlatDataFile(source);
  if (keys(v) !== "entity,kind,nonce,requestId,schemaVersion,stopFlag" || v.schemaVersion !== 1
      || v.kind !== "vehicle_intent" || v.nonce !== nonce || !/^[0-9a-f]{32}$/.test(v.nonce)
      || ![v.entity, v.requestId].every(integer) || v.requestId < 1 || ![0, 1].includes(v.stopFlag)) throw new Error("BAD_VEHICLE_INTENT");
  return v;
}
export function parseVehicleReceipt(source, nonce, actionId, entity) {
  const v = parseFlatDataFile(source);
  if (keys(v) !== "actionId,company,entity,hostSequence,kind,localPlayer,nonce,outcome,phase,revision,scheduledUpdate,schemaVersion,stopFlag,tickCount,updateCount"
      || ![1, 2].includes(v.schemaVersion) || v.kind !== "vehicle_receipt" || v.nonce !== nonce || !/^[0-9a-f]{32}$/.test(v.nonce)
      || v.actionId !== actionId || v.entity !== entity
      || ![v.actionId, v.entity, v.company, v.localPlayer, v.hostSequence, v.revision, v.scheduledUpdate, v.tickCount, v.updateCount].every(integer)
      || ![0, 1].includes(v.stopFlag) || !["inspect", "commit"].includes(v.phase)
      || !["inspected", "queued", "applied", "hold_lost", "not_owner", "missing", "changed", "early", "late", "clock_reset", "expired", "command_failed", "no_inspection", "busy", "bad_schedule", "runtime_reset", "handler_failed"].includes(v.outcome)) throw new Error("BAD_VEHICLE_RECEIPT");
  return v;
}

// Isolated local experiment: authority uses real engine snapshots, but this is
// NOT a remote-client executor or multiplayer company-provisioning mechanism.
export function createVehicleTest({ nonce, read, publish, remove, clock, connected, scheduled = false, leadUpdates = 60, heldUpdate = null, onHeldApplied = async () => {}, logger = () => {}, now = Date.now, timeoutMs = 60000 }) {
  if (heldUpdate !== null && (!integer(heldUpdate) || heldUpdate < 1 || !scheduled)) throw new TypeError("BAD_HELD_UPDATE");
  const version = heldUpdate === null ? 1 : 2;
  if (typeof scheduled !== "boolean") throw new TypeError("BAD_VEHICLE_MODE");
  if (![20, 40, 60].includes(leadUpdates)) throw new TypeError("BAD_VEHICLE_LEAD");
  const authority = new HostAuthority({ sessionId: nonce, buildHash: "0".repeat(64), modManifestHash: "0".repeat(64), leadUpdates,
    resolveEntityOwner: entity => snapshot?.entity === entity ? snapshot.company : null });
  let player = authority.admit({ displayName: "Local vehicle experiment", buildHash: "0".repeat(64), modManifestHash: "0".repeat(64) });
  let snapshot = null, transaction = null, seenRequest = 0, actionSequence = 0, faulted = false;
  const finish = async (code, success = false, receipt = null) => {
    const current = transaction;
    transaction = null;
    if (heldUpdate !== null || !success && current?.phase === "commit") faulted = true; // Held test is one action only.
    await remove("vehicle_command.lua");
    logger({ level: success ? "info" : "warn", event: success ? "vehicle_test_applied" : "vehicle_test_rejected", code,
      ...(receipt ? { updateCount: receipt.updateCount, scheduledUpdate: receipt.scheduledUpdate, hostSequence: receipt.hostSequence } : {}) });
    if (success && heldUpdate !== null) await onHeldApplied(receipt);
  };
  return {
    get busy() { return transaction !== null; },
    get faulted() { return faulted; },
    async poll() {
      if (transaction) {
        // Extra clicks during a transaction are discarded, not queued for later.
        try {
          const extra = parseVehicleIntent(await read("vehicle_intent.lua"), nonce);
          if (extra.requestId > seenRequest) {
            seenRequest = extra.requestId;
            logger({ level: "warn", event: "vehicle_test_input_ignored", code: "BUSY" });
          }
        } catch { /* No valid extra intent. */ }
        const latestClock = clock();
        if (heldUpdate !== null && latestClock.updateCount !== heldUpdate) { await finish("HOLD_LOST"); return; }
        if (latestClock.updateCount < transaction.lastClock.updateCount || latestClock.tickCount < transaction.lastClock.tickCount) {
          await finish("CLOCK_RESET"); return;
        }
        transaction.lastClock = latestClock;
        if (!connected()) { await finish("BRIDGE_OFFLINE"); return; }
        if (now() >= transaction.deadline) { await finish(transaction.phase === "commit" ? "OUTCOME_UNKNOWN" : "INSPECTION_TIMEOUT"); return; }
        let receipt;
        try { receipt = parseVehicleReceipt(await read("vehicle_receipt.lua"), nonce, transaction.actionId, transaction.entity); }
        catch { return; } // Partial, old, and foreign receipts are not acknowledgments.
        if (receipt.schemaVersion !== version) return;
        if (receipt.phase !== transaction.phase) return;
        if (transaction.phase === "inspect") {
          if (receipt.outcome !== "inspected" || receipt.company !== receipt.localPlayer) { await finish(receipt.outcome === "inspected" ? "NOT_OWNER" : receipt.outcome); return; }
          if (player.companyEntity === null) player = authority.bindCompanyEntity(player.playerId, receipt.company);
          if (player.companyEntity !== receipt.company) { await finish("COMPANY_CHANGED"); return; }
          snapshot = receipt;
          const current = clock();
          if (current.updateCount < receipt.updateCount) return; // Telemetry can lag the GUI receipt by one sample.
          if (current.updateCount - receipt.updateCount > 30) { await finish("STALE_INSPECTION"); return; }
          if (!integer(current.updateCount + leadUpdates) || !integer(receipt.tickCount + 1200)) { await finish("CLOCK_LIMIT"); return; }
          const ordered = authority.accept({ messageId: `vehicle-${transaction.actionId}`, clientSequence: transaction.actionId,
            commandType: "vehicle.setRunning", originPlayerId: player.playerId, targetCompanyEntity: player.companyEntity,
            targetEntity: transaction.entity, payload: { running: transaction.stopFlag === 0 } }, current.updateCount, player.playerId);
          // The GUI holds scheduled work outside the save and dispatches a fresh
          // event near the target. The engine rejects any non-exact delivery.
          const accepted = { ...ordered, scheduledUpdate: heldUpdate ?? (scheduled ? ordered.scheduledUpdate : 0) };
          transaction = { ...transaction, phase: "commit", accepted, company: receipt.company, revision: receipt.revision,
            inspectedUpdate: receipt.updateCount, inspectedTick: receipt.tickCount };
          await publish("vehicle_command.lua", { schemaVersion: version, kind: "vehicle_command", nonce, phase: "commit",
            actionId: transaction.actionId, entity: transaction.entity, stopFlag: transaction.stopFlag,
            company: receipt.company, revision: receipt.revision, hostSequence: accepted.hostSequence,
            scheduledUpdate: accepted.scheduledUpdate, expiresTick: receipt.tickCount + 1200 });
          logger({ level: "info", event: "vehicle_test_accepted", code: heldUpdate !== null ? "HELD_UPDATE_LOCAL_TEST" : scheduled ? "SCHEDULED_LOCAL_TEST" : "IMMEDIATE_LOCAL_TEST", hostSequence: accepted.hostSequence, scheduledUpdate: accepted.scheduledUpdate });
        } else {
          if (receipt.hostSequence !== transaction.accepted.hostSequence || receipt.scheduledUpdate !== transaction.accepted.scheduledUpdate) return;
          if (receipt.outcome === "queued") {
            if (!transaction.queued) logger({ level: "info", event: "vehicle_test_queued", hostSequence: receipt.hostSequence, scheduledUpdate: receipt.scheduledUpdate });
            transaction.queued = true;
            return;
          }
          const success = receipt.outcome === "applied" && receipt.updateCount >= transaction.inspectedUpdate
            && (!scheduled || receipt.updateCount === transaction.accepted.scheduledUpdate)
            && receipt.updateCount <= transaction.inspectedUpdate + 600
            && receipt.tickCount >= transaction.inspectedTick && receipt.tickCount <= transaction.inspectedTick + 1200
            && receipt.company === transaction.company && receipt.localPlayer === transaction.company
            && receipt.revision === transaction.revision && receipt.stopFlag === transaction.stopFlag;
          await finish(success ? "applied" : receipt.outcome === "applied" ? "INVALID_APPLIED_RECEIPT" : receipt.outcome, success, receipt);
        }
        return;
      }
      if (!connected() || faulted) return;
      let intent;
      try { intent = parseVehicleIntent(await read("vehicle_intent.lua"), nonce); } catch { return; }
      if (intent.requestId <= seenRequest) return;
      seenRequest = intent.requestId;
      transaction = { actionId: ++actionSequence, entity: intent.entity, stopFlag: intent.stopFlag, phase: "inspect", deadline: now() + timeoutMs, lastClock: { ...clock() } };
      await publish("vehicle_command.lua", { schemaVersion: version, kind: "vehicle_command", nonce, phase: "inspect",
        actionId: transaction.actionId, entity: intent.entity, stopFlag: intent.stopFlag, company: 0, revision: 0,
        hostSequence: 0, scheduledUpdate: heldUpdate ?? 0, expiresTick: 0 });
      logger({ level: "info", event: "vehicle_test_inspecting" });
    },
    async cancel() {
      faulted = true;
      if (transaction) await finish(transaction.phase === "commit" ? "CANCEL_REQUESTED_OUTCOME_UNKNOWN" : "CANCELLED_BEFORE_APPROVAL");
      else await remove("vehicle_command.lua");
      logger({ level: "info", event: "vehicle_test_disabled", code: "RESTART_HOST_TO_REENABLE" });
    },
    async close() { faulted = true; await remove("vehicle_command.lua"); transaction = null; },
  };
}
