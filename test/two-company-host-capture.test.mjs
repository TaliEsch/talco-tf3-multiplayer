import test from 'node:test';
import assert from 'node:assert/strict';
import {createTwoCompanyHostCapture} from '../src/two-company-host-capture.mjs';

test('changed engine company after inspection cannot bind either player or begin capture',async()=>{
  const players=[{playerId:'host',companyEntity:null},{playerId:'remote',companyEntity:null}];
  const bound=[];
  const host={authority:{players:()=>players,bindCompanyEntity:(id,company)=>bound.push([id,company])},
    companyClaims:()=>[{playerId:'remote',companyEntity:8}],
    ensureCaptureReady(){},beginCapture(){assert.fail('capture must stay closed');}};
  const bridge={connected:true,engineObservation:{available:true,sample:{speedup:0,companyEntity:7,updateCount:50}},
    async discoverHostCompanyPair(){this.engineObservation={available:true,sample:{speedup:0,companyEntity:9,updateCount:50}};
      return {hostCompanyEntity:7,secondCompanyEntity:8,updateCount:50};}};
  const capture=createTwoCompanyHostCapture({host,bridge,nativeGate:{ready:true},hostLocal:{connection:{playerId:'host'}}});
  await assert.rejects(capture.start(),/TWO_COMPANY_CAPTURE_PROOF_LOST/);
  assert.deepEqual(bound,[]);
  await assert.rejects(capture.start(),/TWO_COMPANY_CAPTURE_ALREADY_ATTEMPTED/);
});

test('a remote claim for another company never binds or starts capture',async()=>{
  const players=[{playerId:'host',companyEntity:null},{playerId:'remote',companyEntity:null}];
  const bound=[];
  const host={authority:{players:()=>players,bindCompanyEntity:(id,company)=>bound.push([id,company])},
    companyClaims:()=>[{playerId:'remote',companyEntity:99}],ensureCaptureReady(){},
    beginCapture(){assert.fail('mismatched claim cannot capture');}};
  const bridge={connected:true,engineObservation:{available:true,sample:{speedup:0,companyEntity:7,updateCount:50}},
    async discoverHostCompanyPair(){return {hostCompanyEntity:7,secondCompanyEntity:8,updateCount:50};}};
  const capture=createTwoCompanyHostCapture({host,bridge,nativeGate:{ready:true},hostLocal:{connection:{playerId:'host'}}});
  await assert.rejects(capture.start(),/TWO_COMPANY_CAPTURE_PROOF_LOST/);
  assert.deepEqual(bound,[]);
});
