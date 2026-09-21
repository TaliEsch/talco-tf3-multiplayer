import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canonicalTownRows, checkpointAny } from "./support/town-checkpoint-model.mjs";

test("engine checkpoint producer reads bounded public components and keeps hidden state explicit", async () => {
  const source = await readFile(new URL("../mod/content/tf3mp_status.script.tl", import.meta.url), "utf8");
  const region = source.slice(source.indexOf("local function digestText"), source.indexOf("local function companyEvent"));
  assert.match(region, /townComponentDigest\(\)/);
  assert.match(region, /getEntitiesWithComponent\(api\.type\.ComponentType\.TOWN\)/);
  assert.match(region, /getEntitiesWithComponent\(api\.type\.ComponentType\.TOWN_BUILDING\)/);
  assert.match(region, /api\.engine\.getComponent\(entity, api\.type\.ComponentType\.TOWN\)/);
  assert.match(region, /api\.engine\.getComponent\(entity, api\.type\.ComponentType\.TOWN_BUILDING\)/);
  assert.match(region, /developmentActive/);
  assert.match(region, /capacityScalingFactor/);
  assert.match(region, /levelToCapacityDistributionWeights/);
  assert.match(region, /value = value \.\. ":w\?"/);
  assert.match(region, /cargoNeeds/);
  assert.match(region, /town\.noise/);
  assert.match(region, /town\.pollution/);
  assert.match(region, /blockedDevelopment/);
  assert.match(region, /construction\.params\.modules/);
  assert.match(region, /rosterEntities\(receipt\)/);
  assert.match(region, /api\.engine\.system\.streetSystem\.getNode2SegmentMap\(\)/);
  assert.match(region, /ComponentType\.TRANSPORT_VEHICLE/);
  assert.match(region, /api\.engine\.system\.lineSystem\.getLines\(\)/);
  assert.doesNotMatch(region, /getEntitiesWithComponent\(api\.type\.ComponentType\.(?:PLAYER|BASE_EDGE|LINE)\)/);
  assert.match(region, /rngHiddenStateStatus = "unavailable"/);
  assert.match(region, /#engineIds > 16384/);
  assert.match(region, /#towns > 4096 or #buildings > 16384/);
  assert.match(region, /checkpointAny\(construction\.params\.modules/);
  assert.match(region, /CHECKPOINT_VALUE_UNSUPPORTED/);
  assert.match(region, /CHECKPOINT_INTEGER_UNAVAILABLE/);
  assert.match(region, /CHECKPOINT_NUMBER_UNAVAILABLE/);
  assert.match(region, /TOWN_BUILDING_DISAPPEARED/);
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

test("town canonicalizer is insertion-order independent and distinguishes autonomous state changes", () => {
  const town = {
    id: 20, developmentActive: true, capacityScalingFactor: 1.25,
    initialLandUseCapacities: [10, 20], levelToCapacityDistributionWeights: [[0.2, 0.8]],
    sizeFactors: [1, 1.4], cargoNeeds: [[[7, 3.5]]], noise: 0.05, pollution: 0.1,
  };
  const building = {
    id: 40, town: 20, level: 2, blockedDevelopment: false, timeBuilt: 1234,
    construction: { fileName: "construction/town.house", seed: -5, year: 1850,
      modules: { options: { density: 2, style: "brick" }, enabled: true } },
  };
  const forward = canonicalTownRows({ towns: [town, { ...town, id: 3 }], buildings: [building] });
  const reverse = canonicalTownRows({ towns: [{ ...town, id: 3 }, town], buildings: [building] });
  assert.equal(forward, reverse, "entity enumeration order must not affect a checkpoint");
  assert.notEqual(forward, canonicalTownRows({ towns: [{ ...town, noise: 0.06 }, { ...town, id: 3 }], buildings: [building] }));
  assert.notEqual(forward, canonicalTownRows({ towns: [town, { ...town, id: 3 }], buildings: [{ ...building, blockedDevelopment: true }] }));
});

test("recursive module canonicalizer is order-independent, collision-resistant, and fail-closed", () => {
  assert.equal(checkpointAny({ beta: { y: 2, x: 1 }, alpha: "z" }), checkpointAny({ alpha: "z", beta: { x: 1, y: 2 } }));
  assert.notEqual(checkpointAny(new Map([[1, "same"]])), checkpointAny(new Map([["1", "same"]])), "typed table keys must not collide");
  assert.notEqual(checkpointAny({ ab: "c" }), checkpointAny({ a: "bc" }), "length prefixes prevent field-boundary collisions");
  assert.notEqual(checkpointAny({ option: 1 }), checkpointAny({ option: 2 }));
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => checkpointAny(cycle), /CHECKPOINT_VALUE_UNSUPPORTED/);
  assert.throws(() => checkpointAny({ invalid: Infinity }), /CHECKPOINT_NUMBER_UNAVAILABLE/);
  assert.throws(() => checkpointAny(Object.fromEntries(Array.from({ length: 513 }, (_, i) => [`k${i}`, i]))), /CHECKPOINT_TABLE_UNAVAILABLE/);
});

test("town canonicalizer rejects partial or out-of-bounds observations rather than hashing a prefix", () => {
  const base = { id: 1, developmentActive: true, capacityScalingFactor: 1, initialLandUseCapacities: [], levelToCapacityDistributionWeights: [], sizeFactors: [], cargoNeeds: [], noise: 0, pollution: 0 };
  assert.throws(() => canonicalTownRows({ towns: [{ ...base, cargoNeeds: Array.from({ length: 5 }, () => []) }], buildings: [] }), /TOWN_ARRAY_UNAVAILABLE/);
  assert.throws(() => canonicalTownRows({ towns: [{ ...base, levelToCapacityDistributionWeights: [Array(65).fill(0)] }], buildings: [] }), /TOWN_DISTRIBUTION_UNAVAILABLE/);
  assert.throws(() => canonicalTownRows({ towns: [{ ...base, initialLandUseCapacities: [1.5] }], buildings: [] }), /CHECKPOINT_INTEGER_UNAVAILABLE/);
  assert.throws(() => canonicalTownRows({ towns: [{ ...base, pollution: NaN }], buildings: [] }), /CHECKPOINT_NUMBER_UNAVAILABLE/);
});
