import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=readFileSync(new URL('../mod/content/tf3mp_street_connector_simple_prepare.lua',import.meta.url),'utf8');
// Sanitized coordinates and entity roles from one observed junction. No save,
// screenshot, raw report, or private capture file is required by this test.
const town='::/infrastructure/street/town/town_old_small.street_template';
const townStyle='::/infrastructure/street/town/town_old.street';
const country='::/infrastructure/street/country/country_old_small.street_template';
const countryStyle='::/infrastructure/street/country/country_old.street';
const retained='::/mod/retained.street_template';
const retainedStyle='::/mod/retained.street';
const compact={schemaVersion:1,companyEntity:15702,
  nodes:[{entity:-1,position:[-1647.47,1077.99,1.04]},{entity:-5,position:[-1583.60,1080.24,1.76]}],
  segments:[
    {entity:-2,node0:28831,node1:-1,tangent0:[.427,-58.91,-.756],tangent1:[.427,-58.91,-.756],roadTemplate:town,roadStyle:townStyle},
    {entity:-4,node0:-1,node1:27820,tangent0:[-61,0,-.695],tangent1:[-61,0,.705],roadTemplate:country,roadStyle:countryStyle},
    {entity:-6,node0:27371,node1:-5,tangent0:[-63.19,-9.79,-.026],tangent1:[-63.67,-5.96,-.953],roadTemplate:country,roadStyle:countryStyle},
    {entity:-7,node0:-5,node1:-1,tangent0:[-63.66,-5.96,-.953],tangent1:[-63.94,0,-.728],roadTemplate:country,roadStyle:countryStyle},
  ],removedNode:27819,removedEdges:[27825,27824]};
const oldPos=[-1628.47,1077.99,1.22], bPos=[-1708.47,1077.99,.75], cPos=[-1520.22,1088.56,2.42];
const oldEdge=(entity,node0,node1,p0,p1)=>({entity,comp:{node0,node1,position0:p0,position1:p1,
  type:1,typeIndex:-1,roadType:2,objects:[],edgeDecorations:[],laneConfigs:[
    {forward:false,offset:-1,speed:16.67,width:2,transportModes:{PERSON:true,CARGO:true}},
    {forward:false,offset:-.5,speed:16.67,width:5,transportModes:{BUS:true,CAR:true,TRUCK:true}},
    {forward:true,offset:.5,speed:16.67,width:5,transportModes:{BUS:true,CAR:true,TRUCK:true}},
    {forward:true,offset:1,speed:16.67,width:2,transportModes:{PERSON:true,CARGO:true}}],
  roadDevelopmentLocked:false,roadTemplate:country,roadStyle:countryStyle}});
const removedSegments=[oldEdge(27825,27819,27820,oldPos,bPos),oldEdge(27824,27371,27819,cPos,oldPos)];
function literal(v){
  if(v===null)return 'nil';
  if(Array.isArray(v))return `{${v.map(literal).join(',')}}`;
  if(typeof v==='object')return `{${Object.entries(v).map(([k,x])=>`[${literal(k)}]=${literal(x)}`).join(',')}}`;
  if(typeof v==='string')return JSON.stringify(v);
  return String(v);
}
function run(change='',after='',method='prepare'){
  const script=`local adapter=(function() ${source} end)()
local input=${literal(compact)}
local retainedTemplate=${literal(retained)}
local retainedStyle=${literal(retainedStyle)}
local cap=${literal({removedSegments})}
local A,B,C=input.segments[1].node0,input.segments[2].node1,input.segments[3].node0
local old=input.removedNode
local actual={};local incident={}
local function vec(v)return{x=v[1],y=v[2],z=v[3]}end
for _,s in ipairs(cap.removedSegments)do
  local e=s.comp;for _,k in ipairs({'position0','position1'})do e[k]=vec(e[k])end
  actual[s.entity]={BASE_EDGE=e,BASE_EDGE_STREET={precedenceNode0=2,precedenceNode1=2}}
end
local pos={};pos[old]=cap.removedSegments[1].comp.position0;pos[B]=cap.removedSegments[1].comp.position1;pos[C]=cap.removedSegments[2].comp.position0
pos[A]=vec({-1700,1000,1})
for id,p in pairs(pos)do actual[id]={BASE_NODE={position=p}}end
actual[input.companyEntity]={PLAYER={}}
actual[99]={GAME_SPEED={speedup=0}}
incident[old]={input.removedEdges[1],input.removedEdges[2]};incident[B]={input.removedEdges[1],111};incident[C]={input.removedEdges[2],112};incident[A]={113}
actual[113]={BASE_EDGE={node0=A,node1=77,type=1,typeIndex=-1,roadType=2,roadDevelopmentLocked=false,roadTemplate=input.segments[1].roadTemplate,roadStyle=input.segments[1].roadStyle,objects={},edgeDecorations={},laneConfigs=cap.removedSegments[1].comp.laneConfigs},BASE_EDGE_STREET={precedenceNode0=2,precedenceNode1=2},PLAYER_OWNED={player=input.companyEntity}}
actual[111]={BASE_EDGE={node0=B,node1=80,type=1,roadType=2,laneConfigs=cap.removedSegments[1].comp.laneConfigs},BASE_EDGE_STREET={}}
actual[112]={BASE_EDGE={node0=81,node1=C,type=1,roadType=2,laneConfigs=cap.removedSegments[1].comp.laneConfigs},BASE_EDGE_STREET={}}
local function rec(initial)return{new=function()return initial and initial()or{}end}end
local styles={};for _,s in ipairs(input.segments)do styles[s.roadTemplate]=s.roadStyle end
styles[retainedTemplate]=retainedStyle
local api={type={ComponentType={PLAYER='PLAYER',GAME_SPEED='GAME_SPEED',BASE_EDGE='BASE_EDGE',BASE_EDGE_STREET='BASE_EDGE_STREET',BASE_NODE='BASE_NODE',PLAYER_OWNED='PLAYER_OWNED',BASE_NODE_CONFIG='BASE_NODE_CONFIG',EMISSION_EMITTER='EMISSION_EMITTER'},
  enum={BaseEdgeType={NORMAL=1},RoadType={STREET=2},TrafficLightPreference={AUTO=3}},Vec3f={new=function(x,y,z)return{x=x,y=y,z=z}end},
  SimpleProposal=rec(),SimpleStreetProposal=rec(),Context=rec(),NodeAndEntity=rec(function()return{comp={}}end),SegmentAndEntity=rec(function()return{comp={},streetEdge={}}end),
  BaseNodeLaneConnectionAndEntity=rec(function()return{comp={}}end),TrafficLightConfig=rec()},
  engine={Component={BaseNode=rec(),BaseEdge=rec(),BaseEdgeStreet=rec(),PlayerOwned=rec()},
    entityExists=function(id)return actual[id]~=nil end,getComponent=function(id,k)return actual[id]and actual[id][k]end,
    getRevision=function(id)return{num={1,2,3}}end,util={getWorld=function()return 99 end},
    system={streetSystem={getNode2SegmentMap=function()return incident end}}},
  res={streetTemplateRep={find=function(name)if not styles[name]then return -1 end;if name==retainedTemplate then return 5 end;for i,s in ipairs(input.segments)do if s.roadTemplate==name then return i end end end,
    get=function(id)return{roadType=2,streetStyle=id==5 and retainedStyle or input.segments[id].roadStyle,laneConfigs=cap.removedSegments[1].comp.laneConfigs,defaultEdgeDecorations={}}end}},
  cmd={makeWorldBuildProposalCmd=function(p,c,a,b,d)return{proposal=p,context=c,flags={a,b,d}}end,
    sendCommand=function()error('MUST_NOT_SEND')end}}
local generatedCalls, generatedValues = 0, {}
local function nativePair(other)
  local function row(a,b)return setmetatable({segment0=a,lane0=1,segment1=b,lane1=2,withRoad=true,withTram=false},{})end
  return {row(-1,other),row(other,-1)}
end
api.engine.util.proposal={replaceSegment=setmetatable({}, {__call=function(_,id)
  assert(id==input.removedEdges[1])
  generatedCalls=generatedCalls+1
  local value={proposal={addedNodes={},removedNodes={},edgeObjectsToAdd={},
    addedSegments={{entity=-1}},removedSegments={{entity=id}},
    nodeConfigsToRemove={old,B},nodeConfigsToAdd={
      {entity=old,comp={laneConnections=nativePair(input.removedEdges[2])}},
      {entity=B,comp={laneConnections=nativePair(111)}}}}}
  generatedValues[generatedCalls]=value
  return value
end})}
${change}
local result=adapter.${method}(api,input)
${after}
local recheck=result.dependencies and adapter.revalidate(api,input,result.dependencies,${method==='inspect'?'false':'nil'})
local s=result.command and result.command.proposal.streetProposal
return result.code,result.stage or 'none',s and #s.edgesToAdd or 0,s and #s.nodesToAdd or 0,
  s and s.edgesToAdd[1].playerOwned.player or 0,s and #s.nodeConfigsToAdd or 0,
  result.dependencies and #result.dependencies.revisions or 0,recheck and recheck.code or 'none'`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,8,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {code:lua.lua_tojsstring(L,-8),stage:lua.lua_tojsstring(L,-7),edges:lua.lua_tonumber(L,-6),nodes:lua.lua_tonumber(L,-5),owner:lua.lua_tonumber(L,-4),configs:lua.lua_tonumber(L,-3),revisions:lua.lua_tonumber(L,-2),recheck:lua.lua_tojsstring(L,-1)};
  }finally{lua.lua_close(L)}
}
test('captured topology prepares one public street command without sending',()=>{
  const after=`assert(generatedCalls==4 and #generatedValues==4)
local count=0
for _,config in ipairs(result.command.proposal.streetProposal.nodeConfigsToAdd)do
  count=count+#config.comp.laneConnections
end
assert(count==14)`;
  assert.deepEqual(run('',after),{code:'prepared',stage:'none',edges:4,nodes:2,owner:compact.companyEntity,configs:5,revisions:9,recheck:'ready'});
});
test('generated lane proposals require the observed shape and reverse native rows',()=>{
  for(const [change,stage] of [
    ['api.engine.util.proposal=nil','lane_generator_record'],
    ['api.engine.util.proposal.replaceSegment=nil','lane_generator_callable'],
    ['api.engine.util.proposal.replaceSegment=setmetatable({}, {__call=function()return{proposal={}}end})','lane_generator_shape_1'],
    [`local original=api.engine.util.proposal.replaceSegment
api.engine.util.proposal.replaceSegment=setmetatable({}, {__call=function(_,id)
  local value=original(id);value.proposal.nodeConfigsToAdd[1].comp.laneConnections[2]=value.proposal.nodeConfigsToAdd[1].comp.laneConnections[1]
  return value
end})`,'lane_generator_shape_1'],
  ]){
    const result=run(change);
    assert.equal(result.code,'rejected',change);
    assert.equal(result.stage,stage,change);
  }
});
test('native lane readback accepts copied wrappers with matching six fields',()=>{
  const change=`local original=api.type.BaseNodeLaneConnectionAndEntity.new
api.type.BaseNodeLaneConnectionAndEntity.new=function()
  local config=original();local comp=config.comp
  return {comp=setmetatable({}, {__index=function(_,key)
    if key=='laneConnections' and comp.laneConnections then
      local rows={}
      for i,row in ipairs(comp.laneConnections)do
        rows[i]={segment0=row.segment0,lane0=row.lane0,segment1=row.segment1,
          lane1=row.lane1,withRoad=row.withRoad,withTram=row.withTram}
      end
      return rows
    end
    return comp[key]
  end,__newindex=function(_,key,value)comp[key]=value end})}
end`;
  assert.equal(run(change).code,'prepared');
});
test('native lane readback checks all fields after assignment',()=>{
  const change=`local original=api.type.BaseNodeLaneConnectionAndEntity.new
api.type.BaseNodeLaneConnectionAndEntity.new=function()
  local config=original();local comp=config.comp
  return {comp=setmetatable({}, {__index=function(_,key)
    if key=='laneConnections' and comp.laneConnections then
      comp.laneConnections[1].withTram=true
    end
    return comp[key]
  end,__newindex=function(_,key,value)comp[key]=value end})}
end`;
  const result=run(change);
  assert.equal(result.code,'rejected');
  assert.equal(result.stage,'config_1_lane_readback');
});
test('measured five node configs replace three endpoint configs with complete native defaults',()=>{
  const after=`local s=result.command.proposal.streetProposal
local specs={{A,{-2,113},{{-2,113},{113,-2}}},{-1,{-2},{{-7,-2},{-2,-7},{-7,-4},{-2,-4},{-4,-7},{-4,-2}}},
  {B,{},{{-4,111},{111,-4}}},{-5,{},{{-7,-6},{-6,-7}}},{C,{},{{-6,112},{112,-6}}}}
assert(#s.nodeConfigsToAdd==5 and #s.nodeConfigsToRemove==3)
for i,id in ipairs({A,B,C})do assert(s.nodeConfigsToRemove[i]==id)end
for i,spec in ipairs(specs)do
  local item=s.nodeConfigsToAdd[i];local c=item.comp
  assert(item.entity==spec[1] and #c.crosswalks==#spec[2] and #c.laneConnections==#spec[3])
  for j,id in ipairs(spec[2])do assert(c.crosswalks[j]==id)end
  for j,role in ipairs(spec[3])do
    local p=c.laneConnections[j]
    assert(p.segment0==role[1] and p.segment1==role[2] and p.lane0==1 and p.lane1==2 and p.withRoad==true and p.withTram==false)
  end
  assert(c.trafficLightPreference==api.type.enum.TrafficLightPreference.AUTO and c.doubleSlipSwitch==false)
  assert(c.trafficLightConfig.trafficLightType==-1 and #c.trafficLightConfig.states==0)
  assert(c.userModifiedLaneConnections==nil and c.userModifiedTrafficLightStates==false)
end`;
  assert.equal(run('',after).code,'prepared');
});
test('node config recipe rejects unsupported continuation topology, lanes, and constructors',()=>{
  for(const change of [
    'incident[B]={input.removedEdges[1]}',
    'incident[C]={input.removedEdges[2],112,114};actual[114]={BASE_EDGE={}}',
    'actual[111].BASE_EDGE.laneConfigs={{},{}}',
    'actual[112].BASE_EDGE.node0=77;actual[112].BASE_EDGE.node1=78',
    'api.type.BaseNodeLaneConnectionAndEntity=nil',
    'api.type.TrafficLightConfig=nil',
  ])assert.notEqual(run(change).code,'prepared',change);
});
test('native node config failures retain indexed first setter stage without a retry or send',()=>{
  const cases=[
    ['crosswalks','comp','crosswalks'],['lane_connections','comp','laneConnections'],
    ['double_slip','comp','doubleSlipSwitch'],['light_preference','comp','trafficLightPreference'],
    ['light_states','lights','states'],['light_type','lights','trafficLightType'],
    ['lights_assign','comp','trafficLightConfig'],
    ['modified_states','comp','userModifiedTrafficLightStates'],
    ['entity','config','entity'],['comp_assign','config','comp'],
  ];
  for(const [stage,object,field] of cases){
    const change=`local configCalls,lightCalls,sends=0,0,0
api.cmd.sendCommand=function()sends=sends+1 end
print=function()end
api.type.BaseNodeLaneConnectionAndEntity.new=function()
  configCalls=configCalls+1
  local comp=setmetatable({}, {__newindex=function(t,k,v)
    if configCalls==2 and '${object}'=='comp' and k=='${field}' then error('native setter') end
    rawset(t,k,v)
  end})
  return setmetatable({}, {__index=function(_,k)if k=='comp' then return comp end end,
    __newindex=function(t,k,v)
      if configCalls==2 and '${object}'=='config' and k=='${field}' then error('native setter') end
      rawset(t,k,v)
    end})
end
api.type.TrafficLightConfig.new=function()
  lightCalls=lightCalls+1
  return setmetatable({}, {__newindex=function(t,k,v)
    if configCalls==2 and '${object}'=='lights' and k=='${field}' then error('native setter') end
    rawset(t,k,v)
  end})
end`;
    const result=run(change,'assert(configCalls==2 and lightCalls==2 and sends==0)');
    assert.equal(result.code,'unknown',stage);
    assert.equal(result.stage,`config_2_${stage}`,stage);
  }
});
test('native config getter and light constructor failures retain separate stages',()=>{
  const getter=`local configCalls,lightCalls,sends=0,0,0
api.cmd.sendCommand=function()sends=sends+1 end
api.type.BaseNodeLaneConnectionAndEntity.new=function()
  configCalls=configCalls+1
  return setmetatable({}, {__index=function(_,k)
    if k=='comp' then if configCalls==2 then error('native comp getter') end;return{} end
  end})
end
api.type.TrafficLightConfig.new=function()lightCalls=lightCalls+1;return{}end`;
  const read=run(getter,'assert(configCalls==2 and lightCalls==1 and sends==0)');
  assert.equal(read.code,'unknown');assert.equal(read.stage,'config_2_comp_read');
  const constructor=`local configCalls,lightCalls,sends=0,0,0
api.cmd.sendCommand=function()sends=sends+1 end
api.type.BaseNodeLaneConnectionAndEntity.new=function()configCalls=configCalls+1;return{comp={}}end
api.type.TrafficLightConfig.new=function()lightCalls=lightCalls+1;if configCalls==2 then error('native light ctor') end;return{}end`;
  const lights=run(constructor,'assert(configCalls==2 and lightCalls==2 and sends==0)');
  assert.equal(lights.code,'unknown');assert.equal(lights.stage,'config_2_lights_new');
});
test('fresh retained-spur ownership is reused without a constructor or world-component write',()=>{
  const change=`api.type.NodeAndEntity.new=function()return{comp={}}end
api.type.SegmentAndEntity.new=function()return{comp={},streetEdge={},playerOwned={player=-1}}end
api.engine.Component={}
local owner=setmetatable({}, {__index={player=input.companyEntity},__newindex=function()error('WORLD_OWNER_WRITE')end})
actual[113].PLAYER_OWNED=owner`;
  const after=`local edges=result.command.proposal.streetProposal.edgesToAdd
assert(edges[1].playerOwned and edges[1].playerOwned.player==input.companyEntity)
assert(edges[1].playerOwned==actual[113].PLAYER_OWNED)
assert(edges[2].playerOwned==nil and edges[3].playerOwned==nil and edges[4].playerOwned==nil)`;
  assert.deepEqual(run(change,after),{code:'prepared',stage:'none',edges:4,nodes:2,owner:compact.companyEntity,configs:5,revisions:9,recheck:'ready'});
});
test('untrusted shape, stale world, wrong owner and custom junction are rejected',()=>{
  for(const change of [
    'input.unknown=true','input.nodes[1].entity=-9','input.segments[4].node1=C',
    'input.removedEdges[1]=113','actual[input.removedEdges[1]].BASE_EDGE.node0=C',
    'actual[input.removedEdges[1]].PLAYER_OWNED={player=77}',
    'actual[113].BASE_EDGE.roadTemplate="::/wrong.street_template"',
    'actual[old].BASE_NODE_CONFIG={userModifiedLaneConnections=true}',
    'actual[99].GAME_SPEED.speedup=1','incident[old]={input.removedEdges[1]}',
    'actual[input.removedEdges[1]].BASE_EDGE.objects={{5,1}}',
    'api.res.streetTemplateRep.find=function()return -1 end',
  ])assert.equal(run(change).code,'rejected',change);
});
test('live edge laneConfig mismatch reports its exact inspection stage',()=>{
  const result=run('actual[input.removedEdges[1]].BASE_EDGE.laneConfig={}', '', 'inspect');
  assert.equal(result.code,'rejected');
  assert.equal(result.stage,'old_edge_shape');
});
test('spur inspection reports each first failing predicate without extra emitter reads',()=>{
  const cases=[
    ['actual[113].BASE_EDGE=nil','spur_edge'],
    ['actual[113].BASE_EDGE_STREET=nil','street'],
    ['actual[113].PLAYER_OWNED=nil','owner_type'],
    ['actual[113].PLAYER_OWNED.player=77','owner'],
    ['actual[113].BASE_EDGE.node0=88','spur_topology'],
    ['actual[113].BASE_EDGE.objects={{5,1}}','objects'],
    ['actual[113].BASE_EDGE.edgeDecorations={{5,true}}','decorations'],
    ['actual[113].BASE_EDGE.typeIndex=0','type_index'],
    ['actual[113].BASE_EDGE.laneConfig={}','lane_config'],
    ['actual[113].BASE_EDGE.roadDevelopmentLocked=nil','development_lock'],
    ['actual[113].BASE_EDGE.roadDevelopmentLocked=7','development_lock'],
    ['actual[113].EMISSION_EMITTER={}','emitter'],
    ['actual[113].BASE_EDGE.roadTemplate=""','template'],
    ['actual[113].BASE_EDGE.roadStyle=""','style'],
    ['actual[113].BASE_EDGE_STREET.precedenceNode0=nil','precedence0'],
    ['actual[113].BASE_EDGE_STREET.precedenceNode1=nil','precedence1'],
  ];
  for(const [change,stage] of cases){
    const script=`${change}\nlocal emitterReads=0\nlocal getComponent=api.engine.getComponent\napi.engine.getComponent=function(id,k)if k=='EMISSION_EMITTER' then emitterReads=emitterReads+1 end;return getComponent(id,k)end`;
    const expectedReads=['spur_edge','street','owner_type','owner','spur_topology','objects','decorations','type_index','lane_config','development_lock'].includes(stage)?2:3;
    const result=run(script,`assert(emitterReads==${expectedReads})`,'inspect');
    assert.equal(result.code,'rejected',change);
    assert.equal(result.stage,stage,change);
  }
  assert.equal(run('','','inspect').code,'inspected');
});
test('throwing native bindings return bounded unknown stage',()=>{
  assert.deepEqual(run('api.engine.getRevision=function()error("private")end'),
    {code:'unknown',stage:'dependencies',edges:0,nodes:0,owner:0,configs:0,revisions:0,recheck:'none'});
});
test('command exceptions log one bounded sanitized diagnostic without retrying or changing the receipt',()=>{
  const change=`local calls,logs=0,{}
api.cmd.makeWorldBuildProposalCmd=function()
  calls=calls+1;error(string.rep('x',600)..'\\nsecret\\tvalue')
end
print=function(message)logs[#logs+1]=message end`;
  const after=`local prefix='TF3MP_CONNECTOR_COMMAND_EXCEPTION '
assert(calls==1 and #logs==1 and logs[1]:sub(1,#prefix)==prefix)
assert(#logs[1]<=#prefix+512 and not logs[1]:find('[%c]') and not logs[1]:find('secret'))`;
  assert.deepEqual(run(change,after),{code:'unknown',stage:'command',edges:0,nodes:0,owner:0,configs:0,revisions:0,recheck:'none'});
});
test('lane connection setter exception logs once privately with a bounded indexed stage',()=>{
  const change=`local setters,sends,logs=0,0,{}
api.cmd.sendCommand=function()sends=sends+1 end
api.type.BaseNodeLaneConnectionAndEntity.new=function()
  local comp=setmetatable({}, {__newindex=function(t,k,v)
    if k=='laneConnections' then
      setters=setters+1
      error(string.rep('x',600)..'\\nsecret\\tvalue')
    end
    rawset(t,k,v)
  end})
  return {comp=comp}
end
print=function(message)logs[#logs+1]=message end`;
  const after=`local prefix='TF3MP_CONNECTOR_CONFIG_EXCEPTION config_1_lane_connections '
assert(setters==1 and sends==0 and #logs==1)
assert(logs[1]:sub(1,#prefix)==prefix and #logs[1]<=#prefix+512)
assert(not logs[1]:find('[%c]') and not logs[1]:find('secret'))`;
  assert.deepEqual(run(change,after),{code:'unknown',stage:'config_1_lane_connections',
    edges:0,nodes:0,owner:0,configs:0,revisions:0,recheck:'none'});
});
test('diagnostic print failures are swallowed and noncommand failures are not logged',()=>{
  const command=`api.cmd.makeWorldBuildProposalCmd=function()error('command fault')end
print=function()error('print fault')end`;
  assert.deepEqual(run(command),{code:'unknown',stage:'command',edges:0,nodes:0,owner:0,configs:0,revisions:0,recheck:'none'});
  const noncommand=`local logs={};print=function(message)logs[#logs+1]=message end
api.engine.getRevision=function()error('dependency fault')end`;
  assert.deepEqual(run(noncommand,'assert(#logs==0)'),
    {code:'unknown',stage:'dependencies',edges:0,nodes:0,owner:0,configs:0,revisions:0,recheck:'none'});
});
test('read-only revalidation catches revision, incident, ownership, and intent drift',()=>{
  for(const after of [
    'api.engine.getRevision=function()return{num={1,2,4}}end',
    'incident[A]={999}',
    'actual[113].PLAYER_OWNED={player=999}',
    'input.segments[1].tangent0[1]=3',
  ])assert.equal(run('',after).recheck,'rejected',after);
});
test('retained spur lock accepts either Boolean and rejects changed lock before send',()=>{
  const original='actual[113].BASE_EDGE.roadDevelopmentLocked=true';
  assert.equal(run(original,'assert(result.dependencies.spur.entity==113 and result.dependencies.spur.roadDevelopmentLocked==true)').code,'prepared');
  assert.equal(run(original,'actual[113].BASE_EDGE.roadDevelopmentLocked=false').recheck,'rejected');
  assert.equal(run('actual[113].BASE_EDGE.roadDevelopmentLocked=nil').code,'rejected');
  assert.equal(run('actual[113].BASE_EDGE.roadDevelopmentLocked=1').code,'rejected');
});
test('retained spur uses its own supported resource and precedence',()=>{
  const own='actual[113].BASE_EDGE.roadTemplate=retainedTemplate;actual[113].BASE_EDGE.roadStyle=retainedStyle;actual[113].BASE_EDGE_STREET.precedenceNode0=1;actual[113].BASE_EDGE_STREET.precedenceNode1=0';
  assert.equal(run(own,'assert(result.dependencies.spur.roadTemplate==retainedTemplate and result.dependencies.spur.precedenceNode1==0)').code,'prepared');
  assert.equal(run(own,'actual[113].BASE_EDGE.roadTemplate=input.segments[1].roadTemplate').recheck,'rejected');
  assert.equal(run(own,'actual[113].BASE_EDGE_STREET.precedenceNode0=2').recheck,'rejected');
  const invalid=run('actual[113].BASE_EDGE.roadTemplate="::/mod/missing.street_template"');
  assert.equal(invalid.code,'rejected');assert.equal(invalid.stage,'spur_resource');
  const decorated=run(`${own};local originalGet=api.res.streetTemplateRep.get;api.res.streetTemplateRep.get=function(id)local t=originalGet(id);if id==5 then t.defaultEdgeDecorations={{1,true}}end;return t end`);
  assert.equal(decorated.code,'prepared');
});
test('retained precedence snapshots opaque native values without numeric assumptions',()=>{
  const opaque='local first,second={},{};actual[113].BASE_EDGE_STREET.precedenceNode0=first;actual[113].BASE_EDGE_STREET.precedenceNode1=second';
  assert.equal(run(opaque,'assert(result.dependencies.spur.precedenceNode0==first and result.dependencies.spur.precedenceNode1==second)').code,'prepared');
  assert.equal(run(opaque,'actual[113].BASE_EDGE_STREET.precedenceNode0={}').recheck,'rejected');
});
test('default node configuration at removed junction is allowed',()=>{
  assert.equal(run('actual[old].BASE_NODE_CONFIG={userModifiedLaneConnections=false,userModifiedTrafficLightStates=false,doubleSlipSwitch=false,trafficLightPreference=3,trafficLightConfig={trafficLightType=-1,states={}},laneConnections={},crosswalks={}}').code,'prepared');
});
test('running inspection records detached dependencies without constructing a command',()=>{
  assert.deepEqual(run('actual[99].GAME_SPEED.speedup=2','','inspect'),
    {code:'inspected',stage:'none',edges:0,nodes:0,owner:0,configs:0,revisions:9,recheck:'ready'});
});
test('native vector getters that return copies receive complete arrays in one assignment',()=>{
  const change=`api.type.SimpleStreetProposal.new=function()
    local backing={}
    return setmetatable({}, {__index=function(_,k)
      local v=backing[k]
      if k=='nodesToAdd' or k=='edgesToAdd' then
        local copy={};if v then for i,x in ipairs(v)do copy[i]=x end end;return copy
      end
      return v
    end,__newindex=function(_,k,v)backing[k]=v end})
  end`;
  assert.equal(run(change).code,'prepared');
});
function anchor(change=''){
  const script=`local adapter=(function()${source}end)()
local actual={
  [10]={PLAYER={}},[31]={BASE_NODE={position={x=0,y=0,z=0}}},
  [111]={BASE_EDGE={node0=31,node1=32},BASE_EDGE_STREET={},PLAYER_OWNED={player=10}},
  [112]={BASE_EDGE={node0=33,node1=31},BASE_EDGE_STREET={}}
}
local incident={111,112}
local api={type={ComponentType={PLAYER='PLAYER',BASE_NODE='BASE_NODE',BASE_EDGE='BASE_EDGE',BASE_EDGE_STREET='BASE_EDGE_STREET',PLAYER_OWNED='PLAYER_OWNED'}},
  engine={entityExists=function(id)return actual[id]~=nil end,
    getComponent=function(id,k)return actual[id]and actual[id][k]end,
    getRevision=function()return{num={1,2,3}}end,
    system={streetSystem={getNode2SegmentMap=function()return{[31]=incident}end}}}}
${change}
local result=adapter.inspectAnchorOwner(api,31,10)
return result.code,result.owner==true,result.stage or 'none',result.revision and result.revision[3] or 0`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,4,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {code:lua.lua_tojsstring(L,-4),owner:lua.lua_toboolean(L,-3),stage:lua.lua_tojsstring(L,-2),revision:lua.lua_tonumber(L,-1)};
  }finally{lua.lua_close(L)}
}
test('anchor discovery uses owned incident street and detached node revision',()=>{
  assert.deepEqual(anchor(),{code:'owned',owner:true,stage:'none',revision:3});
  assert.deepEqual(anchor('actual[111].PLAYER_OWNED=nil'),{code:'not_owner',owner:false,stage:'none',revision:3});
  assert.equal(anchor('api.engine.system.streetSystem.getNode2SegmentMap=setmetatable({}, {__call=function()return{[31]=incident}end})').code,'owned');
});
test('foreign-owned or missing incident streets cannot authorize an anchor',()=>{
  for(const change of [
    'actual[112].PLAYER_OWNED={player=77}',
    'actual[111].PLAYER_OWNED={player=77}',
    'actual[112].BASE_EDGE_STREET=nil',
    'actual[112].BASE_EDGE.node1=44',
    'actual[31]=nil',
    'incident={111,111}',
    'api.engine.system.streetSystem.getNode2SegmentMap=function()return{}end',
  ])assert.equal(anchor(change).code,'rejected',change);
});
test('incident failures retain the exact bounded read stage',()=>{
  assert.equal(anchor('api.engine.system.streetSystem.getNode2SegmentMap=function()return{}end').stage,'row_shape');
  assert.equal(anchor('incident={111,111}').stage,'edge_id');
  assert.deepEqual(anchor('api.engine.system.streetSystem.getNode2SegmentMap=function()error("native")end'),
    {code:'unknown',owner:false,stage:'map_call',revision:0});
});
