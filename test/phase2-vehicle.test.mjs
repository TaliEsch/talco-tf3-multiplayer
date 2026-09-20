import test from 'node:test';
import assert from 'node:assert/strict';
import {vehicleRequest,serializeVehicleRequest,parseVehicleReceipt} from '../src/phase2-vehicle.mjs';

const options={nonce:'a'.repeat(32),requestId:1,sample:{companyEntity:10,tickCount:100,speedup:0},
  targetCompany:20,depotEntity:30,model:'base::/vehicle/truck/test.mdl',confirmed:true};
const request=vehicleRequest(options);
const lua=value=>`function data() return { ${Object.entries(value).map(([key,item])=>`${key}=${JSON.stringify(item)},`).join(' ')} } end`;
const receipt={schemaVersion:1,kind:'phase2_vehicle_receipt',nonce:request.nonce,requestId:1,companyEntity:10,targetCompany:20,
  depotEntity:30,model:request.model,tickCount:101,updateCount:80,outcome:'verified',code:'NATIVE_VEHICLE_ACCOUNTING_VERIFIED',
  vehicleEntity:40,vehicleOwner:20,depotOwner:20,chargedCost:100,
  originalBefore:5000,originalBeforeNegative:0,originalAfter:5000,originalAfterNegative:0,
  targetBefore:1000,targetBeforeNegative:0,targetAfter:900,targetAfterNegative:0};

test('vehicle request is held, consented, bounded, and serializes exactly',()=>{
  assert.match(serializeVehicleRequest(request),/model = "base::\/vehicle\/truck\/test.mdl"/);
  for(const change of [{confirmed:false},{targetCompany:10},{sample:{...options.sample,speedup:1}},
    {depotEntity:0},{model:'base::/vehicle/test.lua'},{model:'"; os.execute(1)'}])
    assert.throws(()=>vehicleRequest({...options,...change}));
  assert.throws(()=>serializeVehicleRequest({...request,expiresTick:999}));
  assert.throws(()=>serializeVehicleRequest({...request,extra:1}));
});

test('vehicle receipt requires the adapter success code, ownership, and exact debit',()=>{
  assert.equal(parseVehicleReceipt(lua(receipt),request).outcome,'verified');
  for(const change of [{nonce:'b'.repeat(32)},{code:'NATIVE_REJECTED_OUTCOME_UNKNOWN'},{vehicleOwner:10},
    {depotOwner:10},{vehicleEntity:30},{chargedCost:99},{originalAfter:4999},{targetAfter:901},
    {tickCount:401},{updateCount:2147483648},{vehicleEntity:2147483648},
    {targetBefore:-1000},{targetAfterNegative:1},{extra:1}])assert.throws(()=>parseVehicleReceipt(lua({...receipt,...change}),request));
  assert.throws(()=>parseVehicleReceipt(lua(receipt)+'; evil()',request));
  assert.throws(()=>parseVehicleReceipt(lua(receipt).replace('model=', 'model="duplicate.mdl",model='),request));
});

test('rejected and unknown vehicle outcomes never verify',()=>{
  for(const outcome of ['rejected','unknown']){
    const parsed=parseVehicleReceipt(lua({...receipt,outcome,code:'ENGINE_OUTCOME_UNKNOWN',vehicleEntity:0,chargedCost:0}),request);
    assert.equal(parsed.outcome,outcome);
  }
});
