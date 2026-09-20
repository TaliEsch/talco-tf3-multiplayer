// Real localhost transport and save transfer; deliberately simulated game state.
// This runner never opens TF3, reads a user save, or uses the live bridge folder.
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHost } from "./host.mjs";
import { connectClient } from "./client.mjs";
import { startSaveServer, downloadSave } from "./save-transfer.mjs";
import { CommandQueue, canonicalStateHash } from "./lockstep.mjs";

async function until(predicate, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`local session test timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

async function closeServer(server) {
  if (!server) return;
  await new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
}

export async function runLocalSessionTest({ players = 4 } = {}) {
  if (![2, 4].includes(players)) throw new RangeError("test supports 2 or 4 simulated players");
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-local-session-"));
  const secret = randomBytes(32).toString("hex"), sessionId = randomUUID();
  const buildHash = "b".repeat(64), modManifestHash = "c".repeat(64);
  const clients = [], ownership = new Map();
  let transfer, host;
  let currentUpdate = 100;
  const checks = [];
  try {
    const content = Buffer.alloc(98304);
    for (let i = 0; i < content.length; i++) content[i] = i % 251;
    const saveFile = path.join(root, "synthetic.sav");
    await writeFile(saveFile, content);
    transfer = await startSaveServer({ secret, sessionId, saveFile, bind: "127.0.0.1", port: 0 });
    const requiredSave = { bytes: transfer.bytes, sha256: transfer.sha256 };
    host = startHost({ legacyModelRelay: true, secret, sessionId, bind: "127.0.0.1", port: 0, buildHash, modManifestHash,
      requiredSave, getUpdateCount: () => currentUpdate, resolveEntityOwner: entity => ownership.get(entity) ?? null });
    await once(host.server, "listening");
    const port = host.server.address().port;
    const addClient = (index, overrides = {}) => {
      const client = { messages: [], commands: [], errors: [], player: null, ready: false, sequence: 0 };
      clients.push(client);
      client.connection = connectClient({ secret, sessionId, host: "127.0.0.1", port,
        displayName: index === 0 ? "Host participant model" : `Client model ${index}`,
        buildHash, modManifestHash, ...overrides,
        onMessage(message) {
          client.messages.push(message);
          if (message.kind === "admitted") client.player = message.payload.player;
          if (message.kind === "session_ready") client.ready = true;
          if (message.kind === "command_accepted") client.commands.push(message.payload.command);
          if (["error", "transport_error"].includes(message.kind)) client.errors.push(message.payload.code);
        },
      });
      return client;
    };
    const request = (client, entity, running, targetOwner = host.authority.players().find(p => p.playerId === client.player.playerId)?.companyEntity) => client.connection.send("action_request", {
      clientSequence: client.sequence++, commandType: "vehicle.setRunning",
      originPlayerId: client.player.playerId, targetCompanyEntity: targetOwner,
      targetEntity: entity, payload: { running },
    });
    for (let i = 0; i < players; i++) {
      const client = addClient(i);
      await until(() => client.player || client.errors.length, "admission");
      assert.deepEqual(client.errors, []);
      // Synthetic engine fixture: this does NOT provision a real TF3 company.
      host.authority.bindCompanyEntity(client.player.playerId, 1000 + i);
      ownership.set(2000 + i, 1000 + i);
    }
    const participants = clients.slice();
    assert.equal(new Set(participants.map(c => c.player.playerId)).size, players);
    checks.push("distinct_participant_ids");

    request(participants[0], 2000, false);
    await until(() => participants[0].messages.some(m => m.kind === "command_rejected"), "save gate");
    assert.equal(participants[0].messages.find(m => m.kind === "command_rejected").payload.code, "SAVE_REQUIRED");
    checks.push("actions_blocked_before_save_verification");
    for (let i = 0; i < players; i++) {
      const directory = path.join(root, `client-${i}`);
      await mkdir(directory);
      const save = await downloadSave({ secret, sessionId, host: "127.0.0.1", port: transfer.port, destinationDir: directory });
      assert.deepEqual(await readFile(save.path), content);
      assert.equal(save.sha256, requiredSave.sha256);
      participants[i].connection.send("save_ready", { bytes: save.bytes, sha256: save.sha256 });
    }
    await until(() => participants.every(c => c.ready), "verified save readiness");
    checks.push("every_participant_pulls_identical_synthetic_save");

    const invalidBuild = addClient(99, { buildHash: "d".repeat(64) });
    await until(() => invalidBuild.errors.length > 0, "incompatible participant rejection");
    // Capacity validation currently precedes build validation in a full lobby.
    assert.ok(invalidBuild.errors.includes(players === 4 ? "SESSION_FULL" : "BUILD_MISMATCH"));
    assert.equal(invalidBuild.player, null);
    checks.push(players === 4 ? "fifth_participant_rejected" : "incompatible_build_rejected");

    const playerMap = new Map(host.authority.players().map(p => [p.playerId, p.companyEntity]));
    const initial = { updateCount: currentUpdate, speedup: 1,
      players: host.authority.players().map((p, i) => ({ playerId: p.playerId, companyEntity: p.companyEntity, balance: 100000 + i, ownedEntities: [2000 + i] })),
      selectedEntities: participants.map((c, i) => ({ id: 2000 + i, ownerCompanyEntity: 1000 + i, running: true })) };
    const worlds = participants.map(() => structuredClone(initial));
    const queues = participants.map(() => new CommandQueue());
    const maps = participants.map(() => new Map(playerMap));

    // A client lies about owning somebody else's entity. Host resolves ownership.
    const rejectionCount = participants[0].messages.filter(m => m.kind === "command_rejected").length;
    request(participants[0], 2001, false);
    await until(() => participants[0].messages.filter(m => m.kind === "command_rejected").length > rejectionCount, "cross-owner rejection");
    assert.equal(participants[0].messages.filter(m => m.kind === "command_rejected").at(-1).payload.code, "NOT_OWNER");
    assert.equal(participants.every(c => c.commands.length === 0), true);
    checks.push("host_rejects_cross_company_action");

    // All participants, including the host seat, use the same socket request path.
    for (let i = 0; i < players; i++) request(participants[i], 2000 + i, false);
    await until(() => participants.every(c => c.commands.length === players), "command broadcasts");
    for (const client of participants) assert.deepEqual(client.commands, participants[0].commands);
    assert.deepEqual(participants[0].commands.map(c => c.hostSequence), Array.from({ length: players }, (_, i) => i + 1));
    const target = participants[0].commands[0].scheduledUpdate;
    assert.ok(target > currentUpdate);
    assert.equal(participants[0].commands.every(c => c.scheduledUpdate === target), true);
    checks.push("identical_host_order_on_every_connection");

    for (let i = 0; i < players; i++) {
      const commands = i % 2 ? [...participants[i].commands].reverse() : participants[i].commands;
      for (const accepted of commands) queues[i].enqueue(accepted, maps[i], id => worlds[i].selectedEntities.find(v => v.id === id)?.ownerCompanyEntity ?? null);
      assert.equal(queues[i].enqueue(commands[0], maps[i], id => ownership.get(id)), false);
      assert.deepEqual(queues[i].due(target - 1), []);
      assert.ok(worlds[i].selectedEntities.every(v => v.running));
      for (const accepted of queues[i].due(target)) worlds[i].selectedEntities.find(v => v.id === accepted.targetEntity).running = accepted.payload.running;
      worlds[i].updateCount = target;
      assert.equal(queues[i].pendingCount, 0);
    }
    const hashes = worlds.map(canonicalStateHash);
    assert.equal(new Set(hashes).size, 1);
    assert.ok(worlds.every(w => w.selectedEntities.every(v => !v.running)));
    checks.push("model_commands_apply_once_at_exact_update", "model_state_hashes_match");

    // Exercise the independent client guard and the late-delivery stop condition.
    const forged = { ...participants[0].commands[0], targetEntity: 2001 };
    assert.throws(() => new CommandQueue().enqueue(forged, maps[0], id => ownership.get(id)), e => e.code === "AUTH_RECHECK_FAILED");
    const late = new CommandQueue();
    late.enqueue(participants[0].commands[0], maps[0], id => ownership.get(id));
    assert.throws(() => late.due(target + 1), e => e.code === "LATE_COMMAND");
    assert.equal(late.fault, "LATE_COMMAND");
    checks.push("client_rechecks_ownership", "late_command_stops_model_queue");
    worlds.at(-1).players[0].balance++;
    assert.notEqual(canonicalStateHash(worlds[0]), canonicalStateHash(worlds.at(-1)));
    checks.push("injected_model_divergence_detected");

    const departed = participants.at(-1), oldId = departed.player.playerId;
    departed.connection.socket.destroy();
    await until(() => host.authority.players().length === players - 1, "peer removal");
    const replacement = addClient(100);
    await until(() => replacement.player || replacement.errors.length, "replacement admission");
    assert.deepEqual(replacement.errors, []);
    assert.notEqual(replacement.player.playerId, oldId);
    assert.equal(replacement.player.companyEntity, null);
    assert.equal(replacement.ready, false);
    checks.push("rejoin_gets_new_identity_and_no_implicit_company_or_readiness");
    return { test: "localhost_session_model", players, checks, passed: true,
      gameLaunched: false, gameSimulationTested: false, gameplayVerified: false };
  } finally {
    for (const client of clients) client.connection?.socket.destroy();
    await closeServer(host?.server);
    await closeServer(transfer?.server);
    await rm(root, { recursive: true, force: true });
  }
}
