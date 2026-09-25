import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const engine = await readFile(new URL('../mod/content/tf3mp_status.script.tl', import.meta.url), 'utf8');
const panel = await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl', import.meta.url), 'utf8');
const station = await readFile(new URL('../mod/content/tf3mp_station_command.lua', import.meta.url), 'utf8');

test('station admission has the exact bounded request, expiry, and vehicle correlation guards', () => {
  const region = engine.slice(engine.indexOf('local function phase2StationEvent'), engine.indexOf('local function serviceReceipt'));
  for (const marker of ['if count ~= 16 then return nil end', 'request.expiresTick ~= request.issuedTick + 300',
    '(request.slot ~= 1 and request.slot ~= 2)', 'vehicle.outcome ~= "verified"', 'vehicle.nonce ~= request.nonce', 'nativeVehicle.outcome ~= "verified"',
    'current.phase2CompanyFault == true', 'speed.speedup ~= 0']) assert.ok(region.includes(marker), marker);
});

test('station adapter persists slot barriers before sending and preserves membership only after checks', () => {
  for (const marker of ['nativeStationSlot1Attempted', 'nativeStationSlot2Attempted', 'SLOT1_VERIFIED_BINDING_REQUIRED',
    'SLOT2_DISTINCT_STATION_REQUIRED', 'state:set(current)', 'preservesExisting(constructionsBefore',
    'preservesExisting(stationsBefore', 'receipt.constructionMembershipPreserved=true',
    'receipt.stationMembershipPreserved=true']) assert.ok(station.includes(marker), marker);
  assert.ok(station.indexOf('state:set(current)') < station.indexOf('api.cmd.sendCommand(command'));
});

test('protected GUI consumes before station dispatch and only saves a bounded correlated receipt', () => {
  const region = panel.slice(panel.indexOf('local function exchangePhase2Station'), panel.indexOf('local function exchangePhase2Funding'));
  for (const marker of ['if count ~= 16', 'phase2StationSent = request.requestId as integer',
    '"tf3mp_phase2_station"', 'checked > 64', 'receipt.kind ~= "phase2_station_receipt"',
    'phase2StationReported = phase2StationSent']) assert.ok(region.includes(marker), marker);
  assert.ok(region.indexOf('phase2StationSent = request.requestId as integer') < region.indexOf('api.cmd.sendCommand'));
});

test('station receipt uses a separate wire record and migration subscribes to its event', () => {
  for (const marker of ['phase2StationReceipt : table', 'current.eventSubscriptionsVersion ~= 22',
    'state:subscribeToEvent("tf3mp_phase2_station")', 'tf3mp_get_phase2_station']) assert.ok(engine.includes(marker), marker);
  assert.match(engine, /kind="phase2_station_receipt"/);
});

test('service admission is single-use, session-bound, paused, and protected by the GUI allowlist', () => {
  const region = engine.slice(engine.indexOf('local function phase2ServiceEvent'), engine.indexOf('local function vehiclePurchaseReceipt'));
  for (const marker of ['if count ~= 13 then return nil end', 'depot.sessionId ~= request.nonce',
    'vehicleWire.nonce ~= request.nonce', 'station1.sessionId ~= request.nonce',
    'current.nativeServiceLineAttempted == true', 'speed.speedup ~= 0', 'phase2ServiceReceipt']) assert.ok(region.includes(marker), marker);
  const gui = panel.slice(panel.indexOf('local function exchangePhase2Service'), panel.indexOf('local function exchangePhase2Funding'));
  for (const marker of ['if count~=13', '"tf3mp_phase2_service"', 'checked>64', 'phase2ServiceReported=phase2ServiceSent']) assert.ok(gui.includes(marker), marker);
});
