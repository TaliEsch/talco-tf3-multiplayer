import assert from 'node:assert/strict';
import test from 'node:test';
import {createRoadSegmentRemovePreparedEffect}
  from '../src/road-segment-remove-prepared-effect.mjs';

const COMPANY=15702;
const TEMPLATE='::/infrastructure/street/town/town_old_small.street_template';
const STYLE='::/infrastructure/street/town/town_old.street';
const p=value=>({status:'present',value});
const empty=()=>({status:'present',count:0,items:[]});
const seq=items=>({status:'present',count:items.length,items});
const exactVector=values=>values.map(String);
const vector=values=>({status:'present',...Object.fromEntries(['x','y','z'].map((axis,index)=>[
  axis,{status:'present',value:values[index],text:String(values[index])}]))});
const descriptor=()=>({schemaVersion:1,companyEntity:COMPANY,
  node0Position:[0,0,0],node1Position:[10,0,0],tangent0:[1,0,0],tangent1:[1,0,0],
  roadTemplate:TEMPLATE,roadStyle:STYLE,type:0,typeIndex:-1,roadType:1,
  roadDevelopmentLocked:false});

function fixture(ids={nodes:[11,12],edges:[101,102,103]}) {
  const [n0,n1]=ids.nodes,[targetId,leftId,rightId]=ids.edges;
  const positions=new Map([[n0,[0,0,0]],[n1,[10,0,0]]]);
  const snapshotLane=(speed='25.125')=>({speedExactText:speed,widthExactText:'3',
    heightExactText:'4',offsetExactText:'0',forward:true,transportModes:[{code:0,enabled:true}]});
  const snapshotLanes=()=>[snapshotLane(),snapshotLane('12.5')];
  const edge=(id,node0,node1,position0,position1,owner)=>({entity:id,owner,
    base:{node0,node1,position0ExactText:exactVector(position0),position1ExactText:exactVector(position1),
      tangent0ExactText:['1','0','0'],tangent1ExactText:['1','0','0'],
      roadTemplate:TEMPLATE,roadStyle:STYLE,type:{code:0},typeIndex:-1,roadType:{code:1},
      roadDevelopmentLocked:false,distanceExactText:'10.125',laneConfigs:snapshotLanes(),
      objects:[],edgeDecorations:[]},street:{precedenceNode0:{code:0},precedenceNode1:{code:0}}});
  const target=edge(targetId,n0,n1,[0,0,0],[10,0,0],
    {present:true,known:true,company:COMPANY});
  const left=edge(leftId,n0,21,[0,0,0],[3,1,0],{present:false,known:false});
  const right=edge(rightId,n1,22,[10,0,0],[12,2,0],{present:false,known:false});
  const lane=(speed='25.125')=>({status:'present',speed:{status:'present',value:25.12500004,text:speed},
    width:{status:'present',value:3,text:'3'},height:{status:'present',value:4,text:'4'},
    forward:p(true),offset:{status:'present',value:0,text:'0'},
    transportModes:{status:'present',count:1,entries:[{code:0,enabled:true}]}});
  const config=(node,other,optional={status:'present',value:false})=>({status:'present',
    laneConnections:seq([{status:'present',segment0:p(targetId),lane0:p(0),
      segment1:p(other),lane1:p(1),withRoad:p(true),withTram:p(false)}]),
    crosswalks:seq([targetId]),trafficLightPreference:p({code:2}),doubleSlipSwitch:p(false),
    userModifiedLaneConnections:optional,userModifiedTrafficLightStates:p(true),
    trafficLightConfig:{status:'present',trafficLightType:p(0),states:seq([{status:'present',
      lockedLanes:seq([0,2]),duration:{status:'present',value:10.12500004,text:'10.125'},
      minDuration:{status:'present',value:2.00000004,text:'2'},canSkip:p(true)}])}});
  const lane0=lane(),lane1=lane('12.5');
  const base={status:'present',node0:p(n0),node1:p(n1),type:p({code:0}),typeIndex:p(-1),
    roadType:p({code:1}),roadTemplate:p(TEMPLATE),roadStyle:p(STYLE),roadDevelopmentLocked:p(false),
    distance:{status:'present',value:10.12500004,text:'10.125'},
    position0:vector([0,0,0]),position1:vector([10,0,0]),tangent0:vector([1,0,0]),
    tangent1:vector([1,0,0]),objects:empty(),edgeDecorations:empty(),laneConfigs:seq([lane0,lane1]),
    laneConfig:{status:'nil',count:0,items:[]}};
  const removed={status:'present',entity:p(targetId),type:p({code:0}),componentStatus:'present',
    streetEdgeStatus:'present',street:{precedenceNode0:p(0),precedenceNode1:p(0)},
    playerOwned:{player:p(COMPANY)},emissionEmitter:{status:'nil'},base};
  const emptyMap=()=>p({present:true,summaryUnsupported:false,entryCount:0,relationCount:0,entries:[]});
  const observation={code:'roadRemovalRawClosure',companyEntity:COMPANY,edgeEntity:targetId,
    commandSent:false,worldUnchanged:true,executionQualified:false,
    before:{incident:[
      {node:n0,positionExactText:exactVector(positions.get(n0)),owner:{present:true,known:true,company:COMPANY},edges:[target,left]},
      {node:n1,positionExactText:exactVector(positions.get(n1)),owner:{present:true,known:true,company:COMPANY},edges:[right,target]}]},
    proposal:{closure:{status:'complete',incomplete:false,truncated:false,
      removedSegments:seq([removed]),addedSegments:empty(),addedNodes:empty(),edgeObjectsToAdd:empty(),
      removedNodes:empty(),nodeConfigsToAdd:empty(),nodeConfigsToRemove:empty(),
      fields:{toAdd:empty(),toRemove:empty(),old2new:emptyMap()},
      new2oldEdgeObjects:emptyMap(),old2newEdgeObjects:emptyMap(),
      terrain:{status:'present',baseHeightMod:{status:'present',summary:{present:true,
        summaryUnsupported:false,cellCount:0,width:0,height:0},cells:[]}},
      currentBaseNodeConfigs:{status:'present',items:[
        {status:'present',entity:n0,config:config(n0,leftId)},
        {status:'present',entity:n1,config:config(n1,rightId)}]}}}};
  return {observation,descriptor:descriptor(),ids:{n0,n1,targetId,leftId,rightId}};
}

const hash=source=>createRoadSegmentRemovePreparedEffect(source.observation,source.descriptor)
  .preparedEffectHash;
const clone=value=>structuredClone(value);

test('prepared effect is stable across local entity remapping and unordered collections',()=>{
  const original=fixture(),renumbered=fixture({nodes:[501,502],edges:[901,902,903]});
  const {observation,ids}=renumbered;
  for(const node of observation.proposal.closure.currentBaseNodeConfigs.items){
    node.config.laneConnections.items[0].segment0.value=ids.targetId;
    node.config.laneConnections.items[0].segment1.value=node.entity===ids.n0?ids.leftId:ids.rightId;
    node.config.crosswalks.items.reverse();
  }
  observation.before.incident.reverse();
  observation.before.incident.forEach(node=>node.edges.reverse());
  observation.proposal.closure.currentBaseNodeConfigs.items.reverse();
  assert.equal(hash(original),hash(renumbered));
});

test('target lane, semantic config, crosswalk, and owner differences alter or reject the effect',()=>{
  const original=fixture(),baseline=hash(original);
  const lane=clone(original);
  lane.observation.proposal.closure.removedSegments.items[0].base.laneConfigs.items[0].speed.text='25.25';
  for(const node of lane.observation.before.incident){
    const target=node.edges.find(edge=>edge.entity===lane.ids.targetId);
    target.base.laneConfigs[0].speedExactText='25.25';
  }
  assert.notEqual(hash(lane),baseline);
  const inconsistent=clone(original);
  inconsistent.observation.proposal.closure.removedSegments.items[0].base.laneConfigs.items[0].speed.text='25.25';
  assert.throws(()=>hash(inconsistent),/INVALID_ROAD_SEGMENT_REMOVE_PREPARED_EFFECT/);
  const config=clone(original);config.observation.proposal.closure.currentBaseNodeConfigs.items[0].config.trafficLightPreference.value.code=1;
  assert.notEqual(hash(config),baseline);
  const crosswalk=clone(original);crosswalk.observation.proposal.closure.currentBaseNodeConfigs.items[0].config.crosswalks.items[0]=102;
  assert.notEqual(hash(crosswalk),baseline);
  const owner=clone(original);owner.observation.before.incident[0].edges[0].owner.company=28619;
  assert.throws(()=>hash(owner),/INVALID_ROAD_SEGMENT_REMOVE_PREPARED_EFFECT/);
});

test('exact text, graph references, uniqueness, and complete closure are required',()=>{
  const noText=clone(fixture());delete noText.observation.proposal.closure.removedSegments.items[0].base.position0.x.text;
  assert.throws(()=>hash(noText),/INVALID_ROAD_SEGMENT_REMOVE_PREPARED_EFFECT/);
  const noIncidentLaneText=clone(fixture());delete noIncidentLaneText.observation.before.incident[0]
    .edges[1].base.laneConfigs[0].speedExactText;
  assert.throws(()=>hash(noIncidentLaneText),/INVALID_ROAD_SEGMENT_REMOVE_PREPARED_EFFECT/);
  const noDistanceText=clone(fixture());delete noDistanceText.observation.before.incident[0]
    .edges[1].base.distanceExactText;
  assert.throws(()=>hash(noDistanceText),/INVALID_ROAD_SEGMENT_REMOVE_PREPARED_EFFECT/);
  const unknown=clone(fixture());unknown.observation.proposal.closure.currentBaseNodeConfigs.items[0]
    .config.laneConnections.items[0].segment0.value=99999;
  assert.throws(()=>hash(unknown),/INVALID_ROAD_SEGMENT_REMOVE_PREPARED_EFFECT/);
  const ambiguous=fixture();const duplicate=clone(ambiguous.observation.before.incident[0].edges[0]);
  duplicate.entity=999;ambiguous.observation.before.incident[0].edges.push(duplicate);
  assert.throws(()=>hash(ambiguous),/INVALID_ROAD_SEGMENT_REMOVE_PREPARED_EFFECT/);
  for(const change of [
    source=>{source.observation.proposal.closure.status='partial';},
    source=>{source.observation.proposal.closure.truncated=true;},
    source=>{source.observation.proposal.closure.removedSegments.status='partial';},
    source=>{source.observation.proposal.closure.removedSegments.items[0].base.laneConfigs.status='partial';},
  ]){const source=clone(fixture());change(source);assert.throws(()=>hash(source),/INVALID_ROAD_SEGMENT_REMOVE_PREPARED_EFFECT/);}
});

test('neighbor edge identity and node ownership fields contribute to the prepared effect',()=>{
  const original=fixture(),baseline=hash(original);
  for(const change of [
    source=>{source.observation.before.incident[0].edges[1].base.laneConfigs[0].speedExactText='30.125';},
    source=>{source.observation.before.incident[0].edges[1].base.distanceExactText='11.125';},
    source=>{source.observation.before.incident[0].edges[1].street.precedenceNode0.code=1;},
    source=>{source.observation.before.incident[0].owner.company=28619;},
  ]){const source=clone(original);change(source);assert.notEqual(hash(source),baseline);}
});

test('node configs must use local incident edges and removed-node overlap is rejected',()=>{
  const notIncident=clone(fixture());
  notIncident.observation.proposal.closure.currentBaseNodeConfigs.items[0]
    .config.laneConnections.items[0].segment1.value=103;
  assert.throws(()=>hash(notIncident),/INVALID_ROAD_SEGMENT_REMOVE_PREPARED_EFFECT/);

  const valid=fixture();
  const closure=valid.observation.proposal.closure;
  const n0=valid.observation.before.incident.find(node=>node.node===valid.ids.n0);
  const n1=valid.observation.before.incident.find(node=>node.node===valid.ids.n1);
  const left=n0.edges.find(edge=>edge.entity===valid.ids.leftId);
  n0.edges=n0.edges.filter(edge=>edge.entity===valid.ids.targetId);
  left.base.node0=valid.ids.n1;left.base.node1=23;
  left.base.position0ExactText=['10','0','0'];left.base.position1ExactText=['14','1','0'];
  n1.positionExactText=['10','0','0'];
  n1.edges.push(left);
  const removedNode={status:'present',entity:p(valid.ids.n0),componentStatus:'present',
    position:vector([0,0,0])};
  const currentN0=closure.currentBaseNodeConfigs.items.find(node=>node.entity===valid.ids.n0);
  currentN0.config.laneConnections.items[0].segment1.value=valid.ids.targetId;
  currentN0.config.crosswalks.items=[valid.ids.targetId];
  const currentN1=closure.currentBaseNodeConfigs.items.find(node=>node.entity===valid.ids.n1);
  currentN1.config.laneConnections.items[0].segment1.value=valid.ids.rightId;
  currentN1.config.crosswalks.items=[valid.ids.targetId];
  const replacement=clone(currentN1.config);
  replacement.laneConnections.items=[{status:'present',segment0:p(valid.ids.leftId),lane0:p(0),
    segment1:p(valid.ids.rightId),lane1:p(1),withRoad:p(true),withTram:p(false)}];
  replacement.crosswalks=empty();
  closure.removedNodes=seq([removedNode]);
  closure.nodeConfigsToRemove=seq([valid.ids.n1]);
  closure.nodeConfigsToAdd=seq([{status:'present',entity:p(valid.ids.n1),config:replacement}]);
  assert.doesNotThrow(()=>hash(valid));

  const overlap=clone(valid);
  overlap.observation.proposal.closure.nodeConfigsToRemove=seq([overlap.ids.n0]);
  assert.throws(()=>hash(overlap),/INVALID_ROAD_SEGMENT_REMOVE_PREPARED_EFFECT/);
  const replacementOnRemoved=clone(valid);
  replacementOnRemoved.observation.proposal.closure.nodeConfigsToAdd=seq([
    {status:'present',entity:p(replacementOnRemoved.ids.n0),config:replacementOnRemoved.observation.proposal.closure.nodeConfigsToAdd.items[0].config},
  ]);
  assert.throws(()=>hash(replacementOnRemoved),/INVALID_ROAD_SEGMENT_REMOVE_PREPARED_EFFECT/);
});

test('coincident node endpoint positions are rejected',()=>{
  const source=fixture();
  source.descriptor.node1Position=[0,0,0];
  source.observation.before.incident[1].positionExactText=['0','0','0'];
  for(const node of source.observation.before.incident){
    for(const edge of node.edges){
      if(edge.entity===source.ids.targetId)edge.base.position1ExactText=['0','0','0'];
      if(edge.entity===source.ids.rightId)edge.base.position0ExactText=['0','0','0'];
    }
  }
  source.observation.proposal.closure.removedSegments.items[0].base.position1=vector([0,0,0]);
  assert.throws(()=>hash(source),/INVALID_ROAD_SEGMENT_REMOVE_PREPARED_EFFECT/);
});

test('nil and false optional lane-connection flags remain semantically distinct',()=>{
  const present=fixture(),nil=clone(present);
  for(const node of nil.observation.proposal.closure.currentBaseNodeConfigs.items)
    node.config.userModifiedLaneConnections={status:'nil'};
  assert.notEqual(hash(present),hash(nil));
});

test('decoded floats use exact text instead of rounded numeric siblings',()=>{
  const first=fixture(),second=clone(first);
  const laneA=first.observation.proposal.closure.removedSegments.items[0].base.laneConfigs.items[0];
  const laneB=second.observation.proposal.closure.removedSegments.items[0].base.laneConfigs.items[0];
  laneB.speed.value=999.5;
  const distance=second.observation.proposal.closure.removedSegments.items[0].base.distance;
  distance.value=-123.25;
  const duration=second.observation.proposal.closure.currentBaseNodeConfigs.items[0]
    .config.trafficLightConfig.states.items[0].duration;
  duration.value=1000;
  const firstEffect=createRoadSegmentRemovePreparedEffect(first.observation,first.descriptor);
  const secondEffect=createRoadSegmentRemovePreparedEffect(second.observation,second.descriptor);
  assert.equal(secondEffect.preparedEffectHash,firstEffect.preparedEffectHash);
  assert.equal(firstEffect.projection.removedEdge.laneConfigs[0].speed,25.125);
  assert.equal(firstEffect.projection.removedEdge.distance,10.125);
  assert.equal(firstEffect.projection.currentNodes[0].config.trafficLightConfig.states[0].duration,10.125);
});
