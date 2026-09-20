import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {depotRequest,parseDepotReceipt,serializeDepotRequest} from '../src/phase2-depot.mjs';
import {startGameBridge} from '../src/game-bridge.mjs';
const placement={resource:'base::/construction/road/road_depot/road_depot.con',x:-1.25,y:2.5,z:8,yaw:-Math.PI/2,seed:1};
const options={nonce:'a'.repeat(32),requestId:1,sample:{companyEntity:10,tickCount:100,speedup:0},targetCompany:20,placement,confirmed:true};
const request=depotRequest(options);
const lua=p=>`function data() return { ${Object.entries(p).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join(' ')} } end`;
const receipt={schemaVersion:1,kind:'phase2_depot_receipt',nonce:request.nonce,requestId:1,companyEntity:10,targetCompany:20,tickCount:101,updateCount:80,
  outcome:'verified',code:'NATIVE_BUILD_ACCOUNTING_VERIFIED',resource:placement.resource,constructionEntity:30,depotEntity:31,constructionOwner:20,depotOwner:20,
  constructionMembershipPreserved:1,depotMembershipPreserved:1,chargedCost:100,
  originalBefore:5000,originalBeforeNegative:0,originalAfter:5000,originalAfterNegative:0,
  targetBefore:1000,targetBeforeNegative:0,targetAfter:900,targetAfterNegative:0};
test('depot request encodes bounded placement without widening general IPC',()=>{
  assert.match(serializeDepotRequest(request),/x = -1.25/);
  for(const change of [{confirmed:false},{targetCompany:10},{sample:{...options.sample,speedup:1}},
    {placement:{...placement,x:NaN}},{placement:{...placement,resource:'"; os.execute("x")'}},
    {placement:{...placement,balance:1000}},{placement:{...placement,seed:0}}])assert.throws(()=>depotRequest({...options,...change}));
  assert.throws(()=>serializeDepotRequest({...request,expiresTick:999}));
  assert.throws(()=>serializeDepotRequest({...request,extra:1}));
});
test('depot receipt checks correlated ownership and exact isolated debit',()=>{
  assert.equal(parseDepotReceipt(lua(receipt),request).outcome,'verified');
  for(const change of [{nonce:'b'.repeat(32)},{constructionOwner:10},{depotEntity:30},{chargedCost:101},
    {originalAfter:4900},{constructionMembershipPreserved:0},{tickCount:401},{targetAfterNegative:1},{extra:1}])
    assert.throws(()=>parseDepotReceipt(lua({...receipt,...change}),request));
  assert.throws(()=>parseDepotReceipt(lua(receipt)+'; evil()',request));
  assert.throws(()=>parseDepotReceipt(lua(receipt).replace('resource=', 'resource="duplicate",resource='),request));
  assert.equal(parseDepotReceipt(lua({...receipt,outcome:'unknown',code:'NATIVE_REJECTION_REASON_UNVERIFIED'}),request).outcome,'unknown');
});
async function until(predicate){for(let i=0;i<200;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,5));}assert.fail('depot bridge timed out');}
for(const mode of ['verified','timeout','close'])test(`depot helper mailbox: ${mode}`,async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-depot-'));
  const directory=path.join(root,'tf3mp_status_1'),events=[];
  const bridge=await startGameBridge({directory,intervalMs:5,companyTimeoutMs:mode==='timeout'?80:1000,logger:e=>events.push(e)});
  try{
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80,
      speedup:0,companyEntity:10,balance:5000,balanceKnown:1,balanceNegative:0}));
    await until(()=>bridge.engineObservation.available);
    await assert.rejects(bridge.requestPhase2Depot({targetCompany:20,placement,confirmed:false}),/EXPLICIT/);
    await bridge.requestPhase2Depot({targetCompany:20,placement,confirmed:true});
    assert.match(await readFile(path.join(directory,'phase2_depot_request.lua'),'utf8'),/x = -1.25/);
    await assert.rejects(bridge.requestPhase2Depot({targetCompany:20,placement,confirmed:true}),/FRESH_SOLO_HOST_REQUIRED/);
    if(mode==='verified')await writeFile(path.join(directory,'phase2_depot_receipt.lua'),lua({...receipt,nonce:bridge.nonce}));
    if(mode==='close')await bridge.close();
    await until(()=>events.some(e=>e.event==='phase2_depot_result'));
    assert.equal(events.find(e=>e.event==='phase2_depot_result').outcome,mode==='verified'?'verified':'unknown');
    await assert.rejects(readFile(path.join(directory,'phase2_depot_request.lua')),{code:'ENOENT'});
    if(mode==='timeout'){
      await writeFile(path.join(directory,'phase2_depot_receipt.lua'),lua({...receipt,nonce:bridge.nonce}));
      await new Promise(r=>setTimeout(r,25));
      assert.equal(events.filter(e=>e.event==='phase2_depot_result').length,1);
    }
  }finally{await bridge.close();await rm(root,{recursive:true,force:true});}
});
