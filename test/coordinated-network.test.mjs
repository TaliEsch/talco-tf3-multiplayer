import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { startHost } from "../src/host.mjs";
import { connectClient } from "../src/client.mjs";
import { SessionParticipant } from "../src/session-participant.mjs";
const secret = "a".repeat(64), buildHash = "b".repeat(64), modManifestHash = "c".repeat(64), checkpointHash = "d".repeat(64), stateHash = "e".repeat(64);
async function until(predicate) {
  for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 5)); }
  assert.fail("coordination socket test timed out");
}
async function fixture(count, { requireReleaseAck = false, leadUpdates, coordinationTimeoutMs, inspectVehicleOwner = null } = {}) {
  let update = 100;
  const owners = new Map(), clients = [], events=[];
  const host = startHost({ secret, buildHash, modManifestHash, port: 0, getUpdateCount: () => update, resolveEntityOwner: e => owners.get(e) ?? null, inspectVehicleOwner, requireReleaseAck, leadUpdates, coordinationTimeoutMs, logger:event=>events.push(event) });
  await once(host.server, "listening");
  try {
    for (let i = 0; i < count; i++) {
      const c = { messages: [], player: null }; clients.push(c);
      c.connection = connectClient({ secret, sessionId: host.sessionId, port: host.server.address().port, displayName: `Synthetic ${i}`, buildHash, modManifestHash,
        onMessage(m) { c.messages.push(m); if (m.kind === "admitted") c.player = m.payload.player; c.forward?.(m); } });
      await until(() => c.player);
      // Synthetic engine bindings. Real TF3 company creation is not exercised.
      host.authority.bindCompanyEntity(c.player.playerId, 1000 + i);
      owners.set(2000 + i, 1000 + i);
    }
  } catch (e) { for (const c of clients) c.connection?.socket.destroy(); host.server.close(); throw e; }
  const request = (seq = 1) => clients[0].connection.send("action_request", { clientSequence: seq, commandType: "vehicle.setRunning",
    originPlayerId: clients[0].player.playerId, targetCompanyEntity: 1000, targetEntity: 2000, payload: { running: false } });
  return { host, clients, events, request, setUpdate: u => { update = u; },
    async prepare() {
      host.beginCoordination({ checkpointHash, updateCount: 100 });
      await until(() => clients.every(c => c.messages.some(m => m.kind === "coordination_prepare")));
      clients.forEach((c, i) => c.connection.send("participant_ready", { roundId: host.coordinator.roundId, checkpointHash, updateCount: 100, companyEntity: 1000 + i }));
      await until(() => clients.every(c => c.messages.some(m => m.kind === "coordination_ready")));
    },
    async close() { for (const c of clients) c.connection.socket.destroy(); await new Promise(r => host.server.close(r)); },
  };
}
test('production-sized Stop lead keeps the two-engine prepare window open',async()=>{
  const f=await fixture(2,{leadUpdates:60,coordinationTimeoutMs:30000});
  try{
    await f.prepare();f.request();
    await until(()=>f.clients.every(c=>c.messages.some(m=>m.kind==='command_prepare')));
    const command=f.clients[0].messages.find(m=>m.kind==='command_prepare').payload.command;
    assert.equal(command.scheduledUpdate,160);
    assert.equal(f.host.coordinator.phase,'awaiting_prepare');
  }finally{await f.close();}
});
test('ahead peer clock is traced at Stop admission and still fails closed',async()=>{
  const f=await fixture(2,{leadUpdates:60,coordinationTimeoutMs:100});
  try{
    await f.prepare();
    f.clients[0].connection.send('participant_heartbeat',
      {roundId:f.host.coordinator.roundId,updateCount:101});
    // Same-socket frames are ordered, including when the writes are coalesced.
    f.request();
    await until(()=>f.clients[0].messages.some(m=>m.kind==='session_halted'));
    const clocks=f.events.filter(event=>event.event==='host_action_clock');
    assert.equal(clocks.length,2);
    assert.deepEqual(clocks.map(event=>event.peerUpdateCount).sort((a,b)=>a-b),[100,101]);
    assert.equal(clocks.every(event=>event.hostUpdateCount===100),true);
    assert.equal(f.clients[0].messages.find(m=>m.kind==='session_halted').payload.code,'CLOCK_MISMATCH');
    assert.equal(f.events.some(event=>event.event==='command_proposed'),false);
  }finally{await f.close();}
});
test('admission waits for an actual Host sample while processing control traffic',async()=>{
  const f=await fixture(2,{leadUpdates:60,coordinationTimeoutMs:1000});
  try{
    await f.prepare();
    const roundId=f.host.coordinator.roundId;
    f.clients[0].connection.send('participant_heartbeat',{roundId,updateCount:102});
    f.request();
    await until(()=>f.events.some(e=>e.event==='host_action_clock_wait'));
    assert.equal(f.events.some(e=>e.event==='command_proposed'),false);
    f.clients[1].connection.send('participant_heartbeat',{roundId,updateCount:103});
    f.clients[0].connection.send('test',{value:'control-during-clock-wait'});
    await until(()=>f.clients[0].messages.some(m=>m.kind==='test_echo'));
    f.setUpdate(102);
    await new Promise(resolve=>setTimeout(resolve,60));
    assert.equal(f.events.some(e=>e.event==='command_proposed'),false);
    f.setUpdate(103);
    await until(()=>f.clients.every(c=>c.messages.some(m=>m.kind==='command_prepare')));
    const commands=f.events.filter(e=>e.event==='command_proposed');
    assert.equal(commands.length,1);
    assert.equal(commands[0].hostSequence,1);
    assert.equal(commands[0].admissionUpdate,103);
    assert.equal(commands[0].scheduledUpdate,163);
    assert.equal(f.events.find(e=>e.event==='host_action_clock_wait_finished').caughtUp,true);
  }finally{await f.close();}
});
test('recorded bc4c moving peer clock cannot be satisfied by overtaking its original sample',async()=>{
  const f=await fixture(2,{leadUpdates:60,coordinationTimeoutMs:900});
  try{
    await f.prepare();
    const roundId=f.host.coordinator.roundId;
    f.setUpdate(716);
    f.clients[0].connection.send('participant_heartbeat',{roundId,updateCount:725});
    f.request();
    await until(()=>f.events.some(e=>e.event==='host_action_clock_wait'));
    assert.ok(f.events.some(e=>e.event==='host_action_clock'
      &&e.hostUpdateCount===716&&e.peerUpdateCount===725));
    const hostTrajectory=[723,728,733,738,743,748,753,758,763];
    const peerTrajectory=[729,734,740,744,750,755,760,764,770];
    for(let i=0;i<hostTrajectory.length;i++){
      const value=`bc4c-clock-${i}`;
      f.clients[0].connection.send('participant_heartbeat',
        {roundId,updateCount:peerTrajectory[i]});
      f.clients[0].connection.send('test',{value});
      await until(()=>f.clients[0].messages.some(m=>m.kind==='test_echo'
        &&m.payload.value===value));
      f.setUpdate(hostTrajectory[i]);
      assert.ok(hostTrajectory[i]<peerTrajectory[i]);
      assert.equal(f.events.some(e=>e.event==='command_proposed'),false);
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    f.setUpdate(765);
    assert.ok(765>725 && 765<peerTrajectory.at(-1));
    await until(()=>f.clients[0].messages.some(m=>m.kind==='session_halted'));
    assert.equal(f.clients[0].messages.find(m=>m.kind==='session_halted').payload.code,
      'CLOCK_MISMATCH');
    assert.equal(f.events.some(e=>e.event==='command_proposed'),false);
    assert.equal(f.clients[0].messages.some(m=>m.kind==='command_prepare'),false);
    assert.equal(f.clients[0].messages.filter(m=>m.kind==='test_echo'
      &&m.payload.value?.startsWith('bc4c-clock-')).length,peerTrajectory.length);
    const finished=f.events.find(e=>e.event==='host_action_clock_wait_finished');
    assert.equal(finished.caughtUp,false);
    assert.equal(finished.hostUpdateCount,765);
  }finally{await f.close();}
});
test('disconnect during clock catchup cannot admit the waiting action',async()=>{
  const f=await fixture(2,{coordinationTimeoutMs:1000});
  try{
    await f.prepare();
    f.clients[0].connection.send('participant_heartbeat',
      {roundId:f.host.coordinator.roundId,updateCount:102});
    f.request();
    await until(()=>f.events.some(e=>e.event==='host_action_clock_wait'));
    f.clients[1].connection.socket.destroy();
    await until(()=>f.host.coordinator.phase==='halted');
    f.setUpdate(102);
    await until(()=>f.clients[0].messages.some(m=>m.kind==='command_rejected'));
    assert.equal(f.events.some(e=>e.event==='command_proposed'),false);
    assert.equal(f.clients[0].messages.some(m=>m.kind==='command_prepare'),false);
  }finally{await f.close();}
});
test('real Host catchup precedes ownership inspection and prevents overtaking',async()=>{
  let reads=0;
  const f=await fixture(2,{coordinationTimeoutMs:1000,
    inspectVehicleOwner:async()=>{
      reads++;return {outcome:'found',entity:2000,company:1000,
        issuedUpdate:102,updateCount:102,paused:false};
    }});
  try{
    await f.prepare();
    f.clients[0].connection.send('participant_heartbeat',
      {roundId:f.host.coordinator.roundId,updateCount:102});
    f.request();
    await until(()=>f.events.some(e=>e.event==='host_action_clock_wait'));
    assert.equal(reads,0);
    f.request(2);
    await until(()=>f.clients[0].messages.some(m=>m.kind==='command_rejected'));
    assert.equal(f.clients[0].messages.find(m=>m.kind==='command_rejected').payload.code,
      'COMMAND_ADMISSION_BUSY');
    f.setUpdate(102);
    await until(()=>f.events.some(e=>e.event==='command_proposed'));
    assert.equal(reads,1);
    assert.equal(f.events.filter(e=>e.event==='command_proposed').length,1);
    assert.equal(f.events.find(e=>e.event==='command_proposed').admissionUpdate,102);
  }finally{await f.close();}
});
test('ownership inspection cannot overrun the fixed admission budget',async()=>{
  const f=await fixture(2,{coordinationTimeoutMs:100,
    inspectVehicleOwner:async()=>{
      await new Promise(resolve=>setTimeout(resolve,130));
      return {outcome:'found',entity:2000,company:1000,
        issuedUpdate:100,updateCount:100,paused:false};
    }});
  try{
    await f.prepare();f.request();
    await until(()=>f.clients[0].messages.some(m=>m.kind==='session_halted'));
    assert.equal(f.clients[0].messages.find(m=>m.kind==='session_halted').payload.code,
      'CLOCK_MISMATCH');
    assert.equal(f.events.some(e=>e.event==='command_proposed'),false);
  }finally{await f.close();}
});
for (const count of [2, 4]) test(`${count} socket participants coordinate prepare/commit/apply without legacy relay`, async () => {
  const f = await fixture(count);
  try {
    f.request();
    await until(() => f.clients[0].messages.some(m => m.kind === "command_rejected"));
    assert.equal(f.clients[0].messages.find(m => m.kind === "command_rejected").payload.code, "COORDINATION_NOT_READY");
    await f.prepare(); f.request(2);
    assert.equal(f.events.filter(event=>event.event==='peer_checkpoint_ready').length,count);
    await until(() => f.clients.every(c => c.messages.some(m => m.kind === "command_prepare")));
    const command = f.clients[0].messages.find(m => m.kind === "command_prepare").payload.command;
    assert.equal(f.clients.some(c => c.messages.some(m => m.kind === "command_accepted" || m.kind === "command_commit")), false);
    for (const c of f.clients) c.connection.send("command_prepared", { roundId: f.host.coordinator.roundId, hostSequence: command.hostSequence, scheduledUpdate: command.scheduledUpdate, updateCount: 100 });
    await until(() => f.clients.every(c => c.messages.some(m => m.kind === "command_commit")));
    f.setUpdate(command.scheduledUpdate);
    for (const c of f.clients) c.connection.send("command_applied", { roundId: f.host.coordinator.roundId, hostSequence: command.hostSequence, updateCount: command.scheduledUpdate, stateHash });
    await until(() => f.clients.every(c => c.messages.some(m => m.kind === "command_completed")));
    assert.equal(f.events.filter(event=>event.event==='peer_command_applied').length,count);
    assert.equal(f.host.coordinator.phase, "running");
    assert.throws(() => f.host.beginCoordination({ checkpointHash, updateCount: 100 }), /cannot restart/);
  } finally { await f.close(); }
});
test("disconnect during preparation halts other participants and blocks subsequent actions", async () => {
  const f = await fixture(2);
  try {
    await f.prepare(); f.request();
    await until(() => f.clients[0].messages.some(m => m.kind === "command_prepare"));
    f.clients[1].connection.socket.destroy();
    await until(() => f.clients[0].messages.some(m => m.kind === "session_halted"));
    assert.equal(f.clients[0].messages.find(m => m.kind === "session_halted").payload.code, "PARTICIPANT_DISCONNECTED");
    f.request(2);
    await until(() => f.clients[0].messages.some(m => m.kind === "command_rejected"));
    assert.equal(f.clients[0].messages.some(m => m.kind === "command_commit"), false);
  } finally { await f.close(); }
});
test("different state hashes halt the coordinated socket session", async () => {
  const f = await fixture(2);
  try {
    await f.prepare(); f.request();
    await until(() => f.clients.every(c => c.messages.some(m => m.kind === "command_prepare")));
    const command = f.clients[0].messages.find(m => m.kind === "command_prepare").payload.command;
    for (const c of f.clients) c.connection.send("command_prepared", { roundId: f.host.coordinator.roundId, hostSequence: command.hostSequence, scheduledUpdate: command.scheduledUpdate, updateCount: 100 });
    await until(() => f.clients.every(c => c.messages.some(m => m.kind === "command_commit")));
    f.clients[0].connection.send("command_applied", { roundId: f.host.coordinator.roundId, hostSequence: command.hostSequence, updateCount: command.scheduledUpdate, stateHash });
    await until(() => f.events.some(event => event.event === 'peer_command_applied'));
    f.clients[1].connection.send("command_applied", { roundId: f.host.coordinator.roundId, hostSequence: command.hostSequence, updateCount: command.scheduledUpdate, stateHash: "f".repeat(64) });
    await until(() => f.clients[0].messages.some(m => m.kind === "session_halted"));
    assert.equal(f.host.coordinator.phase, "halted");
    assert.equal(f.clients[0].messages.some(m => m.kind === "command_completed"), false);
    const divergence=f.events.filter(event=>event.event==='session_divergence');
    assert.equal(divergence.length,1);
    assert.equal(divergence[0].kind,'state');
    assert.equal(divergence[0].expectedHash,stateHash);
    assert.equal(divergence[0].expectedSource,'participant');
    assert.equal(divergence[0].expectedPlayerId,f.clients[0].player.playerId);
    assert.equal(divergence[0].expectedCompanyEntity,1000);
    assert.equal(divergence[0].playerId,f.clients[1].player.playerId);
    assert.equal(divergence[0].companyEntity,1001);
    assert.equal(divergence[0].observedHash,'f'.repeat(64));
    assert.equal(divergence[0].hostSequence,command.hostSequence);
    f.request(2);
    await until(()=>f.clients[0].messages.some(m=>m.kind==='command_rejected'));
    assert.equal(f.clients[0].messages.some(m=>m.kind==='command_completed'),false);
    assert.equal(f.events.filter(event=>event.event==='session_divergence').length,1);
  } finally { await f.close(); }
});

test("production socket coordination waits for every participant release receipt", async () => {
  const f = await fixture(2, { requireReleaseAck: true });
  try {
    f.host.coordinator.setResumeSpeed(2);
    f.host.beginCoordination({ checkpointHash, updateCount: 100 });
    await until(() => f.clients.every(c => c.messages.some(m => m.kind === "coordination_prepare")));
    f.clients.forEach((c, i) => c.connection.send("participant_ready", { roundId: f.host.coordinator.roundId, checkpointHash, updateCount: 100, companyEntity: 1000 + i }));
    await until(() => f.clients.every(c => c.messages.some(m => m.kind === "coordination_ready")));
    assert.equal(f.host.coordinator.phase, "awaiting_release");
    const receipt = { roundId: f.host.coordinator.roundId, hostSequence: 0, releaseUpdate: 100, updateCount: 100, speedup: 2 };
    f.clients[0].connection.send("participant_released", receipt);
    await until(() => f.host.coordinator.phase === "awaiting_release");
    f.clients[1].connection.send("participant_released", receipt);
    await until(() => f.host.coordinator.phase === "running");
  } finally { await f.close(); }
});

function attachParticipants(f) {
  const companies = new Map(f.clients.map((c, i) => [c.player.playerId, 1000 + i]));
  return f.clients.map(c => {
    const model = { update: 100, running: true, applied: 0, halt: null, held: false };
    const participant = new SessionParticipant({ playerId: c.player.playerId, companies,
      send: (kind, payload) => c.connection.send(kind, payload), disconnect: () => c.connection.socket.destroy(),
      adapter: { checkpoint: () => ({ checkpointHash, updateCount: 100 }), updateCount: () => model.update,
        owner: () => 1000,
        hold: () => { model.held = true; }, release: () => { model.held = false; },
        barrierState: () => ({ held: model.held, updateCount: model.update }),
        apply: command => { model.running = command.payload.running; model.applied++; return { updateCount: model.update, stateHash }; },
        halt: code => { model.halt = code; } } });
    c.forward = m => {
      if (m.kind.startsWith("coordination_") || ["command_prepare", "command_commit", "command_completed", "session_halted", "session_ended", "transport_error", "error", "peer_left"].includes(m.kind)) participant.receive(m.kind, m.payload);
    };
    return { participant, model };
  });
}
for (const count of [2, 4]) test(`${count} real-socket participant adapters complete consecutive exact-update commands`, async () => {
  const f = await fixture(count);
  try {
    const models = attachParticipants(f);
    f.host.beginCoordination({ checkpointHash, updateCount: 100 });
    await until(() => models.every(m => m.participant.phase === "running"));
    for (let sequence = 1; sequence <= 2; sequence++) {
      f.request(sequence);
      await until(() => models.every(m => m.participant.phase === "committed"));
      const command = f.clients[0].messages.filter(m => m.kind === "command_commit").at(-1).payload.command;
      assert.equal(models.every(m => m.model.applied === sequence - 1), true);
      f.setUpdate(command.scheduledUpdate);
      for (const m of models) { m.model.update = command.scheduledUpdate; m.participant.poll(); }
      await until(() => models.every(m => m.participant.phase === "running"));
      assert.equal(models.every(m => m.model.applied === sequence && m.model.running === false && m.model.halt === null), true);
      assert.equal(f.host.coordinator.phase, "running");
    }
  } finally { await f.close(); }
});
test("participant socket disconnect after commit cancels undelivered model execution", async () => {
  const f = await fixture(2);
  try {
    const models = attachParticipants(f);
    f.host.beginCoordination({ checkpointHash, updateCount: 100 });
    await until(() => models.every(m => m.participant.phase === "running")); f.request();
    await until(() => models.every(m => m.participant.phase === "committed"));
    f.clients[1].connection.socket.destroy();
    await until(() => models.every(m => m.participant.phase === "halted"));
    for (const m of models) { m.model.update = 108; m.participant.poll(); assert.equal(m.model.applied, 0); }
  } finally { await f.close(); }
});
