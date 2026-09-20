import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { validateReviewPackage } from '../src/review-validator.mjs';

test('watchdog source never renews after expiry, resumes, or rearms a saved lease', async () => {
  const source = await readFile(new URL('../mod/content/tf3mp_status.script.tl', import.meta.url), 'utf8');
  const region = source.slice(source.indexOf('local function watchdogUpdate'), source.indexOf('local function executionBarrierUpdate'))
    + source.slice(source.indexOf('local function watchdogEvent'), source.indexOf('local function haltEvent'));
  assert.equal(region.match(/makeGameSetSpeedCmd\(/g)?.length, 1);
  assert.match(region, /makeGameSetSpeedCmd\(0\)/);
  assert.doesNotMatch(region, /app\.|userdata|makeVehicle|makeJournal/);
  assert.ok(region.indexOf('lease.phase = "stopping"') < region.indexOf('api.cmd.sendCommand'));
  const event = region.slice(region.indexOf('local function watchdogEvent'));
  assert.ok(event.indexOf('watchdogUpdate(state, current)') < event.indexOf('lease.expiresTick = request.expiresTick'));
  assert.match(event, /if lease.phase ~= nil then return nil end/);
  assert.match(event, /request.requestId <= lease.requestId or request.issuedTick <= lease.issuedTick/);
});

test('review rejects weakened watchdog expiry, persistence, and renewal boundaries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tf3mp-watchdog-review-'));
  try {
    await cp(new URL('../mod', import.meta.url), root, { recursive: true });
    const file = path.join(root, 'content', 'tf3mp_status.script.tl');
    const original = await readFile(file, 'utf8');
    for (const marker of ['lease.phase = "stopping"', 'clock.tickCount >= lease.expiresTick',
      'request.requestId <= lease.requestId or request.issuedTick <= lease.issuedTick',
      'afterClock.updateCount == lease.updateCount', 'if count ~= 8']) {
      await writeFile(file, original.replace(marker, 'false'));
      await assert.rejects(validateReviewPackage(root), /watchdog/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('watchdog mutations run in postUpdate and exceptions preserve the spent latch', async () => {
  const descriptor = await readFile(new URL('../mod/content/tf3mp_status.gs.lua', import.meta.url), 'utf8');
  for (const name of ['update', 'postUpdate', 'handleEvent', 'guiUpdate', 'guiHandleEvent']) {
    assert.ok(descriptor.includes(`${name}Script = { fileName = "tf3mp_status_1::/tf3mp_status.script@${name}" }`), `unregistered callback: ${name}`);
  }
  const source = await readFile(new URL('../mod/content/tf3mp_status.script.tl', import.meta.url), 'utf8');
  const start = source.indexOf('  update = function');
  const post = source.indexOf('  postUpdate = function');
  assert.ok(post > start);
  assert.doesNotMatch(source.slice(start, post), /watchdogUpdate\(state, current\)/);
  assert.match(source.slice(start, post), /if lease.phase == "active" then return \{ watchdog = true \} end/);
  const callback = source.slice(post, source.indexOf('  handleEvent = function'));
  assert.match(callback, /if type\(updateResult\) ~= "table" or \(updateResult as table\).watchdog ~= true then return end/);
  assert.match(callback, /pcall\(function\(\) watchdogUpdate\(state, current\) end\)/);
  assert.match(callback, /if lease.phase == "stopping" then lease.outcome = "handler_failed" end/);
  assert.doesNotMatch(callback, /lease\.phase\s*=(?!=)|makeGameSetSpeedCmd/);
});

test('helper loss blocks watchdog dispatch but preserves receipt observation', async () => {
  const panel = await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl', import.meta.url), 'utf8');
  const watchdog = panel.slice(panel.indexOf('local function exchangeWatchdog'), panel.indexOf('local function exchangeSpeedControls'));
  assert.match(watchdog, /if missedAcks <= 10 and lastAck >= 0 and userdataExists\("watchdog_request"\) then/);
  assert.doesNotMatch(watchdog, /if missedAcks > 10 then return nil end/);
  assert.equal(watchdog.match(/api\.cmd\.sendCommand/g)?.length, 1);
  const reads = watchdog.slice(watchdog.indexOf('if watchdogSent < 1'));
  assert.match(reads, /fireGuiScriptEvent/);
  assert.match(reads, /saveUserdata\("tf3mp_status_1", "watchdog_receipt"/);
  assert.doesNotMatch(reads, /api\.cmd|makeGameSetSpeedCmd/);
  const exchange = panel.slice(panel.indexOf('local function exchangeTelemetry'));
  assert.ok(exchange.indexOf('pcall(exchangeWatchdog)') < exchange.indexOf('if missedAcks > 10 then return "bridge disconnected" end'));
});
