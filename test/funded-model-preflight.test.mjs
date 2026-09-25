import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fengari from 'fengari';
import {startGameBridge,parseFundedModelPreflightReceipt} from '../src/game-bridge.mjs';
import {ROAD_DEPOT_RESOURCE} from '../src/depot-build-order-payload.mjs';

const lua=v=>`function data() return {${Object.entries(v).map(([k,x])=>`${k}=${JSON.stringify(x)},`).join('')}} end`;
const model='::/vehicle/bus/test.mdl';
const request={nonce:'a'.repeat(32),requestId:1,companyEntity:10,targetCompany:20,
  issuedUpdate:80,model,fundingAmount:1000000};
const receipt={schemaVersion:1,kind:'funded_model_preflight_receipt',...request,
  depotExact:1,modelExact:1,road:1,yearKnown:0,available:0,priceKnown:1,price:200000,
  depotCostKnown:0,depotCost:0,code:'UNKNOWN'};

test('preflight receipt is exact and cannot promote an unknown year or price',()=>{
  assert.equal(parseFundedModelPreflightReceipt(lua(receipt),request).price,200000);
  for(const change of [{nonce:'b'.repeat(32)},{requestId:2},{model:'::/vehicle/bus/other.mdl'},
    {targetCompany:21},{issuedUpdate:81},{code:'READY'},
    {yearKnown:1,available:1,depotCostKnown:1,depotCost:900000,code:'READY'},
    {priceKnown:0},{extra:1}])
    assert.throws(()=>parseFundedModelPreflightReceipt(lua({...receipt,...change}),request));
  assert.equal(parseFundedModelPreflightReceipt(lua({...receipt,yearKnown:1,available:1,
    code:'READY'}),request).code,'READY');
});

test('Lua inspection reads exact ROAD model and price; exact placement cost stays unknown',async()=>{
  const source=await readFile(new URL('../mod/content/tf3mp_funded_model_preflight.lua',import.meta.url),'utf8');
  assert.doesNotMatch(source,/sendCommand|makeWorldBuildProposalCmd|makeVehicleBuyCmd|saveUserdata/);
  const script=`local probe=(function() ${source} end)()
local request={nonce='${request.nonce}',requestId=1,companyEntity=10,targetCompany=20,
  issuedUpdate=80,model='${model}',fundingAmount=1000000}
local api={type={['enum']={Carrier={ROAD=2}}},
  res={constructionRep={find=function()return 4 end,
    getName=function()return'${ROAD_DEPOT_RESOURCE}'end},
    modelRep={find=function()return 5 end,getName=function()return'${model}'end,
      get=function()return{metadata={transportVehicle={carrier=2},
        cost={price=200000},availability={yearFrom=1920,yearTo=2000}}}end}},
  engine={util={getYear=function()return 1950 end}}}
local r=probe.inspect(request,api)
return r.depotExact,r.modelExact,r.road,r.yearKnown,r.available,r.priceKnown,
  r.price,r.depotCostKnown,r.code`;
  const {lua,lauxlib,lualib,to_luastring}=fengari;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,9,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.deepEqual(Array.from({length:8},(_,i)=>lua.lua_tonumber(L,i-9)),[1,1,1,1,1,1,200000,0]);
    assert.equal(lua.lua_tojsstring(L,-1),'READY');
  }finally{lua.lua_close(L);}
});

test('held bridge preflight returns unknown without publishing funding',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-funded-preflight-'));
  const directory=path.join(root,'tf3mp_status_1');
  const bridge=await startGameBridge({directory,intervalMs:5,companyTimeoutMs:1000});
  try{
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',
      nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,
      kind:'engine_observation',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80,
      speedup:0,companyEntity:10,balanceKnown:1,balance:1000,balanceNegative:0}));
    for(let n=0;n<100&&!bridge.engineObservation.available;n++)await new Promise(r=>setTimeout(r,5));
    const result=bridge.preflightFundedDepotVehicle({targetCompany:20,model,fundingAmount:1000000,
      placement:{resource:ROAD_DEPOT_RESOURCE}});
    for(let n=0;n<100;n++){
      try{await readFile(path.join(directory,'funded_model_preflight_request.lua'));break;}
      catch{await new Promise(r=>setTimeout(r,5));}
    }
    await writeFile(path.join(directory,'funded_model_preflight_receipt.lua'),
      lua({...receipt,nonce:bridge.nonce}));
    await assert.rejects(result,/FUNDED_MODEL_PREFLIGHT_UNKNOWN/);
    await assert.rejects(bridge.preflightFundedDepotVehicle({targetCompany:20,model,
      fundingAmount:1000000,placement:{resource:ROAD_DEPOT_RESOURCE}}),
      /FUNDED_MODEL_PREFLIGHT_UNKNOWN/);
    await assert.rejects(readFile(path.join(directory,'phase2_funding_request.lua')),{code:'ENOENT'});
    await assert.rejects(readFile(path.join(directory,'funded_model_preflight_request.lua')),{code:'ENOENT'});
  }finally{await bridge.close();await rm(root,{recursive:true,force:true});}
});

test('held bridge accepts a correlated ROAD model quote with known year and price',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-funded-ready-'));
  const directory=path.join(root,'tf3mp_status_1');
  const bridge=await startGameBridge({directory,intervalMs:5,companyTimeoutMs:1000});
  try{
    await writeFile(path.join(directory,'telemetry.lua'),lua({schemaVersion:1,kind:'telemetry',
      nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80}));
    await writeFile(path.join(directory,'engine_observation.lua'),lua({schemaVersion:1,
      kind:'engine_observation',nonce:bridge.nonce,counter:1,tickCount:100,updateCount:80,
      speedup:0,companyEntity:10,balanceKnown:1,balance:1000,balanceNegative:0}));
    for(let n=0;n<100&&!bridge.engineObservation.available;n++)await new Promise(r=>setTimeout(r,5));
    const result=bridge.preflightFundedDepotVehicle({targetCompany:20,model,fundingAmount:1000000,
      placement:{resource:ROAD_DEPOT_RESOURCE}});
    for(let n=0;n<100;n++){
      try{await readFile(path.join(directory,'funded_model_preflight_request.lua'));break;}
      catch{await new Promise(r=>setTimeout(r,5));}
    }
    await writeFile(path.join(directory,'funded_model_preflight_receipt.lua'),
      lua({...receipt,nonce:bridge.nonce,yearKnown:1,available:1,code:'READY'}));
    assert.equal((await result).code,'READY');
    await assert.rejects(readFile(path.join(directory,'phase2_funding_request.lua')),{code:'ENOENT'});
  }finally{await bridge.close();await rm(root,{recursive:true,force:true});}
});
