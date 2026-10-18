import {canonicalJson,sha256Canonical} from './canonical.mjs';
import {parseRoadSegmentRemoveOrderPayload} from './road-segment-remove-order-payload.mjs';

const fail=()=>{throw new TypeError('INVALID_ROAD_SEGMENT_REMOVE_PREPARED_EFFECT');};
const record=v=>v&&typeof v==='object'&&!Array.isArray(v)
  &&Object.getPrototypeOf(v)===Object.prototype;
const int=v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647;
const entity=v=>int(v)&&v>0;
const boolean=v=>typeof v==='boolean';
const present=v=>{if(!record(v)||v.status!=='present')fail();return v;};
const value=(v,predicate)=>{present(v);if(!predicate(v.value))fail();return v.value;};
const code=v=>value(v,x=>record(x)&&int(x.code)).code;
const numberText=v=>{
  if(typeof v!=='string'||v.length>64
    ||! /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e-?[0-9]+)?$/.test(v))fail();
  const n=Number(v);if(!Number.isFinite(n)||Object.is(n,-0))fail();return n;
};
// Userdata saves round ordinary numeric fields. The pre-serialization text is
// authoritative here; never substitute its rounded sibling value.
const precise=v=>{present(v);return numberText(v.text);};
const vector=v=>{present(v);return ['x','y','z'].map(axis=>precise(v[axis]));};
const vectorText=v=>{
  if(!Array.isArray(v)||v.length!==3||Object.keys(v).length!==3)fail();
  return v.map(numberText);
};
const sequence=v=>{
  present(v);
  if(!Number.isInteger(v.count)||v.count<0||v.count>128
    ||!Array.isArray(v.items)||v.items.length!==v.count||Object.keys(v.items).length!==v.count)fail();
  return v.items;
};
const empty=v=>{if(sequence(v).length)fail();};
const sorted=items=>{
  const pairs=items.map(item=>[canonicalJson(item),item]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  for(let i=1;i<pairs.length;i++)if(pairs[i][0]===pairs[i-1][0])fail();
  return pairs.map(pair=>pair[1]);
};
const optionalBoolean=v=>{
  if(record(v)&&v.status==='nil'&&Object.keys(v).length===1)return {present:false};
  return {present:true,value:value(v,boolean)};
};
const observedOwner=o=>{
  if(!record(o)||typeof o.present!=='boolean'||typeof o.known!=='boolean')fail();
  if(o.present===false&&o.known===false)return {present:false};
  if(o.present&&o.known&&int(o.company)&&o.company>=0)return {present:true,companyEntity:o.company};
  return fail();
};
const snapshotLanes=lanes=>{
  if(!Array.isArray(lanes)||lanes.length>128||Object.keys(lanes).length!==lanes.length)fail();
  return lanes.map(lane=>{
    if(!record(lane)||!boolean(lane.forward)||!Array.isArray(lane.transportModes)
      ||lane.transportModes.length>128)fail();
    const seen=new Set();
    return {speed:numberText(lane.speedExactText),width:numberText(lane.widthExactText),
      height:numberText(lane.heightExactText),offset:numberText(lane.offsetExactText),forward:lane.forward,
      transportModes:sorted(lane.transportModes.map(m=>{
        if(!record(m)||!int(m.code)||m.code<0||!boolean(m.enabled)||seen.has(m.code))fail();
        seen.add(m.code);return {code:m.code,enabled:m.enabled};
      }))};
  });
};
const freeze=v=>{
  if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}
  return v;
};

// This is the qualified single-edge shape, not a generic proposal serializer.
// No IDs, revisions, process clocks, or local-company selection enter the hash.
export function createRoadSegmentRemovePreparedEffect(observation,descriptor) {
  if(!record(observation)||observation.code!=='roadRemovalRawClosure'
    ||observation.commandSent!==false||observation.worldUnchanged!==true
    ||observation.executionQualified!==false||!entity(observation.companyEntity)
    ||!entity(observation.edgeEntity))fail();
  const expected=parseRoadSegmentRemoveOrderPayload(descriptor,observation.companyEntity);
  const before=observation.before,closure=observation.proposal?.closure;
  if(!record(before)||!record(closure)||closure.status!=='complete'
    ||closure.incomplete!==false||closure.truncated!==false
    ||!Array.isArray(before.incident)||before.incident.length!==2)fail();
  const edges=new Map(),edgeKeys=new Map(),nodes=new Map();
  const edgeIdentity=snapshot=>{
    if(!record(snapshot)||!entity(snapshot.entity)||!record(snapshot.base))fail();
    const b=snapshot.base;
    const identity=parseRoadSegmentRemoveOrderPayload({schemaVersion:1,
      companyEntity:expected.companyEntity,node0Position:vectorText(b.position0ExactText),
      node1Position:vectorText(b.position1ExactText),tangent0:vectorText(b.tangent0ExactText),
      tangent1:vectorText(b.tangent1ExactText),roadTemplate:b.roadTemplate,roadStyle:b.roadStyle,
      type:b.type?.code,typeIndex:b.typeIndex,roadType:b.roadType?.code,
      roadDevelopmentLocked:b.roadDevelopmentLocked},expected.companyEntity);
    if(!entity(b.node0)||!entity(b.node1)||b.node0===b.node1)fail();
    // Object/decorated variants need their own stable resource identities.
    // This observed one-edge shape contains neither; never hash local object IDs.
    if(!Array.isArray(b.objects)||b.objects.length||!Array.isArray(b.edgeDecorations)||b.edgeDecorations.length
      ||!record(snapshot.street)||!int(snapshot.street.precedenceNode0?.code)
      ||!int(snapshot.street.precedenceNode1?.code))fail();
    return {identity,owner:observedOwner(snapshot.owner),laneConfigs:snapshotLanes(b.laneConfigs),
      distance:numberText(b.distanceExactText),precedenceNode0:snapshot.street.precedenceNode0.code,
      precedenceNode1:snapshot.street.precedenceNode1.code,objectsEmpty:true,decorationsEmpty:true};
  };
  for(const node of before.incident){
    if(!record(node)||!entity(node.node)||nodes.has(node.node)
      ||!Array.isArray(node.edges)||node.edges.length>128)fail();
    const position=vectorText(node.positionExactText),incident=[],seen=new Set();
    if([...nodes.values()].some(n=>canonicalJson(n.position)===canonicalJson(position)))fail();
    for(const edge of node.edges){
      if(seen.has(edge.entity))fail();seen.add(edge.entity);
      const semantic=edgeIdentity(edge),key=canonicalJson(semantic.identity);
      const previous=edges.get(edge.entity);
      if(previous&&canonicalJson(previous)!==canonicalJson(semantic))fail();
      if(edgeKeys.has(key)&&edgeKeys.get(key)!==edge.entity)fail();
      edgeKeys.set(key,edge.entity);edges.set(edge.entity,semantic);incident.push(semantic);
      const b=edge.base;
      const ownPosition=node.node===b.node0?semantic.identity.node0Position
        :node.node===b.node1?semantic.identity.node1Position:null;
      if(canonicalJson(ownPosition)!==canonicalJson(position))fail();
    }
    if(!seen.has(observation.edgeEntity))fail();
    nodes.set(node.node,{position,owner:observedOwner(node.owner),incidentEdges:sorted(incident),incidentIds:seen});
  }
  const target=edges.get(observation.edgeEntity);
  if(!target||canonicalJson(target.identity)!==canonicalJson(expected)
    ||target.owner.present!==true||target.owner.companyEntity!==expected.companyEntity)fail();
  const edgeRef=id=>{if(!entity(id)||!edges.has(id))fail();return edges.get(id).identity;};
  const nodeRef=id=>{if(!entity(id)||!nodes.has(id))fail();return nodes.get(id).position;};
  const config=(c,nodeId,replacement=false)=>{
    present(c);
    const localEdgeRef=id=>{
      if(!nodes.get(nodeId)?.incidentIds.has(id)||replacement&&id===observation.edgeEntity)fail();
      return edgeRef(id);
    };
    const traffic=present(c.trafficLightConfig);
    return {laneConnections:sequence(c.laneConnections).map(connection=>{
      present(connection);
      return {segment0:localEdgeRef(value(connection.segment0,entity)),lane0:value(connection.lane0,n=>int(n)&&n>=0),
        segment1:localEdgeRef(value(connection.segment1,entity)),lane1:value(connection.lane1,n=>int(n)&&n>=0),
        withRoad:value(connection.withRoad,boolean),withTram:value(connection.withTram,boolean)};
    }),crosswalks:sorted(sequence(c.crosswalks).map(localEdgeRef)),
    trafficLightPreference:code(c.trafficLightPreference),doubleSlipSwitch:value(c.doubleSlipSwitch,boolean),
    userModifiedLaneConnections:optionalBoolean(c.userModifiedLaneConnections),
    userModifiedTrafficLightStates:value(c.userModifiedTrafficLightStates,boolean),
    trafficLightConfig:{trafficLightType:value(traffic.trafficLightType,int),states:sequence(traffic.states).map(state=>{
      present(state);
      return {lockedLanes:sequence(state.lockedLanes).map(n=>{if(!int(n)||n<0)fail();return n;}),
        duration:precise(state.duration),minDuration:precise(state.minDuration),canSkip:value(state.canSkip,boolean)};
    })}};
  };
  const lane=entry=>{
    present(entry);const modes=present(entry.transportModes);
    if(!Array.isArray(modes.entries)||!Number.isInteger(modes.count)||modes.count<0
      ||modes.entries.length!==modes.count||modes.count>128)fail();
    const seen=new Set();
    return {speed:precise(entry.speed),width:precise(entry.width),height:precise(entry.height),
      forward:value(entry.forward,boolean),offset:precise(entry.offset),
      transportModes:sorted(modes.entries.map(m=>{
        if(!record(m)||!int(m.code)||m.code<0||!boolean(m.enabled)||seen.has(m.code))fail();
        seen.add(m.code);return {code:m.code,enabled:m.enabled};
      }))};
  };
  const removed=sequence(closure.removedSegments);
  if(removed.length!==1)fail();
  const r=present(removed[0]),base=present(r.base);
  if(value(r.entity,entity)!==observation.edgeEntity||code(r.type)!==0
    ||r.componentStatus!=='present'||r.streetEdgeStatus!=='present'
    ||value(r.playerOwned?.player,entity)!==expected.companyEntity||r.emissionEmitter?.status!=='nil')fail();
  const baseDescriptor=parseRoadSegmentRemoveOrderPayload({schemaVersion:1,companyEntity:expected.companyEntity,
    node0Position:vector(base.position0),node1Position:vector(base.position1),tangent0:vector(base.tangent0),
    tangent1:vector(base.tangent1),roadTemplate:value(base.roadTemplate,x=>typeof x==='string'),
    roadStyle:value(base.roadStyle,x=>typeof x==='string'),type:code(base.type),
    typeIndex:value(base.typeIndex,int),roadType:code(base.roadType),
    roadDevelopmentLocked:value(base.roadDevelopmentLocked,boolean)},expected.companyEntity);
  if(canonicalJson(baseDescriptor)!==canonicalJson(expected))fail();
  if(canonicalJson(nodeRef(value(base.node0,entity)))!==canonicalJson(expected.node0Position)
    ||canonicalJson(nodeRef(value(base.node1,entity)))!==canonicalJson(expected.node1Position))fail();
  empty(base.objects);empty(base.edgeDecorations);
  const lanes=sequence(base.laneConfigs).map(lane);
  if(canonicalJson(lanes)!==canonicalJson(target.laneConfigs)
    ||precise(base.distance)!==target.distance
    ||value(r.street?.precedenceNode0,int)!==target.precedenceNode0
    ||value(r.street?.precedenceNode1,int)!==target.precedenceNode1)fail();
  const singular=base.laneConfig?.status==='nil'?{present:false}
    :{present:true,lanes:sequence(base.laneConfig).map(lane)};
  for(const field of ['addedSegments','addedNodes','edgeObjectsToAdd'])empty(closure[field]);
  empty(closure.fields?.toAdd);empty(closure.fields?.toRemove);
  for(const map of [closure.fields?.old2new,closure.new2oldEdgeObjects,closure.old2newEdgeObjects]){
    const m=value(map,record);
    if(m.present!==true||m.summaryUnsupported!==false||m.entryCount!==0||m.relationCount!==0
      ||!Array.isArray(m.entries)||m.entries.length)fail();
  }
  const terrain=present(closure.terrain),grid=present(terrain.baseHeightMod),summary=grid.summary;
  if(!record(summary)||summary.present!==true||summary.summaryUnsupported!==false
    ||summary.cellCount!==0||summary.width!==0||summary.height!==0
    ||!Array.isArray(grid.cells)||grid.cells.length)fail();
  const current=present(closure.currentBaseNodeConfigs);
  if(!Array.isArray(current.items)||current.items.length!==nodes.size)fail();
  const seenCurrent=new Set();
  const currentNodes=sorted(current.items.map(n=>{
    present(n);const node=nodeRef(n.entity);
    if(seenCurrent.has(n.entity))fail();seenCurrent.add(n.entity);
    return {position:node,owner:nodes.get(n.entity).owner,incidentEdges:nodes.get(n.entity).incidentEdges,config:config(n.config,n.entity)};
  }));
  const removedNodeIds=new Set();
  const removedNodes=sorted(sequence(closure.removedNodes).map(n=>{
    present(n);const id=value(n.entity,entity),pos=nodeRef(id);
    if(removedNodeIds.has(id)||nodes.get(id).incidentIds.size!==1)fail();removedNodeIds.add(id);
    if(n.componentStatus!=='present'||canonicalJson(vector(n.position))!==canonicalJson(pos))fail();return pos;
  }));
  if(removedNodes.length>1)fail();
  const seenReplacement=new Set();
  const replacementConfigs=sorted(sequence(closure.nodeConfigsToAdd).map(n=>{
    present(n);const id=value(n.entity,entity);
    if(seenReplacement.has(id)||removedNodeIds.has(id))fail();seenReplacement.add(id);
    return {position:nodeRef(id),config:config(n.config,id,true)};
  }));
  const removedConfigs=sorted(sequence(closure.nodeConfigsToRemove).map(id=>{
    if(removedNodeIds.has(id))fail();return nodeRef(id);
  }));
  // Lane connection/state order is retained: locked-lane indexes can depend on it.
  const projection={schemaVersion:1,descriptor:expected,targetOwner:target.owner,
    removedEdge:{laneConfigs:lanes,laneConfig:singular,distance:precise(base.distance),
      precedenceNode0:value(r.street?.precedenceNode0,int),precedenceNode1:value(r.street?.precedenceNode1,int)},
    currentNodes,removedNodes,replacementConfigs,removedConfigs,
    additionsEmpty:true,edgeObjectMapsEmpty:true,constructionMapEmpty:true,terrainEmpty:true};
  return freeze({projection,preparedEffectHash:sha256Canonical(projection)});
}
