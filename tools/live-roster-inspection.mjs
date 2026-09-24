import {startGameBridge} from '../src/game-bridge.mjs';

const [directory,rosterText]=process.argv.slice(2);
const companies=rosterText?.split(',').map(Number);
if(!directory||!companies)throw new Error('Usage: node tools/live-roster-inspection.mjs BRIDGE_DIR HOST_ENTITY,REMOTE_ENTITY[,REMOTE_ENTITY...]');
const events=[];
const bridge=await startGameBridge({directory,logger:event=>{
  if(['bridge_connected','bridge_disconnected','host_roster_inspection'].includes(event.event))events.push(event);
}});
try{
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    const observation=bridge.engineObservation;
    if(bridge.connected&&observation.available&&observation.sample?.speedup===0)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const observation=bridge.engineObservation;
  if(!bridge.connected||!observation.available||observation.sample?.speedup!==0)
    throw new Error('PAUSED_LIVE_TF3_OBSERVATION_REQUIRED');
  const proof=await bridge.discoverHostCompanyRoster(companies);
  process.stdout.write(JSON.stringify({event:'live_roster_inspection',outcome:proof.outcome,
    companies:proof.companies,hostCompany:proof.hostCompanyEntity,
    tickCount:proof.tickCount,updateCount:proof.updateCount,events})+'\n');
}finally{await bridge.close();}
