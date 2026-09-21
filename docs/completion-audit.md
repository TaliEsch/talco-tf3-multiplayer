# Completion audit against the build prompt

## Full-readiness continuation audit — 21 September 2026

The goal is still active and incomplete. Commit `db22017` is not a completion
claim. It adds real exact-build simulation observation, authenticated native
hold/release/halt IPC, fail-stop teardown, automatic disposable-save startup,
game-produced checkpoint domains, and a single-game host-sequenced reversible
vehicle stop/start proof. The live vehicle proof applied host sequences 1 and 2
to company 3141/entity 66005 and restored the original running state.

The later command-profile run failed: TF3 crashed with Windows exception
`0x80000004` at proposed admission RVA `0x9D3120` before discovery or mutation.
No uncertain action was retried. That profile is now disabled before process
access; owned 16-thread/missing-DR6/cutoff fixtures pass, but live safety remains
unqualified. Normal Host/Join also remains deliberately closed because the native
runtime reports `productionQualified:false` and no production game adapter is
constructed.

Current verification is 808/808 passing, not 478/478 and not the earlier 756-test
baseline. Both native builds pass MSVC `/W4 /WX`; mod review passes with 29 files,
zero executables and manifest
`80ed637bb9c609d7e990616ebd1797b3571d1d536a39f447779af4b905fe1dc7`.

Unfinished implementation: safe capture/suppression/replay, per-instance identity,
complete background-state agreement, checkpoint save/reload recovery, production
Host/Join adapter wiring, separate-company accounting and the full road loop.
Unperformed acceptance: two TF3 instances, cross-machine, LAN/Internet and four
players. Therefore the honest verdict is **not multiplayer-ready**. See the
superseding section of `native-review-handoff.md` for evidence and the single
consolidated acceptance procedure.

## Review-ready native qualification batch — 21 September 2026

The supplied TF2 reference clone was verified clean at exact requested/default
revision `9f99097cb05333db18015da8296b7356c76a1612`. Its licence is MIT,
copyright 2026 silver2127; no implementation code was copied. The concrete
source/symbol map and transplant exclusions are in `tf2-reference-audit.md`.

Native qualification advanced without installing a hook. The exact TF3 static
profile now binds file SHA-256, PE timestamp, image size, 12 candidate references,
file-backed runtime-range digests, primary/chained unwind metadata and an evidence
digest. An exact match remains explicitly non-activating. Bounded unwind parsing
shows the three `GameSim::Step` assertion references chain to primary runtime
entry `[0x1593B0,0x1593CF)`; it does not prove a semantic function boundary or
canonical clock. Independent disassembly showed the common labelled marker at
RVA `0x55B70` is only `ret` followed by `int3`, not an instrumentation API.

The standalone native probe still has inert `DllMain` and zero gameplay/hook
capabilities. It now rejects structural mismatch between the calling process's
mapped PE64 main-module header/extent and loader metadata; the smoke test exercises
that negative path by temporarily changing and restoring only its owned host
header. This is not full live code-page integrity. The disassembly helper now
holds its hash-verified, no-write/no-delete-sharing file handle through `dumpbin`
and validates bounded executable ranges and VA overflow.

Held-snapshot schema v2 now defines deterministic, exact-field coverage for
towns/growth, economy, topology, vehicles, companies/ownership, lines/services
and RNG/hidden state. Unavailable/unsupported/read-failed domains remain explicit
and non-comparison-ready. Schema v1 remains backward compatible but is explicitly
selected-state-only. The current game producer is still v1, so whole-world
divergence detection is not yet operational.

Integrated verification: the first sandboxed `npm run check` encountered one
`spawn EPERM` at the owned helper lifecycle subprocess; the permitted rerun passed
the same test. A fresh count-only reporter on the current suite recorded 756
passed, 0 failed and 0 skipped/cancelled in 37.7 seconds; the earlier 478 figure
was an incomplete visible TAP sequence and is corrected here. The MSVC x64 native build/smoke passed.
The exact installed image matched the non-activating static profile. No launcher
or mod source changed, so launcher build and mod review were not rerun. TF3 was not
launched: no qualified observer/hook existed to justify a bounded game run. See
`native-review-handoff.md` for the full evidence, risks and acceptance procedure.

## Current status — 21 September 2026

### Native route: standalone foothold and static engine mapping

The native priority and limits are recorded in `native-integration.md`. The
original observation-only DLL and standalone host built successfully with MSVC;
the host rejects malformed/null ABI requests and reports an unsupported caller,
with zero gameplay capabilities. Its executable digest matched independent
PowerShell SHA-256. This is not an in-game load or synchronization test.

The read-only PE locator found 12 references in the installed, exact-hash TF3
image. Root disassembly inspection distinguished assertion-only simulation-label
fragments from a surrounding candidate routine and located a command-application
candidate. No hook is qualified or installed. No game launch, game-file write,
or multiplayer readiness claim follows from this static evidence. See the native
document for precise RVAs, limitations and next investigation.

Root verification: full `npm run check` completed with 741/741 passing; the first
attempt terminated without a summary and was not counted. The four static-PE
tests cover known references, wrong targets, malformed images, unordered ranges
and overlap rejection. `Build-NativeProbe.ps1 -RunSmokeTest` passed independently.
Neither verification exercises live engine hooks or two TF3 simulations.

### 21 September: correct native matrix column access

The 08:08:57 UTC run on manifest `cdfee99e54ed725a06766e2d82c6422ff7605a8106c0bcbab54f3ef9190518f1`
reached `transform`. This establishes that request, world clock, paused state,
candidate ownership, relative parameter and road membership checks passed in
that run. It did not export a complete snapshot or execute replay.

The installed `api/tealdef/api/type.d.tl:770-773` comment says column index 1–4.
However, stock `gui.zip!gui/debug_panel/make_entity_debug_panel.tl:697-706` reads
all columns with `m:cols(k - 1)` for k=1..4, and
`gui/line_vehicle_mgmt/manager_window.tl:624` uses `transf:cols(3)` for position.
The readback now follows those concrete callers: instance `:cols(0..3)`, copied
into the same 16-number column-major output. Missing/nonfinite cells still fail;
there is no identity-matrix fallback. The previous mocks mirrored the misleading
comment; distinct-cell regression data now detects missing/shifted columns.

Remaining source audit: EdgeObject.transf is declared Mat4f, construction resource
is ResName (string), and params is table (`engine.d.tl:132-145`, `type.d.tl:15`).
Stock `gui/entity_window/view_manager_util.tl:139` passes the resource directly
to constructionRep.find. Resource/parameter live reads are still unverified.
Legacy full-proposal capture also uses 1-based columns; it remains disabled for
this readback workflow and needs the same qualification before any reuse.

### 21 September: use the native world handle unchanged

The 07:55:46 UTC run reached `clockWorld` and stopped, on manifest
`193f495f956db43a75223b4afbf6089a3ab01fbbba1571abb87513ce3f348e66`.
Thus the earlier namespace change did not resolve the live clock failure. That
stage combined a Lua function-type check, the native call, and a nonnegative-int32
world-ID restriction; the evidence cannot identify which condition failed.

The reader now matches the working bridge's direct protected API calls. The
world handle comes only from `getWorld()`, is checked as a finite safe integer,
and is forwarded unchanged to component reads. Installed `engine.d.tl:13` defines
Entity as integer and `engine/util.d.tl:1026` returns Entity; neither declares
the world to be a positive placed-asset ID. Request, stop, edge and company IDs
remain strictly positive int32 values. This is not a relaxation of input identity.

All readback native-call sites now rely on the enclosing protected call rather
than requiring callable native bindings to have Lua type `function`. Results,
paused state, ownership, road membership and output bounds remain checked.
Missing/throwing calls remain failures. `clockLookup` and `clockIdentity` now
separate call failure from invalid returned identity. No live world handle or
callable representation has been observed, so the precise native cause remains
unconfirmed until the repaired reader runs; no successful readback/replay claimed.

Root verification: 736/736 checks passed, including world-handle and callable
userdata regressions; source review and diff checks passed. Staged at 08:06 UTC
with TF3 closed, manifest `cdfee99e54ed725a06766e2d82c6422ff7605a8106c0bcbab54f3ef9190518f1`.
Prior mod preserved in `tf3mp_backup_4dcfc61e8e4a49488c64dba6a3d27eac`.

### 21 September: clock/component namespace compatibility repair

The 07:43:44 UTC apply on manifest `51df5fe7a104eb5c942687880609eda7213e8cdf5134f6622e4822bf98b17c12`
passed candidate copying and engine request validation. The engine returned
`READBACK_UNAVAILABLE` at `clock`; no snapshot was exported. Subsequent telemetry
showed speedup zero, but does not prove the exact state at the failed clock read.

Comparison with the working bridge revealed unnecessary `type(ComponentType)
== "table"` requirements in the new module. The reader now resolves named
constants directly under its existing protected call, as the bridge does; the
same assumption was removed from ordinary component reads and EdgeObjectType.
The native namespace representation was not logged, so this is a compatibility
repair with a reproducible userdata regression, not proof of the live root cause.

Clock failures now distinguish world lookup, component access, paused state and
clock values. Missing constants, failed reads, nonzero speed and invalid counters
remain failures. No clock values are invented and no execution/replay is enabled.

Root verification: 732/732 checks passed, including actual Lua userdata namespace
regressions; source review and diff checks passed. Reviewed source manifest:
`193f495f956db43a75223b4afbf6089a3ab01fbbba1571abb87513ce3f348e66`.
Staged at 07:52 UTC after the user closed TF3; all source/copy checks passed.
Prior mod preserved in `tf3mp_backup_3026d79ce7df4197af71127f2cc5ccfc`.
Live confirmation remains required; no game launch or live retry was performed.

### 21 September: apply-reader compatibility repair (live result pending)

The 07:15 UTC native apply on manifest `6a8b13a24361ff3885f82815dac8beafc1b96774cb628c78c62348dc45916a5a`
reported a table with Lua length zero, then `INVALID_APPLY_RESULT`. No readback
artifact was produced. This does not establish whether the table was empty or
used native indexed access with different length behavior. Hosting recovered
after an orphaned lock was moved aside; that is separate from this reader failure.

The reader now copies at most 64 explicitly indexed result IDs, with a 65th-slot
bound check and rejection of gaps/duplicates. It no longer relies on native
result-table length or metatable inspection. If there are no indexed results,
it can use the single stop's documented `Proposal.EdgeObject.resultEntity`, but
only when strictly positive. Negative proposal placeholders are rejected, never
used as live IDs. Engine checks still require the exact owned stop and road
membership. Unknown maps are not interpreted as entity mappings.

Source evidence: installed `api/tealdef/api/type.d.tl:2492-2504,2801-2806`
and `mission.zip!mission/mission_sim.script.tl:248-262` declare the resulting
entity and positional apply/result-list contract. None proves a positive stop ID
is populated in this live event; that remains the native qualification boundary.
Failures now identify the exact fixed copy stage instead of collapsing all
failures into `INVALID_APPLY_RESULT`. No raw exception or native object is logged.

Regression coverage includes zero-length indexed proxies, genuine empty results,
positive/negative/missing fallback IDs, gaps, duplicates, bounds and copied-ID
isolation. This is a reader repair, not replay or Phase 2 completion.

Root verification: 730/730 checks passed; source review and diff checks passed.
Staged at 07:36 UTC with TF3 closed, manifest
`51df5fe7a104eb5c942687880609eda7213e8cdf5134f6622e4822bf98b17c12`.
Previous mod preserved in `tf3mp_backup_0849c4e8c1574eefa4d983d62c6bd991`.
No game was launched and no placement or live readback was performed by the agent.

### 21 September: post-apply placed-stop readback implemented

The incomplete preview is no longer the only investigated source. The passive
apply observer copies only bounded result IDs, owner and observed name/one-way
options. A protected regular GUI callback submits one read-only engine event;
the event checks paused state, actual returned entities, exact owned stop identity,
its live road membership and side, then copies public EdgeObject resource,
relative parameter, transform and tagged parameters. It never submits construction,
scans for substitute world objects, modifies money, or retains native userdata.

The module is source-pinned. Requests, native reads and parameter serialization
are bounded; failures expose only a fixed stage label. Duplicate send protection,
correlated replies, a bounded polling count, helper nonce and company checks prevent
stale readback being presented as current. Parameters use typed keys/values so
empty tables and numeric/string keys are not silently flattened.

Root reviewed both delegated modules, corrected native userdata handling, native
double-quoted envelope support, JSON numeric/parser bounds, field agreement,
resource checks and subscription ordering. Actual Lua mock output is tested
through the JavaScript parser. This does not qualify access in the live engine.

Check capture diagnostics can report `PLACED_STOP_READBACK_ONLY_NOT_REPLAY_READY`.
The new file cannot satisfy the old replay-case parser. No successful replay or
second-company service is claimed. Public-constructor qualification and mapping
the resulting road back to the pre-action checkpoint remain outstanding; do not
substitute current post-build entity IDs into a reloaded save.

Final verification: 727/727 checks passed, review validation and diff checks
passed. Staged 21 September at 07:04 UTC with TF3 closed; source/copy manifest
`6a8b13a24361ff3885f82815dac8beafc1b96774cb628c78c62348dc45916a5a`.
Backup `tf3mp_backup_52ecbdff20a84367a90c5efc85ee3b5f` preserves the prior mod.
Launcher source unchanged; no automatic game launch or live placement performed.

### 21:09 preview result: lane repair observed, model source unresolved

Root read the fresh create diagnostic and native stdout after the user's completed
preview/cancel test on the repaired staged mod. Neither singular laneConfig error
remains. This locally verifies capture-side handling of absence, not reconstruction.
The remaining shape report is: modelInstance nil; simple edgeEntity nil; param nil;
oneWay boolean; model nil; name string. No raw names or native objects are retained
in this ledger. No complete capture or replay result was produced.

The alternative simple record is not available wholesale in this event; its two
present fields cannot supply the missing resource and placement information.
Do not repeat this diagnostic or manufacture the missing data. Required next
investigation is a supported source of the complete placement data, independent
of a guessed-coordinate UI. Phase 2 acceptance remains blocked on that route.

Root also inspected stock `gui.zip::gui/construction/construction_react_util.tl`
at the ACTION_STREET_TERMINAL_BUILDER branch: the descriptor receives resName,
filtered params and oneWay. `base/tealdef/scripts/builtin.d.tl` declares these
inputs, not a completed snapped-edge/parameter output. This is a resource-source
lead, not complete placement capture. No runtime changes, new tests or restaging
were made for this evidence-only update.

### Live aggregate report: absent laneConfig and stop model

The user's 20:51 report on manifest `6b1f4dceb7e0529aa89d7122717685f983e77621843216eff446f115ac5cb599`
identified `laneConfig` absent on both added/removed segment components and
`modelInstance` absent on the stop. The aggregate diagnostic UI worked in-game;
this is not replay success. Both create and apply observations contained the issue.

Capture/strict parsing now preserve singular laneConfig absence as null; native
reconstruction requires matching absence and never writes that unavailable setter.
Plural laneConfigs remains required and is preserved. Root's round-trip test also
rejects a mismatching constructor and missing plural lanes.

Installed `api/tealdef/api/type.d.tl:2492` declares direct Proposal.EdgeObject.modelInstance;
`base/content/mission.zip::mission/guide_system/guides/guide_timer.tl` checks it for
nil before reading modelId. Root inspected both. No alternate nesting or public
ModelInstance constructor was established. SimpleStreetProposal.EdgeObject.new
is public (:2762), but requires edgeEntity/param/oneWay/model/name and a compatible
new edge; those values have not been established for this observation.
When modelInstance is absent, diagnostics now report only the kinds of those five
declared alternative fields. Missing model still rejects capture/replay. No guessed
model, dropped stop, execution retry or target-company success is introduced.
The prior structural reconstruction remains experimental, not native-qualified.

Root verification: 718/718 checks passed; mod review passed. Staged with TF3
closed at 21:02 UTC, source/copy manifest
`4de45b3efbf6539ca6b8f389a260857a3e8557eb3ea4c8e944c4b0ec3b85c454`.
Previous copy preserved as `tf3mp_backup_cddbebcc96d749cd8df8009013175abe`.
No launcher-source change or game launch. Native verification of the repair and
alternative field diagnostics is pending; Phase 2 is not complete.

### Consolidated capture compatibility diagnostics

The live 20:32 preview/apply progressed beyond node flags but failed `lanes`.
Rather than normalize an unknown field or request another blind placement,
the collector now independently inspects required proposal, road, lane, node,
configuration, matrix and mapping field shapes. Getter failures do not prevent
inspection of independent siblings. Only fixed field-path/type tokens leave the
callback; raw native values/errors are not exported. Limits (4096 field reads,
24 report tokens, 2048 bytes) produce `InspectionLimit` and prevent capture success.
Successful inspection is not execution permission: the original complete capture
and strict helper schema must still pass before any replay case is created.

The regular protected GUI callback exports unsupported reports separately from
capture data. This preserves missing-field evidence for a read-only launcher
diagnostic without manufacturing a replay payload. Root executed multiple
simultaneous failures, throwing getters and report-limit cases in the actual Lua
collector. Native runtime/constructor compatibility remains unverified.

Launcher 0.6.27.0 adds **Check capture diagnostics** (preview/cancel only), and
distinguishes paused, unsupported, absent and invalid capture from uncertain replay.
The helper strictly parses bounded inert diagnostic files, checks freshness, and
never enables replay from them. Stale apply diagnostics do not supersede a fresh
valid capture. Errors after replay consumption remain terminal unknown; a
diagnostic read finishing after consumption cannot replace that status.
Root reviewed the delegated helper/UI changes, added the post-await consumption
check, and kept the status line short with the full issues in Debug logs.

Full suite: 717/717 passed; additional scoped logger assertions passed 3/3.
Launcher compiled (not interactively verified), SHA-256
`5e6465dd8e3a32f292181c559c91a40240a7dccd7b9f9818c795dca3dc2544b2`.
Mod staged with TF3 closed; source/copy manifest
`6b1f4dceb7e0529aa89d7122717685f983e77621843216eff446f115ac5cb599`.
Backup: `tf3mp_backup_5b4ecc79a3dc47628639381d71318e0e`.

### Preserve the observed absent lane-modification flag

Live preview at 20:25:46 returned `nodeFlagsDfalseLnilTfalse`: only
userModifiedLaneConnections is absent. The collector now encodes that exact
absence as JSON null, distinct from false. The strict helper schema accepts
null only for this observed flag; other flag types remain rejected. Lua data
transport carries null as nil. Reconstruction skips the absent setter only
when the fresh native component also reports nil; a conflicting default or
throwing getter rejects preparation. No nil-to-false coercion is introduced.
Existing runtime tests now cover capture/codec preservation, forbidden setter
access and constructor mismatch. Native reconstruction remains unverified.

Full suite: 713/713 passed. Staged source/copy match with TF3 closed:
`91018fd4d5c98dcd9089b1487eae6379588339420798287629c7ee68a8092298`.
Backup: `tf3mp_backup_03fc74f86453484aa0b99b46c4afe02e`. Launcher unchanged.

### Native node flags differ from declared Boolean types

Live 20:18 capture reached the newly supported node configuration, then rejected
`nodeConfigFlags` on both preview and apply. No replay artifact was exported.
Installed engine.d.tl declares all three fields Boolean. Read-only inspection of
the first-party GUI/scripts/game_mechanics archives found no representation
contract for the two user-modified flags; the slip-switch UI uses truthiness but
that is not evidence permitting lossless coercion for replay.

Collector diagnostics now read all three flags under protection before stopping:
`nodeFlagsD<kind>L<kind>T<kind>` identifies doubleSlipSwitch, userModifiedLaneConnections,
and userModifiedTrafficLightStates respectively. Kinds distinguish true/false,
nil, zero/one, other numeric values, strings/tables/userdata and getter errors;
no raw native text is exported. No values are defaulted, coerced or submitted.
The necessary next observation is preview-and-cancel only, not a new placement
or replay attempt. This is diagnostic readiness, not a completed runtime fix.

Full suite: 713/713 passed. Staged while TF3 was closed; source/copy manifest
`58731cf9cae7b6019a48a64b144ee98e1336fd3423961abad1c0c506e037e482`.
Prior mod/cache backup: `tf3mp_backup_7b2742fe013141fb96f6d5ae44769de5`.

### Public node-configuration capture and replay repair

The live apply event reached the observer but produced
`native_road_capture_unsupported` / `nodeConfigs`; no capture artifact was saved.
The previous collector rejected all nonempty configuration vectors and used one
error for shape failures too. The repaired path copies the public BaseNodeConfig
schema, strictly parses its bounded fields, and reconstructs through public
BaseNodeLaneConnectionAndEntity, TrafficLightConfig and TrafficLightState types.
No configuration is discarded or replaced by an empty default. Missing fields
now identify the configuration subfield/shape. Replay additionally requires these
changes to refer to existing captured road endpoints, with duplicate/unrelated
and absent removal references rejected before submission.

Root reviewed the delegated codec/rebuilder, corrected native userdata acceptance
and component write-back, and executed the actual Lua modules offline. These
checks prove copied field preservation, not native setter behavior or game replay.
No automatic launch, native patching, funding, retry or safety-latch reset occurred.
The next manual step remains the same checkpoint/capture/reload/replay procedure.

Full existing suite with relevant schema regression extensions: 712/712 passed.
Review and staging source/copy match (26 files):
`122a5f5ed5543874a21b17ac7f5399514ae4cca8a7752057511dffcaa2635cef`.
TF3 was closed; previous mod/cache backup:
`tf3mp_backup_12d8bf7146fd46c7a3dadc9e22a671b7`. Launcher unchanged.

### Replay launcher receipt repair

The 20:00 live recording reached `RECORDING_STARTED`, but the diagnostic logger
removed `recordId` (and would also remove `caseDigest` at subsequent stages).
The launcher consequently rejected the otherwise successful response. The helper
now preserves only correctly shaped artifact IDs on the replay workflow event;
secrets and arbitrary payloads remain redacted. A focused regression checks all
three launcher handshake stages and malformed/unrelated fields. Full suite:
706/706 passed outside the child-process-restricted sandbox. This is helper-only:
restart the helper, not TF3; no mod restaging or launcher rebuild is required.
Native capture/replay and Phase 2 acceptance remain unverified.

### Service evidence persisted; company-control API boundary identified

Read-only service receipts now extend the same setup report, with a bounded,
secret-free field set and serialized writes. Setup completion remains
`SETUP_VERIFIED_SERVICE_NOT_OBSERVED`; raw endpoint history does not assert income,
continuous ownership or a completed trip. The existing guided-mailbox check now
verifies receipt persistence, signed amounts and redaction in that report.

An independent static company-control audit, checked against declarations by root,
found explicit `Context.player` for direct construction but no public setter for
the stock controls' player. See company-control-api-audit.md. This changes the next
implementation choice: do not build a cosmetic company switch. Preserve native
placement geometry and establish a company-bound submission route, with live
ownership/debit verification. Current same-company replay remains unchanged and
unqualified in the game. No mod/launcher changes, restaging or game launch in this
report/audit batch.
Final existing verification suite: 705/705 passed.

### Read-only post-assignment service observation implemented

The registered collector and protected GUI exchange now return correlated raw
start/end observations for a service already verified by the native setup adapter.
They recheck the saved assignment, all owned assets, route stations, paused clock
and original company. Endpoints retain exact vehicle-account net and four signed
maintenance-category reads. They do not infer income, complete trips or a Phase 2
pass. The helper accepts only its own successful setup's IDs, consumes each endpoint
before publication, and refuses lost context, repeated endpoints and unpaused reads.
The local CLI continuation is `service-observation-start` / `service-observation-end`
after completed setup; it is not a new station-placement workflow or a request for
the user to repeat the legacy coordinate test.

Root executed the actual Lua collector in an offline interpreter with public-API
fixtures, including start/end, duplicates, malformed requests, nonce, ownership,
route and pause failures, then parsed its signed receipt with the actual helper
parser. This caught and fixed a Lua syntax error and unsigned-parser integration
error before staging. The existing service mailbox check now also traverses both
observation endpoints and running/paused transitions with real files. No new test
files were added to the suite. Native runtime, continuous service operation and
financial-category semantics remain unverified; no game was launched.

Final existing full suite passed 705/705, including the updated observation source
checks and real-file continuation assertions. The 26-file mod was staged while
TF3 was closed, with matching source/copy manifest:
`86f89689e204e19437220ec09a408067bc1c35559f7d163601fe544ec028a33e`.
Previous mod/cache backup: `tf3mp_backup_008e3cad33954de5b630812df488d29d`.
Launcher remains 0.6.26.0; no launcher source change or rebuild in this batch.

### Guided normal-stop replay workflow built and staged

Launcher 0.6.26.0 exposes Record checkpoint, Capture placed stop, Load replay case
and explicit Confirm replay. Records survive helper restart in the same launcher
window; confirmations do not. The CLI blocks remote admission before asynchronous
work, requires a fresh solo host for record/load, checks current save/executable/
source/staged-mod hashes, and consumes confirmation before publishing the request.
The original save is never overwritten or loaded automatically. Old coordinate
setup controls are labelled legacy and kept in advanced diagnostics.

Root verified offline recording with no previous capture, capture/load round trip,
and no-overwrite failures using synthetic data. Existing full suite passed 705/705;
the legacy setup label assertions were updated without dropping safety checks.
The launcher compiled successfully (no interactive UI/game verification).
Canonical executable SHA-256:
`77fa8c6253e6a457bcdd02efdc70930339e27441b9f27524278e8ac39aa0f8b3`.
The 25-file mod was staged with source/copy verification while TF3 was closed:
`17dd029934d71eec3fe93b1b1e886b303f161bf626c1c8afb3ca405da5599306`.
Prior mod/cache backup: `tf3mp_backup_ff0327dda0814e818fb3569f7390bd7c`.

This provides a bounded replay test, not full Phase 2 acceptance. Independent
review confirmed that current setup stops after line assignment; the existing
experimental service collector still needs integration and native financial
semantics qualification. Two owned operating services and isolated expenses and
revenue remain unverified. See road-stop-replay-test.md for the limited procedure.

### Replay modules registered and helper request/receipt path connected

Moved the six experimental modules into the mod's reviewed content set (25 files)
and updated existing executable Lua checks to use those shipped files. Event
subscription migration 18 adds the same-script replay event and receipt query.
The engine preserves the executor's freshest state and persistent attempt latch.
The regular protected GUI callback forwards bounded copied data only in the live
company-test mode, consumes before sending and exports correlated scalar receipts.

The helper now exposes an explicit-confirmation replay method, requiring a fresh
paused observation and matching local company. Its mailbox validates compatibility
identity, checks the current helper configuration, publishes with no overwrite,
and keeps the request as a durable no-retry marker. Polling fails unknown on lost
observations, changed update/company, timeout or unverifiable receipts. Receipt
flags remain `replayAcceptanceVerified:false` and `gameplayVerified:false`.

Root ran an inline integration using the real helper, request serializer, mailbox
files and receipt parser. A synthetic receipt completed the limited observation;
missing confirmation and a repeat request rejected. No TF3 command was sent.
Source review passes with manifest
`17dd029934d71eec3fe93b1b1e886b303f161bf626c1c8afb3ca405da5599306`.
Launcher exposure, staging and live engine qualification remain outstanding.
Final existing `npm run check`: 705/705 passed after helper integration. No new
test files were added in this registration batch; existing Lua tests now execute
the registered source. The inline file check used a synthetic receipt, not TF3.

### Local replay execution adapter — not yet registered

The experimental adapter resolves model ID/name in both directions, compares the
removed road baseline, prepares a company-bound native proposal and persists its
one-shot latch before submission. The result reader checks one new stop, callback
membership, model/transform, ownership, exact target debit and unchanged peer
balances while paused. Unknown callbacks remain unknown; even limited verified
receipts retain the company safety latch rather than implying full acceptance.
World entity zero is now accepted for clock/speed reads, not road/company IDs.
Missing enum groups now reject instead of accidentally inserting boolean false.

Existing full suite: 705/705 passed for this adapter batch. A focused rerun of the
prepare/execute/result suites passed 15/15. No native execution, game launch or
staging occurred. The offline case utility records pre-placement file hashes and
binds the copied apply capture without overwriting files. A file hash does not
prove what the running game loaded. Request/engine integration remains in progress;
this is not a runnable Phase 2 acceptance release yet.

The bounded request serializer and engine dispatcher now agree on the explicit
confirmation value, identity fields and 300-tick maximum validity window. Root
executed the emitted userdata through Lua and the actual dispatcher: the valid
request reached its injected execution dependency, while wrong confirmation and
stale clock were rejected before execution. This inline integration check sent no
native command and added no test files. The full existing suite was rerun with
child-process permissions after sandbox `spawn EPERM` failures: 705/705 passed.

### Resource identity connected to passive native capture

Source now resolves the proposed stop's exact model ID through the public
`api.res.modelRep.getName` accessor during protected capture. Only a bounded,
validated copied name leaves the callback; lookup errors produce unsupported
capture without retaining native objects or altering the native action. The
regular GUI publisher carries its hex encoding in diagnostic envelope schema 2.
The helper derives replay identity from that captured metadata, not a manually
supplied name. Legacy schema-1 captures remain readable diagnostics but cannot
become replay cases, even if a caller supplies a matching-looking name.

An integration fixture executes the real Lua collector and then parses its
encoded result into the offline replay artifact. This verifies plumbing, not TF3
callback permissions or replay. Reload-time native resource resolution and the
confirmed command/receipt adapter remain outstanding. No staging or game launch.

Source review: 19 content files; manifest
`b5cd3915e78d267bf3e66a8a1fd4773e4de3b9800bcc3f3a099f4bcc25cf074e`.
Final `npm run check`: 689/689 passed. These checks remain synthetic evidence.

### Reload/replay baseline and transaction preparation

Added an experimental read-only road preflight: compare recorded removed road
segments/nodes against current engine components, require a paused engine and
the captured company, and distinguish mismatches from unknown getter failures.
It does not submit a command, prove the entire checkpoint, or validate the new
stop's model resource. Native reads remain to be qualified in TF3.

Offline replay cases now require a bounded model resource name paired with the
copied model ID (artifact schema 2). Changed names with unchanged IDs reject;
legacy cases without this evidence reject. Capture-time resource-name collection
and reload-time resolution still need to be wired; supplied metadata is not live
proof. Resource checks never grant execution permission.

The existing durable company transaction mechanism now accepts the road-stop
replay action. Tests cover explicit confirmation, preparation rejection, lost
receipts, restart, attempts with a different capture and later company mutations.
An unknown replay cannot be retried or bypassed by choosing a different action.
This is preparation for the execution adapter, not an enabled replay button.
No game launch, staging, native construction or financial change was performed.

Verification: final `npm run check` passed 686/686, including preflight inputs
validated through the actual copied-capture schema before Lua execution. This
is synthetic evidence only. The preflight currently requires copied numeric
precedence records; symbolic-only records reject without guessing an enum.

### Copied precedence values and initialized-record reconstruction

Capture/parser now preserve an actually numeric precedence value as a bounded
`nativeCode` record without needing an unavailable symbolic group or guessing
enum ordinals. Symbolic values remain supported. The experimental rebuilder only
uses such codes when the trusted caller supplies independently qualified native
values; unqualified codes fail. Tests use arbitrary nonstandard numbers to prove
they are copied, not interpreted as hard-coded YES/NO/AUTO mappings.

Reconstruction now reuses initialized street-edge, optional-component and empty
terrain records when available, as well as stock-supported node/edge components.
It does not clear nonempty terrain or invent missing constructors. Added fixtures
exercise reconstruction without separate component/grid factories. Actual TF3
precedence representation and these extra initialized defaults remain unverified.
No replay command was sent and this is not Phase 2 acceptance evidence.

Verification: full suite passed 681/681. A final guard makes an unexposed
PrecedencePreference member lookup nonfatal; all 26 focused capture/review checks
passed after that guard. Source-only batch, no staging or game launch. The final
record/reload/replay execution flow remains to be connected before another manual
session is requested.

### Windows request publication repaired; stock wrapper path confirmed

The coordinator's observed `EPERM` at atomic replacement now has bounded
transport-only recovery: retry the same immutable pending file at most five
times within a 150-ms retry window, only for Windows EPERM/EBUSY. Before retry
and again after delay, verify the pending file is a single-link regular file
with exact bytes and stable bigint file identity. A missing/changed source stays
unknown. Close/halt cancels further replacement attempts. Never delete the live
request, generate a new action ID, retry engine execution or infer engine success.
Windows lstat's zero device value is treated as unavailable, not as a mismatch
against fstat's volume serial; nonzero device IDs still must agree.

Deterministic fault tests cover persistent/transient errors, changed/consumed
sources, elapsed time, attempt limits and cancellation. Actual temporary-file
tests validate content, identity, hard links and successful publication. The
previously failing coordinator success/unknown-action/report-failure scenarios
pass together. Final full verification passed 676/676 (36.2 seconds), including
the stock-wrapper fixture. This repairs request delivery, not construction replay.

Root independently inspected stock `mission/tasks/auto_builder/track_builder.tl`
and `electrify.tl` inside base mission.zip: NodeAndEntity/SegmentAndEntity wrappers
initialize writable `.comp` values. The candidate now uses these values instead
of requiring unexposed BaseNode/BaseEdge factories. Remaining precedence,
street-edge/optional-component, terrain and full Proposal conversion bindings
are still unqualified. No TF3 launch, restage or new manual test was requested.

### Record/reload/replay implementation progress — not yet a live replay

Added an offline apply-only replay case binding copied proposal, company and the
pre-placement save/game/mod hashes. Mismatches, preview records and tampering
reject; a file match deliberately does not claim the game loaded that checkpoint.
Added unregistered native reconstruction candidate using public factories and
structural records. Root reviewed the Terra implementation and fixed optional
component defaults, array-hole bounds and native setter/getter error redaction.
Executable Lua tests reconstruct, recapture and compare every fixture field.
Missing capabilities and unsupported edits fail without submitting anything.

Root also found and corrected the capture enum namespace (`api.type.enum`, not
direct `api.type` members). Fixture bindings now mirror that distinction. Required
precedence/grid/component runtime exposure remains unqualified even though their
types declare members. No numeric enum or missing factory is guessed.

No game launch or construction was performed. Next work is native reconstruction/execution
integration and the single record/reload/replay test, not another preview-only
acceptance claim. Separate-company service costs/income still require live proof.

Verification: the initial full reconstruction/case batch passed 666/666 checks.
After correcting the enum namespace, focused Lua capture/rebuild tests and mod
review pass, but the full suite hit the existing coordinator-file fault. A focused
rerun confirmed `ENGINE_DELIVERY_UNKNOWN`, `operation: prepare`, `errorCode: EPERM`,
`deliveryStage: replace` in the success fixture; 2/3 focused coordinator scenarios
passed. This is now direct publication-stage evidence, not merely a suspected
timeout. It was not retried or hidden by weakening safety assertions. The enum
repair changes source manifest to `320e58c7f303aa0aaeab54ec37b5aad2f8644a48a90d8d3f11ca1c2eb1337b25`;
it is not staged pending the binding investigation. No new manual run requested.

### Revision 7 — registered passive capture; replay experiment clarified

Moved the fixture-qualified Lua extractor into the reviewed mod, with one copied
JSON capture per stage and no retained event userdata. The regular protected GUI
step publishes bounded hex envelopes independently of helper availability; errors
stop only diagnostic publication. Native observation still returns no restriction
and does not intercept, reconstruct or submit construction. Added byte-exact hex
runtime coverage; the report reader accepts revision 7 and still supports 6.

The next replay proof follows the user's record/reload/replay proposal: record
one normal action, reload the exact starting save, replay once, compare actual
ownership and spending. Pre-commit interception is not required for that bounded
experiment. It remains distinct from live multiplayer admission and ordering.
No native capture, replay or Phase 2 completion is claimed by this source batch.

Verification: 656/656 automated checks passed; source review accepted 19 content
files. TF3 was closed for staging. Source/stage hashes match manifest
`b016d0c726e342d725909da3b1c4b207327944b73d746aaf1901b49248fcf50a`;
the prior stage/cache was preserved in `tf3mp_backup_e11f55b9f7b4481ba80bed8914ac1705`.
The game was not launched. Native revision-7 capture is awaiting manual evidence.

### Native extraction candidate — executable Lua fixture qualification

Implemented `experimental/native-road-stop-capture.lua`, a passive fixed-field
Proposal-to-JSON candidate matching the offline road-stop schema. Root review
caught and repaired matrix append semantics, absent-component handling, null
encoding, map value types, missing-enum equality, array bounds and exception
redaction before registration. The candidate is still unregistered: no current
game callback, mod package, save or world state was changed.

Added pinned Fengari 0.1.5 as a development-only dependency with lockfile and
licence notice; installed with lifecycle scripts disabled. Lua tests now execute
the actual module with declared-shape fixtures and round-trip through the real
JS codec. They cover matrices, reference maps, optional components, JSON escaping,
unsupported variants, nonfinite data, throwing native-access mocks, 64-record
and 256-KiB bounds. These are not TF3-native binding/permission tests.

The independent diagnostic userdata decoder and checker mode accept bounded
hex JSON without evaluating Lua or enlarging the gameplay IPC allowance. They
explicitly leave freshness/reconstruction/execution unverified. Native writer
wiring and engine reconstruction are still outstanding.

Verification: full `npm run check` passed 654/654 (35.7 seconds). Review-bundle
script syntax passed; its source list now includes lockfile, experimental code
and tools required to reproduce tests. No bundle was built, mod staged, game
launched or construction attempted. Next batch wires the reviewed capture into
the observer and performs live extraction qualification; Phase 2 remains open.

### Offline road-stop representation — implemented, not engine connected

Added a bounded, exact-field copied-proposal parser/canonicalizer and read-only
file checker. It preserves declared street component geometry, lane modes,
ownership, model transforms and entity maps for the supported offline curb-stop
schema. Unsupported nonempty node-configuration, construction and terrain edits
are rejected rather than omitted. It is not a native decoder or gameplay gate;
numeric model/entity references still require world/resource qualification.

Root reviewed the Terra implementation against the installed declarations,
removed locale-dependent map sorting and rejected contradictory nested TRACK
data in a street segment. Root added mandatory-field, ordering, geometry,
overflow and command-line redaction tests. Targeted 14/14 passed; full
`npm run check` passed 644/644 (34.8 seconds). Initial sandboxed CLI tests could
not spawn Node (EPERM); the same tests passed with the normal approved test
execution permissions. No native TF3 test, mod edit, staging or launcher rebuild
occurred. The current live observer still exports summary facts, not this full
format. Next work is bounded native extraction and reconstruction, with final
pre-spend admission remaining separately unqualified. Phase 2 is not ready.

### Command publication diagnostics — implemented and automated-tested

Mailbox publication now preserves the original error and records its failure
stage. The participant emits only allowlisted stage/code/operation fields,
retains the initial fault and separately records failed halt publication.
No exception message, stack, file path or command payload is copied into this
evidence. Stale publication failures cannot invalidate already-acknowledged work;
unknown outcomes still halt and are never automatically retried.

Root verification: final npm run check passed 630/630 (34.6 seconds), including
real mailbox path failure, sync/async publication failures, diagnostic redaction,
changing/throwing getters and stale rejection tests. Independent read-only review
identified Windows destination-open rename contention as a plausible source of
the intermittent coordinator failures; no captured errno yet proves that cause.
This adds diagnosis, not a claim that the intermittent fault is fixed. No mod
content or launcher source changed; neither restaging nor game restart is needed.

### Observer revision 6 — live normal-stop test passed

User confirmed preview, cancel, then placement of one normal roadside stop.
The read-only stdout report identifies revision 6, successful self-test on
attempt 1, eight bounded create samples and one apply sample, with zero observer
errors or rejected records. All nine samples yielded readable proposal facts:
one added segment, one removed segment, one edge object, owner company 3141,
declared cost 67500 and critical=false. Other recorded counts, including
resultCount, were zero. The proposal replaces a road segment as well as adding
the stop; replay must preserve those relationships, not merely spawn a stop.

This locally verifies access to the selected native fields, not complete
serialization, a cancel-event contract, pre-execution interception, actual
debits, second-company placement or replay. The apply result has no array
entries according to this collector; entity identity remains unqualified.
Tick/update were unavailable (-1). No repeat test or game restart requested.

### Observer revision 6 — bounded native proposal field qualification

Implemented a passive Lua collector for documented street proposal counts,
construction/removal/result counts, declared cost/error flag and owner fields.
The collector operates synchronously under pcall, returns only bounded JSON
primitives, and neither copies native objects across callbacks nor invokes engine
evaluation/commands. It applies only to the verified streetTerminalBuilder route.
The Node report parser accepts exact bounded facts and rejects unknown fields;
failed fact reads preserve already-valid native event-delivery evidence.

This is the next transport feasibility measurement, not complete encoding,
company-bound replay, final-click interception, payer verification or Phase 2
acceptance. Root review corrected the native StreetProposal access to
Proposal.proposal rather than assuming its fields were on the outer Proposal.
The basic revision-5 lifecycle gate remains passed and is not being redefined.

Verification: 31 targeted integration/source/report checks passed. Initial full
suite hit the existing intermittent local coordinator request-publication failure
(`ENGINE_DELIVERY_UNKNOWN`). The fixture now publishes complete receipts via
rename instead of truncating the live receipt; that is fixture hardening, not a
proven fix for request-publication failures. A subsequent targeted run initially
failed with STOP_NOT_VERIFIED, then passed on rerun. Final full suite passed
625/625 (34.6 seconds). The intermittent coordinator issue remains recorded,
not certified resolved; no production failure/unknown-outcome guard changed.
Lua/native field reads still need live qualification; source tests do not execute
TF3 userdata. Root reviewed the collector and added fixed field attribution for
caught exceptions, without logging exception text or native values.

Staged 14:47 UTC with TF3 confirmed closed, 18 content files, matching source/copy:
`5ab8dfd368903cffe5fa65b13124fcc2c6304847399af45a0cfd04f03b7f5b9f`.
Backup: `E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_b3ad51c964b9497eadd2a98aa2a2d266`.
Launcher unchanged; no game launch, save overwrite, funding or gameplay mutation.
Next manual run qualifies these newly read fields with one normal roadside-stop
preview/cancel/place on a disposable save, then stdout collection without restart.

### Post-observer source audit — remaining admission/transport boundaries

Root inspected the installed stock mission completion helper, construction input
mapping, Proposal/Context/ProposalData declarations, world-build command signature
and table-based app serialization API. The independent transport audit was
reviewed against those declarations. Mission proposalApply signals completion;
the inspected construction input map handles tool options, not a demonstrated
final-submit override. Proposal.clone supplies a local native copy, not a wire
format; ownership fields and Context.player must both be preserved/validated.

The lack of a generic declared serializer is not proof that a bounded custom
codec is impossible. Such a codec still needs complete action-family coverage,
resource/entity mapping and a qualified admission boundary. No opaque userdata
transport, after-apply duplicate replay, or replacement station picker was added.
This turn changed audit/roadmap evidence only; no executable/mod rebuild,
restaging, game launch or gameplay mutation. The prior live observer result is
retained; no user repetition is needed while these boundaries are investigated.

### Live milestone — normal roadside-stop lifecycle observed

After the user completed the revision-5 preview/cancel/place run, the read-only
stdout report returned `CREATE_AND_APPLY_OBSERVED`: eight capped create samples
and one apply sample, all from `streetTerminalBuilder`, with zero observer errors
and zero rejected records. Both route checks passed. Every sample reported
`shapeInspected: true`, an outer table, and proposal/data slots of type userdata.
Create result slots were nil; the apply result slot was a table.

This locally verifies normal builder-event delivery and outer payload access.
It does not verify native proposal serialization, cancellation timing, paired
preview/commit identity, company-bound replay or multi-game synchronization.
Clocks remain unknown (-1). No more repetitions of this observer test are needed.
Next implementation gate: inspect the supported proposal/command representation
and establish the execution boundary before any company-bound replay experiment.
Documentation only updated for this result; no new build, staging or game mutation.

### Observer revision 5 — preserve delivery evidence on shape-read failure

Revision 4 live routing passed on attempt 1: exact acknowledgement and positive
status control both returned tables successfully. After the user previewed,
cancelled and placed a normal roadside stop, stdout at 14:12:45–53 UTC recorded
nine observer errors and no samples. Those errors establish arrival at a native
event branch; they do not identify create versus apply or prove payload capture.

Revision 5 replaces the observer's unqualified rawget calls with the direct outer
positional reads used by the stock mission handler, inside a separate pcall.
rawget is a leading suspect, not a demonstrated cause: the old outer pcall did
not record which operation failed. Payload inspection now cannot suppress the
basic event record. `payloadType` and `shapeInspected` are sanitized scalar
evidence; uninspected slots remain explicitly unknown. No proposal fields are
traversed or persisted; normal native actions still continue without restrictions.
Phase 2 construction/service acceptance and replay remain unverified.

Root reviewed the independent validator/test changes and ran the final full
suite: 621/621 passed (34.4 seconds); mod review passed. These are automated
source/protocol checks, not execution of Teal in TF3. Staged at 14:21 UTC with
TF3 closed, 17 content files and matching source/copy hashes:
`3065196989bbe6865a109fac1958ee64fe932cf82905cd3a7b864a0a8d4f7904`.
Previous mod/cache preserved at
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_7afe1e229dd74cd3b3efe191a0a6f443`.
Launcher unchanged; no game launch or save/gameplay mutation performed. Next
single manual run: load disposable save, allow simulation to run briefly, then
normal roadside-stop preview/cancel/place once and collect stdout without restart.

### Observer revision 4 — bounded startup route diagnosis

Live revision 3 at 13:32:45 UTC reported `callSucceeded: true` and
`delivered: false`, on the same timestamp as `Game is ready`. The observer
subscription is installed in engine update, whereas the probe ran once at the
first panel GUI step. Startup timing is a plausible cause, not yet a confirmed
explanation of absent native events. Descriptor and exact callback names match.

Revision 4 delays each check to 60 GUI steps, retries at most 12 times, and stops
on the exact acknowledgement. It independently reads the established status
route as a positive control. Only fixed read-only calls retry; no construction,
funding, command replay or native payload serialization is added. Reports show
pending versus exhausted checks and sanitize scalar attempt/type/control fields.
The Phase 2 goal remains incomplete; live native capture and company service
acceptance remain outstanding. Previous tracked goal was blocked awaiting live
evidence; the user's new load supplied evidence for this diagnostic correction.

Final root full suite passed 620/620 (34.5 seconds). Earlier integration runs
failed during validator integration and on an intermittent existing file-based
coordinator `report_failure` scenario (`ENGINE_DELIVERY_UNKNOWN`); that scenario
passed alone and the subsequent full run passed. No production safety guard was
weakened to obtain a pass. Teal/native execution remains a manual check.

Staged at 13:47 UTC while TF3 was closed; 17 content files and source/copy hashes
matched: `d5cf77163891aff521b86f6a61433b38c6c1f2ad784525711f8214ccaaad7ff3`.
Previous mod/cache preserved at
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_671486bf5ba9434fa4843f6e529a6c56`.
Launcher unchanged. No game launch, gameplay mutation or save write performed.
Next: user loads disposable save, briefly runs simulation, and reports loaded;
read the automatic route diagnostics before requesting any placement.

### Historical observer route revision 3

User explicitly requested the tracked goal of completing Phase 2. It requires
actual construction/service/finance evidence, not just tests.
Revision 2 loaded but reported selfTestDelivered=false. That probe combined nested
GUI-script dispatch and GUI-state readback; the result did not identify whether
dispatch threw, the handler was absent, or state readback failed.

Revision 3 sends the once-only synthetic probe from the panel's regular onStep,
the already-used receipt-read context, and checks an explicit scalar return ack.
It reports callSucceeded separately from delivered. No probe dispatch remains
in game-script guiUpdate; native observation remains passive and bounded.
No native capture/replay is claimed from this repair. A parallel source review
reconfirmed the remaining expense/income filter qualification requirement.

Root full check passed 619/619; mod review passed. Staged at 13:28 UTC with TF3
closed, 17 files, source/copy hashes matched:
`3dbfa5b1f48c04f389b95835c20490493ebcff882c952fa2ac14d654bce8b632`.
Previous staged mod/cache preserved at
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_78caa490205c49dbba977002d7f5d81c`.
Launcher unchanged, no automatic game launch or save mutation. Next live gate:
load a disposable save and inspect the automatic route result before construction.

### Observer revision 2 — diagnostic ambiguity repaired

The user completed normal roadside-stop placement with revision 1. Its stdout
showed readiness but no samples. Code review found that readClock and logging
inside guiHandleEvent could throw and be silently swallowed. This is a real
diagnostic defect, but not a confirmed explanation of the missing native events.

Revision 2 removes engine access/logging from observation, queues bounded scalar
text for guiUpdate, reports callback errors, and uses unknown clocks (-1). A
once-only mod-owned synthetic GUI event tests routing separately from native
placement. The reader exposes failed routing/callbacks and never counts synthetic
events as native capture. Exact subscriptions remain; migration is 17.

Final root `npm run check`: 618/618 passed; review passed. Earlier verification
found stale migration16 test expectations, now updated. Source checks and Node
tests do not execute TF3 native callbacks. No native delivery, veto or replay is
claimed verified. Launcher unchanged; game not launched.

Staged at 13:15 UTC with TF3 closed, source/copy hashes matched, 17 content files:
`04be5d4ab0b42e7a6cb41325e37b6314a47f62503a4036230a2d245b69bbf06b`.
Previous stage/cache retained at
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_e42473b1699a428ebee5eb6b12ca2342`.
Next user action: load a disposable save only; inspect synthetic route result
before another native placement. No helper or setup button required.

### Passive native-placement observer implemented and staged

Added exact create/apply event subscriptions (migration 16), passive GUI handling
and bounded scalar stdout records. At most eight records per stage are emitted
per GUI lifetime. The observer does not traverse/retain proposal userdata, return
restrictions, send commands or alter native placement. GUI update preserves its
diagnostic counters. Exceptions cannot become construction restriction results.
Added a bounded read-only log reader that separates GUI lifetimes, validates and
allowlists fields, and never certifies interception or replay from observations.

Verification: full `npm run check` passed 617/617; mod review passed. Observer
tests are source regression checks, not execution of TF3's Teal or native engine.
The log reader correctly reports OBSERVER_NOT_SEEN against the preceding build's
real stdout. No event-delivery or veto claim is made before the live observation.

Staged at 12:47 UTC with TF3 closed, 17 content files, source/copy hashes matched:
`56400cd7534c0faae16ed0eeb2228f9549274c00f64ed63cc1c3130aebb20c23`.
Previous mod/cache retained at
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_dc36d9843ae54b019fdb4fe3a14ef7ef`.
Launcher unchanged; no game launch, native attachment or save mutation performed.
Next: native-placement-observer-test.md, using the ordinary snapped roadside-stop
tool on a disposable save. No helper or coordinate-picker setup is required.

### Normal native placement capture investigation

The 12:24 UTC guided run confirmed funding, then stopped on the first depot.
TF3 stdout reports a collision; both balances were unchanged by that attempt.
No station ran. The station coordinate workflow is on hold, not a further user
test. Source tracing found declared native builder descriptors and a proposal
preview callback in base/tealdef/scripts/builtin.d.tl that the earlier API-only
stop audit missed. Corrected that audit and updated the roadmap/test instructions.
See native-placement-capture.md for exact evidence and capture/replay boundaries.
Changes in this investigation are documentation only. No launcher/mod rebuild,
restaging, game launch, native attachment or additional live test was performed.
The earlier 610 automated tests do not qualify the newly identified callback.
Additional source tracing found stock mission guiHandleEvent handling proposal
create/apply lifecycle events, unwrapping proposals and returning restriction
tables. This is now the primary scoped capture/filter candidate; free-play
delivery, native timing, payload transport and ordering are not game-verified.

### Guided disposable-company setup — launcher 0.6.25.0

The setup controller is now exposed through Diagnostics → Phase 2: service
setup. Company tools captures three locations and a bus in a bounded, session-
bound plan. Selection does not fund or build anything. A second default-No
launcher confirmation identifies both companies and authorizes exactly 1,000,000
test funding followed by depot, vehicle, two stations and line/assignment.
Confirmation rereads the plan hash; stale selections, lost pause, nonempty target,
report failure and uncertain execution stop continuation without automatic retry
or resume. Reopening Company tools preserves submitted selections read-only.

Verification: full `npm run check` passed 610/610. This includes the guided
session through real temporary bridge mailboxes and six simulated engine receipts
with a durable report. These tests do not execute TF3 native construction. Native
placement, road connectivity, insufficient-funds enforcement, service income and
operating expenses remain unqualified; Phase 2 is not complete. Follow
[the guided setup test](phase2-guided-setup.md) for the next bounded live run.

Built launcher 0.6.25.0, SHA-256
`8d28dfaf6124bacc78dc9eeccd05c9c1cb1682c68ec8f297022924d2af12bc4a`.
Staged at 11:35 UTC with TF3 closed: 17 content files, manifest
`4e3c2a57e9252d987907ea17e4f40f35c7d0b766d5c5a15125a3fb17bfb4de5f`.
Source/copy hashes matched. Previous staged mod and cache preserved at
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_5cf09415673f47f2b5ad37eacad6ed36`.
No game launch, save mutation or native attachment was performed.

### Earlier batch evidence (superseded UI status retained below)

### Station/service bridge and consolidated setup controller

Implemented source registration and protected GUI/engine transport for two
separately consented station slots and one target-company line/vehicle assignment.
Event migration is 15. Reviewed content includes the original station/service
Lua adapters; receipts contain bounded scalar evidence, not native tables.
The helper permits continuation only from verified preceding assets, matching
company identity, balances and the same still-paused update. Timeout, missing
receipt, helper close, resumed simulation or uncertain execution cannot advance.
No request is automatically repeated or compensated.

Added an internal combined local setup controller: explicit canonical plan
confirmation, durable pre-action reports, ordered funding/depot/vehicle/station/
service requests, and no automatic resume. Its terminal setup result explicitly
does not certify service operation, income, checkpoint equality or multiplayer.
The launcher does not expose this controller yet; placement selection and a
complete consent/report flow remain implementation work, not a manual-test gate.

Native station conversion, actual road connectivity, native insufficient-funds
enforcement and real service accounting remain unqualified. No TF3 launch,
save mutation, native attachment or gameplay verification was performed.

Final full `npm run check`: 591/591 passed. The existing coordinator file-delivery
report-failure case failed once with ENGINE_DELIVERY_UNKNOWN before action four;
its targeted rerun and the final complete suite passed. This intermittent failure
was not reproduced or claimed fixed. New tests include the combined controller
through real temporary mailboxes and durable report files, with simulated scalar
engine receipts; they do not execute native Lua/Teal or qualify game behavior.

Staged at 11:10 UTC with TF3 closed: 17 content files, manifest
`e9c25ed84077d5f4def787943e3b40c12b6bd2cbcb12c0b3a9c8aeaafa3ca3d7`.
Source/copy hashes matched. Previous staged mod/cache preserved at
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_e6fe4ca8002745b3bc088c15221e13b3`.
Launcher executable unchanged; no new acceptance button or repeat preview test.

### Purchase integration and station construction source batch

Live evidence received: the corrected station probe returned TEMPLATE_EVALUATED
at 10:23:40 UTC on manifest `fa8a425ee21c65c699a12a6f7c06dd4c8f12660d57b37f27686ac043ae5bf95f`:
three modules, two subconstructions, cost283500, tick57156/update2868. This closes
the evaluator diagnostic only. No placement, account debit or service is proved.

Implemented the one-part vehicle purchase through helper, bounded request/receipt
codec, protected GUI exchange and engine event. Only the same-session verified
depot receipt permits a purchase, and the helper also requires the same held
update. Actual ownership/configuration/debit checks precede success. Added saved
purchase latch, separate native/wire receipts and unknown-on-failure handling.
Reviewed content now includes tf3mp_vehicle_command.lua; event migration is14.
Funding, construction and purchase still lack the consolidated acceptance UI.

Implemented an unregistered experimental station builder for exactly two slots,
with explicit placement/company consent, separate saved receipts, fresh-entity
checks and native account verification. It deliberately makes no road-connectivity
claim, and does not treat resource cost as the final world-build charge. Evaluated
params conversion/seed semantics remain a live qualification boundary.

Service observation adds raw exact-window filtered account evidence, not derived
expense/revenue: API filter inclusion of income is ambiguous. No fabricated
accounting pass. Plans and readiness documents identify these remaining gates.

Verification: full `npm run check` passed, 561 tests. Tests exercise Node mailboxes,
receipt validators, failures and source guard structure; no Lua/Teal runtime or
native construction was executed. No game launched, save modified or DLL attached.

Staged at 10:43 UTC with TF3 closed: 15 content files, manifest
`c1df74bac60152bb64681ad3673596a6e00ef00a4b69c4615b67aeb48eec7db9`.
Previous staged mod/cache preserved at
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_36db205372f44fdea8214d70114678cc`.
Launcher executable unchanged; no new test button or claimed acceptance run.

### Station probe failure investigated — follow-up to 10:11 UTC receipt

The live probe returned PROBE_FAILED. The local game stdout records a native
lua::Table::Put insertion assertion at 10:11:18 UTC. It does not identify the
offending key. Comparing the installed stock construction GUI exposed an input
mismatch: our probe also supplied params.templateIndex although the evaluator
already receives the template index separately. Removed that duplicate input;
this is a candidate fix, not yet a live-verified resolution of the assertion.

Added fixed, bounded failure-stage codes through module/engine/helper parsing,
and retained approved scalar receipt fields in diagnostic logging. Exceptions,
native tables and nonce remain excluded. One-shot safety latches remain intact.
Phase 2 is still incomplete; this change does not qualify construction or service.

Verification: all 538 automated checks passed, plus mod review. Staged with TF3
closed; 14 files, manifest
`fa8a425ee21c65c699a12a6f7c06dd4c8f12660d57b37f27686ac043ae5bf95f`.
No game was launched. Previous staged mod/cache retained in
`tf3mp_backup_d810ecb8e65a4d9b83ea0fe35f44510f`. Live outcome remains unverified.

### Station evaluator diagnostic delivered — 10:09 UTC

Implemented the actual read-only evaluator probe through launcher, helper,
protected GUI mailbox, strict engine event and scalar receipt. Fixed passenger
template/menu inputs follow installed source. No proposals are submitted; no
company or finance mutation is added. Engine persists its one-shot latch before
native inspection. Sparse module collections are bounded and counted by keys;
native values are not rejected solely for being userdata, retained or serialized.
Errors are sanitized; late/unrelated receipts do not complete the request.

Primary reviewed Terra module/engine work and corrected receipt persistence and
collection assumptions. Full suite: **536/536 passed**. Launcher 0.6.24 built;
mod review passed; staging matched manifest
`8d514c4270f4a97805dbe4ad48c85eb514ed06e36f19c084208de03a22b74eb2`.
Previous staging/cooked cache was backed up. No game launch or DLL attachment.

This narrowly scoped live investigation is necessary to resolve station setup;
it is explicitly not the promised full Phase 2 acceptance batch and does not
expose funding/construction. Procedure: station-template-live-check.md. Live
result remains pending; source/static tests cannot rule out native assertions.

### Phase 2 sequencing, observation and native feasibility follow-up

Implemented/tested funding-to-depot continuation in one helper, restricted to a
verified funding receipt, matching companies and the same held update. Unknown
or rejected funding, changed identity/update and duplicate actions cannot advance.
The experimental one-part vehicle purchase checks current model Buy price and
target funds, then requires that exact debit. Primary inspection traced stock Buy
through collectVehicleData/model cost; the Modify getPartPrice branch is not the
evidence for this rule.

Added an unregistered read-only service collector of actual owners, route,
visited stops, game time and direct vehicle account series/net. Primary review
added bounds and route-change rejection. No normalized accounting/live service
pass is claimed. Detailed supported API findings are in the phase2-*-api-audit
notes and phase2-station-template-path.md.

Added and reviewed an offline PE inventory with malformed/truncated-file tests.
Primary inspected the actual installed game executable: exact previously audited
hash, x64, no gameplay command export found. See native-image-investigation.md.
No DLL loader, hook, native ABI or process attachment is implemented/qualified.

Verification: final full `npm run check` **526/526 passed**. An earlier full run
failed the existing local coordinator happy-path with ENGINE_DELIVERY_UNKNOWN;
that targeted test and subsequent full suite passed. This timing failure is
recorded, not claimed fixed by unrelated Phase 2 changes. No game launch,
restaging, launcher rebuild, user-save mutation or gameplay verification occurred.

Phase 2 remains not ready: station initialization/connection or native command
capture must be qualified, then vehicle/service/observation require live wiring
and guided acceptance. A passing automated suite is not a substitute for these.

### Native compatibility investigation approved

User accepted investigation of an opt-in DLL compatibility prototype for stock
action capture. Added native-compatibility-prototype.md and brought forward
feasibility investigation in ROADMAP.md without changing the qualification gates.
Independent Terra/medium design review covered exact-build/process identity,
capture-before-mutation, typed replay, local IPC and safe shutdown. No discovered
hook/ABI or supported attachment route is claimed. No injector, game attachment,
game launch, patch, native-build allowlist or distribution was produced.
This entry is design review evidence, not runtime/test evidence.

### Depot bridge and experimental service batch — 09:34 UTC

Implemented source-only helper -> protected GUI mailbox -> engine event -> depot
receipt path, with explicit exact-placement consent, created-company binding,
paused-state/TTL checks, persistent mutation guards and actual debit/owner readback.
Dedicated bounded coordinate/resource serialization does not widen generic IPC.
Timeout, close and late receipts cannot cause retries or success announcements.
The registered module is pinned by controlled-load review; admission guard removal
and module tampering have regression tests. Review corrected stale-state failure
handling so adapter-persisted consumed latches survive exceptions.

Terra/medium agents implemented the isolated engine wiring and experimental
two-stop service adapter. Primary reviewed and requested corrections to fault
persistence, line identity freshness and enum access. Service setup keeps its
shared fault across line creation and assignment and checks actual ownership,
configuration and vehicle assignment. It remains unregistered and unexecuted.

Verification: full `npm run check` **512/512 passed**; controlled-load review passed
with 13 content files. Source manifest:
`69f25e230250950289b52c36bbd41acbc04e61eef49bb3d0593c8b4ce794cd29`.
Node tests cover helper mailbox behavior and source guards; they do not execute
the Lua/Teal or native game commands. No game launch, launcher rebuild or restaging.

Phase 2 is not acceptance-ready: funding/build are fresh-helper internal APIs;
guided sequencing/confirmation, vehicle/service integration, target-company stops
and road connectivity, funds rejection and operating-accounting evidence remain.
Do not ask for another preview-only run. Existing staged containment is unchanged.

### Reviewed Terra adapter batch — 09:18 UTC

Per user request, two gpt-5.6-terra/medium agents worked on independent depot and
vehicle adapter files. Primary agent reviewed actual code and installed API/first-
party references, requested corrections, integrated shared fault behavior and ran
verification itself. AGENTS.md now records that workflow for future work.

Depot changes: exact session/action/consent correlation and engine-shaped receipt
checks, original/target balance matching, preserved existing component membership,
one attempt per disposable save. Review removed an asynchronous callback assumption
and arbitrary per-action retry path: engine-specific API documentation says the
callback is immediate; missing/late callback is terminal unknown. Generic native
rejection is not proof of insufficient funds or complete absence of side effects.

Vehicle changes: new unregistered engine adapter for target-owned road-depot
purchase. Review corrected enum references, result-entity checks and incomplete
fresh configuration. First-party vehicle_util.makePart and HandleVehicleChanges
establish compartment load settings, auto-load flags and purchase timestamp. The
result verifies new identity/owner/chosen configuration and isolated positive debit.
No authoritative new-buy price/availability quote or native execution is claimed.

Primary-agent changes: CompanyTransaction now serializes different company actions,
retains a durable company/checkpoint barrier after unknown results or crashes, and
rejects lossy confirmation normalization. Funding and experimental adapters share
phase2CompanyFault, set before send and retained on unknown outcomes; exceptions
cannot silently clear it. Eleven transaction tests pass, including four new tests.

Final primary-agent npm run check: all 495 tests pass. The subagent's unprivileged
full run had helper spawn EPERM and a coordinator timing failure; neither recurred
in the primary run with required local test permissions. Tests do not execute Lua/
Teal or TF3. Mod review passes, 12 files, source manifest
`35161d7a00aa9e2726324f7d9f15907c03f6f471d8e26dd8e98be747fdac158b`.
No launcher build, game launch or staging. Full Phase 2 acceptance still needs
guided UI/session integration, construction/purchase native qualification, owned
stops/line/service and its consolidated report. NOT acceptance-ready.

### Phase 2 funding backend integration — 09:00 UTC

Implemented in source: requestPhase2Funding -> phase2_funding_request -> protected
regular GUI exchange -> tf3mp_phase2_funding engine event -> saved attempt latch
and native journal credit -> correlated signed-balance receipt -> helper parser.
Amount must be explicitly confirmed and between 1 and 1,000,000; engine requires
paused simulation, the selected original company and its recorded second company.
Original balance must remain unchanged and target credit must match exactly.
No retry, refund, ownership transfer, automatic game launch or remote endpoint.
Helper timeout, close, stale evidence and late receipt handling fail closed.
Existing-save event subscription version advanced to 11; review guards updated.

All 485 automated tests pass, including seven funding tests. Temporary-file tests
exercise the actual helper mailbox for success, wrong nonce, timeout, late receipt,
close and duplicate request. Teal/native command behavior is only source-checked,
not executed by these tests. Mod review passes, 12 files, source manifest
`32f10290800349c4c0d924ba58dd3eaaa37131e5d791c7899085bc26831af6f8`.
No staging or launcher build: funding remains internal until the single guided
construction/service flow is ready. Full Phase 2 acceptance remains NOT READY.

### Economy relationship and source-only Phase 2 development

The agreed relationship is now recorded in ROADMAP.md and AGENTS.md: clients
display/gate their own spending, submit actions rather than balance deltas, and
the host orders company-bound native execution including its own actions.
Remote custom price UI is not required. Actual debit, insufficient-funds handling
and replicated state still require verification; no automatic balance repair.

Implemented, not deployed: experimental/native-depot-command.lua prepares a fresh
native SimpleProposal with explicit owner/payer. Its executor checks placement-
bound consent, a held engine, and company identity, persists one attempt before
sending, then inspects new construction/depot ownership and exact balance changes.
Unknown/missing/late results do not retry. Failed commands remain unknown even
when measured balances/entity membership match: those measurements do not prove
unchanged terrain or the failure reason. No live entry invokes this executor yet.
src/native-depot-result.mjs supplies strict postcondition checks without a GUI quote.

The preview source removes dead retained-proposal pricing and reads only scalar
display estimates immediately in the documented callback pattern. These values
cannot authorize a build. Unattached default TextView creation was also removed.
This is source-only, not a confirmed native crash fix or a new staged build.

Verification: npm run check passed all 478 tests. These are Node/model/source
checks, not execution of the new Lua adapter or TF3. Mod review passed: 12 content
files, source manifest
`2db58c3d6023a86f0de677d98cdb5f739170f00511dbaa368841b97a4f9d738d`.
The new request regression confirms client balance/payer fields cannot become
authoritative vehicle requests. Invalid-owner/debit/entity receipt tests pass.

No launcher rebuild, game launch or restaging in this batch. Staging remains the
08:20 containment hash below and differs from source intentionally. Phase 2 is
NOT acceptance-ready: live event/consent wiring, stage-persistent funding/build
flow, insufficient-funds qualification, vehicle purchase, owned stops/line/service
and one guided report remain outstanding. Do not request another preview-only run.
The exact remaining acceptance sequence is in phase2-acceptance-readiness.md.

### Last staged containment — 08:20 UTC

08:16 regression: preview crashed after retaining native callback proposal.
Inspected crash report 5484f95a-e9cf-4ce2-ba72-646eaa9b11c7_2007.json: message
empty, stackTrace null, crash timestamp 08:16:50Z. stdout contains repeated
unattached TextView warnings from TalCoDepotToolsWindow; no causal native stack.
Native lifetime failure remains suspected, not proven. Removed all reads/copies/
retention of callback arguments. processed is always nil, so pricing cannot run.
Preview reports PRICING_DISABLED_NATIVE_CRASH. No new user test requested until
a supported proposal lifetime/conversion approach is established. This is
containment, NOT a pricing fix. All 471 tests passed after correcting a new test
regex that initially mistook equality for assignment; no native game test run.
Staged with game closed at 08:20 UTC; source/copy manifest:
`6503fa9d7350d110f0f6e42ed22cf96104f428236d7e45c271028a4b87d40335`.
Backup: `E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_0e26fadaf56547faa889d9281b0ce0a1`.

### Previous retained-reference experiment (failed runtime test)

User screenshot reports PROPOSAL_COPY_FAILED with rendered ghost. Installed
definitions still specify callback (ProposalData, Proposal), and clone(Proposal).
The swallowed exception does not identify absent input versus clone failure.
Removed unnecessary cloning for this strictly read-only flow; retain callback
reference locally and inspect/price only in protected engine-read callback.
Missing/invalid proposal arguments now fail distinctly. No viewer-cost fallback,
building or financial mutation. This is a candidate repair, not confirmed native
quote success. All 471 automated tests passed; no Lua runtime was available for
executing mocked Lua tests, and native rendering was not run by the agent.
Staged with TF3 closed at 08:10 UTC; source/copy hash:
`036601e3ebcb23a2a55cef4914a5b05365854535962576303b7dfb2a0d6c41b9`.
Backup: `E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_b6bbf6c8c04543c885f5d7f07261375c`.
Next check: preview once and read quoted company/price or specific failure code.

### Previous callback diagnostics — 19 September

User confirmed native depot ghost rendering after seed repair; screenshot still
showed Preparing. Rendering is locally verified; target-company price is not.
Added placement-specific proposalId matching installed bridge_and_tunnel.tl.
Failed proposal copies now report PROPOSAL_COPY_FAILED; absent callbacks time out
after 30 observation samples; pricing/ownership/collision/balance failure stages
are distinguished without exposing raw errors. This fixes silent indefinite wait
paths; the missing ID as the delivery cause remains a hypothesis pending runtime.
All 470 tests passed (source/model tests, not native UI execution). Read-only
boundary retained. Staged at 17:22 UTC with TF3 closed; source/copy manifest
`cbf471e98da786cca1d11b50dd932ac547d9855981bb1df572b6865e1a1179f3`.
Backup: `E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_f05f75960f2d478180aa6769d7b60473`.
No game launch or launcher rebuild. Next check is price or exact diagnostic text
after Preview last map position; no repeat of Phase 1 required.

### Previous construction-seed repair

Missing construction seed repair: the next native crash asserted
`params.GetPtr("seed")`. Resource selectable defaults omit this required engine
parameter; installed constructionutil.lua asserts params.seed, and
construction.script.tl reads constrParams.seed. Explicit stable seed=1 is now
assigned after resource defaults and before native proposal processing. No RNG,
construction or financial mutation added. Increased panel padding 16 to 28 and
vertical spacing 8 to 12. Stopped the specifically identified stuck host helper
PID 8824 at the user's request; unrelated Node processes untouched.
All 469 automated tests passed. Native preview still awaits runtime confirmation.
Staged with TF3 closed at 17:12 UTC; source/copy manifest:
`b142e1c9c1020c15adc2b36ad79992ebfd0cfa53eb67532702939ca1fcd04969`.
Backup: `E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_94bc8ead44924d78807a0493340dce11`.
No game launch/reload; launcher unchanged.

### Previous preview-context repair

Preview-action context and spacing repair: user reached the window but clicking
Preview last map position triggered `!IsTransformWithContext(node.recipeId)`
under TalCoDepotPreview/BoxLayout. Moved ProposalViewer out of layout children
into an ActionDescriptor owned by a registered public tool-stack entry, matching
the installed bridge_and_tunnel.tl action pattern. Unmount closes the preview and
pops its owned tool. Panel remains controls/quote text only. Added scoped 16-unit
panel padding, row spacing, and a 20-unit-high compact Company tools bar button.
No building, funding or game commands added. All 468 automated tests passed;
these do not execute native rendering. Runtime preview and visual verification
remain outstanding. Launcher unchanged; game not launched or reloaded.
Staged with TF3 closed at 17:07 UTC; source/copy manifest:
`d442cbd33472b9f8db14156845d3976e86c9b4b3b134fd1cf196fb398d14a70b`.
Previous mod/cache preserved at:
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_3e974fbcca9e4b38bce7ca1a0c31dce5`.
Manual check: enable the read-only depot preview on a solo helper, open Company
tools, point at empty ground, Preview last map position, then Clear preview and
close the window. Verify no crash, readable bar text and comfortable panel spacing.

### Previous managed-window repair

Managed-window registration repair: inspected installed gui.zip's
gui/main/react.lua and gui/construction/construction.tl. RegisterRecipe lacks
the innerRecipeId supplied by RegisterWrapperRecipe; ConstructionParamsWindow
wraps builtin.Window. Corrected TalCoDepotToolsWindow to the same registration
contract, with Component-wrapped content and guarded window API availability.
Removed redundant immediate z-order manipulation. Restored the read-only helper
entry; no mutation commands added. Added a review regression rejecting ordinary
recipe registration. This is an evidence-backed repair, not runtime confirmation
or proof of the crash's sole cause. Launcher EXE unchanged.
All 467 automated tests passed. Staged with TF3 closed at 16:59 UTC; manifest
`93aa8dbd57e567d6c4522044b439deea24c802bcbb665b1d8ad525bad0cd809e`.
Source/copy hashes match; backup:
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_d2c31628f11249a4afcb5da12f0d2149`.
No game launch/reload. Manual first check is opening/closing Company tools before
enabling preview; only after that succeeds test the read-only placement flow.

### Previous crash containment

Native preview-window crash containment: inspected stdout and crash report
`b5274e06-6823-4c02-aa49-36a13305ff7e_1005.json`. At 16:52:56 UTC the
WindowContainer transformation crashed; report has an empty message and no
stackTrace. Root cause is not established. Removed the clickable window entry
and rejected the launcher command with PREVIEW_DISABLED_GUI_CRASH. The native
preview itself was not reached. This is containment, not a verified GUI fix.
All 466 tests passed. Staged with TF3 closed at 16:56 UTC; source/copy manifest
`17378cf34664579f05e32f8392e7ff24c191dad8c6bffb98f34cb64dcda50787`.
Backup retained at
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_118ba48cbc3c43e1aa898bf26022ae1e`.
No game launch or reload. Restart the helper to pick up its disabled-preview
command handler; the mod button is absent regardless of old helper state.

### Previous layout attempt (failed runtime check)

Preview layout repair: the user confirmed instructions overflowed the bottom
bar and hid the buttons. The game-bar plugin now contains only Company tools,
which opens a singleton native Window through getDefaultWindowApi. Instructions,
placement/rotation/clear controls and multiline quote display live in that
movable, closable window. Existing read-only and helper freshness checks remain.
All 466 automated tests pass; real-game window layout is not yet verified.
Restaged with TF3 closed at 16:51 UTC; source/copy hashes match manifest
`5c2629c20a1223b8ea7b4ed6123e2ae2c7fb66a6aaa3942d4c3b97304d14f6c0`.
Previous staged mod/cache preserved at
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_77d97434ba664298ae31d64fc4a0068f`.
Launcher unchanged; no game launch/reload performed.

### Previous startup repair

Startup regression repair: the user reported `function data() not defined`
loading `tf3mp_depot_tools.script@TalCoDepotTools`. The new Lua resource had
incorrectly used an ordinary module return. It now exports its recipe through
`function data()`. The preview helper remains a normal ug_require module.
Added review validation and a regression test rejecting the old export shape.
This repairs the reported resource-loading contract, not proof of a successful
runtime preview. All 465 automated tests passed. After confirming TF3 closed,
restaged at 16:43 UTC with manifest
`aa9b368ca45c955fd68c4788df56e3a185e99eed1a5e0a9ce05668c0a1caca33`.
Backup: `E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_c349d6437fab4eb99d2f0fc64b89e9f3`.
Source/copy hashes match. Launcher unchanged; no automatic reload was attempted.

### Integrated preview deployment

Integrated preview batch: moved the native preview into mod content, added
explicitly enabled in-game placement/rotation/clear controls and launcher source
0.6.23's specialist preview action. A fresh solo helper requires correlated
existing-company inspection before publication; it blocks remote admission and
other diagnostics until stopped. No engine mutation commands were added. Mod
review passes with 12 content files and manifest
`796d61b3c07af21a5e63115420cfb900f28fad3564a55ced22854027fd7840b1`.
Build/staging completed after the user closed the launcher. Launcher 0.6.23.0
compiled with Build-Launcher.ps1; SHA-256
`58092b80c99da43665d9a8ac011689439622b67ff729fc7fb678f4a6fdcb323f`.
Stage-Mod.ps1 verified source/copy hashes at 16:38 UTC on 19 September 2026.
Previous mod/cache preserved at
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_7716159d3af947c1b8dcabb96907a384`.
TF3 and the launcher were closed for deployment; neither was launched by the agent.
`npm run check` passed 464 tests, including file-bridge success and failure cases.
Launcher compilation and real GUI qualification are not covered by that count.
The full Phase 2 construction/purchase/service gate is still outstanding.

### Previous read-only candidate batch

Follow-on Phase 2 batch: added an experimental read-only native depot preview
component (outside the distributed mod) and corrected namespace-qualified
resource validation. Source checks verify no command dispatch, explicit company
context, layout root and callback invalidation. No Lua runtime/TF3 GUI execution
was performed. Native preview-to-engine-read compatibility and the complete
construction/purchase/service workflow remain unverified/unimplemented respectively.
No launcher rebuild, staging, game launch or user test is requested by this batch.
Verification: `npm run check` passed all 461 tests (zero failures). The three
new preview checks inspect source structure only; they are not engine evidence.

Phase 1 controlled runtime gate subsequently passed: report
`local-batch-9bac565c-2596-4495-851f-8b52eb6d1566/report.json` records four
exact-update actions, releases at 2/4/1/1 and confirmed terminal halt. This is
one real engine with a receipt mirror, not two-game verification.

Phase 2 development adds `company-service.mjs` funding/purchase/assignment/
operating-evidence contracts and `company-transaction.mjs` durable one-attempt
diagnostic execution. New tests cover wrong company/payer, changed confirmation,
incorrect debits, missing operating evidence, duplicates, helper restart and
timeout/late completion. These are not wired to live commands. No Phase 2
launcher was built or mod staged; no game was launched. The processed-preview
to engine-quote boundary, live depot/purchase/line/service adapter and guided
test remain outstanding. See `phase2-implementation.md`. Phase 2 is not ready
for its final manual confirmation.

### Previous scheduling implementation batch

Scheduling replacement batch: execution hold is now armed early by a validated
event and evaluated by engine postUpdate, not GUI target-minus-one polling. The
saved barrier contains identity/sequence/target only, never vehicle or running
payload. It may pause once; it cannot execute a vehicle on reload. Lease, company,
round, phase and exact update are checked; authorization is consumed before the
pause. Missed targets produce unknown rather than late application. GUI waits
for the matching held barrier, rechecks the live request, and sends the vehicle
action once through the existing ownership/sequence-checked fresh event. Removed
the obsolete execution-event pause fallback: a lost hold cannot be re-created by
that action. Repeated cycles require a consumed predecessor and a higher sequence.

Subscription migration 10. Public gamescript.d.tl declares postUpdate; existing
watchdog already uses this mutation context. Source review covers bounded pause
effects, receipt identities and consume-before-mutate fences. This is implemented
but NOT verified in TF3: callback cadence may still skip a requested target, in
which case the test must fail. Adapter operation deadline now matches the 30s
coordinator bound for the scheduled wait plus held-event round trip; freshness,
heartbeat, exact updates and no-retry checks are unchanged. Launcher unchanged.
Final source manifest: 46760dd6b158f5ef5fc88b09548e476d651de2461db3e5e7f9c84907907c400d.
Final npm run check: 443 passed. Staged at 15:28 UTC with TF3 closed; source/copy
hashes match. Prior mod/cache preserved under local/tf3mp_backup_bb43620632134b56acb949d10183dc5d.
Game not launched. Ready for the same bounded disposable-save test, not a Phase 1 pass.

15:11 UTC attempt: report local-batch-f1b127a1-bb9f-42b7-b4ed-abcc6799d52b
confirms first execution exactly at update 3043, release at 2x, then unknown second
execution scheduled at 3171. Terminal halt confirmed. No second-action success
or 4x execution evidence. Current GUI delivery waits for target minus one and
therefore depends on GUI sampling/event latency; higher-speed exact scheduling
is an unresolved feasibility issue, not a proven fixable constant offset.

The original failing receipt was superseded by the halt receipt. Helper now
preserves bounded active-receipt failure evidence (operation, stage, receipt and
expected updates, observed update, held flag and sequence) before that information
is lost. No non-whitelisted payload or secrets are logged. Tests cover preservation
across halt and immutable returned evidence. This is diagnostic hardening, NOT a
fix or authorization to repeat the same runtime test. No launcher/mod edits,
restaging, game launch, or save writes. Public gamescript.d.tl declares postUpdate
and the current watchdog already uses it; any engine-owned scheduling alternative
must retain lease/reload/replay protections and be investigated before testing.

15:00 UTC runtime attempt: checkpoint capture/release passed, followed by an exact
vehicle action at update 3050 and verified 2x release. Second preparation failed
with CLOCK_RESET. Report local-batch-b3595729-5cad-46a3-bce3-b6a5e4df7deb records
one completed action and a confirmed terminal halt; it is not a complete pass.

Helper-only follow-up: reproduced CLOCK_RESET when telemetry overtakes a delayed
preparation receipt. The old participant treated that historical receipt as a
new live clock sample. Non-barrier bind/prepare/release receipts now cannot rewind
the live clock and must be dated at or after their own request. Acknowledgements
report the current participant clock, while exact held execution/checkpoint
receipts retain strict update equality. Receipts ahead of telemetry wait in the
adapter, retaining normal deadlines. Regression cases cover receipt overtaking,
real telemetry regression, pre-request receipts and missed deadlines. The runtime
log lacks both conflicting timestamps, so this is a reproduced matching defect,
not proof of which specific CLOCK_RESET call fired in that run. No mod/launcher
change or restaging needed. No automatic replay, launch, or save change.
Verification after this fix: full npm run check passed all 441 tests.

14:28 UTC runtime attempt failed during capture, before any vehicle checks.
Report local-batch-b0cf41db-a27e-42b6-aa7d-048ef42863e2 contains generic
LOCAL_RUN_FAILED_NO_RETRY and haltState unknown. A later engine halt receipt says
ok/held at update 2994; this does not retroactively pass the failed session.

Follow-up helper fix: reproduced receipt-before-telemetry ordering in adapter
tests. Previously a checkpoint receipt could announce preparation while the
bridge still reported running, so control acquisition could throw
COORDINATION_HOLD_REQUIRED. The generic original report cannot prove its exact
exception, but this concrete race matches the failure stage. Successful held
receipts now wait for matching telemetry, under unchanged operation deadlines.
Control acquisition also waits for the paused observation. Failed sessions keep
observing the engine, preserving fresh halt confirmation and revoking it on
resume; previously the health guard prevented those observations. Bounded error
codes are retained instead of replacing all exceptions with a generic failure.

Full suite after source changes: 438 passed. Additional adapter assertions for
continued halt observation/revocation also pass. One intermediate file-driver
test run failed early; the targeted rerun and full suite passed (no claim of a
stress-tested timing matrix). Helper-only changes: launcher/mod unchanged, no
restaging, no game launch. Retry requires a fresh helper and untouched disposable
save because consumed engine latches remain deliberately persistent. Phase 1
runtime gate remains open.

14:10 UTC — consolidated Phase 1 runtime-test build delivered. Launcher 0.6.22
builds successfully; full `npm run check`: 438 passed, zero failures. Barrier
release carries an optional bounded 1/2/4 speed through coordinator, participant,
mailbox, GUI and engine. Engine reads the actual post-command speed; both protocol
members must acknowledge it before another action. Bad/missing speed receipts
halt. No new construction restrictions or standalone speed-command bypass.

The local driver now records scheduled/actual update error, preparation/application/
release latency, measured update rate, requested/observed speed and halt state.
It measures callback rate instead of assuming it scales with simulation speed.
Failed actions remain failed while the separate halt receipt is still consumed;
disk/report failure prevents a success announcement. Real-file tests use synthetic
engine receipts and explicitly do not establish TF3 runtime correctness.

EXE SHA256: 745d716e1acd431805287093c19d9e9bde61f7e40c26be6f20c3dc394443d305.
Nine-file mod manifest: b94453cdb06af89b1d4611dbb52db6478b58f36084f8b65f574469078a503b6b.
Migration remains 9 (first staging of this development batch). TF3 was closed;
Stage-Mod verified the copied source and preserved the preceding mod/cache at
E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_426fbe781b6d4de88ec741aaefc68363.
No game launched, save altered, or public release made. One bounded test is in
docs/phase1-integrated-test.md. Ready for the controlled in-game test; Phase 1's
runtime gate is not yet passed, and no real multi-game verification is claimed.

### Earlier implementation entries (historical)

Launcher/setup batch: 0.6.21 replaces the primary guided diagnostic button with
Run local sync test and displays coordinator progress. The helper selects a
vehicle through a nonce/selection-ID-bound read-only click and inspects the saved
test company; no IDs to type, no company creation or funding. Missing company
causes a setup instruction. Real-file tests reject stale selection and verify
inspection before setup; source package validation passes. EXE built successfully,
SHA256 a8b4f4063dec36a475ec042b20c0e1ee2be0ecfcf5e5ed7df04626407c3aede3.
Mod manifest 5c0ec12aacd39962fa0895b0f514b8554af44386bd5625dbda038db210448370.
Not staged/launched. Supported speed changes remain outstanding; this is not the
complete Phase 1 delivery. Report success is emitted only after persistence.

13:50 UTC revised-plan implementation: added local-coordinator-run.mjs using the
real session adapter and coordinator, not the old parallel diagnostic handlers.
It captures a held checkpoint, acquires existing guards, performs four ordered
Stop/Start cycles, then requests and checks terminal halt. Report explicitly says
one real-engine slot and one simulated receipt-mirror participant; no multi-game
claim. Real-file adapter tests inject synthetic engine results for success and
unknown-action failure. Helper entry locks remote admission and other diagnostics.
Report uses existing atomic writer and includes game/mod hashes. Coordinator
capture now permits pre-target heartbeats rather than misclassifying them as
clock regression. Full suite 413 passed; nine-file package review passed with
manifest 3cf6029425f18a65ba926a378b254d2bf484b6fcf74213db605f5f2206ad9c99.
Not staged or run in TF3. Launcher vehicle/company selection, supported speed
coverage and final guided delivery remain incomplete. Construction untouched.

Plan review following user correction: replaced the accumulated roadmap with a
single current phased plan; preserved its earlier text in
archive/roadmap-before-scope-review.md. New construction restrictions are deferred,
not a controlled Phase 1 test gate. Explicit no-building/no-uninstructed-actions
conditions suffice for that experiment, with remote general gameplay still off.
Production capture/capability gating will be built with each supported action.
Kept real receipts, ownership, replay protection, lease/failure halt and scoped
speed/vehicle guards because they serve the final system. The next batch is one
integrated launcher test of the existing adapter, not another diagnostic branch.
Phase 1 still includes supported speed handling and a real local run; two-game
proof belongs to Phase 3. No runtime changes, safeguard removal, build or staging
were performed by this documentation review. Historical entries below are not
current scope decisions.

Coordinator control-lock integration: acquireCoordinationControls requires an
observed pause and active engine lease. Existing control receipt must acknowledge
before coordinationControlsLocked becomes true. Polling retains that lock after
resume while session evidence remains valid; failure closes renewal and notifies
the session. Targeted real-file test covers paused acquire, acknowledgment and
running persistence. Read-only installed API audit: DisableFeatures lists only
CreateNewLine, GameSpeedControl, GameSpeedPause, HudIconMaster, Layers,
OpenEntityWindow, PerkHudIcons. gui.zip game_bar.tl separately forwards construction
input actions (roads/tracks/terrain/bulldozers). Therefore existing locks cannot
be represented as universal input fencing. No game files modified or launched.

Session adapter composition: added engine-session-adapter.mjs to wire bridge
lease and mailbox to requireEngineBinding participant. Non-halt requests require
live confirmed lease; release/prepare/execute also require caller's control-lock
evidence. Missing/lost controls halt rather than acknowledge release. Only fresh
observation counters refresh participant evidence. Close is explicitly not proof
of engine halt. Temporary-file mailbox test passes for denied release and for
successful release followed by control loss. Full suite 409 passed before the
second test variant; both variants passed targeted afterward. No staging/game.
Pending renewal now preserves the old confirmed lease until its original expiry.

13:08 UTC observed checkpoint agreement: added explicit coordinator.capture and
coordination_capture path, preserving expected-hash prepare separately. Fixed
wire contract permits six-field capture without a fictional expected hash or
seven-field expected-hash request. Engine still returns raw observed state.
Participants accept only valid held digests; coordinator requires all members'
matching update/company/digest before readiness and release. Duplicate member
readiness is rejected. Tests exercise two/four participants and mismatches, not
real games. Startup driver/save identity restrictions remain necessary.

13:05 UTC startup scheduling groundwork: asynchronous binding can advance engine
updates, invalidating an immediate hold at the pre-binding observation. Added
bounded future target admission, late-binding/missed-hold rejection and transient
GUI checkpoint scheduling with exact engine-time validation still intact. Tests
cover on-time, too-far, late-binding, missed-hold and wrong-hash cases. This does
not solve baseline negotiation: future selected-state hash must come from actual
held observations, not prediction or request echo. Real startup remains unwired.

Bridge integration: renewable lease now has an explicit startCoordinationLease
entry point. Bridge owns request writes/receipt reads and prevents other probe
modes taking over afterwards, including after lease failure. Writes are drained
on close before cleanup; lease state does not masquerade as confirmed halt.
Temporary-file bridge test covers arm, paused renewal, health loss, no subsequent
renewal and diagnostic rejection. No actual game interaction or staging.

Renewable lease controller added in src/engine-lease.mjs. Fixed 100-tick engine
lease, renewal after 40 ticks, separate acknowledgment/observation deadlines,
matching active receipts and last-confirmed expiry while renewal is pending.
Receipt parser distinguishes armed vs renewed based on request phase. Tests cover
paused renewal, repeated renewals, stale/incorrect acknowledgments, expiry,
lost session/engine evidence, context reset and publication/close races. This is
not startup integration and stopping renewal is not confirmed engine halt.

12:57 UTC repeatable release source: a confirmed action_held receipt can authorize
one resume; a successful exact-update speed postcondition advances nextSequence
and clears only the completed command's transient preparation/execution slots.
The persisted sequence and previous release receipt preserve duplicate barriers.
Failed/unknown release does not clear them. GUI stages compare operation IDs and
export only the live requested stage. Four consecutive participant-model cycles,
source ordering checks and guard-removal tests added. These are not real-engine
cycle evidence. Mod is not staged and the game has not been launched.

12:54 UTC committed execution source: added fixed-schema execute event, transient
GUI scheduling against next-update delivery, live mailbox equality check, and
raw receipt export. Engine checks bound prepared identity, lease, sequence and
actual scheduled update. Persists execution_unknown before pause/action, reads
live owner immediately before one vehicle command and verifies held update,
stop flag and balance before success. Source/mutation tests check guards but
do not execute Teal or prove delivery timing. No staging or game launch.
Repeatable command completion and production session lifecycle remain missing.

Execution-evidence adapter: added coordinator-execution.mjs and integrated it
into real mailbox polling. Successful executeHeld receipts must provide exact
raw selected-state fields; hash-only replies, unheld results and malformed
snapshots become unknown. Canonical hashes include observed vehicle/owner/stop
state, company balance, sequence and update, but exclude per-participant receipt
identity. Unit and actual temporary-file mailbox tests cover these boundaries.
Full npm run check: 380 passed, 0 failed. This is adapter verification only:
no engine executeHeld producer, in-game verification, staging or release occurred.


12:43 UTC initial release implementation: fixed six-field coordinator release
passes through fresh GUI delivery to engine. Independently checks bound session,
checkpoint_held phase, lease identity/company/deadline, no terminal/prior release,
matching held checkpoint receipt and exact current paused update. Persists
release_unknown before one explicit speed-1 command; requires command success,
unchanged update and actual speed 1 before reporting ok/running. Preparation now
requires running phase. Unknown/duplicate requests cannot resume again. This is
initial checkpoint release only; no repeated command lifecycle is claimed.
377 automated checks passed, including negative source-review guards. Nine-file
review hash 88e4eff11304bb02c7ea3bbd3a1d597e4821d4c2e4880aa73412c5c68f305244.
No staging, build or game launch. Runtime behavior remains unverified.

12:36 UTC checkpoint boundary: engine/GUI holdCheckpoint request and raw snapshot
receipt added. Bound live lease, exact update, no prior terminal/hold operation;
single-attempt pauseEvent (kind pause_probe) only if running and unused. Reads
real company balances, rechecks paused exact update, exports scalar snapshot.
No expected hash echo. New local decoder hashes canonical held_company_balances_v1
state with sorted company IDs; mailbox rejects digest-only success by default.
Explicit compatibility switch is used only in the synthetic prehashed fixture.
Tests cover changed balances/updates/companies, order independence, malformed
fields, and real-file receipt conversion independent of the request expectation.
This is selected-state proof only, not loaded-save identity. Driver baseline,
repeated barrier lifecycle, executeHeld/release and full control fencing remain
missing. No stage/build/game launch. Mod review:
2d777e69995a022ee2e6668f116d965dfdb0db543a490c9bb4b7324dbb5c528b.
Final full check: 376 passed. Runtime Teal/callback behavior remains unverified.

12:29 UTC preparation integration: fixed 15-field coordinator prepare payload
goes through guarded GUI delivery to an engine event. Engine validates session,
round, live lease, roster ownership, next host sequence and bounded future update;
reads actual PLAYER_OWNED/TRANSPORT_VEHICLE and revision. Persists unknown before
inspection; successful matching ownership returns the existing ten-field wire
receipt. Prepared metadata is not consumed on update/postUpdate and no command
API is used. One outstanding preparation; cannot overwrite uncertain decisions.
Subscriptions and GUI receipt export are wired; source/negative-review tests
cover ownership and deadline gates. 374 automated checks pass; review hash
04ce79345a576811a60fdf75da5f6789d876ad6b0d4f023461c4a45cdc213446.
No runtime verification or stage. The full path still lacks holdCheckpoint,
executeHeld, release, renewable session driver and comprehensive input fencing.

12:25 UTC session-binding implementation: strict flat bindSession codec for
2–4 roster entries; optional requireEngineBinding participant phase waits for
its engine receipt before issuing holdCheckpoint and cannot announce readiness
from binding alone. GUI dispatch uses an explicit bounded payload and one-shot
delivery; engine checks shape, ID bounds, uniqueness, existing PLAYER components,
local player mapping, live lease and prior saved binding/terminal halt before
persisting the roster. No company creation, money change or UI player switching.
Existing terminal halt verifies bound round when present. Binding is accepted
configuration, not independent authentication or checkpoint proof. Remote gameplay
and real driver remain disabled/unimplemented. No stage, rebuild or game launch.
Source review manifest d854beb2a0e25f56a5fa23ef220a28ad9fbc48079b230158f107ef7a8f510f54.
Full check: 373 passed. Negative review tests cover weakened company/lease and
halt checks; source checks do not establish runtime Teal behavior.

12:20 UTC engine integration: added source consumer of coordination_request.lua
for terminal halt only. Five fixed request fields; GUI acknowledgement required
for dispatch; engine independently validates live lease nonce/company/expiry and
persists a one-operation receipt before invoking haltEvent. No new command API or
resumption path. GUI receipt contains the participant's nine exact wire fields
(nonce stripped by mailbox). Engine/GUI event subscriptions migrate to version 9.
Unsupported operations do not execute. Existing diagnostic halt latch is retained;
consumed/unknown actions never retry. Added source/subscription/receipt/negative
review checks; 370 automated tests pass and nine-file review manifest is
`d40d7a60a19e6e2cf922776875426405b842ebedd86d4879867156fbb3c959c7`.
No staging or runtime verification. Session bootstrap/round binding, other engine
operations, reusable lifecycle and comprehensive control fencing remain missing.

12:11 UTC real-game milestone verified from the user's log and saved report
reports/local-batch-940c26e4-8134-41b4-8141-92653f699d9d/report.json:
testPlanVersion 3, phase passed, outcome local_only_passed, mod 84a6261d.
Exact held vehicle action and snapshot at 2910; all five human control-confirmation
fields true; restored controls and resumed; watchdog expired at tick 57375/update
3013, stable paused telemetry at tick 57384. LOCAL_ENGINE_EXPIRY_STOP_CONFIRMED
and LOCAL_BATCH_PASSED_REPORT_SAVED. No actual helper termination was performed;
the helper remained alive to collect receipts. No multiplayer proof.

Post-pass integration review: exchangeWatchdog and its caller both stopped
reading receipts after missed helper acknowledgements. This would hide the engine
expiry evidence in a killed-helper test. Moved only its read-only receipt path
ahead of the disconnect return; new arm/renew dispatch requires missedAcks<=10
and lastAck>=0. Non-watchdog commands retain the existing disconnect gate.
Also fenced an async-participant edge: an uncertain halt publication previously
could accept a late matching receipt despite haltState already unknown.
It now accepts only while pending. Added regressions; 368 tests pass, review hash
`a238875747415af253ff37c2cac9c960af78076b16f7d5505c9bfcbd2a7d0566`.
No stage/build/game launch: retain known working staged build until next batch.

12:07 UTC repair: user run cdd6e7b0 held/applied 3001, selected snapshot and
control confirmation/restoration passed, resumed 3006. Watchdog receipt remained
active/armed at tick 57379, expiry 57476; observation reached tick 57737/update
3367 at speed 1. No expiry execution evidence. Inspection found update returned
nil even after postUpdate registration. Native fun_elements.script.tl returns
{spawnUfo=true} when requesting postUpdate, otherwise nil; fireworks likewise
returns a work table and postUpdate assumes it exists. This supports nil-result
suppression as the cause; real-engine confirmation remains pending.

Update now returns {watchdog=true} only for an active lease; postUpdate validates
that transient marker and reads current state, preserving single-attempt and
no-retry behavior. Automated callback wiring/source guards cover descriptor,
non-nil result and receiver; these are not runtime proof. 366 tests passed.
Staged with TF3 closed at 12:07 UTC, manifest
`84a6261dd3b303e3582529ffcf227c78b91bfae2291768909924261952560a09`.
Backup: `E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_0f6f9381267c45a5b3ef4226f8970f7d`.
No launcher rebuild, game launch or reload.

12:01 UTC: TF3 closed; launcher open, unchanged. Stage-Mod.ps1 validated and
copied the callback registration repair, manifest
`cdd6e7b0218efa9921a90ba68244c33280f256fb5b81da1a53b04c7980596fba`.
Source/copy checks passed. Previous mod/cache backup:
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_c5998b84b8134378aad4e0f5823fa5fb`.
No game launch or reload. Awaiting actual watchdog expiry evidence.

12:00 UTC: user log on 4a2cd6e3 shows held action/snapshot at 2908, controls
confirmed/restored, resume, watchdog arm then timeout. No expiry receipt available
after helper cleanup; last observation still speed 1/update 3292. Inspection
found the postUpdate function was never registered in tf3mp_status.gs.lua.
Added postUpdateScript reference using the public GameScript descriptor field.
Regression checks all five lifecycle references; full suite 366 passed, review
hash cdd6e7b0218efa9921a90ba68244c33280f256fb5b81da1a53b04c7980596fba.
TF3/launcher still running: not staged, no launch/reload. Stop remains unverified.

11:56 UTC delivery: 366 automated checks passed; nine-file package validated and
staged with matching source/copy hashes (4a2cd6e332806aca553770c57f7638d3e2d13c6bc35539c2cb6296a6345e3a35).
TF3 closed; no launch/reload. Backup:
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_1a2ecc4047ca4ddbbeb6a734b53829af`.
Launcher unchanged; helper source is loaded from the project. Runtime test pending.

11:49 UTC user run on d72a3e6f: exact hold/action 2931, selected snapshot hash
2073f23c34f29277df795d6a124378b786e881811b7de4576107ca161088e280,
control confirmation/restoration and resume passed. Watchdog armed, expired at
tick 57424/update 3037, but receipt remained stopping/outcome_unknown/speed 1.
Later observation tick 57598/update 3211/speed 1 confirms continued simulation.
No autonomous stop pass. Vehicle selection no longer crashed in this run;
this is not independent proof of every window layout or keyboard restriction.

Repair investigation: base game_mechanics scripts (company, fireworks,
fun_elements, industries) use postUpdate for mutation helpers. api/cmd.d.tl
documents immediate engine commands but does not establish update permissions.
Moved watchdog evaluation/one-shot stop from update to postUpdate. No GUI/helper
dependency, retries, resume or changed lease bounds. The original exception was
swallowed, so restricted update context remains an inference. PostUpdate handler
exceptions now produce a bounded handler_failed receipt and terminal helper
error, preserving the spent stopping latch. Source tests guard callback placement;
protocol tests reject late success after a handler failure. No runtime claim yet.

11:45 UTC: user confirmed ready; neither TF3 nor launcher was running.
Stage-Mod.ps1 validated and copied the layout repair, checking matching source
paths/count/hashes. Staged manifest:
`d72a3e6f8f784ca1a9de56b55111896ffa552caa1903c02c7c3e762bf380ab97`.
Previous mod/cache preserved in
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_b8bc399e05a54624ae9d141d9e6f1b12`.
No launch or reload. Launcher remains 0.6.20; runtime repair verification pending.

11:39–11:41 UTC runtime failure: user logs and local crash_dump/error.json
(build 40379) identify `Recipe child must be a layout` in
`Tf3MpGuardedActionBar`, through both VehicleWindow and MaintenanceStationWindow.
The exact hold reached target=actual update 2934. Selection then crashed/reloaded
the UI, causing OBSERVATION_PRODUCER_RESET; that rejection is correct and has
not been weakened. No held action, native restriction or watchdog pass occurred.

Repair: give GuardedActionBar, OriginalManager and the unlocked GuardedManager
delegation explicit builtin BoxLayout roots. Public CallOriginalRecipe returns
the original registered recipe node, not its rendered layout. Source regression
checks all four return paths, including the restricted manager branch. Package
review passes with nine files, hash
`d72a3e6f8f784ca1a9de56b55111896ffa552caa1903c02c7c3e762bf380ab97`.
TF3 and launcher were running during investigation: no staging, launch or reload.
The existing launcher binary needs no rebuild. `npm run check`: 364 passed.
These are automated/source checks, not a Teal runtime test. Real UI verification
remains open.

Capability-test handoff, 10:54 UTC: confirmed no TF3/launcher process was running,
then ran Stage-Mod.ps1 under the existing staging authorization. Review passed
with nine content files and hash
`f1c129c9229050952f211dd6175863adb43117130393098a2b00052c4490336b`;
post-copy path/count/SHA checks matched. Previous mod and cooked cache remain at
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_a8750bb8bb8040a9948e487600e0295a`.
Launcher remains 0.6.20, SHA-256
`5665d88d027202befd8ccff149bad5f57f02f59ce6cf7b00fb23510726a8d705`.
No TF3 launch. This is a bounded prerequisite capability test, NOT completion of
the user's Phase 1 goal. Await real recipe/control/watchdog evidence rather than
using more source checks to assert those runtime properties.

Delivery-path audit caught a real GUI integration defect: exchangeTelemetry's
entry allowlist omitted halt_test and watchdog_test, making their downstream
handlers unreachable. Both modes are now admitted. New source consistency tests
compare the gate with every dispatcher mode and the helper's published modes.
This is why synthetic receipts alone cannot establish executable Teal behavior.
`npm run check`: 363 passed; nine-file review hash
`f1c129c9229050952f211dd6175863adb43117130393098a2b00052c4490336b`.
No game launch or staging.

Load-boundary reinspection: the public GameScriptWithGui declaration still has
no load callback; api.gui.game.getDefaultSavegameId is a save identifier, not a
per-load generation. No reactPostInit emitter was found in the inspected GUI
archive. The mission consumer of that event does not establish ordering before
engine mutations. A GUI recreation claim could reject a repeated helper nonce,
but would not prove every save load recreates the GUI module. Do not label that
candidate as complete engine load fencing or replay saved pending commands.

Real-adapter boundary review found that the mailbox validated but discarded
originPlayerId, requestMessageId, protocolVersion and commandType during encoding.
It now preserves them for prepare and executeHeld, allowing the future engine
consumer to check origin-to-company binding rather than trust the supplied company.
A strict lossless decoder rejects omitted/extra fields, wrong nonce and unsupported
operations. This is wire validation, not engine-side ownership authorization.
`npm run check`: 361 passed, including round trips and malformed-request cases.
No mod/launcher changes or staging. The actual TF3 consumer is still outstanding;
model journal persistence cannot establish the real game's save/load boundary.

Guided watchdog batch: test-plan version 3 uses requestWatchdogTest for its terminal
stage; only a verified engine-expiry stop event can complete it. The report names
the mechanism and preserves continuousGuarantee=false. Human confirmation now
explicitly covers native vehicle toggle and manager restrictions, not just speed
inputs. Full synthetic file-bridge batch and controller tests exercise the new
terminal path. Final `npm run check`: 359 passed. Launcher 0.6.20 built successfully, SHA-256
`5665d88d027202befd8ccff149bad5f57f02f59ce6cf7b00fb23510726a8d705`.
No staging or game launch. This remains an intermediate diagnostic build;
reusable engine-consumer, speed/control coverage and runtime gates remain open.

Watchdog real-file integration: success and missing-receipt cases now run through
startGameBridge and actual temporary IPC files with synthetic engine samples.
They verify arm-only publication, matching expiry receipt plus fresh stable stop,
no inference from a paused sample alone, terminal exclusion of other experiments,
cleanup and loss of confirmation on monitor close. These are not TF3 execution.

The tests exposed non-idempotent helper shutdown. close now shares one cleanup
promise and releases its lock in finally; repeated shutdown cannot delete a new
helper's lock. A separate real-directory test establishes that ownership boundary.
`npm run check`: all 358 passed. Mod content unchanged from the preceding review;
no launcher rebuild, staging or game launch. Guided watchdog integration and the
reusable participant/engine consumer remain outstanding.

Watchdog transport/monitor batch: GUI forwards fixed arm/renew fields once per
request ID, continues receipt reporting after arm-file removal, and resets its
delivery counter on helper nonce changes. The helper exposes requestWatchdogTest
under the same terminal ownership as the explicit halt diagnostic, preventing
later experiments. It publishes one arm with no renewals, requires a correlated
expired stop receipt and stable fresh paused observations, and revokes confirmation
on observation loss/resume. Closing removes files but is never engine disarm.

Verification: 355 tests passed after correcting the new receipt's empty reason
to the explicit `none` token required by the existing strict IPC grammar. The
parser was not relaxed. Nine-file review hash:
`6dbd3bd2e5d3a6e31a0cb1826cdaa11a43852bb6ba6819c28866bd695e63e26e`.
Tests use synthetic receipts/observations plus source checks; real-file watchdog
integration and guided launcher wiring remain, followed by user runtime evidence.
No launcher rebuild, staging or TF3 launch. The reusable participant remains open.

Engine watchdog foundation: a bounded arm/renew event and engine-update expiry
path are implemented, with a persistent pre-stop unknown latch, immediate
callback/postcondition checks, no automatic retry/resume and no rearm of a saved
lease. Expiry/context change/backward ticks stop renewal; requests must advance
both sequence and issued tick. GUI/helper delivery and guided testing are not yet
connected, so no user operation currently enables this path. It does not yet
provide reusable session/load fencing or continuous enforcement after a manual
resume. Local engine callback behavior remains unverified.

Verification: `npm run check` passed 352 tests (new tests inspect source and
negative validator cases); nine-file package review passed, hash
`5c22e387dab2f875c34737cce36b7de8573d2685599ac13ccfa557187feed3dd`.
Subscription migration 8 in source; no staging, launcher rebuild or game launch.

Follow-up: native acquisition no longer acknowledges immediately after setting
the latch. Original manager subtrees are tracked from first render to unmount;
two zero-subtree checks are required before publishing acquired. A subsequent
readiness loss produces a conflict. Rendering while blocked cannot create a new
original manager subtree. Unmatched lifecycles prevent acknowledgement rather
than inventing successful teardown. This still cannot recall previously queued
engine commands or prove compatible behavior with other recipe replacements.
`npm run check`: 350 passed; package review: nine files, manifest
`68b6964e4e7dae008b8abb22730be4ddd8d8c2211dac1c007c3450bd68f0ef28`.
Checks are static/synthetic; no Teal execution, staging or game launch. Phase 1
remains incomplete while real consumer, watchdog and other control gates remain.

Native-control replacement implementation batch: added two original mod resources
using the public replacement API. Vehicle Start/Stop callbacks consult a live
GUI latch, including callbacks wrapped before acquisition; copied button records
leave caller parameters unchanged. Manager content switches to a restricted view,
with original hooks isolated in a child recipe. Explicit matching diagnostic
release clears the latch; helper failure/cleanup does not. This is partial native
coverage, not a global command interceptor or a verified manager-transition barrier.

Verification: `npm run check` passed 349 tests; `node src/cli.mjs review --path mod`
passed with nine content files, manifest
`7fe872cadf3e9dd710fb2ff833d59d661066a75b8c0d4f28f8850caadeac5855`.
Added tests check source/package invariants and negative validation cases, not
Teal runtime. Launcher unchanged, no game launch, no staging. Before a coherent
game-test build, finish acknowledgement/transition handling and the real consumer,
watchdog, speed/native-control coverage. Failure-latched controls also need a
clear recovery instruction in the eventual launcher batch.

### Phase 1 completion audit: not achieved

| Requirement | Evidence / outstanding work |
|---|---|
| Actual asynchronous coordinator/engine integration | Receipt-driven model and mailbox exist; reusable TF3 command consumer is not connected. |
| Exact prepare/apply/hold/results sequence | Local one-shot held vehicle test passed; repeated multiplayer-style barriers are not implemented/verified. |
| Pause/resume and supported speed changes | Normal-speed local pause/resume passed. Speed arbitration and independent GUI clamping remain unresolved. |
| Restrict or replace native controls | Concrete vehicle/manager Start/Stop bypass exists. Shared enable-rule lifecycle and builder pre-mutation veto semantics remain unverified. |
| Latency/deadline measurement | Monotonic helper-observed report intervals implemented/tested; no claim of one-way latency or automatic tuning. |
| Canonical state | Selected held vehicle/company snapshots passed locally; no whole-simulation equivalence claim. |
| Failure handling | Explicit stop diagnostic implemented and synthetic-file tested; runtime stop and autonomous helper-loss watchdog remain unverified/unimplemented respectively. |
| Coherent test-ready delivery | Intermediate launcher 0.6.19 compiled, mod source unstaged. This is not the requested full Phase 1 build. |

Follow-up investigation after the user asked us to resolve the API questions
found a previously missed public recipe-replacement mechanism. Exported vehicle
action-bar and manager-content recipes provide concrete implementation candidates
without shared enable-rule restoration. The earlier vendor-clarification-only
conclusion was premature. See phase1-recipe-replacement-investigation.md.
This is source evidence, not complete control coverage or runtime verification.
No game launch, external message or staging was performed during this follow-up.

0.6.19 guided stop integration: the existing guided test now requires its terminal
stop after verified resume. User warnings and six-stage progress explain that it
ends paused. Successful reports include testPlanVersion 2 and a timestamped stop
observation, explicitly not a continuous guarantee. Missing/mismatched/unknown
stop evidence cannot finish the batch. No extra test button was added.
Verification: all 346 tests passed, including the full guided flow through the
file bridge with synthetic engine receipts. Launcher compiled to the canonical
EXE, SHA-256 `d13e3032e028dd67f7c6f80b5efb227e4b971aeaec0d54669ba431595f4d360e`.
No TF3 execution or staging. This remains an intermediate build: reusable engine
coordination, watchdog and comprehensive native-control gates are still open.

Engine stop diagnostic source batch (unstaged, no launcher button yet): added
`tf3mp_halt`/receipt events and subscription migration 7. The engine accepts only
a bounded, company/nonce/request-bound fresh event, persists a one-shot attempt
before `makeGameSetSpeedCmd(0)`, and records callback plus actual speed/update.
There is no resume, saved queue execution or automatic retry. GUI exchange runs
in the existing protected regular callback only in explicit `halt_test` mode.
The helper requires a matching receipt and later advancing ticks at a stable
paused update before confirmation. Drift, stale observations, timeout or closure
remove that safety claim. Other diagnostic mutations are blocked for this helper
lifetime once the stop test starts. This is an explicit test path, not an engine
watchdog or reusable production lease. No TF3 runtime pass is claimed.
The last staged mod remains unchanged; source review hash is
`3d834f13baa16312e7fd9724ba33a091af0f8038c30d5db05a56c452dc19c639`.
Verification: final `npm run check` passed 343 tests, including real-file stop
request/receipt/observation flow, late and missing receipts, publication failure,
confirmation revocation and structural engine mutation guards. These tests do
not execute Teal inside TF3. No game launch, build or staging performed.

Restart-safety follow-up: engine observation counters now fence on a backwards
counter or conflicting data under an already-seen counter. Identical repeated
reads do not renew freshness. Once fenced, later catch-up cannot re-enable a
pause/action; the guided batch consumes invalidation as a terminal failure.
This closes a helper-side producer-restart gap, not all save-reload detection
and not actual engine halting. Counter continuity alone cannot prove a save
was not reloaded. The engine session still needs its own lifecycle boundary.
Verification: `npm run check` passed all 330 tests, including a real-file bridge
reset/catch-up test proving no new hold request is published. Mod and launcher
source unchanged; no new in-game test requested or game launched.

Phase 1 follow-up source batch (not a new launcher/mod release):

- Recorded the user's 09:31 UTC guided run: held/action update 2970, matching
  selected-state snapshot hash
  `99f9eba80e669c9a92e69458a100d36c5a9481671aab58da152f674fcf4e6159`,
  explicit controls confirmation/restoration, resume update 2974, saved pass.
  This supersedes the snapshot runtime-pending statement below; local only.
- Added persistent-before-effect EngineOperationJournal and synthetic adapter
  coverage for duplicate, conflict, unknown, reload, ownership, deadline and
  persistence failures. This JavaScript contract is not a Teal engine consumer.
- Added monotonic event intervals and explicit late/timeout counts to the real
  guided report path. No engine/one-way latency inference or automatic lead
  tuning. Regression tests separate user wait, reject mismatched receipts,
  handle unavailable timing and wall-clock changes.
- Read-only installed API audit identified ToolStackAPI.setActionsDisabled and
  menu/filter event setters. Their shared-state restoration and mutable-window
  coverage remain unresolved. GameSpeedControl does not block internal speed
  commits/automatic fast-forward clamping. See phase1-engine-control-audit.md.

The reusable TF3 coordination consumer, actual failure-halt evidence and complete
native-control/speed arbitration remain open. No new game test is requested for
this source batch, no game launched, no unchanged mod restaged.
Verification: final `npm run check` passed all 325 tests. A targeted invocation
without escalation was blocked by sandbox child-process spawn EPERM; the full
authorized run above passed. Mod review passed with unchanged seven-file
manifest `913b048dba65c7556425cafa4d267bfdec56c14fbf06efb12f40164aeba87a08`.

### Previous shipped batch

0.6.18 engine snapshot batch: implemented fresh read-only engine events, GUI
mailbox forwarding and helper-side strict parsing/canonical hashing. The existing
guided vehicle/hold batch now requires two matching selected-state snapshots
before allowing control restoration/resume. Hash covers held update/speed,
company balance and vehicle identity/ownership/running state, not the whole world.
Session identity, expiry, held state, owner and requested vehicle are verified.
The old mutation latches are preserved. Subscription migration is now version 6.
Real multiplayer consumer remains unfinished; the snapshot event was initially
runtime-unverified and is now locally verified as recorded above. No TF3 launch
performed by the assistant.
Launcher SHA-256: `0320bcd66de407c909159c31a802f0edec8cb06d721f1b03d9bd17e57d3fe7f1`.
Verification: 302 automated tests passed; launcher compiled; mod review passed.
Staged source matches manifest `913b048dba65c7556425cafa4d267bfdec56c14fbf06efb12f40164aeba87a08`.
Prior staged mod/cache preserved as `tf3mp_backup_4697455253914dc18020a8d7240c874d`.

Agent workflow and halt-hardening batch: added root AGENTS.md with the user's
exact self-verification/delegation rule and project safety/test boundaries.
Async mailbox halt supersedes unsent work and prevents later publication; close
cancels queued work. Confirmed engine halt becomes unknown on observed drift,
resume, malformed observations or stale evidence. No retries or automatic resume.
Real engine consumer remains unfinished; no launcher/mod changes or new game test.
Verification: `npm run check` passed all 284 tests. The initial full run exposed
Windows EPERM on atomic fixture replacement; the synthetic-file writer now retries
only bounded sharing contention. No gameplay-command retry was added.

### Earlier batches

Launcher 0.6.17 Debug cleanup: five primary guided/recovery/report actions;
individual experiments and maintenance collapsed under Advanced. Advanced and
repeat-start disabled while a guided batch owns the helper. Confirmation enabled
only at the expected stage; standalone diagnostic prompts no longer overwrite
guided instructions. Stop/helper exit reset these UI gates. Game/mod unchanged.
User's full guided run passed at 09:08 UTC: exact held/action update 2947,
control lock/restore and resume to 2951; report save confirmed in the log.
Launcher SHA-256: `ae8d61967b37e4934f264e154ae57eaa11c8d1d4eaf5cb21ede3822edf249f0d`.
No game launched. No new runtime test needed for this cleanup.
Verification: C# build succeeded; 277 automated tests passed. Happy-path bridge
fixtures now publish complete files atomically instead of accidentally racing
the reader with truncated observations. UI checks are source-level plus compiler
validation, not an interactive visual verification.

### Previous implementation batches

Guided local integration batch, launcher 0.6.16: existing bridge probe, exact
hold, one vehicle action, speed-control check and explicit restore/resume now
run as one guided session. Scalar evidence and user confirmation persist to one
JSON report. Failure/interruption does not retry or auto-resume. Other helper
diagnostics cannot interleave with the batch. Tests include the actual file bridge
with synthetic engine receipts. This is not the reusable multiplayer adapter;
its TF3 engine consumer remains outstanding. No game-side latches removed.
Mod content is unchanged from 0.6.15; no restaging required.
Verification: full `npm run check` passed 274 tests; launcher compiled as 0.6.16.0.
Launcher SHA-256: `3d37ec4880e33c3a3853239715e9faad5579d6463aefbc6f84257561760ae6b2`.
Source mod validation still yields `38dd22c8b3c95f51e6c1f3d3cd9919a0f847f19929947c4966fa270da0b0fd2c`.
No game launch or new TF3 runtime verification performed.

Larger asynchronous integration batch: receipt-driven participant, bounded
serialized file mailbox and optional coordinator all-released gate implemented.
Two/four synthetic-engine coordinator paths and real temporary-file handshake
are covered alongside uncertain execution, stale results and halt confirmation.
These are not yet connected to the mod's real engine handlers or Host/Join.
See async-coordination.md; no new launcher/mod build or manual test required.
Full regression result: `npm run check`, 259 tests passed (31 new tests).

User subsequently confirmed 0.6.15 visible speed-button restriction and
restoration (held 2916, resumed to 2921), and immediate unlock on orderly helper
stop while simulation stayed paused. Forced-crash/shortcut coverage is unknown.

### Previous 0.6.15 delivery snapshot

The user supplied a passing 0.6.14 combined test: exact hold and vehicle
application at update 2919, explicit release and progression to 2922.
Launcher 0.6.15 adds a temporary GUI speed-control restriction experiment,
session-bound acquire/restore acknowledgements, restore-before-resume gating,
and cleanup attempts on helper loss/UI unload. It does not set GameSpeedPause
or send speed commands from GUI. Runtime restrictions/cleanup remain unverified.
See speed-control-test.md. All remote gameplay remains disabled.

Verification: 228 automated tests passed; launcher 0.6.15 built; staged copy
matches source. No TF3 launch or runtime-control test performed by assistant.
Launcher SHA-256: `ff80572717e9d394975a6ca0e9fcdc13741b83138891f52c4491f752012d0135`.
Staged manifest: `38dd22c8b3c95f51e6c1f3d3cd9919a0f847f19929947c4966fa270da0b0fd2c`.
Previous mod/cache backup: `tf3mp_backup_d0716bf64eaa4995a3fbfdace32c53c3`.

## Historical batches (superseded where noted above)

Combined held-vehicle batch: exact hold passed in user logs at target=actual 2904,
fresh paused-event tick 57207, resume update 2909. Launcher 0.6.14 now enables
one owned vehicle action after a fresh exact hold. Version-2 local receipts,
pre/post live hold checks, schema binding, single-action latch and explicit
post-action release are enforced. This is action-inside-hold, not simultaneous
vehicle-and-pause execution, native-input prevention or remote gameplay.
218 automated tests pass; combined TF3 execution remains unverified.
Launcher SHA-256: `aefaffa422c0c8ecc08a7d44195fbeed1a7ac8f9af92bc49412461f1c7d2c581`.
Staged manifest: `0b7c8792dc14aea3e24b480a600a66d9da023bf3fcc8c12dc89464faf4d694d3`.
Backup: `tf3mp_backup_5faca6193b614d5dbdde4c77efbc2476`. No game launched.
See vehicle-hold-test.md for manual procedure and failure recovery.

Exact-update hold batch: user confirmed 0.6.12 immediate pause/event/resume at
held update 2879, paused-event tick 57181, then resume progression to 2883.
Launcher 0.6.13 adds a separate 40-update-ahead pause with early/late rejection
before mutation, explicit release and target/held comparison. No vehicle mutation
or native speed-control restriction was added. All 213 automated tests pass.
New launcher SHA-256: `b741b4307d2286200bb534fa4b10d1fc6d256bd1bc3c8002a182f3c97973bf55`.
Staged manifest: `efdd8ff9536704963012052f7440fe22427431bfbd5a959f47adf07e34aa14a8`.
Backup: `tf3mp_backup_7f0b2747b71346f8ba21bce209f8fad6`. No game launched.
Scheduled hold remains runtime-unverified; see pause-barrier-test.md.

Pause diagnostic batch: launcher 0.6.12 adds Test pause barrier and Release pause
test. Fresh solo-host admission isolation, saved pre-command attempt barrier,
pause/read-only-event/explicit-resume phases and strict receipts are implemented.
207 automated tests pass. Built launcher SHA-256:
`3bed73063a5de93665fa443131ae089736bf88b94f1e4eda5e20849e2771e12f`.
Staged manifest SHA-256:
`344c59c133f56b7e883f75e6c55d7ba0152b525afb984d1e5a0adaed3fc0759f`.
Prior mod/cache preserved in `tf3mp_backup_7f1ac3e6cb1e42f7a22616e19bf25c56`.
TF3 was not launched; runtime result is pending. This does not enable multiplayer
or ordinary-control interception. See pause-barrier-test.md.

The authoritative current phase/status/evidence ledger is [ROADMAP.md](ROADMAP.md).
Entries below are historical snapshots, not current release claims. Phase 1 now
has explicit model-participant hold/release checks and async-adapter rejection.
Native speed controls were audited; no real-game barrier or remote action path
was enabled. Direct placement and purchases remain outstanding.

Direct-depot groundwork: user chose creation for the second company, not depot
transfer. Added an engine-independent plan/quote/confirmation/result validation
contract with eight tests (185 total passing). It is NOT wired into TF3 or the
launcher yet; placement preview, engine execution, explicit funding, staging and
runtime validation remain outstanding. See direct-depot-placement.md.

Runtime accounting evidence: user supplied `finance_test_result: passed` at
update 2898, 19 September 07:34:30 UTC. Original company 3141 remained at
40,393,094 throughout; company 55652 changed 0 → 1,000 → 0. This supersedes the
historical unrun status below, but does not verify construction cost attribution.

Accounting batch: user confirmed separate company snapshots at update 2614
(3141: balance 40,397,153, 1 vehicle/1 line; 55652: balance 0, no assets).
Prepared launcher 0.6.11 opt-in +/-1,000 journal test for the created company,
requiring unchanged original finances and exact target restoration. The second
company has no depot, so actual vehicle purchases were NOT added. No depot is
transferred and no arbitrary amount accepted. All 177 tests pass; real accounting
test remains unrun. See company-accounting-test.md for limits and procedure.

Company inspection batch: user confirmed creation of company 56075 alongside
3141 at update 2556. Added separate read-only launcher 0.6.10 inspection of both
companies' balances and owned entity/vehicle/line counts, using the saved test
marker. No creation, transfers, purchases, control switching or finance writes
occur during inspection. All 169 automated tests pass; inspection itself still
needs runtime evidence. Company cost attribution and simulation remain unproven.

Company batch: explicit user requirement is one user per company, NO sharing.
Migrated host requests, owner resolvers, client queues and synthetic fixtures to
company entity ownership rather than connection-ID ownership. Added opt-in
launcher 0.6.9 company-creation experiment with admission isolation, expiry,
saved pre-mutation duplicate barrier and no retry. It does not switch company
control or test finances. Runtime remains untested; see company-test.md.

User runtime evidence at 22:10 UTC confirms passive pause/resume observations
for company 3141: paused updates 2503/2542/2554, resumed 2505/2544/2556; further
pause at 2566. This validates the observation fix, not an engine pause barrier.

Read-only engine-observation batch: inspected installed pause/clock/company APIs
and added isolated GUI snapshots plus strict helper-side parsing and passive
pause/resume observation. All 153 automated tests pass (including synthetic
mailbox observations). No game command, company creation or remote execution was
added. Real pause/resume observation and Teal runtime validation remain untested.
See engine-observation.md for the single manual check and static API evidence.

Participant batch: added the client-side prepare/commit/exact-update executor
contract, local checkpoint/ownership checks, host liveness, completion barriers
and permanent no-retry halts. Two/four participants complete consecutive commands
over encrypted localhost sockets using synthetic synchronous engine adapters.
The existing TF3 userdata bridge is asynchronous and is NOT connected to this
executor. No TypeScript migration, game launch, EXE rebuild or mod staging was
performed. Real pause barriers, company provisioning and recovery remain open.

Latest coordination batch: real laptop report run-6BgxTG passed five reconnects,
wrong control/save-key rejection, diagnostic gameplay denial, save verification
and final host health. Implemented a separate remote-session coordinator with
frozen roster/checkpoint readiness, all-participant prepare/commit/application
acknowledgments and latched halts on failures. Tested over two/four localhost
participant models. CLI remote gameplay remains gated: real engine adapters,
company provisioning and recovery are not implemented. See session-coordination.md.
Older entries below are historical snapshots.

Laptop LAN evidence: D:/report.json reported authenticatedConnection=true,
saveVerified=true, 87,416,354 bytes and SHA-256
e9498b04195652b1e0237fbfbd8d2fa081297ef868c03cf75806d57092bced9c,
matching the desktop host save. This establishes one real LAN diagnostic
connection/download, not gameplay or the laptop's game compatibility.
Portable laptop test 0.2.0 now batches reconnects, bad-key checks on control
and save endpoints, diagnostic gameplay denial, verified download and final
host health. 113 automated tests pass locally. The new batch has NOT yet been
run on the laptop. The desktop launcher and staged mod need no change for it.

0.6.8 batch: user confirmed scheduled Stop at 2603 and Start at 2818, with
matching target/actual receipts. Added 20/40/60-update presets (60 remains the
default and only user-tested delay), disable with outcome-unknown semantics,
busy-click dropping, clock-reset faulting, offline-check and copy-log controls.
109 automated tests pass, including synthetic outcome matrices for all presets.
Shorter-delay delivery and live disable behavior still need runtime testing.
This is local bridge progress, not verified multiplayer or production recovery.

0.6.7: the user confirmed real immediate Stop and Start with applied receipts
at updateCount 2523 (sequence 1) and 2633 (sequence 2) on 18 September. This is
the first confirmed local vehicle execution; it does not prove network sync.
Added a separate scheduled mode: GUI-only delayed event dispatch, engine-side
early/late rejection before mutation, and exact receipt matching in the helper.
No executable pending vehicle work is stored in a save. GUI next-step timing
and scheduled real execution remain unverified. See scheduled-vehicle-test.md.
Previous status sections below are historical.

0.6.6: 0.6.5 returned no_inspection after successful inspection; the Lua-local
handoff assumption was not valid. The current test is deliberately narrowed to
an IMMEDIATE single-host vehicle action in a fresh engine event, with matching
inspection receipt, ownership/revision recheck and a pre-mutation duplicate
barrier. No executable vehicle queue or cross-callback Lua authorization is
retained. scheduledUpdate=0 explicitly marks immediate execution. This is NOT
exact-update gameplay synchronization. 81 automated tests pass; in-game
execution is still unverified. See local-vehicle-test.md. All entries below
describe earlier revisions, not the current vehicle execution architecture.

0.6.5 follow-up: user proved vehicle inspection works, but commit acknowledgment
was absent beyond its scheduled update and the helper timed out. Reworked
the handoff to an update-consumed script-state inbox; removed dependence on
Lua locals shared across handleEvent/update callback contexts. Pending work
remains update-local; first update drops saved inbox data. Added queued and
explicit rejection receipts. Not runtime-verified. Earlier results below are
historical; they do not establish successful in-game vehicle execution.

Launcher 0.6.4 adds a disabled-by-default single-host owned-vehicle experiment:
custom vehicle-window click intent → engine ownership inspection → helper
authority approval → exact-update engine command → observed userStopped receipt.
Remote admission is blocked while enabled; no remote execution is connected.
78 automated Node/structural tests pass, including a synthetic mailbox exchange.
The new Teal UI/engine code has NOT been loaded or runtime-tested in TF3.
No Teal compiler was available for an independent compile check. See
`local-vehicle-test.md` for the disposable-save test and remaining risks.
The user has a laptop for future connection-only tests, unavailable today;
it cannot run TF3. Real two-game synchronization remains unverified.

The following paragraphs are historical checkpoints, not current implementation status.

Single-PC follow-up: the user reported exact-update successes at 2760, 2452,
3015 and 3256 and has no second machine. Added a real localhost integration
harness with 2/4 synthetic engine models and verified launcher-pipe shutdown
cleanup using spawned helpers. 69 automated tests pass. No new TF3 runtime
actions occurred. See `local-session-testing.md`; actual vehicle execution,
networked state comparison/recovery and multiple-game synchronization remain
unimplemented/unverified, regardless of these model successes.

Latest follow-up: the user supplied an actual successful engine receipt at
18:45:37.667Z (tick 56726/update 2438). The immediate simulation-thread test is
now confirmed. The next source revision adds an exact-update no-op scheduler,
strict receipt validation and a launcher Debug button. 66 tests pass. This is
the timing gate, **not** the owned-vehicle executor or working multiplayer.
Older status paragraphs below are retained as history.

The tables below are historical, not the current release status. User evidence
now confirms the status panel and helper↔GUI telemetry work. The 0.6.2 launcher
and staged mod contain a one-shot simulation-thread probe; the user explicitly
reported that it has **not been tested yet**. Gameplay writes remain disabled.
No game was launched by the assistant.

The current automated suite has 56 passing tests. The latest changes harden
host payload snapshots and the model execution queue (deadlines, gap/conflict
detection, capacity, immutable payloads, and authorization rechecks). The queue
is not yet connected to a TF3 gameplay executor. These changes modify helper
source/tests/docs only; the staged mod and compiled launcher need no update.

Still missing: runtime timing/pause proof, real company provisioning, in-game
ownership enforcement, the complete owned-action adapter, native-action
interception, live checkpoint comparison and recovery, fully automated save/mod
activation, and two-/four-instance game validation. See the current follow-up
in `reference-architecture.md` for why TF2 hooks cannot be assumed to work here.

Audit date: 2026-09-13. A green source/unit check is not treated as proof of
multi-PC gameplay. `Ready for review` means the artifact and procedure exist;
`passed` is reserved for recorded runtime evidence.

| Prompt requirement | Current evidence | Verdict |
|---|---|---|
| Standalone project, README, reproducible build/run | Project root, `README.md`, `package.json`, `Build-Launcher.ps1`, compiled launcher | Ready for review |
| TF3 script mod with visible panel, minimal persistent state, clocks, diagnostics | Five-file source mod; quiet game-bar React plugin; game script state and JSON diagnostics; static package validator; exact reviewed copy staged per-user | Panel runtime-confirmed; revised quiet build pending reload |
| Encrypted four-peer helper and host relay | Node built-ins only; localhost default; AES-256-GCM, bounds, rate limits, admission cap, TCP test, and encrypted host-to-client save pull | Helper tests pass; four physical machines and public Internet remain untested |
| Native bridge only if required, version-gated and non-overwriting | A documented userdata/custom-action script path is now identified for a no-op probe; licence review still does not grant native attachment permission; no native bridge exists | Correctly deferred unless the non-invasive probe fails and permission is obtained |
| Two-PC identical-save/company/action/hash proof | No two-PC TF3 run or evidence bundle exists | Missing |
| Automated serialization/order/dedup/schedule/hash/IPC/save-transfer tests and manual test | 30 passing tests; `docs/manual-smoke-test.md` | Automated loopback portion passed; multi-instance TF3 portion pending |
| Licence/security documents and exact build matrix | `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `SECURITY.md`, `docs/compatibility.md` | Ready for review |
| Four-player LAN scenario matrix | `docs/four-player-matrix.md` | Defined but entirely unrun |

## Gate audit

| Gate | Proof required | Authoritative current result |
|---|---|---|
| Reconnaissance | Installed API/licence citations and approach decision | Passed in `docs/feasibility.md` |
| Foundation | Source package, build guard, diagnostics, visible UI source | Static checks and exact staged-copy verification pass; controlled TF3 load is next |
| Transport | Authenticated bounded host/client exchange and ordering | Automated localhost test passes |
| Timing | Two untouched TF3 instances across pause and every supported speed | No runtime evidence |
| Company/authorization | Real distinct companies/balances and cross-owner denial | Helper model only; no TF3 evidence |
| One command | One owned action through complete TF3 pipeline | Documented userdata/custom vehicle-UI candidate identified; runtime probe and integration missing |
| Desync | Matching two-player then four-player state hashes | Canonicalizer unit-tested; runtime evidence missing |

## Immediate manual-review boundary

The current artifact has been staged and is ready for the controlled Safe Mode
load procedure in `REVIEW_CHECKLIST.md`. Staging was recorded at
2026-09-13T21:30:55.7943228+01:00; all 10 staged files matched the reviewed source
by path and SHA-256. TF3's validator was subsequently run and its first error was
repaired; the mod has not yet been loaded in a simulation. That review may prove
the panel, clocks, state persistence, diagnostics, and
disable/kill-switch behavior. It cannot prove multiplayer.

The end-to-end milestone cannot proceed without both:

1. a controlled manual enable/load of the staged source mod in a disposable save;
   and
2. a passing no-op test of the documented userdata boundary and GUI-to-game
   event ordering. A custom owned-vehicle action can avoid built-in UI
   interception for the narrow proof. If this non-invasive design fails, an
   applicable beta EULA review and vendor-supported alternative are required
   before considering any native attachment.
