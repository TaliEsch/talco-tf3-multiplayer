import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {stationTemplateRequest,parseStationTemplateReceipt} from '../src/station-template-probe.mjs';
import {startGameBridge} from '../src/game-bridge.mjs';
const lua=v=>`function data() return {${Object.entries(v).map(([k,x])=>`${k}=${JSON.stringify(x)},`).join('')}} end`;
const request=stationTemplateRequest('a'.repeat(32),1,100);
const result={schemaVersion:1,kind:'station_template_receipt',nonce:request.nonce,requestId:1,tickCount:101,updateCount:80,
  code:'TEMPLATE_EVALUATED',paramsPresent:1,modulesPresent:1,moduleCount:4,subconstructionCount:2,costKnown:1,cost:100,templateIndex:0,platforms:1};
test('station probe rejects uncorrelated and unbounded evidence',()=>{
  assert.equal(parseStationTemplateReceipt(lua(result),request).moduleCount,4);
  for(const delta of [{nonce:'b'.repeat(32)},{requestId:2},{moduleCount:257},{cost:-1},{code:'BUILT'},{extra:1},
    {tickCount:401},{costKnown:0},{modulesPresent:0}])assert.throws(()=>parseStationTemplateReceipt(lua({...result,...delta}),request));
  assert.throws(()=>stationTemplateRequest('x',1,100));
  assert.throws(()=>stationTemplateRequest(request.nonce,0,100));
});
async function until(fn){for(let i=0;i<300;i++){if(await fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('probe timed out');}
test('station probe preserves fixed failure stages without accepting arbitrary errors',()=>{
  for(const code of ['RESOURCE_LOOKUP_FAILED','PARAMETER_METADATA_FAILED','GLOBAL_PARAMETERS_FAILED',
    'TEMPLATE_EVALUATION_FAILED','RESULT_INSPECTION_FAILED']) {
    assert.equal(parseStationTemplateReceipt(lua({...result,code}),request).code,code);
  }
  assert.throws(()=>parseStationTemplateReceipt(lua({...result,code:'raw exception text'}),request));
});
for(const mode of ['result','timeout','close'])test(`station probe actual mailbox ${mode}`,async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-station-')),directory=path.join(root,'tf3mp_status_1'),events=[];
  const bridge=await startGameBridge({directory,intervalMs:5,companyTimeoutMs:mode==='timeout'?100:1500,logger:e=>events.push(e)});
  try{
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80,speedup:1,companyEntity:10,balanceKnown:1,balance:5000,balanceNegative:0}));
    await until(()=>bridge.engineObservation.available);
    await bridge.requestStationTemplateProbe();
    await assert.rejects(bridge.requestStationTemplateProbe(),/FRESH_SOLO/);
    if(mode==='result')await writeFile(path.join(directory,'station_template_receipt.lua'),lua({...result,nonce:bridge.nonce}));
    if(mode==='close')await bridge.close();
    await until(()=>events.some(e=>e.event==='station_template_result'));
    assert.equal(events.find(e=>e.event==='station_template_result').code,mode==='result'?'TEMPLATE_EVALUATED':'PROBE_UNAVAILABLE_NO_RETRY');
    assert.equal(events.find(e=>e.event==='station_template_result').nonce,undefined);
    await assert.rejects(readFile(path.join(directory,'station_template_request.lua')),{code:'ENOENT'});
    await writeFile(path.join(directory,'station_template_receipt.lua'),lua({...result,nonce:bridge.nonce}));
    await new Promise(r=>setTimeout(r,25));
    assert.equal(events.filter(e=>e.event==='station_template_result').length,1);
  }finally{await bridge.close();await rm(root,{recursive:true,force:true});}
});
