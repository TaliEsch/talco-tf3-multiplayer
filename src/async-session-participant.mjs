import { randomUUID } from "node:crypto";
import { CommandQueue, ProtocolError } from "./lockstep.mjs";
import { sha256Canonical } from "./canonical.mjs";

const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
const hash = s => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
const exact = (p, fields) => p && typeof p === "object" && !Array.isArray(p)
  && Object.keys(p).sort().join(",") === fields.split(",").sort().join(",");

// Receipt-driven alternative to SessionParticipant, NOT a TF3 engine adapter.
// publish() completion means delivery only. Only correlated engine receipts can
// acknowledge effects. executeHeld must schedule/hold inside the engine, not
// wait for a JavaScript wall-clock poll to notice the target update.
export class AsyncSessionParticipant {
  #phase = "lobby"; #round = null; #pending = null; #command = null;
  #checkpoint = null; #receipt = null; #sequence = 0; #update = -1;
  #held = false; #seen = 0; #engineSeen = -Infinity; #deadline = 0; #sent = -Infinity;
  #companies; #queue;
  #fault = null; #haltState = "not_requested"; #haltDeadline = 0;
  #issuedUpdate = -1;
  #faultEvidence = null;
  constructor({ playerId, companies, publish, send, disconnect, now = Date.now,
    timeoutMs = 15000, heartbeatMs = 10000, engineStaleMs = 5000,
    requireEngineBinding = false,enableDepotBuild=false }) {
    if (!(companies instanceof Map) || companies.size < 2 || companies.size > 4 || !companies.has(playerId)
      || [...companies].some(([id,c]) => typeof id !== "string" || !id.length || !uint(c))
      || new Set(companies.values()).size !== companies.size) throw new TypeError("distinct verified companies required");
    if (![publish,send,disconnect,now].every(f => typeof f === "function")
      || ![timeoutMs,heartbeatMs,engineStaleMs].every(n => Number.isSafeInteger(n) && n >= 100)) throw new TypeError("invalid asynchronous participant options");
    this.playerId = playerId; this.#companies = new Map(companies);
    this.publish = publish; this.send = send; this.disconnect = disconnect; this.now = now;
    this.timeoutMs = timeoutMs; this.heartbeatMs = heartbeatMs; this.engineStaleMs = engineStaleMs;
    if (typeof requireEngineBinding !== "boolean") throw new TypeError("invalid engine binding option");
    if(typeof enableDepotBuild!=='boolean')throw new TypeError('invalid depot capability');
    this.requireEngineBinding = requireEngineBinding;
    this.enableDepotBuild=enableDepotBuild;
    this.#queue=new CommandQueue({maxPending:1,enableDepotBuild});
  }
  get phase() { return this.#phase; }
  get fault() { return this.#fault; }
  get haltState() { return this.#haltState; }
  get faultEvidence() { return this.#faultEvidence && structuredClone(this.#faultEvidence); }
  #fail(code) { throw new ProtocolError(code, code); }
  #transition(phase) { this.#phase = phase; this.#deadline = this.now() + this.timeoutMs; }
  #time() {
    if (this.#phase === "lobby") return;
    if (this.now() - this.#seen >= this.heartbeatMs) this.#fail("HOST_HEARTBEAT_TIMEOUT");
    if (this.now() - this.#engineSeen >= this.engineStaleMs) this.#fail("ENGINE_OBSERVATION_STALE");
    if (this.#phase !== "running" && this.now() >= this.#deadline) this.#fail("PARTICIPANT_TIMEOUT");
  }
  #guard(work) {
    if (this.#phase === "halted") return false;
    try { this.#time(); work(); return true; }
    catch (e) { this.halt(e.code ?? "ASYNC_PARTICIPANT_FAILED"); return false; }
  }
  #issue(operation, data = {}) {
    const request = { schemaVersion: 1, roundId: this.#round, operationId: randomUUID(), operation, ...structuredClone(data) };
    this.#pending = request; // Latch before any callback; never republish on timeout.
    this.#issuedUpdate = this.#update;
    try {
      Promise.resolve(this.publish(structuredClone(request))).catch(error => {
        if (this.#pending?.operationId !== request.operationId) return;
        this.#recordDeliveryFailure(request,error);
        if (operation === "halt") { this.#haltState = "unknown"; return; }
        this.halt("ENGINE_DELIVERY_UNKNOWN");
      });
    } catch (error) {
      if (this.#pending?.operationId !== request.operationId) return;
      this.#recordDeliveryFailure(request,error);
      if (operation === "halt") this.#haltState = "unknown";
      else this.halt("ENGINE_DELIVERY_UNKNOWN");
    }
  }
  #recordDeliveryFailure(request,error) {
    let errorCode='UNCLASSIFIED',deliveryStage='unknown';
    try {
      const code=error?.code, stage=error?.publicationStage;
      if(['EPERM','EACCES','EBUSY','ENOENT','ENOSPC','EIO','EROFS','EMFILE','ENFILE'].includes(code))errorCode=code;
      if(['queued','path_check','temporary_open','temporary_write','temporary_sync','replace'].includes(stage))deliveryStage=stage;
    } catch { /* Never invoke error formatting or leak a thrown payload. */ }
    const delivery={operation:request.operation,errorCode,deliveryStage};
    if(this.#faultEvidence===null)this.#faultEvidence={kind:'request_publication',...delivery};
    else if(request.operation==='halt')this.#faultEvidence={...this.#faultEvidence,haltDelivery:delivery};
  }
  halt(code) {
    if (this.#phase === "halted") return;
    this.#fault = code; this.#phase = "halted"; this.#command = null;
    this.#haltState = "pending"; this.#haltDeadline = this.now() + this.timeoutMs;
    this.#issue("halt"); // Best effort stop; disconnect alone is not an engine halt.
    try { this.disconnect(); } catch { /* failure cannot reopen participant */ }
  }
  #clock(update, held) {
    if (!uint(update) || update < this.#update || typeof held !== "boolean") this.#fail("CLOCK_RESET");
    this.#update = update; this.#held = held; this.#engineSeen = this.now();
  }
  #barrier(update) {
    if (!this.#held || this.#update !== update) this.#fail("ENGINE_BARRIER_NOT_CONFIRMED");
  }
  // Trusted adapter observations only, never a network player's claimed clock.
  observe(p) {
    if (this.#phase === "halted") {
      // Confirmation is a current observation, not a permanent safety claim.
      // Once it is lost, no observation alone can re-certify this failed session.
      if (this.#haltState === "confirmed") {
        if (!exact(p,"updateCount,held") || p.held !== true || p.updateCount !== this.#update) this.#haltState = "unknown";
        else this.#engineSeen = this.now();
      }
      return false;
    }
    return this.#guard(() => {
      if (!exact(p, "updateCount,held")) this.#fail("INVALID_ENGINE_OBSERVATION");
      this.#clock(p.updateCount, p.held);
      if (["binding_session","holding_checkpoint"].includes(this.#phase) && p.updateCount > this.#checkpoint.updateCount) this.#fail("CHECKPOINT_DEADLINE_MISSED");
      if (["preparing","awaiting_completion"].includes(this.#phase)) this.#barrier(this.#receipt?.updateCount ?? this.#checkpoint.updateCount);
      if (["inspecting","prepared"].includes(this.#phase) && p.updateCount >= this.#command.scheduledUpdate) this.#fail("COMMIT_DEADLINE_MISSED");
      if (this.#phase === "executing" && p.updateCount > this.#command.scheduledUpdate) this.#fail("EXECUTION_DEADLINE_MISSED");
    });
  }
  receive(kind, p) {
    return this.#guard(() => {
      if (["transport_error","session_ended","error","peer_left"].includes(kind)) this.#fail("PARTICIPANT_DISCONNECTED");
      if (kind === "coordination_prepare" || kind === "coordination_capture") {
        const capture=kind === "coordination_capture";
        if (this.#phase !== "lobby" || !exact(p,capture ? "roundId,updateCount,players" : "roundId,updateCount,checkpointHash,players")
          || typeof p.roundId !== "string" || p.roundId.length < 1 || p.roundId.length > 128 || !uint(p.updateCount) || !capture && !hash(p.checkpointHash)
          || !Array.isArray(p.players) || p.players.length !== this.#companies.size
          || new Set(p.players.map(m => m?.playerId)).size !== p.players.length
          || p.players.some(m => !exact(m,"playerId,companyEntity") || !this.#companies.has(m.playerId) || this.#companies.get(m.playerId) !== m.companyEntity)
          || this.now() - this.#engineSeen >= this.engineStaleMs || this.#update > p.updateCount || p.updateCount > this.#update + 600) this.#fail("CHECKPOINT_MISMATCH");
        this.#round = p.roundId; this.#checkpoint = {updateCount:p.updateCount, ...(capture ? {} : {checkpointHash:p.checkpointHash})};
        this.#seen = this.now();
        if (this.requireEngineBinding) {
          this.#transition("binding_session");
          this.#issue("bindSession", {localPlayerId:this.playerId,players:p.players});
        } else {
          this.#transition("holding_checkpoint"); this.#issue("holdCheckpoint", this.#checkpoint);
        }
        return;
      }
      if (this.#phase === "lobby" || p?.roundId !== this.#round) this.#fail("COORDINATION_IDENTITY_MISMATCH");
      if (kind === "session_halted") this.#fail("HOST_HALTED");
      if (kind === "coordination_heartbeat") {
        if (!exact(p,"roundId")) this.#fail("INVALID_HEARTBEAT");
        this.#seen = this.now(); return;
      }
      if (kind === "coordination_ready") {
        const speed=Object.hasOwn(p,'speedup');
        if (this.#phase !== "preparing" || !exact(p,"roundId,updateCount,checkpointHash"+(speed?',speedup':'')) || speed&&![1,2,4].includes(p.speedup)
          || p.updateCount !== this.#checkpoint.updateCount || p.checkpointHash !== this.#checkpoint.checkpointHash) this.#fail("CHECKPOINT_MISMATCH");
        this.#barrier(p.updateCount); this.#transition("releasing"); this.#issue("release", {updateCount:p.updateCount,...(speed?{speedup:p.speedup}:{})});
      } else if (kind === "command_prepare") {
        if (this.#phase !== "running" || !exact(p,"roundId,command")) this.#fail("INVALID_COMMAND_PREPARE");
        const c = structuredClone(p.command);
        if (!exact(c,"protocolVersion,hostSequence,scheduledUpdate,originPlayerId,targetCompanyEntity,targetEntity,commandType,payload,clientSequence,requestMessageId")
          || !['vehicle.setRunning','road.stop.place',...(this.enableDepotBuild?['road.depot.build']:[])].includes(c.commandType)
          || c.hostSequence !== this.#sequence + 1
          || !uint(c.scheduledUpdate) || c.scheduledUpdate <= this.#update
          || typeof c.requestMessageId !== "string" || c.requestMessageId.length > 128) this.#fail("INVALID_COMMAND_PREPARE");
        // Structural check only here. Actual owner comes from engine inspection,
        // then must be checked atomically again by executeHeld before mutation.
        const check = new CommandQueue({maxPending:1,enableDepotBuild:this.enableDepotBuild});
        if (!check.enqueue(c,this.#companies,() => c.targetCompanyEntity)) this.#fail("INVALID_COMMAND_PREPARE");
        this.#command = c; this.#transition("inspecting"); this.#issue("prepare", {command:c});
      } else if (kind === "command_commit") {
        if (this.#phase !== "prepared" || !exact(p,"roundId,command") || sha256Canonical(p.command) !== sha256Canonical(this.#command)
          || this.#update >= this.#command.scheduledUpdate) this.#fail("INVALID_COMMAND_COMMIT");
        this.#transition("executing"); this.#issue("executeHeld", {command:this.#command});
      } else if (kind === "command_completed") {
        const speed=Object.hasOwn(p,'speedup');
        if (this.#phase !== "awaiting_completion" || !exact(p,"roundId,hostSequence,updateCount,stateHash"+(speed?',speedup':'')) || speed&&![1,2,4].includes(p.speedup)
          || p.hostSequence !== this.#receipt.hostSequence || p.updateCount !== this.#receipt.updateCount
          || p.stateHash !== this.#receipt.stateHash) this.#fail("INVALID_COMMAND_COMPLETION");
        this.#barrier(p.updateCount); this.#transition("releasing"); this.#issue("release", {updateCount:p.updateCount,...(speed?{speedup:p.speedup}:{})});
      } else this.#fail("UNEXPECTED_COORDINATION_MESSAGE");
      this.#seen = this.now();
    });
  }
  // Caller parses bounded data, then feeds an engine-owned receipt. Stale/duplicate
  // receipts are ignored; a malformed receipt for the active operation faults.
  receiveEngine(p) {
    const r = this.#pending;
    if (!r || p?.operationId !== r.operationId || p?.roundId !== this.#round) return false;
    const common = "schemaVersion,roundId,operationId,operation,status,updateCount,held";
    if (this.#phase === "halted") {
      if (this.#haltState === "pending" && r.operation === "halt" && this.now() < this.#haltDeadline && exact(p,common)
        && p.schemaVersion === 1 && p.operation === "halt" && p.status === "ok" && p.held === true && uint(p.updateCount) && p.updateCount >= this.#update) {
        this.#clock(p.updateCount,true);
        this.#haltState = "confirmed"; this.#pending = null; return true;
      }
      return false;
    }
    const receiptPhase=this.#phase;
    const accepted=this.#guard(() => {
      const extra = r.operation === "holdCheckpoint" ? ",checkpointHash" : r.operation === "prepare" ? ",ownerCompanyEntity"
        : r.operation === "executeHeld" ? ",ownerCompanyEntity,stateHash" : r.operation==='release'&&Object.hasOwn(r,'speedup') ? ',speedup' : "";
      if (!exact(p,common + extra) || p.schemaVersion !== 1 || p.operation !== r.operation || p.status !== "ok") this.#fail("ENGINE_OUTCOME_UNKNOWN");
      // Non-barrier receipts describe an earlier event, not the latest clock.
      // Telemetry can overtake them while the engine runs. Never rewind the
      // observed clock, accept a pre-request receipt, or relax exact held checks.
      const historical=['bindSession','prepare','release'].includes(r.operation);
      if(historical && (!uint(p.updateCount)||p.updateCount<this.#issuedUpdate||typeof p.held!=='boolean')) this.#fail('INVALID_RECEIPT_CLOCK');
      if(!historical || p.updateCount>=this.#update)this.#clock(p.updateCount,p.held);
      this.#pending = null;
      if (r.operation === "bindSession") {
        // Binding acknowledgement is NOT checkpoint or gameplay verification.
        if (this.#update > this.#checkpoint.updateCount) this.#fail("CHECKPOINT_DEADLINE_MISSED");
        this.#transition("holding_checkpoint"); this.#issue("holdCheckpoint", this.#checkpoint);
      } else if (r.operation === "holdCheckpoint") {
        this.#barrier(r.updateCount);
        if (!hash(p.checkpointHash) || r.checkpointHash !== undefined && p.checkpointHash !== r.checkpointHash) this.#fail("CHECKPOINT_MISMATCH");
        this.#checkpoint.checkpointHash=p.checkpointHash;
        this.#transition("preparing");
        this.send("participant_ready", {roundId:this.#round,...this.#checkpoint,companyEntity:this.#companies.get(this.playerId)});
      } else if (r.operation === "prepare") {
        if (this.#update >= this.#command.scheduledUpdate
          || ['road.stop.place','road.depot.build'].includes(this.#command.commandType)
            && p.ownerCompanyEntity!==this.#command.targetCompanyEntity
          || !this.#queue.enqueue(this.#command,this.#companies,() => p.ownerCompanyEntity)) this.#fail("INVALID_PREPARE_RECEIPT");
        this.#transition("prepared");
        this.send("command_prepared", {roundId:this.#round,hostSequence:this.#command.hostSequence,scheduledUpdate:this.#command.scheduledUpdate,updateCount:this.#update});
      } else if (r.operation === "executeHeld") {
        this.#barrier(this.#command.scheduledUpdate);
        if (p.ownerCompanyEntity !== this.#command.targetCompanyEntity || !hash(p.stateHash)
          || this.#queue.due(p.updateCount).length !== 1) this.#fail("APPLY_OUTCOME_UNKNOWN");
        this.#receipt = {roundId:this.#round,hostSequence:this.#command.hostSequence,updateCount:p.updateCount,stateHash:p.stateHash};
        this.#transition("awaiting_completion"); this.send("command_applied", {...this.#receipt});
      } else if (r.operation === "release") {
        if (p.held || this.#held || p.updateCount < r.updateCount || Object.hasOwn(r,'speedup')&&p.speedup!==r.speedup) this.#fail("RELEASE_NOT_CONFIRMED");
        if (this.#receipt) this.#sequence = this.#receipt.hostSequence;
        this.#command = null; this.#receipt = null; this.#transition("running");
        this.send("participant_released", {roundId:this.#round,hostSequence:this.#sequence,releaseUpdate:r.updateCount,updateCount:this.#update,
          ...(Object.hasOwn(r,'speedup')?{speedup:p.speedup}:{})});
      } else this.#fail("INVALID_ENGINE_OPERATION");
    });
    if(!accepted && this.#faultEvidence===null) this.#faultEvidence={
      operation:r.operation,phase:receiptPhase,
      receiptStatus:['ok','unknown'].includes(p.status)?p.status:'invalid',
      receiptUpdate:uint(p.updateCount)?p.updateCount:null,
      expectedUpdate:r.command?.scheduledUpdate??r.updateCount??null,
      observedUpdate:this.#update,held:typeof p.held==='boolean'?p.held:null,
      hostSequence:r.command?.hostSequence??null,
      ...(typeof p.stage==='string'&&/^[A-Za-z_]{1,48}$/.test(p.stage)?{stage:p.stage}:{}),
    };
    return accepted;
  }
  poll() {
    if (this.#phase === "halted") {
      if (this.#haltState === "pending" && this.now() >= this.#haltDeadline) { this.#haltState = "unknown"; this.#pending = null; }
      if (this.#haltState === "confirmed" && this.now() - this.#engineSeen >= this.engineStaleMs) this.#haltState = "unknown";
      return false;
    }
    return this.#guard(() => {
      if (this.#phase !== "lobby" && this.now() - this.#sent >= Math.min(1000,this.heartbeatMs / 3)) {
        this.#sent = this.now(); this.send("participant_heartbeat", {roundId:this.#round,updateCount:this.#update});
      }
    });
  }
}
