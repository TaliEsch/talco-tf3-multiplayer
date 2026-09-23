import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256File } from '../src/compatibility.mjs';

// Starts one exact-build TF3 process and its production Host or Join helper.
// The native handoff is one-use. Only a connection refusal before native bind
// is retried; no gameplay command, save download, or uncertain outcome is.
const root=fileURLToPath(new URL('..',import.meta.url));
const cli=path.join(root,'src','cli.mjs');
const handoff=path.join(root,'dist','native-loader','TF3NativeSessionHandoff.exe');
const [role,...args]=process.argv.slice(2);
function options(values){
  const result={};
  for(let i=0;i<values.length;i+=2){
    if(!values[i]?.startsWith('--')||values[i+1]===undefined||values[i+1].startsWith('--'))throw new Error('INVALID_LAUNCH_OPTIONS');
    const key=values[i].slice(2);
    if(Object.hasOwn(result,key))throw new Error('DUPLICATE_LAUNCH_OPTION');
    result[key]=values[i+1];
  }
  return result;
}
const opt=options(args);
const required=role==='host'
  ?['session','mod-hash','exe','bridge-dir','save','bind','port','save-port']
  :['session','mod-hash','exe','bridge-dir','save-dir','host','name','port','save-port'];
if(!['host','join'].includes(role)||required.some(key=>!opt[key]))throw new Error('QUALIFIED_LAUNCH_OPTIONS_REQUIRED');
if(process.platform!=='win32')throw new Error('WINDOWS_REQUIRED');
if(!process.env.TF3MP_SESSION_SECRET||Buffer.byteLength(process.env.TF3MP_SESSION_SECRET)<32)
  throw new Error('SESSION_SECRET_REQUIRED');
for(const key of ['exe','bridge-dir',role==='host'?'save':'save-dir'])
  if(!path.isAbsolute(opt[key]))throw new Error('ABSOLUTE_LAUNCH_PATH_REQUIRED');
if(path.basename(opt['bridge-dir']).toLowerCase()!=='tf3mp_status_1'||!existsSync(opt['bridge-dir'])
  ||!existsSync(opt.exe)||!existsSync(handoff))throw new Error('QUALIFIED_LAUNCH_INPUT_MISSING');
const manifestPath=path.join(path.dirname(opt.exe),'TalCo-TF3MP-native-loader.json');
if(!existsSync(manifestPath))throw new Error('NATIVE_LOADER_NOT_STAGED');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
assert.match(manifest.qualifiedExeSha256??'',/^[a-f0-9]{64}$/,'NATIVE_MANIFEST_INVALID');
if(await sha256File(opt.exe)!==manifest.qualifiedExeSha256)throw new Error('EXE_CHANGED_AFTER_STAGING');
if(!Array.isArray(manifest.files)||manifest.files.length!==3)throw new Error('NATIVE_MANIFEST_INVALID');
if(new Set(manifest.files.map(item=>item?.name)).size!==3)throw new Error('NATIVE_MANIFEST_INVALID');
for(const item of manifest.files){
  if(!['winhttp.dll','TF3InProcessRuntime.dll','TF3NativeProbe.dll'].includes(item?.name)
    ||!/^[a-f0-9]{64}$/.test(item.sha256??'')
    ||await sha256File(path.join(path.dirname(opt.exe),item.name))!==item.sha256)
    throw new Error('STAGED_NATIVE_FILE_MISMATCH');
}
if(!existsSync(opt['bridge-dir']))throw new Error('BRIDGE_DIRECTORY_MISSING');
function gameProcessRunning(){
  const result=spawnSync('tasklist.exe',['/FI','IMAGENAME eq TransportFever3.exe','/FO','CSV','/NH'],
    {encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw new Error('TF3_PROCESS_CHECK_FAILED');
  return /"TransportFever3\.exe"/i.test(result.stdout);
}
if(gameProcessRunning())throw new Error('TF3_ALREADY_RUNNING');

const runChild=(command,childArgs,{collect=false}={})=>new Promise((resolve,reject)=>{
  const child=spawn(command,childArgs,{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';
  child.stdout.on('data',chunk=>{const line=chunk.toString();if(collect){output+=line;if(output.length>16384)child.kill();}process.stdout.write(line);});
  child.stderr.on('data',chunk=>process.stderr.write(chunk));
  child.once('error',reject);
  child.once('exit',code=>code===0?resolve(output):reject(new Error(`PREPARATION_EXIT_${code}`)));
});

let preparedSave=null;
if(role==='join'){
  const output=await runChild(process.execPath,[cli,'prepare-join','--session',opt.session,'--host',opt.host,
    '--save-port',opt['save-port'],'--save-dir',opt['save-dir'],'--bridge-dir',opt['bridge-dir']],{collect:true});
  const record=output.split(/\r?\n/).filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return null;}})
    .find(value=>value?.event==='join_save_prepared');
  if(typeof record?.path!=='string'||!path.isAbsolute(record.path))throw new Error('JOIN_PREPARATION_RECEIPT_MISSING');
  preparedSave=record.path;
}

const pipe=`tf3mp_${role}_${randomBytes(10).toString('hex')}`;
const token=randomBytes(32).toString('hex');
const staged=spawnSync(handoff,['--directory',path.dirname(opt.exe)],{
  env:{...process.env,TF3_MP_NATIVE_PIPE:pipe,TF3_MP_NATIVE_TOKEN:token},stdio:'ignore',windowsHide:true});
if(staged.status!==0)throw new Error('NATIVE_SESSION_HANDOFF_FAILED');
const game=spawn(opt.exe,[],{cwd:path.dirname(opt.exe),env:process.env,detached:true,stdio:'ignore',windowsHide:false});
await new Promise((resolve,reject)=>{game.once('spawn',resolve);game.once('error',reject);});
game.unref();
process.stdout.write(JSON.stringify({event:'qualified_game_launch_requested',role,gamePid:game.pid})+'\n');

const shared=['--session',opt.session,'--mod-hash',opt['mod-hash'],'--exe',opt.exe,
  '--bridge-dir',opt['bridge-dir'],'--native-pipe',pipe,'--native-token',token,
  '--port',opt.port,'--save-port',opt['save-port']];
const roleArgs=role==='host'
  ?['--save',opt.save,'--bind',opt.bind,...(opt.expires?['--expires',opt.expires]:[])]
  :['--save-dir',opt['save-dir'],'--prepared-save',preparedSave,'--host',opt.host,'--name',opt.name];
const deadline=Date.now()+120000;
let started=false;
let activeChild=null;
let stopRequested=false;
let originalProcessExitedAt=null;
process.stdin.on('data',chunk=>{
  if(chunk.toString().trim()==='stop')stopRequested=true;
  if(activeChild&&!activeChild.stdin.destroyed)activeChild.stdin.write(chunk);
});
while(Date.now()<deadline&&!stopRequested){
  // Steam may hand off the launched process to a fresh TF3 PID. A launcher PID
  // exit is not evidence that the game exited; check the actual process name.
  if(game.exitCode!==null){
    originalProcessExitedAt??=Date.now();
    if(!gameProcessRunning()&&Date.now()-originalProcessExitedAt>15000)
      throw new Error('TF3_EXITED_BEFORE_NATIVE_BIND');
  }
  if(await sha256File(opt.exe)!==manifest.qualifiedExeSha256)throw new Error('EXE_CHANGED_AFTER_LAUNCH');
  const child=spawn(process.execPath,[cli,role,...shared,...roleArgs],{
    cwd:root,env:process.env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  activeChild=child;
  let early='',bound=false;
  child.stdout.on('data',chunk=>{const part=chunk.toString();process.stdout.write(part);early+=part;
    if(early.length>8192)early=early.slice(-8192);
    if(part.includes('native_runtime_binding_receipt'))bound=true;
  });
  child.stderr.on('data',chunk=>{const part=chunk.toString();process.stderr.write(part);early+=part;
    if(early.length>8192)early=early.slice(-8192);
  });
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  activeChild=null;
  if(!bound&&!stopRequested&&/NATIVE_RUNTIME_CONNECT_FAILED:.*(?:ENOENT|ECONNREFUSED)/.test(early)&&Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,500));
    continue;
  }
  started=true;
  process.exitCode=code??1;
  break;
}
if(!started&&!stopRequested)throw new Error('NATIVE_RUNTIME_STARTUP_TIMEOUT');
process.stdin.removeAllListeners('data');
process.stdin.pause();
