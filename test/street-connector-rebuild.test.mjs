import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_road_replay_rebuild.lua',import.meta.url),'utf8');
function literal(v){
  if(v===null)return'nil';
  if(typeof v==='string')return `string.char(${[...Buffer.from(v)].join(',')})`;
  if(typeof v==='number'||typeof v==='boolean')return String(v);
  return `{${Object.entries(v).map(([k,x])=>`[${Array.isArray(v)?Number(k)+1:literal(k)}]=${literal(x)}`).join(',')}}`;
}
function recordedShape(){
  const modes=['AIRCRAFT','BUS','CAR','CARGO','ELECTRIC_TRAIN','ELECTRIC_TRAM','ELECTRIC_TRAM_TRACK','HELICOPTER','PERSON','SHIP','SMALL_AIRCRAFT','SMALL_SHIP','TRAIN','TRAM','TRAM_TRACK','TRUCK'];
  const lane=(forward,offset,foot)=>({forward,height:foot?0.15:0,offset,speed:16.67,width:foot?2:5,
    transportModes:modes.map(mode=>[mode,foot ? mode==='PERSON'||mode==='CARGO' : mode==='BUS'||mode==='CAR'||mode==='TRUCK'])});
  const comp=(node0,node1)=>({type:'NORMAL',typeIndex:-1,objects:[],laneConfigs:[lane(false,-1,true),lane(false,-0.5,false),lane(true,0.5,false),lane(true,1,true)],roadDevelopmentLocked:false,
    node0,node1,position0:[0,0,0],position1:[1,0,0],tangent0:[1,0,0],tangent1:[1,0,0],
    laneConfig:null,edgeDecorations:[],distance:0,roadType:'STREET',roadTemplate:'town.street_template',roadStyle:'town.street'});
  const segment=(entity,node0,node1,owned={player:0})=>({entity,type:0,comp:comp(node0,node1),
    streetEdge:{precedenceNode0:{nativeCode:2},precedenceNode1:{nativeCode:2}},emissionEmitter:null,playerOwned:owned});
  const link=(segment0,segment1)=>({segment0,lane0:1,segment1,lane1:2,withRoad:true,withTram:false});
  const config=(entity,connections,crosswalks)=>({entity,comp:{laneConnections:connections,crosswalks,trafficLightPreference:'AUTO',
    trafficLightConfig:{states:[],trafficLightType:-1},doubleSlipSwitch:false,
    userModifiedLaneConnections:null,userModifiedTrafficLightStates:false}});
  return {schemaVersion:1,builderId:'streetBuilder',stage:'create',sourceSchema:'Proposal.StreetProposal',proposal:{
    street:{addedNodes:[{entity:-1,comp:{position:[0,0,0]}},{entity:-5,comp:{position:[1,0,0]}}],
      removedNodes:[{entity:27819,comp:{position:[0.5,0,0]}}],
      addedSegments:[segment(-2,28831,-1,{player:15702}),segment(-4,-1,27820),segment(-6,27371,-5),segment(-7,-5,-1)],
      removedSegments:[segment(27825,27819,27820),segment(27824,27371,27819)],
      edgeObjectsToAdd:[],edgeObjectsToRemove:null,new2oldEdgeObjects:[],old2newEdgeObjects:[],node2rcType:null,
      nodeConfigsToAdd:[config(28831,[link(-2,28836),link(28836,-2)],[-2,28836]),
        config(-1,[link(-7,-2),link(-2,-7),link(-7,-4),link(-2,-4),link(-4,-7),link(-4,-2)],[-2]),
        config(27820,[link(-4,27826),link(27826,-4)],[]),
        config(-5,[link(-7,-6),link(-6,-7)],[]),
        config(27371,[link(-6,27823),link(27823,-6)],[])],nodeConfigsToRemove:[28831,27820,27371]},
    toAdd:[],toRemove:[],old2new:[],terrain:{baseHeightMod:{x0:0,y0:0,width:0,height:0}}}};
}
function execute(change=''){
  const script=`
local rebuild=(function() ${source} end)()
local copied=${literal(recordedShape())}
local function ctor(init) return {new=function(...)return init and init(...) or {} end} end
local types={Proposal=ctor(),NodeAndEntity=ctor(function()return{comp={}}end),SegmentAndEntity=ctor(function()return{comp={},streetEdge={}}end),BaseNodeLaneConnectionAndEntity=ctor(function()return{comp={}}end),TrafficLightConfig=ctor(),TrafficLightState=ctor(),Vec3f=ctor(function(x,y,z)return{x,y,z}end),GridVec2f=ctor(function(x,y,w,h)return{x0=x,y0=y,width=w,height=h}end),enum={},qualifiedPrecedenceValues={2}}
local components={BaseEdgeStreet=ctor(),PlayerOwned=ctor()}
for _,name in ipairs({'BaseEdgeType','RoadType','EdgeObjectType','TrafficLightPreference','TransportMode'}) do types.enum[name]=setmetatable({}, {__index=function(t,k)local x={name=k};rawset(t,k,x);return x end}) end
local options={qualifiedStreetProposalSchema='Proposal.StreetProposal',expectedOwner=25702,
 entityMap={[28831]=38831,[28836]=38836,[27819]=37819,[27820]=37820,[27826]=37826,[27823]=37823,[27371]=37371,[27825]=37825,[27824]=37824,[15702]=25702}}
${change}
local result=rebuild.rebuild(copied,types,components,options)
local s=result.proposal.proposal
return table.concat({result.code,#s.addedNodes,#s.removedNodes,#s.addedSegments,#s.removedSegments,#s.nodeConfigsToAdd,#s.nodeConfigsToRemove,s.addedSegments[1].comp.node0,s.addedSegments[1].comp.node1,s.addedSegments[1].playerOwned.player,s.removedNodes[1].entity,s.nodeConfigsToRemove[1],s.addedSegments[1].streetEdge.precedenceNode0,s.nodeConfigsToAdd[1].comp.laneConnections[1].segment1,s.nodeConfigsToAdd[1].comp.crosswalks[2],s.addedSegments[2].playerOwned.player,#s.addedSegments[2].comp.laneConfigs},':')
`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try {assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,1,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));return lua.lua_tojsstring(L,-1);
  } finally {lua.lua_close(L);}
}
test('rebuilds the observed two node, four segment connector with mapped positive entities',()=>{
  assert.equal(execute(),'unregistered:2:1:4:2:5:3:38831:-1:25702:37819:38831:2:38836:38836:0:4');
});
test('connector requires independent schema, precedence, owner and per-instance entity evidence',()=>{
  for(const change of [
    'options.qualifiedStreetProposalSchema=nil', 'types.qualifiedPrecedenceValues=nil',
    'options.entityMap[27820]=nil', 'options.entityMap[27820]=38831',
    'options.expectedOwner=15702', 'copied.proposal.street.edgeObjectsToRemove={27820}',
    'copied.proposal.street.node2rcType={{27820,1}}',
    'copied.proposal.street.addedSegments[1].playerOwned=nil',
    'copied.proposal.street.addedSegments[1].playerOwned={player=0}',
    'copied.proposal.street.addedSegments[2].playerOwned={player=15702}',
    'copied.proposal.street.removedSegments[1].comp.node0=27371',
  ]) assert.throws(()=>execute(change),/ROAD_STOP_REBUILD_UNQUALIFIED/,change);
});

