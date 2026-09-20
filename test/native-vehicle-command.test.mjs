import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sourcePath = new URL('../experimental/native-vehicle-command.lua', import.meta.url);
const source = await readFile(sourcePath, 'utf8');

test('native vehicle adapter remains experimental and unregistered', () => {
  assert.match(source, /NOT registered in the mod or a network endpoint/);
  assert.doesNotMatch(source, /register\s*\(/i);
  assert.doesNotMatch(source, /require\s*\(/);
});

test('purchase intent is bounded and produces a fresh single road configuration', () => {
  assert.match(source, /exactKeys\(intent, \{model = true\}, 1\)/);
  assert.match(source, /intent\.model == binding\.modelResource/);
  assert.match(source, /metadata\.carrier == api\.type\["enum"\]\.Carrier\.ROAD/);
  assert.match(source, /api\.type\.TransportVehicleConfig\.new\(\)/);
  assert.match(source, /for _, _ in ipairs\(metadata\.compartments\) do/);
  assert.match(source, /api\.type\.LoadConfig\.new\(\)/);
  assert.match(source, /loadConfig\.loadConfigIndex = 0/);
  assert.match(source, /transportPart\.purchaseTime = gameTime\.gameTime/);
  assert.match(source, /table\.insert\(transportPart\.autoLoadConfig, true\)/);
  assert.match(source, /config\.vehicles = \{transportPart\}/);
  assert.match(source, /config\.vehicleGroups = \{1\}/);
  assert.match(source, /config\.muFileNames = \{\}/);
  assert.match(source, /api\.cmd\.makeVehicleBuyCmd\(binding\.targetCompany, binding\.depotEntity, config\)/);
});

test('adapter rechecks separate company, target-owned road depot, and held engine', () => {
  for (const contract of [
    'binding.originalCompany ~= binding.targetCompany',
    'api.engine.util.getPlayer() == binding.originalCompany',
    'owner(depotEntity) == binding.targetCompany',
    'depot.carrier == api.type["enum"].Carrier.ROAD',
    'speed and speed.speedup == 0',
  ]) assert.ok(source.includes(contract), `missing ${contract}`);
});

test('explicit consent and persisted consume-before-send fail closed', () => {
  assert.match(source, /consent\.kind == "native_vehicle_charge" and consent\.confirmed == true/);
  assert.match(source, /consent\.depotEntity == binding\.depotEntity and consent\.model == intent\.model/);
  assert.match(source, /not current\.nativeVehicleAttempted/);
  assert.match(source, /not current\.phase2CompanyFault/);
  const persist = source.indexOf('state:set(current) -- Persist consume-before-send');
  const send = source.indexOf('api.cmd.sendCommand(command');
  assert.ok(persist >= 0 && send > persist, 'latch must persist before send');
  assert.match(source, /late callback cannot turn an unknown attempt into success/);
  assert.match(source, /current\.phase2CompanyFault = true -- Shared terminal barrier/);
  assert.match(source, /if receipt\.outcome == "verified" then current\.phase2CompanyFault = false end/);
  assert.doesNotMatch(source, /sendCommand\(command[^\n]*\)\s*.*sendCommand/s);
});

test('synchronous receipt requires new target-owned matching vehicle and observed debit', () => {
  for (const contract of [
    'data and data.resultVehicleEntity',
    'not vehiclesBefore[vehicleEntity]',
    'owner(vehicleEntity) == binding.targetCompany',
    'vehicle.depot == binding.depotEntity',
    'sameConfiguration(vehicle.transportVehicleConfig, modelId)',
    '#config.vehicles[1].part.compartment2loadConfig == #metadata.compartments',
    '#config.vehicles[1].autoLoadConfig == #metadata.compartments',
    'config.vehicles[1].purchaseTime == gameTime.gameTime',
    'loadConfig.loadConfigIndex ~= 0',
    'config.vehicles[1].autoLoadConfig[i] ~= true',
    '#(resultEntities or {}) == 1',
    'resultEntities[1][1] == vehicleEntity',
    'receipt.originalAfter == beforeOriginal and receipt.targetAfter == beforeTarget - price',
    'receipt.chargedCost = beforeTarget - receipt.targetAfter',
    'receipt.outcome = "unknown"; receipt.code = "ENGINE_OUTCOME_UNKNOWN"',
  ]) assert.ok(source.includes(contract), `missing ${contract}`);
});

test('fresh purchase checks engine model price and funds before creating a command', () => {
  assert.match(source, /model\.metadata\.cost and model\.metadata\.cost\.price/);
  assert.match(source, /money\(price\) and price > 0/);
  assert.match(source, /balance\(binding\.targetCompany\) >= price/);
  assert.match(source, /local command, price = M.prepare/);
  assert.match(source, /Native rejection semantics still require disposable-save qualification/);
  assert.doesNotMatch(source, /intent\.price|binding\.price|consent\.price/);
});
