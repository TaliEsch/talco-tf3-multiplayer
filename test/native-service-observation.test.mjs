import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../mod/content/tf3mp_service_observation.lua',import.meta.url),'utf8');

test('registered service observation remains read-only and never retains native command payloads',()=>{
  assert.match(source,/engine-side read-only observation/);
  assert.doesNotMatch(source,/sendCommand|make[A-Z]\w*Cmd|loadUserdata|saveUserdata|require\s*\(/);
  assert.doesNotMatch(source,/revenue\s*=|operatingExpense\s*=|getAccountChart/);
});

test('service observation binds to saved verified line and assignment receipts',()=>{
  for(const marker of ['count == 11','getmetatable(request) ~= nil','current.nativeServiceLineAttempted ~= true',
    'current.nativeServiceAssignmentAttempted ~= true','service.code ~= "NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED"',
    'service.originalCompany ~= b.originalCompany','service.targetCompany ~= b.targetCompany',
    'service.vehicleEntity ~= b.vehicleEntity','service.lineEntity ~= b.lineEntity','current.phase2CompanyFault == true'])
    assert.ok(source.includes(marker),marker);
});

test('every snapshot rechecks service ownership, actual assignment and route stations',()=>{
  for(const marker of ['owner(b.vehicleEntity) ~= b.targetCompany','owner(b.lineEntity) ~= b.targetCompany',
    'owner(service.depotEntity) ~= b.targetCompany','owner(service.stationA) ~= b.targetCompany',
    'owner(service.stationB) ~= b.targetCompany','vehicle.line ~= b.lineEntity','group.stations[stops[index].station + 1] ~= expected',
    'stops=savedRoute(line, service)','visitedStops=copiedVisitedStops(vehicle)'])assert.ok(source.includes(marker),marker);
});

test('endpoints retain raw exact-account evidence without assuming a finance split',()=>{
  for(const marker of ['ending.gameTime <= start.gameTime','ending.updateCount <= start.updateCount',
    'calculateBalance({b.vehicleEntity}, start.gameTime, ending.gameTime, true)',
    'maintenance.VEHICLE)','maintenance.INFRASTRUCTURE)','maintenance.OTHER)','maintenance.VEHICLE_MAINTENANCE)',
    '"raw_start_captured"','"raw_end_captured"','intervalMaintenanceVehicleMaintenance'])assert.ok(source.includes(marker),marker);
});

test('observations preserve nonce/binding and forbid replacement, stale requests and changed routes',()=>{
  for(const marker of ['speed.speedup ~= 0','request.expiresTick - request.issuedTick <= 300',
    'now.tickCount < request.issuedTick or now.tickCount > request.expiresTick','next(observation) ~= nil',
    'observation.nonce ~= request.nonce','sameBinding(observation.binding, b)','OBSERVED_ROUTE_CHANGED',
    'OBSERVATION_ALREADY_FINISHED','nativeServiceObservationReceipt = result'])assert.ok(source.includes(marker),marker);
});
