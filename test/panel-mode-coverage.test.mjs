import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GUI admission covers every implemented dispatch mode and no extra modes',async()=>{
  const panel=await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl',import.meta.url),'utf8');
  const exchange=panel.slice(panel.indexOf('local function exchangeTelemetry'),panel.indexOf('-- USERDATA EXCHANGE END'));
  const gate=exchange.slice(0,exchange.indexOf('local nonce ='));
  const accepted=new Set([...gate.matchAll(/config\.mode ~= "([a-z_]+)"/g)].map(m=>m[1]));
  const dispatched=new Set(['telemetry',...[...exchange.matchAll(/config\.mode == "([a-z_]+)"/g)].map(m=>m[1])]);
  assert.deepEqual([...accepted].sort(),[...dispatched].sort());
  assert.ok(accepted.has('halt_test'));assert.ok(accepted.has('watchdog_test'));
});

test('helper-published bridge modes are accepted by the GUI panel',async()=>{
  const panel=await readFile(new URL('../mod/content/tf3mp_status_panel.script.tl',import.meta.url),'utf8');
  const bridge=await readFile(new URL('../src/game-bridge.mjs',import.meta.url),'utf8');
  const gate=panel.slice(panel.indexOf('local function exchangeTelemetry'),panel.indexOf('local nonce =',panel.indexOf('local function exchangeTelemetry')));
  const accepted=new Set([...gate.matchAll(/config\.mode ~= "([a-z_]+)"/g)].map(m=>m[1]));
  for(const m of bridge.matchAll(/mode:\s*"([a-z_]+)"/g))assert.ok(accepted.has(m[1]),`missing GUI mode: ${m[1]}`);
});
