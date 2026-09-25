import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const statusUrl=new URL('../mod/content/tf3mp_status.script.tl',import.meta.url);
const panelUrl=new URL('../mod/content/tf3mp_status_panel.script.tl',import.meta.url);
const adapterUrl=new URL('../mod/content/tf3mp_vehicle_command.lua',import.meta.url);

test('vehicle purchase uses the exact, expiring request and verified created depot',async()=>{
  const source=await readFile(statusUrl,'utf8');
  const fn=source.slice(source.indexOf('local function phase2VehicleEvent'),source.indexOf('local function bookTestEntry'));
  for(const marker of ['request.kind ~= "phase2_vehicle"','count ~= 11','request.expiresTick ~= request.issuedTick + 300',
    'created.outcome ~= "created"','depot.outcome ~= "verified"','depot.sessionId ~= request.nonce','depot.depotEntity ~= request.depotEntity',
    'speed == nil or speed.speedup ~= 0','current.phase2CompanyFault == true or current.nativeVehicleAttempted == true',
    'vehicleCommand.execute(state, intent, binding, consent)']) assert.ok(fn.includes(marker),marker);
  assert.ok(fn.indexOf('current.phase2VehicleReceipt = receipt')<fn.indexOf('vehicleCommand.execute'));
  assert.match(fn,/validCost\(native\.chargedCost\)/);
  assert.match(fn,/\.mdl\$/);
  assert.ok(fn.includes('^[A-Za-z0-9_.:/%-]+%.mdl$'),'namespaced resource IDs must remain accepted');
  assert.match(source,/eventSubscriptionsVersion ~= 26/);
  for(const event of ['tf3mp_phase2_vehicle','tf3mp_get_phase2_vehicle']) assert.ok(source.includes(`state:subscribeToEvent("${event}")`));
  assert.match(source,/name == "tf3mp_get_phase2_vehicle"/);
});

test('vehicle GUI consumes before send and accepts only a bounded correlated receipt',async()=>{
  const source=await readFile(panelUrl,'utf8');
  const fn=source.slice(source.indexOf('local function exchangePhase2Vehicle'),source.indexOf('local function exchangePhase2Funding'));
  for(const marker of ['count ~= 11','phase2VehicleSent = request.requestId as integer','"tf3mp_phase2_vehicle"',
    'checked > 64','receipt.kind ~= "phase2_vehicle_receipt"','receipt.requestId ~= phase2VehicleSent',
    'phase2VehicleReported = phase2VehicleSent']) assert.ok(fn.includes(marker),marker);
  assert.ok(fn.indexOf('phase2VehicleSent = request.requestId as integer')<fn.indexOf('api.cmd.sendCommand'));
  assert.match(fn,/\.mdl\$/);
  assert.match(fn,/receipt\.chargedCost > 9007199254740991/);
});

test('adapter persists the native one-shot latch and records observed owners',async()=>{
  const source=await readFile(adapterUrl,'utf8');
  for(const marker of ['exactKeys(intent, { model = true }, 1)','not current.nativeVehicleAttempted and not current.phase2CompanyFault','current.nativeVehicleAttempted = true',
    'current.phase2CompanyFault = true','state:set(current)','local saved = state:get()',
    'receipt.vehicleOwner = owner(vehicleEntity)','receipt.depotOwner = owner(binding.depotEntity)',
    'sameConfiguration(vehicle.transportVehicleConfig, modelId)','config.vehicleGroups[1] == 1',
    'config.vehicles[1].purchaseTime == gameTime.gameTime','local command, price, modelId = M.prepare(intent, binding)',
    'receipt.outcome = "unknown"; receipt.code = ok and "ENGINE_CALLBACK_MISSING" or "ENGINE_SEND_FAILED"',
    'saved.phase2CompanyFault = false','callbackOpen = false']) assert.ok(source.includes(marker),marker);
});
