import test from 'node:test';
import assert from 'node:assert/strict';
import {AsyncSessionParticipant} from '../src/async-session-participant.mjs';

const companies=new Map([['host',7],['remote',8]]);
const players=[...companies].map(([playerId,companyEntity])=>({playerId,companyEntity}));
const roundId='round',checkpointHash='a'.repeat(64);
const command={protocolVersion:2,hostSequence:1,scheduledUpdate:108,
  originPlayerId:'remote',targetCompanyEntity:8,targetEntity:101,
  commandType:'road.line.create',payload:{companyEntity:8,stationA:101,stationB:102},
  clientSequence:1,requestMessageId:'line-1'};
function fixture(enableLineCreate){
  const requests=[];
  const p=new AsyncSessionParticipant({playerId:'host',companies,enableLineCreate,
    now:()=>0,publish:value=>{requests.push(value);return Promise.resolve();},
    send:()=>{},disconnect:()=>{}});
  const reply=extra=>{
    const last=requests.at(-1);
    const base={schemaVersion:1,roundId,operationId:last.operationId,
      operation:last.operation,status:'ok',updateCount:100,held:false};
    if(last.operation==='holdCheckpoint')Object.assign(base,{held:true,checkpointHash});
    if(last.operation==='prepare')base.ownerCompanyEntity=8;
    return p.receiveEngine({...base,...extra});
  };
  p.observe({updateCount:100,held:false});
  p.receive('coordination_prepare',{roundId,updateCount:100,checkpointHash,players});
  reply();p.receive('coordination_ready',{roundId,updateCount:100,checkpointHash});reply();
  assert.equal(p.phase,'running');
  return {p,requests,reply};
}
test('participant line preparation requires opt-in and matching engine company receipt',()=>{
  const disabled=fixture(false);
  disabled.p.receive('command_prepare',{roundId,command});
  assert.equal(disabled.p.fault,'INVALID_COMMAND_PREPARE');
  const accepted=fixture(true);
  accepted.p.receive('command_prepare',{roundId,command});
  assert.equal(accepted.requests.at(-1).operation,'prepare');
  accepted.reply({ownerCompanyEntity:8});
  assert.equal(accepted.p.phase,'prepared');
  const rejected=fixture(true);
  rejected.p.receive('command_prepare',{roundId,command});
  rejected.reply({ownerCompanyEntity:7});
  assert.equal(rejected.p.fault,'INVALID_PREPARE_RECEIPT');
});
