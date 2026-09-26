import assert from 'node:assert/strict';
import test from 'node:test';
import {correlateRawServiceInterval} from '../src/service-observation.mjs';

const start={action:'start',outcome:'raw_start_captured',code:'RAW_START_CAPTURED',
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

test('paired raw service reads establish an interval and route-state change without certifying income',()=>{
  assert.deepEqual(correlateRawServiceInterval(start,end),
    {startUpdateCount:80,endUpdateCount:90,routeStateChanged:true});
  assert.deepEqual(correlateRawServiceInterval(start,{...end,intervalNet:0,
    intervalMaintenanceVehicle:0,endVisitedMask:0,endStopIndex:0}),
    {startUpdateCount:80,endUpdateCount:90,routeStateChanged:false});
});

test('raw service interval rejects changed identity, missing fields, stale endpoints and copied start mismatch',()=>{
  for(const changed of [
    {...end,vehicleEntity:33},{...end,requestId:8},{...end,tickCount:101},
    {...end,updateCount:80},{...end,gameTime:100},{...end,startGameTime:99},
    {...end,startVisitedMask:1},{...end,accountNetWindowEnd:199},
    {...end,intervalMaintenanceVehicle:undefined},{...end,outcome:'rejected'},
  ])assert.equal(correlateRawServiceInterval(start,changed),null);
  assert.equal(correlateRawServiceInterval(end,start),null);
  assert.equal(correlateRawServiceInterval(start,null),null);
});
