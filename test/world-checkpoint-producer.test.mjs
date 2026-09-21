import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("engine checkpoint producer reads bounded public components and keeps hidden state explicit", async () => {
  const source = await readFile(new URL("../mod/content/tf3mp_status.script.tl", import.meta.url), "utf8");
  const region = source.slice(source.indexOf("local function digestText"), source.indexOf("local function companyEvent"));
  assert.match(region, /observedDigest\(api\.type\.ComponentType\.CONSTRUCTION/);
  assert.match(region, /getEntitiesWithComponent\(api\.type\.ComponentType\.PLAYER\)/);
  assert.match(region, /ComponentType\.BASE_EDGE/);
  assert.match(region, /ComponentType\.TRANSPORT_VEHICLE/);
  assert.match(region, /ComponentType\.LINE/);
  assert.match(region, /rngHiddenStateStatus = "unavailable"/);
  assert.match(region, /#engineIds > 16384/);
  assert.match(region, /requestCount ~= 9/);
  assert.match(region, /table\.sort\(ids\)/);
  assert.match(region, /readClock\(\)\.updateCount ~= request\.heldUpdate/);
  assert.doesNotMatch(region, /api\.cmd|saveUserdata|fireGuiScriptEvent|checkpointHash/);
});

test("GUI envelope carries every v2 domain exactly and rejects malformed receipts", async () => {
  const source = await readFile(new URL("../mod/content/tf3mp_status_panel.script.tl", import.meta.url), "utf8");
  const region = source.slice(source.indexOf("local function exchangeHeldSnapshot"), source.indexOf("local function exchangeTelemetry"));
  for (const domain of ["townsGrowth", "economy", "topology", "vehicles", "companies", "linesServices", "rngHiddenState"])
    assert.match(region, new RegExp(`"${domain}"`));
  assert.match(region, /receipt\.schemaVersion == 2/);
  assert.match(region, /#digest ~= 64/);
  assert.match(region, /count ~= \(receipt\.schemaVersion == 2 and 30 or 16\)/);
  assert.match(region, /digest == status/);
  assert.doesNotMatch(region, /api\.cmd\.makeWorldBuildProposalCmd/);
});
