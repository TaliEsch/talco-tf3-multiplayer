import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateReviewPackage } from "../src/review-validator.mjs";

const statusUrl = new URL("../mod/content/tf3mp_status.script.tl", import.meta.url);
const panelUrl = new URL("../mod/content/tf3mp_status_panel.script.tl", import.meta.url);

test("native placement observer rev7 uses protected bounded inspection, capture and a scalar acknowledgement", async () => {
  const [source, panel] = await Promise.all([readFile(statusUrl, "utf8"), readFile(panelUrl, "utf8")]);
  for (const marker of [
    'current.eventSubscriptionsVersion ~= 17',
    'state:subscribeToEvent("builder.proposalCreate")',
    'state:subscribeToEvent("builder.proposalApply")',
    'if count >= 8 then return nil end',
    'local shapeInspected = false',
    'local shapeOk = pcall(function()',
    'local slots = param as table',
    'proposalType = type(slots[1])',
    'dataType = type(slots[2])',
    'resultType = type(slots[3])',
    'shapeInspected = shapeOk',
    'if not shapeOk then proposalType, dataType, resultType = "nil", "nil", "nil" end',
    '\\"payloadType\\":\\"',
    '\\"shapeInspected\\":',
    'local tick, update = -1, -1',
    'local queue = current.placementLogQueue or {}',
    'if #queue < 16 then queue[#queue + 1] = entry end',
    'local pendingLogs = guiCurrent.placementLogQueue or {}',
    'for _, entry in ipairs(pendingLogs) do log.message(entry) end',
    'current.placementObserverFailed = true',
    'pcall(function() observeNativePlacement(guiState, id, name, _param) end)',
    'return nil -- No restriction/error result, even if observation failed.',
    'local guiCurrent = guiState:get() or {}',
    'return { kind = "placement_observer_ack", observerRevision = 7, passive = true }',
    'if shapeOk and id == "streetTerminalBuilder" then',
    'return proposalFacts.collect(slots[1], slots[2], slots[3])',
    'type(captured) == "string" and #captured <= 1024',
    'if (isApply and current.roadCaptureApply == nil) or (not isApply and current.roadCaptureCreate == nil) then',
    'return roadCapture.collect(slots[1], roadCaptureTypes, roadCaptureModelName)',
    'type(value.json) == "string" and #value.json > 0 and #value.json <= 262144',
    'result = { code = "captured", json = value.json, modelResourceName = value.modelResourceName, sequence = current.placementSequence }',
  ]) assert.ok(source.includes(marker), marker);
  for (const marker of [
    'local placementRouteChecked = false',
    'local placementRouteSteps : integer = 0',
    'local placementRouteAttempts : integer = 0',
    'local function checkPlacementRoute() : nil',
    'if placementRouteChecked then return nil end',
    'placementRouteSteps = placementRouteSteps + 1',
    'if placementRouteSteps % 60 ~= 0 then return nil end',
    'placementRouteAttempts = placementRouteAttempts + 1',
    'if placementRouteAttempts == 1 then',
    'native_placement_observer_ready\\",\\"observerRevision\\":7',
    'api.gui.fireGuiScriptEvent("tf3mp_placement_observer", "tf3mp_placement_observer_selftest", {})',
    'ack.kind == "placement_observer_ack" and ack.observerRevision == 7 and ack.passive == true',
    'api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_status", {})',
    'local controlDelivered = false', 'type(controlValue) == "table"', 'local control = controlValue as table', 'type(control.status) == "string"',
    'placementRouteChecked = delivered or placementRouteAttempts >= 12',
    '\\"attempt\\":', '\\"final\\":', '\\"returnType\\":', '\\"controlDelivered\\":',
    '\\"delivered\\":', '\\"callSucceeded\\":', '\\"synthetic\\":true',
    'local function exchangeRoadCapture()',
    'local function flushRoadCapture()',
    '-- USERDATA EXCHANGE BEGIN: only invoked by the protected regular onStep callback.',
    'local ok = pcall(exchangeRoadCapture)',
    'app.saveUserdata("tf3mp_status_1", "road_capture_" .. stage, {',
    'react.onStep(function()\n    checkPlacementRoute()\n    flushRoadCapture()\n    if bridgeFailed then',
  ]) assert.ok(panel.includes(marker), marker);
  assert.doesNotMatch(source, /rawget\s*\(/);
  const guiUpdate = source.slice(source.indexOf("  guiUpdate = function"), source.indexOf("  guiHandleEvent = function"));
  assert.doesNotMatch(guiUpdate, /fireGuiScriptEvent|placementObserverReady|placementSelfTest/);
  await assert.doesNotReject(validateReviewPackage(new URL("../mod", import.meta.url)));
});

test("review rejects weakened native placement observer safety boundaries", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tf3mp-native-placement-review-"));
  try {
    await cp(new URL("../mod", import.meta.url), root, { recursive: true });
    const file = path.join(root, "content", "tf3mp_status.script.tl");
    const panelFile = path.join(root, "content", "tf3mp_status_panel.script.tl");
    const source = await readFile(file, "utf8");
    const panel = await readFile(panelFile, "utf8");
    const factsFile = path.join(root, 'content', 'tf3mp_proposal_facts.lua');
    const factsSource = await readFile(factsFile, 'utf8');
    await writeFile(factsFile, factsSource + '\napi.cmd.sendCommand(nil)\n');
    await assert.rejects(validateReviewPackage(root), /proposal facts collector differs/);
    await writeFile(factsFile, factsSource);

    await writeFile(file, source.replace("if count >= 8 then return nil end", "if false then return nil end"));
    await assert.rejects(validateReviewPackage(root), /passive and bounded/);

    await writeFile(file, source.replace('#captured <= 1024', '#captured <= 999999'));
    await assert.rejects(validateReviewPackage(root), /passive and bounded/);

    await writeFile(file, source.replace("type(slots[3])", "type(slots[4])"));
    await assert.rejects(validateReviewPackage(root), /passive and bounded|must not access engine, log, retain or traverse userdata/);

    await writeFile(file, source.replace(
      "resultType = type(slots[3])",
      "resultType = type(slots[3])\n      local unsafe = slots[1].field",
    ));
    await assert.rejects(validateReviewPackage(root), /must not access engine, log, retain or traverse userdata/);

    await writeFile(file, source.replace("local shapeOk = pcall(function()", "local shapeOk = (function()"));
    await assert.rejects(validateReviewPackage(root), /passive and bounded/);

    await writeFile(file, source.replace("shapeInspected = shapeOk", "if not shapeOk then return nil end"));
    await assert.rejects(validateReviewPackage(root), /passive and bounded/);

    await writeFile(file, source.replace("pcall(function() observeNativePlacement(guiState, id, name, _param) end)", "observeNativePlacement(guiState, id, name, _param)"));
    await assert.rejects(validateReviewPackage(root), /must fail open/);

    await writeFile(file, source.replace("local tick, update = -1, -1", "local tick, update = -1, -1; log.message(\"unexpected\")"));
    await assert.rejects(validateReviewPackage(root), /must not access engine, log/);

    await writeFile(file, source);
    await writeFile(panelFile, panel.replace(
      'api.gui.fireGuiScriptEvent("tf3mp_placement_observer", "tf3mp_placement_observer_selftest", {})',
      'api.gui.fireGuiScriptEvent("tf3mp_placement_observer", "tf3mp_placement_observer_selftest", {}); api.gui.fireGuiScriptEvent("untrusted", "untrusted", {})',
    ));
    await assert.rejects(validateReviewPackage(root), /must remain two fixed read-only GUI dispatches/);

    await writeFile(panelFile, panel.replace('placementRouteAttempts >= 12', 'placementRouteAttempts >= 13'));
    await assert.rejects(validateReviewPackage(root), /must log and verify its explicit acknowledgement/);

    await writeFile(panelFile, panel.replace(
      'api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_status", {})',
      'api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "untrusted_status", {})',
    ));
    await assert.rejects(validateReviewPackage(root), /must log and verify its explicit acknowledgement|must remain two fixed read-only GUI dispatches/);

    await writeFile(panelFile, panel.replace(
      'checkPlacementRoute()\n    flushRoadCapture()\n    if bridgeFailed then',
      'if bridgeFailed then\n    checkPlacementRoute()\n    flushRoadCapture()',
    ));
    await assert.rejects(validateReviewPackage(root), /must run once from the regular panel step callback/);

    await writeFile(panelFile, panel);
    await writeFile(file, source.replace(
      'return { kind = "placement_observer_ack", observerRevision = 7, passive = true }',
      'return { kind = "placement_observer_ack", observerRevision = 2, passive = true }',
    ));
    await assert.rejects(validateReviewPackage(root), /must fail open/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
