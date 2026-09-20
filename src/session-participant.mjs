import { CommandQueue, ProtocolError } from "./lockstep.mjs";
import { sha256Canonical } from "./canonical.mjs";

const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const hash = h => typeof h === "string" && /^[0-9a-f]{64}$/.test(h);

// Engine-independent participant. Adapter operations MUST be synchronous and
// run in a trusted simulation callback. A file mailbox is not such an adapter.
// Nothing here enables remote TF3 execution or survives a save/reload.
export class SessionParticipant {
  #phase = "lobby";
  #round = null;
  #queue = new CommandQueue({ maxPending: 1 });
  #command = null;
  #receipt = null;
  #sequence = 0;
  #update = -1;
  #seen = 0;
  #deadline = 0;
  #sent = -Infinity;
  #checkpoint = null;
  constructor({ playerId, companies, adapter, send, disconnect, now = Date.now, timeoutMs = 15000, heartbeatMs = 10000 }) {
    if (typeof playerId !== "string" || !(companies instanceof Map) || companies.size < 2 || companies.size > 4
        || !companies.has(playerId) || [...companies].some(([id, entity]) => typeof id !== "string" || !uint(entity))
        || new Set(companies.values()).size !== companies.size) throw new TypeError("verified participant/company map required");
    if (!["checkpoint", "updateCount", "owner", "apply", "halt", "hold", "release", "barrierState"].every(k => typeof adapter?.[k] === "function")
        || typeof send !== "function" || typeof disconnect !== "function"
        || !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || !Number.isSafeInteger(heartbeatMs) || heartbeatMs < 100) throw new TypeError("invalid participant adapter/options");
    this.playerId = playerId; this.companies = new Map(companies); this.adapter = adapter;
    this.send = send; this.disconnect = disconnect; this.now = now;
    this.timeoutMs = timeoutMs; this.heartbeatMs = heartbeatMs;
  }
  get phase() { return this.#phase; }
  get fault() { return this.failure ?? null; }
  halt(code) {
    if (this.#phase === "halted") return;
    this.failure = code; this.#phase = "halted"; this.#command = null;
    // Halt is a latch BEFORE callbacks; even a failing adapter cannot retry.
    try { this.adapter.halt(code); } finally { this.disconnect(); }
  }
  #fail(code) { throw new ProtocolError(code, code); }
  #call(method, ...args) {
    const result = this.adapter[method](...args);
    if (result && typeof result.then === "function") {
      // A promise is not an engine acknowledgment. Observe rejection without
      // awaiting it or allowing a later resolution to reopen this participant.
      Promise.resolve(result).catch(() => {});
      this.#fail("ASYNC_ENGINE_ADAPTER_UNSUPPORTED");
    }
    return result;
  }
  #barrier(update, held) {
    const state = this.#call("barrierState");
    if (state?.held !== held || state?.updateCount !== update || this.#clock() !== update) this.#fail("ENGINE_BARRIER_NOT_CONFIRMED");
  }
  #hold(update) {
    this.#call("hold", update);
    this.#barrier(update, true);
  }
  #release(update) {
    this.#barrier(update, true);
    this.#call("release", update);
    this.#barrier(update, false);
  }
  #guard(work) {
    if (this.#phase === "halted") return false;
    try { this.#checkTime(); work(); return true; }
    catch (e) { this.halt(e.code ?? "PARTICIPANT_ADAPTER_FAILED"); return false; }
  }
  #checkTime() {
    if (this.#phase === "lobby") return;
    if (this.now() - this.#seen >= this.heartbeatMs) this.#fail("HOST_HEARTBEAT_TIMEOUT");
    if (this.#phase !== "running" && this.now() >= this.#deadline) this.#fail("PARTICIPANT_TIMEOUT");
  }
  #clock() {
    const update = this.#call("updateCount");
    if (!uint(update) || update < this.#update) this.#fail("CLOCK_RESET");
    this.#update = update; return update;
  }
  #transition(phase) { this.#phase = phase; this.#deadline = this.now() + this.timeoutMs; }
  receive(kind, p) {
    return this.#guard(() => {
      if (["transport_error", "session_ended", "error", "peer_left"].includes(kind)) this.#fail("PARTICIPANT_DISCONNECTED");
      if (kind === "coordination_prepare") {
        if (this.#phase !== "lobby" || typeof p?.roundId !== "string" || !p.roundId.length || !uint(p.updateCount) || !hash(p.checkpointHash)
            || !Array.isArray(p.players) || p.players.length !== this.companies.size
            || new Set(p.players.map(m => m.playerId)).size !== p.players.length
            || p.players.some(m => !this.companies.has(m.playerId) || this.companies.get(m.playerId) !== m.companyEntity)) this.#fail("CHECKPOINT_MISMATCH");
        this.#hold(p.updateCount);
        const local = this.#call("checkpoint");
        if (local?.checkpointHash !== p.checkpointHash || local?.updateCount !== p.updateCount || this.#clock() !== p.updateCount) this.#fail("CHECKPOINT_MISMATCH");
        this.#checkpoint = { updateCount: p.updateCount, checkpointHash: p.checkpointHash };
        this.#round = p.roundId; this.#seen = this.now(); this.#transition("preparing");
        this.send("participant_ready", { roundId: this.#round, ...this.#checkpoint, companyEntity: this.companies.get(this.playerId) });
        return;
      }
      if (this.#phase === "lobby" || p?.roundId !== this.#round) this.#fail("COORDINATION_IDENTITY_MISMATCH");
      if (kind === "session_halted") this.#fail("HOST_HALTED");
      if (kind === "coordination_heartbeat") { this.#seen = this.now(); return; }
      if (kind === "coordination_ready") {
        if (this.#phase !== "preparing" || p.updateCount !== this.#checkpoint.updateCount || p.checkpointHash !== this.#checkpoint.checkpointHash
            || this.#clock() !== p.updateCount) this.#fail("CHECKPOINT_MISMATCH");
        this.#release(p.updateCount);
        this.#transition("running");
      } else if (kind === "command_prepare") {
        const command = structuredClone(p.command);
        const update = this.#clock();
        if (this.#phase !== "running" || command?.hostSequence !== this.#sequence + 1 || !uint(command.scheduledUpdate)
            || command.scheduledUpdate <= update) this.#fail("INVALID_COMMAND_PREPARE");
        if (!this.#queue.enqueue(command, this.companies, e => this.#call("owner", e))) this.#fail("INVALID_COMMAND_PREPARE");
        this.#command = command; this.#transition("prepared");
        this.send("command_prepared", { roundId: this.#round, hostSequence: command.hostSequence, scheduledUpdate: command.scheduledUpdate, updateCount: update });
      } else if (kind === "command_commit") {
        if (this.#phase !== "prepared" || sha256Canonical(p.command) !== sha256Canonical(this.#command)
            || this.#clock() >= this.#command.scheduledUpdate) this.#fail("INVALID_COMMAND_COMMIT");
        this.#transition("committed");
      } else if (kind === "command_completed") {
        if (this.#phase !== "awaiting_completion" || p.hostSequence !== this.#receipt.hostSequence
            || p.updateCount !== this.#receipt.updateCount || p.stateHash !== this.#receipt.stateHash
            || this.#clock() !== this.#receipt.updateCount) this.#fail("INVALID_COMMAND_COMPLETION");
        this.#release(this.#receipt.updateCount);
        this.#sequence = this.#receipt.hostSequence; this.#receipt = null; this.#command = null;
        this.#transition("running");
      } else this.#fail("UNEXPECTED_COORDINATION_MESSAGE");
      this.#seen = this.now();
    });
  }
  // Caller must poll at every simulation update, not on a wall-clock timer
  // that could skip the target. Send heartbeats even when simulation is paused.
  poll() {
    return this.#guard(() => {
      if (this.#phase === "lobby") return;
      const update = this.#clock();
      if (this.#phase === "preparing" && update !== this.#checkpoint.updateCount) this.#fail("CHECKPOINT_MISMATCH");
      if (this.#phase === "preparing") this.#barrier(this.#checkpoint.updateCount, true);
      if (this.#phase === "prepared" && update >= this.#command.scheduledUpdate) this.#fail("COMMIT_DEADLINE_MISSED");
      if (this.#phase === "committed") {
        const due = this.#queue.due(update);
        if (due.length) {
          // Consume/latch before invoking engine; ambiguous failures NEVER retry.
          this.#transition("awaiting_completion");
          this.#hold(update);
          const result = this.#call("apply", due[0]);
          if (result?.updateCount !== update || !hash(result?.stateHash)) this.#fail("APPLY_OUTCOME_UNKNOWN");
          this.#barrier(update, true);
          this.#receipt = { roundId: this.#round, hostSequence: due[0].hostSequence, updateCount: update, stateHash: result.stateHash };
          this.send("command_applied", { roundId: this.#round, hostSequence: due[0].hostSequence, updateCount: update, stateHash: result.stateHash });
        }
      }
      // The engine must stay at the receipt barrier until everyone completes.
      if (this.#phase === "awaiting_completion" && update !== this.#receipt.updateCount) this.#fail("COMPLETION_BARRIER_PASSED");
      if (this.#phase === "awaiting_completion") this.#barrier(this.#receipt.updateCount, true);
      if (this.now() - this.#sent >= Math.min(1000, this.heartbeatMs / 3)) {
        this.#sent = this.now(); this.send("participant_heartbeat", { roundId: this.#round, updateCount: update });
      }
    });
  }
}
