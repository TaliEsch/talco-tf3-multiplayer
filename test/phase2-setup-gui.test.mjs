import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Source-level contract: TF3 GUI Lua cannot be executed in Node.
const source=await readFile(new URL('../mod/content/tf3mp_depot_tools.script.lua',import.meta.url),'utf8');

test('Phase 2 setup GUI validates a fresh correlated launcher request',()=>{
  for(const marker of ['"phase2_setup"', 'request.kind~="phase2_setup"',
    'request.schemaVersion~=1', 'request.nonce ~= bridge.nonce', 'request.nonce ~= ack.nonce',
    'bridge.mode ~= "telemetry" and bridge.mode ~= "company_test"', 'ack.counter > state.counter',
    'state.stale > 10', 'selecting', 'ready', 'running', 'complete', 'failed']) assert.ok(source.includes(marker),marker);
});

test('selection is point-only, resolves approved stock resources, and bounds road-bus discovery',()=>{
  for(const marker of ['/road/road_depot/road_depot%.con$',
    '/street/modular_street_station/modular_terminal%.con$', 'api.gui.mouse.getTerrainPosition()',
    'api.res.constructionRep.getAll()', 'api.res.modelRep.getAll()', '/vehicle/bus/',
    'metadata.transportVehicle', 'Carrier.ROAD', 'assert(#models < 256', 'table.sort(models)',
    'Station placement is point selection only']) assert.ok(source.includes(marker),marker);
  assert.doesNotMatch(source,/api\s*\.\s*cmd|makeWorldBuildProposalCmd|ProposalViewer|price/i);
});

test('flat proposal is queued from onclick and written only by regular onStep',()=>{
  for(const marker of ['kind="phase2_plan"', 'revision=1', 'fundingAmount=1000000',
    'depotSeed=1', 'stationASeed=2', 'stationBSeed=3', 'state.pending={',
    'app.saveUserdata("tf3mp_status_1","phase2_plan",plan)',
    'Review and confirm setup in launcher; nothing built yet.']) assert.ok(source.includes(marker),marker);
  const clickRegion=source.slice(source.indexOf('local function submit()'),source.indexOf('local children'));
  assert.doesNotMatch(clickRegion,/saveUserdata/);
  assert.match(source,/react\.onStep\(function\(\)[\s\S]*saveUserdata\("tf3mp_status_1","phase2_plan",plan\)/);
});

test('lifecycle freezes non-selecting setup and does not mutate prior React state',()=>{
  for(const marker of ['config.status~="selecting"', 'state.submitted=true',
    'app.loadUserdata("tf3mp_status_1","phase2_plan")', 'matchesPlan(plan,config)',
    'local function copySetup(old)', 'local next=copySetup(setup:old())',
    'state.pending and config.kind=="phase2_setup" and config.status=="selecting"',
    'state.pending.nonce==config.nonce', 'state.config.status~=config.status']) assert.ok(source.includes(marker),marker);
  assert.doesNotMatch(source,/while #models>256/);
  assert.match(source,/z=plan\.stationBZ,yaw=plan\.stationBYaw/);
  assert.match(source,/type\(value\)~="number" or value~=value or math\.abs\(value\)>bound/);
  assert.match(source,/if count~=26 then return false end/);
});
