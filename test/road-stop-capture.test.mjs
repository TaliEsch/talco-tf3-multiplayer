import assert from "node:assert/strict";
import test from "node:test";
import { parseRoadStopCapture, ROAD_STOP_CAPTURE_MAX_BYTES } from "../src/road-stop-capture.mjs";

const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 5, 6, 1];
const lane = { speed: 20, width: 3, height: 0, forward: true, transportModes: [["BUS", true], ["CAR", false]], offset: 0 };
const edge = { type: "NORMAL", typeIndex: 0, objects: [[4, "STOP_LEFT"]], laneConfigs: [lane], roadDevelopmentLocked: false, node0: 1, node1: 2, position0: [0, 0, 0], position1: [10, 0, 0], tangent0: [1, 0, 0], tangent1: [1, 0, 0], laneConfig: [lane], edgeDecorations: [[8, true]], distance: 10, roadType: "STREET", roadTemplate: "street/standard", roadStyle: "standard" };
const segment = { entity: -3, comp: edge, type: 0, streetEdge: { precedenceNode0: "AUTO", precedenceNode1: "YES" }, emissionEmitter: { position: [1, 2, 3], radius: 0, noisePower: 1, pollutionPower: 2 }, playerOwned: { player: 10 } };
const fixture = () => structuredClone({ schemaVersion: 1, builderId: "streetTerminalBuilder", proposal: { street: { addedNodes: [{ entity: -1, comp: { position: [0, 0, 0] } }], removedNodes: [], addedSegments: [segment], removedSegments: [{ ...segment, entity: 22, emissionEmitter: null, playerOwned: null }], edgeObjectsToAdd: [{ resultEntity: -4, category: 0, modelInstance: { modelId: 7, transf0: matrix, transf: matrix, transformator: -1 }, playerEntity: 10, left: true }], new2oldEdgeObjects: [[9, [5, 3]], [2, []]], old2newEdgeObjects: [[9, [3]]], nodeConfigsToAdd: [], nodeConfigsToRemove: [] }, toRemove: [22], old2new: [[22, -3]], toAdd: [], terrain: { baseHeightMod: { x0: -10, y0: 7, width: 0, height: 0 } } } });
const decode = value => parseRoadStopCapture(JSON.stringify(value));
const changed = (mutate) => { const value = fixture(); mutate(value); return value; };

test("normal curb-stop capture round-trips to a canonical digest", () => {
  const value = fixture(); const a = decode(value); const b = decode(JSON.parse(JSON.stringify(value)));
  assert.deepEqual(a.capture, b.capture); assert.equal(a.digest, b.digest); assert.equal(typeof a.canonical, "string");
  assert.deepEqual(a.capture.proposal.street.new2oldEdgeObjects, [[2, []], [9, [5, 3]]]);
  assert.deepEqual(a.capture.proposal.street.addedSegments[0].comp.laneConfigs[0].transportModes, [["BUS", true], ["CAR", false]]);
});
test("meaningful copied fields change the digest", () => {
  const a = decode(fixture()); const changed = fixture(); changed.proposal.street.edgeObjectsToAdd[0].left = false;
  assert.notEqual(a.digest, decode(changed).digest);
});
test("numeric native precedence codes are copied without assigning symbolic meaning", () => {
  const value = fixture();
  value.proposal.street.addedSegments[0].streetEdge = { precedenceNode0: { nativeCode: -7 }, precedenceNode1: { nativeCode: 42 } };
  value.proposal.street.removedSegments[0].streetEdge = { precedenceNode0: { nativeCode: -7 }, precedenceNode1: { nativeCode: 42 } };
  const first = decode(value), second = decode(JSON.parse(JSON.stringify(value)));
  assert.deepEqual(first.capture.proposal.street.addedSegments[0].streetEdge, { precedenceNode0: { nativeCode: -7 }, precedenceNode1: { nativeCode: 42 } });
  assert.equal(first.digest, second.digest);
});
test("native precedence union rejects malformed or non-int32 codes", () => {
  for (const code of ["1", 1.5, 2147483648, -2147483649]) {
    assert.throws(() => decode(changed(value => { value.proposal.street.addedSegments[0].streetEdge.precedenceNode0 = { nativeCode: code }; })), /ROAD_STOP_CODEC_UNSUPPORTED/);
  }
  for (const value of [{}, { nativeCode: 1, extra: true }, { nativeCode: 1, another: 2 }, { extra: true }]) {
    assert.throws(() => decode(changed(capture => { capture.proposal.street.addedSegments[0].streetEdge.precedenceNode1 = value; })), /ROAD_STOP_CODEC_UNSUPPORTED/);
  }
});
test("strictly rejects malformed shapes, unknown fields and nonfinite JSON values", () => {
  for (const mutate of [v => { v.extra = 1; }, v => { delete v.proposal.terrain; }, v => { v.proposal.street.addedSegments[0].comp.unknown = 1; }, v => { v.proposal.street.addedSegments[0].comp.distance = "1"; }]) assert.throws(() => decode(changed(mutate)), /ROAD_STOP_CODEC_UNSUPPORTED/);
  assert.throws(() => parseRoadStopCapture('{"schemaVersion":1,"builderId":"streetTerminalBuilder","proposal":NaN}'), /valid JSON/);
});
test("rejects duplicate maps, oversized records, wrong version, and unsupported variants", () => {
  const duplicate = fixture(); duplicate.proposal.old2new.push([22, 99]);
  assert.throws(() => decode(duplicate), /duplicate/);
  const many = fixture(); many.proposal.street.addedNodes = Array.from({ length: 65 }, () => ({ entity: 1, comp: { position: [0, 0, 0] } }));
  assert.throws(() => decode(many), /bounded/);
  for (const mutate of [v => { v.schemaVersion = 2; }, v => { v.builderId = "other"; }, v => { v.proposal.street.addedSegments[0].type = 1; }, v => { v.proposal.street.nodeConfigsToRemove = [1]; }, v => { v.proposal.terrain.baseHeightMod.width = 1; }, v => { v.proposal.street.addedSegments = []; }, v => { v.proposal.street.edgeObjectsToAdd[0].modelInstance.modelId = -1; }]) assert.throws(() => decode(changed(mutate)), /ROAD_STOP_CODEC_UNSUPPORTED/);
});
test("JSON input is bounded before parsing", () => {
  assert.throws(() => parseRoadStopCapture(" ".repeat(ROAD_STOP_CAPTURE_MAX_BYTES + 1)), /256 KiB/);
  assert.throws(() => parseRoadStopCapture(fixture()), /JSON string/);
});
