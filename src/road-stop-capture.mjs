import { canonicalJson, sha256Canonical } from "./canonical.mjs";

// This is a copied-primitive capture validator only.  It intentionally has no
// game, transport, command, or proposal-reconstruction dependency.
export const ROAD_STOP_CAPTURE_MAX_BYTES = 256 * 1024;
export const ROAD_STOP_CAPTURE_MAX_RECORDS = 64;

const own = (value, keys, name) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) fail(`${name} has unknown or missing fields`);
  return value;
};
const fail = message => { throw new TypeError(`ROAD_STOP_CODEC_UNSUPPORTED: ${message}`); };
const list = (value, name, item) => {
  if (!Array.isArray(value) || value.length > ROAD_STOP_CAPTURE_MAX_RECORDS) fail(`${name} must be a bounded array`);
  return value.map((entry, index) => item(entry, `${name}[${index}]`));
};
const number = (value, name) => {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${name} must be finite`);
  return Object.is(value, -0) ? 0 : value;
};
const int32 = (value, name) => {
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) fail(`${name} must be an int32`);
  return value;
};
const owner = (value, name) => {
  int32(value, name);
  if (value <= 0) fail(`${name} must be a positive owner identity`);
  return value;
};
const bool = (value, name) => {
  if (typeof value !== "boolean") fail(`${name} must be boolean`);
  return value;
};
const text = (value, name) => {
  if (typeof value !== "string" || value.length > 1024 || value.includes("\0")) fail(`${name} must be a bounded string`);
  return value;
};
const enumValue = (allowed, value, name) => {
  if (typeof value !== "string" || !allowed.has(value)) fail(`${name} has an unsupported enum value`);
  return value;
};
const vec3 = (value, name) => {
  if (!Array.isArray(value) || value.length !== 3) fail(`${name} must be Vec3f`);
  return value.map((v, i) => number(v, `${name}[${i}]`));
};
const mat4 = (value, name) => {
  if (!Array.isArray(value) || value.length !== 16) fail(`${name} must be Mat4f`);
  return value.map((v, i) => number(v, `${name}[${i}]`));
};

const BASE_EDGE_TYPES = new Set(["NORMAL", "BRIDGE", "TUNNEL"]);
const ROAD_TYPES = new Set(["STREET", "TRACK"]);
const EDGE_OBJECT_TYPES = new Set(["STOP_LEFT", "STOP_RIGHT", "SIGNAL"]);
const PRECEDENCE = new Set(["YES", "NO", "AUTO"]);
const TRANSPORT_MODES = new Set(["PERSON", "CARGO", "CAR", "BUS", "TRUCK", "TRAM", "ELECTRIC_TRAM", "TRAIN", "ELECTRIC_TRAIN", "AIRCRAFT", "SHIP", "SMALL_AIRCRAFT", "SMALL_SHIP", "HELICOPTER", "TRAM_TRACK", "ELECTRIC_TRAM_TRACK"]);

// Native PrecedencePreference values are not always exposed symbolically by
// the game callback. Preserve a copied numeric code without assigning it a
// meaning; this diagnostic parser never authorizes reconstruction or admission.
function precedence(value, name) {
  if (typeof value === "string") return enumValue(PRECEDENCE, value, name);
  own(value, ["nativeCode"], name);
  return { nativeCode: int32(value.nativeCode, `${name}.nativeCode`) };
}

function laneConfig(value, name) {
  own(value, ["speed", "width", "height", "forward", "transportModes", "offset"], name);
  const transportModes = list(value.transportModes, `${name}.transportModes`, (entry, entryName) => {
    if (!Array.isArray(entry) || entry.length !== 2) fail(`${entryName} must be [symbol, boolean]`);
    return [enumValue(TRANSPORT_MODES, entry[0], `${entryName}[0]`), bool(entry[1], `${entryName}[1]`)];
  });
  transportModes.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  if (transportModes.some((entry, index) => index && entry[0] === transportModes[index - 1][0])) fail(`${name}.transportModes has duplicate keys`);
  return { speed: number(value.speed, `${name}.speed`), width: number(value.width, `${name}.width`), height: number(value.height, `${name}.height`), forward: bool(value.forward, `${name}.forward`), transportModes, offset: number(value.offset, `${name}.offset`) };
}

function baseEdge(value, name) {
  own(value, ["type", "typeIndex", "objects", "laneConfigs", "roadDevelopmentLocked", "node0", "node1", "position0", "position1", "tangent0", "tangent1", "laneConfig", "edgeDecorations", "distance", "roadType", "roadTemplate", "roadStyle"], name);
  const objects = list(value.objects, `${name}.objects`, (entry, entryName) => {
    if (!Array.isArray(entry) || entry.length !== 2) fail(`${entryName} must be [entity, edge-object-type]`);
    return [int32(entry[0], `${entryName}[0]`), enumValue(EDGE_OBJECT_TYPES, entry[1], `${entryName}[1]`)];
  });
  const edgeDecorations = list(value.edgeDecorations, `${name}.edgeDecorations`, (entry, entryName) => {
    if (!Array.isArray(entry) || entry.length !== 2) fail(`${entryName} must be [integer, boolean]`);
    return [int32(entry[0], `${entryName}[0]`), bool(entry[1], `${entryName}[1]`)];
  });
  return { type: enumValue(BASE_EDGE_TYPES, value.type, `${name}.type`), typeIndex: int32(value.typeIndex, `${name}.typeIndex`), objects,
    laneConfigs: list(value.laneConfigs, `${name}.laneConfigs`, laneConfig), roadDevelopmentLocked: bool(value.roadDevelopmentLocked, `${name}.roadDevelopmentLocked`),
    node0: int32(value.node0, `${name}.node0`), node1: int32(value.node1, `${name}.node1`), position0: vec3(value.position0, `${name}.position0`), position1: vec3(value.position1, `${name}.position1`), tangent0: vec3(value.tangent0, `${name}.tangent0`), tangent1: vec3(value.tangent1, `${name}.tangent1`),
    laneConfig: list(value.laneConfig, `${name}.laneConfig`, laneConfig), edgeDecorations, distance: number(value.distance, `${name}.distance`), roadType: enumValue(ROAD_TYPES, value.roadType, `${name}.roadType`), roadTemplate: text(value.roadTemplate, `${name}.roadTemplate`), roadStyle: text(value.roadStyle, `${name}.roadStyle`) };
}

function node(value, name) {
  own(value, ["entity", "comp"], name); own(value.comp, ["position"], `${name}.comp`);
  return { entity: int32(value.entity, `${name}.entity`), comp: { position: vec3(value.comp.position, `${name}.comp.position`) } };
}
function segment(value, name) {
  own(value, ["entity", "comp", "type", "streetEdge", "emissionEmitter", "playerOwned"], name);
  const emissionEmitter = value.emissionEmitter === null ? null : (() => { own(value.emissionEmitter, ["position", "radius", "noisePower", "pollutionPower"], `${name}.emissionEmitter`); return { position: vec3(value.emissionEmitter.position, `${name}.emissionEmitter.position`), radius: number(value.emissionEmitter.radius, `${name}.emissionEmitter.radius`), noisePower: number(value.emissionEmitter.noisePower, `${name}.emissionEmitter.noisePower`), pollutionPower: number(value.emissionEmitter.pollutionPower, `${name}.emissionEmitter.pollutionPower`) }; })();
  const playerOwned = value.playerOwned === null ? null : (() => { own(value.playerOwned, ["player"], `${name}.playerOwned`); return { player: owner(value.playerOwned.player, `${name}.playerOwned.player`) }; })();
  own(value.streetEdge, ["precedenceNode0", "precedenceNode1"], `${name}.streetEdge`);
  if (value.type !== 0) fail(`${name}.type is not the supported street variant`);
  if (value.comp?.roadType !== 'STREET') fail(`${name}.comp.roadType is not STREET`);
  return { entity: int32(value.entity, `${name}.entity`), comp: baseEdge(value.comp, `${name}.comp`), type: 0, streetEdge: { precedenceNode0: precedence(value.streetEdge.precedenceNode0, `${name}.streetEdge.precedenceNode0`), precedenceNode1: precedence(value.streetEdge.precedenceNode1, `${name}.streetEdge.precedenceNode1`) }, emissionEmitter, playerOwned };
}
function edgeObject(value, name) {
  own(value, ["resultEntity", "category", "modelInstance", "playerEntity", "left"], name);
  own(value.modelInstance, ["modelId", "transf0", "transf", "transformator"], `${name}.modelInstance`);
  if (value.category !== 0) fail(`${name}.category is not the supported stop variant`);
  const modelId = int32(value.modelInstance.modelId, `${name}.modelInstance.modelId`);
  if (modelId < 0) fail(`${name}.modelInstance.modelId must be nonnegative`);
  return { resultEntity: int32(value.resultEntity, `${name}.resultEntity`), category: 0, modelInstance: { modelId, transf0: mat4(value.modelInstance.transf0, `${name}.modelInstance.transf0`), transf: mat4(value.modelInstance.transf, `${name}.modelInstance.transf`), transformator: int32(value.modelInstance.transformator, `${name}.modelInstance.transformator`) }, playerEntity: owner(value.playerEntity, `${name}.playerEntity`), left: bool(value.left, `${name}.left`) };
}
function entityMap(value, name, oneValue) {
  const entries = list(value, name, (entry, entryName) => {
    if (!Array.isArray(entry) || entry.length !== 2) fail(`${entryName} must be a key/value pair`);
    return [int32(entry[0], `${entryName}[0]`), oneValue(entry[1], `${entryName}[1]`)];
  });
  entries.sort((a, b) => a[0] - b[0]);
  if (entries.some((entry, index) => index && entry[0] === entries[index - 1][0])) fail(`${name} has duplicate keys`);
  return entries;
}
function street(value) {
  own(value, ["addedNodes", "removedNodes", "addedSegments", "removedSegments", "edgeObjectsToAdd", "new2oldEdgeObjects", "old2newEdgeObjects", "nodeConfigsToAdd", "nodeConfigsToRemove"], "proposal.street");
  const nodeConfigsToAdd = list(value.nodeConfigsToAdd, "proposal.street.nodeConfigsToAdd", entry => entry);
  const nodeConfigsToRemove = list(value.nodeConfigsToRemove, "proposal.street.nodeConfigsToRemove", entry => entry);
  if (nodeConfigsToAdd.length || nodeConfigsToRemove.length) fail("node configurations are unsupported pending schema qualification");
  const addedSegments = list(value.addedSegments, "proposal.street.addedSegments", segment);
  const removedSegments = list(value.removedSegments, "proposal.street.removedSegments", segment);
  const edgeObjectsToAdd = list(value.edgeObjectsToAdd, "proposal.street.edgeObjectsToAdd", edgeObject);
  if (!addedSegments.length || !removedSegments.length || edgeObjectsToAdd.length !== 1) fail("capture is outside the supported offline curb-stop schema");
  return { addedNodes: list(value.addedNodes, "proposal.street.addedNodes", node), removedNodes: list(value.removedNodes, "proposal.street.removedNodes", node), addedSegments, removedSegments, edgeObjectsToAdd, new2oldEdgeObjects: entityMap(value.new2oldEdgeObjects, "proposal.street.new2oldEdgeObjects", (v, n) => list(v, n, int32)), old2newEdgeObjects: entityMap(value.old2newEdgeObjects, "proposal.street.old2newEdgeObjects", (v, n) => list(v, n, int32)), nodeConfigsToAdd: [], nodeConfigsToRemove: [] };
}
function terrain(value) {
  own(value, ["baseHeightMod"], "proposal.terrain"); own(value.baseHeightMod, ["x0", "y0", "width", "height"], "proposal.terrain.baseHeightMod");
  const grid = value.baseHeightMod;
  if (int32(grid.width, "proposal.terrain.baseHeightMod.width") !== 0 || int32(grid.height, "proposal.terrain.baseHeightMod.height") !== 0) fail("nonempty terrain is unsupported pending native accessor qualification");
  return { baseHeightMod: { x0: int32(grid.x0, "proposal.terrain.baseHeightMod.x0"), y0: int32(grid.y0, "proposal.terrain.baseHeightMod.y0"), width: 0, height: 0 } };
}

function normalizeRoadStopCapture(value) {
  own(value, ["schemaVersion", "builderId", "proposal"], "capture");
  if (value.schemaVersion !== 1 || value.builderId !== "streetTerminalBuilder") fail("unsupported capture version or builder");
  own(value.proposal, ["street", "toRemove", "old2new", "toAdd", "terrain"], "proposal");
  const toAdd = list(value.proposal.toAdd, "proposal.toAdd", entry => entry);
  if (toAdd.length) fail("construction additions are unsupported pending schema qualification");
  return { schemaVersion: 1, builderId: "streetTerminalBuilder", proposal: { street: street(value.proposal.street), toRemove: list(value.proposal.toRemove, "proposal.toRemove", int32), old2new: entityMap(value.proposal.old2new, "proposal.old2new", int32), toAdd: [], terrain: terrain(value.proposal.terrain) } };
}

export function parseRoadStopCapture(json) {
  if (typeof json !== "string") fail("capture input must be a JSON string");
  if (Buffer.byteLength(json, "utf8") > ROAD_STOP_CAPTURE_MAX_BYTES) fail("capture exceeds 256 KiB");
  let parsed;
  try { parsed = JSON.parse(json); } catch { fail("capture is not valid JSON"); }
  const capture = normalizeRoadStopCapture(parsed);
  return { capture, canonical: canonicalJson(capture), digest: sha256Canonical(capture) };
}
