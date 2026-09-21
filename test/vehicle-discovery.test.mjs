import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const engine=await readFile(new URL('../mod/content/tf3mp_status.script.tl',import.meta.url),'utf8');
const panel=await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl',import.meta.url),'utf8');

test('vehicle discovery is a bounded read-only owner-filtered bridge request',()=>{
  for(const marker of [
    'state:subscribeToEvent("tf3mp_discover_vehicle")',
    'state:subscribeToEvent("tf3mp_get_vehicle_discovery")',
    'name == "tf3mp_discover_vehicle"',
    'request.kind ~= "vehicle_discovery_request"',
    'api.engine.getEntitiesWithComponent(api.type.ComponentType.TRANSPORT_VEHICLE)',
    'owner.player == request.company',
    'receipt.outcome = "found"',
    'return current.vehicleDiscoveryReceipt',
  ])assert.ok(engine.includes(marker),marker);
  const region=engine.slice(engine.indexOf('name == "tf3mp_discover_vehicle"'),engine.indexOf('name == "tf3mp_vehicle_command"'));
  assert.doesNotMatch(region,/api\.cmd|sendCommand|makeVehicle|saveGame|setGameSpeed/);
  for(const marker of [
    'local function exchangeVehicleDiscovery()',
    'app.loadUserdata("tf3mp_status_1", "vehicle_discovery_request")',
    '"tf3mp_discover_vehicle"',
    '"tf3mp_get_vehicle_discovery"',
    'app.saveUserdata("tf3mp_status_1", "vehicle_discovery_receipt", result)',
  ])assert.ok(panel.includes(marker),marker);
});
