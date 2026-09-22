import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, cp, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateReviewPackage } from '../src/review-validator.mjs';

// Source integration checks, not execution of Teal or proof of an engine halt.
test('engine-owned scheduling can only pause; vehicle execution still needs a fresh held event',async()=>{
  const engine=await readFile(new URL('../mod/content/tf3mp_status.script.tl',import.meta.url),'utf8');
  const panel=await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl',import.meta.url),'utf8');
  const barrier=engine.slice(engine.indexOf('local function executionBarrierUpdate'),engine.indexOf('local function watchdogEvent'));
  assert.doesNotMatch(barrier,/makeVehicle|request\.running|request\.entity/);
  assert.ok(barrier.indexOf('barrier.phase = "unknown"')<barrier.indexOf('api.cmd.sendCommand'));
  assert.match(barrier,/clock.updateCount == barrier.scheduledUpdate/);
  assert.match(barrier,/afterClock.updateCount == barrier.scheduledUpdate and speed.speedup == 0/);
  const arm=engine.slice(engine.indexOf('if name == "tf3mp_arm_execution_hold"'),engine.indexOf('barrier.phase = "consumed"'));
  assert.match(arm,/request.scheduledUpdate <= clock.updateCount/);
  assert.match(arm,/barrier.phase ~= "consumed" or request.hostSequence <= barrier.hostSequence/);
  assert.doesNotMatch(arm,/entity =|running =|sendCommand/);
  const dispatch=panel.slice(panel.indexOf('local function dispatchExecutionAtUpdate'),panel.indexOf('local function exchangeExecution'));
  assert.doesNotMatch(dispatch,/scheduledUpdate - 1/);
  assert.match(dispatch,/barrier.operationId ~= request.operationId/);
  assert.match(dispatch,/request\[key\] ~= value/);
  assert.match(panel,/"tf3mp_arm_execution_hold", payload/);
  for(const name of ['tf3mp_arm_execution_hold','tf3mp_get_execution_barrier'])assert.ok(engine.includes(`state:subscribeToEvent("${name}")`));
});

test('checkpoint delivery is transient, live-request-bound and consumed before sending',async()=>{
  const panel=await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl',import.meta.url),'utf8');
  const dispatch=panel.slice(panel.indexOf('local function dispatchCheckpointAtUpdate'),panel.indexOf('local function exchangeCheckpoint'));
  assert.match(dispatch,/clock.updateCount < request.updateCount - 1/);
  assert.match(dispatch,/request\[key\] ~= value/);
  assert.match(dispatch,/count ~= \(request.checkpointHash == nil and 6 or 7\)/);
  assert.ok(dispatch.indexOf('pendingCheckpoint = {}')<dispatch.indexOf('api.cmd.sendCommand'));
  assert.match(panel,/pcall\(dispatchCheckpointAtUpdate\)/);
});

test('checkpoint release persists uncertainty before resume and requires same held update',async()=>{
  const engine=await readFile(new URL('../mod/content/tf3mp_status.script.tl',import.meta.url),'utf8');
  const panel=await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl',import.meta.url),'utf8');
  const release=engine.slice(engine.indexOf('name == "tf3mp_release_checkpoint"'),engine.indexOf('name == "tf3mp_prepare_command"'));
  assert.equal(release.match(/makeGameSetSpeedCmd\(targetSpeed\)/g)?.length,1);
  assert.ok(release.indexOf('binding.phase = "release_unknown"')<release.indexOf('api.cmd.sendCommand'));
  assert.match(release,/afterClock.updateCount == request.updateCount and afterSpeed.speedup == targetSpeed/);
  for(const name of ['tf3mp_release_checkpoint','tf3mp_get_release_receipt']) {
    assert.ok(engine.includes(`state:subscribeToEvent("${name}")`));assert.ok(panel.includes(`"${name}"`));
  }
  const gui=panel.slice(panel.indexOf('local function exchangeRelease'),panel.indexOf('local function exchangePreparation'));
  assert.ok(gui.indexOf('releaseSent = request.operationId')<gui.indexOf('api.cmd.sendCommand'));
  assert.match(gui,/missedAcks <= 10 and lastAck >= 0 and releaseSent ~= liveRequest.operationId/);
  assert.match(release,/previousRelease.status ~= "ok" or request.updateCount <= previousRelease.updateCount/);
  assert.match(release,/held.hostSequence ~= \(binding.nextSequence or 1\)/);
  assert.ok(release.indexOf('binding.nextSequence = held.hostSequence + 1')>release.indexOf('if ok and succeeded'));
  assert.ok(release.indexOf('current.preparedCommand = {}')>release.indexOf('if ok and succeeded'));
});

test('repeatable GUI stages publish only the live requested operation and never resend the same id',async()=>{
  const panel=await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl',import.meta.url),'utf8');
  for(const [fn,op,sent] of [['exchangeRelease','release','releaseSent'],['exchangePreparation','prepare','preparationSent'],['exchangeExecution','executeHeld','executionSent']]) {
    const start=panel.indexOf(`local function ${fn}()`);
    const body=panel.slice(start,panel.indexOf('\nlocal function ',start+1));
    assert.ok(body.includes(`liveRequest.operation ~= "${op}"`));
    assert.ok(body.includes(`${sent} ~= liveRequest.operationId`));
    assert.ok(body.indexOf(`liveRequest.operation ~= "${op}"`)<body.indexOf('app.saveUserdata'));
  }
});

test('review rejects removal of repeated-release replay and sequence fences',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tf3mp-release-review-'));
  try {
    await cp(new URL('../mod',import.meta.url),dir,{recursive:true});
    const file=path.join(dir,'content','tf3mp_status.script.tl');
    const original=await readFile(file,'utf8');
    for(const marker of ['previousRelease.status ~= "ok" or request.updateCount <= previousRelease.updateCount or request.operationId == previousRelease.operationId',
      'held.hostSequence ~= (binding.nextSequence or 1)','binding.phase ~= "checkpoint_held" and not actionRelease']) {
      await writeFile(file,original.replace(marker,'false'));
      await assert.rejects(validateReviewPackage(dir),/release/);
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('execution consumes authorization and requires an existing hold before mutation',async()=>{
  const engine=await readFile(new URL('../mod/content/tf3mp_status.script.tl',import.meta.url),'utf8');
  const panel=await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl',import.meta.url),'utf8');
  const region=engine.slice(engine.indexOf('-- Committed coordinator execution:'),engine.indexOf('-- First real coordinator operation:'));
  const mutation=region.indexOf('api.cmd.makeVehicleSetStoppedByUserCmd');
  assert.ok(region.indexOf('state:set(current)')<mutation);
  assert.doesNotMatch(region,/makeGameSetSpeedCmd/);
  assert.ok(region.indexOf('owner.player ~= request.companyEntity')<mutation);
  assert.ok(region.indexOf('heldClock.updateCount ~= request.scheduledUpdate')<mutation);
  assert.match(region,/request\[key\] ~= prepared\[key\]/);
  assert.match(region,/function\(vehicleData : VehicleSetStoppedByUserCommandData, success : boolean/);
  assert.match(region,/savedBarrier.operationId ~= expectedOperation or success ~= true/);
  assert.match(region,/vehicleData.vehicleEntity ~= expectedEntity or vehicleData.userStopped ~= expectedStopped/);
  assert.match(region,/afterClock.updateCount ~= expectedUpdate or afterSpeed.speedup ~= 0/);
  assert.match(region,/savedReceipt.balance = math.abs\(balance\)/);
  assert.ok(region.indexOf('current.executionReceipt = receipt')<mutation);
  assert.ok(region.indexOf('savedReceipt.status = "ok"')>mutation);
  assert.doesNotMatch(region,/receipt.stateHash\s*=/);
  for(const name of ['tf3mp_execute_command','tf3mp_get_execution_receipt']) {
    assert.ok(engine.includes(`state:subscribeToEvent("${name}")`));assert.ok(panel.includes(`"${name}"`));
  }
  const dispatch=panel.slice(panel.indexOf('local function dispatchExecutionAtUpdate'),panel.indexOf('local function exchangeExecution'));
  assert.ok(dispatch.indexOf('pendingExecution = {}')<dispatch.indexOf('api.cmd.sendCommand'));
  assert.match(dispatch,/barrier.phase ~= "held"/);
  assert.match(dispatch,/clock.updateCount ~= request.scheduledUpdate/);
  assert.match(dispatch,/request\[key\] ~= value/);
  assert.match(dispatch,/count ~= 15/);
});

test('review rejects weakened committed execution guards',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tf3mp-exec-review-'));
  try {
    await cp(new URL('../mod',import.meta.url),dir,{recursive:true});
    const file=path.join(dir,'content','tf3mp_status.script.tl');
    const original=await readFile(file,'utf8');
    const start=original.indexOf('-- Committed coordinator execution:');
    for(const marker of ['binding.phase ~= "prepared"','clock.tickCount >= lease.expiresTick',
      'request[key] ~= prepared[key]','(current.executionReceipt or {}).operationId ~= nil',
      'owner == nil or vehicle == nil or owner.player ~= request.companyEntity',
      'afterClock.updateCount ~= expectedUpdate or afterSpeed.speedup ~= 0',
      'savedBarrier.operationId ~= expectedOperation or success ~= true',
      'vehicleData.vehicleEntity ~= expectedEntity or vehicleData.userStopped ~= expectedStopped']) {
      await writeFile(file,original.slice(0,start)+original.slice(start).replace(marker,'false'));
      await assert.rejects(validateReviewPackage(dir),/coordinator execution/);
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('preparation is engine-owned inspection with matching fixed wire fields',async()=>{
  const engine=await readFile(new URL('../mod/content/tf3mp_status.script.tl',import.meta.url),'utf8');
  const panel=await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl',import.meta.url),'utf8');
  const region=engine.slice(engine.indexOf('name == "tf3mp_prepare_command"'),engine.indexOf('-- Committed coordinator execution:'));
  assert.match(region,/receipt.ownerCompanyEntity = owner.player/);
  assert.match(region,/api.engine.getRevision\(request.entity as integer\)/);
  assert.doesNotMatch(region,/api\.cmd|vehicleEvent\(|pauseEvent\(|haltEvent\(/);
  for(const name of ['tf3mp_prepare_command','tf3mp_get_preparation_receipt']) {
    assert.ok(engine.includes(`state:subscribeToEvent("${name}")`));
    assert.ok(panel.includes(`"${name}"`));
  }
  const gui=panel.slice(panel.indexOf('local function exchangePreparation'),panel.indexOf('local function exchangeCoordinationHalt'));
  assert.match(gui,/count ~= 15/);
  assert.ok(gui.indexOf('preparationSent = request.operationId')<gui.indexOf('api.cmd.sendCommand'));
  assert.match(gui,/ownerCompanyEntity = receipt.ownerCompanyEntity/);
  assert.doesNotMatch(engine.slice(engine.indexOf('  update = function'),engine.indexOf('  handleEvent = function')),/preparedCommand/);
});

test('engine binding checks real companies and refuses saved reassignment',async()=>{
  const source=await readFile(new URL('../mod/content/tf3mp_status.script.tl',import.meta.url),'utf8');
  const start=source.indexOf('name == "tf3mp_bind_session"');
  const binding=source.slice(start,source.indexOf('name == "tf3mp_hold_checkpoint"',start));
  for(const marker of ['request.playerCount < 2 or request.playerCount > 4','count ~= 7 + 2 * request.playerCount',
    'players[player] ~= nil or companies[company] ~= nil','api.engine.entityExists(company as integer)',
    'api.type.ComponentType.PLAYER) == nil','existing.nonce ~= nil','players[request.localPlayerId] ~= company',
    'lease.nonce ~= request.nonce','clock.tickCount >= lease.expiresTick']) assert.ok(binding.includes(marker),marker);
  assert.doesNotMatch(binding,/api\.cmd|haltEvent\(|pauseEvent\(|vehicleEvent\(/);
  assert.ok(binding.indexOf('existing.nonce ~= nil')<binding.indexOf('current.coordinationBinding ='));
});

test('coordinator halt has engine event, GUI receipt and matching mailbox fields', async () => {
  const engine=await readFile(new URL('../mod/content/tf3mp_status.script.tl',import.meta.url),'utf8');
  const panel=await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl',import.meta.url),'utf8');
  const region=panel.slice(panel.indexOf('local function exchangeCoordinationHalt'),panel.indexOf('local function exchangeWatchdog'));
  assert.match(region,/missedAcks <= 10 and lastAck >= 0 and coordinationSent == ""/);
  assert.match(region,/request.operation ~= "halt"/);
  assert.ok(region.indexOf('coordinationSent = request.operationId') < region.indexOf('api.cmd.sendCommand'));
  const receipt=region.slice(region.indexOf('if coordinationSent == "" then return nil end'));
  assert.doesNotMatch(receipt,/api\.cmd/);
  assert.match(receipt,/"coordination_receipt"/);
  for(const name of ['tf3mp_coordination','tf3mp_get_coordination_receipt']) {
    assert.ok(engine.includes(`state:subscribeToEvent("${name}")`));
    assert.ok(region.includes(`"${name}"`));
  }
  const handler=engine.slice(engine.indexOf('-- First real coordinator operation:'),engine.indexOf('if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_watchdog"'));
  assert.equal(handler.match(/haltEvent\(state, current,/g)?.length,1);
  assert.doesNotMatch(handler,/api\.cmd|vehicleEvent\(|pauseEvent\(/);
  assert.match(handler,/status = "unknown"/);
  assert.match(handler,/receipt.status = "ok"/);
});

test('review rejects a coordinator halt without lease, duplicate, or receipt checks',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tf3mp-coord-review-'));
  try {
    await cp(new URL('../mod',import.meta.url),dir,{recursive:true});
    const file=path.join(dir,'content','tf3mp_status.script.tl');
    const original=await readFile(file,'utf8');
    for(const marker of ['lease.nonce ~= request.nonce','old.operationId ~= nil','result.outcome == "halted" and result.updateCount == clock.updateCount']) {
      const start=original.indexOf('-- First real coordinator operation:');
      await writeFile(file,original.slice(0,start)+original.slice(start).replace(marker,'false'));
      await assert.rejects(validateReviewPackage(dir),/coordinator halt/);
    }
    for(const marker of ['existing.nonce ~= nil','players[player] ~= nil or companies[company] ~= nil','players[request.localPlayerId] ~= company']) {
      await writeFile(file,original.replace(marker,'false'));
      await assert.rejects(validateReviewPackage(dir),/engine binding/);
    }
    for(const marker of ['binding.players[request.originPlayerId] ~= request.companyEntity','owner.player ~= request.companyEntity','request.scheduledUpdate <= clock.updateCount']) {
      const start=original.indexOf('name == "tf3mp_prepare_command"');
      await writeFile(file,original.slice(0,start)+original.slice(start).replace(marker,'false'));
      await assert.rejects(validateReviewPackage(dir),/engine preparation/);
    }
    for(const marker of ['binding.phase ~= "checkpoint_held"','held.status ~= "ok"','binding.phase = "release_unknown"','afterSpeed.speedup == targetSpeed','request.speedup ~= 1 and request.speedup ~= 2 and request.speedup ~= 4','receipt.speedup = afterSpeed.speedup']) {
      const start=original.indexOf('name == "tf3mp_release_checkpoint"');
      await writeFile(file,original.slice(0,start)+original.slice(start).replace(marker,'false'));
      await assert.rejects(validateReviewPackage(dir),/coordinator release/);
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
