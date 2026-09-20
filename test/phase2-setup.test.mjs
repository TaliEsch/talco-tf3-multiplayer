import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';
import {phase2LocalPlanHash} from '../src/phase2-local-run.mjs';
import {parsePhase2SetupPlan,serializePhase2SetupConfig} from '../src/phase2-setup.mjs';

const nonce='a'.repeat(32), checkpointHash='b'.repeat(64);
const fields={schemaVersion:1,kind:'phase2_plan',nonce,revision:1,originalCompany:10,targetCompany:20,fundingAmount:1000000,
  model:'base::/vehicle/bus/test.mdl',depotResource:'base::/construction/road/road_depot/road_depot.con',depotX:-1.25,depotY:2,depotZ:3,depotYaw:0,depotSeed:1,
  stationAResource:'base::/construction/street/modular_street_station/modular_terminal.con',stationAX:4,stationAY:5,stationAZ:6,stationAYaw:0,stationASeed:2,
  stationBResource:'base::/construction/street/modular_street_station/modular_terminal.con',stationBX:7,stationBY:5,stationBZ:6,stationBYaw:0,stationBSeed:3};
const lua=value=>`function data() return { ${Object.entries(value).map(([key,item])=>`${key} = ${JSON.stringify(item)},`).join(' ')} } end`;
const options={nonce,originalCompany:10,targetCompany:20,checkpointHash};

test('phase 2 setup plan has an exact bounded schema and canonical local-run hash',()=>{
  const result=parsePhase2SetupPlan(lua(fields),options);
  assert.equal(Object.keys(fields).length,26);assert.equal(result.revision,1);
  assert.equal(result.planHash,phase2LocalPlanHash(result.plan));
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.plan)&&Object.isFrozen(result.plan.depot));
  assert.equal(result.plan.checkpointHash,checkpointHash);
});

test('phase 2 setup rejects altered fields, paths, identity, values, and executable Lua',()=>{
  const bad=[
    {schemaVersion:2},{kind:'other'},{nonce:'c'.repeat(32)},{revision:2},{originalCompany:11},{targetCompany:21},{fundingAmount:1},{fundingAmount:999999},{fundingAmount:1000001},
    {model:'base::/vehicle/train/test.mdl'},{model:'base::/vehicle/bus/../test.mdl'},{depotResource:'base::/construction/road/no.con'},
    {stationAResource:'base::/construction/street/no.con'},{depotX:100001},{depotZ:10001},{depotYaw:4},{depotSeed:0},{stationASeed:0},
    {stationBX:4,stationBY:5,stationBZ:6},{originalCompany:20}
  ];
  for(const change of bad)assert.throws(()=>parsePhase2SetupPlan(lua({...fields,...change}),options),/INVALID/);
  assert.throws(()=>parsePhase2SetupPlan(lua(fields)+'; evil()',options),/INVALID/);
  assert.throws(()=>parsePhase2SetupPlan(lua(fields).replace('model =','model = "base::/vehicle/bus/other.mdl", model ='),options),/INVALID/);
  assert.throws(()=>parsePhase2SetupPlan(lua(fields)+' '.repeat(8193),options),/INVALID/);
  for(const changed of [{nonce:'A'.repeat(32)},{originalCompany:0},{targetCompany:10},{checkpointHash:'z'.repeat(64)}])
    assert.throws(()=>parsePhase2SetupPlan(lua(fields),{...options,...changed}),/INVALID/);
});

test('setup config is fixed-schema and parseable without plan paths',()=>{
  for(const status of ['selecting','ready','running','complete','failed']){
    const source=serializePhase2SetupConfig({schemaVersion:1,kind:'phase2_setup',nonce,originalCompany:10,targetCompany:20,status});
    assert.equal(parseFlatDataFile(source).status,status);
  }
  assert.throws(()=>serializePhase2SetupConfig({schemaVersion:1,kind:'phase2_setup',nonce,originalCompany:10,targetCompany:20,status:'other'}));
  assert.throws(()=>serializePhase2SetupConfig({schemaVersion:1,kind:'phase2_setup',nonce,originalCompany:10,targetCompany:20,status:'ready',extra:1}));
});
