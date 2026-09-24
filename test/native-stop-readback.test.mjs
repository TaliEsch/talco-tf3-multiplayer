import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';
import {parseRoadStopReadbackEnvelope} from '../src/road-stop-readback.mjs';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const source=await readFile(new URL('../mod/content/tf3mp_stop_readback.lua',import.meta.url),'utf8');
const gameScript=await readFile(new URL('../mod/content/tf3mp_status.script.tl',import.meta.url),'utf8');
const panelScript=await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl',import.meta.url),'utf8');
function nativeNamespace(L, globalName, constants){
  lua.lua_newuserdata(L,0);
  lua.lua_newtable(L);
  lua.lua_pushcfunction(L,state=>{
    const key=lua.lua_tojsstring(state,2);
    if(Object.hasOwn(constants,key) && constants[key] !== undefined) lua.lua_pushstring(state,to_luastring(constants[key]));
    else lua.lua_pushnil(state);
    return 1;
  });
  lua.lua_setfield(L,-2,to_luastring('__index'));
  lua.lua_setmetatable(L,-2);
  lua.lua_setglobal(L,to_luastring(globalName));
}
function nativeCallable(L, globalName){
  // Model callable userdata without assuming the live TF3 representation. The
  // Lua side supplies __call so these exercise the public binding shape directly.
  lua.lua_newuserdata(L,0);
  lua.lua_setglobal(L,to_luastring(globalName));
}
function run(mutation='', namespaces={}){
  const componentConstants=namespaces.component;
  const edgeConstants=namespaces.edge;
  const componentType=componentConstants ? 'NativeComponentType' : "{GAME_SPEED='GAME_SPEED',GAME_TIME='GAME_TIME',EDGE_OBJECT='EDGE_OBJECT',PLAYER_OWNED='PLAYER_OWNED',BASE_EDGE='BASE_EDGE',MODEL_INSTANCE_LIST='MODEL_INSTANCE_LIST'}";
  const edgeObjectType=edgeConstants ? 'NativeEdgeObjectType' : "{STOP_LEFT='STOP_LEFT',STOP_RIGHT='STOP_RIGHT',SIGNAL='SIGNAL'}";
  const script=`
local m=(function()${source}end)()
local reads=0
local clockHandles={}
local CT=${componentType}
local stop={param=.25,transf={columns={{x=1,y=2,z=3,w=4},{x=5,y=6,z=7,w=8},{x=9,y=10,z=11,w=12},{x=13,y=14,z=15,w=16}},cols=function(self,col)return self.columns[col+1]end},edgeObjectConstruction='construction/road_stop.con',params={z='last',[9]='nine',a=true,nested={b=2}}}
local data={[0]={GAME_SPEED={speedup=0},GAME_TIME={tickCount=77,updateCount=44}},[50]={EDGE_OBJECT=stop,PLAYER_OWNED={player=10}},[60]={BASE_EDGE={objects={{50,'STOP_LEFT'}}}},[51]={PLAYER_OWNED={player=11}}}
local api={type={ComponentType=CT,enum={EdgeObjectType=${edgeObjectType}},Mat4f={}},engine={util={getWorld=function()return 0 end},system={streetSystem={getEdgeForEdgeObject=function(id) if id==50 then return 60 end end}},entityExists=function(id)return data[id]~=nil end,getComponent=function(id,kind) reads=reads+1;if kind==CT.GAME_SPEED or kind==CT.GAME_TIME then clockHandles[#clockHandles+1]=tostring(id) end;return data[id] and data[id][kind] end}}
local request={schemaVersion=1,nonce=string.rep('a',32),observationId=3,companyEntity=10,resultEntities={50,51},oneWay=false,name='Observed stop'}
${mutation}
local r=m.collect(api,request)
return r.code,r.json or '',reads,r.field or '',table.concat(clockHandles, ','),r.modelId or -1,r.modelResourceName or '',r.constructionResourceValue or '',r.replacementProbe and (r.replacementProbe.code .. ':' .. tostring(r.replacementProbe.added or -1) .. ':' .. tostring(r.replacementProbe.firstAddedEntity or 0)) or ''
`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);try{
    if(componentConstants) nativeNamespace(L,'NativeComponentType',componentConstants);
    if(edgeConstants) nativeNamespace(L,'NativeEdgeObjectType',edgeConstants);
    for(const name of ['NativeGetWorld','NativeGetComponent','NativeEntityExists','NativeGetEdge','NativeMat4Cols']) nativeCallable(L,name);
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,9,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return [lua.lua_tojsstring(L,-9),lua.lua_tojsstring(L,-8),lua.lua_tointeger(L,-7),lua.lua_tojsstring(L,-6),lua.lua_tojsstring(L,-5),lua.lua_tointeger(L,-4),lua.lua_tojsstring(L,-3),lua.lua_tojsstring(L,-2),lua.lua_tojsstring(L,-1)];
  }finally{lua.lua_close(L);}
}
const nativeComponents={GAME_SPEED:'GAME_SPEED',GAME_TIME:'GAME_TIME',EDGE_OBJECT:'EDGE_OBJECT',PLAYER_OWNED:'PLAYER_OWNED',BASE_EDGE:'BASE_EDGE',MODEL_INSTANCE_LIST:'MODEL_INSTANCE_LIST'};
const nativeEdgeObjects={STOP_LEFT:'STOP_LEFT',STOP_RIGHT:'STOP_RIGHT',SIGNAL:'SIGNAL'};
function runPreAction(mutation=''){
  const script=`local m=(function()${source}end)()
local preview={proposal={addedSegments={{entity=-1}},removedSegments={{entity=60}},edgeObjectsToAdd={{category=0,playerEntity=10}}}}
local data={[0]={GAME_SPEED={speedup=0},GAME_TIME={tickCount=77,updateCount=44}},[10]={PLAYER={}},[60]={BASE_EDGE={objects={}}}}
local api={type={ComponentType={GAME_SPEED='GAME_SPEED',GAME_TIME='GAME_TIME',PLAYER='PLAYER',BASE_EDGE='BASE_EDGE'}},
  res={modelRep={getName=function(id)assert(id==3940);return '::/stations/street/small_stops/small_mid.mdl'end}},
  engine={util={getWorld=function()return 0 end,getPlayer=function()return 10 end,
    proposal={replaceSegment=function(id)assert(id==60);return{proposal={addedSegments={{entity=-1,comp={objects={}}}},removedSegments={{entity=60}},addedNodes={},removedNodes={},edgeObjectsToAdd={}}}end}},
    entityExists=function(id)return data[id]~=nil end,getComponent=function(id,kind)return data[id]and data[id][kind]end}}
local request={nonce=string.rep('a',32),observationId=3,edgeEntity=60,companyEntity=10}
local preparer={prepare=function(_,input)assert(input.edgeEntity==60 and input.companyEntity==10)
  assert(input.model=='::/stations/street/small_stops/small_mid.mdl' and input.param==0.5)
  return{code='prepared'}end}
${mutation}
local candidate=m.copyPreview(preview,3)
local receipt=m.preActionProbe(api,request,preparer)
return candidate and candidate.edgeEntity or 0,candidate and candidate.companyEntity or 0,
  receipt.code,receipt.edgeEntity or 0,receipt.temporaryEdgeEntity or 0,receipt.commandCode or '',receipt.field or ''`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,7,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return [lua.lua_tointeger(L,-7),lua.lua_tointeger(L,-6),lua.lua_tojsstring(L,-5),lua.lua_tointeger(L,-4),lua.lua_tointeger(L,-3),lua.lua_tojsstring(L,-2),lua.lua_tojsstring(L,-1)];
  }finally{lua.lua_close(L);}
}
test('pre-action preview and read-only factory agree on the untouched road and company',()=>{
  assert.deepEqual(runPreAction(),[60,10,'shape',60,-1,'notRequested','']);
  for(const change of [
    'preview.proposal.removedSegments[1].entity=-1',
    'preview.proposal.edgeObjectsToAdd[1].playerEntity=0',
    'request.companyEntity=11',
    'data[60].BASE_EDGE.objects={{50,1}}',
    'data[0].GAME_SPEED.speedup=1',
    'api.engine.util.proposal.replaceSegment=function()error("private")end',
  ]){
    const value=runPreAction(change);
    if(change.startsWith('preview.'))assert.equal(value[0],0,change);
    else assert.equal(value[2],'unavailable',change);
  }
  assert.equal(runPreAction('data[60].BASE_EDGE.objects={{50,1}}')[6],'road');
  assert.equal(runPreAction('api.engine.util.proposal.replaceSegment=function()error("private")end')[6],'replacement');
  assert.match(gameScript,/name == "tf3mp_road_preaction_probe"/);
  assert.match(panelScript,/"road_stop_preaction_probe"/);
});
test('pre-action command probe builds a centre-position command value without submission',()=>{
  const value=runPreAction(`preview.proposal.edgeObjectsToAdd[1].left=true
preview.proposal.edgeObjectsToAdd[1].modelInstance={modelId=3940}
request.model='::/stations/street/small_stops/small_mid.mdl';request.left=true`);
  assert.deepEqual(value,[60,10,'shape',60,-1,'prepared','']);
  assert.match(panelScript,/saved\.commandCode = receipt\.commandCode/);
});
test('copies one returned owned stop to bounded deterministic JSON',()=>{
  assert.doesNotMatch(source,/api\.cmd|sendCommand|makeWorldBuildProposalCmd|saveUserdata|io\.|os\./);
  const [code,json]=run(); assert.equal(code,'readback'); assert.ok(Buffer.byteLength(json)<=64*1024);
  assert.deepEqual(JSON.parse(json),{schemaVersion:1,kind:'road_stop_readback',nonce:'a'.repeat(32),observationId:3,companyEntity:10,updateCount:44,tickCount:77,stopEntity:50,edgeEntity:60,param:.25,oneWay:false,name:'Observed stop',left:true,transform:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],constructionResource:'construction/road_stop.con',params:{kind:'table',entries:[{keyType:'number',key:9,value:{kind:'string',value:'nine'}},{keyType:'string',key:'a',value:{kind:'boolean',value:true}},{keyType:'string',key:'nested',value:{kind:'table',entries:[{keyType:'string',key:'b',value:{kind:'number',value:2}}]}},{keyType:'string',key:'z',value:{kind:'string',value:'last'}}]}});
});
test('read-only replacement factory probe names the owned stop road and does not authorize a command',()=>{
  const mutation=`api.engine.util.proposal={replaceSegment=function(id)
    assert(id==60);return {proposal={addedSegments={{entity=-1,comp={objects={{50,'STOP_LEFT'}}}}},removedSegments={{entity=60}},edgeObjectsToAdd={}}}
  end}`;
  const result=run(mutation);
  assert.equal(result[0],'readback');
  assert.equal(result[8],'shape:1:-1');
  assert.equal(run('api.engine.util.proposal={replaceSegment=function()error("private native failure")end}')[8],'factoryFailed:-1:0');
  assert.match(gameScript,/receipt\.replacementProbeCode = "shape"/);
  assert.match(gameScript,/type\(probe\.firstAddedEntity\) == "number" and probe\.firstAddedEntity % 1 == 0[\s\S]*?probe\.firstAddedEntity >= -2147483647/);
  assert.doesNotMatch(gameScript,/validInteger\(probe\.firstAddedEntity\)/);
  assert.match(gameScript,/receipt\.replacementProbeCode = "sourceMissing"/);
  assert.match(panelScript,/receipt\.replacementProbeCode/);
  assert.match(panelScript,/code = "bridgeMissing"/);
  assert.match(panelScript,/"road_stop_replacement_probe"/);
});
test('the Lua snapshot is accepted by the JavaScript native-envelope codec',()=>{
  const [,json]=run(); const snapshotHex=Buffer.from(json,'utf8').toString('hex');
  const envelope=`function data() return {schemaVersion=1,kind="road_stop_readback",nonce="${'a'.repeat(32)}",observationId=3,snapshotHex="${snapshotHex}",} end`;
  const parsed=parseRoadStopReadbackEnvelope(envelope);
  assert.equal(parsed.executionAuthorized,false);
  assert.equal(parsed.snapshot.stopEntity,50);
  assert.equal(parsed.snapshot.params.entries[0].key,9);
});
test('reads through actual native userdata component and edge-object enum namespaces',()=>{
  const [code,json]=run('',{component:nativeComponents,edge:nativeEdgeObjects});
  assert.equal(code,'readback');
  assert.equal(JSON.parse(json).left,true);
});
test('denies missing or malformed native clock and enum reads without leaking errors',()=>{
  assert.deepEqual(run('',{component:{...nativeComponents,GAME_TIME:undefined},edge:nativeEdgeObjects}).slice(0,4),['unavailable','',0,'clockComponents']);
  assert.deepEqual(run('',{component:nativeComponents,edge:{STOP_RIGHT:'STOP_RIGHT'}}).slice(0,4),['unavailable','',7,'attachedEdge']);
  assert.deepEqual(run('data[0].GAME_SPEED.speedup=1',{component:nativeComponents,edge:nativeEdgeObjects}).slice(0,4),['unavailable','',2,'clockPaused']);
  assert.deepEqual(run('data[0].GAME_TIME.tickCount=-1',{component:nativeComponents,edge:nativeEdgeObjects}).slice(0,4),['unavailable','',2,'clockValues']);
});
test('accepts trusted signed and unsigned 32-bit world handles unchanged',()=>{
  for(const world of [-1,4294967295]){
    const [code,json,,field,handles]=run(`data[${world}]=data[0];data[0]=nil;api.engine.util.getWorld=function()return ${world} end`);
    assert.equal(code,'readback',`${world}: ${field}`);
    assert.equal(JSON.parse(json).tickCount,77);
    assert.deepEqual(handles.split(',').map(Number),[world,world]);
  }
});
test('denies malformed world handles before any component read',()=>{
  for(const value of ['nil',"'0'",'0.5','0/0']){
    const [code,json,reads,field]=run(`api.engine.util.getWorld=function()return ${value} end`);
    assert.deepEqual([code,json,reads,field],['unavailable','',0,'clockIdentity'],value);
  }
});
test('calls callable native userdata APIs without requiring Lua function bindings',()=>{
  const mutation=`
debug.setmetatable(NativeGetWorld,{__call=function() return 0 end})
debug.setmetatable(NativeGetComponent,{__call=function(_,id,kind) reads=reads+1;if kind==CT.GAME_SPEED or kind==CT.GAME_TIME then clockHandles[#clockHandles+1]=tostring(id) end;return data[id] and data[id][kind] end})
debug.setmetatable(NativeEntityExists,{__call=function(_,id) return data[id]~=nil end})
debug.setmetatable(NativeGetEdge,{__call=function(_,id) if id==50 then return 60 end end})
debug.setmetatable(NativeMat4Cols,{__call=function(_,m,col) return m.columns[col+1] end})
api.engine.util.getWorld=NativeGetWorld
api.engine.getComponent=NativeGetComponent
api.engine.entityExists=NativeEntityExists
api.engine.system.streetSystem.getEdgeForEdgeObject=NativeGetEdge
stop.transf.cols=NativeMat4Cols`;
  assert.equal(run(mutation)[0],'readback');
});
test('missing or throwing native API calls fail closed at their lookup stage',()=>{
  for(const [mutation,field] of [
    ['api.engine.util.getWorld=nil','clockLookup'],
    ['api.engine.util.getWorld=function() error("private getWorld error") end','clockLookup'],
    ['api.engine.getComponent=nil','clockComponents'],
    ['api.engine.getComponent=function() error("private component error") end','clockComponents'],
    ['api.engine.entityExists=nil','resultEntity'],
    ['api.engine.entityExists=function() error("private entity error") end','resultEntity'],
    ['api.engine.system.streetSystem.getEdgeForEdgeObject=nil','attachedEdge'],
    ['api.engine.system.streetSystem.getEdgeForEdgeObject=function() error("private edge error") end','attachedEdge'],
    ['stop.transf.cols=nil','transform'],
    ['stop.transf.cols=function() error("private transform error") end','transform'],
  ]){
    const [code,json,,actualField]=run(mutation);
    assert.deepEqual([code,json],['unavailable',''],mutation);
    assert.equal(actualField,field,mutation);
  }
});
test('fails closed when the zero-based instance matrix accessor cannot provide its final column',()=>{
  for(const mutation of ['stop.transf.columns[4]=nil', 'stop.transf.columns[4]={x=13,y=14,z=15}']){
    const [code,json,,field]=run(mutation);
    assert.deepEqual([code,json,field],['unavailable','','transform'],mutation);
  }
});
test('classifies an unreadable construction resource and bounds its private diagnostic',()=>{
  for(const [mutation,field] of [
    ['stop.edgeObjectConstruction=nil','constructionResourceNil'],
    ['stop.edgeObjectConstruction=false','constructionResourceType'],
    ["stop.edgeObjectConstruction=''",'constructionResourceEmpty'],
    ["stop.edgeObjectConstruction='../unsafe.con'",'constructionResourceSyntax'],
  ]){
    const [code,json,,actualField]=run(mutation);
    assert.deepEqual([code,json,actualField],['unavailable','',field],mutation);
  }
  assert.equal(run("stop.edgeObjectConstruction='../unsafe.con'")[7],'../unsafe.con');
  assert.equal(run("stop.edgeObjectConstruction=string.rep('x',1025)")[7],'');
  assert.equal(run("stop.edgeObjectConstruction=false")[7],'');
});
test('accepts TF3 base-game resource namespace from a placed road stop',()=>{
  const value='::/stations/street/small_stops/small_mid.con';
  const [code,json]=run(`stop.edgeObjectConstruction='${value}'`);
  assert.equal(code,'readback');
  assert.equal(JSON.parse(json).constructionResource,value);
  for(const bad of ['::/../unsafe.con',':://stations/unsafe.con','other::/stations/unsafe.con'])
    assert.equal(run(`stop.edgeObjectConstruction='${bad}'`)[0],'unavailable');
});
test('copies a unique rendered model identity when the construction resource is unavailable',()=>{
  const setup="stop.edgeObjectConstruction=nil;data[50].MODEL_INSTANCE_LIST={fatInstances={{modelId=21}},thinInstances={}};api.res={modelRep={getName=function(id) if id==21 then return 'model/road_stop.mdl' end end}}";
  assert.deepEqual(run(setup).slice(0,4),['unavailable','',8,'constructionResourceNil']);
  assert.deepEqual(run(setup).slice(5,7),[21,'model/road_stop.mdl']);
  for(const change of [
    ';data[50].MODEL_INSTANCE_LIST.fatInstances[2]={modelId=22}',
    ';data[50].MODEL_INSTANCE_LIST.thinInstances[1]={modelId=22}',
    ";api.res.modelRep.getName=function()return '../bad.mdl' end",
    ';data[50].MODEL_INSTANCE_LIST.fatInstances[1].modelId=-1',
  ]) assert.deepEqual(run(setup+change).slice(5,7),[-1,'']);
});
test('copies a unique rendered model identity alongside a successful placed-stop readback',()=>{
  const setup="data[50].MODEL_INSTANCE_LIST={fatInstances={{modelId=21}},thinInstances={}};api.res={modelRep={getName=function(id) if id==21 then return 'model/road_stop.mdl' end end}}";
  assert.deepEqual(run(setup).slice(0,2).map((x,i)=>i===0?x:JSON.parse(x).kind),['readback','road_stop_readback']);
  assert.deepEqual(run(setup).slice(5,7),[21,'model/road_stop.mdl']);
  assert.match(gameScript,/receipt\.code = "readback"; receipt\.json = result\.json[\s\S]*?receipt\.modelResourceName = result\.modelResourceName/);
  assert.match(panelScript,/app\.saveUserdata\("tf3mp_status_1", "road_stop_readback"[\s\S]*?app\.saveUserdata\("tf3mp_status_1", "road_stop_model_diagnostic"/);
});
test('engine readback receipt forwards only bounded diagnostics to the panel',()=>{
  assert.match(gameScript,/result\.field == "constructionResourceSyntax"[\s\S]*?#result\.constructionResourceValue <= 1024[\s\S]*?receipt\.constructionResourceValue = result\.constructionResourceValue/);
  assert.match(gameScript,/result\.field == "constructionResourceNil"[\s\S]*?receipt\.modelId = result\.modelId[\s\S]*?receipt\.modelResourceName = result\.modelResourceName/);
  assert.match(panelScript,/receipt\.constructionResourceValue[\s\S]*?app\.saveUserdata\("tf3mp_status_1", "road_stop_construction_diagnostic"/);
});
test('returns fixed unavailable for request, pause, candidate, edge, and copy boundaries',()=>{
  for(const change of [
    'request.extra=true', 'request.oneWay=nil', 'request.name=string.rep("x",1025)', 'request.resultEntities={50,50}', 'data[0].GAME_SPEED.speedup=1',
    'data[0].GAME_TIME.tickCount=-1', 'data[0].GAME_TIME.tickCount=2147483648', 'data[50].PLAYER_OWNED.player=9',
    'data[51].EDGE_OBJECT=stop', 'data[50]=nil', 'data[60]=nil',
    "data[60].BASE_EDGE.objects={{50,'SIGNAL'}}", 'data[60].BASE_EDGE.objects={{50,\'STOP_LEFT\'},{50,\'STOP_RIGHT\'}}',
    'stop.param=1.1', "stop.edgeObjectConstruction='../unsafe.con'", "stop.edgeObjectConstruction='construction/'", "stop.edgeObjectConstruction='/construction/stop'", "stop.edgeObjectConstruction='construction//stop'", 'stop.params=setmetatable({}, {})',
    'stop.params.loop=stop.params', 'stop.params.deep={a={b={c={d={e=1}}}}}', "stop.params.bad=function()end",
    "stop.params['bad-key']=1", 'stop.params.too=9007199254740992',
  ]) assert.equal(run(change)[0],'unavailable',change);
});
test('does not discover replacements outside the supplied result entities',()=>{
  const [code,,reads]=run('request.resultEntities={51}');
  assert.equal(code,'unavailable'); assert.equal(reads,4); // clock plus only entity 51 component reads
});
test('copyApply copies only bounded native-event scalars without aliases',()=>{
  const script=`local m=(function()${source}end)();local p={proposal={edgeObjectsToAdd={{category=0,playerEntity=10,oneWay=true,name='Native name'}}}};local ids={50,51};local r=m.copyApply(p,ids,3);p.proposal.edgeObjectsToAdd[1].playerEntity=9;ids[1]=99;return r.observationId,r.companyEntity,r.resultEntities[1],r.resultEntities[2],r.oneWay and r.name=='Native name' and m.copyApply(p,{50,50},3).field=='applyResults'`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);try{
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,5,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.deepEqual([lua.lua_tointeger(L,-5),lua.lua_tointeger(L,-4),lua.lua_tointeger(L,-3),lua.lua_tointeger(L,-2),lua.lua_toboolean(L,-1)],[3,10,50,51,true]);
  }finally{lua.lua_close(L);}
});
function copyApply(proposal, results){
  const script=`local m=(function()${source}end)();local p=${proposal};local r=m.copyApply(p,${results},3);return (r.code or 'ok')..'|'..(r.field or '')..'|'..tostring(r.resultEntities and r.resultEntities[1] or 0)..'|'..tostring(r.companyEntity or 0)`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);try{
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,1,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    return lua.lua_tojsstring(L,-1);
  }finally{lua.lua_close(L);}
}
const applyProposal=(resultEntity='50')=>`{proposal={edgeObjectsToAdd={{resultEntity=${resultEntity},category=0,playerEntity=10,oneWay=true,name='Native name'}}}}`;
test('copyApply accepts an empty native apply result only through its declared positive stop entity',()=>{
  assert.equal(copyApply(applyProposal(),'{}'),'ok||50|10');
  assert.equal(copyApply(applyProposal('-4'),'{}'),'unavailable|applyStopEntity|0|0');
  assert.equal(copyApply(applyProposal('nil'),'{}'),'unavailable|applyStopEntity|0|0');
});
test('copyApply reads an explicitly indexed result even when its Lua length is zero',()=>{
  // Defensive proxy case; the live log alone does not prove proxy semantics.
  assert.equal(copyApply(applyProposal('50'),"setmetatable({[1]=50},{__len=function() return 0 end})"),'ok||50|10');
});
test('copyApply rejects malformed apply-result maps and over-bound indexed results',()=>{
  assert.equal(copyApply(applyProposal('nil'),'{stop=50}'),'unavailable|applyStopEntity|0|0');
  const tooMany=`{${Array.from({length:65},(_,index)=>index+1).join(',')}}`;
  assert.equal(copyApply(applyProposal(),tooMany),'unavailable|applyResults|0|0');
  assert.equal(copyApply(applyProposal(),'{[1]=50,[3]=51}'),'unavailable|applyResults|0|0');
});
