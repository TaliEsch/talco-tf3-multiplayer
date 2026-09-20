import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startGameBridge} from '../src/game-bridge.mjs';
import {fundingRequest,parseFundingReceipt} from '../src/phase2-funding.mjs';
const options={nonce:'a'.repeat(32),requestId:1,sample:{companyEntity:10,tickCount:100,speedup:0},targetCompany:20,amount:100000,confirmed:true};
const lua=p=>'function data() return { '+Object.entries(p).map(([k,v])=>`${k} = ${JSON.stringify(v)},`).join(' ')+' } end';
const request=fundingRequest(options);
const receipt={schemaVersion:1,kind:'phase2_funding_receipt',nonce:request.nonce,requestId:1,
  companyEntity:10,targetCompany:20,amount:100000,tickCount:101,updateCount:80,outcome:'funded',
  originalBefore:5000,originalBeforeNegative:0,originalAfter:5000,originalAfterNegative:0,
  targetBefore:0,targetBeforeNegative:0,targetAfter:100000,targetAfterNegative:0};

for(const mode of ['funded','rejected','outcome_unknown','changed_company','changed_update'])
test(`funding-to-construction continuation is receipt-bound: ${mode}`,async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-phase2-sequence-'));
  const directory=path.join(root,'tf3mp_status_1'),events=[];
  const bridge=await startGameBridge({directory,intervalMs:5,companyTimeoutMs:1000,logger:e=>events.push(e)});
  const placement={resource:'base::/construction/road/road_depot/road_depot.con',x:1,y:2,z:3,yaw:0,seed:1};
  try {
    const observation={schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,counter:1,
      tickCount:100,updateCount:80,speedup:0,companyEntity:10,balance:5000,balanceKnown:1,balanceNegative:0};
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua(observation));
    await until(()=>bridge.engineObservation.available);
    await bridge.requestPhase2Funding({targetCompany:20,amount:100000,confirmed:true});
    await assert.rejects(bridge.requestPhase2Depot({targetCompany:20,placement,confirmed:true}),/FRESH_SOLO/);
    await writeFile(path.join(directory,'phase2_funding_receipt.lua'),lua({...receipt,nonce:bridge.nonce,
      outcome:['rejected','outcome_unknown'].includes(mode)?mode:'funded'}));
    await until(()=>events.some(e=>e.event==='phase2_funding_result'));
    if(mode==='changed_update') {
      await writeFile(path.join(directory,'engine_observation.lua'),lua({...observation,counter:2,tickCount:102,updateCount:81}));
      await until(()=>bridge.engineObservation.sample?.updateCount===81);
    }
    const next={targetCompany:mode==='changed_company'?21:20,placement,confirmed:true};
    if(mode==='funded') {
      await assert.rejects(bridge.requestPhase2Depot({...next,confirmed:false}),/EXPLICIT/);
      await bridge.requestPhase2Depot(next);
      assert.match(await readFile(path.join(directory,'phase2_depot_request.lua'),'utf8'),/requestId = 2/);
      await assert.rejects(bridge.requestPhase2Depot(next),/FRESH_SOLO/);
    } else {
      await assert.rejects(bridge.requestPhase2Depot(next),/FRESH_SOLO/);
      await assert.rejects(readFile(path.join(directory,'phase2_depot_request.lua')),{code:'ENOENT'});
    }
  } finally {await bridge.close();await rm(root,{recursive:true,force:true});}
});
test('funding requires bounded explicit consent and a held distinct company context',()=>{
  assert.equal(request.expiresTick,400);
  for(const changes of [{confirmed:false},{confirmed:1},{amount:0},{amount:1000001},{amount:1.1},
    {targetCompany:10},{targetCompany:-1},{nonce:'bad'},{requestId:0},
    {sample:{...options.sample,speedup:1}},{sample:{...options.sample,tickCount:2147483647}}])
    assert.throws(()=>fundingRequest({...options,...changes}));
});
test('funding receipt proves the requested isolated credit, not just native success',()=>{
  assert.equal(parseFundingReceipt(lua(receipt),request).balances.targetAfter,100000);
  for(const changes of [{nonce:'b'.repeat(32)},{requestId:2},{targetCompany:30},{companyEntity:11},
    {amount:99999},{originalAfter:5001},{targetAfter:99999},{tickCount:99},{tickCount:401},
    {targetBeforeNegative:1},{targetAfterNegative:2},{extra:1},{outcome:'passed'}])
    assert.throws(()=>parseFundingReceipt(lua({...receipt,...changes}),request));
  for(const outcome of ['rejected','already_attempted','outcome_unknown'])
    assert.equal(parseFundingReceipt(lua({...receipt,outcome}),request).outcome,outcome);
});
test('funding engine event persists before send and binds the recorded test company',async()=>{
  const source=await readFile(new URL('../mod/content/tf3mp_status.script.tl',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('local function phase2FundingEvent'),source.indexOf('local ret : GameScriptWithGui'));
  assert.ok(fn.indexOf('current.phase2FundingAttempted = true')<fn.indexOf('state:set(current)'));
  assert.ok(fn.indexOf('state:set(current)')<fn.indexOf('api.cmd.sendCommand'));
  for(const marker of ['request.confirmed ~= 1','request.amount > 1000000',
    'current.phase2CompanyFault == true','current.phase2CompanyFault = true',
    'current.phase2CompanyFault = receipt.outcome ~= "funded"',
    'created.newCompanyEntity ~= request.targetCompany','speed.speedup ~= 0',
    'originalAfter == originalBefore','targetAfter == targetBefore + request.amount',
    'if not callbackOpen or callbackSeen','callbackOpen = false'])assert.ok(fn.includes(marker),marker);
  assert.doesNotMatch(fn,/phase2FundingAttempted\s*=\s*false/);
});
test('funding IPC is consumed before dispatch and returns a correlated receipt',async()=>{
  const source=await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('local function exchangePhase2Funding'),source.indexOf('local function exchangeCompanyProbe'));
  assert.ok(fn.indexOf('phase2FundingSent = request.requestId')<fn.indexOf('api.cmd.sendCommand'));
  assert.ok(fn.includes('receipt.nonce ~= bridgeNonce or receipt.requestId ~= phase2FundingSent'));
});

async function until(predicate){
  for(let i=0;i<200;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,5));}
  assert.fail('funding bridge condition timed out');
}
for(const mode of ['funded','timeout','close'])test(`funding crosses the helper mailbox safely: ${mode}`,async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-funding-'));
  const directory=path.join(root,'tf3mp_status_1'),events=[];
  const bridge=await startGameBridge({directory,intervalMs:5,companyTimeoutMs:mode==='timeout'?80:1000,logger:e=>events.push(e)});
  try{
    await assert.rejects(bridge.requestPhase2Funding({targetCompany:20,amount:100000,confirmed:true}),/OBSERVATION_REQUIRED/);
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,kind:'engine_observation',nonce:bridge.nonce,counter:1,
      tickCount:100,updateCount:80,speedup:0,companyEntity:10,balance:5000,balanceKnown:1,balanceNegative:0}));
    await until(()=>bridge.engineObservation.available);
    await assert.rejects(bridge.requestPhase2Funding({targetCompany:20,amount:100000,confirmed:false}),/EXPLICIT/);
    await bridge.requestPhase2Funding({targetCompany:20,amount:100000,confirmed:true});
    assert.match(await readFile(path.join(directory,'phase2_funding_request.lua'),'utf8'),/amount = 100000/);
    await assert.rejects(bridge.requestPhase2Funding({targetCompany:20,amount:100000,confirmed:true}),/FRESH_SOLO_HOST_REQUIRED/);
    if(mode==='funded'){
      await writeFile(path.join(directory,'phase2_funding_receipt.lua'),lua({...receipt,nonce:'b'.repeat(32)}));
      await new Promise(r=>setTimeout(r,25));
      assert.equal(events.some(e=>e.event==='phase2_funding_result'),false);
      await writeFile(path.join(directory,'phase2_funding_receipt.lua'),lua({...receipt,nonce:bridge.nonce}));
    }
    if(mode==='close')await bridge.close();
    await until(()=>events.some(e=>e.event==='phase2_funding_result'));
    assert.equal(events.find(e=>e.event==='phase2_funding_result').code,mode==='funded'?'funded':'OUTCOME_UNKNOWN_DO_NOT_RETRY');
    await assert.rejects(readFile(path.join(directory,'phase2_funding_request.lua')),{code:'ENOENT'});
    if(mode!=='close'){
      await writeFile(path.join(directory,'phase2_funding_receipt.lua'),lua({...receipt,nonce:bridge.nonce}));
      await new Promise(r=>setTimeout(r,25));
      assert.equal(events.filter(e=>e.event==='phase2_funding_result').length,1);
      await assert.rejects(bridge.requestPhase2Funding({targetCompany:20,amount:100000,confirmed:true}),/FRESH_SOLO_HOST_REQUIRED/);
    }
  }finally{await bridge.close();await rm(root,{recursive:true,force:true});}
});
