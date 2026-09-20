import test from "node:test";
import assert from "node:assert/strict";
import { CommandQueue, HostAuthority, ProtocolError, canonicalStateHash } from "../src/lockstep.mjs";
import { PROTOCOL_VERSION } from "../src/constants.mjs";

const BUILD = "b".repeat(64);
const MODS = "c".repeat(64);
const compatibility = { sessionId: "s", buildHash: BUILD, modManifestHash: MODS };

test("client balance reports cannot become authoritative action fields", () => {
  const host = new HostAuthority({...compatibility,resolveEntityOwner:()=>101});
  const player = host.admit({displayName:'A',buildHash:BUILD,modManifestHash:MODS});
  host.bindCompanyEntity(player.playerId,101);
  const request={messageId:'balance-test',originPlayerId:player.playerId,targetCompanyEntity:101,
    targetEntity:10,commandType:'vehicle.setRunning',payload:{running:false},clientSequence:0};
  for(const field of ['balance','balanceDelta','payer']) {
    assert.throws(()=>host.accept({...request,[field]:1000000},100,player.playerId),e=>e.code==='BAD_REQUEST');
    assert.throws(()=>host.accept({...request,messageId:`balance-test-${field}`,payload:{...request.payload,[field]:1000000}},100,player.playerId),
      e=>e.code==='BAD_RUNNING_STATE');
  }
  assert.equal(host.accept(request,100,player.playerId).hostSequence,1);
});

test("host assigns distinct players and canonical sequence", () => {
  let owner;
  const host = new HostAuthority({ ...compatibility, resolveEntityOwner: (entity) => entity === 10 ? owner : null });
  const a = host.admit({ displayName: "A", buildHash: BUILD, modManifestHash: MODS });
  owner = 101;
  host.bindCompanyEntity(a.playerId, 101);
  const b = host.admit({ displayName: "B", buildHash: BUILD, modManifestHash: MODS });
  assert.notEqual(a.companySlot, b.companySlot);
  assert.equal(a.companyEntity, null);
  const request = (id, seq, running) => ({ messageId: id, originPlayerId: a.playerId, targetCompanyEntity: 101, targetEntity: 10, commandType: "vehicle.setRunning", payload: { running }, clientSequence: seq, requestedUpdate: 0 });
  assert.equal(host.accept(request("1", 0, false), 100, a.playerId).hostSequence, 1);
  assert.equal(host.accept(request("2", 1, true), 100, a.playerId).hostSequence, 2);
});

test("company control is exclusive and immutable", () => {
  const host = new HostAuthority(compatibility);
  const a = host.admit({ displayName: "A", buildHash: BUILD, modManifestHash: MODS });
  const b = host.admit({ displayName: "B", buildHash: BUILD, modManifestHash: MODS });
  assert.equal(host.bindCompanyEntity(a.playerId, 101).companyEntity, 101);
  assert.throws(() => host.bindCompanyEntity(a.playerId, 102), (e) => e.code === "COMPANY_ALREADY_BOUND");
  assert.throws(() => host.bindCompanyEntity(b.playerId, 101), e => e.code === "COMPANY_IN_USE");
  assert.throws(() => host.bindCompanyEntity(b.playerId, -1), (e) => e.code === "BAD_ENTITY");
});

test("host rejects duplicate and cross-company request", () => {
  let owner;
  const host = new HostAuthority({ ...compatibility, resolveEntityOwner: () => owner });
  const a = host.admit({ displayName: "A", buildHash: BUILD, modManifestHash: MODS });
  const b = host.admit({ displayName: "B", buildHash: BUILD, modManifestHash: MODS });
  owner = 101;
  host.bindCompanyEntity(a.playerId, 101);
  const spoof = { messageId: "s", originPlayerId: b.playerId, targetCompanyEntity: 102, targetEntity: 10, commandType: "vehicle.setRunning", payload: { running: false }, clientSequence: 0 };
  assert.throws(() => host.accept(spoof, 0, a.playerId), (e) => e instanceof ProtocolError && e.code === "IDENTITY_MISMATCH");
  const cross = { ...spoof, messageId: "x", originPlayerId: a.playerId, targetCompanyEntity: 102 };
  assert.throws(() => host.accept(cross, 0, a.playerId), (e) => e.code === "NOT_OWNER");
  const valid = { ...cross, messageId: "y", targetCompanyEntity: 101 };
  host.accept(valid, 0, a.playerId);
  assert.throws(() => host.accept(valid, 0, a.playerId), (e) => e.code === "DUPLICATE");
});

test("queue orders, deduplicates and waits for scheduled update", () => {
  const queue = new CommandQueue();
  const map = new Map([["a", 1]]);
  const command = (hostSequence, scheduledUpdate) => ({ protocolVersion: PROTOCOL_VERSION, hostSequence, scheduledUpdate, originPlayerId: "a", targetCompanyEntity: 1, targetEntity: null, commandType: "simulation.speed", payload: { speedup: 1 }, clientSequence: hostSequence });
  assert.equal(queue.enqueue(command(2, 12), map), true);
  assert.equal(queue.enqueue(command(1, 10), map), true);
  assert.equal(queue.enqueue(command(1, 10), map), false);
  assert.deepEqual(queue.due(9), []);
  assert.deepEqual(queue.due(10).map((x) => x.hostSequence), [1]);
  assert.deepEqual(queue.due(12).map((x) => x.hostSequence), [2]);
});

test("client queue fails closed without matching entity ownership", () => {
  const queue = new CommandQueue();
  const command = { protocolVersion: PROTOCOL_VERSION, hostSequence: 1, scheduledUpdate: 10, originPlayerId: "a", targetCompanyEntity: 1, targetEntity: 9, commandType: "vehicle.setRunning", payload: { running: false }, clientSequence: 0 };
  assert.throws(() => queue.enqueue(command, new Map([["a", 1]])), (e) => e.code === "AUTH_RECHECK_FAILED");
  assert.equal(queue.enqueue(command, new Map([["a", 1]]), () => 1), true);
});

test("vehicle action requires a bounded boolean payload and increasing client sequence", () => {
  let owner;
  const host = new HostAuthority({ ...compatibility, resolveEntityOwner: () => owner });
  const a = host.admit({ displayName: "A", buildHash: BUILD, modManifestHash: MODS });
  owner = 101;
  host.bindCompanyEntity(a.playerId, 101);
  const request = (messageId, clientSequence, payload) => ({
    messageId, clientSequence, originPlayerId: a.playerId, targetCompanyEntity: 101,
    targetEntity: 10, commandType: "vehicle.setRunning", payload,
  });
  host.accept(request("v1", 4, { running: false }), 10, a.playerId);
  assert.throws(() => host.accept(request("v2", 4, { running: true }), 10, a.playerId), (e) => e.code === "BAD_SEQUENCE");
  assert.throws(() => host.accept(request("v3", 5, { running: 0 }), 10, a.playerId), (e) => e.code === "BAD_RUNNING_STATE");
  assert.throws(() => host.accept(request("v4", 5, { running: true, extra: 1 }), 10, a.playerId), (e) => e.code === "BAD_RUNNING_STATE");
  assert.throws(() => host.accept(request("v5", 5, null), 10, a.playerId), (e) => e.code === "BAD_PAYLOAD");
});

test("client independently rejects malformed accepted vehicle payload", () => {
  const queue = new CommandQueue();
  const command = {
    protocolVersion: PROTOCOL_VERSION, hostSequence: 1, scheduledUpdate: 10, originPlayerId: "a", targetCompanyEntity: 1,
    targetEntity: 9, commandType: "vehicle.setRunning", payload: { running: "no" }, clientSequence: 0,
  };
  assert.throws(() => queue.enqueue(command, new Map([["a", 1]]), () => 1), (e) => e.code === "AUTH_RECHECK_FAILED");
});

test("client rejects unknown commands and malformed speed commands", () => {
  const map = new Map([["a", 1]]);
  const base = {
    protocolVersion: PROTOCOL_VERSION, hostSequence: 1, scheduledUpdate: 10, originPlayerId: "a",
    targetCompanyEntity: 1, targetEntity: null, clientSequence: 0,
  };
  assert.throws(() => new CommandQueue().enqueue({ ...base, commandType: "unknown", payload: {} }, map), (e) => e.code === "AUTH_RECHECK_FAILED");
  assert.throws(() => new CommandQueue().enqueue({ ...base, commandType: "simulation.speed", payload: { speedup: 3 } }, map), (e) => e.code === "AUTH_RECHECK_FAILED");
  assert.throws(() => new CommandQueue().enqueue({ ...base, protocolVersion: PROTOCOL_VERSION + 1, commandType: "simulation.speed", payload: { speedup: 1 } }, map), (e) => e.code === "AUTH_RECHECK_FAILED");
});

test("state hash canonicalizes player and entity ordering", () => {
  const state = (reverse) => ({ updateCount: 42, speedup: 1, players: (reverse ? [
    { playerId: "b", companyEntity: 2, balance: 20, ownedEntities: [4, 3] },
    { playerId: "a", companyEntity: 1, balance: 10, ownedEntities: [2, 1] },
  ] : [
    { playerId: "a", companyEntity: 1, balance: 10, ownedEntities: [1, 2] },
    { playerId: "b", companyEntity: 2, balance: 20, ownedEntities: [3, 4] },
  ]), selectedEntities: reverse ? [{ id: 8, ownerCompanyEntity: 2, running: true }, { id: 7, ownerCompanyEntity: 1, running: false }] : [{ id: 7, ownerCompanyEntity: 1, running: false }, { id: 8, ownerCompanyEntity: 2, running: true }] });
  assert.equal(canonicalStateHash(state(false)), canonicalStateHash(state(true)));
});

test("speed accepts supported values with last host acceptance order", () => {
  const host = new HostAuthority(compatibility);
  const a = host.admit({ displayName: "A", buildHash: BUILD, modManifestHash: MODS });
  host.bindCompanyEntity(a.playerId, 101);
  const req = (id, speedup) => ({ messageId: id, originPlayerId: a.playerId, targetCompanyEntity: 101, commandType: "simulation.speed", payload: { speedup }, clientSequence: Number(id) });
  const pause = host.accept(req("1", 0), 20, a.playerId);
  const fast = host.accept(req("2", 4), 20, a.playerId);
  assert.ok(fast.hostSequence > pause.hostSequence);
  assert.throws(() => host.accept(req("3", 3), 20, a.playerId), (e) => e.code === "BAD_SPEED");
  assert.throws(() => host.accept({ ...req("4", 1), payload: { speedup: 1, filler: "x" } }, 20, a.playerId), (e) => e.code === "BAD_SPEED");
});

test("invalid or decreasing schedule cannot create a host-sequence gap", () => {
  const host = new HostAuthority(compatibility);
  const a = host.admit({ displayName: "A", buildHash: BUILD, modManifestHash: MODS });
  host.bindCompanyEntity(a.playerId, 101);
  const request = (id, requestedUpdate) => ({ messageId: id, originPlayerId: a.playerId, targetCompanyEntity: 101, commandType: "simulation.speed", payload: { speedup: 1 }, clientSequence: Number(id), requestedUpdate });
  assert.throws(() => host.accept(request("1", "bad"), 100, a.playerId), (e) => e.code === "BAD_SCHEDULE");
  const first = host.accept(request("2", 150), 100, a.playerId);
  const second = host.accept(request("3", 108), 101, a.playerId);
  assert.equal(first.hostSequence, 1);
  assert.equal(second.hostSequence, 2);
  assert.ok(second.scheduledUpdate >= first.scheduledUpdate);
});
