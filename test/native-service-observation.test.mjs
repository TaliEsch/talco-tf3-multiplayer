import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../experimental/native-service-observation.lua', import.meta.url), 'utf8');

test('native service observation is an unregistered, read-only experiment', () => {
  assert.match(source, /Read-only native service observation experiment/);
  assert.match(source, /NOT registered in the\s+-- mod, a UI, userdata exchange, or a network endpoint/);
  assert.doesNotMatch(source, /sendCommand|make[A-Z]\w*Cmd|register\s*\(/i);
  assert.doesNotMatch(source, /loadUserdata|saveUserdata|require\s*\(/);
});

test('collector exact-binds target company, vehicle, and line before every snapshot', () => {
  for (const contract of [
    'key == "targetCompany" or key == "vehicleEntity" or key == "lineEntity"',
    'count == 3 and entity(binding.targetCompany) and entity(binding.vehicleEntity) and entity(binding.lineEntity)',
    'vehicleOwner.player == binding.targetCompany and lineOwner.player == binding.targetCompany',
    'vehicle and vehicle.line == binding.lineEntity',
    'sameBinding(observation.binding, binding)',
  ]) assert.ok(source.includes(contract), `missing ${contract}`);
});

test('collector copies live two-stop/visit/clock/account values rather than retaining engine components', () => {
  for (const contract of [
    'line and #line.stops == 2',
    'stopIndex >= 0 and stopIndex < 2',
    'gameTime = clock.gameTime',
    'updateCount = clock.updateCount',
    'accountChartSeries = copiedSeries(chart)',
    'api.engine.util.finance.calculateBalance({ binding.vehicleEntity }, windowStart, clock.gameTime, true)',
    'api.type.ChartConfig.new()',
    'config.count = 16',
    'api.engine.util.finance.getAccountChart(binding.vehicleEntity, config)',
  ]) assert.ok(source.includes(contract), `missing ${contract}`);
  assert.doesNotMatch(source, /nativeServiceObservation\s*=\s*\{[^}]*vehicle\b/);
});

test('end capture retains exact direct-account category evidence without inferring a split', () => {
  for (const contract of [
    'ending.gameTime > observation.start.gameTime and ending.updateCount > observation.start.updateCount',
    'calculateBalance({ binding.vehicleEntity }, observation.start.gameTime,\n    ending.gameTime, true)',
    'ending.gameTime, true, api.type.JournalEntry.Maintenance.VEHICLE)',
    'its declaration does not say whether income',
    '"unverified_accounting_category_scope"',
    '"raw_vehicle_account_net_and_category_filter"',
  ]) assert.ok(source.includes(contract), `missing ${contract}`);
  assert.doesNotMatch(source, /revenue\s*=|operatingExpense\s*=/);
  assert.doesNotMatch(source, /accountChartSeries\s*\[.*\]/);
});

test('raw collection is bounded and refuses changed route endpoints', () => {
  for (const marker of ['#chart.series <= 8','#series[1] <= 64','#vehicle.visitedStops <= 2',
    'initial.stationGroup == stop.stationGroup','initial.station == stop.station',
    'initial.terminal == stop.terminal','OBSERVED_ROUTE_CHANGED']) assert.ok(source.includes(marker),marker);
});
