import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
import {roadStopCaptureFixture} from './fixtures/road-stop-capture.mjs';
import {parseRoadStopCapture} from '../src/road-stop-capture.mjs';
const {lua,lauxlib,lualib,to_luastring}=fengari;
const rebuild=await readFile(new URL('../mod/content/tf3mp_road_replay_rebuild.lua',import.meta.url),'utf8');
const capture=await readFile(new URL('../mod/content/tf3mp_road_capture.lua',import.meta.url),'utf8');
function literal(v){if(v===null)return'nil';if(typeof v==='string')return `string.char(${[...Buffer.from(v)].join(',')})`;if(typeof v==='number'||typeof v==='boolean')return String(v);return `{${Object.entries(v).map(([k,x])=>`[${Array.isArray(v)?Number(k)+1:literal(k)}]=${literal(x)}`).join(',')}}`;}
function execute(mutation=''){
  const script=`
local rebuilder=(function() ${rebuild} end)()
local collector=(function() ${capture} end)()
local copied=${literal(roadStopCaptureFixture())}
local function ctor() return {new=function(...) return {} end} end
local types={Proposal=ctor(),NodeAndEntity=ctor(),SegmentAndEntity=ctor(),Vec3f={new=function(x,y,z)return{x=x,y=y,z=z}end},Vec4f={new=function(x,y,z,w)return{x=x,y=y,z=z,w=w}end},Mat4f={new=function(a,b,c,d)return{a,b,c,d}end},GridVec2f={new=function(x0,y0,w,h)return{x0=x0,y0=y0,width=w,height=h}end},enum={}}
local components={BaseNode=ctor(),BaseEdge=ctor(),BaseEdgeStreet=ctor(),EmissionEmitter=ctor(),PlayerOwned=ctor()}
for _,name in ipairs({'BaseEdgeType','RoadType','EdgeObjectType','PrecedencePreference','TransportMode'}) do types.enum[name]=setmetatable({}, {__index=function(t,k)local x={};rawset(t,k,x);return x end}) end
${mutation}
local result=rebuilder.rebuild(copied,types,components)
local proposal=result.proposal
local enums=types.enum
enums.Mat4f={cols=function(v,col)local c=v[col];return{x=c.x,y=c.y,z=c.z,w=c.w}end}
local encoded=collector.collect(proposal,{enum=enums,Mat4f=enums.Mat4f})
return result.code,encoded.code,encoded.json or encoded.field
`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,10_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));assert.equal(lua.lua_pcall(L,0,3,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));return [lua.lua_tojsstring(L,-3),lua.lua_tojsstring(L,-2),lua.lua_tojsstring(L,-1)];}finally{lua.lua_close(L);}
}
function inspectNodeConfig(mutation=''){
  const script=`
local rebuilder=(function() ${rebuild} end)()
local copied=${literal(roadStopCaptureFixture())}
copied.proposal.street.nodeConfigsToAdd={{entity=-9,comp={laneConnections={{segment0=22,lane0=0,segment1=-3,lane1=1,withRoad=true,withTram=false}},crosswalks={22},trafficLightPreference='YES',trafficLightConfig={states={{lockedLanes={0,1},duration=12,minDuration=3,canSkip=false}},trafficLightType=4},doubleSlipSwitch=true,userModifiedLaneConnections=false,userModifiedTrafficLightStates=true}}}
copied.proposal.street.nodeConfigsToRemove={22}
local function ctor(init) return {new=function() return init and init() or {} end} end
local types={Proposal=ctor(),NodeAndEntity=ctor(),SegmentAndEntity=ctor(),BaseNodeLaneConnectionAndEntity=ctor(function()return{comp={}}end),TrafficLightConfig=ctor(),TrafficLightState=ctor(),Vec3f={new=function(x,y,z)return{x=x,y=y,z=z}end},Vec4f={new=function(x,y,z,w)return{x=x,y=y,z=z,w=w}end},Mat4f={new=function(a,b,c,d)return{a,b,c,d}end},GridVec2f={new=function(x0,y0,w,h)return{x0=x0,y0=y0,width=w,height=h}end},enum={}}
local components={BaseNode=ctor(),BaseEdge=ctor(),BaseEdgeStreet=ctor(),EmissionEmitter=ctor(),PlayerOwned=ctor()}
for _,name in ipairs({'BaseEdgeType','RoadType','EdgeObjectType','PrecedencePreference','TrafficLightPreference','TransportMode'}) do types.enum[name]=setmetatable({}, {__index=function(t,k)local x={name=k};rawset(t,k,x);return x end}) end
${mutation}
local result=rebuilder.rebuild(copied,types,components)
local config=result.proposal.proposal.nodeConfigsToAdd[1]
local comp=config.comp;local light=comp.trafficLightConfig;local state=light.states[1];local lane=comp.laneConnections[1]
return result.code,table.concat({config.entity,comp.trafficLightPreference.name,lane.segment0,lane.lane0,lane.segment1,lane.lane1,tostring(lane.withRoad),tostring(lane.withTram),comp.crosswalks[1],state.lockedLanes[1],state.lockedLanes[2],state.duration,state.minDuration,tostring(state.canSkip),light.trafficLightType,tostring(comp.doubleSlipSwitch),tostring(comp.userModifiedLaneConnections),tostring(comp.userModifiedTrafficLightStates),result.proposal.proposal.nodeConfigsToRemove[1]},':')
`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);try{assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));assert.equal(lua.lua_pcall(L,0,2,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));return[lua.lua_tojsstring(L,-2),lua.lua_tojsstring(L,-1)];}finally{lua.lua_close(L);}
}
test('experimental rebuilder uses public constructors and re-captures the full copied proposal',()=>{
  const [code,captureCode,json]=execute();assert.equal(code,'unregistered');assert.equal(captureCode,'captured',json);
  assert.deepEqual(parseRoadStopCapture(json).capture,parseRoadStopCapture(JSON.stringify(roadStopCaptureFixture())).capture);
});
test('experimental rebuilder fails with one fixed unqualified code when capability or schema is absent',()=>{
  for(const mutation of ['types.Vec4f=nil','components.BaseEdge=nil','types.enum.PrecedencePreference=nil','types.enum.BaseEdgeType=nil','copied.proposal.street.addedSegments[1].type=1','copied.proposal.terrain.baseHeightMod.width=1']){
    assert.throws(()=>execute(mutation),/ROAD_STOP_REBUILD_UNQUALIFIED/);
  }
});

test('rebuild preserves absent optional components even if constructors initialize them',()=>{
  const [code,captureCode,json]=execute('types.SegmentAndEntity.new=function() return {emissionEmitter={},playerOwned={player=999}} end');
  assert.equal(code,'unregistered');assert.equal(captureCode,'captured',json);
  assert.deepEqual(parseRoadStopCapture(json).capture,parseRoadStopCapture(JSON.stringify(roadStopCaptureFixture())).capture);
});

test('stock initialized wrapper components avoid unpublished BaseNode/BaseEdge factory paths',()=>{
  const [code,captureCode,json]=execute(`
types.NodeAndEntity.new=function() return {comp={}} end
types.SegmentAndEntity.new=function() return {comp={}} end
components.BaseNode=nil;components.BaseEdge=nil
`);
  assert.equal(code,'unregistered');assert.equal(captureCode,'captured',json);
  assert.deepEqual(parseRoadStopCapture(json).capture,parseRoadStopCapture(JSON.stringify(roadStopCaptureFixture())).capture);
});

test('fully initialized proposal records need no separate component or grid factory',()=>{
  const [code,captureCode,json]=execute(`
types.Proposal.new=function() return {terrain={baseHeightMod={x0=0,y0=0,width=0,height=0}}} end
types.NodeAndEntity.new=function() return {comp={}} end
types.SegmentAndEntity.new=function() return {comp={},streetEdge={},emissionEmitter={},playerOwned={}} end
types.GridVec2f=nil;components={}
`);
  assert.equal(code,'unregistered');assert.equal(captureCode,'captured',json);
  assert.deepEqual(parseRoadStopCapture(json).capture,parseRoadStopCapture(JSON.stringify(roadStopCaptureFixture())).capture);
  assert.throws(()=>execute('types.Proposal.new=function() return {terrain={baseHeightMod={width=1,height=1}}} end'),/ROAD_STOP_REBUILD_UNQUALIFIED/);
});

test('rebuild uses public node-config and traffic-light constructors',()=>{
  const [code,details]=inspectNodeConfig();
  assert.equal(code,'unregistered');
  assert.equal(details,'-9:YES:22:0:-3:1:true:false:22:0:1:12:3:false:4:true:false:true:22');
});

test('node configuration rejects missing native constructors and malformed bounded fields',()=>{
  const absent='copied.proposal.street.nodeConfigsToAdd[1].comp.userModifiedLaneConnections=nil;';
  const observed=inspectNodeConfig(absent+'types.BaseNodeLaneConnectionAndEntity.new=function() return {comp=setmetatable({}, {__newindex=function(t,k,v) if k=="userModifiedLaneConnections" then error("must not write absent field") end;rawset(t,k,v) end})} end');
  assert.equal(observed[0],'unregistered');
  assert.match(observed[1],/:nil:/);
  assert.throws(()=>inspectNodeConfig(absent+'types.BaseNodeLaneConnectionAndEntity.new=function()return{comp={userModifiedLaneConnections=false}}end'),/ROAD_STOP_REBUILD_UNQUALIFIED/);
  for(const mutation of [
    'types.BaseNodeLaneConnectionAndEntity=nil', 'types.TrafficLightConfig=nil', 'types.TrafficLightState=nil',
    'types.BaseNodeLaneConnectionAndEntity.new=function()return{}end', 'types.enum.TrafficLightPreference=nil',
    'copied.proposal.street.nodeConfigsToRemove={0}', 'copied.proposal.street.nodeConfigsToAdd[1].comp.trafficLightConfig.states[1].duration=0/0',
    'copied.proposal.street.nodeConfigsToAdd[1].comp.crosswalks[3]=22',
  ]) assert.throws(()=>inspectNodeConfig(mutation),/ROAD_STOP_REBUILD_UNQUALIFIED/);
});

test('rebuild rejects holes, oversized collections, unsupported edits and missing enums',()=>{
  for(const mutation of [
    'copied.proposal.street.addedSegments[3]=copied.proposal.street.addedSegments[1]',
    'for i=2,65 do copied.proposal.street.addedSegments[i]=copied.proposal.street.addedSegments[1] end',
    'copied.proposal.toAdd={{}}', 'copied.proposal.street.nodeConfigsToRemove={0}',
    'types.enum.RoadType={}', 'copied.proposal.street.edgeObjectsToAdd[1].modelInstance.transf[1]=0/0',
  ])assert.throws(()=>execute(mutation),/ROAD_STOP_REBUILD_UNQUALIFIED/);
});

test('rebuild redacts native getter, setter and constructor errors',()=>{
  for(const mutation of [
    'types.Proposal.new=function() error("private-native-detail") end',
    'components.BaseEdge.new=function() return setmetatable({}, {__newindex=function() error("private-native-detail") end}) end',
    'copied=setmetatable({}, {__index=function() error("private-native-detail") end})',
  ])assert.throws(()=>execute(mutation),error=>{
    assert.match(error.message,/ROAD_STOP_REBUILD_UNQUALIFIED/);
    assert.doesNotMatch(error.message,/private-native-detail/);return true;
  });
});

test('copied native precedence codes require independently supplied native values',()=>{
  const mutation=`
types.enum.PrecedencePreference=nil
for _,segments in ipairs({copied.proposal.street.addedSegments,copied.proposal.street.removedSegments}) do
  for _,s in ipairs(segments) do s.streetEdge.precedenceNode0={nativeCode=17};s.streetEdge.precedenceNode1={nativeCode=42} end
end
`;
  assert.throws(()=>execute(mutation),/ROAD_STOP_REBUILD_UNQUALIFIED/);
  assert.throws(()=>execute(mutation+'types.qualifiedPrecedenceValues={17}'),/ROAD_STOP_REBUILD_UNQUALIFIED/);
  const [code,captureCode,json]=execute(mutation+'types.qualifiedPrecedenceValues={17,42}');
  assert.equal(code,'unregistered');assert.equal(captureCode,'captured',json);
  const expected=roadStopCaptureFixture();
  for(const list of [expected.proposal.street.addedSegments,expected.proposal.street.removedSegments])
    for(const s of list){s.streetEdge.precedenceNode0={nativeCode:17};s.streetEdge.precedenceNode1={nativeCode:42};}
  assert.deepEqual(parseRoadStopCapture(json).capture,parseRoadStopCapture(JSON.stringify(expected)).capture);
});
