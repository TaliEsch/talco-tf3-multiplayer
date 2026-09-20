import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceUnpublished} from '../src/unpublished-replace.mjs';
const error=code=>Object.assign(new Error('test replace'),{code});
function options(overrides={}){
  return {platform:'win32',assertActive:()=>{},verifyUnpublished:async()=>true,wait:async()=>{},...overrides};
}
test('transient Windows replacement errors retain exactly one source and stop after success',async()=>{
  let calls=0,checks=0,waits=0;
  await replaceUnpublished(options({replace:async()=>{if(++calls<3)throw error(calls===1?'EPERM':'EBUSY');},
    verifyUnpublished:async()=>{checks++;return true;},wait:async()=>{waits++;}}));
  assert.equal(calls,3);assert.equal(checks,4);assert.equal(waits,2);
});
test('persistent lock is bounded and preserves the terminal OS error',async()=>{
  let calls=0,waits=0;const locked=error('EPERM');
  await assert.rejects(replaceUnpublished(options({replace:async()=>{calls++;throw locked;},wait:async()=>{waits++;}})),e=>e===locked);
  assert.equal(calls,5);assert.equal(waits,4);
});
test('consumed, modified or uninspectable pending source is never republished',async()=>{
  for(const verifyUnpublished of [async()=>false,async()=>{throw error('ENOENT');},async()=>undefined]){
    let calls=0;const failed=error('EPERM');
    await assert.rejects(replaceUnpublished(options({replace:async()=>{calls++;throw failed;},verifyUnpublished})),e=>e===failed);
    assert.equal(calls,1);
  }
});
test('other errors and platforms never retry',async()=>{
  for(const [platform,code] of [['win32','EIO'],['win32','ENOENT'],['win32','EACCES'],['linux','EPERM']]){
    let calls=0;
    await assert.rejects(replaceUnpublished(options({platform,replace:async()=>{calls++;throw error(code);}})),{code});
    assert.equal(calls,1);
  }
});
test('halt or close during backoff cancels before the next publication',async()=>{
  let active=true,calls=0;
  await assert.rejects(replaceUnpublished(options({replace:async()=>{calls++;throw error('EPERM');},
    wait:async()=>{active=false;},assertActive:()=>{if(!active)throw new Error('cancelled');}})),/cancelled/);
  assert.equal(calls,1);
});

test('elapsed publication budget stops retries even when fewer attempts were made',async()=>{
  let time=0,calls=0;const locked=error('EPERM');
  await assert.rejects(replaceUnpublished(options({replace:async()=>{calls++;throw locked;},
    now:()=>time,wait:async()=>{time=151;}})),e=>e===locked);
  assert.equal(calls,1);
});

test('pending source is checked again after delay and before replacement',async()=>{
  let unchanged=true,calls=0;const locked=error('EPERM');
  await assert.rejects(replaceUnpublished(options({replace:async()=>{calls++;throw locked;},
    verifyUnpublished:async()=>unchanged,wait:async()=>{unchanged=false;}})),e=>e===locked);
  assert.equal(calls,1);
});
