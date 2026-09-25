import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLocalCoordinatorRun} from '../src/local-coordinator-run.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';
import {ROAD_STOP_MODEL} from '../src/road-stop-order-payload.mjs';
import {ROAD_DEPOT_RESOURCE} from '../src/depot-build-order-payload.mjs';
const lua=p=>`function data() return {${Object.entries(p).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`;

for(const scenario of ['success','unknown_action','report_failure','cancelled_stop','cancel_rejected','road_stop','remote_road_stop','two_remote_road_stops','two_remote_road_stops_second_unknown','road_preflight_rejected','road_readback_unknown','remote_depot_build','remote_depot_then_vehicle','vehicle_buy_unknown','vehicle_buy_unfunded'])test(`local driver traverses actual adapter/files: ${scenario}`,async()=>{
  const failAction=scenario==='unknown_action',failReport=scenario==='report_failure';
  const cancelRun=['cancelled_stop','cancel_rejected'].includes(scenario);
  const twoRoads=['two_remote_road_stops','two_remote_road_stops_second_unknown'].includes(scenario);
  const roadRun=['road_stop','remote_road_stop','road_preflight_rejected','road_readback_unknown'].includes(scenario)||twoRoads;
  const vehicleRun=['remote_depot_then_vehicle','vehicle_buy_unknown','vehicle_buy_unfunded'].includes(scenario);
  const depotRun=scenario==='remote_depot_build'||vehicleRun;
  const targetCompany=scenario==='remote_road_stop'||twoRoads||depotRun?9:7;
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-local-driver-')),directory=path.join(root,'tf3mp_status_1');await mkdir(directory);
  let run,locked=false,time=0,leasePhase='active',cancelCalls=0,preflightCalls=0,readbackCalls=0;const saved=[],seen=new Set(),actions=[],events=[];
  const depotBalance=vehicleRun?(scenario==='vehicle_buy_unfunded'?0:550840):-449160;
  const fundingRequest={schemaVersion:1,kind:'phase2_funding',nonce:'a'.repeat(32),requestId:1,
    companyEntity:7,targetCompany:9,amount:1000000,confirmed:1,issuedTick:10,expiresTick:310};
  const fundingReceipt=lua({schemaVersion:1,kind:'phase2_funding_receipt',nonce:'a'.repeat(32),requestId:1,
    companyEntity:7,targetCompany:9,amount:1000000,tickCount:11,updateCount:95,outcome:'funded',
    originalBefore:1000,originalBeforeNegative:0,originalAfter:1000,originalAfterNegative:0,
    targetBefore:0,targetBeforeNegative:0,targetAfter:1000000,targetAfterNegative:0});
  const sample={counter:1,updateCount:100,speedup:1};
  const bridge={nonce:'a'.repeat(32),get engineObservation(){return {available:true,sample};},
    get coordinationLeaseState(){return leasePhase;},get coordinationControlsLocked(){return locked;},
    async inspectRoadPreflight({entity,company}){
      preflightCalls++;assert.equal(entity,preflightCalls===2?43:42);assert.equal(company,targetCompany);
      return {outcome:scenario==='road_preflight_rejected'?'missing':'found',entity,company,ownerCompany:0,revision:23,
        issuedUpdate:sample.updateCount,updateCount:sample.updateCount,paused:false};
    },
    async inspectOrderedRoadReadback(request){
      readbackCalls++;
      assert.deepEqual(request,{hostSequence:readbackCalls,company:targetCompany,localCompany:7,
        sourceRoad:readbackCalls===2?43:42,road:readbackCalls===2?83:81,
        stop:readbackCalls===2?82:80,update:sample.updateCount,
        balance:readbackCalls===2?800:900,charge:100});
      return {code:scenario==='road_readback_unknown'?'unknown':'observed',
        ...(scenario==='road_readback_unknown'?{stage:'attachment'}:{})};
    },
    async inspectOrderedDepotReadback(request){
      assert.deepEqual(request,{hostSequence:1,company:9,localCompany:7,
        construction:123,depot:124,update:sample.updateCount,balance:depotBalance,charge:449160});
      return {code:'observed'};
    },
    async acquireCoordinationControls(){assert.equal(sample.speedup,0);locked=true;},
    async startCoordinationLease(){return {get phase(){return leasePhase;},get active(){return leasePhase==='active';},stop(){leasePhase='closed';}};}};
  try {
    run=await createLocalCoordinatorRun({directory,bridge,playerId:'a',companies:new Map([['a',7],['b',9]]),vehicleEntity:depotRun?0:42,now:()=>time,
      logger:e=>events.push(e),saveReport:async r=>{if(failReport&&r.phase==='passed')throw new Error('disk full');saved.push(r);},
      commandLimit:twoRoads||vehicleRun?2:cancelRun||roadRun||depotRun?1:4,
      depotBuildOriginPlayerId:depotRun?'b':'a',
      depotBuildPayload:depotRun?{companyEntity:9,resource:ROAD_DEPOT_RESOURCE,
        x:-812.891541,y:-3142.25684,z:23.3068237,yaw:-3.1415927410125732,seed:1}:null,
      vehicleBuyModel:vehicleRun?'vehicle/road/talco_test.mdl':null,
      verifiedFundingEvidence:vehicleRun?{request:fundingRequest,receiptSource:fundingReceipt}:null,
      roadStopOriginPlayerId:scenario==='remote_road_stop'||twoRoads?'b':'a',
      roadStopPayload:roadRun?[{edgeEntity:42,companyEntity:targetCompany,param:0.5,
        left:true,oneWay:false,model:ROAD_STOP_MODEL,name:'TalCo Road Stop'},
        ...(twoRoads?[{edgeEntity:43,companyEntity:targetCompany,param:0.5,
          left:true,oneWay:false,model:ROAD_STOP_MODEL,name:'TalCo Road Stop'}]:[])]:null,
      beforeFirstCommand:cancelRun?async ({entity,company,recordCancellationEvidence})=>{
        cancelCalls++;assert.equal(entity,42);assert.equal(company,7);
        recordCancellationEvidence({event:'local_cancel_stop_owner_prestate',issuedUpdate:100,
          receiptUpdate:100,paused:false,stopFlag:0});
        recordCancellationEvidence({event:'local_cancel_stop_armed',entity,company,
          expectedInvocation:'1',ttlMs:5000});
        if(scenario==='cancel_rejected')throw new Error('NATIVE_CANCEL_REJECTED');
        recordCancellationEvidence({event:'local_cancel_stop_confirmed',entity,company,invocation:'1'});
      }:null});
    for(let i=0;i<350&&run.phase!=='passed'&&!(run.phase==='failed'&&run.report.haltState==='confirmed');i++) {
      time+=50;await run.poll();
      await new Promise(r=>setTimeout(r,3));
      let request;try{request=parseFlatDataFile(await readFile(path.join(directory,'coordination_request.lua'),'utf8'));}catch{continue;}
      if(seen.has(request.operationId))continue;seen.add(request.operationId);
      if(vehicleRun&&['prepare','executeHeld'].includes(request.operation)){
        assert.equal(request.commandType,request.hostSequence===1?'road.depot.build':'road.vehicle.buy');
        assert.equal(request.entity,request.hostSequence===1?0:124);
        assert.equal(request.companyEntity,9);
        if(request.hostSequence===2)assert.equal(request.model,'vehicle/road/talco_test.mdl');
      }
      const receipt={schemaVersion:1,nonce:bridge.nonce,roundId:request.roundId,operationId:request.operationId,
        operation:request.operation,status:'ok',updateCount:sample.updateCount,held:sample.speedup===0};
      if(request.operation==='holdCheckpoint'){
        sample.updateCount=request.updateCount;sample.speedup=0;
        Object.assign(receipt,{updateCount:sample.updateCount,held:true,snapshotVersion:1,companyCount:2,
          company1:7,balance1:1000,negative1:0,company2:9,balance2:0,negative2:0});
      } else if(request.operation==='prepare')receipt.ownerCompanyEntity=targetCompany;
      else if(request.operation==='executeHeld'){
        actions.push(request.hostSequence);sample.updateCount=request.scheduledUpdate;sample.speedup=0;
        Object.assign(receipt,vehicleRun&&request.hostSequence===2
          ?{updateCount:sample.updateCount,held:true,snapshotVersion:3,hostSequence:2,
            entity:200,vehicleEntity:200,ownerCompanyEntity:9,depotEntity:124,
            chargedCost:100000,balance:450840,negative:0,targetBefore:550840,
            originalBefore:1000,originalAfter:1000}
          :depotRun
          ?{updateCount:sample.updateCount,held:true,snapshotVersion:3,hostSequence:request.hostSequence,
            entity:0,ownerCompanyEntity:9,constructionEntity:123,depotEntity:124,
            chargedCost:449160,balance:Math.abs(depotBalance),negative:depotBalance<0?1:0}
          :['road_stop','remote_road_stop','road_readback_unknown'].includes(scenario)||twoRoads
          ?{updateCount:sample.updateCount,held:true,snapshotVersion:2,hostSequence:request.hostSequence,
            entity:request.entity,ownerCompanyEntity:targetCompany,
            stopEntity:request.hostSequence===2?82:80,roadEntity:request.hostSequence===2?83:81,
            chargedCost:100,balance:request.hostSequence===2?800:900,negative:0}
          :{updateCount:sample.updateCount,held:true,snapshotVersion:1,hostSequence:request.hostSequence,
            entity:42,ownerCompanyEntity:7,stopFlag:request.running?0:1,balance:1000,negative:0});
        if(failAction||['two_remote_road_stops_second_unknown','vehicle_buy_unknown'].includes(scenario)
          &&request.hostSequence===2)receipt.status='unknown';
      } else if(request.operation==='release'){assert.equal(locked,true);sample.speedup=request.speedup;receipt.held=false;receipt.speedup=sample.speedup;}
      else if(request.operation==='halt'){sample.speedup=0;receipt.held=true;}
      sample.counter++;
      // This fixture models completed receipts, not a torn-write fault. The
      // adapter polls independently, so do not expose a truncated live input.
      // This does not address separate intermittent request-publication faults.
      const pending=path.join(directory,'receipt.pending');
      await writeFile(pending,lua(receipt));
      await rename(pending,path.join(directory,'coordination_receipt.lua'));
    }
    assert.equal(run.phase,failAction||failReport||['two_remote_road_stops_second_unknown','vehicle_buy_unknown','vehicle_buy_unfunded'].includes(scenario)
      ||['cancel_rejected','road_preflight_rejected','road_readback_unknown'].includes(scenario)?'failed':'passed',JSON.stringify(run.report.events));
    assert.deepEqual(actions,['cancel_rejected','road_preflight_rejected'].includes(scenario)?[]
      :twoRoads||vehicleRun&&scenario!=='vehicle_buy_unfunded'?[1,2]
      :failAction||cancelRun||depotRun||['road_stop','remote_road_stop','road_readback_unknown'].includes(scenario)?[1]:[1,2,3,4],JSON.stringify(run.report));
    assert.equal(cancelCalls,cancelRun?1:0);
    assert.equal(preflightCalls,twoRoads?2:roadRun?1:0);
    assert.equal(readbackCalls,scenario==='two_remote_road_stops'?2
      :scenario==='two_remote_road_stops_second_unknown'?1
      :['road_stop','remote_road_stop','road_readback_unknown'].includes(scenario)?1:0);
    assert.equal(run.report.realEngineCount,1);assert.equal(run.report.simulatedParticipantCount,1);
    assert.equal(run.report.multiGameVerified,false);assert.ok(saved.length>0);
    if(['road_stop','remote_road_stop'].includes(scenario)||twoRoads){
      assert.equal(run.report.scope,'single_game_ordered_road_stop_with_receipt_mirror');
      assert.ok(run.report.events.some(e=>e.code==='ROAD_STOP_SCHEDULED'));
      assert.equal(run.report.roadPreflight.ownerCompany,0);
      assert.ok(run.report.events.some(e=>e.code==='LOCAL_ROAD_PREFLIGHT_VERIFIED'));
      if(twoRoads){
        assert.deepEqual(run.report.roadPreflights.map(p=>p.hostSequence),[1,2]);
        assert.deepEqual(run.report.independentRoadReadbacks.map(p=>p.hostSequence),
          scenario==='two_remote_road_stops'?[1,2]:[1]);
      }
    }
    if(depotRun){
      assert.equal(run.report.scope,vehicleRun?'single_game_ordered_depot_then_vehicle_with_receipt_mirror'
        :'single_game_ordered_depot_with_receipt_mirror');
      assert.ok(run.report.events.some(e=>e.code==='DEPOT_BUILD_SCHEDULED'));
      assert.deepEqual(run.report.checks[0].depotPostcondition,{constructionEntity:123,
        depotEntity:124,ownerCompanyEntity:9,chargedCost:449160,companyBalance:depotBalance});
      assert.deepEqual(run.report.independentDepotReadback,{code:'observed',hostSequence:1,
        updateCount:run.report.checks[0].updateCount});
      if(vehicleRun){
        assert.equal(run.report.independentVehicleReadback,false);
        assert.equal(run.report.fundingEvidence.targetAfter,1000000);
        if(scenario==='remote_depot_then_vehicle'){
          assert.ok(run.report.events.some(e=>e.code==='VEHICLE_BUY_SCHEDULED'));
          assert.deepEqual(run.report.checks[1].vehiclePostcondition,{vehicleEntity:200,depotEntity:124,
            ownerCompanyEntity:9,chargedCost:100000,balanceBefore:550840,companyBalance:450840,
            hostCompanyUnchanged:true});
        }
      }
    }
    assert.equal(run.report.haltState,'confirmed');
    assert.equal(events.some(e=>e.code==='LOCAL_RUN_PASSED_GAME_HELD'),!failAction&&!failReport
      &&!['two_remote_road_stops_second_unknown','vehicle_buy_unknown','vehicle_buy_unfunded'].includes(scenario)
      &&!['cancel_rejected','road_preflight_rejected','road_readback_unknown'].includes(scenario));
    if(failAction||['two_remote_road_stops_second_unknown','vehicle_buy_unknown'].includes(scenario))assert.equal(run.report.outcome,'ENGINE_OUTCOME_UNKNOWN');
    if(scenario==='vehicle_buy_unfunded')assert.equal(run.report.outcome,'VEHICLE_FUNDING_PRECONDITION_FAILED');
    if(failReport)assert.equal(run.report.outcome,'report_write_failed');
    if(scenario==='cancel_rejected')assert.equal(run.report.outcome,'NATIVE_CANCEL_REJECTED');
    if(scenario==='road_preflight_rejected')assert.equal(run.report.outcome,'ROAD_PREFLIGHT_NOT_CONFIRMED');
    if(scenario==='road_readback_unknown'){
      assert.equal(run.report.outcome,'ORDERED_ROAD_READBACK_UNKNOWN');
      assert.deepEqual(run.report.independentRoadReadback,{code:'unknown',stage:'attachment',hostSequence:1,updateCount:sample.updateCount});
    }
    if(cancelRun){
      assert.ok(run.report.events.some(e=>e.code==='OWNER_PRESTATE_RECEIPT'&&e.stopFlag===0));
      assert.ok(run.report.events.some(e=>e.code==='NATIVE_STOP_ARMED'&&e.ttlMs===5000));
      assert.equal(run.report.events.some(e=>e.code==='NATIVE_STOP_CONFIRMED'),scenario==='cancelled_stop');
    }
    if(run.phase==='failed')assert.ok(run.report.failureContext);
    for(const check of run.report.checks){
      if(['road_stop','remote_road_stop'].includes(scenario)||twoRoads)assert.deepEqual(check.roadPostcondition,{
        sourceRoadEntity:check.hostSequence===2?43:42,
        roadEntity:check.hostSequence===2?83:81,stopEntity:check.hostSequence===2?82:80,ownerCompanyEntity:targetCompany,
        chargedCost:100,companyBalance:check.hostSequence===2?800:900});
      assert.equal(check.updateError,0);
      assert.equal(check.scheduledUpdate,check.proposedUpdate+60);
      assert.equal(check.observedReleaseSpeed,check.requestedReleaseSpeed);
      assert.ok(check.preparedAfterMs>=0);
      assert.ok(check.appliedAfterMs>=check.preparedAfterMs);
      assert.ok(check.releasedAfterMs>=check.appliedAfterMs);
    }
  } finally {await run?.close();await rm(root,{recursive:true,force:true});}
});

test('two-action purchase requires current, matching, successful funding evidence',async()=>{
  const bridge={nonce:'a'.repeat(32),engineObservation:{sample:{updateCount:100}}};
  const request={schemaVersion:1,kind:'phase2_funding',nonce:bridge.nonce,requestId:1,
    companyEntity:7,targetCompany:9,amount:1000000,confirmed:1,issuedTick:10,expiresTick:310};
  const receipt={schemaVersion:1,kind:'phase2_funding_receipt',nonce:bridge.nonce,requestId:1,
    companyEntity:7,targetCompany:9,amount:1000000,tickCount:11,updateCount:95,outcome:'funded',
    originalBefore:1000,originalBeforeNegative:0,originalAfter:1000,originalAfterNegative:0,
    targetBefore:0,targetBeforeNegative:0,targetAfter:1000000,targetAfterNegative:0};
  const options={directory:'unused',bridge,playerId:'a',companies:new Map([['a',7],['b',9]]),
    vehicleEntity:0,saveReport:async()=>{},commandLimit:2,depotBuildOriginPlayerId:'b',
    depotBuildPayload:{companyEntity:9,resource:ROAD_DEPOT_RESOURCE,
      x:-812.891541,y:-3142.25684,z:23.3068237,yaw:-3.1415927410125732,seed:1},
    vehicleBuyModel:'vehicle/road/talco_test.mdl'};
  for(const evidence of [null,
    {request:{...request,targetCompany:7},receiptSource:lua(receipt)},
    {request,receiptSource:lua({...receipt,outcome:'rejected'})},
    {request,receiptSource:lua({...receipt,updateCount:101})}])
    await assert.rejects(createLocalCoordinatorRun({...options,verifiedFundingEvidence:evidence}),
      /VERIFIED_FUNDING_EVIDENCE_REQUIRED/);
});
