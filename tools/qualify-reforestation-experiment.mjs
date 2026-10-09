import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256File} from '../src/compatibility.mjs';
const executableScopes=Object.freeze({
  'de1daad3a13f3b7e9f79903361bb43769cf4f15e59271a263aefe1f075f23ef2':
    'reforestation-seed-forward-exact-40408',
  '74861ac43b041aebc5179154345b3cf1ec83154c8e6cc58e0d9e02ff5fa602e4':
    'reforestation-seed-forward-exact-40420',
});
const required=Object.freeze({
  'base/content/terrain/reforestation.script.tl':'fe2e54645afbeb3fa9c46b348f75000d06c53e48f6d7a303449fc036812a317b',
  'base/content/terrain/reforestation.gs.lua':'6575a6d7330e633ba6ae17f37a677e9aecdb9c065008bb0dd764b4233022f9f7',
});
export function qualifyReforestationResourceHashes(resources){
  const scope=executableScopes[resources?.['TransportFever3.exe']];
  if(!scope)throw new Error('REFORESTATION_EXACT_RESOURCE_MISMATCH:TransportFever3.exe');
  for(const [relative,expected] of Object.entries(required))
    if(resources[relative]!==expected)
      throw new Error('REFORESTATION_EXACT_RESOURCE_MISMATCH:'+relative);
  return {scope,resources,sourceQualified:true,activationPermitted:false,gameplayVerified:false,
    expectedUpdate:'reforestation.script@update',expectedHandleEvent:'reforestation.script@handleEvent'};
}
export async function qualifyReforestationExperiment(gameDirectory){
  const directory=path.resolve(gameDirectory),resources={};
  for(const relative of ['TransportFever3.exe',...Object.keys(required)])
    resources[relative]=await sha256File(path.join(directory,relative));
  return qualifyReforestationResourceHashes(resources);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==3)throw new Error('USAGE_GAME_DIRECTORY_REQUIRED');
  console.log(JSON.stringify(await qualifyReforestationExperiment(process.argv[2])));
}
