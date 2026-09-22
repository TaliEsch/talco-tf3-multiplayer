import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {
  createLiveControlIdBudget,
  MAX_ADVERTISED_LIVE_CONTROL_IDS,
  LIVE_CHECK_CONTROL_ID_LIMIT,
} from '../tools/live-inprocess-control-budget.mjs';

const tool=fileURLToPath(new URL('../tools/live-inprocess-loader-check.mjs',import.meta.url));

test('live vehicle observation starts its action window at the reported world-ready boundary',async()=>{
  const source=await readFile(tool,'utf8');
  assert.match(source,/const minimumWorldHits=observeVehicleAction\?128:1;/);
  assert.match(source,/while\(ping\.observationHits<minimumWorldHits&&Date\.now\(\)<observationDeadline\)/);
  const vehicleBlock=source.slice(source.indexOf('if(observeVehicleAction){'),source.indexOf('  let gateEvidence=null;'));
  const readyEvent=vehicleBlock.indexOf("event:'tf3-passive-vehicle-action-ready'");
  const windowStartedAt=vehicleBlock.indexOf('const vehicleActionWindowStartedAt=Date.now();');
  const deadline=vehicleBlock.indexOf('const deadline=vehicleActionWindowStartedAt+LIVE_VEHICLE_ACTION_WAIT_WINDOW_MS;');
  assert.ok(readyEvent>=0,'missing vehicle-action readiness event');
  assert.ok(windowStartedAt>readyEvent,'action window must start after readiness is reported');
  assert.ok(deadline>windowStartedAt,'action deadline must derive from the ready-boundary timestamp');
  assert.match(vehicleBlock,/worldObservationHits:ping\.observationHits/);
  assert.match(vehicleBlock,/bridgeCorrelation:correlation\.deltas/);
});

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
  assert.equal(MAX_ADVERTISED_LIVE_CONTROL_IDS,731);
  assert.ok(MAX_ADVERTISED_LIVE_CONTROL_IDS<LIVE_CHECK_CONTROL_ID_LIMIT);
  const budget=createLiveControlIdBudget(2);
  assert.equal(await budget.issue(async()=>1),1);
  assert.equal(await budget.issue(async()=>2),2);
  assert.equal(budget.used,2);
  assert.equal(budget.remaining,0);
  assert.throws(()=>budget.issue(()=>3),/LIVE_CHECK_CONTROL_ID_BUDGET_EXHAUSTED/);
});
