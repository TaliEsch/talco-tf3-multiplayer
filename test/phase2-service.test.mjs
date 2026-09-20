import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {serviceRequest,serializeServiceRequest,parseServiceReceipt} from '../src/phase2-service.mjs';

const options={nonce:'a'.repeat(32),requestId:1,sample:{companyEntity:10,tickCount:100,speedup:0},targetCompany:20,depotEntity:30,vehicleEntity:40,stationA:50,stationB:60,confirmed:true};
const request=serviceRequest(options);
const lua=value=>`function data() return { ${Object.entries(value).map(([key,item])=>`${key}=${JSON.stringify(item)},`).join(' ')} } end`;
const receipt={schemaVersion:1,kind:'phase2_service_receipt',nonce:request.nonce,requestId:request.requestId,companyEntity:10,targetCompany:20,depotEntity:30,vehicleEntity:40,stationA:50,stationB:60,tickCount:101,updateCount:80,outcome:'verified',code:'NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED',lineEntity:70,lineOwner:20,vehicleOwner:20,stationAOwner:20,stationBOwner:20};

test('service request is held, consented, distinct, and serializes exactly',()=>{
  assert.match(serializeServiceRequest(request),/kind = "phase2_service"/);
  assert.equal(Object.keys(request).length,13);
  for(const change of [{confirmed:false},{targetCompany:10},{vehicleEntity:30},{stationA:60},{sample:{...options.sample,speedup:1}}])assert.throws(()=>serviceRequest({...options,...change}));
  assert.throws(()=>serializeServiceRequest({...request,expiresTick:999}));
  assert.throws(()=>serializeServiceRequest({...request,extra:1}));
});

test('verified service receipt requires exact correlation, owners, separate entities, TTL, and code',()=>{
  assert.equal(parseServiceReceipt(lua(receipt),request).outcome,'verified');
  for(const change of [{nonce:'b'.repeat(32)},{code:'ENGINE_OUTCOME_UNKNOWN'},{lineOwner:10},{vehicleOwner:10},{stationAOwner:10},{stationBOwner:10},{lineEntity:60},{tickCount:401},{extra:1}])assert.throws(()=>parseServiceReceipt(lua({...receipt,...change}),request));
  assert.throws(()=>parseServiceReceipt(lua(receipt)+'; evil()',request));
});

test('unknown and rejected service receipts cannot verify',()=>{
  for(const outcome of ['unknown','rejected'])assert.equal(parseServiceReceipt(lua({...receipt,outcome,code:'ENGINE_OUTCOME_UNKNOWN',lineEntity:0,lineOwner:0,vehicleOwner:0,stationAOwner:0,stationBOwner:0}),request).outcome,outcome);
});

test('service adapter retains its persistent company fault for every unknown result',async()=>{
  const source=await readFile(new URL('../mod/content/tf3mp_service_command.lua',import.meta.url),'utf8');
  assert.match(source,/if not ok then\s+receipt\.outcome = "unknown"\s+receipt\.code = "STATE_PERSIST_FAILED"\s+receipt\.persistFailed = true\s+current\.phase2CompanyFault = true[\s\S]*?pcall\(function\(\) state:set\(current\) end\)/);
  assert.match(source,/if receipt\.outcome ~= "verified" then current\.phase2CompanyFault = true end/);
  assert.match(source,/saved\.phase2CompanyFault = false\s+if not save\(state, saved, receipt\) then saved\.phase2CompanyFault = true end/);
});
