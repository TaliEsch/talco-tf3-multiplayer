# Completion audit against the build prompt

## Ordered ROAD line source integration — 25 September 2026

The opt-in `road.line.create` source path now joins Host admission, queue owner
rechecks, engine mailbox, one-use held native line creation, callback identity
and held-world line/ROAD terminal/owner verification. Fourteen focused line
tests and the 48-file mod review pass. No target-owned two-stop line has been
created through this path in TF3, so this is model/source evidence only. The
full suite was attempted outside the sandbox; two native runtime observer
debugger fixture teardown tests failed reproducibly with target exit/Win32 121.
Those fixtures are outside the new line path. The local line runner remains
disabled until two target-owned station IDs are observed.

## Build 40401 no-hook diagnostic — 25 September 2026

The exact build-40401 executable loaded a separate diagnostic runtime through
the reversible two-DLL staging path. The one-use handoff selected the no-hook
branch after Steam relaunched the process without optional environment values.
The live trace reported `diagnostic-40401-no-hooks 0 0` and
`runtime-returned 10 0`; no probe, gate or server trace was created. No save was
loaded and no gameplay command ran. TF3 was closed, both hash-matched diagnostic
DLLs were removed, and the disposable source save remained
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
Private evidence: `reports/native-diag-40401-6c362928ca9047f4aee394cd4d385b7e/report.json`.
This qualifies the mapped image/post-update site only. Vehicle and callback
ABI, production hooks and funded purchase remain unverified on 40401.

## Build 40401 interrupted funded purchase attempt — 25 September 2026

The first disposable-save launch passed the build-40396 native gate but used
the staged mod directory as `--bridge-dir`; the game read the separate local
user data directory, so no bridge acknowledgement or gameplay command occurred.
The source save remained unchanged. On the corrected launch, Steam replaced
the executable during startup. The launcher rejected the changed image before
bridge connection or gameplay execution. The installed game now displays build
40401 and hashes to `6ABDEDD8FBBD3117FE909D8747BD2690A76B9098A251AABB1AE9BA6B4F9659CA`.
TF3 was closed, the 40396 loader was removed with its hash-checked unstage
script, and the source save still hashes to
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
The launcher now checks that the bridge directory is the local user data
directory paired with the exact staged mod manifest before starting TF3.
Hash-bound static disassembly found the previous candidate instructions at
the post-update loop, Stop factory/admission/send/callback and marshaler sites;
the bounded private trace is `reports/build40401-static-candidates-private.txt`.
These small windows do not prove surrounding semantics or callback/adapter
identity. Exact-build native and callback/adapter qualification is required
before another controlled purchase attempt. No funding, purchase or Stage 7
acceptance is claimed from these launches.

## Ordered vehicle purchase source checkpoint — 25 September 2026

Implemented an opt-in Host-ordered `road.vehicle.buy` path with a bounded model
intent, live depot ownership checks, one-use held native execution, deferred
callback handling and observed vehicle/owner/depot/balance receipt. The local
harness uses explicit receipt-verified funding, then orders depot build and
purchase in one game session; funding now retains its attempt latch across a
deferred callback. Focused tests pass and the 43-file mod review passes. A full
suite attempt could not complete cleanly: native fixtures encountered process
launch `EPERM` in this sandbox and the runner remained open after its last test
output. No TF3 purchase or funded coordinator transition is claimed. The next
controlled run must use a disposable save, record both sequences and stop on
any unknown outcome without retry.

## Held, ordered second-company depot accepted — 25 September 2026

The new callback lifecycle and six-field proposal adapter passed one controlled
build-40396 TF3 run. Host sequence 1 executed at held update 3066. The engine
receipt identified construction 8826, depot 73803, owner company 55652 and
native charge 314,650; the target company's observed balance was -314,650.
The separate GUI world readback returned `observed` for the same sequence and
update. Native terminal halt was confirmed. Private report:
`reports/local-batch-968a3554-6cd1-4e71-b3a4-7d3e6cf5ad6c/report.json`.
The source save SHA-256 remained
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`;
the game closed without saving and the loader was unstaged. This qualifies
one-game separate-company depot execution, not two-game synchronization or
other construction families. The immediately preceding run stopped before a
native send at `proposal_prepare` because the admission-only company field
reached the six-field proposal builder; private report:
`reports/local-batch-9aced017-025c-4e28-84cf-32c9b53c3770/report.json`.

## First held, ordered depot attempt — 25 September 2026

Commit `70b69e7` added a one-use ordered stock depot path and independent
held-world readback. The controlled build-40396 TF3 run used an unchanged
disposable source save, local company 3141 and mapped company 55652. Native
binding, held checkpoint and preparation succeeded. Host sequence 1 reached
scheduled held update 3058, but the engine execution receipt was `unknown`
at `native_attempt`. The helper confirmed a terminal hold and did not retry.
There is no accepted depot receipt or independent depot readback, so no
construction, ownership or debit claim. Private report:
`reports/local-batch-a62f0c62-194b-4728-9c8c-c67ffdbe58c7/report.json`.
The source save SHA-256 remained
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
Next expose the adapter's bounded native outcome code on unknown, inspect the
TF2 proposal path for required connected street payload, then decide the
smallest TF3 fix before another disposable attempt. The generic construction
path is still unqualified.

## Stock depot transform and seed — 25 September 2026

A protected optional read of the native construction proposal now copies a
bounded transform and seed without discarding the existing owner, resource and
cost facts if geometry is unavailable. One exact build-40396 TF3 run produced
two local company-3141 depot applies on an unsaved disposable world. Native
costs matched the two GUI debits: 454,977 and 449,160. Geometry was unavailable
for the first apply; the second apply exposed seed 1 and a 16-value transform,
including translation (-812.891541, -3142.25684, 23.3068237). The bounded
report parser returned `CREATE_AND_APPLY_OBSERVED` with eight construction
samples and zero rejected records. TF3 exited, and the source save SHA-256
remained `CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
These are local UI observations. No host-ordered, target-company or two-instance
depot result is claimed. The next test should compare the existing scripted
proposal to the concrete stock placement rather than guessing another location.

## Road depot construction diagnostic — 25 September 2026

The read-only `constructionBuilder` observer now emits a fixed, bounded native
proposal subset, and the report parser validates that subset only for the
construction builder. In one exact build-40396 TF3 GUI run, a local company-3141
Bullfrog Road Depot create/apply pair reported resource
`::/depots/road/road_depot/road_depot.con`, native cost 454,977, no critical
error and one apply result. The GUI balance fell by 454,977 and the depot detail
panel showed capacity 0/12 and $67,500 yearly maintenance. A prior diagnostic
run also placed an unintended maintenance building before the depot; both runs
were quit without saving. The disposable source save SHA-256 remained
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
These are local UI observations, not Host ordered construction or separate-company
proof. Sixteen focused tests, mod review and diff check passed. Stage 7 remains
open for depot ordering/replay, lines, vehicles, service costs and income;
two-instance proof remains deferred by the user.

## Sequential separate-company Stop driver — 25 September 2026

The existing one-engine coordinator driver now accepts two distinct Stop
intents and performs a new road preflight before each sequence. Its report
retains per-sequence preflights, native road postconditions and independent
readbacks. A file-backed adapter fixture exercises sequences 1 and 2 with
separate road/Stop IDs and cumulative target-company debits; another fixture
returns unknown on sequence 2 and confirms a terminal halt without retry.
The fixture results are supplemented by one exact build-40396 TF3 run from the
unchanged disposable source save (SHA-256
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`).
Fresh live preflights found public roads 53417 and 53419 for company 55652.
Host sequences 1 and 2 executed at scheduled held updates 3683 and 3757,
respectively. Native postconditions showed Stop 64470 on replacement road
49848 for a 46,348 charge, then Stop 9237 on replacement road 73899 for a
46,254 charge. The acting company's balance went from zero to -46,348 and
then -92,602. Both independent held-world readbacks returned `observed` at
their matching sequence and update. The second nonce-bound readback also
checked local company 3141 at balance 40,061,869. Native terminal halt was
confirmed. Private report:
`reports/local-batch-a7cecb6d-ec2a-4383-8491-5928d350d635/report.json`.
This is one real engine with a simulated participant. Stage 7 depot, line,
vehicle service and income, production socket admission, and two-instance
agreement remain unverified; the user has deferred two-instance testing.
The 20 focused driver/readback/outcome tests passed. `npm run check` did not
complete cleanly in the restricted shell: native Windows controller, IPC and
observer fixtures hit sandbox access failures, and the stalled run was stopped.
It is not a full-suite pass. TF3 became unresponsive at the quit menu after
the confirmed terminal halt, so its specific process was closed; the source
save hash above remained unchanged.

## Independent local-company economy check — 25 September 2026

For a separate acting company, the ordered Stop readback binds a paused engine
observation of the local company balance to the nonce-bound request and checks
that balance with a fresh game-side finance read. For a local-company action,
it uses the native post-Stop balance because the observation may precede the
action within that update. Distinct-company balance and mismatch fixtures passed;
18 focused tests passed and mod review accepted the revised source. The
sequential TF3 run above exercised this readback for a separate company; the
second receipt contained the local company's checked held-world balance.
Stage 7 service and income acceptance remains open.

## Successful one-engine separate-company ordered Stop — 25 September 2026

The local one-engine coordinator harness now assigns a road Stop to the
simulated remote player and target company; the preflight, proposal, held
execution receipt and independent readback all carry that company. The
readback keeps the selected local GUI company separate from the target company
and encodes negative balances as magnitude plus sign. Focused extension tests
passed 18/18.

In one exact build-40396 TF3 process, direct read-only game requests returned
nonce-bound receipts for local company 3141 and second company 55652 at
updates 3239 and 3240. Company 3141 had balance 40,229,553, five assets,
one vehicle and one line. Company 55652 was known, had balance 0 and no
assets, vehicles or lines. Road 53417 was `found` for company 55652, with
public owner 0 and revision 23. The source save SHA-256 remained
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
The private raw receipts are in `reports/remote-road-readonly-20260925/`.
The launcher session's stdin was closed, so this first run did not exercise
production Host admission or a paid action.

A following one-engine Host run admitted and prepared a simulated remote-player
Stop on public road 53417 for company 55652, but returned `unknown` at held
update 3078, stage `after_result_cost`. A separate read-only bridge inspection
at that update found company 55652 at -46,348 with two assets (from zero),
host company 3141 unchanged at 40,229,553, and source road 53417 missing.
The verifier had required nonnegative target balance even when TF3 made the
native debit. The unknown latch halted the game; this action was not retried
in that process. Its private report is
`reports/local-batch-c406b85f-9399-41a1-9f0b-714541dba1fe/report.json`.

After removing only that verifier restriction, a fresh load of the unchanged
disposable source save passed the complete one-engine ordered path. Host
sequence 1 was scheduled and executed at update 3076. TF3 returned Stop
72897, replacement road 73804, target owner 55652, native cost 46,348 and
target balance -46,348. The independent held-world probe returned `observed`
with the same sequence, update, entities, owner and signed balance before
release. The native terminal halt was confirmed. The report is
`reports/local-batch-09a10505-cd2b-46a7-b27a-d8d0bbba8742/report.json`;
the raw readback is private in `reports/remote-road-readonly-20260925/`.
The source save SHA-256 remained
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
The new receipt is real single-game evidence with a simulated participant;
there is no two-instance agreement claim. Focused verifier and executor tests
passed 25/25 and mod review accepted manifest
`5712434abaa0666289cde04d09b7e0082dcad124ad4d9802689aaf9e13036ab7`.
The full suite was run and failed in the five previously observed native
Windows debugger/controller fixture tests; the ordered-road focused tests
passed. Two-instance tests remain deferred by the user.

## Separate-company road ownership recheck — 25 September 2026

The game-side ordered Stop preparation and held execution now read the road's
`PLAYER_OWNED` component and reject a malformed owner or one outside the
public/target-company set. Execution rechecks after arming and before native
submission; an ownership change consumes the one-use barrier as `unknown`
without sending construction. Focused Fengari tests pass 13/13, including a
roster target company different from the local host company. Mod review
accepts the revised source. This change has not been exercised in TF3 and
does not prove separate-company gameplay or synchronized economy.

## Independent held-world road Stop readback — 25 September 2026

One build-40396 TF3 process loaded the disposable source save and Production
Host ordered one Stop on public road 53417 for company 3141. The host assigned
sequence 1 and scheduled update 3044. The held engine receipt reported a
successful native charge of 46348. Before release, an independent read-only
probe reported `observed` at update 3044: original road gone, exactly one
matching owned Stop 8919 attached to replacement road 8918, company balance
40183205. The coordinator released at update 3044, confirmed native terminal
halt and recorded `local_cycle_and_explicit_halt_passed` in
`reports/local-batch-c79d3a01-deab-46dc-9fe8-963d7360e2e5/report.json`.
The raw receipt is nonce and sequence bound. The source save SHA-256 remained
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
This is one real engine with one simulated participant; the report correctly
keeps `gameplayVerified` and `multiGameVerified` false. The first readback
attempt timed out due to GUI helper declaration order. A second returned
`unknown` because the probe queried a removed TF3 entity; a held-world
diagnostic proved the Stop existed and the corrected probe passed on the third
run. Neither failed attempt was retried within its game process. Real
two-instance comparison remains deferred by the user.
Focused readback and local-run tests passed 17/17, and mod review accepted the
exact staged manifest. The integration suite was run; native Windows
debugger/controller fixture failures remain, including detach and target
survival checks. No full-suite pass is claimed.

## Production telemetry road probe and local-run gate — 25 September 2026

With the production Host helper on exact TF3 build 40396, the revised GUI
telemetry route returned a nonce-bound `found` receipt for public road 53417,
company 3141, revision 23 at update 2955. A second read-only request for
entity 2147483647 returned `missing`, revision 0 at update 3083. No action
was submitted and the source save SHA-256 stayed
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
The controlled one-game ordered road runner now obtains and records the strict
bridge preflight before proposing its command; it fails without proposing on
an unavailable, mismatched or stale receipt. Seven focused local-run fixtures
pass. Host socket admission and accepted road execution were not exercised in
this read-only run.

## Read-only Host road admission preflight — 25 September 2026

Host road Stop admission now requests a nonce-bound, fresh TF3 road receipt
before sequencing. The game-side inspection reads the company, road,
occupancy, owner and revision without submitting a construction command;
Host rejects missing, stale and cross-company evidence. The production GUI
telemetry route is wired as well as the local watchdog route. In one real
build-40396 read-only trial, the watchdog route returned `found` for road
53417 and company 3141, with public owner 0 and revision 23 at update 3313.
The source save SHA-256 remained
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
The production telemetry route has not yet run in TF3; this trial does not
prove Host admission. Focused network, parser and mod-review tests passed
46/46. The elevated full suite still reports native Windows fixture failures;
the road preflight focused tests passed.

## Accepted road postcondition reporting — 25 September 2026

The single-game coordinator report now records the decoded, accepted TF3 road
Stop state: source and replacement road IDs, Stop ID, company, native cost and
company balance. The report refuses to advance an applied road command if
that correlated state is missing. Focused adapter and local-run fixtures pass
13/13. This logging change has not run in TF3; the earlier live report still
contains only its accepted state hash and update timing.

## Successful single-game Host-ordered road Stop — 25 September 2026

On exact TF3 build 40396, the production Host assigned sequence 1 to one road
Stop in a disposable source save. The qualified engine prepared it, executed
it held at scheduled update 3058, and returned a successful receipt containing
the Stop and replacement-road identities, charged cost and balance readback.
The coordinator released at update 3060 and confirmed its native terminal
halt. `reports/local-batch-8546e5a3-35da-47f3-b5b5-b0879cc964c0/report.json`
records the one-engine run and its exact update agreement. Focused road
fixtures and mod review passed. This is one real engine plus one simulated
participant; `gameplayVerified` and `multiGameVerified` are false. An extra
independent outcome probe returned `unknown` at `world_clock` because the
terminal park left game speedup at 1. TF3's later save stayed in progress and
the exact disposable game process was stopped; the original source save hash
remained `CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
Do not infer two-instance synchronization or a durable outcome save from this
run. The elevated full suite ran 1,021 tests: 1,014 passed, five previously
observed native debugger/controller fixture tests failed, and two were
skipped. The sandboxed suite attempt hit native-process permission errors and
was stopped after it stalled; it is not a regression count. The next
verification should capture an independent game-world postcondition before
terminal park, without repeating the accepted action.

## Callback treatment of reused road IDs — 25 September 2026

The saved Host-ordered outcome has the original road ID present as a non-road
entity. The callback verifier now rejects any remaining `BASE_EDGE` at that
ID, while allowing TF3 to reuse the ID for another entity. A focused fixture
accepts the observed reuse pattern and rejects a surviving road or
inconsistent removed-road component. The focused callback/executor tests
passed 14/14 and mod review passed. This revision has not run in TF3; the
previous `unknown` receipt remains unknown.

## First Host-ordered road Stop world outcome — 25 September 2026

On TF3 build 40396, the production Host accepted sequence 1 for a road Stop
and game preparation returned `ok`. The held game-side executor reached
scheduled update 3238 and consumed its one-use barrier. Its execution receipt
remained `unknown` with `held=false`; the coordinator reported
`ENGINE_OUTCOME_UNKNOWN` and did not retry. The preserved source save was
unchanged. A later read-only load of the separately saved outcome found one
matching Stop 73730 owned by company 3141 on replacement road 9075, with the
same source-road node IDs, endpoint positions and tangents. Company balance
was $40,183,205, versus $40,393,094 before the action. The world therefore
shows one paid Stop, while the production completion receipt does not prove
success. There is no two-instance evidence. The next build carries bounded
execution-stage diagnostics; focused tests and mod review pass, but that
diagnostic revision has not run in TF3. The elevated integration suite ran
1,016 tests: 1,009 passed, the same five native debugger/controller fixture
tests failed, and two were skipped. The sandboxed attempt could not launch
native fixtures and was interrupted after it stalled, so its failures are not
counted as regressions.

## Ordered road Stop execution wiring — 25 September 2026

Production Host now admits the bounded road action to its existing coordinator;
the legacy relay remains closed. The participant publishes read-only prepare
and then one held execution. The game-side road event rechecks roster company,
road, revision and model before consuming the barrier, snapshots the companies,
submits one native proposal and accepts only an observed Stop/replacement-road
and native-debit callback. The raw receipt is decoded into a state hash, with
unknown outcomes latched and no automatic retry. Focused model, mailbox,
authenticated Host admission and package-review tests pass. This is source and
mock evidence only: the modified code has not run in TF3, and no Host-ordered
road Stop or separate-company economy completion is established.
At this integration checkpoint the elevated full suite ran 1,014 tests:
1,007 passed, five native debugger/controller fixture tests failed and two
were skipped. Those five failures reproduce the previous suite's fixture
failures; the road-specific and affected source tests pass. The sandboxed
attempt also hit Windows process-launch `EPERM` across unrelated tests and
is not used as a regression count.

## Read-only ordered road Stop preparation — 25 September 2026

The participant can now issue one bounded road Stop `prepare` through the
existing mailbox. The GUI forwards its fixed fields to a separate game-script
event. That event checks the bound Host sequence, company roster, active lease,
live empty road, model lookup and road revision; it records an unknown receipt
before declaring read-only preparation `ok`. The live Host still rejects road
action admission, and the mailbox still rejects road `executeHeld`. Focused
fixtures and mod review pass, but TF3 has not loaded or executed this revision.
No road mutation, Host-ordered completion or multi-instance result is proven.

## Bounded road Stop order contract — 25 September 2026

The Host authority model and ordered queue now validate `road.stop.place`
against the exact seven-field TF3 road Stop capture: road and company IDs,
relative position, side, direction, fixed qualified model and bounded name.
The live Host returns `ROAD_STOP_ENGINE_UNAVAILABLE` before action admission
and sequence assignment. The engine mailbox has a bounded scalar encoding for
the exact fractional position and UTF-8 name; road execution publication
remains closed. Focused model, codec, Lua decoder and authenticated socket
tests verify the schema and closed production gate. This is offline transport
work only, not Host-ordered TF3 execution or a successful road Stop callback.

## Offline road Stop callback readback — 25 September 2026

The verifier now accepts an empty or partial callback entity vector only when
read-only engine state shows exactly one newly owned Stop of the requested
model, side and position on a replacement road with the source road's exact
node IDs, endpoints and tangents. It still requires a held update, the native
cost/debit and unchanged other-company balances. Contradictory callback IDs,
preexisting matching Stops and ambiguous geometry fail closed. This adapts
TF2's state-based street result lookup idea; no TF2 code was copied. Focused
fixtures passed 20/20 and mod review passed. This revision has not run in
TF3, and no host-ordered road Stop or two-instance result is claimed.

The matching Stop scan was narrowed to the selected road's exact geometry.
Other roads can already carry the same model at the same relative position;
one preexisting or ambiguous Stop on the selected geometry still rejects.
This refinement is fixture-tested only and does not change the real-game
evidence boundary above.

## Source/outcome road geometry correlation — 25 September 2026

In TF3 build 40396, nonce-bound read-only probes inspected the untouched
source save and the preserved road Stop outcome save. The source probe at
paused update 2903 found road 53417, no matching Stop, company 3141 and
balance $40,393,094. The outcome probe at paused update 2914 found exactly one
matching owned and attached Stop 73312 on road 73313 and balance $40,346,746.
Both roads have node IDs 53360 and 53273, endpoints
(-2115.46, -3421.99, 17.25) and (-2174.86, -3414.68, 17.0916), and the
same two tangents. TF3's `BASE_EDGE` exposes no `distance` field in these
worlds. Entity 53417 remains present in the outcome but has no `BASE_EDGE`
component. The prior `original_road_conflict` was an entity-ID reuse, not
contradictory road geometry.

This is real single-game evidence that the selected road acquired one Stop and
the native $46,348 debit. The callback still recorded
`ENGINE_OUTCOME_UNKNOWN` at `result_entities`, and this trial did not use host
ordering. Neither production completion nor multiplayer replay is proven.
Focused outcome tests passed 5/5 and mod review passed. Both save SHA-256
values remained unchanged: source
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`,
outcome `acdf349b352dc3ab4687dc152410aa9a11c00f84b7eb773880af4205dd55a1d0`.
TF3 exited without saving. The one-use requests and receipts were archived
privately, and the previous telemetry bridge was restored.

## Saved road Stop world readback — 25 September 2026

The preserved outcome save entered the TF3 build-40396 world on a second
read-only load. TF3 logged `Game is ready` and initialized in 26.58 seconds;
the GUI showed the paused world, company balance $40,346,746, and TF3MP
update 2914. The nonce-bound outcome probe ran once and returned `unknown`
at its combined `world` check. This is a genuine game-side refusal, not a
save-load stall or proof of stop placement. No construction command was sent.
The save SHA-256 stayed
`acdf349b352dc3ab4687dc152410aa9a11c00f84b7eb773880af4205dd55a1d0`.
TF3 exited without saving, and the one-time request was archived.

The read-only verifier now names the exact refusal point among world identity,
selected company, original road presence, paused clock, native balance and
original road conflict. A second one-use probe returned `unknown` at
`world_original_road`: entity 53417 still exists in the loaded save. A third
one-use probe continued through the checks and returned `unknown` at
`original_road_conflict`. It found one matching Stop with the expected owner,
model, parameters, road attachment, paused clock and native balance, but its
attached road was not entity 53417. The road ID may have changed or been
reused across save/load; that remains a hypothesis. The Stop cannot yet be
tied to the selected pre-action road, so this is not accepted construction
evidence. Compare stable road geometry and Stop presence in the untouched
source and outcome saves using read-only checks. Do not repeat the purchase.
The verifier fails closed and returns no raw world values. Focused tests
passed (4/4) and mod review passed. TF3 exited without saving after each
readback; the one-use requests were archived and the original bridge restored.

The full Node suite, run outside the sandbox with forced test-runner exit,
reported 989 tests, 982 passed and five failed. The same five native debugger
fixture tests failed when isolated: two multithread teardown cases, unowned
trap shutdown, four-thread action pairing, and stress detach. Earlier sandbox
`spawn EPERM` failures were environmental: the focused capture-file test
passed 7/7 outside the sandbox. The five debugger failures remain open and are
not road Stop acceptance evidence.

## Saved road Stop readback attempt — 25 September 2026

The strict result verifier now accepts the exact resulting stop ID from a
completed TF3 `Proposal.EdgeObject` when the callback's changed-entity vector
omits the stop; it still requires owner, model, road attachment, paused clock
and native debit postconditions. A separate read-only outcome probe checks the
preserved save against the original road ID, company, model, balance and
update count, then requires one unambiguous attached stop in TF3's street map.
Focused result/probe tests passed (7/7), and mod review passed. These are
model-tested changes, not yet real-game acceptance.

The outcome save was loaded in build 40396 for read-only inspection. The log
reached game UI recipe registration but stopped updating at `push() default
tool`; the loading screen remained visible, no fresh telemetry or probe receipt
was written, and the launcher session ended. The TF3 process was closed after
remaining active without a world view. No command was submitted. The one-time
read-only request was archived, the temporary native loader removed, and the
outcome save SHA-256 remained
`acdf349b352dc3ab4687dc152410aa9a11c00f84b7eb773880af4205dd55a1d0`.
Stop placement remains unverified. Diagnose the saved-world load and obtain
the read-only receipt before another purchase attempt.

## Build-40396 one-use road Stop engine outcome — 24 September 2026

The preparer now uses temporary object ID `-400000000` in the replacement
edge's `comp.objects`, matching the exact-build TF3 assertion range. Focused
preparer/result/dispatch/executor tests passed (15/15), and mod review passed.
In a fresh paused disposable-save run, the read-only receipt returned
`commandCode=prepared` for company 3141, road 53417, update 2914 and nonce
`6797d47bcfb914a31c4be3098378a7f4`. The road Stop GUI preview cost was
$67,500. One guarded local engine request was then submitted; this trial did
not exercise host ordering. Its receipt was `ENGINE_OUTCOME_UNKNOWN` at
`result_entities` (request 1, tick 58330, update 2914). Callback checks before
that stage passed: success, removal of the original road, positive native cost,
stable owner/clock, and balance matching the callback cost. Observed company
balance changed from $40,393,094 to $40,346,746, a $46,348 debit. The result
entity list did not qualify the expected new EDGE_OBJECT, so stop attachment
and ownership remain unverified. The one-use request was not retried.

The mutated world was preserved in a new disposable outcome save
`tf3mp_roadstop_outcome_6797d47bcfb914a31c4be3098378a7f4.sav` (SHA-256
`acdf349b352dc3ab4687dc152410aa9a11c00f84b7eb773880af4205dd55a1d0`).
The untouched source save still hashes to
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`.
TF3 exited and the temporary native loader was removed. Next inspect the
preserved poststate read-only and qualify the callback entity-list semantics;
do not repeat this uncertain purchase.

## Build-40396 read-only road command conversion — 24 September 2026

After the prior `.mdl` resource lookup failure, the guarded preparer validated
the visual model and passed the observed placed construction resource
`::/stations/street/small_stops/small_mid.con` to TF3's edge-object converter.
Focused preparer/result/dispatch/executor/review tests passed (38/38), as did
`node src/cli.mjs review --path mod`. In a fresh paused disposable-save TF3
run, company 3141, road 53417 and nonce
`f30e600d671bd7e6fc1d554f705cbb2f` reached read-only command preparation
at update 3026. The receipt returned `code=unknown`, `stage=command`; no
guarded request was submitted. The game log twice reported the exact assertion
`EdgeObjectEntityToIndex: entity.GetId() <= -400000000 &&
entity.GetId() > -500000000`. The preparer had used TF2's `-1` object
reference in the replacement edge; TF3 rejected that temporary object ID.
This does not verify that the `.con` resource is accepted after the ID is fixed.
The preview cost was $67,500, but no stop or native charge was observed. TF3
was closed without saving, the source save SHA-256 remained
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`,
and the temporary native loader was removed. Qualify the temporary object-ID
mapping before another TF3 run; road placement and economy remain unverified.

## Build-40396 replacement-edge linkage trial — 24 September 2026

The TF2 implementation adds `{-1, stop side}` to the replacement edge's
`comp.objects` as well as declaring the new edge object. We adapted that
linkage in the TF3 simple road Stop preparer, with no copied TF2 code.
Focused preparer/result/dispatch/executor/review tests passed (38/38), and
package review passed. This is a shape correction, not gameplay proof.

One fresh paused disposable-save TF3 request for company 3141, road 53417,
nonce `1c0916288d2a9bc553aaeb185c1f997f`, and update 2973 reached the
callback. It returned `ENGINE_OUTCOME_UNKNOWN`, `stage=result_road` at tick
57867. The original road remained, the balance stayed $40,393,094, and no
stop was visible after closing the preview. The game log reported `Couldn't
find resource for edge object`, naming
`::/stations/street/small_stops/small_mid.mdl` at 22:14:54 UTC. The request
was not retried. TF3 exited without saving, the source save SHA-256 remained
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`,
and the temporary native loader was removed. The model/resource conversion
in the TF3 command is the next concrete failure to isolate. Road placement,
charge, and host ordering remain unverified.

## Build-40396 guarded road Stop result — 24 September 2026

One paused disposable-save command attempt reached TF3 with a qualified
pre-action receipt for company 3141 and untouched road 53417. The GUI preview
cost was $67,500. Receipt nonce `4ab543991b2615e4c1bc0222faa32525`
returned `ENGINE_OUTCOME_UNKNOWN`, `stage=result_road` at update 3230:
the callback reached postcondition checking, but the original road entity
still existed. The company balance remained $40,229,553 and no Stop was
visibly placed. The one-use latch was retained and the request was not
retried. The source save SHA-256 remained
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`;
TF3 exited without saving and the temporary native loader was removed.

A separate fresh paused read-only run rejected before submission at
`commandStage=model` when an unverified `modelRep.getName` lookup was tried.
That lookup was removed. The current preparer validates the UI model alias
with `modelRep.find` and sends its relative resource path, but the guarded
run above did not establish an applied stop or charge. Inspect the actual
callback command result and replacement-road entities before another game
attempt; no host-ordered road/economy result is verified.

## Build-40396 road Stop snapshot qualification — 24 September 2026

Two further paused disposable-save TF3 runs used the same untouched road
53417, company 3141 and $67,500 GUI preview. The bounded first receipt
(`07676268c30d74bf51654f7697216d4a`, update 2914) rejected before
submission with `BEFORE_SNAPSHOT_UNQUALIFIED`, `stage=players_fetch`: the
engine-side `getEntitiesWithComponent(PLAYER)` call threw. A guarded trial of
TF3's documented `forEachEntityWithComponent` fallback also failed before
submission (`9b73b5d5572db1fd43e0b6083bcb527f`, update 2939,
`stage=players_iterate`). The ineffective fallback was removed from source;
the bounded stage diagnostic remains. Both runs left the $40,393,094 balance
and source save SHA-256
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`
unchanged. TF3 exited without saving and the native loader was removed.
The next step is to establish which entity-read APIs are available in this
game-script callback, then form a fail-closed ownership/economy snapshot using
actual TF3 evidence. No road Stop was submitted or placed by these runs.

## Build-40396 guarded road Stop admission — 24 September 2026

A new disposable-save command bridge accepts one nonce-bound, confirmed
simple Road Stop request and routes it through the existing one-use replay
executor. Focused tests and package review pass (23/23). Two paused TF3 runs
on the same untouched save returned `commandCode=prepared` for company 3141,
road 53417, and a $67,500 GUI preview. The first engine-side request returned
`REPLAY_PREPARATION_UNQUALIFIED` before command submission. A second run with
bounded pre-send diagnostics returned `BEFORE_SNAPSHOT_UNQUALIFIED`,
`stage=players` at update 2998. Neither request submitted a world-build
command or placed a stop; company balance remained $40,393,094. The second
receipt used nonce `ce138d66336833add53915e78039591a`. TF3 exited without
saving; the source save SHA-256 remains
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`.
The temporary native loader was removed. Player enumeration in the read-only
before-snapshot is the next failing link. Focused tests passed 24/24. The full
suite ran with native-fixture process permissions: 977 passed, 5 native
controller/observer fixture tests failed, and 2 were skipped (984 total).
Those failures are outside the changed road path. No host ordering,
construction, native charge or separate-company economy is proven by these
runs.

## Build-40396 road command value qualified — 24 September 2026

The subsequent `tf3mp_road_stop_simple_result.lua` adapter is offline code
only. Focused Fengari tests cover a successful callback with one owned new
stop, replacement road, native cost and exact company debit, plus mismatched
callback, ownership, road, model, clock and balance outcomes. It has not been
connected to engine submission or checked in TF3; these tests cannot establish
construction or economy behavior.

Two controlled paused, read-only Road Stop previews used the disposable save,
company 3141 and untouched road 53417. The first receipt (nonce
`9e2e170acffb289d8a1c40a5c9270a69`, update 2987) showed the factory's
`nodeConfigsToAdd` and `nodeConfigsToRemove` are both dense arrays of two;
the previous empty-array guard rejected at `factoryNodeConfigsAdd`. The
preparer now validates the two removed endpoint IDs and their two replacement
configs, then passes the factory values to `SimpleStreetProposal`. The second
receipt (nonce `5619dbafacdf61ec0b00f018f0f305d1`, update 3154) returned
`code=shape, commandCode=prepared, commandStage=none`, with one added and one
removed segment, temporary edge -1, and both node-config arrays of length two.
The game's Road Stop preview showed $67,500. Neither run submitted a command,
placed a stop or incurred a charge. TF3 exited without saving, the original
save SHA-256 remained
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`,
and the temporary native loader was removed. The next proof is guarded engine
acceptance, host ordering, exactly-once execution and observed construction
and native charge. Separate-company economy remains unverified.

## Build-40396 factory-field diagnostic — 24 September 2026

A paused, read-only Road Stop preview on the disposable save returned
`code=shape, commandCode=rejected, commandStage=factoryNodeConfigsAdd` at
update 2957 for company 3141 and untouched road 53417 (nonce
`be81e28bca9c8df9c92dfb9db1e557f6`, observation 1). The replacement
factory reported one added segment, one removed segment and temporary edge
-1. Its segment, node and edge-object array checks passed before the
`nodeConfigsToAdd` guard rejected the value. The receipt does not establish
whether that field was absent, wrapped or nonempty. No command was sent, stop
placed or charge incurred. TF3 exited without saving; the source save SHA-256
remained `ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`.
The temporary exact-build native loader was removed.

## Build-40396 read-only road command probe — 24 September 2026

The next paused disposable-save session verified the rejection-handler fix in
TF3. At update 2922, company 3141 and untouched road 53417 produced a
nonce-bound shape receipt (`8fa3a7330eb146ecaeb1c1fe9a4df292`, observation
1) with one added segment, one removed segment and temporary edge -1. The
preparer returned `commandCode=rejected, commandStage=factory`, so the handoff
no longer throws. The normal Road Stop preview showed $67,500, but no stop was
placed and no command was sent. The save hash remained
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`;
TF3 exited without saving and the temporary native loader was removed. The
factory rejection now has bounded per-field diagnostics for the next controlled
read-only run. Engine command acceptance and ordered replay remain unverified.

In a fourth paused disposable-save session, the production diagnostic passed
preparer lookup and returned `code=unavailable, field=preparerCall` at
observation 1, nonce `c4529558aea03f8031fe3766fe0a527b`. No command was
sent and no stop was placed. The original save hash remained unchanged. An
offline review found that the preparer's rejection handler called `rawequal`
outside its protected call; a missing `rawequal` would escape there. The
handler now uses table identity, with a focused regression test. This is a
candidate explanation until checked in TF3.

Three controlled paused disposable-save sessions attempted to qualify a simple
Road Stop command value without submitting it. The first observed the untouched
road and replacement factory shape but confirmed that the stock preview omits
the model identity. The second used the model resource observed from one normal
placed stop on this same save; the pre-action receipt was only `unavailable`.
A bounded-stage diagnostic in the third session recorded
`code=unavailable, field=preparer` at observation 1, nonce
`11e2b1b2616190569b83b8cf73ca7ee5`. Request, paused clock, player,
unoccupied road and replacement-shape checks all preceded that stage and passed.
This localizes the current failure to the handoff to the simple command
preparer; it does not show that TF3 accepted or executed a command. No stop was
placed in these preview sessions. TF3 exited without saving, the disposable
save SHA-256 remains
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`,
and the temporary exact-build native loader was removed. The next step is to
split preparer lookup, call and result diagnostics, resolve that boundary
offline where possible, then qualify command construction in one game.

## Build-40396 pre-action road and model identity — 24 September 2026

One controlled, paused disposable-save run connected the production bridge and
captured both sides of a single normal Road Stop placement. Before the click,
the new read-only probe recorded company 3141, untouched road 53417, update
2889, one removed segment, one added temporary segment -1, and zero objects on
that new segment. After exactly one click, the production readback at the same
update recorded owned stop 72432 on road 72438 at road-relative parameter
0.9667200446128845, with construction resource
`::/stations/street/small_stops/small_mid.con`. The model diagnostic reported
model ID 3940 and `::/stations/street/small_stops/small_mid.mdl`. Both receipts
used the same private run nonce. The game preview cost $67,500, and the visible
account changed from $40,393,094 to $40,325,594. The original save retained
SHA-256 `ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`;
TF3 exited without saving and the hash-matched native loader was removed.
This verifies the read-only pre-action factory shape and post-action model in
one TF3 process. It does not qualify the simple command's acceptance, Host
ordering, native replay charge or two-instance economy agreement.

## Offline simple road-stop preparation — 24 September 2026

A guarded command preparer now uses the declared TF3 `SimpleProposal` records
with the segment from `replaceSegment`, one `SimpleStreetProposal.EdgeObject`,
and company-bound command context. It checks a paused game, existing player and
empty road, exact one-segment replacement, valid model resource, and consistent
temporary and removed edge IDs. It creates a command value but never submits it.
Focused preparer and review tests pass 19/19, and mod review passes. This is
offline model evidence only: pre-action factory shape, actual model resource,
engine command acceptance, Host ordering, charge and postcondition are unverified.

## Build-40396 replacement factory confirmation — 24 September 2026

Two further paused disposable-save runs placed one $67,500 Road Stop each,
without saving either result. In the first, the production bridge wrote an
explicit `sourceMissing` probe diagnostic. Inspection showed that the bridge
rejected TF3's valid negative temporary proposal entity ID. After correcting
that signed-ID validation, the second run wrote the production road-stop
readback and a matching read-only `replaceSegment` diagnostic at observation 5:
one segment added, one removed, zero top-level edge objects, temporary added
segment ID -1, and one object on that added segment. The account visibly fell
from $40,393,094 to $40,325,594 for the one placed stop. This confirms the
factory's shape in one real TF3 process; it does not establish a replay recipe,
host ordering, duplicate suppression for construction, or synchronized economy.
The original save still has SHA-256
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`.
TF3 exited and the temporary native loader was removed. Focused readback tests
passed 20/20, mod review and `git diff --check` passed. The full suite was not
run because this is a diagnostic checkpoint rather than an integration milestone.

## Replacement-proposal diagnostic checkpoint — 24 September 2026

A further paused build-40396 disposable run returned a production road-stop
readback for company 3141, stop 72962 on road 73667 at update 2970. The first
click placed a stop for $67,500; a second click at the same position caused a
$16,875 replacement. The read-only `replaceSegment` probe did not produce its
separate diagnostic file, so no replacement recipe or replay is qualified.
TF3 exited without saving; the disposable save SHA-256 remained
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`,
and the temporary loader was removed. The bridge now forwards only bounded
probe scalars and writes an explicit `sourceMissing` or `bridgeMissing` code if
one side loses them. Focused readback tests and mod review pass. This bridge
change has not yet been verified in TF3.

## Build-40396 road-stop readback checkpoint — 24 September 2026

The updated executable SHA-256 is
`086d69c141acaac1016e942beac28f469da0c5cb2de4b7f4c6f0d3fd7fd75dc1`.
The exact-build native loader, probe and vehicle gate started in one TF3 process;
the startup receipt files reported `runtime-loaded 0 0`, `probe-result 0 0`,
and `vehicle-gate 0 1`. This qualifies that narrow native startup on 40396,
not all gameplay adapters. The loader was removed after each disposable run.

The unchanged save `tf3mp_disposable_43b49d368fbbd409ae2614ada7b0c757`
loaded with bridge connected and company 3141. While paused, a normal Road
Stop appeared on the selected road, with its $67,500 charge visible. A second
click on the same location also caused a $16,875 replacement; neither action
was saved. The save SHA-256 remained
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`.
The engine readback reached `constructionResourceSyntax`; a missing bounded
diagnostic was traced to the engine-to-panel bridge dropping the value. After
the bridge fix, a real TF3 readback receipt at observation 3 captured
`::/stations/street/small_stops/small_mid.con`, TF3's base-game resource
namespace. Lua and JS readback validators now accept that exact namespace
shape with the existing path bounds and traversal rejection. Focused tests pass.
One further paused build-40396 run placed one Road Stop, charged $67,500, and
returned `COPIED_PLACED_OBJECT_ONLY`. The production envelope parser accepted
the complete readback with company 3141, stop entity 68677, attached edge
73200, update 2983, two tagged parameter entries, and digest
`9bebfc252de29d442276dc29ec87eb9670468c61818349d48838a8fcc1c6b6a7`.
Its `executionAuthorized` flag remained false. The game exited without saving,
and the original disposable-save hash was unchanged. This proves a bounded
single-game post-placement snapshot, not replay. Native road proposal capture still
reports missing `modelInstance`, `edgeEntity`, `param`, and `model`. No ordered
road-stop replay, economy synchronization, or two-instance gameplay is proven.

## Current milestone boundary — 24 September 2026

The user moved two-instance tests out of stage 6. The corrected one-game
host-ordered vehicle Stop on build 40392 meets the revised stage-6 checkpoint:
native cancellation, Host sequence 1, one held execution/release at update 3428,
and the observed Stopped postcondition are recorded below. This is **6/10 for
that milestone**, not proof of playable multiplayer. Road/economy expansion,
current-build qualification, synchronized two-game gameplay and four-player
acceptance remain open. Historical entries using the old stage-6 definition
are preserved as dated evidence, not current milestone claims.

## TF3 updated during the one-game Host attempt — 24 September 2026

The reviewed mod was staged with manifest
`baa8263d7bd30d9f77d9705b23feab248fd89c9ccd7e6e295f2261afa99451f8`;
the prior staged mod/cache was preserved at
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_5bb7588cb97f4cb781f5cec3841a38bb`.
The exact-build loader staged after checking executable SHA-256
`cbd8092757e539a42f56c51e00eeb7671d967a9072838d7a5f47d2de88348716`.
Steam then replaced `TransportFever3.exe` at 16:23:12 UTC during the Host
launch. The game displayed build 40396; its new on-disk SHA-256 is
`086d69c141acaac1016e942beac28f469da0c5cb2de4b7f4c6f0d3fd7fd75dc1`.
The WinHTTP proxy loaded the in-process runtime, whose probe returned status 2
(`UNSUPPORTED_EXECUTABLE`) before native IPC opened. The launcher consequently
reported `NATIVE_RUNTIME_CONNECT_FAILED` and ended the Host session. This is a
successful fail-closed build gate, not a replay-record result. The intended
disposable save reached TF3's Start Game screen, but no gameplay action was
performed and no capture or stop readback was attempted. The game process was
closed, the hash-checked native loader was unstaged, and the save retained SHA
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`.
Native offsets and hooks for the previous executable must not be used on 40396.

### Read-only build-40396 native-site sweep

The hash-pinned PE disassembler inspected the new executable without loading or
modifying it. It found matching instruction shapes and, where checked, matching
bytes at these **candidate** RVAs:

| Site | Build-40392 RVA | Build-40396 candidate RVA | Static evidence |
| --- | ---: | ---: | --- |
| Stop factory capture | `0x9ef122` | `0x9ef132` | `mov ebx,r8d`, followed by the `0x32` Stop tag and construction call |
| Stop factory post | `0x9ef198` | `0x9ef1a8` | NOP after the construction call |
| Admission | `0xe2ad4c` | `0xe2ad3c` | `mov rdx,rbx` before indirect callback call |
| Send return | `0xe2ad52` | `0xe2ad42` | NOP after indirect callback call |
| Callback tail | `0xe3e824` | `0xe3e814` | Same `E9 C7 BB FE FF` jump to continuation |
| Callback continuation | `0xe2a3f0` | `0xe2a3e0` | Continuation function entry |
| Marshaler return | `0xe11a27` | `0xe11a17` | NOP after call; following `rdx` load matches old window |
| Post-send body | `0xe1bb58` | `0xe1bb48` | NOP after send call; call bytes match old window |
| Post-iteration observer | `0x159571` | `0x159561` | Complete 12-byte increment, compare and backward branch window matches |

These are location leads, not exact-build qualification. The new executable
still needs callback/vtable and adapter identity checks, complete controller
and gate-site review, executable-specific guard updates, owned fixture checks,
and a controlled single-game readback before any hook is enabled. The stage and
loader remain pinned to the old SHA and reject 40396.

A separate hash-pinned scan of non-executable PE sections found the candidate
callback invoke pointer at `0x373fa80` pointing to `0xe3e810`, implying a
candidate callback vtable at `0x373fa70`. The previous callback vtable was
`0x373fa90` with invoke at `0xe3e820`. Adapter tables at `0x367cb20` and
`0x367cc00` now point to candidate `0x1201a0`; `0x367cc38` points to
`0x120410`. Two nearby matches each remain for the former `0x36cab88` and
`0x3788880` adapters. Static pointer proximity does not establish which live
callback shape is used, so those guards remain unresolved.

## Four-company Host/Join socket integration — 24 September 2026

A focused real-socket test now admits the authenticated Host-local participant
and three Join peers, receives three separate company claims, checks the mocked
TF3 roster inspection, binds companies 101–104, and attaches the Host's deferred
engine adapter with that four-company mapping. The adapter receives the capture
event. This verifies the production socket/roster/attachment wiring against a
fake bridge and engine adapter. It does not verify TF3 identity inspection, Join
engine adapters, gameplay, or two-instance synchronization.
The focused socket/readback tests passed 40/40, and mod review passed with
manifest `baa8263d7bd30d9f77d9705b23feab248fd89c9ccd7e6e295f2261afa99451f8`.
The elevated full suite reported 963 tests: 957 passed, five existing native
controller/observer fixture failures remained, and one was skipped. Its private
log is `C:\Users\olihf\Downloads\Temp\tf3mp-check-20260924-roster-readback-elevated.log`.

## Single-game road-stop experiment — 24 September 2026

One qualified build-40392 TF3 process loaded the unchanged disposable save
`tf3mp_disposable_43b49d368fbbd409ae2614ada7b0c757` with the reviewed mod.
The bridge observed company 3141 at update 3015 and paused speed 0. The live
`road-replay-record` command returned `FRESH_SOLO_HOST_REQUIRED` before any
placement because the production Host's authenticated local participant was
mistaken for an extra player. The helper now requires exactly that local player,
no remote players, a ready native gate, and a lobby coordinator. Focused tests
cover remote, wrong-player, missing-player, held, and native-gate cases; this
repair has not yet been rerun in TF3.

In the same loaded world, one normal roadside stop produced eight `create`
samples and one `apply` sample from `streetTerminalBuilder`, with no observer
errors. The owner was 3141, proposal cost was $67,500, and the displayed
account changed from $40,229,553 to $40,162,053. A stop icon appeared on the
selected road. Both capture diagnostics remained `CAPTURE_UNSUPPORTED`:
`modelInstance`, `edgeEntity`, `param`, and `model` were absent; `oneWay` was
boolean and `name` string. This matches the earlier documented schema gap;
do not repeat the same placement or infer a replayable resource/position. An
independent readback found the placed, company-owned edge object and its road,
but returned `READBACK_UNAVAILABLE` at `constructionResource`; it did not export
a complete stop recipe. The read-only collector now distinguishes absent,
non-string, empty and malformed resource values in its bounded failure field;
focused Lua fixtures and mod review pass, but this diagnostic has not run in
TF3. No replay case or second-company service was created.
TF3 was closed without
saving, the source save still hashes to
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`,
and the exact hash-matched native loader was unstaged.

The installed API describes a simpler `SimpleStreetProposal.EdgeObject` with
road-relative position, side, model resource, owner and name. Its edge must be
a replacement in `edgesToAdd`, so a current road entity ID is insufficient.
The readback now probes `MODEL_INSTANCE_LIST` only when the construction name
is nil and copies one model ID/resource name into a private diagnostic only if
the model list is unambiguous. It still returns `unavailable`, never an
execution-authorized recipe. The panel persists that bounded observation for
one TF3 run. Focused native-readback/review tests passed 35/35 and mod review
passed with manifest `fc0596a58425f7b7d0b62c04e7b91b2f0e13d5cccfcc67e723404a6529ddad6f`.
No TF3 run has tested the new probe or the SimpleProposal route.

## Two-instance trial deferred; one-game work continues — 24 September 2026

The user directed us to skip the two-instance TF3 attempt until they say to
resume it. The existing same-profile second launch left only one game process.
This does not count as a two-game test; under the revised milestone boundary,
that test is later acceptance for the full multiplayer goal.
Host action admission now records each authenticated peer's last accepted
update beside the Host update, once per request. A focused socket test proves
an ahead peer produces the trace and still halts with `CLOCK_MISMATCH`; no
clock gate was relaxed. Work continues on the one-game separate-company road
and economy path without another same-profile launch attempt.

The local normal road-stop replay's dispatcher, preflight, preparation and
result modules now use protected native calls instead of requiring Lua
`function` types for TF3 API bindings. Callable-proxy fixtures pass and missing
bindings still fail closed. Mod review passed for manifest
`9873c7204bb16ef51a4f1f3b55c937848d336e521df7248cb6dfc8194ad710b5`.
This is source/fixture evidence; no new TF3 placement or replay occurred.
The elevated full suite on the settled source reported 960 tests: 954 passed,
the same five native controller/observer fixture failures remained, and one
was skipped. Its private log is
`C:\Users\olihf\Downloads\Temp\tf3mp-check-20260924-replay-proxy-elevated.log`.

## TF2 action-path comparison and production Stop lead — 24 September 2026

The sibling TF2 multiplayer mod's actual capture/cancel, inject, semantic
schedule, saved-vehicle mapping, history, pacing and replay paths were traced;
`docs/tf2-baseline.md` records exact source files and TF3 decisions. Its
strict originator replay and future-step scheduling principles fit the
existing TF3 Stop path. No TF2 source or build-specific native constants were
copied. Production Host Stop now uses a 60-update lead and 30-second
coordination timeout, consistent with the earlier TF3 single-game result
(`proposedUpdate=3368`, `scheduledUpdate=3428`, measured 5.29 updates/s,
applied after 12.38 seconds). Focused socket/adapter tests pass; the schedule
has not yet been tested with two TF3 instances.

The integration suite after the Stop timing change reported 955 tests: 949
passed, five pre-existing native controller/observer fixture failures remained,
and one was skipped. The private log is
`C:\Users\olihf\Downloads\Temp\tf3mp-check-20260924-tf2-stop.log`.

## Production two-instance trace — 24 September 2026

The Host logs accepted `peer_checkpoint_ready`, `peer_command_applied` and
`peer_barrier_released` records by authenticated player ID. The production
adapter logs only accepted engine operation receipts; checkpoint evidence
includes update, hash and coverage, while execution evidence includes the
actual observed vehicle entity, owner, Stop state and state hash. An engine
receipt that arrives before the held observation is confirmed is not logged as
accepted. The diagnostic serializer was found to drop several new correlation
fields; its bounded event-specific allowlist now preserves them and a focused
serialization test verifies the emitted JSON. Focused socket and adapter tests
passed. No new real-game or
two-instance result is claimed; the trace is prepared for that run. The full
suite again reported 954 tests: 948 passed, the same five native controller/
observer fixture failures remained, and one was skipped. Its private log is
`C:\Users\olihf\Downloads\Temp\tf3mp-check-20260924-trace.log`.

## Host roster inspection — 24 September 2026

Production Host capture now checks two to four distinct claimed company IDs
against one nonce-bound, paused game-side inspection before it binds players.
The Host's live player must match the chosen host company; each requested
company entity must exist with a `PLAYER` component. The launcher supports
the corresponding roster capture for two to four save-ready participants.
Focused tests passed 35/35, mod review passed with manifest SHA-256
`3503c5e70956e6056f95097e12d534cbee806a490b6da15339f02f2628b0d7c4`,
and the launcher built. A read-only disposable-save TF3 build-40392 run
returned `VERIFIED` for host company 3141 and second company 55652 at game
update 3063, tick 57442. The bridge recorded `gameplayVerified=false`;
no remote peer or action was exercised. TF3 closed without saving. The source
save SHA-256 remained
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`.
Three/four-company evidence is model-only. Two-instance baseline and ordered
action agreement remain open. The full suite reported 954 tests: 948 passed,
five previously recorded native controller/observer fixture failures remained,
and one was skipped. No new roster test failed. Its private log is
`C:\Users\olihf\Downloads\Temp\tf3mp-check-20260924-roster.log`.

## Join company proposal to two-company capture — 23 September 2026

The Join helper now sends one authenticated selected-company proposal only
after save readiness and a paused live engine observation. The Host retains it
as unverified until its fresh game inspection matches the fixture's second
company; a mismatch binds no player. The Host/Join launcher controls expose
these steps. Focused network and mismatch tests pass; the launcher compiles.
No new TF3 or two-instance result is claimed. This still does not admit three
or four companies. The elevated integration run reported 949 tests: 943
passed, five previously recorded native controller/observer teardown fixtures
failed, and one skipped. Its private log is
`C:\Users\olihf\Downloads\Temp\tf3mp-check-20260923-company-claim-elevated.log`.

## Qualified Host/Join launcher wiring — 23 September 2026

The launcher Host/Join buttons previously omitted required native credentials.
They now invoke an exact-build runner that checks the staged loader hashes,
creates one native handoff, launches TF3, and passes the native pipe/token and
selected save's bridge directory to the production CLI. Join first performs
the authenticated save preparation. An existing TF3 process prevents another
launch, and only pre-bind pipe connection refusals are retried. The launcher
compiled and focused UI tests passed. In a disposable-save TF3 run on exact
build 40392, the Host runner passed native capability binding, opened the
authenticated save server on TCP 37334, connected the live bridge at update
2846, reported `host_listening` for session `launch.check.2`, and received
the host-local save-ready receipt for SHA-256
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`.
TF3's HUD showed the bridge connected. No vehicle command or remote peer was
attempted. Steam restarted the launched TF3 PID, so the first runner attempt
mistook that PID exit for game exit; the runner now checks the actual process.
The helper stopped; its wrapper then retained an open stdin listener, now
closed in source after helper exit. That shutdown change is not retested in
TF3. The game closed without saving, the staged loader was removed, and the
disposable save hash stayed unchanged. This is one-game Host startup proof,
not Join or multi-instance proof.
The integration suite reported 947 tests: 941 passed, five failed and one
skipped. The five failures are the previously recorded native controller and
observer fixture cases; the launcher tests passed. The private full-suite log
is `C:\Users\olihf\Downloads\Temp\tf3mp-check-20260923-2058.log`.

## Join save-before-launch path — 23 September 2026

The Join CLI now offers `prepare-join`: it downloads the authenticated Host
save into the Join save directory, checks its identity, and creates an exclusive
disposable copy and one-use startup-load request before TF3 starts. Production
Join requires `--prepared-save` and verifies that direct, regular file against
the Host's admitted bytes/hash before sending `save_ready`. The two-instance
plan lists this preparation step. A local encrypted save-server → CLI →
startup-request integration test passed, as did the focused Join/bootstrap
tests. This verifies file transfer and admission plumbing, **not** that a
second TF3 process loaded the copy or agreed on a checkpoint. The full suite
was run and still exited with five previously recorded native controller and
observer fixture failures; no new Join test failed. The real two-instance
baseline and action remain open.

The acceptance planner now emits the same explicit destination IP for Join
save preparation and Join command traffic, with an explicit Host bind IP.
Focused planner tests pass; no remote network or second TF3 run has occurred.

## Corrected ordered Stop and halt check — 23 September 2026

**Single-game pass:** Exact TF3 build 40392 (SHA-256
`cbd8092757e539a42f56c51e00eeb7671d967a9072838d7a5f47d2de88348716`)
loaded the disposable save. The production Host and bridge observed moving
Road Vehicle 1, entity 66005, owned by company 3141, with Stop flag 0. One
native Stop invocation was armed at update 3361, clicked within the 5000 ms
window, and cancelled at update 3368 while the vehicle still moved. Host
sequence 1 was scheduled for update 3428; one game-side held-action receipt
and one release receipt reported update 3428 (update error 0). TF3 then
visibly displayed the vehicle **Stopped**. The native terminal gate parked;
the report records `local_cycle_and_explicit_halt_passed`, `haltState=confirmed`,
and `haltSource=native_terminal_parked`. The private report is
`reports/local-batch-41003023-d3bb-43cd-9296-a2acb821f0f6/report.json`.
The disposable source save retained SHA-256
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`;
TF3 closed without saving and the exact loader was unstaged. This verifies
the corrected halt completion in one TF3 process. It does **not** verify two
real games: `realEngineCount=1`, `simulatedParticipantCount=1`,
`gameplayVerified=false`, and `multiGameVerified=false` remain correct. The
next critical action is two-instance checkpoint and action agreement with
separate companies. The latest full suite before this run had five existing
native controller/observer fixture failures; it has not been rerun for this
documentation-only update.

## Latest terminal-halt integration attempt — 23 September 2026

**Single-game evidence:** On exact build 40392, one owned moving vehicle Stop
was natively cancelled; host sequence 1 had one held-action receipt and one
release at scheduled update 3210. TF3 showed Road Vehicle 1 Stopped. The
native `terminal_parked` event followed, but the local report was
`STOP_NOT_VERIFIED`: the prior runner waited for a Lua halt receipt after the
engine was already parked. The adapter now distinguishes the typed native
terminal event from the game mailbox halt, with a disconnect/unknown latch.
Focused adapter and coordinator tests pass 12/12. **The corrected completion
path is not yet verified in TF3.** The full suite completed with five native
controller/observer fixture failures; the changed adapter tests passed.
Two further disposable runs missed the
five-second native Stop arm and captured no action; the later failure also had
an unknown native terminal outcome. No mutation was retried. The source save
still hashes to `ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`;
TF3 is closed and the loader unstaged. The native-park report is
`reports/local-batch-3aa08784-1ef2-4228-9c58-564ca6026bdc/report.json`.
This remains one real game plus a receipt mirror, not two-game synchronization
or playable four-player co-op.

## Build-40392 ordered Stop checkpoint — 23 September 2026

**Single-game result:** An exact-build TF3 run on executable SHA-256
`cbd8092757e539a42f56c51e00eeb7671d967a9072838d7a5f47d2de88348716`
used the disposable save and production Host/native/bridge path with one local
receipt mirror. The GUI guard admitted exactly one armed Stop click for the
selected moving vehicle (entity 66005, company 3141). The callback diagnostic
recorded `submitted`, `used=1`, `everUsed=1`. The native cancellation receipt
confirmed invocation 1 while the vehicle remained moving. Host sequence 1 was
scheduled for update 3114, applied at update 3114 with one held-action receipt,
and released at update 3114. The report outcome was
`local_cycle_and_explicit_halt_passed`; TF3 visibly showed the vehicle
**Stopped** after replay. This is one real game and one simulated receipt
participant, so `gameplayVerified=false` and `multiGameVerified=false` remain
correct. The native gate timed out waiting for a separate terminal event after
the local pass checkpoint; it fail-stopped without retry. That terminal-gate
failure needs investigation before broader synchronized gameplay. The source
disposable save retained SHA-256
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`;
TF3 closed without saving and the exact loader was unstaged. The private
machine report is `reports/local-batch-e5675a93-acc1-427a-9b6a-d646ec2c0ade/report.json`.
The mod review passed with manifest SHA-256 `1f57ab421fb7acc0b28dbc4dbd3edc7edfeaad7116c684b69d2ad3df300eb7af`.
The full suite under native fixture access ran 941 tests: 935 passed, five
failed and one skipped. All five failures were in the previously failing
native controller/observer fixture group; none concerned the ordered Stop path.
The next critical milestone is a second real TF3 process with separate-company
checkpoint and Stop agreement; four-player readiness is not established.

## Build-40392 single-game Stop attempt — 23 September 2026

**Observed in TF3:** the exact-hash loader and production Host native gate connected, and the live bridge issued an owner/prestate receipt for moving Road Vehicle 1 (entity 66005, host company 3141). Two fresh disposable-save trials clicked Stop 284 ms and 319 ms after the native arm. Both arms expired; the vehicle continued moving. The second trial's native counter deltas were zero at all eight observed sites, including command factory and admission. No cancellation receipt, host sequence, held replay receipt, or stopped postcondition exists. The helper halted rather than retrying. The disposable save hash remained unchanged; the loader was removed. This is one-game failure evidence, not a Stage 6 pass or multi-instance evidence. The next critical action is to identify and qualify the actual build-40392 Stop command path, then repeat the ordered Stop integration test once.

## Latest Stage 6 attempt — 23 September 2026

**Single-game result:** an earlier run on executable hash `297ef05b...` reached
the native cancellation arm, but its five-second window expired without a Stop
click. Another run recorded a read-only vehicle-owner receipt ahead of the GUI
observation; the bridge now waits within its existing deadline for the GUI clock
to catch up. A subsequent trial started against that qualified hash, but the
installed executable changed to
`cbd8092757e539a42f56c51e00eeb7671d967a9072838d7a5f47d2de88348716`
before host startup. Its native IPC pipe was absent. No Stop click, host order,
held replay or changed vehicle postcondition was observed in these attempts.
The hash-matched loader was removed, and the disposable save was unchanged.
The launcher now rechecks the executable before host startup. Focused tests for
the local cancellation and coordinator path passed 20/20, and the mod review
passed. The full suite was attempted but did not complete; its native fixtures
reported failures and a later test stalled, so there is no full-suite pass to
claim. The two-instance path remains untested. **Stage 6:** open.

## Previous-build one-use Stop cancellation — 23 September 2026

**Single-game verified:** the exact-build native runtime was requalified for
TF3 executable SHA-256
`297ef05b740de1a3c4b375fd53ca69f371347a4b1546a37525f04aab6bc8e6e6`.
The first two fresh disposable trials armed Stop but expired with zero claims;
diagnostics showed an admission and callback but no factory receipt. The
candidate factory produced command tag `0x30`, so disassembly selected the
actual Stop tag `0x32` factory/post sites. The corrected runtime passed its
owned smoke tests before another live attempt.

Road Vehicle 1, entity 66005, was moving in the fresh disposable world. One
armed Stop click completed cancellation for invocation 1. Factory, admission,
callback, send return, marshaler return and correlated post-send-body each
reported one hit for that invocation; no candidate was dropped. The callback
result was zero, and the UI subsequently showed the vehicle still moving at
25 km/h. The native gate also completed hold, release, re-hold and detach.
TF3 exited without saving; the staged hash-matched loader was removed and the
source disposable save still hashes to
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
The live-checker focused tests passed 10/10. The full integration suite exited
nonzero with five previously recorded native controller/observer debugger
fixture failures; the new checker tests passed in the full run. A sandboxed
first attempt also failed process-spawn tests due to fixture permissions and
was stopped; the normal-access full run is the integration result.
No Host CLI action request, host ordering, held replay, second instance or
cross-instance postcondition was exercised in this live run. **Stage 6:** open.

## Native Stop trial interrupted by TF3 update — 23 September 2026

**Current failure:** the staged loader was qualified for executable SHA-256
`a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`.
Steam replaced `TransportFever3.exe` at 13:43:57 UTC with SHA-256
`297ef05b740de1a3c4b375fd53ca69f371347a4b1546a37525f04aab6bc8e6e6`.
The subsequent TF3 process loaded the known disposable save with its helper
offline; the native IPC pipe never appeared, consistent with exact-build
qualification refusing the changed executable. No Stop was clicked and no
native cancellation, host ordering or held replay occurred. The process exited
without saving, the disposable save retained SHA-256
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`,
and the staged files were removed by the hash-checked cleanup script. A fresh
staging attempt rejected the new build. The live checker now verifies the
staged executable hash before launch and on IPC startup failure; focused tests
passed 14/14. New-build native site qualification remains required before a
real Stop trial. **Stage 6:** open.

## One-game native/checkpoint composition — 23 September 2026

**Single-game verified:** after an initial native-loader staging miss and a
second attempt that exposed a competing `bridge.lock`, the corrected diagnostic
used one bridge owner in the exact-build TF3 process. With the disposable
two-company world running at normal speed, production-scope checkpoint capture
and release both reported update 3008 and matching hash
`b16495ef803db37fa459df18bb50980d67d5ae574e19a7ca75989989517185d1`.
The native observer correlated 131 advancing public ticks/updates, then a
generation-zero terminal halt parked the world at tick 57302/update 3010 while
control traffic remained responsive. This is evidence of a checkpoint and
terminal halt in one process, not a synchronized two-player hold or action.
The game was closed without saving; after its terminal park, Return to Desktop
did not exit the game, so the verified test process was stopped. The source
save SHA-256 stayed
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
The three hash-matched application-local loader files and session handoff were
unstaged. Focused tests passed 15/15 before the final live run. The full
integration suite exited with the same five native controller/observer
teardown fixture failures reported at the previous milestone. No native
cancelled Stop, host ordering, held replay, remote peer, or second game instance
was exercised. **Stage 6:** open.

## Native cancelled Stop routed to host action path — 23 September 2026

**Implemented and model tested:** a one-use explicit host command requires
qualified native cancellation capability, matching invocation and passive
completion evidence, and an unchanged engine Stop flag before sending one
authenticated host-local `action_request`. It waits for matching coordinator
completion and halts on uncertain submitted outcomes. Focused tests passed
40/40. The full integration suite reported 932 cases: 926 passed, 5 failed,
1 skipped; the failures are existing native controller/observer teardown cases.
No loader-backed TF3 cancellation, host capture, held replay, or second game
instance was tested with this path. **Stage 6:** open.

## Running owner proof — 23 September 2026

**Single-game verified:** the read-only targeted owner request for entity
66005/company 3141 was issued at running TF3 update 3140, answered by the
engine at 3142 and observed at 3143. The bounded proof window is model tested;
paused lookup remains exact, and `executeHeld` still rechecks owner at the
scheduled update. No native loader, host action, second instance or synchronized
postcondition was exercised. TF3 exited without saving and the disposable save
SHA-256 stayed `CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
**Stage 6:** open.

## Targeted owner proof at host admission — 23 September 2026

**Implemented and model tested:** a targeted read-only engine receipt binds
vehicle entity, company, nonce, request ID and update. The host reserves action
admission while obtaining that proof, then checks the authenticated company and
same host update before assigning a sequence. The production Host CLI requires
the native gate for this path. **Single-game verified:** paused TF3 reported
vehicle 66005 owned by company 3141 at update 2998 and rejected a query for
company 55652. The game exited without saving; the disposable save SHA-256
remained `CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
No native loader, host action execution, second instance or synchronized
postcondition was tested in this run. Focused tests passed 33/33 and mod review
passed. The full integration run reported 926 cases: 920 passed, 5 failed,
1 skipped; the five failures were older native controller/observer teardown
cases. **Stage 6:** open.

## Live read-only company and vehicle receipts — 23 September 2026

**Single-game verified:** the ordinary TF3 executable loaded the known
disposable two-company save. At paused update 3075, the Node bridge received
a correlated company inspection naming engine entities 3141 and 55652.
Vehicle discovery timed out because the GUI mod dispatched that read-only
request only in vehicle-test mode. Moving it into common dispatch and staging
the reviewed mod produced a fresh paused-update-2962 receipt for owned
vehicle 66005, company 3141, followed by the same two-company inspection.
The game was closed without saving; the disposable save retained SHA-256
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
Focused tests passed 11/11 and mod review passed. No native loader, host
capture, multiplayer action ordering or second game instance was exercised.
**Stage 6:** open.

## Host local capture composition — 23 September 2026

**Implemented and network tested:** the host local adapter can wait for an
authenticated `coordination_capture` frame before construction, receive its
verified two-to-four-company map, and process the capture first. The host
capture entry point enforces verified save readiness and a registered local
participant. The Host CLI now has a one-attempt manual capture path for the
saved two-company test fixture. Its read-only inspection receipt, paused
update, authenticated roster and native gate must agree before either company
is bound. The capture command remains mock-mailbox/network tested; only its
underlying read-only company receipt was exercised in TF3. Arbitrary
three/four-company admission is still missing. Focused tests passed;
the full integration run reported six native failures and did not exit after
all 921 cases were reported. **Stage 6:** open.

## Read-only vehicle ownership bridge — 23 September 2026

**Implemented and mock-mailbox tested:** the Node bridge can issue one paused,
nonce-bound vehicle discovery request and accept only a fresh engine receipt
for the same company and update. It rejects missing, foreign, malformed and
stale evidence and removes the request. The source mod already produces this
receipt. This bridge path has now returned a paused TF3 receipt, but has not
been bound to host membership or connected to command ordering. **Stage 6:**
still open.

## Host clock composition — 23 September 2026

**Implemented and focused-tested:** the production Host CLI passes a live
bridge update count to HostAuthority and SessionCoordinator, with an invalid
clock when the bridge is missing or stale. Each accepted network request uses
one sampled host update throughout its authority and coordination checks.
This closes the previous zero-valued scheduling default in the Host CLI. It
does not provide engine verified company membership or vehicle ownership,
native intent routing, or a live host ordered replay. **Stage 6:** still open.

## One-use cancellation trial — 23 September 2026

**Implemented and owned-tested:** a default-disabled one-use native arm,
distinct failure-completion shim and read-only vtable, bounded authenticated
host IPC request, pointer-free diagnostics, and fail-closed validation of the
entity, stopped flag, callback and submission adapter. The runtime provider is
wired only when the passive observer starts. Static EH4 review covers ordinary
C++ exception cleanup at the original indirect call; asynchronous SEH behavior
is outside that finding.

**Single-game verified:** one disposable-save Road Vehicle 1 Stop claimed the
arm once for entity 102852/stopped 1. The callback and Lua marshaler returned
0, normal send return and one correlated post-send-body receipt followed, and
the UI still showed the vehicle moving at 35 km/h. The gate held, released,
re-held and detached. A prior arm timed out before any click and claimed
nothing. The original save hash stayed unchanged and staged loader was removed.
This establishes one bounded local cancellation with visible UI recovery.
**Stage 6:** not achieved; host ordering, replay and multiplayer exactly-once
application remain unverified.

## Invocation-correlated seventh-site trial — 23 September 2026

**Implemented:** bounded passive admission-to-post-send-body correlation by
thread, expected caller RSP and unique invocation token. Authenticated IPC
exposes a copied scalar receipt; the generic post-send counter remains only a
diagnostic. **Isolated/model-tested:** nested and concurrent frames, wrong
thread, duplicate/generic hits, stale frame reuse, slot overflow and teardown;
native builds and focused IPC/client/checker tests passed 31/31.
**Single-game verified:** a fresh disposable load reached action readiness;
one stock Road Vehicle 1 Stop produced one each of the six earlier receipts
and exactly one correlated post-send-body receipt. Admission, send return and
post-send tokens were all 1; the latter carried entity 102852, stopped 1 and
thread 31916 matching the vehicle invocation. The generic seventh-site count
rose from 579 to 4,700, as expected for a busy common path. The checker then
held, released one boundary, re-held and detached the native gate and exited
successfully. TF3 was closed without saving and the hash-matched loader was
removed. Original `[R2] SV20.sav` retained SHA-256
`cbbc1a4642734600e9e9c994a6b0be7e014c20c097b418752642e5157f402f7c`.
After rebuilding stale native fixtures, the elevated full suite discovered
912 tests: 906 passed, 5 failed, 1 skipped. The five failures are the same
three controller and two observer out-of-process debugger teardown cases.
**Limits:** this covers one normal completion in one game. Exception
unwinding, cancellation, host ordering, replay, two-instance, cross-machine,
four-player and Internet tests remain open. **Stage 6:** not achieved.

## Seventh-site generic continuation trial — 23 September 2026

**Implemented:** exact-build passive `0xe17838` post-send-body trap and raw
count/thread over authenticated IPC. **Isolated/model-tested:** owned
seven-site trap, byte-window and teardown smoke; four native builds passed;
focused IPC/client/checker tests passed 30/30 with child-process permission.
**Single-game verified:** fresh disposable load reached world observation hit
132; one stock Road Vehicle 1 Stop gave factory/admission/correlated/callback/
send-return/marshaler-return counts 1/1/1/1/1/1, with matching storage and
expected entity 102852/stopped 1. The UI showed Stopped. The new generic
post-send-body counter advanced **555 to 6,346** during the 80.7-second
action window; its latest thread was not the vehicle admission thread. Thus
the raw seventh-site observation is **not** correlated cleanup proof for that
Stop. The checker failed `PASSIVE_VEHICLE_POST_SEND_BODY_NOT_EXACTLY_ONCE`;
that assertion has been removed pending invocation correlation. The checker
shut down the native runtime, the game's Return to Desktop UI hung, and the
exact verified test process was stopped without saving. The loader was
hash-verified and removed. The original save SHA-256 remained
`cbbc1a4642734600e9e9c994a6b0be7e014c20c097b418752642e5157f402f7c`.
The elevated full suite again reproduced the five older debugger teardown
failures; it is not green. **Two-instance, cross-machine, four-player and
Internet:** unperformed. **Stage 6:** not achieved.

## Fresh-process six-site live evidence — 23 September 2026

**Implemented:** unchanged six-site passive observer and authenticated native
IPC. **Isolated/model-tested:** direct post- and vehicle-observer smoke builds
passed. **Single-game verified:** a fresh TF3 process loaded the disposable
save once; one stock Road Vehicle 1 Stop produced one each factory, admission,
correlation, callback, normal send return and marshaler return. Storage
identities matched; the admission progress was empty; the UI reached Stopped.
The world observer reached 128 hits without its cross-thread flag; the gate
subsequently held, released one boundary, re-held and detached. TF3 exited
normally without saving. Original save SHA-256 stayed
`cbbc1a4642734600e9e9c994a6b0be7e014c20c097b418752642e5157f402f7c`;
the staged loader was hash-verified and removed. TalCo was not active in that
save, so no game-side clock/bridge correlation was measured. **Two-instance,
cross-machine, four-player and Internet:** unperformed. **Stage 6:** not
achieved; the stock Stop was applied directly by TF3, without suppression,
host ordering or replay. The earlier same-process reload failure remains a
separate unproven thread-migration hypothesis, not contradicted by this fresh
pass. The prior full-suite result was 906 passed, 5 failed, 1 skipped; no new
full-suite claim is made here.

## Six-site qualification increment — 23 September 2026

**Implemented:** passive normal-send and marshaler-return diagnostics, their
authenticated IPC/client fields, and an optional live-checker assertion for
one correlated completion. **Isolated/model-tested:** owned trap/restore
fixture and focused native IPC/checker tests. **Single-game verified:** the
earlier four-site Road Vehicle 1 Stop and fresh-sample gate pass only; neither
new return site has live proof. The first six-site game run failed before any
action-ready boundary: after a world reload in one process, native observer
hits did not advance while public tick/update advanced 3,422. No vehicle
action was taken in that run. First-thread-only native hit accounting is a
specific lifecycle hypothesis to test. The exact disposable process was
closed without saving and the loader unstaged. **Two-instance, cross-machine,
four-player and Internet:** unperformed. **Stage 6:** not achieved, because
there is still no verified local suppression, host ordering and exactly-once
game application of a real action.

Final integration builds for native runtime, vehicle observer, IPC and
in-process runtime succeeded. The full elevated regression after rebuilding
the stale controller fixture discovered **912 tests: 906 pass, 5 fail, 1
skip**. Failures remain three out-of-process native-controller teardown cases
and two out-of-process native-observer trace/stress teardown cases; this is
not a green suite. The original save hash remained unchanged and the staged
diagnostic loader was removed. No launcher or mod source changed in this batch.

## Single-game native callback and speed-1 gate — 23 September 2026

**Implemented:** four-site exact-build passive native observation through a
callback wrapper; copied scalar callback/admission identity over authenticated
IPC; explicit normal-speed guard and failure diagnostics in the live gate
checker. The active TalCo mod produced fresh public engine observations.
**Isolated/model-tested:** owned observer smoke, native runtime build, focused
IPC/checker tests (28/28 and rebuilt 19/19). **Single-game verified:** one
stock Road Vehicle 1 Stop action gave factory/admission/correlated/callback
counts 1/1/1/1, entity 102852, stopped 1, callback storage match, entry
result byte 0 and callback result byte 1. The UI initially showed Stopping.
The observed callback is before Lua target validation, so completion remains
unproved. A separate normal-speed gate-only run held, released one native
boundary and public tick/update, re-held, detached and resumed. **Two-instance,
cross-machine, four-player and Internet:** not performed. **Multiplayer action
interception, replay, separate-company economy and recovery:** not implemented.

The first action run's later public-clock assertion failed at saved 4x speed;
native release/re-hold passed, but one native hit had not been qualified as one
public update at that speed. Its checker shutdown deliberately fail-stopped the
still-active gate, so the exact disposable game process was terminated.
The gate-only 1x rerun passed and TF3 exited normally. Neither result proves
2x/4x synchronization. The original source save SHA-256 remained
`cbbc1a4642734600e9e9c994a6b0be7e014c20c097b418752642e5157f402f7c`;
the staged loader was hash-verified and removed after each run. No original
save or game binary was overwritten.

A third disposable run confirmed one stock road-vehicle Stop with the same
one-for-one native observations, an empty admission progress pair and matching
admission/callback thread 37136. Its subsequent speed-1 hold check failed:
the public update advanced 1037707 → 1037708 while native boundary hits stayed
fixed. This remains an open engine-halt correctness finding, not a passing
trial. The UI quit command stalled with the terminal park active; the exact
test process was terminated and the loader hash-verified/unstaged.

Follow-up identified that the checker had treated five reads of one periodic
game-side observation file as five independent stable samples. With fresh
producer-counter checks and exact +1 public-clock assertions, a subsequent
speed-1 gate-only disposable run passed: held 1207524/1037489, re-held
1207525/1037490, native boundary hits 260 → 261, then detached/resumed
1207527/1037492. This narrows the earlier failure to a checker/sample timing
problem, but does not prove the combined action/gate path or higher speeds.

After rebuilding the shared-header-dependent native fixtures, full elevated
`npm run check` reported **911 discovered, 905 passed, 5 failed, 1 skipped**
(109.239 seconds). The five known out-of-process debugger fixture teardown/
target-survival failures remain open; the full suite is not green. This is
approximately **5.9/10** readiness, below stage 6. Next implementation is
callback/progress/exception qualification, confirmed native suppression, then
Host/Join ordering, exactly-once application and two-instance checkpoint
agreement. There is no established external implementation blocker.

## Second live passive admission trial — 22 September 2026

Implemented: read-only result-byte and callback-shape diagnostics in the
exact-build native observer, authenticated IPC and strict JavaScript consumer.
Isolated/model-tested: observer/runtime native builds and smoke tests passed;
29 focused elevated tests passed. Single-game verified: one stock Train 1
stop gave factory/admission/correlated counts 1/1/1, dropped 0, entity
163575, stopped 1, result byte zero and expected callback vtable/invoke
shape. The stock vehicle panel displayed Stopped. The native world gate
held/released one boundary/re-held/detached. Two-instance, cross-machine,
four-player and Internet verification: **not performed**. No interception,
authoritative ordering or replay was implemented or verified.

Verification qualification: the initial restricted full suite encountered
`spawn EPERM` in child-process tests. With process permissions, two affected
CLI test files passed 14/14. The full permitted suite failed five existing
native debugger-fixture cases; focused repetition passed 25/30 and reproduced
those same five failures. Three reject emitted teardown diagnostics on stderr;
two report target-survival/restore failure (1067/121). The suite is **not**
green. A single isolated action-trace rerun also failed with Win32 access
denied (5) while suspending owned fixture threads; its exact orphaned
`--fixture-action-trace` process was identified and stopped. The optional mod
bridge was stale in the first live trial; its checker
correctly returned `GAME_BRIDGE_OBSERVATION_UNAVAILABLE`. The second
native-only trial passed; do not infer game-bridge clock correlation from it.
Follow-up inspection of the game's log found TalCo staged on disk but absent
from that disposable save's active-mod list (only the two DLC packs were
active). This explains the stale producer data; it is a setup failure, not a
failed mod clock. Recheck active mods before repeating bridge correlation.
TF3 closed normally. The staged loader and exact disposable copy/preview
were removed after hash checks; original save and preview hashes matched.
Readiness is approximately **5.8/10**, below the stage-6 authority gate.

## Owned cancellation fixture — 22 September 2026

Implemented and isolated/model-tested: the x64 MOV-site cancellation mechanism
in `native/owned_vehicle_cancel_fixture.*`, built by
`Build-OwnedVehicleCancelFixture.ps1`. It is deliberately not linked into the
production observer or advertised to Host/Join. The fixture proves a callback
can replace an owned indirect submission target while preserving RDX, using
the original CALL and restoring normal behavior on sequential teardown. It
does not prove TF3 callback ownership, UI completion, native exception safety,
production teardown, or any network-ordered vehicle action. Readiness remains
5.7/10 until the real path is integrated and observed.

## Live stock vehicle-action audit — 22 September 2026

The full goal remains active. Single-game verification now includes a passive
stock Train 1 stop action in the disposable TF3 world. The exact-build observer
reported factory/submission/correlated counts **1/1/1**, no dropped candidates,
entity **163575**, stopped **1**, `crossThread:true`; the world observer ran on
thread 28196 and the latest action site on thread 18796. The controlled gate
then held/released one boundary, re-held, detached and resumed. This is real
native command observation and real engine control, but no mutation was
suppressed or host-ordered, no native replay receipt exists, and no second
TF3 instance was compared. The separate first attempt expired without an
observed factory hit; it is not counted as a pass.

The in-process observer, IPC snapshot and client validation are implemented;
the source and owned native fixture/build passed. Full `npm run check`:
**909 discovered, 879 passed, 0 failed, 30 skipped** (54.244 seconds).
Single-game action and gate: verified. Two-instance, cross-machine,
four-player/Internet: unperformed. Original `[R2] SV20.sav` retained SHA-256
`cbbc1a4642734600e9e9c994a6b0be7e014c20c097b418752642e5157f402f7c`.
The exact nonce-tagged disposable save/preview/request and three hash-matched
staged loader files were removed after the game closed. Readiness is **5.7/10**.

Still required before 6/10: safe command suppression/defer, same host ordering
for host and clients, exactly-once TF3 application, correlated postconditions,
and two-instance comparison where the environment permits. This is engineering
work, not an external blocker; no gameplay family is yet synchronized.

## Production boundary-control audit — 22 September 2026

The full objective remains incomplete and active. This batch crosses the native
control threshold but not the multiplayer-action threshold.

Implemented and single-game verified:

- exact-hash/site/mitigation-gated in-process TF3 boundary ownership;
- authenticated production IPC and Host/Join capability admission;
- real hold with control traffic alive, exactly-one boundary release, re-hold,
  owned-byte restoration, detach and resumed world updates;
- a separate real direct running-generation-zero terminal halt at tick/update
  57267/2979 with correlated
  `halt_requested`/`terminal_parked` evidence, responsive authenticated IPC and
  no native or bridge-clock advance during the observation window;
- fail-closed Host/Join gate cleanup for invalid/unmatched events, malformed
  receipts, timeouts and disconnects, plus typed terminal halt from the shared
  engine adapter without retrying an unknown outcome;
- serialized production Host/Join adapter polling, a one-second authenticated
  heartbeat, a native 15-second connected-silence lease and constant-space
  monotonic correlation replay protection without a 512-request session cap;
- live production handshake `engineObserver:true`,
  `productionQualified:true`, `guiFreezes:true`;
- bridge evidence: held tick/update 57266/2978, re-held 57267/2979 and resumed
  57268/2980, with no cross-thread observation;
- reversible staging and hash-matched cleanup without replacing installed game
  binaries or modifying an existing user save.

Implemented but isolated/model-tested only: host ordering (including host-local),
duplicate/deadline/unknown-outcome fences, save transfer, checkpoint schemas,
six-domain public-state canonicalization, company/economy adapters and recovery
state machines. None of those substitutes for a real second TF3 process.

Unimplemented or unverified: stock command suppression and lifetime, semantic
native gameplay IPC, exactly-once replay in TF3, two-instance agreement,
integrated game-side checkpoint recovery, complete road gameplay, synchronized
separate-company costs/revenue, cross-machine, four-player and port-forwarded
Internet acceptance. No gameplay family is currently released as synchronized.

The strongest command leads are factory `0x9EEE60` and Add `0x9D3120` on the
qualified build. Static inspection proves Add owns source/callback/progress
cleanup and a reference-counted output handle; it does not prove a safe
cancellation result. Therefore no guessed suppression hook was activated.

Fresh exact-build analysis decoded the sole factory caller and all 45 direct
Add callers, then traced scripting userdata through `sendCommand`. It proves
Add is not universal: adapter `0x120430` can use a TLS queue or call apply
wrapper `0x9E2380` directly. Stage 6 must therefore observe and eventually
control the common scripting submission interface rather than treating Add as
global admission. A diagnostic-only authenticated IPC snapshot contract now
exists, but production intentionally has no provider and no advertised passive
action capability; no live action hook is claimed.

Verification:

- authoritative clean suite: **905 tests, 875 passed, 0 failed, 30 skipped** in
  53.724 seconds. The preceding integration run exposed one obsolete adapter
  test double and 11 deliberately freshness-gated native fixture cases; after
  updating the test double and rebuilding the fixture, its 11 native cases and
  the complete suite passed;
- all production-gate, integrated-gate, continuation, IPC, runtime-loader and
  proxy builds/smokes passed;
- an explicitly separate run activated normally skipped legacy debugger tests
  and produced five teardown failures (three controller, two observer; Win32
  121/1067). That failed run is retained as negative evidence and is not counted
  as green;
- the historical independent reviewer obtained **756/756**, not 478/478. The
  latter was an incomplete visible TAP count.

Evidence tier: single-game native control and terminal halt are verified; two-instance,
cross-machine and product acceptance are open. There is no present external
blocker to command-boundary implementation. Honest readiness is **5.3/10**.
Older sections below are a chronological audit trail and may describe earlier
capability/test counts; they do not override this section.

## Correlated-boundary continuation audit — 22 September 2026

The objective remains active and incomplete. The current batch adds three
concrete prerequisites without relabeling them as multiplayer:

- A real disposable TF3 run correlated native post-site hits 5→133 with bridge
  ticks 57134→57262 and bridge updates 2846→2974 at speed 1. Each delta was 128,
  the owner remained thread 27704 and no cross-thread fault appeared. This
  upgrades the observer from an uncorrelated real hit to one bounded live
  one-for-one comparison; it is not yet a universal clock or safe hold site.
- An owned ordinary-execution state machine and authenticated IPC adapter now
  hold, release exactly one boundary, remain responsive during a slow advance,
  latch disconnect/halt, reject duplicate/out-of-order/stale/malformed traffic
  and preserve an unknown outcome after a consumed release timeout. They keep
  `protocolHalted`, `simulationThreadHeld` and `engineHalted` distinct and never
  claim either production qualification or TF3 engine halt.
- Windows' real unwinder proves a conventional arbitrary-RIP `PROC FRAME` gate
  invalid: it consumes interrupted local stack data as a return and misaligns
  the helper call. An owned cold-fragment alternative now passes eight actual
  VEH→ordinary wait→resume cases with all GPR/RSP/flags and all 2,432 enabled
  XSAVE bytes preserved, 58/58 actual instruction-PC unwinds, native exception
  propagation to the real caller and independent controller progress. CFG, CET
  shadow stacks and context-IP validation remained enabled and the gate has
  exact EHCONT metadata. A separate EXE/DLL fixture then passed the cross-image
  shape beyond `rel32` range: 8/8 state-preserving hold/resume cases, 56/56
  actual-PC unwinds, exact EHCONT targets, native-exception propagation, busy
  teardown rejection and inert pinned-handler cleanup with CFG/CET enabled.
  Both fixtures still report TF3 activation and production lifecycle false.

Hash-pinned exception-directory parsing confirms the real Step post frame has
the same saved-register/return layout and no EH/UH language handler or scope
table across its nine chained runtime records. This supports the cold-fragment
unwind model at `0x159581` specifically. Cross-image transfer is now qualified
only in an owned fixture; runtime mitigation policy, live stack headroom,
immutable owner/generation publication, terminal parking and TF3 teardown remain
production work.

The successful run shut the observer down authentically, stopped only the sole
disposable TF3 process and removed the staged loader. All five owned paths are
absent, no TF3 process remains, and the executable/stock `alut.dll` hashes remain
unchanged. A preceding run that exhausted its shared load/sample deadline
failed and is not evidence; the checker now uses separate deadlines and
failure-path authenticated shutdown.

TF2 `VREV` was traced through actual source. Its semantic capture/suppress/
logical-key/replay separation is useful, while peer-assigned ordering, early
`ARMED`, a global pending pointer, late execution and financial repair are not
acceptable for TalCo. No TF2 code was copied. Production still lacks the safe
TF3 continuation gate, Host/Join binding, stock action suppression, two-instance
apply/comparison and checkpoint recovery. The unrestricted suite now discovers
878 tests: 848 passed, 0 failed and 30 were explicitly skipped; the focused new
native/control set passed 20/20 and all five new native build/smoke paths passed
MSVC `/W4 /WX`. The existing production observer, in-process runtime, native
IPC and reversible WinHTTP proxy also rebuilt successfully with applicable
smoke tests. Readiness therefore remains **4.5/10**.

## Continuation audit — 22 September 2026

The full multiplayer objective is active and incomplete. Commit `95d79c8`
advances the evidence tier from “DLL and pipe loaded” to a functioning,
exact-build-gated in-process observer of a real TF3 post-iteration instruction.
It does not establish simulation control, command replication or multiplayer.

Implemented and isolated/model-tested:

- collision-refusing application-local WinHTTP proxy staging, exact 14-export
  forwarding to absolute System32 and hash-validated removal without modifying
  installed binaries;
- fixed-size owner-only Steam-relaunch handoff, exact sibling/probe gate,
  owner/local-only authenticated pipe, persistent one-session binding,
  duplicate-correlation barriers, strict JSON and fixed partial-frame deadlines;
- exact disk/mapped PE and instruction-byte qualification at RVA `0x159581`;
  one-byte INT3/VEH observer with exact exception ownership, faithful `inc r15d`
  emulation, lock-free telemetry, pinned late-trap safety, byte/protection restore
  and no rearm after teardown;
- owned native qualification covering 576 flag cases, 1,004 hardware traps,
  cross-thread detection, saturation, concurrent teardown, dynamic-code-policy
  rejection and foreign-patch preservation/recovery.

Single-game verified:

- the audited TF3 process loaded the local proxy, signed System32 WinHTTP and
  gated runtime; authenticated host bind/ping reported a real post-iteration hit
  on thread 16196 with no cross-thread hit;
- authenticated shutdown restored the instruction. The disposable world then
  continued from displayed TF3MP update 3037 to 4368 and town population 81 to
  86 before the exact test process was stopped;
- cleanup removed every TalCo staged/session file. The exact game hash and stock
  `alut.dll` hash remained unchanged. No user save or unrelated file was used.

Not implemented or not yet verified:

- the observer counter is not yet correlated to the canonical public update or
  checkpoint receipt; its `r15d` value is intra-batch, not a world clock;
- actual in-process hold/release/halt, command object capture/lifetime,
  origin suppression, exactly-once replay and stock-action veto;
- production Host/Join adapter binding and two-instance matching-update state
  comparison, ordered vehicle action or checkpoint reload/recovery;
- the complete synchronized road loop and real multi-company construction,
  purchase, operating-cost and revenue effects;
- cross-machine, four-player LAN and port-forwarded Internet acceptance.

Evidence accounting: the final unrestricted suite discovered 858 tests: 828
passed, 0 failed and 30 skipped. The historical independent-review correction is
756/756 on its earlier tree; 478/478 was an incomplete TAP count. Native builds
for observer, runtime, proxy and IPC all passed MSVC `/W4 /WX`. Single-game
observer evidence is real; two-instance and wider acceptance are open.

No external dependency currently blocks the next implementation step. A second
physical TF3 machine/network is unavailable for later cross-machine acceptance,
but that does not block local control or two-instance engineering. Honest
readiness is **4.5/10**: the required in-process observation boundary exists;
actual engine control and a two-instance authoritative action are still needed
before 5/10.

## Full-readiness continuation audit — 21 September 2026

The goal is still active and incomplete. Commits `db22017` and `8333ae3` are not
completion claims. They add real exact-build simulation observation, authenticated native
hold/release/halt IPC, fail-stop teardown, automatic disposable-save startup,
game-produced checkpoint domains, and a single-game host-sequenced reversible
vehicle stop/start proof. The live vehicle proof applied host sequences 1 and 2
to company 3141/entity 66005 and restored the original running state.

The continuation batch hardened trap ownership and teardown: accepted traps now
require first-chance status, a tracked armed thread plus matching exception address, RIP and enabled
execution slot; an owned real-exception regression verifies emergency hold,
release refusal, responsive control and exact second-chance forwarding. The
authenticated socket client now exposes stable subscriptions only for verified
server frames, not local transport/lifecycle notifications.

This integration additionally gives the host a real
authenticated loopback participant path. Its engine adapter remains mandatory
and injected: pending attachment blocks coordination, admission callbacks cannot
race that gate, late adapter resources are closed, and explicit bind addresses
remain reachable. The checkpoint producer now reads actual public `Town` and
`TownBuilding` components, including growth controls, distribution weights,
cargo needs, emissions and bounded construction module values. Unsupported
dynamic values invalidate the complete lane; they are never reduced to a
key-only digest.

The participant-side authenticated adapter lifecycle is now implemented as a
bounded composition unit: it waits for the signed coordinator capture, validates
a unique two-to-four-player company roster containing the admitted player,
orders frames through asynchronous adapter construction and tears down both
engine and socket on rejection. Join CLI now downloads and exactly verifies the
authenticated host save, loads the built-in provider, subscribes the adapter and
only then sends `save_ready`. Host uses the same first-party provider. This path
is integrated and model-tested but cannot yet run against TF3 because the native
runtime correctly remains `productionQualified:false`.

The integrated seams now revalidate bridge observation and persistent native
binding after asynchronous provider construction; bad bind/ping receipts and a
duplicate admitted frame fail closed. The game-side coordinated vehicle action
now completes only inside TF3's documented post-execution callback, after
matching callback payload, ownership, stopped flag, held update and balance are
observed. The authorization and unknown receipt are persisted before submission,
and no uncertain callback is retried. A separate two-instance plan/collector
materializes the exact ports, directories, identities, mod hash and save evidence
needed for the first real dual-process run, while always reporting acceptance
false until real-engine receipts exist.

A fresh ordinary-UI load of disposable save
`tf3mp_disposable_43b49d368fbbd409ae2614ada7b0c757` then passed the real
production checkpoint path at exact held/released update 3052. Town/growth,
economy, topology, vehicles, companies and lines/services were observed and the
gate returned `comparisonReady:true`; hidden RNG remained explicitly
unavailable, so `coverage.complete` correctly remained false. This proves one
game can produce admissible public-world comparison evidence. It does not prove
two-game agreement or determinism. The original `comp.sav` retained SHA-256
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`.

A second fresh disposable run stopped watchdog renewal while retaining live
engine observation. TF3 advanced from tick 57526/update 3238 to the confirmed
lease boundary, halted at tick 57623/update 3335, and remained at
`speedup:0`/update 3335 for the stability interval. This is real single-game
engine fail-stop evidence; it does not establish peer coordination or recovery.

Host CLI now has an explicit `--host-local-adapter-module` composition seam. It
will import only a regular absolute-path provider after live bridge observation,
authenticated production native binding and exact session/build/mod/save checks.
The repository now contains a first-party provider shared with Join, which
constructs the real existing engine-session adapter from the verified save,
live bridge directory and persistent native binding. The native binding itself
is not production-qualified, so ordinary Host mode still cannot control TF3.

A fresh live startup check first exposed that TF3 was selecting a preserved
same-ID backup from its scanned staging directory. Both backups were moved intact
to `local/tf3mp_stage_backups`; the remaining 32 staged files then matched the
repository. The corrected run consumed its one-shot request, loaded the exact
disposable and reached `Game is ready`, but still produced the MainMenu `GetApi`
and missing `WindowContainer` faults. Local shipped UI source confirms stock TF3
loads from `ProgressPage`'s second React step; `--script` has no public main-menu
mount point. Automatic clean load therefore remains unfinished.

The later command-profile run failed: TF3 crashed with Windows exception
`0x80000004` at proposed admission RVA `0x9D3120` before discovery or mutation.
No uncertain action was retried. That profile is now disabled before process
access; owned 16-thread/missing-DR6/cutoff fixtures pass, but live safety remains
unqualified. Normal Host/Join also remains deliberately closed because the native
runtime reports `productionQualified:false` and no production game adapter is
constructed.

The narrower handler/apply investigation then produced genuine routing evidence:
an idle WinDbg trace saw only continuous background apply pairs; each known
reversible vehicle action produced one nested handler pair; and the first handler
payload encoded entity 66005 in bytes `+0..+3` and stop/start in byte `+4`.
Review of the raw absolute returns corrected the previously miscomputed RVAs:
all three action addresses reconcile to inferred base `0x7ff6386e0000` and the
verified returns at `0x11ebbb`, `0x1204e4` and `0x9d8e3d`. This establishes a
coherent handler/dispatcher/apply call-chain reconstruction, although no
independent module-map record preserved the base. Bytes `+5..+7` are
uninitialized padding, not a flags word. This still failed live-hook
qualification. The final detach ended in TF3
`0xC0000005` execute-at-zero, while Windows Security separately quarantined the
rebuilt custom observer as `Behavior:Win32/DefenseEvasion.A!ml` before its second
smoke run. Protection was not bypassed. Both live command/action profiles remain
disabled, and the original save hash remained unchanged.

The disabled observer now emits explicit image-base/raw-return coordinates and
accepts an RVA only when the overflow-safe base-plus-RVA round trip lands inside
the mapped main image. Its handler entry copies only the five statically proven
payload bytes. Both live gates remain false; MSVC `/W4 /WX /Zs` passes, but no
native executable was rebuilt or live-attached.

The current exact unrestricted `npm run check` discovers 850 tests: 820 passed,
0 failed and 30 native executable tests are skipped because Windows Security
quarantined the rebuilt observer and the stale controller artifact was removed.
The six named-pipe/native IPC failures and one bridge-lease failure seen during
the prior restricted run were sandbox artifacts; the focused rerun passed 15/15
and the complete suite then passed outside that restriction. MSVC `/W4 /WX /Zs`
passed for the hardened observer source. The last pre-quarantine integration tree
passed 830/830 in 98.53 seconds. The independent review correctly recorded
756/756 on its earlier tree; 478/478 was an incomplete TAP count. Current native
source passes MSVC `/W4 /WX /Zs` syntax/type checking; the last pre-quarantine
focused observer/controller suite passed 29/29, but was not rerun after the
quarantine. The focused authenticated-network suite is 11/11. Mod review passes
with 29 files,
zero executables and manifest
`6f2334edb74e36e6b5e9e46190fccb18571ac93645cca056f25be200c70fce24`.

Unfinished implementation: clean automatic entry into the stock save-load
lifecycle, safe capture/suppression/replay, per-instance identity,
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
