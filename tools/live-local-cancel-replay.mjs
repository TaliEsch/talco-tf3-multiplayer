import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {createReadStream,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {hashManifest} from '../src/manifest.mjs';

// One-game diagnostic: the second company is an explicit receipt mirror.
// Run only with a disposable save; this never certifies two-game agreement.
const [save,bridgeDirectory,requestedExe]=process.argv.slice(2);
const armMarker=process.env.TF3MP_ARM_MARKER;
if(armMarker)assert.ok(path.isAbsolute(armMarker)&&path.basename(armMarker).startsWith('local-cancel-arm-'),
  'INVALID_ARM_MARKER');
assert.equal(process.platform,'win32','WINDOWS_REQUIRED');
assert.ok(path.isAbsolute(save??'')&&existsSync(save),'DISPOSABLE_SAVE_REQUIRED');
assert.ok(path.isAbsolute(bridgeDirectory??'')&&path.basename(bridgeDirectory)==='tf3mp_status_1',
  'BRIDGE_DIRECTORY_REQUIRED');
const exe=requestedExe??'E:\\Steam\\steamapps\\common\\Transport Fever 3\\TransportFever3.exe';
const handoff=fileURLToPath(new URL('../dist/native-loader/TF3NativeSessionHandoff.exe',import.meta.url));
const cli=fileURLToPath(new URL('../src/cli.mjs',import.meta.url));
const mod=fileURLToPath(new URL('../mod',import.meta.url));
assert.ok(existsSync(exe)&&existsSync(handoff),'NATIVE_LAUNCH_INPUT_MISSING');
const manifestPath=path.join(path.dirname(exe),'TalCo-TF3MP-native-loader.json');
assert.ok(existsSync(manifestPath),'NATIVE_LOADER_NOT_STAGED');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
assert.match(manifest.qualifiedExeSha256??'',/^[a-f0-9]{64}$/,'NATIVE_MANIFEST_INVALID');
async function executableHash(){
  const digest=createHash('sha256');
  for await(const chunk of createReadStream(exe))digest.update(chunk);
  return digest.digest('hex');
}
assert.equal(await executableHash(),manifest.qualifiedExeSha256,'EXE_CHANGED_AFTER_STAGING');
const pipe=`tf3mp_local_replay_${randomBytes(10).toString('hex')}`;
const token=randomBytes(32).toString('hex');
const secret=randomBytes(32).toString('hex');
const prepared=spawnSync(handoff,['--directory',path.dirname(exe)],{
  env:{...process.env,TF3_MP_NATIVE_PIPE:pipe,TF3_MP_NATIVE_TOKEN:token},
  stdio:'ignore',windowsHide:true});
assert.equal(prepared.status,0,'NATIVE_SESSION_HANDOFF_FAILED');
const game=spawn(exe,[],{cwd:path.dirname(exe),env:process.env,detached:true,
  stdio:'ignore',windowsHide:false});
game.unref();
process.stdout.write('TF3 launch requested. At the main menu, enter START_HOST here before loading the disposable save.\n');
let host=null,hostReady=false,runSent=false;
const lines=createInterface({input:process.stdin});
lines.on('line',async line=>{
  const command=line.trim();
  if(command==='START_HOST'&&!host){
    if(await executableHash()!==manifest.qualifiedExeSha256){
      process.stdout.write('TF3_EXECUTABLE_CHANGED_SINCE_LAUNCH; stop this run without an action.\n');
      return;
    }
    const modHash=await hashManifest(mod);
    host=spawn(process.execPath,[cli,'host','--secret',secret,'--mod-hash',modHash,
      '--save',save,'--bridge-dir',bridgeDirectory,'--native-pipe',pipe,
      '--native-token',token,'--bind','127.0.0.1'],{cwd:path.dirname(cli),
      env:process.env,stdio:['pipe','pipe','pipe'],windowsHide:true});
    const forward=(stream,destination)=>{
      let pending='';
      stream.on('data',chunk=>{
        pending+=chunk.toString();let end;
        while((end=pending.indexOf('\n'))!==-1){
          const record=pending.slice(0,end);pending=pending.slice(end+1);
          try{
            const event=JSON.parse(record).event;
            if(event==='host_listening')hostReady=true;
            if(event==='local_cancel_stop_armed'&&armMarker)
              writeFileSync(armMarker,String(Date.now()),{flag:'wx'});
          }catch(error){
            if(error?.code==='EEXIST')throw error;
          }
          destination.write(`${record}\n`);
        }
      });
    };
    forward(host.stdout,process.stdout);forward(host.stderr,process.stderr);
    host.on('exit',(code,signal)=>{process.stdout.write(`HOST_EXIT ${code??signal}\n`);host=null;hostReady=false;});
    return;
  }
  if(command.startsWith('RUN ')&&host&&hostReady&&!runSent){
    const [,second,entity]=command.split(/\s+/);
    if(!/^[1-9][0-9]*$/.test(second??'')||!/^[1-9][0-9]*$/.test(entity??''))
      throw new Error('RUN_REQUIRES_SECOND_COMPANY_AND_VEHICLE_ENTITY');
    runSent=true;
    host.stdin.write(`coordinator-cancel-stop-confirmed ${second} ${entity}\n`);
    return;
  }
  if(command==='STOP'){
    host?.stdin.write('stop\n');
    return;
  }
  process.stdout.write('Expected START_HOST, RUN <second-company> <vehicle-entity>, or STOP.\n');
});
