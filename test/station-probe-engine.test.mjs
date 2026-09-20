import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../mod/content/tf3mp_status.script.tl", import.meta.url), "utf8");
const region = source.slice(source.indexOf("local function stationTemplateEvent"), source.indexOf("local function financeEvent"));

test("station template probe accepts only the exact, fresh six-field request", () => {
  assert.match(region, /request\.kind ~= "station_template_probe"/);
  assert.match(region, /if count ~= 6 then return nil end/);
  assert.match(region, /request\.expiresTick ~= request\.issuedTick \+ 300/);
  assert.match(region, /clock\.tickCount < request\.issuedTick or clock\.tickCount > request\.expiresTick/);
  assert.match(region, /old\.nonce == nonce and old\.requestId == request\.requestId/);
  assert.match(source, /name == "tf3mp_station_template_probe"/);
  assert.match(source, /name == "tf3mp_get_station_template"/);
});

test("station template probe saves a terminal attempt before read-only inspection", () => {
  assert.ok(region.indexOf("current.stationTemplateAttempted = true") < region.indexOf("stationProbe.inspect()"));
  assert.ok(region.indexOf("state:set(current) -- Save the duplicate barrier") < region.indexOf("stationProbe.inspect()"));
  assert.match(region, /if current\.stationTemplateAttempted == true then receipt\.code = "ALREADY_ATTEMPTED"/);
  assert.doesNotMatch(region, /api\.cmd|makeWorldBuildProposalCmd|sendCommand/);
  const handler = source.slice(source.indexOf('name == "tf3mp_station_template_probe"'), source.indexOf('name == "tf3mp_finance_probe"'));
  assert.match(handler, /if ok then[\s\S]*state:set\(current\)/);
  assert.match(handler, /local saved = state:get\(\) or current/);
});

test("station template receipt is flat, bounded, and sanitizes failed inspection", () => {
  for (const field of ["schemaVersion", "kind", "nonce", "requestId", "tickCount", "updateCount", "code", "paramsPresent", "modulesPresent", "moduleCount", "subconstructionCount", "costKnown", "cost", "templateIndex", "platforms"])
    assert.match(region, new RegExp(`${field}=`));
  assert.match(region, /code="PROBE_FAILED", paramsPresent=0, modulesPresent=0/);
  assert.match(region, /moduleCount=0, subconstructionCount=0, costKnown=0, cost=0, templateIndex=0, platforms=1/);
  assert.match(region, /observation\.code ~= "TEMPLATE_EVALUATED"/);
  assert.match(region, /observation\.moduleCount > 256/);
  assert.match(source, /eventSubscriptionsVersion ~= 17/);
  assert.match(source, /current\.eventSubscriptionsVersion = 17/);
});
