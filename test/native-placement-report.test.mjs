import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeNativePlacementLog as parse} from '../src/native-placement-report.mjs';
const ready={event:'native_placement_observer_ready',observerRevision:1,passive:true,gameplayVerified:false};
const event={...ready,event:'native_placement_observed',stage:'create',builderId:'streetTerminalBuilder',sequence:1,sample:1,tickCount:100,updateCount:90,proposalType:'userdata',dataType:'userdata',resultType:'nil'};
const lines=(...items)=>items.map(x=>'[TF3 log] '+JSON.stringify(x)).join('\n');
test('placement report distinguishes no observer from no events',()=>{
  assert.equal(parse('').outcome,'OBSERVER_NOT_SEEN');
  assert.equal(parse(lines(ready)).outcome,'NO_PLACEMENT_EVENTS_SEEN');
  assert.equal(parse(lines(event)).observerReady,false);
});
test('native lifecycle observation never certifies interception or replay',()=>{
  const report=parse(lines(ready,event,{...event,stage:'apply',sequence:2,resultType:'table',secret:'never include'}));
  assert.equal(report.outcome,'CREATE_AND_APPLY_OBSERVED');
  for(const key of ['interceptionVerified','replayVerified','gameplayVerified'])assert.equal(report[key],false);
  assert.equal(JSON.stringify(report).includes('secret'),false);
});
test('GUI resets isolate runs rather than combining stale create and new apply',()=>{
  const report=parse(lines(ready,event,ready,{...event,stage:'apply'}));
  assert.equal(report.observerRuns,2);assert.equal(report.createObserved,false);assert.equal(report.applyObserved,true);
});
test('placement report rejects malformed and duplicate scalar samples',()=>{
  for(const change of [{builderId:'bad"id'},{sequence:17},{sample:9},{tickCount:-2},{proposalType:'unsafe'}]){
    assert.equal(parse(lines(ready,{...event,...change})).rejectedRecords,1);
  }
  assert.equal(parse(lines(ready,event,event)).samples.length,1);
  assert.equal(parse('noise {"event":"native_placement_broken').observerReady,false);
});
test('placement report bounds inputs and observer epochs',()=>{
  assert.throws(()=>parse(null),/LOG_TOO_LARGE/);
  assert.throws(()=>parse(lines(...Array(101).fill(ready))),/TOO_MANY/);
});
test('synthetic route checks never count as native placement and callback failures remain visible',()=>{
  const ready2={...ready,observerRevision:2};
  const self={...ready2,event:'native_placement_observer_selftest',synthetic:true,delivered:true};
  assert.equal(parse(lines(ready2,self)).createObserved,false);
  assert.equal(parse(lines(ready2,self)).selfTestDelivered,true);
  assert.equal(parse(lines(ready2,{...self,delivered:false})).outcome,'GUI_SELFTEST_NOT_DELIVERED');
  assert.equal(parse(lines(ready2,self,{...ready2,event:'native_placement_observer_error'})).outcome,'OBSERVER_CALLBACK_FAILED');
  assert.equal(parse(lines(ready2,event)).samples.length,0);
});
test('revision three records dispatch failure separately from a missing acknowledgement',()=>{
  const ready3={...ready,observerRevision:3};
  const record={...ready3,event:'native_placement_observer_selftest',synthetic:true,delivered:false,callSucceeded:false};
  assert.equal(parse(lines(ready3,record)).selfTestCallSucceeded,false);
  assert.equal(parse(lines(ready3,{...record,callSucceeded:true})).selfTestCallSucceeded,true);
  const report=parse(lines(ready3,{...record,callSucceeded:true,delivered:true}));
  assert.equal(report.selfTestDelivered,true);assert.equal(report.samples.length,0);
  assert.equal(report.replayVerified,false);
});

test('revision four waits through startup, stops on acknowledgement and preserves positive-control evidence',()=>{
  const r={...ready,observerRevision:4};
  const probe={...r,event:'native_placement_observer_selftest',synthetic:true,delivered:false,
    callSucceeded:true,attempt:1,final:false,returnType:'nil',controlDelivered:false};
  assert.equal(parse(lines(r,probe)).outcome,'GUI_ROUTE_PENDING');
  const passed={...probe,attempt:2,final:true,delivered:true,returnType:'table',controlDelivered:true};
  const report=parse(lines(r,probe,passed));
  assert.equal(report.selfTestAttempt,2);assert.equal(report.selfTestDelivered,true);
  assert.equal(report.controlDelivered,true);assert.equal(report.outcome,'NO_PLACEMENT_EVENTS_SEEN');
  assert.equal(report.gameplayVerified,false);
  assert.equal(parse(lines(r,probe,{...probe,attempt:12,final:true,controlDelivered:true})).outcome,'GUI_SELFTEST_NOT_DELIVERED');
  for(const change of [{attempt:13},{attempt:0},{returnType:'secret payload'},{final:true},{controlDelivered:1}]){
    assert.equal(parse(lines(r,{...probe,...change})).rejectedRecords,1);
  }
  assert.equal(parse(lines(r,probe,probe)).rejectedRecords,1);
  assert.equal(parse(lines(r,passed,{...probe,attempt:3})).rejectedRecords,1);
});

test('revision five retains delivery evidence when optional payload inspection fails',()=>{
  const r={...ready,observerRevision:5};
  const ack={...r,event:'native_placement_observer_selftest',synthetic:true,delivered:true,
    callSucceeded:true,attempt:1,final:true,returnType:'table',controlDelivered:true};
  const sample={...event,observerRevision:5,payloadType:'table',shapeInspected:false,
    proposalType:'nil',dataType:'nil',resultType:'nil'};
  const report=parse(lines(r,ack,sample));
  assert.equal(report.createObserved,true);assert.equal(report.samples[0].shapeInspected,false);
  assert.equal(report.observerErrors,0);assert.equal(report.interceptionVerified,false);
  assert.equal(parse(lines(r,ack,{...sample,shapeInspected:true,proposalType:'userdata'})).samples.length,1);
  for(const change of [{shapeInspected:'yes'},{payloadType:'secret'},
    {shapeInspected:true,payloadType:'userdata'},{proposalType:'userdata'}]){
    assert.equal(parse(lines(r,ack,{...sample,...change})).rejectedRecords,1);
  }
});

test('revision six keeps strictly bounded proposal facts without claiming replay',()=>{
  const r={...ready,observerRevision:6};
  const ack={...r,event:'native_placement_observer_selftest',synthetic:true,delivered:true,
    callSucceeded:true,attempt:1,final:true,returnType:'table',controlDelivered:true};
  const facts={schemaVersion:1,code:'readable',addedNodes:0,addedSegments:1,removedNodes:0,removedSegments:1,
    edgeObjects:1,constructions:0,removals:0,resultCount:1,cost:100,critical:false,ownerCompany:3141};
  const sample={...event,observerRevision:6,payloadType:'table',shapeInspected:true,proposalFacts:facts};
  const result=parse(lines(r,ack,sample));
  assert.deepEqual(result.samples[0].proposalFacts,facts);assert.equal(result.replayVerified,false);
  for(const change of [{cost:-1},{addedNodes:65},{ownerCompany:0},{ownerCompany:2147483648},
    {critical:1},{secret:'private'},{cost:Number.MAX_SAFE_INTEGER+1}]){
    const bad=parse(lines(r,ack,{...sample,proposalFacts:{...facts,...change}}));
    assert.equal(bad.createObserved,true);assert.equal(bad.rejectedRecords,1);
    assert.equal(bad.samples[0].proposalFacts.code,'invalid');assert.ok(!JSON.stringify(bad).includes('private'));
  }
  for(const code of ['bounds','unavailable']){
    const fallback=parse(lines(r,ack,{...sample,proposalFacts:{schemaVersion:1,code}}));
    assert.equal(fallback.rejectedRecords,0);assert.equal(fallback.samples[0].proposalFacts.code,code);
    const labelled=parse(lines(r,ack,{...sample,proposalFacts:{schemaVersion:1,code,field:'edgeObjects'}}));
    assert.equal(labelled.samples[0].proposalFacts.field,'edgeObjects');
    const secret=parse(lines(r,ack,{...sample,proposalFacts:{schemaVersion:1,code,field:'private path'}}));
    assert.equal(secret.rejectedRecords,1);assert.ok(!JSON.stringify(secret).includes('private path'));
  }
});

test('revision seven accepts the revision-six facts event shape across readiness, self-test, create and apply',()=>{
  const r={...ready,observerRevision:7};
  const ack={...r,event:'native_placement_observer_selftest',synthetic:true,delivered:true,
    callSucceeded:true,attempt:1,final:true,returnType:'table',controlDelivered:true};
  const facts={schemaVersion:1,code:'readable',addedNodes:0,addedSegments:1,removedNodes:0,removedSegments:1,
    edgeObjects:1,constructions:0,removals:0,resultCount:1,cost:100,critical:false,ownerCompany:3141};
  const create={...event,observerRevision:7,payloadType:'table',shapeInspected:true,proposalFacts:facts};
  const apply={...create,stage:'apply',sequence:2,sample:2};
  const report=parse(lines(r,ack,create,apply));
  assert.equal(report.observerReady,true);assert.equal(report.observerRevision,7);
  assert.equal(report.selfTestDelivered,true);assert.equal(report.selfTestCallSucceeded,true);
  assert.equal(report.createObserved,true);assert.equal(report.applyObserved,true);
  assert.equal(report.outcome,'CREATE_AND_APPLY_OBSERVED');
  assert.deepEqual(report.samples.map(sample=>sample.proposalFacts),[facts,facts]);
});
