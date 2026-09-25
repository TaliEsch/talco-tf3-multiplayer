import { randomUUID } from "node:crypto";
import {
  MAX_PLAYERS, MAX_SCHEDULE_LEAD, MAX_SESSION_MESSAGES, MIN_SCHEDULE_LEAD, PROTOCOL_VERSION, SUPPORTED_SPEEDS,
} from "./constants.mjs";
import { sha256Canonical } from "./canonical.mjs";
import { parseRoadStopOrderPayload } from './road-stop-order-payload.mjs';
import {parseDepotBuildOrderPayload} from './depot-build-order-payload.mjs';

export class ProtocolError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export class HostAuthority {
  #players = new Map();
  #hostSequence = 0;
  #seen = new Set();
  #lastClientSequence = new Map();
  #lastScheduledUpdate = 0;
  constructor({ sessionId, buildHash, modManifestHash, leadUpdates = MIN_SCHEDULE_LEAD,
    resolveEntityOwner = () => null, enableDepotBuild=false }) {
    if (!Number.isSafeInteger(leadUpdates) || leadUpdates < MIN_SCHEDULE_LEAD || leadUpdates > MAX_SCHEDULE_LEAD) throw new RangeError("invalid leadUpdates");
    if(typeof enableDepotBuild!=='boolean')throw new TypeError('invalid depot capability');
    this.sessionId = sessionId;
    this.buildHash = buildHash;
    this.modManifestHash = modManifestHash;
    this.leadUpdates = leadUpdates;
    this.resolveEntityOwner = resolveEntityOwner;
    this.enableDepotBuild=enableDepotBuild;
  }
  admit({ displayName, buildHash, modManifestHash }) {
    if (typeof displayName !== "string" || displayName.length < 1 || displayName.length > 64) throw new ProtocolError("BAD_NAME", "display name must contain 1..64 characters");
    for (const [name, value] of [["build", buildHash], ["mod manifest", modManifestHash]]) {
      if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) throw new ProtocolError("BAD_HASH", `${name} hash must be lowercase SHA-256`);
    }
    if (this.#players.size >= MAX_PLAYERS) throw new ProtocolError("SESSION_FULL", "four players already admitted");
    if (buildHash !== this.buildHash) throw new ProtocolError("BUILD_MISMATCH", "TF3 build hash differs");
    if (modManifestHash !== this.modManifestHash) throw new ProtocolError("MOD_MISMATCH", "mod manifest differs");
    const playerId = randomUUID();
    const usedSlots = new Set([...this.#players.values()].map((player) => player.companySlot));
    let companySlot = 1;
    while (usedSlots.has(companySlot)) companySlot++;
    // A transport-layer slot is not a TF3 entity. The game adapter must replace
    // companyEntity only with the verified GameAddPlayer callback resultEntity.
    const player = Object.freeze({ playerId, displayName, companySlot, companyEntity: null });
    this.#players.set(playerId, player);
    return player;
  }
  remove(playerId) { return this.#players.delete(playerId); }
  players() { return [...this.#players.values()]; }
  bindCompanyEntity(playerId, companyEntity) {
    const player = this.#players.get(playerId);
    if (!player) throw new ProtocolError("NOT_MEMBER", "player is not admitted");
    if (!Number.isSafeInteger(companyEntity) || companyEntity < 0) throw new ProtocolError("BAD_ENTITY", "invalid company entity");
    if (player.companyEntity !== null) throw new ProtocolError("COMPANY_ALREADY_BOUND", "company entity mapping is immutable");
    // Assets belong to company entities, but control is exclusive: no sharing.
    if ([...this.#players.values()].some(candidate => candidate.companyEntity === companyEntity)) {
      throw new ProtocolError("COMPANY_IN_USE", "company already controlled by another user");
    }
    const bound = Object.freeze({ ...player, companyEntity });
    this.#players.set(playerId, bound);
    return bound;
  }
  accept(request, currentUpdate, authenticatedPlayerId, verifiedEntityOwner = undefined) {
    if (!request || typeof request !== "object") throw new ProtocolError("BAD_REQUEST", "request missing");
    const allowedRequestFields = new Set(["clientSequence", "commandType", "messageId", "originPlayerId", "payload", "requestedUpdate", "targetEntity", "targetCompanyEntity"]);
    if (Object.keys(request).some((key) => !allowedRequestFields.has(key))) throw new ProtocolError("BAD_REQUEST", "unknown request field");
    if (this.#seen.has(request.messageId)) throw new ProtocolError("DUPLICATE", "message already processed");
    if (this.#seen.size >= MAX_SESSION_MESSAGES) throw new ProtocolError("SESSION_MESSAGE_LIMIT", "session message budget exhausted");
    this.#seen.add(request.messageId);
    const player = this.#players.get(request.originPlayerId);
    if (!player) throw new ProtocolError("NOT_MEMBER", "origin is not admitted");
    if (authenticatedPlayerId !== request.originPlayerId) throw new ProtocolError("IDENTITY_MISMATCH", "authenticated peer does not match command origin");
    if (!Number.isSafeInteger(request.clientSequence) || request.clientSequence < 0) throw new ProtocolError("BAD_SEQUENCE", "invalid client sequence");
    const previousClientSequence = this.#lastClientSequence.get(request.originPlayerId);
    if (previousClientSequence !== undefined && request.clientSequence <= previousClientSequence) {
      throw new ProtocolError("BAD_SEQUENCE", "client sequence must increase monotonically");
    }
    if (!Number.isSafeInteger(currentUpdate) || currentUpdate < 0) throw new ProtocolError("BAD_CLOCK", "invalid current update");
    if (!Number.isSafeInteger(player.companyEntity) || player.companyEntity < 0) throw new ProtocolError("COMPANY_UNASSIGNED", "host must assign verified company membership");
    if (request.targetCompanyEntity !== player.companyEntity) throw new ProtocolError("NOT_OWNER", "user is not a member of the target company");
    if (!request.payload || typeof request.payload !== "object" || Array.isArray(request.payload)) {
      throw new ProtocolError("BAD_PAYLOAD", "payload must be an object");
    }
    if (request.commandType !== "vehicle.setRunning" && request.commandType !== "simulation.speed"
      && request.commandType !== 'road.stop.place' && request.commandType !== 'road.depot.build') {
      throw new ProtocolError("UNSUPPORTED_COMMAND", "command type is not enabled");
    }
    if (request.commandType === "simulation.speed" && !SUPPORTED_SPEEDS.includes(request.payload?.speedup)) {
      throw new ProtocolError("BAD_SPEED", "unsupported speed");
    }
    if (request.commandType === "simulation.speed" && Object.keys(request.payload).some((key) => key !== "speedup")) {
      throw new ProtocolError("BAD_SPEED", "unknown speed payload field");
    }
    if (request.commandType === "vehicle.setRunning") {
      if (!Number.isSafeInteger(request.targetEntity) || request.targetEntity < 0) throw new ProtocolError("BAD_ENTITY", "invalid entity");
      const actualOwner = verifiedEntityOwner === undefined
        ? this.resolveEntityOwner(request.targetEntity) : verifiedEntityOwner;
      if (actualOwner === null || actualOwner === undefined) throw new ProtocolError("OWNERSHIP_UNAVAILABLE", "authoritative entity ownership is unavailable");
      if (actualOwner !== player.companyEntity) throw new ProtocolError("NOT_OWNER", "asset belongs to a different company");
      if (typeof request.payload.running !== "boolean" || Object.keys(request.payload).some((key) => key !== "running")) {
        throw new ProtocolError("BAD_RUNNING_STATE", "vehicle payload must contain only a boolean running field");
      }
    }
    let roadPayload;
    if (request.commandType === 'road.stop.place') {
      if (!Number.isSafeInteger(request.targetEntity) || request.targetEntity < 1
        || request.targetEntity > 2147483647) throw new ProtocolError('BAD_ENTITY','invalid road entity');
      try { roadPayload=parseRoadStopOrderPayload(request.payload,request.targetEntity,player.companyEntity); }
      catch { throw new ProtocolError('BAD_ROAD_STOP_PAYLOAD','invalid bounded road Stop payload'); }
    }
    if(request.commandType==='road.depot.build'){
      if(!this.enableDepotBuild)throw new ProtocolError('UNSUPPORTED_COMMAND','road depot execution is not qualified');
      if(request.targetEntity!==0)throw new ProtocolError('BAD_ENTITY','depot build targets no existing entity');
      try{roadPayload=parseDepotBuildOrderPayload(request.payload,player.companyEntity);}
      catch{throw new ProtocolError('BAD_DEPOT_BUILD_PAYLOAD','invalid bounded road depot payload');}
    }
    if (request.requestedUpdate !== undefined && (!Number.isSafeInteger(request.requestedUpdate) || request.requestedUpdate < 0)) {
      throw new ProtocolError("BAD_SCHEDULE", "requested update must be a nonnegative safe integer");
    }
    const scheduledUpdate = Math.max(currentUpdate + this.leadUpdates, request.requestedUpdate ?? 0, this.#lastScheduledUpdate);
    if (!Number.isSafeInteger(scheduledUpdate)) throw new ProtocolError("BAD_CLOCK", "schedule exceeds safe integer range");
    if (scheduledUpdate > currentUpdate + MAX_SCHEDULE_LEAD) throw new ProtocolError("TOO_FAR", "requested update exceeds horizon");
    const accepted = Object.freeze({
      protocolVersion: PROTOCOL_VERSION,
      hostSequence: ++this.#hostSequence,
      scheduledUpdate,
      originPlayerId: request.originPlayerId,
      targetCompanyEntity: request.targetCompanyEntity,
      targetEntity: request.targetEntity ?? null,
      commandType: request.commandType,
      payload: roadPayload ?? Object.freeze({ ...request.payload }),
      clientSequence: request.clientSequence,
      requestMessageId: request.messageId,
    });
    this.#lastClientSequence.set(request.originPlayerId, request.clientSequence);
    this.#lastScheduledUpdate = scheduledUpdate;
    return accepted;
  }
}

export class CommandQueue {
  #bySequence = new Map();
  #lastApplied = 0;
  #lastUpdate = -1;
  #fault = null;
  #maxPending;
  #enableDepotBuild;
  constructor({ maxPending = 4096,enableDepotBuild=false } = {}) {
    if (!Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > MAX_SESSION_MESSAGES) throw new RangeError("invalid queue capacity");
    if(typeof enableDepotBuild!=='boolean')throw new TypeError('invalid depot capability');
    this.#maxPending = maxPending;
    this.#enableDepotBuild=enableDepotBuild;
  }
  get fault() { return this.#fault?.code ?? null; }
  get pendingCount() { return this.#bySequence.size; }
  #stop(code, message) {
    this.#fault = new ProtocolError(code, message);
    throw this.#fault;
  }
  #checkActive() { if (this.#fault) throw this.#fault; }
  enqueue(command, localPlayerMap, resolveEntityOwner = () => null) {
    this.#checkActive();
    if (!command || !Number.isSafeInteger(command.hostSequence) || command.hostSequence <= this.#lastApplied) return false;
    const duplicate = this.#bySequence.get(command.hostSequence);
    if (duplicate) {
      if (sha256Canonical(duplicate.command) !== sha256Canonical(command)) this.#stop("SEQUENCE_CONFLICT", "host sequence was reused for a different command");
      return false;
    }
    if (command.protocolVersion !== PROTOCOL_VERSION || !Number.isSafeInteger(command.scheduledUpdate) || command.scheduledUpdate < 0
        || !Number.isSafeInteger(command.clientSequence) || command.clientSequence < 0) {
      throw new ProtocolError("AUTH_RECHECK_FAILED", "accepted command failed local envelope validation");
    }
    const mappedOwner = localPlayerMap.get(command.originPlayerId);
    if (!Number.isSafeInteger(mappedOwner) || mappedOwner < 0 || command.targetCompanyEntity !== mappedOwner) {
      throw new ProtocolError("AUTH_RECHECK_FAILED", "accepted command failed local authorization");
    }
    if (command.commandType === "vehicle.setRunning") {
      if (!Number.isSafeInteger(command.targetEntity) || command.targetEntity < 0) throw new ProtocolError("AUTH_RECHECK_FAILED", "invalid vehicle entity");
      const actualOwner = resolveEntityOwner(command.targetEntity);
      if (actualOwner === null || actualOwner === undefined || actualOwner !== mappedOwner) {
        throw new ProtocolError("AUTH_RECHECK_FAILED", "accepted command failed local entity-owner authorization");
      }
      if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)
          || typeof command.payload.running !== "boolean" || Object.keys(command.payload).some((key) => key !== "running")) {
        throw new ProtocolError("AUTH_RECHECK_FAILED", "accepted vehicle command failed local payload validation");
      }
    } else if (command.commandType === "simulation.speed") {
      if (command.targetEntity !== null || !command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)
          || !SUPPORTED_SPEEDS.includes(command.payload.speedup) || Object.keys(command.payload).some((key) => key !== "speedup")) {
        throw new ProtocolError("AUTH_RECHECK_FAILED", "accepted speed command failed local payload validation");
      }
    } else if (command.commandType === 'road.stop.place') {
      try { parseRoadStopOrderPayload(command.payload,command.targetEntity,mappedOwner); }
      catch { throw new ProtocolError('AUTH_RECHECK_FAILED','accepted road Stop payload changed'); }
    } else if(command.commandType==='road.depot.build'){
      if(!this.#enableDepotBuild)throw new ProtocolError('AUTH_RECHECK_FAILED','road depot execution is not qualified');
      if(command.targetEntity!==0)throw new ProtocolError('AUTH_RECHECK_FAILED','depot build targets no existing entity');
      try{parseDepotBuildOrderPayload(command.payload,mappedOwner);}
      catch{throw new ProtocolError('AUTH_RECHECK_FAILED','accepted road depot payload changed');}
    } else {
      throw new ProtocolError("AUTH_RECHECK_FAILED", "accepted command type is not enabled locally");
    }
    if (command.scheduledUpdate <= this.#lastUpdate) this.#stop("LATE_COMMAND", "command arrived after its execution phase");
    if (this.#bySequence.size >= this.#maxPending) this.#stop("QUEUE_LIMIT", "pending command limit reached");
    for (const entry of this.#bySequence.values()) {
      if ((entry.command.hostSequence < command.hostSequence && entry.command.scheduledUpdate > command.scheduledUpdate)
          || (entry.command.hostSequence > command.hostSequence && entry.command.scheduledUpdate < command.scheduledUpdate)) {
        this.#stop("SCHEDULE_ORDER", "host sequence and scheduled updates disagree");
      }
    }
    const snapshot = Object.freeze({ ...command, payload: Object.freeze({ ...command.payload }) });
    this.#bySequence.set(command.hostSequence, { command: snapshot, localPlayerMap, resolveEntityOwner, companyEntity: mappedOwner });
    return true;
  }
  due(updateCount) {
    this.#checkActive();
    if (!Number.isSafeInteger(updateCount) || updateCount < 0 || updateCount < this.#lastUpdate) this.#stop("BAD_CLOCK", "simulation clock is invalid or moved backwards");
    const result = [];
    let sequence = this.#lastApplied + 1;
    // Validate the whole batch before consuming anything. A gap/late command
    // requires a new session from a common checkpoint, never catch-up execution.
    while (true) {
      const entry = this.#bySequence.get(sequence);
      const next = entry?.command;
      if (!next || next.scheduledUpdate > updateCount) break;
      if (next.scheduledUpdate < updateCount) this.#stop("LATE_COMMAND", "scheduled simulation update was missed");
      if (entry.localPlayerMap.get(next.originPlayerId) !== entry.companyEntity
          || (next.commandType === "vehicle.setRunning" && entry.resolveEntityOwner(next.targetEntity) !== entry.companyEntity)) {
        this.#stop("AUTH_RECHECK_FAILED", "company mapping or ownership changed before execution");
      }
      result.push(next);
      sequence++;
    }
    for (const entry of this.#bySequence.values()) {
      if (entry.command.hostSequence >= sequence && entry.command.scheduledUpdate <= updateCount) this.#stop("SEQUENCE_GAP", "command predecessor is missing at execution deadline");
    }
    for (const command of result) {
      this.#bySequence.delete(command.hostSequence);
      this.#lastApplied = command.hostSequence;
    }
    this.#lastUpdate = updateCount;
    return result;
  }
}

export function canonicalStateHash(state) {
  const minimal = {
    updateCount: state.updateCount,
    speedup: state.speedup,
    players: [...state.players].map((p) => ({
      playerId: p.playerId,
      companyEntity: p.companyEntity,
      balance: p.balance,
      ownedEntities: [...p.ownedEntities].sort((a, b) => a - b),
    })).sort((a, b) => a.playerId.localeCompare(b.playerId)),
    selectedEntities: [...state.selectedEntities].map((e) => ({ id: e.id, ownerCompanyEntity: e.ownerCompanyEntity, running: e.running }))
      .sort((a, b) => a.id - b.id),
  };
  return sha256Canonical(minimal);
}
