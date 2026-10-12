import assert from 'node:assert/strict';
import test from 'node:test';
import {correlateRawServiceInterval,serviceObservationRequest,serializeServiceObservationRequest,
  parseServiceObservationReceipt} from '../src/service-observation.mjs';

const start={nonce:'a'.repeat(32),action:'start',outcome:'raw_start_captured',code:'RAW_START_CAPTURED',
  requestId:8,originalCompany:10,targetCompany:20,vehicleEntity:32,lineEntity:37,
  tickCount:101,updateCount:80,gameTime:100,startGameTime:100,startUpdateCount:80,
  endGameTime:0,endUpdateCount:0,accountNetWindowStart:0,accountNetWindowEnd:100,
  accountNet:-100,intervalNet:0,intervalMaintenanceVehicle:0,
  intervalMaintenanceInfrastructure:0,intervalMaintenanceOther:0,
  intervalMaintenanceVehicleMaintenance:0,startVisitedMask:0,endVisitedMask:0,
  startStopIndex:0,endStopIndex:0};
const end={...start,action:'end',outcome:'raw_end_captured',code:'RAW_END_CAPTURED',
  requestId:9,tickCount:121,updateCount:90,gameTime:200,endGameTime:200,
  endUpdateCount:90,accountNetWindowEnd:200,accountNet:250,intervalNet:300,
  intervalMaintenanceVehicle:-50,endVisitedMask:3,endStopIndex:1};

test('Host and Join transport existing assigned asset observations without granting gameplay authority',()=>{
  for(const selected of [15702,28619]){
    const binding={originalCompany:selected,targetCompany:15702,vehicleEntity:27989,lineEntity:28014};
    const request=serviceObservationRequest({nonce:'a'.repeat(32),requestId:8,action:'start',
      sample:{companyEntity:selected,speedup:0,tickCount:101},binding});
    assert.match(serializeServiceObservationRequest(request),/phase2_service_observation/);
    const {action,outcome,code,...raw}=start;
    const receipt={...request,
      kind:'phase2_service_observation_receipt',outcome,code,...raw,...binding};
    const source=`function data()\nreturn {\n${Object.entries(receipt).map(([key,value])=>
      `  ${key} = ${JSON.stringify(value)},`).join('\n')}\n}\nend\n`;
    const parsed=parseServiceObservationReceipt(source,request);
    assert.equal(parsed.gameplayVerified,false);
    assert.equal(parsed.serviceAccountingVerified,false);
    assert.deepEqual(correlateRawServiceInterval({...start,...binding},{...end,...binding}),
      {startUpdateCount:80,endUpdateCount:90,routeStateChanged:true});
    for(const bad of [{...binding,vehicleEntity:selected},{...binding,lineEntity:15702},
      {...binding,lineEntity:27989}]){
      assert.throws(()=>serviceObservationRequest({nonce:request.nonce,requestId:8,action:'start',
        sample:{companyEntity:selected,speedup:0,tickCount:101},binding:bad}),/VERIFIED_PAUSED_SERVICE_REQUIRED/);
      assert.equal(correlateRawServiceInterval({...start,...bad},{...end,...bad}),null);
    }
    assert.throws(()=>serviceObservationRequest({nonce:request.nonce,requestId:8,action:'start',
      sample:{companyEntity:selected===15702?28619:15702,speedup:0,tickCount:101},binding}),
      /VERIFIED_PAUSED_SERVICE_REQUIRED/);
  }
});

test('paired raw service reads establish an interval and route-state change without certifying income',()=>{
  assert.deepEqual(correlateRawServiceInterval(start,end),
    {startUpdateCount:80,endUpdateCount:90,routeStateChanged:true});
  assert.deepEqual(correlateRawServiceInterval(start,{...end,intervalNet:0,
    intervalMaintenanceVehicle:0,endVisitedMask:0,endStopIndex:0}),
    {startUpdateCount:80,endUpdateCount:90,routeStateChanged:false});
});

test('raw service interval rejects changed identity, missing fields, stale endpoints and copied start mismatch',()=>{
  for(const changed of [
    {...end,nonce:'b'.repeat(32)},{...end,nonce:undefined},
    {...end,vehicleEntity:33},{...end,requestId:8},{...end,tickCount:101},
    {...end,updateCount:80},{...end,gameTime:100},{...end,startGameTime:99},
    {...end,startVisitedMask:1},{...end,accountNetWindowEnd:199},
    {...end,intervalMaintenanceVehicle:undefined},{...end,outcome:'rejected'},
  ])assert.equal(correlateRawServiceInterval(start,changed),null);
  assert.equal(correlateRawServiceInterval(end,start),null);
  assert.equal(correlateRawServiceInterval(start,null),null);
});
