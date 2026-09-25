import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLocalCoordinatorRun} from '../src/local-coordinator-run.mjs';
import {parseFlatDataFile} from '../src/userdata-ipc.mjs';
import {ROAD_STOP_MODEL} from '../src/road-stop-order-payload.mjs';
const lua=p=>`function data() return {${Object.entries(p).map(([k,v])=>`${k}=${JSON.stringify(v)},`).join('')}} end`;

for(const scenario of ['success','unknown_action','report_failure','cancelled_stop','cancel_rejected','road_stop'])test(`local driver traverses actual adapter/files: ${scenario}`,async()=>{
  const failAction=scenario==='unknown_action',failReport=scenario==='report_failure';
  const cancelRun=['cancelled_stop','cancel_rejected'].includes(scenario);
  const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-local-driver-')),directory=path.join(root,'tf3mp_status_1');await mkdir(directory);
  let run,locked=false,time=0,leasePhase='active',cancelCalls=0;const saved=[],seen=new Set(),actions=[],events=[];
  const sample={counter:1,updateCount:100,speedup:1};
  const bridge={nonce:'a'.repeat(32),get engineObservation(){return {available:true,sample};},
    get coordinationLeaseState(){return leasePhase;},get coordinationControlsLocked(){return locked;},
    async acquireCoordinationControls(){assert.equal(sample.speedup,0);locked=true;},
    async startCoordinationLease(){return {get phase(){return leasePhase;},get active(){return leasePhase==='active';},stop(){leasePhase='closed';}};}};
  try {
    run=await createLocalCoordinatorRun({directory,bridge,playerId:'a',companies:new Map([['a',7],['b',9]]),vehicleEntity:42,now:()=>time,
      logger:e=>events.push(e),saveReport:async r=>{if(failReport&&r.phase==='passed')throw new Error('disk full');saved.push(r);},
      commandLimit:cancelRun||scenario==='road_stop'?1:4,
      roadStopPayload:scenario==='road_stop'?{edgeEntity:42,companyEntity:7,param:0.5,
        left:true,oneWay:false,model:ROAD_STOP_MODEL,name:'TalCo Road Stop'}:null,
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
      const receipt={schemaVersion:1,nonce:bridge.nonce,roundId:request.roundId,operationId:request.operationId,
        operation:request.operation,status:'ok',updateCount:sample.updateCount,held:sample.speedup===0};
      if(request.operation==='holdCheckpoint'){
        sample.updateCount=request.updateCount;sample.speedup=0;
        Object.assign(receipt,{updateCount:sample.updateCount,held:true,snapshotVersion:1,companyCount:2,
          company1:7,balance1:1000,negative1:0,company2:9,balance2:0,negative2:0});
      } else if(request.operation==='prepare')receipt.ownerCompanyEntity=7;
      else if(request.operation==='executeHeld'){
        actions.push(request.hostSequence);sample.updateCount=request.scheduledUpdate;sample.speedup=0;
        Object.assign(receipt,scenario==='road_stop'
          ?{updateCount:sample.updateCount,held:true,snapshotVersion:2,hostSequence:request.hostSequence,
            entity:42,ownerCompanyEntity:7,stopEntity:80,roadEntity:81,chargedCost:100,balance:900,negative:0}
          :{updateCount:sample.updateCount,held:true,snapshotVersion:1,hostSequence:request.hostSequence,
            entity:42,ownerCompanyEntity:7,stopFlag:request.running?0:1,balance:1000,negative:0});
        if(failAction)receipt.status='unknown';
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
    assert.equal(run.phase,failAction||failReport||scenario==='cancel_rejected'?'failed':'passed',JSON.stringify(run.report.events));
    assert.deepEqual(actions,scenario==='cancel_rejected'?[]:failAction||cancelRun||scenario==='road_stop'?[1]:[1,2,3,4],JSON.stringify(run.report));
    assert.equal(cancelCalls,cancelRun?1:0);
    assert.equal(run.report.realEngineCount,1);assert.equal(run.report.simulatedParticipantCount,1);
    assert.equal(run.report.multiGameVerified,false);assert.ok(saved.length>0);
    if(scenario==='road_stop'){
      assert.equal(run.report.scope,'single_game_ordered_road_stop_with_receipt_mirror');
      assert.ok(run.report.events.some(e=>e.code==='ROAD_STOP_SCHEDULED'));
    }
    assert.equal(run.report.haltState,'confirmed');
    assert.equal(events.some(e=>e.code==='LOCAL_RUN_PASSED_GAME_HELD'),!failAction&&!failReport&&scenario!=='cancel_rejected');
    if(failAction)assert.equal(run.report.outcome,'ENGINE_OUTCOME_UNKNOWN');
    if(failReport)assert.equal(run.report.outcome,'report_write_failed');
    if(scenario==='cancel_rejected')assert.equal(run.report.outcome,'NATIVE_CANCEL_REJECTED');
    if(cancelRun){
      assert.ok(run.report.events.some(e=>e.code==='OWNER_PRESTATE_RECEIPT'&&e.stopFlag===0));
      assert.ok(run.report.events.some(e=>e.code==='NATIVE_STOP_ARMED'&&e.ttlMs===5000));
      assert.equal(run.report.events.some(e=>e.code==='NATIVE_STOP_CONFIRMED'),scenario==='cancelled_stop');
    }
    if(run.phase==='failed')assert.ok(run.report.failureContext);
    for(const check of run.report.checks){
      assert.equal(check.updateError,0);
      assert.equal(check.scheduledUpdate,check.proposedUpdate+60);
      assert.equal(check.observedReleaseSpeed,check.requestedReleaseSpeed);
      assert.ok(check.preparedAfterMs>=0);
      assert.ok(check.appliedAfterMs>=check.preparedAfterMs);
      assert.ok(check.releasedAfterMs>=check.appliedAfterMs);
    }
  } finally {await run?.close();await rm(root,{recursive:true,force:true});}
});
