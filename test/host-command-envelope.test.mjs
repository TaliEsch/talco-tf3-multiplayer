import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {startHost} from '../src/host.mjs';
import {connectClient} from '../src/client.mjs';

async function request(commandType,payload){
  const secret='0123456789abcdef0123456789abcdef';
  const buildHash='b'.repeat(64),modManifestHash='c'.repeat(64);
  const host=startHost({secret,port:0,buildHash,modManifestHash,legacyModelRelay:true,
    getUpdateCount:()=>50,resolveEntityOwner:()=>101});
  await once(host.server,'listening');
  let client;
  try{
    return await new Promise((resolve,reject)=>{
      client=connectClient({secret,sessionId:host.sessionId,port:host.server.address().port,
        displayName:'Join',buildHash,modManifestHash,onMessage(message,context){
          if(message.kind==='admitted'){
            const originPlayerId=message.payload.player.playerId;
            host.authority.bindCompanyEntity(originPlayerId,101);
            context.send('speed_request',{clientSequence:0,commandType,originPlayerId,
              targetEntity:71,targetCompanyEntity:101,payload});
          }
          if(message.kind==='command_accepted')resolve({accepted:message.payload.command});
          if(message.kind==='command_rejected')resolve({rejected:message.payload.code});
          if(message.kind==='error'||message.kind==='transport_error')reject(new Error(message.payload.code));
        }});
    });
  }finally{
    if(client&&!client.socket.destroyed){
      const closed=once(client.socket,'close');client.socket.destroy();await closed;
    }
    host.server.close();host.server.unref();
  }
}

test('speed envelope rejects gameplay commands before action admission',async()=>{
  for(const commandType of ['vehicle.setRunning','road.line.create','road.line.remove',
    'road.vehicle.assignLine','road.vehicle.sell','finance.loan.obtain']){
    const result=await request(commandType,{running:false});
    assert.deepEqual(result,{rejected:'BAD_COMMAND_ENVELOPE'});
  }
});
test('genuine speed request retains its authoritative ordering path',async()=>{
  const result=await request('simulation.speed',{speedup:0});
  assert.equal(result.accepted.commandType,'simulation.speed');
  assert.equal(result.accepted.hostSequence,1);
});
