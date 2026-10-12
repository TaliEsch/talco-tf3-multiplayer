import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,open,lstat,writeFile,rename,link,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {isUnpublishedEngineSource} from '../src/async-engine-mailbox.mjs';

test('creation identity rejects another file with identical bytes and retains content/link checks',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'tf3mp-creation-identity-'));
 const pending=path.join(root,'pending'),source='function data() return {operation="prepare"} end\n';
 try{
  const handle=await open(pending,'wx');let identity;
  try{
   await handle.writeFile(source);await handle.sync();
   identity={handle:await handle.stat({bigint:true}),path:await lstat(pending,{bigint:true})};
  }finally{await handle.close();}
  assert.equal(await isUnpublishedEngineSource(pending,source,identity),true);
  const wrongDevice=Object.assign(Object.create(Object.getPrototypeOf(identity.handle)),
    identity.handle,{dev:identity.handle.dev===0n?1n:0n});
  assert.equal(await isUnpublishedEngineSource(pending,source,
    {...identity,handle:wrongDevice}),false);
  await writeFile(pending,source.replace('prepare','changed'));
  assert.equal(await isUnpublishedEngineSource(pending,source,identity),false);
  await writeFile(pending,source);
  assert.equal(await isUnpublishedEngineSource(pending,source,identity),true);
  await link(pending,path.join(root,'linked'));
  assert.equal(await isUnpublishedEngineSource(pending,source,identity),false);
  await rm(path.join(root,'linked'));
  await rename(pending,path.join(root,'original'));
  await writeFile(pending,source);
  assert.equal(await isUnpublishedEngineSource(pending,source,identity),false);
  await rm(pending);
  await assert.rejects(isUnpublishedEngineSource(pending,source,identity),{code:'ENOENT'});
 }finally{await rm(root,{recursive:true,force:true});}
});
