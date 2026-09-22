import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {
  createLiveControlIdBudget,
  MAX_ADVERTISED_LIVE_CONTROL_IDS,
  LIVE_CHECK_CONTROL_ID_LIMIT,
} from '../tools/live-inprocess-control-budget.mjs';

const tool=fileURLToPath(new URL('../tools/live-inprocess-loader-check.mjs',import.meta.url));

test('live in-process checker rejects unknown options before launching anything',()=>{
  const run=spawnSync(process.execPath,[tool,'--unknown'],{
    windowsHide:true,encoding:'utf8',timeout:10_000});
  assert.ifError(run.error);
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/usage: node tools\/live-inprocess-loader-check\.mjs/);
});

test('live in-process checker rejects a missing bridge directory before launching anything',()=>{
  const run=spawnSync(process.execPath,[tool,'--bridge-dir'],{
    windowsHide:true,encoding:'utf8',timeout:10_000});
  assert.ifError(run.error);
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/usage: node tools\/live-inprocess-loader-check\.mjs/);
});

test('live in-process checker rejects duplicate gate qualification flags before launching anything',()=>{
  const run=spawnSync(process.execPath,[tool,'--gate-detach','--gate-detach'],{
    windowsHide:true,encoding:'utf8',timeout:10_000});
  assert.ifError(run.error);
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/usage: node tools\/live-inprocess-loader-check\.mjs/);
});

test('live in-process checker requires one terminal gate experiment before launching anything',()=>{
  const run=spawnSync(process.execPath,[tool],{
    windowsHide:true,encoding:'utf8',timeout:10_000});
  assert.ifError(run.error);
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/usage: node tools\/live-inprocess-loader-check\.mjs/);
});

test('live in-process checker rejects conflicting gate experiments before launching anything',()=>{
  const run=spawnSync(process.execPath,[tool,'--gate-detach','--gate-halt'],{
    windowsHide:true,encoding:'utf8',timeout:10_000});
  assert.ifError(run.error);
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/usage: node tools\/live-inprocess-loader-check\.mjs/);
});

test('live in-process checker bounds its own diagnostic control traffic',async()=>{
  assert.equal(MAX_ADVERTISED_LIVE_CONTROL_IDS,371);
  assert.ok(MAX_ADVERTISED_LIVE_CONTROL_IDS<LIVE_CHECK_CONTROL_ID_LIMIT);
  const budget=createLiveControlIdBudget(2);
  assert.equal(await budget.issue(async()=>1),1);
  assert.equal(await budget.issue(async()=>2),2);
  assert.equal(budget.used,2);
  assert.equal(budget.remaining,0);
  assert.throws(()=>budget.issue(()=>3),/LIVE_CHECK_CONTROL_ID_BUDGET_EXHAUSTED/);
});
