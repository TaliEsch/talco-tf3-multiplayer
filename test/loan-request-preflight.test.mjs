import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,lstat,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {assertLoanDispatchSlotsEmpty,LOAN_DISPATCH_REQUEST_NAMES} from '../src/loan-request-preflight.mjs';

async function fixture(t){
  const parent=await mkdtemp(path.join(os.tmpdir(),'tf3mp-loan-preflight-'));
  t.after(async()=>{
    const resolved=path.resolve(parent);
    assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('tf3mp-loan-preflight-'));
    await rm(resolved,{recursive:true,force:true});
  });
  const directory=path.join(parent,'tf3mp_status_1');
  await mkdir(directory);
  return {parent,directory};
}

const historyError={code:'LOAN_DISPATCH_HISTORY_REQUIRES_RETIREMENT'};

for(const name of ['checkpoint_save_request.lua','checkpoint_save_receipt.lua']){
  for(const location of ['legacy','mapped']){
    test(`required Host save rejects retained ${location} ${name} before borrowing`,async t=>{
      const {parent,directory}=await fixture(t);
      const presets=path.join(parent,'mod_presets');await mkdir(presets);
      const file=location==='legacy'?path.join(directory,name)
        :path.join(presets,`.tf3mp_status_1__${name}`);
      const retained='function data() return { nonce = "b2bccc69a8a5d17557a1b9f8ec0eb4b6", updateCount = 367 } end';
      await writeFile(file,retained);
      await assertLoanDispatchSlotsEmpty(directory,{userdataStorageMode:'steam25754343-observation'});
      await assert.rejects(assertLoanDispatchSlotsEmpty(directory,{
        userdataStorageMode:'steam25754343-observation',checkpointSaveRequired:true}),historyError);
      assert.equal(await readFile(file,'utf8'),retained);
    });
  }
}

test('empty qualified dispatch directory passes without creating files',async t=>{
  const {directory}=await fixture(t);
  assert.equal(await assertLoanDispatchSlotsEmpty(directory),undefined);
  assert.deepEqual(await readdir(directory),[]);
});

test('empty opt-in storage accepts private non-request history without changing it',async t=>{
  const {parent,directory}=await fixture(t);
  const presets=path.join(parent,'mod_presets');
  await mkdir(presets);
  const privatePath=path.join(directory,'loan-decision-consumed-private.json');
  await writeFile(privatePath,'unknown outcome\n');
  assert.equal(await assertLoanDispatchSlotsEmpty(directory,{userdataStorageMode:'steam25754343-observation'}),undefined);
  assert.equal(await readFile(privatePath,'utf8'),'unknown outcome\n');
  assert.deepEqual(await readdir(presets),[]);
});

for(const name of LOAN_DISPATCH_REQUEST_NAMES){
  for(const location of ['legacy','mapped']){
    test(`opt-in preflight preserves and rejects ${location} ${name} history`,async t=>{
      const {parent,directory}=await fixture(t);
      const presets=path.join(parent,'mod_presets');
      await mkdir(presets);
      const slot=location==='legacy' ? path.join(directory,name)
        : path.join(presets,`.tf3mp_status_1__${name}`);
      const privatePath=path.join(directory,'loan-decision-consumed-private.json');
      await writeFile(slot,'malformed spent request\n');
      await writeFile(privatePath,'{"outcome":"unknown"}\n');
      await assert.rejects(assertLoanDispatchSlotsEmpty(directory,
        {userdataStorageMode:'steam25754343-observation'}),historyError);
      assert.equal(await readFile(slot,'utf8'),'malformed spent request\n');
      assert.equal(await readFile(privatePath,'utf8'),'{"outcome":"unknown"}\n');
      assert.equal((await lstat(slot)).isFile(),true);
    });
  }
}

for(const name of LOAN_DISPATCH_REQUEST_NAMES){
  test(`existing ${name} refuses without changing malformed request or unrelated history`,async t=>{
    const {directory}=await fixture(t);
    const files={
      [name]:'malformed request must remain untouched\n',
      'loan-decision-consumed-private.json':'{"outcome":"unknown"}\n',
      'company_bind_saved_55652.attempt':'spent\n',
      'loan_service_observation.lua':'observation\n',
    };
    for(const [file,data] of Object.entries(files))await writeFile(path.join(directory,file),data);
    await assert.rejects(assertLoanDispatchSlotsEmpty(directory),historyError);
    assert.deepEqual((await readdir(directory)).sort(),Object.keys(files).sort());
    for(const [file,data] of Object.entries(files))assert.equal(await readFile(path.join(directory,file),'utf8'),data);
  });
}

test('unrelated history alone passes and remains unchanged',async t=>{
  const {directory}=await fixture(t);
  const file=path.join(directory,'loan-decision-consumed-old.json');
  await writeFile(file,'unknown outcome\n');
  await assertLoanDispatchSlotsEmpty(directory);
  assert.deepEqual(await readdir(directory),['loan-decision-consumed-old.json']);
  assert.equal(await readFile(file,'utf8'),'unknown outcome\n');
});

test('directory occupying a request slot refuses',async t=>{
  const {directory}=await fixture(t);
  const slot=path.join(directory,LOAN_DISPATCH_REQUEST_NAMES[0]);
  await mkdir(slot);
  await assert.rejects(assertLoanDispatchSlotsEmpty(directory),historyError);
  assert.equal((await lstat(slot)).isDirectory(),true);
});

test('malformed, missing, wrongly named and non-directory paths refuse',async t=>{
  const {parent,directory}=await fixture(t);
  const file=path.join(parent,'file');
  await writeFile(file,'preserve');
  for(const invalid of [null,{},'', 'tf3mp_status_1',directory+'\0',path.join(parent,'missing'),parent,file])
    await assert.rejects(assertLoanDispatchSlotsEmpty(invalid));
  assert.equal(await readFile(file,'utf8'),'preserve');
});

test('linked directory and paths traversing a linked parent refuse',async t=>{
  const {parent,directory}=await fixture(t);
  const linkedParent=path.join(parent,'linked-parent');
  const aliasRoot=path.join(parent,'alias');
  const realParent=path.join(parent,'real-parent');
  await mkdir(aliasRoot);
  await mkdir(path.join(realParent,'tf3mp_status_1'),{recursive:true});
  const linkedDirectory=path.join(aliasRoot,'tf3mp_status_1');
  try{
    await symlink(directory,linkedDirectory,'junction');
    await symlink(realParent,linkedParent,'junction');
  }catch(error){if(error.code==='EPERM')return t.skip('Windows junction creation unavailable');throw error;}
  await assert.rejects(assertLoanDispatchSlotsEmpty(linkedDirectory));
  await assert.rejects(assertLoanDispatchSlotsEmpty(path.join(linkedParent,'tf3mp_status_1')));
  assert.equal((await lstat(linkedDirectory)).isSymbolicLink(),true);
  assert.deepEqual(await readdir(directory),[]);
});

test('linked request slot refuses without following or removing its target',async t=>{
  const {parent,directory}=await fixture(t);
  const target=path.join(parent,'target');
  await mkdir(target);
  await writeFile(path.join(target,'evidence'),'preserve');
  const slot=path.join(directory,LOAN_DISPATCH_REQUEST_NAMES[1]);
  try{await symlink(target,slot,'junction');}
  catch(error){if(error.code==='EPERM')return t.skip('Windows junction creation unavailable');throw error;}
  await assert.rejects(assertLoanDispatchSlotsEmpty(directory),historyError);
  assert.equal((await lstat(slot)).isSymbolicLink(),true);
  assert.equal(await readFile(path.join(target,'evidence'),'utf8'),'preserve');
});
