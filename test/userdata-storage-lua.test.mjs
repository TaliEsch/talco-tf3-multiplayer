import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring}=fengari;
const moduleSource=await readFile(new URL('../mod/content/tf3mp_userdata_storage.lua',import.meta.url),'utf8');

function runLua(body,{qualifiedPrefix=false}={}){
  // This test-only source variant reaches the prefix implementation behind its
  // production qualification gate; the shipped module keeps that gate false.
  const source=qualifiedPrefix
    ? moduleSource.replace('local PREFIX_PROFILE_QUALIFIED = false','local PREFIX_PROFILE_QUALIFIED = true')
    : moduleSource;
  const script=`
local calls={};local values={}
app={
 loadUserdata=function(directory,name)
  calls.load={directory,name}
  local value=values[name]
  if value=='THROW' then error('checked Lua failure') end
  if value==nil then return {} end
  return value
 end,
 saveUserdata=function(directory,name,value) calls.save={directory,name,value};return true end,
 removeUserdata=function(directory,name) calls.remove={directory,name};return true end,
 getAllUserdata=function(directory) calls.list=directory;return {'bridge','bridge.lua','startup_load_request.lua'} end,
 loadGame=function() calls.loadGame=true end,
}
local userdataStorageModule=(function() ${source} end)()
${body}
return true
`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  try{
    assert.equal(lauxlib.luaL_loadstring(L,to_luastring(script)),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_pcall(L,0,1,0),lua.LUA_OK,lua.lua_tojsstring(L,-1));
    assert.equal(lua.lua_toboolean(L,-1),true);
  }finally{lua.lua_close(L);}
}

test('legacy profile keeps canonical API routing, listing, and logical-name validation',()=>runLua(`
local storage=userdataStorageModule.new(userdataStorageModule.defaultProfile)
assert(storage.profile=='legacy')
values.bridge={schemaVersion=1,nonce='x'}
assert(storage.exists('tf3mp_status_1','bridge')==true)
assert(storage.exists('tf3mp_status_1','absent')==false)
local payload=storage.loadUserdata('tf3mp_status_1','bridge')
assert(payload.schemaVersion==1 and calls.load[1]=='tf3mp_status_1' and calls.load[2]=='bridge')
storage.saveUserdata('tf3mp_status_1','receipt',{kind='ok'})
assert(calls.save[1]=='tf3mp_status_1' and calls.save[2]=='receipt')
storage.removeUserdata('tf3mp_status_1','receipt')
assert(calls.remove[1]=='tf3mp_status_1' and calls.remove[2]=='receipt')
assert(storage.getAllUserdata('tf3mp_status_1')[1]=='bridge')
assert(not pcall(storage.loadUserdata,'other','bridge'))
assert(not pcall(storage.loadUserdata,'tf3mp_status_1','../bridge'))
assert(not pcall(userdataStorageModule.new,userdataStorageModule.prefixProfile))
`));

test('prefix availability treats empty loads as unavailable and separates errors from invalid payloads',()=>runLua(`
local storage=userdataStorageModule.new(userdataStorageModule.prefixProfile)
local found,reason=storage.exists('tf3mp_status_1','absent')
assert(found==false and reason=='empty_unavailable','empty unavailable classification')
assert(calls.load[1]=='mod_presets' and calls.load[2]=='.tf3mp_status_1__absent','prefix load route')
values['.tf3mp_status_1__broken']='THROW'
found,reason=storage.exists('tf3mp_status_1','broken')
assert(found==nil and reason=='load_error','load error classification')
values['.tf3mp_status_1__malformed']='not-a-table'
found,reason=storage.exists('tf3mp_status_1','malformed')
assert(found==nil and reason=='invalid_payload','invalid payload classification')
values['.tf3mp_status_1__bridge']={schemaVersion=1,nonce='x'}
found,reason=storage.exists('tf3mp_status_1','bridge')
assert(found==true and reason=='payload_available','available payload classification')
storage.saveUserdata('tf3mp_status_1','receipt',{kind='ok'})
assert(calls.save[1]=='mod_presets' and calls.save[2]=='.tf3mp_status_1__receipt','prefix save route')
storage.removeUserdata('tf3mp_status_1','receipt')
assert(calls.remove[1]=='mod_presets' and calls.remove[2]=='.tf3mp_status_1__receipt','prefix remove route')
assert(not pcall(storage.getAllUserdata,'tf3mp_status_1'))
`,{qualifiedPrefix:true}));

test('prefix inventory catalog validates its nonce, header, and bounded logical-name entries',()=>runLua(`
local storage=userdataStorageModule.new(userdataStorageModule.prefixProfile)
local nonce=string.rep('a',32)
values['.tf3mp_status_1__bridge_inventory']={schemaVersion=1,nonce=nonce,
 names={coordination_request=true,vehicle_command=true}}
local names=storage.loadInventoryCatalog('tf3mp_status_1',nonce)
assert(names.coordination_request==true and names.vehicle_command==true)
assert(calls.load[1]=='mod_presets' and calls.load[2]=='.tf3mp_status_1__bridge_inventory')
assert(not pcall(storage.loadInventoryCatalog,'tf3mp_status_1',string.rep('b',32)),'foreign nonce accepted')
values['.tf3mp_status_1__bridge_inventory']={schemaVersion=1,nonce=nonce,names={['bad-name']=true}}
assert(not pcall(storage.loadInventoryCatalog,'tf3mp_status_1',nonce),'invalid name accepted')
values['.tf3mp_status_1__bridge_inventory']={schemaVersion=1,nonce=nonce,names={coordination_request=false}}
assert(not pcall(storage.loadInventoryCatalog,'tf3mp_status_1',nonce),'false availability accepted')
values['.tf3mp_status_1__bridge_inventory']={schemaVersion=1,nonce=nonce,names={},unexpected=true}
assert(not pcall(storage.loadInventoryCatalog,'tf3mp_status_1',nonce),'extra header field accepted')
values['.tf3mp_status_1__bridge_inventory']={schemaVersion=1,nonce=nonce,names={}}
for i=1,513 do values['.tf3mp_status_1__bridge_inventory'].names['name'..i]=true end
assert(not pcall(storage.loadInventoryCatalog,'tf3mp_status_1',nonce),'oversized catalog accepted')
`,{qualifiedPrefix:true}));

test('mutable prefix data retries bounded unavailable reads without caching or retrying actions',()=>runLua(`
local storage=userdataStorageModule.new(userdataStorageModule.prefixProfile)
local reads=0
app.loadUserdata=function(directory,name)
 reads=reads+1
 if reads<3 then return {} end
 return {schemaVersion=1,nonce=string.rep('a',32),counter=7}
end
assert(storage.loadUserdata('tf3mp_status_1','ack').counter==7 and reads==3)
reads=0
app.loadUserdata=function() reads=reads+1;return {} end
local empty=storage.loadUserdata('tf3mp_status_1','ack')
assert(next(empty)==nil and reads==3)
reads=0
assert(next(storage.loadUserdata('tf3mp_status_1','vehicle_command'))==nil and reads==1)
reads=0
app.loadUserdata=function() reads=reads+1;return {schemaVersion=9} end
assert(storage.loadUserdata('tf3mp_status_1','ack').schemaVersion==9 and reads==1)
`,{qualifiedPrefix:true}));

test('prefix replacement errors retry only the expected mutable file and preserve final failure',()=>runLua(`
local storage=userdataStorageModule.new(userdataStorageModule.prefixProfile)
local reads=0
app.loadUserdata=function(directory,name)
 reads=reads+1
 if reads<3 then error('cannot open E:/mod_presets/'..name..'.lua: Permission denied') end
 return {schemaVersion=1,nonce=string.rep('a',32),names={ack=true}}
end
assert(storage.loadInventoryCatalog('tf3mp_status_1',string.rep('a',32)).ack and reads==3)
reads=0
app.loadUserdata=function(directory,name)
 reads=reads+1;error('cannot open E:/mod_presets/'..name..'.lua: Permission denied')
end
local ok,err=pcall(storage.loadUserdata,'tf3mp_status_1','ack')
assert(not ok and string.find(err,'Permission denied',1,true) and reads==3)
reads=0
app.loadUserdata=function() reads=reads+1;error('cannot open other.lua: Permission denied') end
assert(not pcall(storage.loadUserdata,'tf3mp_status_1','ack') and reads==1)
reads=0
app.loadUserdata=function() reads=reads+1;error('invalid Lua payload') end
assert(not pcall(storage.loadUserdata,'tf3mp_status_1','ack') and reads==1)
`,{qualifiedPrefix:true}));

test('recorded bridge missing-file read recovers freshly but persistent loss and action errors fail',()=>runLua(`
local storage=userdataStorageModule.new(userdataStorageModule.prefixProfile)
local reads=0
local path='C:/Users/olihf/Downloads/Temp/tf3mp-isolated-steam/userdata/109855567/3493540/local/mod_presets/'
app.loadUserdata=function(directory,name)
 reads=reads+1
 if reads<3 then error('cannot open '..path..name..'.lua: No such file or directory') end
 return {schemaVersion=1,mode='watchdog_test',nonce=string.rep('a',32)}
end
assert(storage.loadUserdata('tf3mp_status_1','bridge').mode=='watchdog_test' and reads==3)
reads=0
app.loadUserdata=function(directory,name)
 reads=reads+1;error('cannot open '..path..name..'.lua: No such file or directory')
end
local ok,err=pcall(storage.loadUserdata,'tf3mp_status_1','bridge')
assert(not ok and string.find(err,'No such file or directory',1,true) and reads==3)
reads=0
assert(not pcall(storage.loadUserdata,'tf3mp_status_1','vehicle_command') and reads==1)
reads=0
app.loadUserdata=function() reads=reads+1;error('cannot open other.lua: No such file or directory') end
assert(not pcall(storage.loadUserdata,'tf3mp_status_1','bridge') and reads==1)
reads=0
app.loadUserdata=function() reads=reads+1;return {} end
local exists,reason=storage.exists('tf3mp_status_1','bridge')
assert(exists==false and reason=='empty_unavailable' and reads==3)
`,{qualifiedPrefix:true}));
