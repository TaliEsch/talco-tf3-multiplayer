import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sourcePath = new URL('../experimental/native-service-command.lua', import.meta.url);
const source = await readFile(sourcePath, 'utf8');

test('native service adapter remains experimental, bounded, and unregistered', () => {
  assert.match(source, /NOT registered in the mod or a\s+-- network endpoint/);
  assert.match(source, /exactKeys\(intent, \{stationA = true, stationB = true\}, 2\)/);
  assert.doesNotMatch(source, /register\s*\(/i);
  assert.doesNotMatch(source, /require\s*\(/);
  assert.doesNotMatch(source, /makeEntitySetPlayerCmd|sharedcompany|load\s*\(/i);
});

test('service requires distinct companies, held engine, and target-owned road assets', () => {
  for (const contract of [
    'binding.originalCompany ~= binding.targetCompany',
    'api.engine.util.getPlayer() == binding.originalCompany',
    'speed and speed.speedup == 0',
    'owner(binding.depotEntity) == binding.targetCompany',
    'owner(binding.vehicleEntity) == binding.targetCompany',
    'owner(stationEntity) == targetCompany',
    'depot.carrier == api.type["enum"].Carrier.ROAD',
    'vehicle.carrier == api.type["enum"].Carrier.ROAD',
    'first.stationEntity ~= second.stationEntity',
    'vehicle.depot == binding.depotEntity',
  ]) assert.ok(source.includes(contract), `missing ${contract}`);
});

test('fresh line uses two actual target stations and fresh road-terminal assignments', () => {
  for (const contract of [
    'api.engine.system.stationGroupSystem.getStationGroup(stationEntity)',
    'getBestLineAssignment(-1, line, true)',
    'assignment.station == stops[index].station and assignment.terminal >= 0',
    'api.engine.system.stationGroupSystem.getCarriers(',
    'carrier == api.type["enum"].Carrier.ROAD',
    'api.cmd.makeLineCreateCmd(binding.lineName',
    'api.cmd.makeVehicleSetLineCmd(binding.vehicleEntity, receipt.lineEntity, 0)',
    'api.engine.system.lineSystem.getLines()',
    'not linesBefore[lineEntity]',
  ]) assert.ok(source.includes(contract), `missing ${contract}`);
});

test('consent binds every company, asset, stop, and fixed line name', () => {
  assert.match(source, /consent\.kind == "native_service_create_and_assign" and consent\.confirmed == true/);
  for (const contract of [
    'consent.originalCompany == binding.originalCompany and consent.targetCompany == binding.targetCompany',
    'consent.depotEntity == binding.depotEntity and consent.vehicleEntity == binding.vehicleEntity',
    'consent.stationA == intent.stationA and consent.stationB == intent.stationB',
    'consent.lineName == binding.lineName',
  ]) assert.ok(source.includes(contract), `missing ${contract}`);
});

test('line creation and assignment each persist a consumed fault barrier before send', () => {
  const linePersist = source.indexOf('state:set(current)\n  local callbackSeen, callbackOpen');
  const lineSend = source.indexOf('api.cmd.sendCommand(api.cmd.makeLineCreateCmd');
  const assignmentPersist = source.indexOf('state:set(current)\n  callbackSeen, callbackOpen = false, true');
  const assignmentSend = source.indexOf('api.cmd.sendCommand(api.cmd.makeVehicleSetLineCmd');
  assert.ok(linePersist >= 0 && lineSend > linePersist, 'line latch must precede send');
  assert.ok(assignmentPersist >= 0 && assignmentSend > assignmentPersist, 'assignment latch must precede send');
  for (const contract of [
    'current.nativeServiceLineAttempted = true',
    'current.nativeServiceAssignmentAttempted = true',
    'current.phase2CompanyFault = true -- Shared barrier is saved before the line-create command.',
    'current.phase2CompanyFault = true -- Shared barrier is saved before vehicle assignment.',
    'current.phase2CompanyFault == true and current.nativeServiceLineAttempted',
    'Late engine callbacks cannot alter this receipt.',
    'Late engine callbacks cannot turn an unknown into success.',
  ]) assert.ok(source.includes(contract), `missing ${contract}`);
});

test('successful callbacks require actual line owner/configuration and vehicle assignment readback', () => {
  for (const contract of [
    'owner(lineEntity) == binding.targetCompany',
    'name and name.name == binding.lineName',
    'line and #line.stops == 2',
    'stop.stationGroup == expectedStop.stationGroup and stop.station == expectedStop.station',
    'problem[2] == api.type["enum"].LineProblem.NOTHING',
    'actual.line == receipt.lineEntity and actual.stopIndex >= 0',
    'receipt.outcome = "verified"',
    'receipt.code = "NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED"',
  ]) assert.ok(source.includes(contract), `missing ${contract}`);
});

test('shared company fault stays latched between commands and clears only after total success', () => {
  const lineVerified = source.indexOf('receipt.lineOutcome = "verified"');
  const assignmentSend = source.indexOf('api.cmd.sendCommand(api.cmd.makeVehicleSetLineCmd');
  const finalClear = source.lastIndexOf('current.phase2CompanyFault = false');
  assert.ok(lineVerified >= 0 && assignmentSend > lineVerified, 'assignment must follow a verified line callback');
  assert.ok(finalClear > assignmentSend, 'fault may clear only after assignment readback');
  assert.equal(source.slice(lineVerified, assignmentSend).includes('current.phase2CompanyFault = false'), false,
    'line creation must not clear the shared fault');
});

test('source reports, rather than claims, the live-service evidence gaps', () => {
  assert.match(source, /does not demonstrate road-path reachability beyond/);
  assert.match(source, /vehicle movement, service income, or operating\s+-- expense attribution/);
});
