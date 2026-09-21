// A deliberately small executable model of the public, game-side town lane.
// It is not a TF3 API emulator: it only makes the canonicalization invariants
// independently testable in Node.

const MAX_SAFE_OBSERVED_NUMBER = 9007199254740991;

function fail(message) {
  throw new Error(message);
}

export function checkpointNumber(value, maximum = MAX_SAFE_OBSERVED_NUMBER) {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > maximum)
    fail("CHECKPOINT_NUMBER_UNAVAILABLE");
  // Lua's %.17g and JS's number formatting are not byte-identical for every
  // IEEE value. The field/value and rejection semantics are what this model
  // establishes; the real byte representation remains game-side verification.
  return String(value);
}

export function checkpointInteger(value, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    fail("CHECKPOINT_INTEGER_UNAVAILABLE");
  return String(value);
}

export function checkpointText(value, maximum) {
  if (typeof value !== "string" || value.length > maximum)
    fail("CHECKPOINT_TEXT_UNAVAILABLE");
  return `${value.length}:${value}`;
}

export function checkpointAny(value, depth = 0, budget = { count: 0 }, seen = new Set()) {
  budget.count += 1;
  if (budget.count > 4096 || depth > 8) fail("CHECKPOINT_VALUE_BUDGET_EXCEEDED");
  if (value === null || value === undefined) return "z";
  if (typeof value === "boolean") return value ? "b1" : "b0";
  if (typeof value === "number") return `n${checkpointNumber(value)}`;
  if (typeof value === "string") return `s${checkpointText(value, 4096)}`;
  if (typeof value !== "object" || seen.has(value))
    fail("CHECKPOINT_VALUE_UNSUPPORTED");

  seen.add(value);
  const entries = [];
  const sourceEntries = value instanceof Map ? [...value.entries()] : Reflect.ownKeys(value).map((key) => [key, value[key]]);
  for (const [key, item] of sourceEntries) {
    let encodedKey;
    if (typeof key === "string") encodedKey = `s${checkpointText(key, 1024)}`;
    else if (typeof key === "number") encodedKey = `i${checkpointInteger(key, -2147483648, 2147483647)}`;
    else fail("CHECKPOINT_KEY_UNSUPPORTED");
    entries.push(`${encodedKey}=${checkpointAny(item, depth + 1, budget, seen)}`);
    if (entries.length > 512) fail("CHECKPOINT_TABLE_UNAVAILABLE");
  }
  seen.delete(value);
  entries.sort();
  return `{${entries.join(",")}}`;
}

export function canonicalTownRows({ towns, buildings }) {
  if (!Array.isArray(towns) || !Array.isArray(buildings) || towns.length > 4096 || buildings.length > 16384)
    fail("TOWN_ENUMERATION_UNAVAILABLE");
  const ids = (rows, label) => rows.map((row) => {
    if (!Number.isInteger(row.id) || row.id < 0) fail(`${label}_ENTITY_UNAVAILABLE`);
    return row;
  }).sort((a, b) => a.id - b.id);
  const rows = [];
  for (const town of ids(towns, "TOWN")) {
    if (!Array.isArray(town.initialLandUseCapacities) || !Array.isArray(town.levelToCapacityDistributionWeights)
      || !Array.isArray(town.sizeFactors) || !Array.isArray(town.cargoNeeds) || typeof town.developmentActive !== "boolean")
      fail("TOWN_COMPONENT_UNAVAILABLE");
    if (town.initialLandUseCapacities.length > 16 || town.levelToCapacityDistributionWeights.length > 64
      || town.sizeFactors.length > 16 || town.cargoNeeds.length > 4) fail("TOWN_ARRAY_UNAVAILABLE");
    let row = `t:${town.id}:d${town.developmentActive ? 1 : 0}:c${checkpointNumber(town.capacityScalingFactor)}:i${town.initialLandUseCapacities.length}`;
    for (const capacity of town.initialLandUseCapacities) row += `,${checkpointInteger(capacity, 0, 2147483647)}`;
    row += `:w${town.levelToCapacityDistributionWeights.length}`;
    for (const weights of town.levelToCapacityDistributionWeights) {
      if (!Array.isArray(weights) || weights.length > 64) fail("TOWN_DISTRIBUTION_UNAVAILABLE");
      row += `/${weights.length}`;
      for (const weight of weights) row += `,${checkpointNumber(weight)}`;
    }
    row += `:s${town.sizeFactors.length}`;
    for (const size of town.sizeFactors) row += `,${checkpointNumber(size)}`;
    row += `:n${town.cargoNeeds.length}`;
    for (const district of town.cargoNeeds) {
      if (!Array.isArray(district) || district.length > 128) fail("TOWN_CARGO_NEEDS_UNAVAILABLE");
      row += `/${district.length}`;
      for (const need of district) {
        if (!Array.isArray(need) || need.length !== 2) fail("TOWN_CARGO_NEED_UNAVAILABLE");
        row += `,${checkpointInteger(need[0], 0, 2147483647)}=${checkpointNumber(need[1])}`;
      }
    }
    rows.push(`${row}:e${checkpointNumber(town.noise)}:o${checkpointNumber(town.pollution)}`);
  }
  for (const building of ids(buildings, "TOWN_BUILDING")) {
    if (typeof building.blockedDevelopment !== "boolean" || !building.construction) fail("TOWN_BUILDING_COMPONENT_UNAVAILABLE");
    const c = building.construction;
    rows.push(`b:${building.id}:t${building.town}:l${checkpointInteger(building.level, 0, 2147483647)}:b${building.blockedDevelopment ? 1 : 0}:x${checkpointInteger(building.timeBuilt, -MAX_SAFE_OBSERVED_NUMBER, MAX_SAFE_OBSERVED_NUMBER)}:f${checkpointText(c.fileName, 1024)}:p${checkpointInteger(c.seed, -2147483648, 2147483647)}:y${checkpointInteger(c.year, -2147483648, 2147483647)}:m${checkpointAny(c.modules)}`);
  }
  return rows.join(";");
}
