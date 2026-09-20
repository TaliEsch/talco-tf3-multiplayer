import {parseFlatDataFile} from './userdata-ipc.mjs';
import {phase2LocalPlanHash} from './phase2-local-run.mjs';

const entity=value=>Number.isSafeInteger(value)&&value>0&&value<=2147483647;
const finite=(value,limit)=>Number.isFinite(value)&&Math.abs(value)<=limit;
const nonce=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const checkpoint=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const asciiPath=value=>typeof value==='string'&&/^[A-Za-z0-9_.:/-]{1,256}$/.test(value)
  &&!value.split('/').includes('..');
const depotPath=value=>asciiPath(value)&&value.endsWith('/road/road_depot/road_depot.con');
const stationPath=value=>asciiPath(value)&&value.endsWith('/street/modular_street_station/modular_terminal.con');
const modelPath=value=>asciiPath(value)&&value.includes('/vehicle/bus/')&&value.endsWith('.mdl');

const fields=['schemaVersion','kind','nonce','revision','originalCompany','targetCompany','fundingAmount','model',
  'depotResource','depotX','depotY','depotZ','depotYaw','depotSeed',
  'stationAResource','stationAX','stationAY','stationAZ','stationAYaw','stationASeed',
  'stationBResource','stationBX','stationBY','stationBZ','stationBYaw','stationBSeed'];
const pathFields=['model','depotResource','stationAResource','stationBResource'];
const coordinateFields=['depotX','depotY','depotZ','depotYaw','stationAX','stationAY','stationAZ','stationAYaw','stationBX','stationBY','stationBZ','stationBYaw'];
const numberPattern='[-+]?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][-+]?(?:0|[1-9][0-9]*))?';
const exact=(value,names)=>Object.keys(value??{}).sort().join(',')===[...names].sort().join(',');

function fail(code){throw new Error(code);}

// parseFlatDataFile deliberately accepts only its small, non-executable Lua subset.
// Lift the four path values and decimal coordinates into that subset only after
// recording each original lexical value, so it remains the sole Lua grammar parser.
function flatSetup(source){
  if(typeof source!=='string'||Buffer.byteLength(source,'utf8')>8192)fail('INVALID_PHASE2_SETUP_PLAN');
  const values=Object.create(null), seen=Object.create(null);
  const capture=(name,pattern)=>new RegExp(`\\b${name}\\s*=\\s*${pattern}\\s*,`,'g');
  let normalized=source;
  for(const name of pathFields){
    normalized=normalized.replace(capture(name,'"([A-Za-z0-9_.:/-]{1,256})"'),(_all,value)=>{
      if(seen[name])fail('INVALID_PHASE2_SETUP_PLAN');seen[name]=true;values[name]=value;return `${name} = "flat_path",`;
    });
  }
  for(const name of coordinateFields){
    normalized=normalized.replace(capture(name,`(${numberPattern})`),(_all,value)=>{
      if(seen[name])fail('INVALID_PHASE2_SETUP_PLAN');seen[name]=true;values[name]=Number(value);return `${name} = 0,`;
    });
  }
  let flat;
  try{flat=parseFlatDataFile(normalized);}catch{fail('INVALID_PHASE2_SETUP_PLAN');}
  for(const name of [...pathFields,...coordinateFields]){
    if(!seen[name])fail('INVALID_PHASE2_SETUP_PLAN');
    flat[name]=values[name];
  }
  return flat;
}

function placement(value,path){
  return value&&exact(value,['resource','x','y','z','yaw','seed'])&&path(value.resource)
    &&finite(value.x,100000)&&finite(value.y,100000)&&finite(value.z,10000)
    &&finite(value.yaw,Math.PI)&&entity(value.seed);
}

export function parsePhase2SetupPlan(source,{nonce:expectedNonce,originalCompany,targetCompany,checkpointHash}={}){
  if(!nonce(expectedNonce)||!entity(originalCompany)||!entity(targetCompany)||originalCompany===targetCompany||!checkpoint(checkpointHash))
    fail('INVALID_PHASE2_SETUP_CONTEXT');
  const value=flatSetup(source);
  if(!exact(value,fields)||value.schemaVersion!==1||value.kind!=='phase2_plan'||value.nonce!==expectedNonce||value.revision!==1
    ||value.originalCompany!==originalCompany||value.targetCompany!==targetCompany||!entity(value.originalCompany)
    ||!entity(value.targetCompany)||value.originalCompany===value.targetCompany||!Number.isSafeInteger(value.fundingAmount)
    ||value.fundingAmount!==1000000||value.depotSeed!==1||value.stationASeed!==2||value.stationBSeed!==3
    ||!modelPath(value.model))fail('INVALID_PHASE2_SETUP_PLAN');
  const depot={resource:value.depotResource,x:value.depotX,y:value.depotY,z:value.depotZ,yaw:value.depotYaw,seed:value.depotSeed};
  const stationA={resource:value.stationAResource,x:value.stationAX,y:value.stationAY,z:value.stationAZ,yaw:value.stationAYaw,seed:value.stationASeed};
  const stationB={resource:value.stationBResource,x:value.stationBX,y:value.stationBY,z:value.stationBZ,yaw:value.stationBYaw,seed:value.stationBSeed};
  if(!placement(depot,depotPath)||!placement(stationA,stationPath)||!placement(stationB,stationPath)
    ||(stationA.x===stationB.x&&stationA.y===stationB.y&&stationA.z===stationB.z))fail('INVALID_PHASE2_SETUP_PLAN');
  const plan=Object.freeze({originalCompany:value.originalCompany,targetCompany:value.targetCompany,fundingAmount:value.fundingAmount,
    model:value.model,depot:Object.freeze(depot),stationA:Object.freeze(stationA),stationB:Object.freeze(stationB),checkpointHash});
  let planHash;
  try{planHash=phase2LocalPlanHash(plan);}catch{fail('INVALID_PHASE2_SETUP_PLAN');}
  return Object.freeze({plan,planHash,revision:value.revision});
}

export function serializePhase2SetupConfig(config){
  if(!exact(config,['schemaVersion','kind','nonce','originalCompany','targetCompany','status'])||config.schemaVersion!==1
    ||config.kind!=='phase2_setup'||!nonce(config.nonce)||!entity(config.originalCompany)||!entity(config.targetCompany)
    ||config.originalCompany===config.targetCompany||!['selecting','ready','running','complete','failed'].includes(config.status))
    fail('INVALID_PHASE2_SETUP_CONFIG');
  const source=`function data()\nreturn {\n${Object.entries(config).map(([key,value])=>`  ${key} = ${JSON.stringify(value)},`).join('\n')}\n}\nend\n`;
  if(Buffer.byteLength(source,'utf8')>4096)fail('INVALID_PHASE2_SETUP_CONFIG');
  return source;
}
