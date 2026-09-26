import { randomUUID } from "node:crypto";
import { ProtocolError } from "./lockstep.mjs";

const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const hash = h => typeof h === "string" && /^[0-9a-f]{64}$/.test(h);
const exact = (p, fields) => p && typeof p === "object" && !Array.isArray(p) && Object.keys(p).sort().join(",") === fields.split(",").sort().join(",");

// Transport coordination only. A real engine adapter must independently verify
// the checkpoint/company mapping and enforce its own pause/execution barriers.
export class SessionCoordinator {
  #members = new Map();
  #phase = "lobby";
  #round = null;
  #command = null;
  #deadline = 0;
  #lastSequence = 0;
  #checkpoint = null;
  #checkpointSource = null;
  #lastHeartbeat = -Infinity;
  #releaseUpdate = null;
  #resumeSpeed = null;
  #divergence = null;
  #soloStopTest;
  constructor({ broadcast = () => {}, now = Date.now, timeoutMs = 15000, heartbeatMs = 10000, requireReleaseAck = false, soloStopTest = false } = {}) {
    this.broadcast = broadcast; this.now = now;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || !Number.isSafeInteger(heartbeatMs) || heartbeatMs < 100) throw new TypeError("invalid coordination timeout");
    this.timeoutMs = timeoutMs; this.heartbeatMs = heartbeatMs;
    if (typeof requireReleaseAck !== "boolean") throw new TypeError("invalid release-ack mode");
    if (typeof soloStopTest !== "boolean") throw new TypeError("invalid solo Stop test mode");
    this.requireReleaseAck = requireReleaseAck;
    this.#soloStopTest = soloStopTest;
  }
  get phase() { return this.#phase; }
  get locked() { return this.#phase !== "lobby"; }
  get roundId() { return this.#round; }
  get divergence() { return this.#divergence === null ? null : { ...this.#divergence }; }
  // Host policy for the next barrier release, frozen while a round is pending.
  // Zero is a hold, not a release. Require every participant's speed receipt.
  setResumeSpeed(speedup) {
    if(!this.requireReleaseAck || !['lobby','running'].includes(this.#phase) || ![1,2,4].includes(speedup))
      throw new ProtocolError('INVALID_RESUME_SPEED','set a supported speed before the next barrier');
    this.#resumeSpeed=speedup;
  }
  halt(code) {
    if (this.#phase === "halted" || this.#phase === "lobby") return;
    this.#phase = "halted";
    this.broadcast("session_halted", { roundId: this.#round, code, hostSequence: this.#command?.hostSequence ?? this.#lastSequence });
  }
  #fail(code) { this.halt(code); throw new ProtocolError(code, code); }
  #active() { if (this.#phase === "halted") throw new ProtocolError("SESSION_HALTED", "start a new session from a verified checkpoint"); }
  prepare(players, { updateCount, checkpointHash }) {
    if(!hash(checkpointHash)) throw new ProtocolError("INVALID_CHECKPOINT", "expected checkpoint hash required");
    return this.#prepare(players,{updateCount,checkpointHash});
  }
  capture(players, {updateCount}) {
    return this.#prepare(players,{updateCount});
  }
  #prepare(players, { updateCount, checkpointHash }) {
    if (this.locked) throw new ProtocolError("ROSTER_LOCKED", "coordination cannot restart in the same session");
    if (!uint(updateCount) || checkpointHash !== undefined && !hash(checkpointHash)
        || players.length < (this.#soloStopTest ? 1 : 2) || players.length > 4
        || new Set(players.map(p => p.playerId)).size !== players.length
        || new Set(players.map(p => p.companyEntity)).size !== players.length
        || players.some(p => typeof p.playerId !== "string" || !uint(p.companyEntity))) throw new ProtocolError("INVALID_ROSTER", "verified companies and 2-4 participants required");
    this.#checkpoint = { updateCount, ...(checkpointHash === undefined ? {} : {checkpointHash}) };
    this.#checkpointSource = checkpointHash === undefined ? null : { kind: "operator_baseline" };
    this.#round = randomUUID();
    for (const p of players) this.#members.set(p.playerId, { companyEntity: p.companyEntity, updateCount:checkpointHash===undefined?0:updateCount, seen: this.now(), ready: false, prepared: false, applied: null });
    this.#phase = "preparing"; this.#deadline = this.now() + this.timeoutMs;
    this.broadcast(checkpointHash === undefined ? "coordination_capture" : "coordination_prepare", { roundId: this.#round, ...this.#checkpoint,
      players: players.map(p => ({ playerId: p.playerId, companyEntity: p.companyEntity })) });
  }
  #member(id, p) {
    this.poll();
    this.#active();
    const member = this.#members.get(id);
    if (!member || p?.roundId !== this.#round) this.#fail("COORDINATION_IDENTITY_MISMATCH");
    return member;
  }
  ready(id, p) {
    const member = this.#member(id, p);
    if (this.#phase !== "preparing") this.#fail("UNEXPECTED_READY");
    if (!exact(p, "roundId,updateCount,checkpointHash,companyEntity") || p.companyEntity !== member.companyEntity || member.ready
        || p.updateCount !== this.#checkpoint.updateCount || !hash(p.checkpointHash)) this.#fail("CHECKPOINT_MISMATCH");
    if (this.#checkpoint.checkpointHash !== undefined && p.checkpointHash !== this.#checkpoint.checkpointHash) {
      this.#divergence = Object.freeze({ kind: "checkpoint", roundId: this.#round,
        updateCount: p.updateCount, hostSequence: this.#lastSequence, playerId: id,
        companyEntity: member.companyEntity, expectedHash: this.#checkpoint.checkpointHash,
        expectedSource: this.#checkpointSource.kind,
        expectedPlayerId: this.#checkpointSource.playerId ?? null,
        expectedCompanyEntity: this.#checkpointSource.companyEntity ?? null,
        observedHash: p.checkpointHash });
      this.#fail("CHECKPOINT_MISMATCH");
    }
    // First observed digest is a candidate, never release authorization by itself.
    if (this.#checkpointSource === null)
      this.#checkpointSource = { kind: "participant", playerId: id, companyEntity: member.companyEntity };
    this.#checkpoint.checkpointHash = p.checkpointHash;
    member.ready = true; member.updateCount=p.updateCount; member.seen = this.now();
    if ([...this.#members.values()].every(m => m.ready)) {
      this.#beginRelease(this.#checkpoint.updateCount);
      this.broadcast("coordination_ready", { roundId: this.#round, ...this.#checkpoint, ...(this.#resumeSpeed===null?{}:{speedup:this.#resumeSpeed}) });
    }
  }
  #beginRelease(update) {
    this.#phase = this.requireReleaseAck ? "awaiting_release" : "running";
    this.#releaseUpdate = update; this.#deadline = this.now() + this.timeoutMs;
    for (const m of this.#members.values()) m.released = false;
  }
  released(id, p) {
    const member = this.#member(id, p);
    if (!this.requireReleaseAck || this.#phase !== "awaiting_release"
      || !exact(p,"roundId,hostSequence,releaseUpdate,updateCount"+(this.#resumeSpeed===null?'':',speedup')) || p.hostSequence !== this.#lastSequence
      || this.#resumeSpeed!==null && p.speedup!==this.#resumeSpeed
      || p.releaseUpdate !== this.#releaseUpdate || !uint(p.updateCount)
      || p.updateCount < this.#releaseUpdate || p.updateCount < member.updateCount || member.released) this.#fail("INVALID_RELEASE_ACK");
    member.released = true; member.updateCount = p.updateCount; member.seen = this.now();
    if ([...this.#members.values()].every(m => m.released)) this.#phase = "running";
  }
  heartbeat(id, p) {
    const member = this.#member(id, p);
    if (!exact(p, "roundId,updateCount") || !uint(p.updateCount) || p.updateCount < member.updateCount) this.#fail("CLOCK_RESET");
    // A receipt for a held world is invalidated if that same engine reports
    // advancing beyond the barrier before all peers have reached it.
    if (this.#phase === "preparing" && p.updateCount > this.#checkpoint.updateCount)
      this.#fail("CHECKPOINT_DEADLINE_MISSED");
    if (this.#phase === "awaiting_prepare" && p.updateCount >= this.#command.scheduledUpdate) this.#fail("PREPARE_DEADLINE_MISSED");
    if (this.#phase === "awaiting_applied" && p.updateCount > this.#command.scheduledUpdate)
      this.#fail("APPLY_DEADLINE_MISSED");
    member.updateCount = p.updateCount; member.seen = this.now();
  }
  beforeCommand(updateCount) {
    this.#active(); this.poll(updateCount);
    if (this.#phase !== "running") throw new ProtocolError("COORDINATION_NOT_READY", "all participants must be ready; only one outstanding command is allowed");
    if (!uint(updateCount) || [...this.#members.values()].some(m => !m.ready || m.updateCount > updateCount)) this.#fail("CLOCK_MISMATCH");
  }
  propose(command, updateCount) {
    this.beforeCommand(updateCount);
    if (command.hostSequence !== this.#lastSequence + 1 || !uint(command.scheduledUpdate) || command.scheduledUpdate <= updateCount) this.#fail("BAD_COORDINATED_COMMAND");
    this.#command = structuredClone(command);
    this.#phase = "awaiting_prepare"; this.#deadline = this.now() + this.timeoutMs;
    for (const m of this.#members.values()) { m.prepared = false; m.applied = null; }
    this.broadcast("command_prepare", { roundId: this.#round, command: structuredClone(this.#command) });
  }
  prepared(id, p, hostUpdate) {
    const member = this.#member(id, p);
    if (this.#phase !== "awaiting_prepare" || !exact(p, "roundId,hostSequence,scheduledUpdate,updateCount")
        || p.hostSequence !== this.#command?.hostSequence || p.scheduledUpdate !== this.#command?.scheduledUpdate
        || !uint(p.updateCount) || p.updateCount < member.updateCount || p.updateCount >= p.scheduledUpdate
        || !uint(hostUpdate) || hostUpdate >= p.scheduledUpdate || member.prepared) this.#fail("INVALID_PREPARE_ACK");
    member.prepared = true; member.updateCount = p.updateCount; member.seen = this.now();
    if ([...this.#members.values()].every(m => m.prepared)) {
      this.#phase = "awaiting_applied"; this.#deadline = this.now() + this.timeoutMs;
      this.broadcast("command_commit", { roundId: this.#round, command: structuredClone(this.#command) });
    }
  }
  applied(id, p) {
    const member = this.#member(id, p);
    if (this.#phase !== "awaiting_applied" || !exact(p, "roundId,hostSequence,updateCount,stateHash")
        || p.hostSequence !== this.#command?.hostSequence || p.updateCount !== this.#command?.scheduledUpdate
        || p.updateCount < member.updateCount || !hash(p.stateHash) || member.applied !== null) this.#fail("INVALID_APPLIED_ACK");
    const expectedEntry = [...this.#members].find(([, candidate]) => candidate.applied !== null);
    if (expectedEntry && expectedEntry[1].applied !== p.stateHash) {
      this.#divergence = Object.freeze({ kind: "state", roundId: this.#round,
        updateCount: p.updateCount, hostSequence: p.hostSequence, playerId: id,
        companyEntity: member.companyEntity, expectedHash: expectedEntry[1].applied,
        expectedSource: "participant", expectedPlayerId: expectedEntry[0],
        expectedCompanyEntity: expectedEntry[1].companyEntity, observedHash: p.stateHash });
      this.#fail("STATE_MISMATCH");
    }
    member.applied = p.stateHash; member.updateCount = p.updateCount; member.seen = this.now();
    const observed = [...this.#members.values()].map(m => m.applied).filter(h => h !== null);
    if (observed.length === this.#members.size) {
      this.#lastSequence = this.#command.hostSequence;
      this.#beginRelease(p.updateCount);
      this.broadcast("command_completed", { roundId: this.#round, hostSequence: this.#lastSequence, updateCount: p.updateCount, stateHash: p.stateHash,
        ...(this.#resumeSpeed===null?{}:{speedup:this.#resumeSpeed}) });
      this.#command = null;
    }
  }
  disconnected(id) { if (this.#members.has(id)) this.halt("PARTICIPANT_DISCONNECTED"); }
  poll(updateCount) {
    if (["lobby", "halted"].includes(this.#phase)) return;
    if ([...this.#members.values()].some(m => this.now() - m.seen >= this.heartbeatMs)) { this.halt("HEARTBEAT_TIMEOUT"); return; }
    if (this.#phase !== "running" && this.now() >= this.#deadline) { this.halt("COORDINATION_TIMEOUT"); return; }
    if (this.#phase === "awaiting_prepare" && updateCount !== undefined && (!uint(updateCount) || updateCount >= this.#command.scheduledUpdate)) { this.halt("PREPARE_DEADLINE_MISSED"); return; }
    if (this.now() - this.#lastHeartbeat >= Math.min(1000, this.heartbeatMs / 3)) {
      this.#lastHeartbeat = this.now();
      this.broadcast("coordination_heartbeat", { roundId: this.#round });
    }
  }
}
