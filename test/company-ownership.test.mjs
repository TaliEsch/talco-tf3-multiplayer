import test from "node:test";
import assert from "node:assert/strict";
import { HostAuthority, CommandQueue } from "../src/lockstep.mjs";
import { SessionCoordinator } from "../src/session-coordinator.mjs";
import { SessionParticipant } from "../src/session-participant.mjs";
const compatibility = { sessionId: "ownership-test", buildHash: "a".repeat(64), modManifestHash: "b".repeat(64) };
function fixture() {
  const assets = new Map([[10, 101], [20, 102]]);
  const host = new HostAuthority({ ...compatibility, resolveEntityOwner: e => assets.get(e) ?? null });
  const a = host.admit({ ...compatibility, displayName: "A" }), b = host.admit({ ...compatibility, displayName: "B" });
  const req = overrides => ({ messageId: "request", clientSequence: 1, originPlayerId: a.playerId, targetCompanyEntity: 101,
    commandType: "vehicle.setRunning", targetEntity: 10, payload: { running: false }, ...overrides });
  return { host, assets, a, b, req };
}
test("unassigned connections cannot claim a company or use the old player-owner field", () => {
  const f = fixture();
  assert.throws(() => f.host.accept(f.req(), 100, f.a.playerId), e => e.code === "COMPANY_UNASSIGNED");
  f.host.bindCompanyEntity(f.a.playerId, 101);
  assert.throws(() => f.host.accept(f.req({ messageId: "old", targetOwnerPlayerId: f.a.playerId }), 100, f.a.playerId), e => e.code === "BAD_REQUEST");
});
test("asset ownership is company-based and survives removal of a network user", () => {
  const f = fixture(); f.host.bindCompanyEntity(f.a.playerId, 101); f.host.bindCompanyEntity(f.b.playerId, 102);
  const command = f.host.accept(f.req(), 100, f.a.playerId);
  assert.equal(command.targetCompanyEntity, 101); assert.equal(command.originPlayerId, f.a.playerId);
  f.host.remove(f.a.playerId); assert.equal(f.assets.get(10), 101);
  assert.throws(() => f.host.accept(f.req({ messageId: "left", clientSequence: 2 }), 101, f.a.playerId), e => e.code === "NOT_MEMBER");
});
test("changing the claimed company cannot bypass host checks; asset transfer invalidates queued work", () => {
  const f = fixture(); f.host.bindCompanyEntity(f.a.playerId, 101); f.host.bindCompanyEntity(f.b.playerId, 102);
  assert.throws(() => f.host.accept(f.req({ messageId: "claim", targetCompanyEntity: 102, targetEntity: 20 }), 100, f.a.playerId), e => e.code === "NOT_OWNER");
  assert.throws(() => f.host.accept(f.req({ messageId: "asset", targetEntity: 20 }), 100, f.a.playerId), e => e.code === "NOT_OWNER");
  const c = f.host.accept(f.req(), 100, f.a.playerId), q = new CommandQueue();
  q.enqueue(c, new Map([[f.a.playerId, 101], [f.b.playerId, 102]]), e => f.assets.get(e));
  f.assets.set(10, 102);
  assert.throws(() => q.due(c.scheduledUpdate), e => e.code === "AUTH_RECHECK_FAILED");
});
test("sharing companies is rejected at authority, coordinator and participant boundaries", () => {
  const f = fixture(); f.host.bindCompanyEntity(f.a.playerId, 101);
  assert.throws(() => f.host.bindCompanyEntity(f.b.playerId, 101), e => e.code === "COMPANY_IN_USE");
  const players = [f.a, f.b].map(p => ({ playerId: p.playerId, companyEntity: 101 }));
  assert.throws(() => new SessionCoordinator().prepare(players, { updateCount: 100, checkpointHash: "c".repeat(64) }), e => e.code === "INVALID_ROSTER");
  assert.throws(() => new SessionParticipant({ playerId: f.a.playerId, companies: new Map(players.map(p => [p.playerId, p.companyEntity])) }), /verified participant/);
});
