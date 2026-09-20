import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
import {roadStopCaptureFixture} from './fixtures/road-stop-capture.mjs';
import {parseRoadStopCapture} from '../src/road-stop-capture.mjs';
const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../experimental/native-road-stop-preflight.lua',import.meta.url),'utf8');
function literal(v){if(v===null)return'nil';if(typeof v==='string')return `string.char(${[...Buffer.from(v)].join(',')})`;if(typeof v==='number'||typeof v==='boolean')return String(v);return `{${Object.entries(v).map(([k,x])=>`[${Array.isArray(v)?Number(k)+1:literal(k)}]=${literal(x)}`).join(',')}}`;}
function run(mutation=''){
const fixture=roadStopCaptureFixture();
fixture.proposal.street.removedSegments[0].streetEdge={precedenceNode0:{nativeCode:2},precedenceNode1:{nativeCode:0}};
const copied=parseRoadStopCapture(JSON.stringify(fixture)).capture;
const script=`local m=(function() ${source} end)();local capture=${literal(copied)};local enum={};for _,n in ipairs({'BaseEdgeType','RoadType','EdgeObjectType','TransportMode'})do enum[n]=setmetatable({},{__index=function(t,k)local v={};rawset(t,k,v);return v end})end
local function deep(v)if type(v)~='table'then return v end;local o={};for k,x in pairs(v)do o[deep(k)]=deep(x)end;return o end;local function vec(a)return{x=a[1],y=a[2],z=a[3]}end
local actual={};local removed=deep(capture.proposal.street.removedSegments[1]);local edge=removed.comp;edge.type=enum.BaseEdgeType[edge.type];edge.roadType=enum.RoadType[edge.roadType];for _,n in ipairs({'position0','position1','tangent0','tangent1'})do edge[n]=vec(edge[n])end;for _,p in ipairs(edge.objects)do p[2]=enum.EdgeObjectType[p[2]]end;for _,ls in ipairs({edge.laneConfigs,edge.laneConfig})do for _,l in ipairs(ls)do local t={};for _,p in ipairs(l.transportModes)do t[enum.TransportMode[p[1]]]=p[2]end;l.transportModes=t end end
actual[22]={BASE_EDGE=edge,BASE_EDGE_STREET={precedenceNode0=2,precedenceNode1=0}};actual[10]={PLAYER={}};actual[99]={GAME_SPEED={speedup=0}}
local api={type={enum=enum,ComponentType={PLAYER='PLAYER',BASE_EDGE='BASE_EDGE',BASE_EDGE_STREET='BASE_EDGE_STREET',BASE_NODE='BASE_NODE',EMISSION_EMITTER='EMISSION_EMITTER',PLAYER_OWNED='PLAYER_OWNED',GAME_SPEED='GAME_SPEED'}},engine={util={getWorld=function()return 99 end},getComponent=function(e,k)return actual[e] and actual[e][k]end}};${mutation};local r=m.verify(capture,api,10);return r.code,r.proof and r.proof.removedSegments[1].precedenceNode0==2 and 'AUTO' or 'none',r.limitations and r.limitations[1] or 'none'`;
 const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);try{assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));assert.equal(lua.lua_pcall(L,0,3,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));return [lua.lua_tojsstring(L,-3),lua.lua_tojsstring(L,-2),lua.lua_tojsstring(L,-1)];}finally{lua.lua_close(L)}
}
test('read-only preflight proves current removed edge data and returns native precedence without an enum lookup',()=>assert.deepEqual(run(),['unregistered_preflight_checked','AUTO','symbolic_precedence_capture_unqualified_without_native_codes']));

test('world entity zero is valid for the live speed read, not a company or road reference',()=>{
  assert.equal(run('actual[0]=actual[99];actual[99]=nil;api.engine.util.getWorld=function()return 0 end')[0],'unregistered_preflight_checked');
  assert.equal(run('capture.proposal.street.removedSegments[1].entity=0')[0],'unregistered_preflight_rejected');
});
test('preflight rejects absent references, wrong company, unpaused state, changed edge/resource data, street fields, and throwing optional getters',()=>{
 for(const change of ['actual[22]=nil','capture.proposal.street.edgeObjectsToAdd[1].playerEntity=9','actual[10]=nil','actual[99].GAME_SPEED.speedup=1','capture.proposal.street.removedSegments[1].comp.distance=11','actual[22].BASE_EDGE.roadTemplate="changed"','actual[22].BASE_EDGE_STREET.precedenceNode0=1','capture.proposal.street.removedSegments[1].streetEdge.precedenceNode0="AUTO"','table.insert(capture.proposal.street.removedSegments,capture.proposal.street.removedSegments[1])','capture.proposal.street.removedNodes={{entity=30,comp={position={0,0,0}}}};actual[30]={BASE_NODE={position={x=1,y=0,z=0}}}'])assert.deepEqual(run(change),['unregistered_preflight_rejected','none','none']);
 assert.deepEqual(run('api.engine.getComponent=function(e,k)if k=="EMISSION_EMITTER"then error("private native text")end;return actual[e] and actual[e][k]end'),['unregistered_preflight_unknown','none','none']);
 assert.deepEqual(run('capture=setmetatable({}, {__index=function()error("private property text")end})'),['unregistered_preflight_unknown','none','none']);
});
