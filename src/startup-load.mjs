import {COPYFILE_EXCL} from 'node:constants';
import {randomBytes,randomUUID} from 'node:crypto';
import {copyFile,link,lstat,open,realpath,stat,unlink} from 'node:fs/promises';
import path from 'node:path';
import {sha256File} from './compatibility.mjs';
import {requirePlainDirectory} from './userdata-ipc.mjs';

const SHA=/^[a-f0-9]{64}$/;
const NONCE=/^[a-f0-9]{32}$/;
const SAVE_NAME=/^tf3mp_disposable_[a-f0-9]{32}$/;

async function plainDirectory(directory,basename){
  if(typeof directory!=='string'||!path.isAbsolute(directory))throw new TypeError('absolute directory required');
  const info=await lstat(directory),resolved=await realpath(directory);
  if(!info.isDirectory()||info.isSymbolicLink()||path.resolve(directory).toLowerCase()!==path.resolve(resolved).toLowerCase()
    ||path.basename(resolved).toLowerCase()!==basename)throw new TypeError(`invalid ${basename} directory`);
  return resolved;
}

export function serializeStartupLoadRequest({nonce,saveName,expectedBytes,expectedSha256}){
  if(!NONCE.test(nonce)||!SAVE_NAME.test(saveName)||!Number.isSafeInteger(expectedBytes)||expectedBytes<1||!SHA.test(expectedSha256))
    throw new TypeError('invalid startup load request');
  return `function data()\nreturn {\n  schemaVersion = 1,\n  nonce = "${nonce}",\n  saveName = "${saveName}",\n  expectedBytes = ${expectedBytes},\n  expectedSha256 = "${expectedSha256}",\n}\nend\n`;
}

export async function prepareDisposableStartupLoad({sourceSave,saveDirectory,bridgeDirectory}){
  if(typeof sourceSave!=='string'||!path.isAbsolute(sourceSave)||path.extname(sourceSave).toLowerCase()!=='.sav')
    throw new TypeError('absolute .sav source required');
  const sourceInfo=await lstat(sourceSave),sourceResolved=await realpath(sourceSave);
  if(!sourceInfo.isFile()||sourceInfo.isSymbolicLink()||path.resolve(sourceSave).toLowerCase()!==path.resolve(sourceResolved).toLowerCase())
    throw new TypeError('source save must be a real file');
  const [saveRoot,bridgeRoot]=await Promise.all([plainDirectory(saveDirectory,'save'),requirePlainDirectory(bridgeDirectory)]);
  if(path.dirname(sourceResolved).toLowerCase()!==saveRoot.toLowerCase())throw new TypeError('source save must be directly inside the selected save directory');
  const sourceStat=await stat(sourceResolved);
  if(sourceStat.size<1)throw new RangeError('source save is empty');
  const sourceHash=await sha256File(sourceResolved);
  const nonce=randomBytes(16).toString('hex'),saveName=`tf3mp_disposable_${nonce}`;
  const destination=path.join(saveRoot,`${saveName}.sav`);
  const sourcePreview=path.join(saveRoot,`${path.basename(sourceResolved,'.sav')}.jpg`);
  const destinationPreview=path.join(saveRoot,`${saveName}.jpg`);
  const requestPath=path.join(bridgeRoot,'startup_load_request.lua');
  const temporaryRequest=path.join(bridgeRoot,`.tf3mp-startup-${randomUUID()}.tmp`);
  let saveCreated=false,previewCreated=false,temporaryCreated=false;
  try{
    await copyFile(sourceResolved,destination,COPYFILE_EXCL);saveCreated=true;
    const copied=await stat(destination),copiedHash=await sha256File(destination);
    if(copied.size!==sourceStat.size||copiedHash!==sourceHash)throw new Error('disposable save copy verification failed');
    try{
      const previewInfo=await lstat(sourcePreview);
      if(!previewInfo.isFile()||previewInfo.isSymbolicLink())throw new TypeError('source preview must be a real file');
      await copyFile(sourcePreview,destinationPreview,COPYFILE_EXCL);previewCreated=true;
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const handle=await open(temporaryRequest,'wx',0o600);temporaryCreated=true;
    try{await handle.writeFile(serializeStartupLoadRequest({nonce,saveName,expectedBytes:sourceStat.size,expectedSha256:sourceHash}),'utf8');await handle.sync();}
    finally{await handle.close();}
    await link(temporaryRequest,requestPath);
    await unlink(temporaryRequest);temporaryCreated=false;
    return Object.freeze({source:sourceResolved,path:destination,preview:previewCreated?destinationPreview:null,requestPath,
      nonce,saveName,bytes:sourceStat.size,sha256:sourceHash});
  }catch(error){
    if(temporaryCreated)await unlink(temporaryRequest).catch(()=>{});
    if(previewCreated)await unlink(destinationPreview).catch(()=>{});
    if(saveCreated)await unlink(destination).catch(()=>{});
    throw error;
  }
}
