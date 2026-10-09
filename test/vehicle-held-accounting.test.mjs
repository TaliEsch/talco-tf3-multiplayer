import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fengari from 'fengari';

const source=await readFile(new URL('../mod/content/tf3mp_status.script.tl',import.meta.url),'utf8');
const start=source.indexOf('    if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and (name == "tf3mp_execute_command"');
const end=source.indexOf('    -- First real coordinator operation:',start);
assert.ok(start>=0&&end>start,'committed executeHeld handler must remain extractable');
const handler=source.slice(start,end).replace(/ : (?:boolean|integer|nil|string|table|any)(?: \| nil)?/g,'')
  .replace(/ : VehicleSetStoppedByUserCommandData/g,'')
  .replace(/ : \{\{Engine\.Entity, Engine\.Revision\}\}/g,'')
  .replace(/ as Engine\.Component\.[A-Za-z]+(?:<[^>]+>)?/g,'')
  .replace(/ as (string|integer|number|table|boolean)/g,'');

function run(body,{running=true,balance=20575901,owner=28619,updateCount=1194}={}){
  const {lua,lauxlib,lualib,to_luastring}=fengari,L=lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const fixture=`
local tickCount=100;local updateCount=${updateCount};local sent=0;local balance=${balance};local owner=${owner};local callback
local vehicle={userStopped=${running?'true':'false'}}
local stateValue={coordinationBinding={nonce=string.rep('a',32),roundId='r',phase='prepared',players={borrower=28619,otherHost=15702},nextSequence=2},
 watchdogLease={nonce=string.rep('a',32),companyEntity=28619,phase='active',lastTick=1,expiresTick=1000},
 preparedCommand={hostSequence=2,scheduledUpdate=1194,companyEntity=28619,entity=28939,running=${running},clientSequence=1,originPlayerId='borrower',requestMessageId='m'},
 preparationReceipt={status='ok'},executionBarrier={phase='held',nonce=string.rep('a',32),roundId='r',operationId='op',hostSequence=2,scheduledUpdate=1194}}
local state={get=function()return stateValue end,set=function(_,v)stateValue=v end}
local api={type={ComponentType={GAME_SPEED=2,PLAYER_OWNED=3,TRANSPORT_VEHICLE=4}},engine={
 util={getPlayer=function()return 28619 end,getWorld=function()return 0 end,finance={getPlayersBalance=function(company)assert(company==28619);return balance end}},
 getComponent=function(_,kind)if kind==2 then return {speedup=0}elseif kind==3 then return {player=owner}else return vehicle end end,
 entityExists=function(entity)return entity==28939 end},cmd={
 makeVehicleSetStoppedByUserCmd=function(entity,stopped)return {entity=entity,stopped=stopped}end,
 sendCommand=function(command,cb)sent=sent+1;vehicle.userStopped=command.stopped;callback=cb end}}
local function readClock()return {tickCount=tickCount,updateCount=updateCount}end
local function validInteger(v)return type(v)=='number' and v%1==0 and math.abs(v)<=9007199254740991 end
local src='tf3mp_status_1::/tf3mp_status.gs';local id='tf3mp_engine_bridge';local name='tf3mp_execute_command'
local param={schemaVersion=1,nonce=string.rep('a',32),roundId='r',operationId='op',operation='executeHeld',protocolVersion=2,
 hostSequence=2,scheduledUpdate=1194,companyEntity=28619,entity=28939,running=${running},clientSequence=1,
 originPlayerId='borrower',requestMessageId='m',commandType='vehicle.setRunning'}
local function executeHeldEvent()
${handler}
end
executeHeldEvent()
${body}
`;
  const status=lauxlib.luaL_dostring(L,to_luastring(fixture));
  try{assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?'':lua.lua_tojsstring(L,-1));}
  finally{lua.lua_close(L);}
}

for(const [name,running] of [['Start',true],['Stop',false]])test(`actual held ${name} event accepts unchanged borrower balance`,()=>run(`
assert(sent==1 and callback~=nil and stateValue.executionReceipt.status=='unknown')
callback({vehicleEntity=28939,userStopped=${running?'false':'true'}},true,{})
assert(stateValue.executionReceipt.status=='ok' and stateValue.executionReceipt.balance==20575901)
assert(stateValue.executionReceipt.negative==0 and stateValue.executionReceipt.hostSequence==2)
assert(stateValue.executionReceipt.entity==28939 and stateValue.executionReceipt.ownerCompanyEntity==28619)
assert(stateValue.coordinationBinding.phase=='action_held')
`,{running}));

for(const delta of [-1,1])test(`actual held Start leaves unknown after callback balance changes by ${delta}`,()=>run(`
assert(sent==1 and callback~=nil)
balance=balance+(${delta})
callback({vehicleEntity=28939,userStopped=false},true,{})
assert(stateValue.executionReceipt.status=='unknown' and stateValue.coordinationBinding.phase=='execution_unknown')
`,{running:true}));

test('invalid live balance consumes authorization without sending',()=>run(`
assert(sent==0 and stateValue.executionReceipt.status=='unknown' and stateValue.executionBarrier.phase=='consumed')
`,{balance:'0/0'}));

test('wrong held update or owner consumes authorization without sending',()=>{
  run(`assert(sent==0 and stateValue.executionReceipt.status=='unknown' and stateValue.executionBarrier.phase=='consumed')`,{updateCount:1195});
  run(`assert(sent==0 and stateValue.executionReceipt.status=='unknown' and stateValue.executionBarrier.phase=='consumed')`,{owner:15702});
});

test('duplicate callback cannot replace the accepted receipt or send again',()=>run(`
callback({vehicleEntity=28939,userStopped=false},true,{})
assert(sent==1 and stateValue.executionReceipt.status=='ok')
local accepted=stateValue.executionReceipt.balance
balance=balance+1
callback({vehicleEntity=28939,userStopped=false},true,{})
assert(sent==1 and stateValue.executionReceipt.status=='ok' and stateValue.executionReceipt.balance==accepted)
`,{running:true}));
