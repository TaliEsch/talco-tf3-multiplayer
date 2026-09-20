import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
import {roadStopCaptureFixture} from './fixtures/road-stop-capture.mjs';
import {parseRoadStopCapture} from '../src/road-stop-capture.mjs';
const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_road_capture.lua',import.meta.url),'utf8');

// Executes the actual Lua module. Mocks below represent declared field shapes,
// not TF3 userdata, access permissions, enum bindings or native side effects.
function literal(value){
  if(value===null)return 'nil';
  if(typeof value==='string')return `string.char(${[...Buffer.from(value)].join(',')})`;
  if(typeof value==='number'||typeof value==='boolean')return String(value);
  return `{${Object.entries(value).map(([key,v])=>`[${Array.isArray(value)?Number(key)+1:literal(key)}]=${literal(v)}`).join(',')}}`;
}
function run(mutation='',fixture=roadStopCaptureFixture(),resultExpression='return result.code,result.json or result.field'){
  const setup=`
local adapter=(function() ${source} end)()
local copied=${literal(fixture)}
local proposal=copied.proposal
proposal.proposal=proposal.street; proposal.street=nil
local enums={}
for _, name in ipairs({'BaseEdgeType','RoadType','EdgeObjectType','PrecedencePreference','TransportMode'}) do
  enums[name]=setmetatable({}, {__index=function(t,k) local v={}; rawset(t,k,v); return v end})
end
enums.Mat4f={cols=function(v,col)
  local i=(col-1)*4; return {x=v[i+1],y=v[i+2],z=v[i+3],w=v[i+4]}
end}
local function vec(v) return {x=v[1],y=v[2],z=v[3]} end
local function map(entries) local out={}; for _,entry in ipairs(entries) do out[entry[1]]=entry[2] end;return out end
local street=proposal.proposal
street.new2oldEdgeObjects=map(street.new2oldEdgeObjects)
street.old2newEdgeObjects=map(street.old2newEdgeObjects)
proposal.old2new=map(proposal.old2new)
for _,nodes in ipairs({street.addedNodes,street.removedNodes}) do
  for _,node in ipairs(nodes) do node.comp.position=vec(node.comp.position) end
end
for _,segments in ipairs({street.addedSegments,street.removedSegments}) do
  for _,s in ipairs(segments) do
    local e=s.comp
    e.type=enums.BaseEdgeType[e.type];e.roadType=enums.RoadType[e.roadType]
    for _,name in ipairs({'position0','position1','tangent0','tangent1'}) do e[name]=vec(e[name]) end
    for _,object in ipairs(e.objects) do object[2]=enums.EdgeObjectType[object[2]] end
    for _,lanes in ipairs({e.laneConfigs,e.laneConfig}) do
      for _,lane in ipairs(lanes) do local modes={};for _,mode in ipairs(lane.transportModes) do modes[enums.TransportMode[mode[1]]]=mode[2] end;lane.transportModes=modes end
    end
    s.streetEdge.precedenceNode0=enums.PrecedencePreference[s.streetEdge.precedenceNode0]
    s.streetEdge.precedenceNode1=enums.PrecedencePreference[s.streetEdge.precedenceNode1]
    if s.emissionEmitter then s.emissionEmitter.position=vec(s.emissionEmitter.position) end
  end
end
${mutation}
local result=adapter.collect(proposal,{enum=enums,Mat4f=enums.Mat4f})
${resultExpression}
`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    lua.lua_sethook(L,()=>lauxlib.luaL_error(L,to_luastring('TEST_INSTRUCTION_LIMIT')),lua.LUA_MASKCOUNT,10_000_000);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(setup)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    const status=lua.lua_pcall(L,0,2,0);
    assert.equal(status,lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return {code:lua.lua_tojsstring(L,-2),value:lua.lua_tojsstring(L,-1)};
  }finally{lua.lua_close(L);}
}

test('Lua capture round-trips all declared fixture fields through the real JS codec',()=>{
  const fixture=roadStopCaptureFixture(),result=run('',fixture);
  assert.equal(result.code,'captured',result.value);
  assert.deepEqual(parseRoadStopCapture(result.value),parseRoadStopCapture(JSON.stringify(fixture)));
});

test('Lua diagnostic hex encoding preserves bytes and bounds input',()=>{
  const text='quote"\\ newline\n\u0000 é 🚎';
  assert.deepEqual(run('',roadStopCaptureFixture(),`return "hex",adapter.toHex(${literal(text)})`),
    {code:'hex',value:Buffer.from(text).toString('hex')});
  for(const expression of ['nil','{}','""','string.rep("x",262145)'])
    assert.deepEqual(run('',roadStopCaptureFixture(),`return "bounded",adapter.toHex(${expression}) == nil and "yes" or "no"`),{code:'bounded',value:'yes'});
});

test('Lua capture preserves JSON escaping and optional components as explicit null',()=>{
  const fixture=roadStopCaptureFixture();
  fixture.proposal.street.addedSegments[0].comp.roadTemplate='unicode-é/quote"\\line\n\t\u0001';
  const result=run('',fixture);assert.equal(result.code,'captured',result.value);
  assert.deepEqual(parseRoadStopCapture(result.value).capture,parseRoadStopCapture(JSON.stringify(fixture)).capture);
});

test('Lua capture rejects missing enums, malformed arrays, unsupported edits and nonfinite values',()=>{
  for(const [mutation,field] of [
    ['street.addedSegments[1].comp.type=nil; enums.BaseEdgeType={}','edgeType'],
    ['street.addedSegments[1].comp.distance=0/0','distance'],
    ['street.edgeObjectsToAdd[1].playerEntity=0','playerEntity'],
    ['street.addedSegments[1].comp.objects[100]={1,enums.EdgeObjectType.STOP_LEFT}','objects'],
    ['street.addedSegments[1].comp.roadType=enums.RoadType.TRACK','roadType'],
    ['enums.PrecedencePreference=nil','precedence'],
    ['proposal.terrain.baseHeightMod.width=1','terrain'],
    ['street.nodeConfigsToRemove={5}','nodeConfigs'],
    ['proposal.toAdd={{}}','toAdd'],
  ])assert.deepEqual(run(mutation),{code:'unsupported',value:field});
});

test('Lua capture never leaks a native exception or retains native matrices on failure',()=>{
  assert.deepEqual(run('enums.Mat4f.cols=function() error("private-native-error") end'),{code:'unsupported',value:'matrix'});
  assert.deepEqual(run('proposal=setmetatable({}, {__index=function() error("private-native-error") end})'),{code:'unsupported',value:'proposal'});
  assert.deepEqual(run('proposal=setmetatable({}, {__index=function() error(setmetatable({}, {__index=function() error("private-error-reader") end})) end})'),{code:'unsupported',value:'proposal'});
});

test('Lua capture enforces both record and total serialized-byte bounds',()=>{
  assert.deepEqual(run('for i=2,65 do street.addedSegments[i]=street.addedSegments[1] end'),{code:'unsupported',value:'addedSegments'});
  assert.deepEqual(run(`
street.addedSegments[1].comp.roadTemplate=string.rep('x',1024)
street.addedSegments[1].comp.roadStyle=string.rep('y',1024)
street.removedSegments[1].comp.roadTemplate=string.rep('x',1024)
street.removedSegments[1].comp.roadStyle=string.rep('y',1024)
for i=2,64 do street.addedSegments[i]=street.addedSegments[1];street.removedSegments[i]=street.removedSegments[1] end
`),{code:'unsupported',value:'output'});
});
