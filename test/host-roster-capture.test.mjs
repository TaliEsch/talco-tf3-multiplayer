import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostRosterCapture} from '../src/host-roster-capture.mjs';

function fixture(claimed=[8,9,10]){
  const players=['host','a','b','c'].map(playerId=>({playerId,companyEntity:null}));
  const bound=[];let captureCount=0;
  const host={authority:{players:()=>players,bindCompanyEntity:(id,company)=>{
    bound.push([id,company]);players.find(player=>player.playerId===id).companyEntity=company;
  }},companyClaims:()=>claimed.map((companyEntity,index)=>({playerId:['a','b','c'][index],companyEntity})),
  ensureCaptureReady(){},beginCapture(){captureCount++;}};
  const bridge={connected:true,engineObservation:{available:true,sample:{speedup:0,companyEntity:7,updateCount:50}},
    async discoverHostCompanyRoster(companies){return {outcome:'verified',companies,
      hostCompanyEntity:7,updateCount:50};}};
  const capture=createHostRosterCapture({host,bridge,nativeGate:{ready:true},hostLocal:{connection:{playerId:'host'}}});
  return {host,bridge,capture,bound,get captureCount(){return captureCount;}};
}

test('four authenticated distinct claims bind only after exact Host engine roster proof',async()=>{
  const f=fixture();
  const result=await f.capture.start();
  assert.deepEqual(result.players.map(player=>player.companyEntity),[7,8,9,10]);
  assert.deepEqual(f.bound,[['host',7],['a',8],['b',9],['c',10]]);
  assert.equal(f.captureCount,1);
  await assert.rejects(f.capture.start(),/ALREADY_ATTEMPTED/);
});

test('changed claim during engine inspection cannot bind a company',async()=>{
  const f=fixture();
  f.bridge.discoverHostCompanyRoster=async companies=>{
    f.host.companyClaims=()=>[{playerId:'a',companyEntity:8},{playerId:'b',companyEntity:19},
      {playerId:'c',companyEntity:10}];
    return {outcome:'verified',companies,hostCompanyEntity:7,updateCount:50};
  };
  await assert.rejects(f.capture.start(),/PROOF_LOST/);
  assert.deepEqual(f.bound,[]);
  assert.equal(f.captureCount,0);
});

test('duplicate company claims cannot enter engine inspection',async()=>{
  const f=fixture([8,8,10]);
  await assert.rejects(f.capture.start(),/INVALID_COMPANY_ROSTER/);
  assert.deepEqual(f.bound,[]);
});
