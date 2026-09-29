import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const {lua,lauxlib,lualib,to_luastring,to_jsstring}=fengari;

test('retained action-bar callbacks block unsupported clicks and changes until explicit release',async()=>{
  const source=await readFile(new URL('../mod/content/tf3mp_native_controls.script.tl',import.meta.url),'utf8');
  const start=source.indexOf('local function copyButtons(');
  const end=source.indexOf('\nlocal OriginalVehicle =',start);
  assert.ok(start>=0&&end>start);
  // Strip only the Teal annotations in this actual callback implementation.
  const implementation=source.slice(start,end)
    .replace('source : {EntityWindowUtil.ActionBarButton}) : {EntityWindowUtil.ActionBarButton}','source)')
    .replace('local result : {EntityWindowUtil.ActionBarButton}', 'local result')
    .replace('local fields : table','local fields')
    .replace('button as table','button')
    .replace('fields as EntityWindowUtil.ActionBarButton','fields')
    .replaceAll('value : boolean','value')
    .replaceAll('function() : boolean','function()')
    .replaceAll('function() : any','function()')
    .replaceAll(' as Engine.Component.TransportVehicle','');
  assert.doesNotMatch(implementation,/\bas\s+Engine\.|:\s*(?:boolean|table|any|\{EntityWindowUtil)/);
  const script=`local blocked=false
local stopClickDiagnostic="none"
local stopEntity=9
local stopUsed=false
local stopEverUsed=false
local stopReady=true
local selectedCompany,vehicleOwner,ownerReadFails=7,7,false
local api={engine={util={getPlayer=function() return selectedCompany end},
  getComponent=function(_,kind)
    if kind==2 then
      if ownerReadFails then error("owner read failed") end
      return vehicleOwner and {player=vehicleOwner} or nil
    end
    return {userStopped=false}
  end},type={ComponentType={TRANSPORT_VEHICLE=1,PLAYER_OWNED=2}}}
local permit=false
local function stopPermitCurrent() return permit end
${implementation}
local clicks,changes,stops=0,0,0
local buttons=copyButtons({
  {tag="entityWindow.vehicle.sell",onClick=function() clicks=clicks+1 end,
    onValueChange=function(value) changes=changes+1 end},
  {tag="entityWindow.vehicle.startStop",description="Stop",onClick=function() stops=stops+1 end},
})
buttons[1].onClick(); buttons[1].onValueChange(true); buttons[2].onClick()
assert(clicks==1 and changes==1 and stops==1)
blocked=true
buttons[1].onClick(); buttons[1].onValueChange(false); buttons[2].onClick()
assert(clicks==1 and changes==1 and stops==1)
permit=true
buttons[1].onClick()
vehicleOwner=8; buttons[2].onClick()
assert(stops==1 and not stopUsed and stopClickDiagnostic=="vehicle_not_owned")
vehicleOwner=nil; buttons[2].onClick()
assert(stops==1 and not stopUsed)
vehicleOwner=7; ownerReadFails=true; buttons[2].onClick()
assert(stops==1 and not stopUsed)
ownerReadFails=false
vehicleOwner=7; selectedCompany=8; buttons[2].onClick()
assert(stops==1 and not stopUsed)
selectedCompany=7; buttons[2].onClick()
assert(clicks==1 and stops==2 and stopUsed and stopEverUsed)
blocked=false
buttons[1].onClick(); buttons[1].onValueChange(true)
assert(clicks==2 and changes==2)`;
  const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
  const status=lauxlib.luaL_dostring(L,to_luastring(script));
  assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1)));
});
