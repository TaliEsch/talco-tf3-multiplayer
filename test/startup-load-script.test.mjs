import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const source=await readFile(new URL('../mod/content/tf3mp_startup_load.script.lua',import.meta.url),'utf8');

test('startup loader selects only an exact disposable copy and consumes request before load',()=>{
  for(const marker of [
    'string.match(value.saveName, "^tf3mp_disposable_[a-f0-9]+$")',
    '#value.saveName == 49',
    'info.size == request.expectedBytes',
    'normalized == relativeName',
    '#info.saveName >= 1 and #info.saveName <= 256',
    'for _, info in pairs(saves) do',
    'if scanned > 4096 then',
    'if matches ~= 1 then',
    'if matches == 0 and candidates == 0 then',
    'selected = { path = "", saveName = request.saveName }',
    'pcall(app.removeUserdata, "tf3mp_status_1", "startup_load_request")',
    'pcall(app.getAllUserdata, "tf3mp_status_1")',
    'pcall(app.loadGame, id, false)',
    'local ok = pcall(attemptLoad)',
    'if attempted or not menuReady then return end',
    'if readyUpdates < 2 then return end',
    'if name == "mainMenuReady" then menuReady = true end',
  ])assert.ok(source.includes(marker),marker);
  assert.ok(source.indexOf('pcall(app.removeUserdata')<source.indexOf('pcall(app.loadGame'));
  assert.doesNotMatch(source,/app\.saveGame\s*\(|api\.cmd|sendCommand|setGameSpeedup/);
});
