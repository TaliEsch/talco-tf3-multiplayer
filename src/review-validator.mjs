import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashManifest } from "./manifest.mjs";

const EXPECTED_CONTENT = Object.freeze([
  "tf3mp_depot_command.lua",
  "tf3mp_depot_preview.script.lua",
  "tf3mp_depot_tools.res.lua",
  "tf3mp_depot_tools.script.lua",
  "tf3mp_load_probe.script.lua",
  "tf3mp_native_controls.res.lua",
  "tf3mp_native_controls.script.tl",
  "tf3mp_proposal_facts.lua",
  "tf3mp_road_capture.lua",
  "tf3mp_road_replay_dispatch.lua",
  "tf3mp_road_replay_execute.lua",
  "tf3mp_road_replay_preflight.lua",
  "tf3mp_road_replay_prepare.lua",
  "tf3mp_road_replay_rebuild.lua",
  "tf3mp_road_replay_result.lua",
  "tf3mp_road_stop_order_execute.lua",
  "tf3mp_road_stop_order_prepare.lua",
  "tf3mp_road_stop_order_wire.lua",
  "tf3mp_road_stop_outcome.lua",
  "tf3mp_road_stop_simple_dispatch.lua",
  "tf3mp_road_stop_simple_prepare.lua",
  "tf3mp_road_stop_simple_result.lua",
  "tf3mp_service_command.lua",
  "tf3mp_service_observation.lua",
  "tf3mp_startup_load.script.lua",
  "tf3mp_station_command.lua",
  "tf3mp_station_probe.lua",
  "tf3mp_status.gs.lua",
  "tf3mp_status.script.tl",
  "tf3mp_status_panel.css.lua",
  "tf3mp_status_panel.res.lua",
  "tf3mp_status_panel.script.tl",
  "tf3mp_stop_readback.lua",
  "tf3mp_vehicle_command.lua",
  "tf3mp_vehicle_test.res.lua",
  "tf3mp_vehicle_test.script.tl",
]);
const FORBIDDEN_EXTENSIONS = new Set([".dll", ".exe", ".pdb", ".zip", ".sav", ".tga", ".dds"]);

async function filesBelow(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(root, full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function validateReviewPackage(root) {
  const absoluteRoot = path.resolve(root instanceof URL ? fileURLToPath(root) : root);
  const mod = JSON.parse(await readFile(path.join(absoluteRoot, "mod.json"), "utf8"));
  const contentIndex = JSON.parse(await readFile(path.join(absoluteRoot, "_content.json"), "utf8"));
  const metadata = JSON.parse(await readFile(path.join(absoluteRoot, "_metadata", "modinfo.json"), "utf8"));
  if (mod.modId !== "tf3mp_status_1" || mod.revision !== 1) throw new Error("unexpected mod identity or revision");
  if (metadata.name !== "TalCo Transport Fever 3 MP mod") throw new Error("unexpected review display name");
  const listed = [...contentIndex.files].sort();
  const actual = (await readdir(path.join(absoluteRoot, "content"), { withFileTypes: true }))
    .filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  if (!sameStrings(listed, EXPECTED_CONTENT) || !sameStrings(actual, EXPECTED_CONTENT)) throw new Error("content index differs from reviewed source set");
  const files = await filesBelow(absoluteRoot);
  const forbidden = files.filter((file) => FORBIDDEN_EXTENSIONS.has(path.extname(file).toLowerCase()));
  if (forbidden.length) throw new Error(`forbidden bundled file: ${forbidden[0]}`);
  const gameScript = await readFile(path.join(absoluteRoot, "content", "tf3mp_status.script.tl"), "utf8");
  const loadProbeSource=await readFile(path.join(absoluteRoot,'content','tf3mp_load_probe.script.lua'),'utf8');
  if(createHash('sha256').update(loadProbeSource.replace(/\r\n/g,'\n')).digest('hex')!=='889fd32533bbe239c3b8bc6f7c99c0ac24508eb893e905baa26353a607fe08f7'
    || /loadGame\s*\(|sendCommand\s*\(|setGameSpeedup\s*\(|saveGame\s*\(/.test(loadProbeSource))
    throw new Error('startup load probe differs from reviewed read-only source');
  const startupLoadSource=await readFile(path.join(absoluteRoot,'content','tf3mp_startup_load.script.lua'),'utf8');
  if(createHash('sha256').update(startupLoadSource.replace(/\r\n/g,'\n')).digest('hex')!=='7f61373532e15d8e705c1743b634fa2d10cbcf5fb4f2e3492edd012b08398618'
    || !startupLoadSource.includes('if matches ~= 1 then')
    || startupLoadSource.indexOf('pcall(app.removeUserdata')>startupLoadSource.indexOf('pcall(app.loadGame')
    || /app\.saveGame\s*\(|api\.cmd|sendCommand|setGameSpeedup/.test(startupLoadSource))
    throw new Error('startup disposable loader differs from reviewed one-shot source');
  const stopReadbackSource=await readFile(path.join(absoluteRoot,'content','tf3mp_stop_readback.lua'),'utf8');
  if(createHash('sha256').update(stopReadbackSource.replace(/\r\n/g,'\n')).digest('hex')!=='84c70249fb58620f80e780f3c2358dac7d157c693cdacd52faa23f244a52a542')
    throw new Error('stop readback differs from reviewed read-only source');
  for(const event of ['tf3mp_stop_readback','tf3mp_get_stop_readback',
    'tf3mp_road_preaction_probe','tf3mp_get_road_preaction_probe'])
    if(!gameScript.includes(`state:subscribeToEvent("${event}")`))throw new Error('missing stop readback subscription');
  const serviceObservationSource=await readFile(path.join(absoluteRoot,'content','tf3mp_service_observation.lua'),'utf8');
  if(createHash('sha256').update(serviceObservationSource.replace(/\r\n/g,'\n')).digest('hex')!=='5c16102a5fc3f943d1bcbbe0a914b2852560f669ca2a59c8c2545f0f7a5c270f')
    throw new Error('service observation differs from reviewed read-only source');
  for(const event of ['tf3mp_phase2_service_observation','tf3mp_get_phase2_service_observation'])
    if(!gameScript.includes(`state:subscribeToEvent("${event}")`))throw new Error('missing service observation subscription');
  const factsSource = await readFile(path.join(absoluteRoot, 'content', 'tf3mp_proposal_facts.lua'), 'utf8');
  const captureSource = await readFile(path.join(absoluteRoot, 'content', 'tf3mp_road_capture.lua'), 'utf8');
  if (createHash('sha256').update(captureSource.replace(/\r\n/g, '\n')).digest('hex') !== 'f3bdcc1354883bd9dd7a545470245f286d3c2f7d9246c6540991b0296c3709c0') {
    throw new Error('road capture collector differs from reviewed passive source');
  }
  for (const [file, digest] of [
    ['tf3mp_road_replay_dispatch.lua', 'ca2f6afb3e4ea449f67e9db5d0c57817abf4698abd93985d7acc7688ca81917f'],
    ['tf3mp_road_replay_execute.lua', 'a11cad7e3ebe1be1a57ff394ba1beb833d0ebd1a9225dc64c15904f4576937cc'],
    ['tf3mp_road_replay_preflight.lua', '92d02d45d95457fcb786525a0c7d0350f98d2b4b38e90803c6e31bc4409f277a'],
    ['tf3mp_road_replay_prepare.lua', 'b6738a73e3306ca6aa734c63438c91ed5b54ade321eede31c920103eab67ab25'],
    ['tf3mp_road_replay_rebuild.lua', 'f6de6ff3edff7f05199bf34dfeb699bbb81147e26d4f9257e0f81110a24ae028'],
    ['tf3mp_road_replay_result.lua', '201bd6cc15b2cf137e63a557f8e23254bee19e449d4bf57c2b363f5f37b428fa'],
    ['tf3mp_road_stop_order_execute.lua', '61c646cacd55d19ab9a461494a12181834f38434ce29d5d27b16d94abae4c49e'],
    ['tf3mp_road_stop_order_prepare.lua', '4b4dcc049178590feb60acd2902983090e069133ce9b954f9e15653236e76ee3'],
    ['tf3mp_road_stop_outcome.lua', '99d39c50ea9e0cb2219bfaaf26d3640f2b42619f8952a864394fa3e7a0e6c552'],
    ['tf3mp_road_stop_order_wire.lua', '259dff8e07ed89a3939a4cbe6b49af102ab3cb4b572a38685afb3feab2d296b5'],
    ['tf3mp_road_stop_simple_prepare.lua', 'b9de96bbb92f212b3d8cc83d97564f2b7a814cfd6aa65ac4116ad9208add382c'],
    ['tf3mp_road_stop_simple_dispatch.lua', 'c3b689756b181097b62ecc2b0477d490075a9e4e1d477be7ddb587f1632d5a6b'],
    ['tf3mp_road_stop_simple_result.lua', 'e4f04bb767fa1afaf2b6433244cae0a28f3a469a453a846021b900e5aa8da6e4'],
  ]) {
    const source = await readFile(path.join(absoluteRoot, 'content', file), 'utf8');
    if (createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex') !== digest)
      throw new Error(`road replay ${file} differs from reviewed source`);
  }
  if (createHash('sha256').update(factsSource.replace(/\r\n/g, '\n')).digest('hex') !== '55d015ccc1c478f4ea8018b91fbb4aa040c0fd4e01bf735b6a1c1a4cdc9115ce') {
    throw new Error('proposal facts collector differs from reviewed passive source');
  }
  for (const [kind, digest] of [
    ['station', '5c541e2dd9912c3b664fce8bd09f0819c3283b5c78d5037c8e30e8af416a3f49'],
    ['service', 'bfff7a7c49289f46c504d151b5b31bccc5233f8a4c6d922cc9725173accff39e'],
  ]) {
    const source = await readFile(path.join(absoluteRoot, 'content', `tf3mp_${kind}_command.lua`), 'utf8');
    if (createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex') !== digest)
      throw new Error(`${kind} adapter differs from reviewed source`);
    for (const event of [`tf3mp_phase2_${kind}`, `tf3mp_get_phase2_${kind}`]) {
      if (!gameScript.includes(`state:subscribeToEvent("${event}")`)) throw new Error(`missing ${kind} subscription`);
    }
  }
  const vehicleAdapter=await readFile(path.join(absoluteRoot,'content','tf3mp_vehicle_command.lua'),'utf8');
  const stationBuild = gameScript.slice(gameScript.indexOf('local function phase2StationEvent'), gameScript.indexOf('local function serviceReceipt'));
  const serviceBuild = gameScript.slice(gameScript.indexOf('local function phase2ServiceEvent'), gameScript.indexOf('local function vehiclePurchaseReceipt'));
  for (const [region, markers] of [
    [stationBuild, ['if count ~= 16', 'request.confirmed ~= 1', 'vehicle.nonce ~= request.nonce',
      'current.phase2CompanyFault == true', 'speed.speedup ~= 0', 'stationCommand.execute(state, intent, binding, consent)']],
    [serviceBuild, ['if count ~= 13', 'request.confirmed ~= 1', 'depot.sessionId ~= request.nonce',
      'station1.sessionId ~= request.nonce', 'station2.sessionId ~= request.nonce',
      'current.nativeServiceLineAttempted == true', 'current.phase2CompanyFault == true', 'speed.speedup ~= 0']],
  ]) for (const marker of markers) if (!region.includes(marker)) throw new Error('missing station/service admission guard');
  if(createHash('sha256').update(vehicleAdapter.replace(/\r\n/g,'\n')).digest('hex')!=='ee131eade49a24447dce6b11674771dc99a820ab997131986261a7c733f29dfa')
    throw new Error('vehicle adapter differs from reviewed source');
  const purchaseRegion=gameScript.slice(gameScript.indexOf('local function phase2VehicleEvent'),gameScript.indexOf('local function bookTestEntry'));
  for(const marker of ['if count ~= 11','request.confirmed ~= 1','request.expiresTick ~= request.issuedTick + 300',
    'depot.sessionId ~= request.nonce','depot.depotEntity ~= request.depotEntity','current.nativeVehicleAttempted == true',
    'current.phase2CompanyFault == true','vehicleCommand.execute(state, intent, binding, consent)',
    'current.phase2VehicleReceipt = receipt; state:set(current)']) {
    if(!purchaseRegion.includes(marker))throw new Error('missing phase2 vehicle guard');
  }
  for(const event of ['tf3mp_phase2_vehicle','tf3mp_get_phase2_vehicle']) {
    if(!gameScript.includes(`state:subscribeToEvent("${event}")`))throw new Error('missing vehicle purchase subscription');
  }
  const stationProbe=await readFile(path.join(absoluteRoot,'content','tf3mp_station_probe.lua'),'utf8');
  if(createHash('sha256').update(stationProbe.replace(/\r\n/g,'\n')).digest('hex')!=='3a7981d4f2ddf8f18be2313fbc9b6e4ad347e5f79760ee78a8281d4e19da9c52')
    throw new Error('station probe differs from reviewed read-only source');
  const stationRegion=gameScript.slice(gameScript.indexOf('local function stationTemplateEvent'),gameScript.indexOf('local function financeEvent'));
  for(const marker of ['if count ~= 6','request.expiresTick ~= request.issuedTick + 300','current.stationTemplateAttempted = true',
    'state:set(current)','stationProbe.inspect()']) if(!stationRegion.includes(marker))throw new Error('missing station probe guard');
  const depotAdapter=await readFile(path.join(absoluteRoot,'content','tf3mp_depot_command.lua'),'utf8');
  // Reviewed engine mutation module. Keep validation self-contained in distributions.
  if(createHash('sha256').update(depotAdapter.replace(/\r\n/g,'\n')).digest('hex')!=='9af2637773cc091bf0ee6082f6225bb9c06c25d89085aa4825796134df5ed0ba')
    throw new Error('depot adapter differs from reviewed source');
  for(const file of ['tf3mp_depot_preview.script.lua','tf3mp_depot_tools.script.lua']) {
    const source=await readFile(path.join(absoluteRoot,'content',file),'utf8');
    if(/api\s*\.\s*cmd|setAsTable|setVisible|buildReady\s*=\s*true/.test(source))throw new Error('depot preview must remain read-only');
  }
  const depotTools=await readFile(path.join(absoluteRoot,'content','tf3mp_depot_tools.script.lua'),'utf8');
  if(!depotTools.includes('Panel = react.RegisterWrapperRecipe("TalCoDepotToolsWindow", builtin.Window, function()')
    || !depotTools.includes('content=builtin.Component{meta={class="tf3mp-company-panel"},layout=builtin.BoxLayout'))
    throw new Error('managed depot window requires builtin.Window wrapper metadata and component content');
  if(!/function\s+data\s*\(\s*\)\s*return\s*\{\s*TalCoDepotTools\s*=\s*Tools\s*\}\s*end/.test(depotTools))
    throw new Error('Lua depot tools resource must export TalCoDepotTools through data()');
  if (/log\s*\.\s*info\s*\(/.test(gameScript)) throw new Error("unsupported TF3 logger: use log.message(string)");
  for (const event of ["tf3mp_engine_probe", "tf3mp_get_engine_receipt", "tf3mp_get_status", "tf3mp_vehicle_command", "tf3mp_get_vehicle_receipt", "tf3mp_company_probe", "tf3mp_get_company_receipt", "tf3mp_finance_probe", "tf3mp_get_finance_receipt"]) {
    if (!gameScript.includes(`state:subscribeToEvent("${event}")`)) throw new Error(`missing script event subscription: ${event}`);
  }
  if (!gameScript.includes("current.eventSubscriptionsVersion ~= 22")) throw new Error("missing event subscription migration");
  for (const event of ['tf3mp_native_road_stop_replay', 'tf3mp_get_native_road_stop_replay']) {
    if (!gameScript.includes(`state:subscribeToEvent("${event}")`)) throw new Error('missing road replay subscription');
  }
  for (const event of ['tf3mp_road_stop_simple_probe', 'tf3mp_get_road_stop_simple_probe']) {
    if (!gameScript.includes(`state:subscribeToEvent("${event}")`)) throw new Error('missing simple road probe subscription');
  }
  if (!gameScript.includes('current.readbackEventVersion ~= 3')
    || !gameScript.includes('pcall(function() : table return roadStopSimple.handle(state, request) end)'))
    throw new Error('missing guarded simple road event');
  const roadReplayHeader = 'if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_native_road_stop_replay" and type(param) == "table" then';
  const roadReplayStart = gameScript.indexOf(roadReplayHeader);
  if (roadReplayStart < 0) throw new Error('missing same-script road replay admission');
  const roadReplayHandler = gameScript.slice(roadReplayStart, gameScript.indexOf('\n    if src ==', roadReplayStart + roadReplayHeader.length));
  for (const marker of [
    'id == "tf3mp_engine_bridge"', 'type(param) == "table"',
    'previous.nonce == request.nonce and previous.requestId == request.requestId',
    'pcall(function() : table return roadReplay.handle(state, request) end)',
    'local saved = state:get() or current', 'saved.roadReplayWireReceipt = receipt as table',
    'saved.phase2CompanyFault = true', 'saved.roadReplayWireReceipt = {}', 'state:set(saved)',
  ]) if (!roadReplayHandler.includes(marker)) throw new Error('missing road replay event safety guard');
  const roadReplayReceiptHeader = 'if id == "tf3mp_engine_bridge" and name == "tf3mp_get_native_road_stop_replay" then';
  const roadReplayReceiptStart = gameScript.indexOf(roadReplayReceiptHeader);
  if (roadReplayReceiptStart < 0) throw new Error('missing road replay receipt bridge scope');
  const roadReplayReceipt = gameScript.slice(roadReplayReceiptStart,
    gameScript.indexOf('\n    if id ==', roadReplayReceiptStart + roadReplayReceiptHeader.length));
  if (!roadReplayReceipt.includes('id == "tf3mp_engine_bridge"')
      || !roadReplayReceipt.includes('return current.roadReplayWireReceipt')) {
    throw new Error('missing correlated road replay receipt route');
  }
  for (const event of ["builder.proposalCreate", "builder.proposalApply", "tf3mp_placement_observer_selftest"]) {
    if (!gameScript.includes(`state:subscribeToEvent("${event}")`)) throw new Error("missing native placement observer subscription");
  }
  // Source-level regression checks only: native proposal userdata must stay
  // confined to this passive, fail-open GUI callback.  It may enqueue compact
  // JSON strings, but cannot touch the engine, logger, clock, or arbitrary GUI
  // script dispatch from event delivery.
  const placementObserver = gameScript.slice(gameScript.indexOf("local function observeNativePlacement"), gameScript.indexOf("local function vehicleSnapshot"));
  for (const marker of [
    'local function observeNativePlacement(guiState : GameScriptState<Tf3MpGuiState>, id : string, name : string, param : any) : nil',
    'if name ~= "builder.proposalCreate" and name ~= "builder.proposalApply" then return nil end',
    'if count >= 8 then return nil end',
    'current.placementSequence = (current.placementSequence or 0) + 1',
    'local slots = param as table', 'local shapeInspected = false', 'local shapeOk = pcall(function()',
    'proposalType = type(slots[1])', 'dataType = type(slots[2])', 'resultType = type(slots[3])',
    'shapeInspected = shapeOk', 'if not shapeOk then proposalType, dataType, resultType = "nil", "nil", "nil" end',
    'if shapeOk and id == "streetTerminalBuilder" then',
    'local factsOk, captured = pcall(function() : string',
    'return proposalFacts.collect(slots[1], slots[2], slots[3])',
    'type(captured) == "string" and #captured <= 1024',
    'if (isApply and current.roadCaptureApply == nil) or (not isApply and current.roadCaptureCreate == nil) then',
    'return roadCapture.collect(slots[1], roadCaptureTypes, roadCaptureModelName)',
    'type(value.json) == "string" and #value.json > 0 and #value.json <= 262144',
    'result = { code = "captured", json = value.json, modelResourceName = value.modelResourceName, sequence = current.placementSequence }',
    'local tick, update = -1, -1', 'local entry = "{\\"event\\":\\"native_placement_observed\\"',
    'local queue = current.placementLogQueue or {}', 'if #queue < 16 then queue[#queue + 1] = entry end',
    'current.placementLogQueue = queue', '\\"payloadType\\":\\"', '\\"shapeInspected\\":',
    '\\"passive\\":true,\\"gameplayVerified\\":false', 'return nil',
  ]) if (!placementObserver.includes(marker)) throw new Error("native placement observer must remain passive and bounded");
  if (/api\s*\.|log\s*\.|readClock\s*\(|param\s*\.|pairs\s*\(|ipairs\s*\(|for\s+/.test(placementObserver)
      || /rawget\s*\(/.test(placementObserver) || /slots\s*\[\s*(?:[4-9]|[1-9]\d+)/.test(placementObserver)
      || /(?:slots|param)\s*\[\s*\d+\s*\]\s*(?:\.|:|\[)/.test(placementObserver)
      || /current\s*(?:\.\s*\w+|\[[^\]]+\])\s*=\s*(?:slots|param)\b/.test(placementObserver)) {
    throw new Error("native placement observer must not access engine, log, retain or traverse userdata");
  }
  const guiUpdater = gameScript.slice(gameScript.indexOf("  guiUpdate = function"), gameScript.indexOf("  guiHandleEvent = function"));
  for (const marker of [
    'local guiCurrent = guiState:get() or {}', 'guiCurrent.status =',
    'local pendingLogs = guiCurrent.placementLogQueue or {}', 'guiCurrent.placementLogQueue = {}',
    'local failed = guiCurrent.placementObserverFailed', 'guiCurrent.placementObserverFailed = false',
    'guiState:set(guiCurrent)', 'pcall(function()',
    'for _, entry in ipairs(pendingLogs) do log.message(entry) end', 'native_placement_observer_error',
  ]) if (!guiUpdater.includes(marker)) throw new Error("native placement observer must only flush queued logs and errors");
  if (/api\s*\.\s*gui|placementObserverReady|placementSelfTest|native_placement_observer_(?:ready|selftest)/.test(guiUpdater)) {
    throw new Error("native placement observer route probe must not run from guiUpdate");
  }
  const guiHandler = gameScript.slice(gameScript.indexOf("  guiHandleEvent = function"));
  const selfTestHandler = guiHandler.slice(
    guiHandler.indexOf('if id == "tf3mp_placement_observer" and name == "tf3mp_placement_observer_selftest" then'),
    guiHandler.indexOf('if name == "builder.proposalCreate" or name == "builder.proposalApply" then'),
  );
  if (!guiHandler.includes('if name == "builder.proposalCreate" or name == "builder.proposalApply" then')
      || !guiHandler.includes('pcall(function() observeNativePlacement(guiState, id, name, _param) end)')
      || !guiHandler.includes('if not observed then') || !guiHandler.includes('current.placementObserverFailed = true')
      || !guiHandler.includes('if id == "tf3mp_placement_observer" and name == "tf3mp_placement_observer_selftest" then')
      || !selfTestHandler.includes('return { kind = "placement_observer_ack", observerRevision = 7, passive = true }')
      || /guiState\s*[:.]/.test(selfTestHandler)
      || !guiHandler.includes('return nil -- No restriction/error result, even if observation failed.')) {
    throw new Error("native placement observer must fail open");
  }
  for (const event of ["tf3mp_coordination", "tf3mp_get_coordination_receipt", "tf3mp_bind_session", "tf3mp_get_binding_receipt", "tf3mp_prepare_command", "tf3mp_get_preparation_receipt", "tf3mp_hold_checkpoint", "tf3mp_get_checkpoint_receipt", "tf3mp_release_checkpoint", "tf3mp_get_release_receipt"]) {
    if (!gameScript.includes(`state:subscribeToEvent("${event}")`)) throw new Error("missing coordinator subscription");
  }
  for (const event of ["tf3mp_capture_snapshot", "tf3mp_get_snapshot"]) {
    if (!gameScript.includes(`state:subscribeToEvent("${event}")`)) throw new Error("missing snapshot subscription");
  }
  const snapshotRegion=gameScript.slice(gameScript.indexOf("local function snapshotEvent"),gameScript.indexOf("local function companyEvent"));
  if (!snapshotRegion.includes('receipt.outcome = "captured"') || /api\s*\.\s*cmd/.test(snapshotRegion)
      || !snapshotRegion.includes('held.outcome ~= "checked"') || !snapshotRegion.includes('vehicle.company ~= request.companyEntity')) throw new Error("snapshot must be held, ownership-checked and read-only");
  for (const marker of ["tickCount", "updateCount", "bridge\\\":\\\"disabled"]) {
    if (!gameScript.includes(marker)) throw new Error(`missing safe-mode marker: ${marker}`);
  }
  if (gameScript.includes("Notifications") || gameScript.includes("makeScriptingSendEventCmd")) {
    throw new Error("game script must not emit UI notifications");
  }
  const panelResource = await readFile(path.join(absoluteRoot, "content", "tf3mp_status_panel.res.lua"), "utf8");
  const nativeResource = await readFile(path.join(absoluteRoot, "content", "tf3mp_native_controls.res.lua"), "utf8");
  const nativeScript = await readFile(path.join(absoluteRoot, "content", "tf3mp_native_controls.script.tl"), "utf8");
  if (!nativeResource.includes('type = "react-replacement-config"')
      || !nativeResource.includes('filePath = "tf3mp_status_1::/tf3mp_native_controls.script"')
      || !nativeResource.includes('doReplaceFn = "install"')) throw new Error("invalid native-control replacement resource");
  // Structural regression checks only; these do not execute Teal or certify GUI coverage.
  for (const marker of [
    'if blocked then return owner == nonce end',
    'if not blocked or owner ~= nonce then return false end',
    'if not blocked then onClick() end',
    'if not blocked then onValueChange(value) end',
    'local permitOk, permitted = pcall(stopPermitCurrent)',
    'if blocked and permitted and isStop then',
    'stopUsed = true',
    'stopEverUsed = true',
    'replacementApi.ReplaceRecipe(vehicle_window, GuardedVehicle)',
    'if originalManagers ~= 0 then readyChecks = 0; return false end',
    'return readyChecks == 2',
    'originalManagers = originalManagers + 1',
    'originalManagers = originalManagers - 1',
    'replacementApi.ReplaceRecipe(entity_window_util.ActionButtonBar, GuardedActionBar)',
    'replacementApi.ReplaceRecipe(manager_window.ManagerWindowContent, GuardedManager)',
  ]) if (!nativeScript.includes(marker)) throw new Error("missing native-control guard");
  if (/api\s*\.\s*cmd|app\s*\.|GloballyReplaceRecipeBeforeInitInternal|CallOriginalRecipe\s*\(\s*builtin\.|byId\s*\.\s*setEnabled/.test(nativeScript)) {
    throw new Error("native-control replacement must not dispatch commands or change shared rules");
  }
  const eventHandler = gameScript.slice(gameScript.indexOf("  handleEvent = function"), gameScript.indexOf("  guiUpdate = function"));
  if (!eventHandler.includes("vehicleEvent(state, current, request)") || /pendingVehicle|inspectedVehicleKey|vehicleRuntimeStarted/.test(gameScript)) {
    throw new Error("vehicle execution must use a fresh event without cross-callback Lua locals");
  }
  const updater = gameScript.slice(gameScript.indexOf("  update = function"), gameScript.indexOf("  handleEvent = function"));
  if (/vehicleEvent\(|updateVehicle\(|makeVehicle/.test(updater) || !updater.includes("current.vehicleInbox = {}")) {
    throw new Error("update must discard saved vehicle work, not execute it");
  }
  const panelScript = await readFile(path.join(absoluteRoot, "content", "tf3mp_status_panel.script.tl"), "utf8");
  if (!gameScript.includes('state:subscribeToEvent("tf3mp_prepare_road_stop")')
    || !gameScript.includes('roadStopOrderPrepare.handle(state, param as table, api)')
    || !panelScript.includes('roadStopOrderWire.decode(request) == nil')
    || !panelScript.includes('eventName = "tf3mp_prepare_road_stop"'))
    throw new Error('ordered road Stop preparation route is missing');
  for(const marker of ['state:subscribeToEvent("tf3mp_arm_road_stop_hold")',
    'state:subscribeToEvent("tf3mp_execute_road_stop")',
    'roadStopOrderExecute.arm(state, param as table, api)',
    'roadStopOrderExecute.execute(state, param as table, api)'])
    if(!gameScript.includes(marker))throw new Error('ordered road Stop execution route is missing');
  for(const marker of ['eventName = "tf3mp_arm_road_stop_hold"',
    'eventName = "tf3mp_execute_road_stop"'])
    if(!panelScript.includes(marker))throw new Error('ordered road Stop GUI execution route is missing');
  const simpleProbe = panelScript.slice(panelScript.indexOf('local function exchangeRoadStopSimpleProbe() : nil'),
    panelScript.indexOf('local function exchangeHalt() : nil'));
  for (const marker of ['config.mode ~= "company_test"', 'roadSimpleSent = requestId',
    '"tf3mp_road_stop_simple_probe", payload', 'native_road_stop_simple_receipt',
    'roadSimpleReported = roadSimpleSent'])
    if (!simpleProbe.includes(marker)) throw new Error('simple road probe must consume before delivery and copy its receipt');
  // The route probe must use the panel's regular GUI step callback, the same
  // context as receipt reads. It is deliberately not a game-script guiUpdate
  // dispatch, and its acknowledgement is a local scalar diagnostic only. A
  // bounded retry lets startup subscriptions settle without becoming a timer.
  const panelRoute = panelScript.slice(panelScript.indexOf('local placementRouteChecked = false'), panelScript.indexOf('local lastProbe'));
  for (const marker of [
    'local placementRouteChecked = false', 'local function checkPlacementRoute() : nil',
    'local placementRouteSteps : integer = 0', 'local placementRouteAttempts : integer = 0',
    'if placementRouteChecked then return nil end', 'placementRouteSteps = placementRouteSteps + 1',
    'if placementRouteSteps % 60 ~= 0 then return nil end', 'placementRouteAttempts = placementRouteAttempts + 1',
    'if placementRouteAttempts == 1 then', 'native_placement_observer_ready', 'observerRevision\\\":7',
    'api.gui.fireGuiScriptEvent("tf3mp_placement_observer", "tf3mp_placement_observer_selftest", {})',
    'local delivered = false', 'if ok and type(value) == "table" then',
    'ack.kind == "placement_observer_ack" and ack.observerRevision == 7 and ack.passive == true',
    'api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_status", {})',
    'local controlDelivered = false', 'type(controlValue) == "table"', 'local control = controlValue as table', 'type(control.status) == "string"',
    'placementRouteChecked = delivered or placementRouteAttempts >= 12',
    'native_placement_observer_selftest', '\\"attempt\\":', '\\"final\\":', '\\"returnType\\":', '\\"controlDelivered\\":',
    '\\"delivered\\":', '\\"callSucceeded\\":', '\\"synthetic\\":true',
  ]) if (!panelRoute.includes(marker)) throw new Error("native placement observer panel route must log and verify its explicit acknowledgement");
  const panelDispatches = panelRoute.match(/api\.gui\.fireGuiScriptEvent\s*\([^)]*\)/g) || [];
  const allowedPanelDispatches = [
    'api.gui.fireGuiScriptEvent("tf3mp_placement_observer", "tf3mp_placement_observer_selftest", {})',
    'api.gui.fireGuiScriptEvent("tf3mp_engine_bridge", "tf3mp_get_status", {})',
  ];
  if (panelDispatches.length !== 2 || !sameStrings(panelDispatches, allowedPanelDispatches)
      || /api\s*\.\s*cmd|app\s*\.|guiState|state\s*[:.]/.test(panelRoute)) {
    throw new Error("native placement observer panel route must remain two fixed read-only GUI dispatches");
  }
  const panelStep = panelScript.slice(panelScript.indexOf('  react.onStep(function()'), panelScript.indexOf('  react.onUnmount(function()'));
  if (!panelStep.includes('checkPlacementRoute()')
      || panelStep.indexOf('checkPlacementRoute()') > panelStep.indexOf('if bridgeFailed then')) {
    throw new Error("native placement observer route probe must run once from the regular panel step callback");
  }
  if (!panelStep.includes('flushRoadCapture()') || panelStep.indexOf('flushRoadCapture()') > panelStep.indexOf('if bridgeFailed then')) {
    throw new Error('road capture publication must run independently of helper availability');
  }
  const captureExchange = panelScript.slice(panelScript.indexOf('local captureSteps'), panelScript.indexOf('-- Temporary GUI diagnostic only:'));
  for (const marker of ['local ok = pcall(exchangeRoadCapture)', 'captureDisabled = true',
    'if captureSteps % 60 ~= 0 then return nil end', 'captureReported[stage] = true',
    'local value : any = current.roadCaptureCreate', 'if stage == "apply" then value = current.roadCaptureApply end',
    '#captured.json <= 262144', 'captured.sequence <= 16', '#hex > 524288',
    'app.saveUserdata("tf3mp_status_1", "road_capture_" .. stage, {',
    '#captured.modelResourceName <= 1024', '#modelNameHex > 2048',
    'schemaVersion = 2, observerRevision = 7, kind = "native_road_stop_capture"']) {
    if (!captureExchange.includes(marker)) throw new Error('road capture publication must remain bounded and protected');
  }
  const bindingStart = gameScript.indexOf('name == "tf3mp_bind_session"');
  const binding = gameScript.slice(bindingStart, gameScript.indexOf('name == "tf3mp_hold_checkpoint"', bindingStart));
  const checkpoint = gameScript.slice(gameScript.indexOf('name == "tf3mp_hold_checkpoint"'),gameScript.indexOf('name == "tf3mp_prepare_command"'));
  for(const marker of ['count ~= (request.checkpointHash == nil and 6 or 7)','binding.nonce ~= request.nonce','lease.phase ~= "active"',
    '(current.checkpointReceipt or {}).operationId ~= nil','current.checkpointReceipt = receipt','state:set(current)',
    'clock.updateCount ~= request.updateCount','kind = "pause_probe"','api.engine.util.finance.getPlayersBalance(entity)',
    'afterClock.updateCount ~= request.updateCount or afterSpeed.speedup ~= 0']) {
    if(!checkpoint.includes(marker)||checkpoint.indexOf(marker)>checkpoint.indexOf('receipt.held = true; receipt.status = "ok"')) throw new Error('missing checkpoint evidence boundary');
  }
  if(/receipt\.checkpointHash\s*=/.test(checkpoint)) throw new Error('checkpoint must not echo expected hash');
  for (const marker of ['request.playerCount < 2 or request.playerCount > 4', 'count ~= 7 + 2 * request.playerCount',
    'players[player] ~= nil or companies[company] ~= nil', 'api.engine.entityExists(company as integer)',
    'api.type.ComponentType.PLAYER) == nil', 'existing.nonce ~= nil', 'players[request.localPlayerId] ~= company',
    'lease.nonce ~= request.nonce', 'clock.tickCount >= lease.expiresTick']) {
    if (!binding.includes(marker) || binding.indexOf(marker) > binding.indexOf('current.coordinationBinding =')) throw new Error('missing engine binding guard');
  }
  const coordination = gameScript.slice(gameScript.indexOf('-- First real coordinator operation:'), gameScript.indexOf('if src == "tf3mp_status_1::/tf3mp_status.gs" and id == "tf3mp_engine_bridge" and name == "tf3mp_watchdog"'));
  const prepare = gameScript.slice(gameScript.indexOf('name == "tf3mp_prepare_command"'), gameScript.indexOf('-- Committed coordinator execution:'));
  for (const marker of ['count ~= 15', 'request.operation ~= "prepare"', 'request.commandType ~= "vehicle.setRunning"',
    'binding.nonce ~= request.nonce', 'binding.roundId ~= request.roundId', 'clock.tickCount >= lease.expiresTick',
    '(current.preparationReceipt or {}).operationId ~= nil', 'binding.players[request.originPlayerId] ~= request.companyEntity',
    'request.hostSequence ~= (binding.nextSequence or 1)', 'request.scheduledUpdate <= clock.updateCount',
    'api.type.ComponentType.PLAYER_OWNED', 'api.type.ComponentType.TRANSPORT_VEHICLE', 'owner.player ~= request.companyEntity']) {
    if (!prepare.includes(marker) || prepare.indexOf(marker) > prepare.indexOf('receipt.status = "ok"')) throw new Error('missing engine preparation guard');
  }
  if (/api\.cmd|haltEvent\(|pauseEvent\(|vehicleEvent\(/.test(prepare)) throw new Error('preparation must remain read-only');
  for (const marker of ['count ~= 5', 'request.operation ~= "halt"', 'old.operationId ~= nil',
    'current.haltTestAttempted == true', 'lease.nonce ~= request.nonce', 'lease.phase ~= "active"',
    'lease.companyEntity ~= company', 'clock.tickCount >= lease.expiresTick',
    'current.coordinationReceipt = receipt', 'state:set(current)']) {
    if (!coordination.includes(marker) || coordination.indexOf(marker) > coordination.indexOf('haltEvent(state, current,')) throw new Error('missing coordinator halt boundary');
  }
  if (!coordination.includes('result.outcome == "halted" and result.updateCount == clock.updateCount')) throw new Error('missing coordinator halt postcondition');
  for (const marker of ["react-plugin ::GameBarInfoDisplayExtension", "tf3mp_status_panel.script@Tf3MpStatusPanel"]) {
    if (!panelResource.includes(marker)) throw new Error(`missing status-panel resource marker: ${marker}`);
  }
  // Structural regression guard, not a Teal parser or sandbox proof.
  const exchangeRegion = /-- USERDATA EXCHANGE BEGIN[^\n]*\n[\s\S]*?-- USERDATA EXCHANGE END/;
  const outsideExchange = panelScript.replace(exchangeRegion, "");
  if (!exchangeRegion.test(panelScript) || /app\s*\.\s*(getAllUserdata|loadUserdata|saveUserdata|removeUserdata)\s*\(/.test(outsideExchange)) {
    throw new Error("restricted userdata APIs must remain in the isolated exchange function");
  }
  const engineReader = panelScript.match(/local makeState = function\(\)[\s\S]*?local status =/u)?.[0];
  if (!engineReader || /exchangeTelemetry|exchangeEngineProbe|userdataExists|app\s*\.|api\s*\.\s*cmd/u.test(engineReader)) {
    throw new Error("restricted engine reader must remain free of bridge I/O");
  }
  for (const marker of ["tf3mp_engine_probe", "tf3mp_get_engine_receipt", "subscribeToEvent"]) {
    if (!gameScript.includes(marker)) throw new Error(`missing engine probe handler: ${marker}`);
  }
  const allowedMutation = "api.cmd.sendCommand(api.cmd.makeVehicleSetStoppedByUserCmd(request.entity as integer, request.stopFlag == 1))";
  const heldVehicleGuard = 'if not vehicleHoldValid(current, request) then rejectVehicle(current, request, "hold_lost"); return nil end';
  if (!gameScript.includes(heldVehicleGuard) || gameScript.indexOf(heldVehicleGuard) > gameScript.indexOf(allowedMutation)
    || !gameScript.includes('after.stopFlag == request.stopFlag and vehicleHoldValid(current, request)')
    || !gameScript.includes('old.schemaVersion ~= request.schemaVersion')
    || !gameScript.includes('held.outcome == "checked" and held.nonce == request.nonce')
    || !gameScript.includes('and readClock().updateCount == request.scheduledUpdate and speed.speedup == 0')) throw new Error("missing held-vehicle guard");
  const companyMutation = 'api.cmd.sendCommand(api.cmd.makeGameAddPlayerCmd("TF3MP Test Company", api.type.Vec3f.new(0.2, 0.6, 0.8)), function(data : GameAddPlayerCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})';
  const financeMutation = 'api.cmd.sendCommand(api.cmd.makeJournalBookAssetCmd(companyEntity, entry), function(_data : JournalBookAssetCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})';
  const pauseMutation = 'api.cmd.sendCommand(api.cmd.makeGameSetSpeedCmd(targetSpeed), function(_data : GameSetSpeedCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})';
  const haltMutation = 'api.cmd.sendCommand(api.cmd.makeGameSetSpeedCmd(0), function(_data : GameSetSpeedCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})';
  const watchdogMutation = 'api.cmd.sendCommand(api.cmd.makeGameSetSpeedCmd(0), function(_watchdogData : GameSetSpeedCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})';
  const releaseMutation = 'api.cmd.sendCommand(api.cmd.makeGameSetSpeedCmd(targetSpeed), function(_coordinationReleaseData : GameSetSpeedCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})';
  const barrierPause = 'api.cmd.sendCommand(api.cmd.makeGameSetSpeedCmd(0), function(_barrierData : GameSetSpeedCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})';
  const barrier = gameScript.slice(gameScript.indexOf('local function executionBarrierUpdate'),gameScript.indexOf('local function watchdogEvent'));
  for(const marker of ['barrier.phase ~= "armed"','lease.phase ~= "active"','clock.tickCount >= lease.expiresTick',
    'binding.phase ~= "prepared"','binding.roundId ~= barrier.roundId','binding.nonce ~= barrier.nonce',
    'barrier.phase = "unknown"','state:set(current)','clock.updateCount == barrier.scheduledUpdate']) {
    if(!barrier.includes(marker)||barrier.indexOf(marker)>barrier.indexOf(barrierPause))throw new Error('missing engine-owned barrier guard');
  }
  if(!barrier.includes('afterClock.updateCount == barrier.scheduledUpdate and speed.speedup == 0')
    ||/makeVehicle/.test(barrier)||!gameScript.includes('pcall(function() executionBarrierUpdate(state, current) end)'))throw new Error('invalid engine-owned barrier effect');
  const executionVehicle = 'api.cmd.sendCommand(api.cmd.makeVehicleSetStoppedByUserCmd(expectedEntity, expectedStopped),';
  const execution = gameScript.slice(gameScript.indexOf('-- Committed coordinator execution:'),gameScript.indexOf('-- First real coordinator operation:'));
  for(const marker of ['count ~= 15','request.operation ~= "executeHeld"','binding.phase ~= "prepared"',
    'lease.phase ~= "active"','clock.tickCount >= lease.expiresTick','(current.executionReceipt or {}).operationId ~= nil',
    'request[key] ~= prepared[key]','binding.players[request.originPlayerId] ~= request.companyEntity',
    'current.executionReceipt = receipt','binding.phase = "execution_unknown"','state:set(current)',
    'clock.updateCount ~= request.scheduledUpdate','barrier.phase ~= "held"','barrier.operationId ~= request.operationId',
    'barrier.hostSequence ~= request.hostSequence','barrier.phase = "consumed"']) {
    if(!execution.includes(marker)||execution.indexOf(marker)>execution.indexOf(executionVehicle)) throw new Error('missing coordinator execution guard');
  }
  for(const marker of ['heldClock.updateCount ~= request.scheduledUpdate or heldSpeed.speedup ~= 0',
    'owner == nil or vehicle == nil or owner.player ~= request.companyEntity']) {
    if(!execution.includes(marker)||execution.indexOf(marker)>execution.indexOf(executionVehicle)) throw new Error('missing coordinator execution ownership/hold');
  }
  for(const marker of ['function(vehicleData : VehicleSetStoppedByUserCommandData, success : boolean',
    'savedReceipt.operationId ~= expectedOperation or savedReceipt.status ~= "unknown"',
    'savedBinding.phase ~= "execution_unknown" or savedBarrier.phase ~= "consumed"',
    'savedBarrier.operationId ~= expectedOperation or success ~= true',
    'vehicleData.vehicleEntity ~= expectedEntity or vehicleData.userStopped ~= expectedStopped',
    'afterVehicle.userStopped ~= expectedStopped','afterClock.updateCount ~= expectedUpdate or afterSpeed.speedup ~= 0',
    'savedReceipt.status = "ok"','savedBinding.phase = "action_held"','state:set(saved)']) {
    if(!execution.includes(marker)||execution.indexOf(marker)<execution.indexOf(executionVehicle)) throw new Error('missing coordinator execution callback/postcondition');
  }
  const release = gameScript.slice(gameScript.indexOf('name == "tf3mp_release_checkpoint"'),gameScript.indexOf('name == "tf3mp_prepare_command"'));
  for(const marker of ['count ~= expectedCount','request.speedup ~= 1 and request.speedup ~= 2 and request.speedup ~= 4','request.operation ~= "release"','binding.phase ~= "checkpoint_held"',
    'lease.phase ~= "active"','clock.tickCount >= lease.expiresTick',
    'previousRelease.status ~= "ok" or request.updateCount <= previousRelease.updateCount or request.operationId == previousRelease.operationId',
    'held.hostSequence ~= (binding.nextSequence or 1)',
    'held.status ~= "ok"','held.updateCount ~= request.updateCount','clock.updateCount ~= request.updateCount or speed.speedup ~= 0',
    'current.releaseReceipt = receipt','binding.phase = "release_unknown"','state:set(current)']) {
    if(!release.includes(marker)||release.indexOf(marker)>release.indexOf(releaseMutation)) throw new Error('missing coordinator release guard');
  }
  if(!release.includes('ok and succeeded and afterClock.updateCount == request.updateCount and afterSpeed.speedup == targetSpeed')
    ||!release.includes('receipt.speedup = afterSpeed.speedup')) throw new Error('missing coordinator release postcondition');
  if(!release.includes('if actionRelease then held = current.executionReceipt or {} end')
    ||!release.includes('binding.phase ~= "checkpoint_held" and not actionRelease')
    ||release.indexOf('binding.nextSequence = held.hostSequence + 1')<release.indexOf('if ok and succeeded')
    ||!release.includes('current.preparedCommand = {}; current.preparationReceipt = {}; current.executionReceipt = {}')) throw new Error('missing repeated release sequence fence');
  const watchdogRegion = gameScript.slice(gameScript.indexOf('local function watchdogUpdate'), gameScript.indexOf('local function executionBarrierUpdate'));
  for (const marker of ['if lease.phase ~= "active" then return nil end', 'clock.tickCount >= lease.expiresTick',
    'lease.phase = "stopping"', 'lease.outcome = "outcome_unknown"', 'state:set(current)']) {
    if (!watchdogRegion.includes(marker) || watchdogRegion.indexOf(marker) > watchdogRegion.indexOf(watchdogMutation)) throw new Error('missing watchdog stop guard');
  }
  const watchdogEventRegion = gameScript.slice(gameScript.indexOf('local function watchdogEvent'), gameScript.indexOf('local function haltEvent'));
  for (const marker of ['if count ~= 8', 'request.expiresTick ~= request.issuedTick + 100',
    'watchdogUpdate(state, current)', 'if lease.phase ~= nil then return nil end',
    'request.requestId <= lease.requestId or request.issuedTick <= lease.issuedTick']) {
    if (!watchdogEventRegion.includes(marker)) throw new Error('missing watchdog renewal guard');
  }
  if (!watchdogRegion.includes('afterClock.updateCount == lease.updateCount')
      || !updater.includes('if lease.phase == "active" then return { watchdog = true } end')
      || !updater.includes('if type(updateResult) ~= "table" or (updateResult as table).watchdog ~= true then return end')
      || !watchdogRegion.includes('succeeded and speed.speedup == 0')
      || updater.slice(0, updater.indexOf('  postUpdate = function')).includes('watchdogUpdate(state, current)')
      || !updater.slice(updater.indexOf('  postUpdate = function')).includes('pcall(function() watchdogUpdate(state, current) end)')
      || !updater.includes('lease.outcome = "handler_failed"')
      || !gameScript.includes('state:subscribeToEvent("tf3mp_watchdog")')
      || !gameScript.includes('state:subscribeToEvent("tf3mp_get_watchdog_receipt")')) throw new Error('missing watchdog execution boundary');
  const haltRegion = gameScript.slice(gameScript.indexOf("local function haltEvent"),gameScript.indexOf("local function pauseEvent"));
  for(const marker of ['if current.haltTestAttempted == true then','current.haltTestAttempted = true','state:set(current)',
    'clock.tickCount >= request.expiresTick','api.engine.util.getPlayer() ~= request.companyEntity']) {
    if(!haltRegion.includes(marker)||haltRegion.indexOf(marker)>haltRegion.indexOf(haltMutation)) throw new Error("missing halt guard");
  }
  if(!haltRegion.includes('afterClock.updateCount == beforeUpdate and afterSpeed.speedup == 0')
    || /haltEvent\(|makeGameSetSpeedCmd/.test(updater)
    || !gameScript.includes('state:subscribeToEvent("tf3mp_halt")')
    || !gameScript.includes('state:subscribeToEvent("tf3mp_get_halt_receipt")')) throw new Error("halt must be fresh-event only with observed postconditions");
  const pauseRegion = gameScript.slice(gameScript.indexOf("local function pauseEvent"), gameScript.indexOf("local function companyEvent"));
  for (const marker of ['if clock.updateCount < request.scheduledUpdate then receipt.outcome = "early"; return nil end',
    'if clock.updateCount > request.scheduledUpdate then receipt.outcome = "late"; return nil end', 'current.scheduledPauseTestAttempted = true']) {
    if (!pauseRegion.includes(marker) || pauseRegion.indexOf(marker) > pauseRegion.indexOf(pauseMutation)) throw new Error("missing exact-pause timing guard");
  }
  for (const marker of ['pcall(dispatchPauseAtUpdate)', 'pendingPauseDelivery = {} -- Consume before dispatch',
    'local live = app.loadUserdata("tf3mp_status_1", "pause_request")']) {
    if (!panelScript.includes(marker)) throw new Error("missing exact-pause delivery guard");
  }
  for (const marker of ['current.pauseTestAttempted = true', 'local targetSpeed : integer = request.phase == "pause" and 0 or 1', 'old.heldUpdate ~= request.heldUpdate', 'clock.updateCount ~= request.heldUpdate', 'old.outcome ~= expected', 'state:set(current)', 'afterClock.updateCount == receipt.heldUpdate']) {
    if (!pauseRegion.includes(marker)) throw new Error("missing pause-test guard");
  }
  if (pauseRegion.indexOf("state:set(current)") > pauseRegion.indexOf(pauseMutation) || /pauseEvent\(|makeGameSetSpeedCmd/.test(updater)
    || !gameScript.includes('state:subscribeToEvent("tf3mp_pause_probe")') || !gameScript.includes('state:subscribeToEvent("tf3mp_get_pause_receipt")')) throw new Error("pause test must be fresh-event only");
  const fundingMutation = 'api.cmd.sendCommand(api.cmd.makeJournalBookAssetCmd(target, entry), function(_data : JournalBookAssetCommandData, success : boolean, _entities : {{Engine.Entity, Engine.Revision}})';
  const fundingRegion = gameScript.slice(gameScript.indexOf('local function phase2FundingEvent'),gameScript.indexOf('local ret : GameScriptWithGui'));
  for(const marker of ['request.confirmed ~= 1','request.amount > 1000000','current.phase2FundingAttempted == true',
    'current.phase2CompanyFault == true','current.phase2CompanyFault = true',
    'current.phase2CompanyFault = receipt.outcome ~= "funded"',
    'created.newCompanyEntity ~= request.targetCompany','speed.speedup ~= 0',
    'current.phase2FundingAttempted = true','state:set(current)',
    'originalAfter == originalBefore','targetAfter == targetBefore + request.amount','callbackOpen = false']) {
    if(!fundingRegion.includes(marker))throw new Error('missing phase2 funding guard');
  }
  if(fundingRegion.indexOf('state:set(current)')>fundingRegion.indexOf(fundingMutation)
    || /phase2FundingEvent\(/.test(updater))throw new Error('funding must persist before event-only mutation');
  const depotRegion = gameScript.slice(gameScript.indexOf('local function phase2DepotEvent'),gameScript.indexOf('local function stationReceipt'));
  for (const marker of ['if count ~= 15', 'request.confirmed ~= 1', 'request.expiresTick ~= request.issuedTick + 300',
    'clock.tickCount > request.expiresTick', 'created.newCompanyEntity ~= request.targetCompany',
    'api.engine.util.getPlayer() ~= request.companyEntity', 'speed.speedup ~= 0',
    'current.phase2CompanyFault == true', 'current.nativeDepotAttempted == true',
    'state:set(current)', 'depotCommand.execute(state, intent, binding, consent)']) {
    if (!depotRegion.includes(marker)) throw new Error('missing phase2 depot guard');
  }
  if (/phase2DepotEvent\(/.test(updater)) throw new Error('depot construction must be event-only');
  const mutations = [releaseMutation,barrierPause,watchdogMutation,haltMutation,pauseMutation,allowedMutation,companyMutation,financeMutation,executionVehicle,fundingMutation];
  if (mutations.some(m=>gameScript.split(m).length!==2) || /api\s*\.\s*cmd/.test(mutations.reduce((source,m)=>source.replace(m,''),gameScript)) || /makeGameSetSpeedCmd|makeVehicle|makeGameAddPlayerCmd|makeJournal/.test(panelScript)) {
    throw new Error("only reviewed engine vehicle/company/finance test mutations are allowed");
  }
  for (const marker of ['if current.companyTestAttempted == true then', 'current.companyTestAttempted = true\n  state:set(current)', 'clock.tickCount > request.expiresTick', 'api.engine.util.getPlayer() ~= request.companyEntity']) {
    if (!gameScript.includes(marker) || gameScript.indexOf(marker) > gameScript.indexOf(companyMutation)) throw new Error("missing company-test guard");
  }
  if (/companyEvent\(|makeGameAddPlayerCmd/.test(updater)) throw new Error("update must not execute saved company work");
  const financeRegion = gameScript.slice(gameScript.indexOf("local function financeEvent"), gameScript.indexOf("local ret :"));
  for (const marker of ['current.financeTestAttempted = true', 'receipt.outcome = "credit_unknown"\n  state:set(current)',
    'if originalCredit ~= originalBefore or targetCredit ~= targetBefore + 1000 then return nil end',
    'receipt.outcome = "debit_unknown"\n  state:set(current)', 'if originalAfter ~= originalBefore or targetAfter ~= targetBefore then return nil end']) {
    if (!financeRegion.includes(marker)) throw new Error("missing finance-test guard");
  }
  if (!gameScript.includes('if amount ~= 1000 and amount ~= -1000 then return false end') || /financeEvent\(|bookTestEntry\(/.test(updater)) throw new Error("finance test must be bounded and never execute saved work");
  for (const marker of ['if request.scheduledUpdate > 0 then', 'if clock.updateCount < request.scheduledUpdate then rejectVehicle(current, request, "early"); return nil end', 'if clock.updateCount > request.scheduledUpdate then rejectVehicle(current, request, "late"); return nil end', 'rejectVehicle(current, request, "command_failed")\n  state:set(current)', "before.company ~= request.company or before.revision ~= request.revision", "after.stopFlag == request.stopFlag"]) {
    if (!gameScript.includes(marker)) throw new Error(`missing vehicle-test guard: ${marker}`);
  }
  if (gameScript.indexOf('if request.scheduledUpdate > 0 then') > gameScript.indexOf(allowedMutation)) throw new Error("timing guard must precede mutation");
  for (const marker of ["pcall(dispatchVehicleAtUpdate)", "clock.updateCount < request.scheduledUpdate - 1", 'local live = app.loadUserdata("tf3mp_status_1", "vehicle_command")', "if live[key] ~= value then return nil end"]) {
    if (!panelScript.includes(marker)) throw new Error(`missing scheduled-delivery guard: ${marker}`);
  }
  const vehicleScript = await readFile(path.join(absoluteRoot, "content", "tf3mp_vehicle_test.script.tl"), "utf8");
  if (/api\s*\.\s*cmd|useStepStateTimer|onStepTimer/.test(vehicleScript)) throw new Error("vehicle UI must only publish click intents");
  for (const marker of ['config.mode ~= "vehicle_test"', "vehicle_eow.isPlayerOwned(params)", "pcall(function()", "vehicle_intent"]) {
    if (!vehicleScript.includes(marker)) throw new Error(`missing vehicle UI guard: ${marker}`);
  }
  for (const marker of ["react.onStep(function()", "pcall(function() : string", "if bridgeFailed then pcall(restoreSpeedControls); return end", "bridgeFailed = true"]) {
    if (!panelScript.includes(marker)) throw new Error(`missing protected bridge marker: ${marker}`);
  }
  if (/GameSpeedPause\s*=(?!=)/.test(panelScript)) throw new Error("control diagnostic must not set forced-pause feature");
  for (const marker of ["react.onUnmount(function() pcall(restoreSpeedControls) end)", "flags ~= controlFlags", "controlOriginal = flags.GameSpeedControl", "controlFlags.GameSpeedControl = controlOriginal", "pcall(exchangeSpeedControls)"]) {
    if (!panelScript.includes(marker)) throw new Error("missing speed-control cleanup guard");
  }
  for (const marker of ["RegisterPluginRecipe", "GameBarInfoDisplayExtension", "tickCount", "updateCount", "bridge unavailable"]) {
    if (!panelScript.includes(marker)) throw new Error(`missing status-panel script marker: ${marker}`);
  }
  return {
    modId: mod.modId,
    revision: mod.revision,
    contentFiles: actual.length,
    manifestSha256: await hashManifest(absoluteRoot),
    executableFiles: 0,
    readyForControlledLoadReview: true,
  };
}
