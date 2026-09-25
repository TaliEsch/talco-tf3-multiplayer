# TalCo TF3 multiplayer — current delivery plan

## Current build gate — 25 September 2026

The revised passive 40401 run captured the missing adapter identity during one
ordinary UI Stop: entity 66005 reached `Stopped`, with one correlated
factory/admission/send/callback/marshaler chain and no drops. The adapter table
was RVA `0x3788840`, invoking RVA `0x27C8820`; all Stop-specific stages ran on
thread 34072. The boundary ran on thread 26924. A hash-pinned static audit
identifies this adapter as a UI forwarding/queue wrapper, so callback lifetime
and cancellation under substitution are still unqualified. The observer ended
with both sites restored (`passive-40401-stop 2 2`, `runtime-returned 12 0`),
the disposable source save hash was unchanged, and the two diagnostic DLLs
were removed. Private trace: `reports/native-passive-40401-adapter-20260925`.
Next qualify the exact adapter, callback and production boundary gates offline,
then run a bounded hold/release without a vehicle mutation. This observation
does not enable production 40401 gameplay or establish Host-ordered Stop.

The opt-in `road.vehicle.assignLine` path is implemented from Host admission
through a one-use held native send and observed vehicle/line ownership receipt.
Twenty-four focused tests and 50-file mod review pass. It has not run in TF3;
validate it with the ordered road service on a disposable save after the native
build gate is qualified.

Steam updated TF3 to build 40401 (SHA-256
`6ABDEDD8FBBD3117FE909D8747BD2690A76B9098A251AABB1AE9BA6B4F9659CA`)
during the funded depot and vehicle purchase launch. The launcher stopped at
its exact-build gate before any command. Requalify the native boundary,
callback and adapter sites for 40401 before resuming the disposable-save
integration run; keep other Stage 7 road/economy work moving offline.

A separate no-hook 40401 run now confirms the live image, mapped post-update
site and mitigations, with runtime result 10. Steam dropped environment values
on relaunch, but the one-use diagnostic handoff survived. No probe, boundary,
vehicle traps or IPC server started. This does not qualify the vehicle ABI or
permit production gameplay; the next experiment must establish those contracts
before the funded purchase run.

The subsequent passive run observed one ordinary UI Stop on the exact build:
Road Vehicle 1 reached `Stopped`, and one native factory/admission/send/callback/
marshaler chain correlated to entity 66005. The boundary ran 568 times on one
thread without stack/alignment faults; both passive sites restored cleanly.
The private five-minute trace is in
`reports/native-passive-40401-1bb7de79d39a4e32b56d7871ea2c78b8`.
Its adapter identity was not retained and an unrelated command polluted the
vehicle cross-thread flag. Both measurements are corrected in source and the
owned native fixture, awaiting live confirmation. Then perform a bounded
40401 hold/release qualification before enabling production gameplay.
The ordinary Stop is not Host ordering, cancellation or replay proof.

## Ordered vehicle purchase integration — 25 September 2026

The road vehicle purchase path is now opt-in from Host admission through a
one-use held TF3 command, with depot-owner rechecks, a deferred callback and a
world receipt for the new vehicle and exact native debit. A local test harness
orders depot build then purchase in one disposable session, using the depot ID
from the first receipt and an explicit verified funding receipt. Focused tests
and mod review pass; the purchase and funded coordinator transition have not
run in TF3. Next qualify one current-build, single-game funded depot→purchase
sequence, then continue the road service loop and economy. Two-instance tests
remain deferred at the user's direction.

## Ordered two-stop ROAD line source — 25 September 2026

A second-company `road.line.create` action now has opt-in Host/queue admission,
both-station ownership rechecks, one-use held execution, and a correlated
line/owner/station receipt. The game module verifies actual ROAD terminal
assignments and the newly created line in the held world. Focused model tests
and mod review pass. No line action has run in TF3, and the local diagnostic
runner still needs two observed target-owned station IDs before it can offer
this action. Line edit/removal, vehicle assignment and service economy remain
Stage 7 work.

## Ordered depot single-game acceptance — 25 September 2026

The held Host-ordered road depot path now waits for the native callback and
checks the committed construction, depot ownership and exact native debit
before accepting. A fresh build-40396 TF3 run accepted Host sequence 1 at
update 3066 for company 55652: construction 8826, depot 73803 and charge
314,650. Independent held-world readback returned `observed`; native terminal
halt was confirmed. The disposable source save remained unchanged. This is
one real engine with a simulated participant, so two-instance agreement and
general construction support remain open. Next extend the same admitted,
ordered, one-use path to the road loop's line and vehicle actions, then verify
service economy. Do not validate every building separately; add construction
families as their gameplay path requires.

## Ordered depot result — 25 September 2026

One build-40396 disposable TF3 run accepted company 55652 at prepare and held
Host sequence 1 at update 3058, then returned `ENGINE_OUTCOME_UNKNOWN` at the
native depot attempt. Terminal halt was confirmed; no replay or independent
postcondition occurred. The source save stayed unchanged. The next step is to
carry the adapter's bounded native outcome code into the report and compare
the stock TF3 proposal with TF2's working construction plus connected street
replay. Adapt a shared construction action path where build-specific evidence
permits, rather than validating every building independently. Keep the
one-use unknown latch and do not rerun this action unchanged.

## Stock road depot geometry diagnostic — 25 September 2026

The passive construction observer now attempts to copy the stock proposal's
bounded 16-value transform and seed while retaining owner/cost facts if that
optional read fails. In one build-40396 TF3 run, two local road depots were
placed at the same screen area on a disposable, unsaved world. The first apply
reported native cost 454,977 but geometry unavailable. The second apply
reported cost 449,160, seed 1 and a readable transform with translation
(-812.891541, -3142.25684, 23.3068237). The report parser accepted all eight
construction samples with zero rejected records. This is a stock UI baseline
for comparing the earlier scripted `Collision`; it does not establish
host-ordered depot construction. Next compare this concrete placement with the
scripted proposal and qualify target-company ownership/debit in a fresh run.

## Road depot proposal observation — 25 September 2026

The passive native construction observer now copies bounded owner, resource,
cost, critical-error and result-count facts for a single `constructionBuilder`
proposal. In one exact build-40396 TF3 session, a locally placed Bullfrog Road
Depot produced create/apply facts for company 3141, resource
`::/depots/road/road_depot/road_depot.con`, and native cost 454,977. The GUI
showed the same debit and the completed depot with capacity 0/12. The source
disposable save remained unchanged. This qualifies observation of the native
proposal shape only. Next is host-authoritative depot admission, one-use
cancellation, scheduled replay and a held-world postcondition for a separately
mapped company; then line, vehicle and service economy work. Two-instance
testing remains deferred by the user.

## Sequential separate-company Stop path — 25 September 2026

The controlled one-engine coordinator can now accept two distinct road Stop
intents for the mapped second company. It obtains fresh road preflight evidence
before each Host sequence and preserves both independent held-world readbacks
and postconditions in one report. The existing remote-road command accepts an
optional second road entity; no action is retried after an unknown result.
One exact build-40396 TF3 run then applied both intents to distinct public
roads on an unchanged disposable source save. Sequence 1 used road 53417 at
held update 3683, creating Stop 64470 on replacement road 49848 and charging
company 55652 46,348. Sequence 2 used road 53419 at held update 3757,
creating Stop 9237 on replacement road 73899 and charging 46,254 more.
Independent held-world readbacks observed both Stop attachments at their
scheduled updates; target balance was -92,602 after the second. The native
terminal halt was confirmed. Private report:
`reports/local-batch-a7cecb6d-ec2a-4383-8491-5928d350d635/report.json`.
This remains one real engine with a simulated second player; production socket
admission, two-instance agreement and transport income remain open.

## Held economy readback extension — 25 September 2026

For separate companies, the ordered Stop readback carries the local company's
balance from the same paused engine observation and independently checks it
in the game-side finance API, alongside the acting company's native debit.
When the local company acted, it uses the native post-Stop balance because the
observation may precede the action within that update. Distinct target and
local balances and a mismatched local balance pass/fail in focused fixtures.
The second Stop's nonce-bound live readback included local company 3141 and
its separately checked balance of 40,061,869 at held update 3757, alongside
the target-company debit. The next road loop work is depot, line and vehicle
service with native costs and income; two-instance testing remains deferred by
the user.

## Separate-company ordered Stop checkpoint — 25 September 2026

The one-engine ordered road Stop harness now proposes as its simulated remote
player for the mapped second company. Its independent held-world probe checks
the local GUI company separately from the target Stop owner and accepts signed
target-company balances.

One build-40396 TF3 read-only run inspected both companies and road 53417
through nonce-bound game-side requests. The local company 3141 had balance
40,229,553; second company 55652 existed with balance 0 and no assets,
vehicles or lines. The road was `found` for company 55652, with public owner
0 and revision 23. A first ordered Stop reached TF3 but ended `unknown` at
`after_result_cost`: TF3 had debited company 55652 to -46,348 while the
verifier rejected all negative balances. The one-use latch halted it and no
action was retried in that process. The verifier now requires the exact native
debit without imposing a nonnegative target balance.

A fresh controlled load of the unchanged disposable source save then passed:
Host sequence 1 executed at held update 3076, creating company-55652 Stop
72897 on replacement road 73804 for native cost 46,348 and target balance
-46,348. An independent nonce-bound world probe observed those same entities,
owner and signed balance at update 3076 before release; the native terminal
halt was confirmed. The report is
`reports/local-batch-09a10505-cd2b-46a7-b27a-d8d0bbba8742/report.json`.
This is one real engine plus a simulated participant. Next extend separate
company road and economy play beyond one Stop, then compare two real TF3
instances when the user resumes that test. Do not infer two-instance proof.

## Current direction — 25 September 2026

The next separate-company safety gate is implemented in the ordered road
preparer and held executor: both now reject a road owned by another company,
while allowing public or target-company ownership. The executor checks again
immediately before native submission. Focused fixtures cover an action whose
target company differs from the local host company and an ownership change
after arming. This is source/model verification only; a real TF3
separate-company road and economy result remains the next game milestone.

The held-boundary readback now passed in one real build-40396 TF3 process.
Production Host ordered one public-road Stop as sequence 1, prepared it,
executed it at scheduled update 3044, and obtained an independent read-only
game-world receipt at the same paused update. TF3 reported original road
53417 removed, one company-3141 Stop 8919 on replacement road 8918, native
charge 46348 and balance 40183205. The coordinator then released and
confirmed terminal halt. The disposable source save hash stayed unchanged;
the report is `reports/local-batch-c79d3a01-deab-46dc-9fe8-963d7360e2e5/report.json`.
This is one engine plus a simulated participant, so multi-instance gameplay
remains unverified and the user has deferred that test. Next extend the
verified ordering and readback path to separate-company road gameplay and
economy while keeping the two-instance comparison ready for when permitted.
The previous host-company Stop remains verified; the separate-company result
above is the current one-engine checkpoint. Stage 7 remains open.

The revised production Host telemetry panel returned two read-only TF3
receipts on build 40396 without changing the source save: road 53417 was
`found` for company 3141 with public owner 0 and revision 23 at update 2955;
nonexistent road 2147483647 was `missing` with revision 0 at update 3083.
Both matched the active bridge nonce and request IDs. The controlled one-game
ordered road run now calls the same strict bridge preflight before proposing
its command and records the receipt. Focused local-run fixtures pass, including
refusal before any action when preflight fails. The next paid run should
correlate that preflight with one accepted ordered Stop and a separate
postcondition read at the held boundary. Host socket admission itself still
needs real-game verification; readiness stays about 6.6/10.

A read-only build-40396 TF3 probe on the unchanged source save returned a
nonce-bound road preflight receipt for road 53417 and company 3141:
`outcome=found`, `ownerCompany=0` (public), `revision=23`, update 3313.
The original save hash remained unchanged. This exposed a production routing
gap: the GUI exchange ran in watchdog mode but not Host telemetry mode. That
route is now wired in both modes and awaits a fresh production Host check;
the probe alone does not prove ordered road admission. Readiness remains about
6.6/10.

The local ordered-run report now retains the accepted game receipt's road ID,
Stop ID, owner company, native charge and balance alongside Host sequence and
update. This is source and fixture verification only for the new reporting;
the prior TF3 run is unchanged. It lets the next expensive TF3 experiment
preserve its game-world postcondition even when terminal parking prevents a
later save. A fresh Host admission road preflight remains the next gameplay
gate; the held game executor already rechecks the road and company.

A fresh controlled build-40396 single-game run accepted one Host-ordered road
Stop as sequence 1 and executed it at the scheduled update 3058. The game
returned a successful held execution receipt with a qualified replacement
road, Stop entity, native debit and company balance; the coordinator released
at update 3060 and confirmed its native terminal halt. The local test report
is `reports/local-batch-8546e5a3-35da-47f3-b5b5-b0879cc964c0/report.json`.
It uses one real engine and one simulated participant, so it does not prove
two-instance agreement. The subsequent independent world probe was
inconclusive because the native terminal halt retained speedup 1, which the
probe rejects, and TF3 could not finish saving after the terminal park. The
source save hash stayed unchanged. Next preserve a correlated independent
postcondition at the action boundary or before the terminal park, then extend
the same ordered path toward separate-company road gameplay. Two-instance
testing remains deferred by the user. Readiness is about 6.6/10.

The callback verifier previously required the removed source road's entity ID
to cease existing. TF3's saved ordered outcome shows that ID still exists but
no longer has a road component. The verifier now requires the old ID to have
no `BASE_EDGE`, even if another entity has reused the ID; a surviving road
still fails. Focused fixtures and mod review pass. This correction and the
bounded stage diagnostics still need a fresh controlled TF3 result; they do
not upgrade the last `unknown` receipt.

The first Host-ordered road Stop reached its scheduled TF3 engine update
3238 in build 40396, but its execution receipt stayed `unknown`; the one-use
barrier was consumed and the game halted without retry. A read-only load of
the preserved outcome save subsequently found exactly one matching owned Stop
73730 attached to replacement road 9075. That road matches the selected
source road 53417's nodes, endpoints and tangents; company 3141's balance is
$40,183,205, the expected native debit from $40,393,094. This establishes a
single-game world change after Host ordering, not a verified completion
receipt or two-instance replay. Bounded execution-stage diagnostics have been
added to the next build so a later disposable-save attempt can identify the
unknown link. Keep readiness at about 6.3/10 until the Host acceptance,
successful engine receipt and observed postcondition agree in one run.
Two-instance testing remains deferred by the user.

The bounded road Stop now traverses production Host admission, the existing
ordered participant and mailbox, a road-specific game-script prepare and held
execution, and a raw execution decoder. The game script consumes the one-use
barrier before native submission and requires the callback to show a new owned
Stop, replacement road, native charge and company balance under the held
update. The legacy relay still rejects road requests. Focused model and
authenticated socket tests pass, as does mod review. This revision has not
run in TF3; it is not a stage-7 result. The next controlled disposable-save
run must correlate the Host sequence, game receipt and observed road/economy
postcondition without repeating the earlier uncertain purchase. A fresh
read-only road preflight before Host sequence assignment is still desirable;
the game-side prepare and execution checks currently reject stale roads.
Readiness remains about 6.3/10 pending real-game proof.

The read-only ordered road prepare is now connected through the existing
participant, mailbox, GUI exchange and game-script event. It binds one Host
sequence to the roster company, an empty live road, model identity and road
revision, and persists an unknown receipt before returning an `ok` preparation
receipt. The live Host still rejects road admission and the mailbox still
rejects road `executeHeld`; no construction can be submitted by this path.
Focused fixtures and mod review pass. This preparation has not run in TF3.

A bounded `road.stop.place` command shape now exists in the Host authority
model and ordered queue. It binds the seven observed TF3 fields to one road
and company and rejects balance/cost input. The engine mailbox now has a
bounded scalar encoding for the fractional position and UTF-8 name. The live
Host still rejects road requests before assigning a sequence, and the mailbox
refuses road execution publication because the held execution receipt path is
not implemented. No TF3 run tested this contract.

The ordered vehicle path is explicitly vehicle-only at Host admission,
participant validation, engine mailbox encoding and game-side preparation /
execution. The road Stop currently uses a separate one-use disposable-save
executor and has no Host sequence. Extend those existing boundaries with a
bounded road command, live company and road preflight, a consumed sequence and
native postcondition receipt before the next paid TF3 attempt. Do not count
transport acceptance alone as road execution.

The road Stop callback verifier now has an offline-tested fallback for TF3's
incomplete result-entity vector: it requires one owned Stop attached to a
replacement road with the source road's exact observed node geometry, plus
the native debit and held clock. Focused fixtures and mod review pass. This
change has not yet produced a verified TF3 callback receipt; host ordering of
the road action is also still open. Plan the next disposable-save run to test
both links with correlated receipts, without retrying the uncertain purchase.

Read-only probes of the untouched source and preserved outcome saves in TF3
build 40396 now correlate the selected road to the placed Stop. Source road
53417 had no matching Stop. The outcome has one owned, attached Stop 73312 on
road 73313; that road has identical node IDs, endpoints and tangents to the
source road. The native balance fell $46,348. TF3 reused entity 53417 for a
non-road entity, explaining the earlier ID conflict. The original callback
receipt remains `ENGINE_OUTCOME_UNKNOWN`; this is observed single-game
postcondition evidence, not a successful production completion receipt or
host-ordered replay. Do not repeat the purchase. Next adapt the callback's
result readback to TF3's actual entity-list semantics, then move the proven
road Stop action through host ordering and exactly-once execution. Two-instance
testing remains deferred by the user.
The full suite has five reproducible native debugger fixture failures; see
the completion audit. Readiness remains about 6.3/10.

The saved road Stop outcome has a focused read-only probe and the callback
verifier can use the exact resulting stop ID from TF3's completed proposal.
Offline tests and mod review pass. A build-40396 read-only load of the
preserved outcome save reached UI recipe registration but did not enter the
world or produce telemetry; the save remained unchanged and the temporary
loader was removed. Diagnose that load before using the probe. Road Stop
ownership and attachment, then host-ordered road/economy play, remain the
next stage-7 checks. Readiness remains about 6.3/10.

The latest paused, one-use TF3 road Stop request reached engine execution on
build 40396. Read-only preparation passed after using TF3's qualified
temporary edge-object ID range. The callback reached `result_entities`, and
the company balance fell $46,348, matching its reported native cost. The
original road was removed, but the returned entity list did not qualify the
new stop, so the receipt remains `ENGINE_OUTCOME_UNKNOWN`. The changed world
is saved separately for read-only inspection; do not retry the request.
Verify the stop and replacement-road attachment from that poststate, then
adapt the strict result readback if TF3's callback entity-list semantics
require it. Host ordering of road/economy actions remains open. Overall
readiness is about 6.3/10; two-instance testing remains deferred by the user.

The latest paused, read-only TF3 trial exposed a concrete TF3-specific
proposal mismatch before command submission: its `EdgeObjectEntityToIndex`
converter requires a temporary edge-object ID in `(-500000000, -400000000]`,
whereas the TF2-derived replacement-edge reference used `-1`. The receipt was
`code=unknown`, `stage=command`; no placement request was submitted. The
disposable save hash stayed unchanged and the temporary loader was removed.
Qualify the TF3 temporary object-ID mapping offline before another game run.
Stage 7 road placement, native charge and host ordering remain open; readiness
remains about 6.3/10.

The latest one-use road Stop trial adapted TF2's replacement-edge object
linkage and passed focused tests, but real TF3 still returned
`ENGINE_OUTCOME_UNKNOWN` at `result_road`. The balance and source save stayed
unchanged, no stop appeared, and the game log identified an unresolved edge
object model resource. Isolate TF3's required model string/identity in the
proposal before spending another game run. Overall readiness remains around
6.3/10; stage 7 road/economy acceptance is still open.

Latest guarded single-game road Stop attempt reached the callback but returned
`ENGINE_OUTCOME_UNKNOWN` at `result_road`: the original road still existed,
balance was unchanged, and no stop appeared. Its one-use latch remains
consumed. Before another disposable-save run, add bounded evidence for the
callback's command result and replacement-road entities, then verify the
proposal matches TF3's accepted shape. Do not retry that uncertain request.
The two-instance test remains deferred by the user. Overall readiness remains
about 6.2/10; separate-company road/economy acceptance is not yet proven.

The guarded simple Road Stop request is wired into the disposable-save game
bridge and one-use executor. Two further build-40396 attempts isolated the
read-only before-snapshot failure: `getEntitiesWithComponent(PLAYER)` threw,
and the documented entity iterator also failed in this game-script callback. Both
requests rejected before engine submission; the save and balance were
unchanged. Next, identify the available entity-read surface in this callback,
qualify a fail-closed company and economy snapshot, then attempt one guarded
command with stop ownership and native debit readback. Host ordering follows
successful local acceptance. This is stage 7 work, around 6.2/10 overall.

Two further paused, read-only previews on the same disposable save exposed the
remaining factory shape: `nodeConfigsToAdd` and `nodeConfigsToRemove` are both
dense arrays of two, matching the road endpoints. The preparer now carries
those factory values into the guarded `SimpleStreetProposal`; TF3 returned
`commandCode=prepared` for the untouched road on build 40396. This qualifies
command construction only. The next critical step is one guarded, host-ordered
engine submission with correlated execution, stop and charge readback; road
ordering and separate-company economy remain open.

A read-only result adapter checks the proposed command's callback against one
new owned stop, replacement-road attachment, native cost and company balances.
It is connected to the one-use executor, but has rejected before submission
in TF3 because the player snapshot could not be read in that callback.

At the user's direction, defer the two-instance TF3 run until they say to
resume it; a second launch from this Windows/Steam profile produced only one
game process. Continue the one-game separate-company road/economy path and
offline Host/Join engineering. Under the user's revised stage boundary, the
single-game host-ordered, cancelled, exactly-once vehicle Stop with observed
postcondition completed the stage-6 checkpoint on build 40392. The two-instance
Stop and baseline belong to later multiplayer acceptance and remain required
for the full goal. Stage 7 road/economy and stage 8 playable multiplayer are
still open.

Build 40396 has SHA-256
`086d69c141acaac1016e942beac28f469da0c5cb2de4b7f4c6f0d3fd7fd75dc1`.
The exact-build native startup, probe and vehicle gate passed in one TF3
process. A paused disposable-save run placed one Road Stop and copied a
complete owned post-placement readback through the production mod bridge;
the host-side strict parser accepted it as evidence only. The original save
was unchanged and the temporary loader removed. See `docs/completion-audit.md`.

The read-only `replaceSegment` factory now returned its real TF3 shape in one
paused disposable run: one added and one removed segment, with a temporary
added segment ID of -1 and one attached object. The next stage-7 action is to
turn that observed shape into a supported road-stop replay recipe against the
untouched pre-action road, or qualify the missing native proposal fields.
An offline guarded `SimpleProposal` preparer now reuses the factory's one new
segment and binds one stop object to that temporary edge. It rejects an occupied
or stale road, wrong company, moving game, or unexpected factory shape and does
not submit a command. A controlled build-40396 run verified the untouched
pre-action road shape and observed the placed stop's `.mdl` model resource in
the same session; see `docs/completion-audit.md`. A further paused read-only
probe passed the request, clock, player, road and replacement checks, then
returned `unavailable` at the preparer call. The rejection-handler fix was
verified in TF3: the preparer now returns `rejected` at its factory checks.
The subsequent factory-field check found two added node configs and two removed
endpoint IDs. Preserving those fields produced a `prepared` command value in
TF3. Engine acceptance remains unverified. Connect the guarded readback to a
one-use execution gate, then submit one owned construction through Host ordering,
execute once under the game hold, and verify the resulting stop and native
charge. Separate-company ownership, balances, income and spending still need
real-game evidence. The existing capture codec remains unsupported because its
native proposal lacks model and road-relative placement data.

The installed build-40396 API declares `SimpleStreetProposal.EdgeObject` with
edge, relative position, side, model resource, owner and name, and accepts a
`SimpleProposal` through `makeWorldBuildProposalCmd`. The edge must first be
represented as a new edge in `edgesToAdd`; the current road ID alone is not a
valid recipe. A bounded placed-stop model probe is now available for the next
single-game readback when `edgeObjectConstruction` is absent. This is diagnostic
only; source and mock checks do not qualify replay or engine charging.

## TF2-informed Stop timing — 24 September 2026

The cloned MIT-licensed TF2 mod is now a concrete reference for cancellation,
semantic command scheduling, originator replay, saved-vehicle identity,
history and pacing; see `docs/tf2-baseline.md`. Its action path confirms that
the player who clicked must replay an actually cancelled action at the same
future step as peers. The TF3 implementation already does that for one-use
Stop. The production Host now schedules 60 updates ahead, as measured in the
successful single-game Stop, and allows 30 seconds for the coordinated round.
The earlier eight-update default was only exercised in socket fixtures. This
timing change is offline-tested, not yet verified across two real TF3 games.

## Two-instance evidence trace — 24 September 2026

The production Host now logs each accepted peer checkpoint, applied state hash
and barrier release. Each real engine adapter logs its accepted checkpoint and
operation receipts, including the decoded vehicle Stop postcondition after a
held execution. The diagnostic serializer now retains bounded round, operation,
entity, update and hash fields for these events; its earlier allowlist silently
dropped several of them. This gives one bounded Host/Join run enough correlated fields
to identify the first mismatching link. Focused two/four-player socket and
adapter tests pass. These are logging and model results; two real TF3 instances
still have not been compared. The Host also records one bounded per-peer clock
snapshot when an action arrives; an ahead peer still fails closed.

## Current checkpoint — 24 September 2026

The Host capture path now accepts two to four distinct company claims. Before
binding any player, a fresh nonce-bound read-only TF3 inspection checks that
the selected host and remote company entities exist and that the live player
is the host company. The launcher exposes the roster capture control once all
claims and save-ready receipts are present. Focused roster, capture, network
and launcher tests passed 35/35, and the launcher compiled. The full suite
reported 954 tests: 948 passed, the same five native controller/observer
fixtures failed, and one was skipped. In build 40392, a
paused disposable TF3 run verified the new inspection for companies 3141 and
55652 at update 3063. The game closed without saving, and the source save
retained its original SHA-256. Three/four-company real-game admission, remote
Join startup, and two-instance checkpoint/action agreement remain unverified.
The next critical action is the two-instance synchronized baseline and one
ordered Stop, followed by the separate-company road/economy loop.

## Current checkpoint — 23 September 2026

The Join launcher can now propose its selected in-game company after save
verification and a paused live bridge observation. The authenticated Host
retains that proposal without binding ownership. The two-company capture
requires one remote proposal and rejects it unless the Host's fresh TF3
inspection identifies that same saved second company; each engine's session
bind still rechecks its local player. The Host launcher exposes the capture
control only after both save-ready receipts and the Join proposal. This wiring
passed focused network tests and the launcher build, but has not been run
across two TF3 instances. Three/four-company discovery and admission remain
unfinished.

The corrected single-game ordered Stop path passed in TF3 build 40392. In a
fresh disposable run, moving host-owned Road Vehicle 1 (entity 66005, company
3141) supplied a nonce-bound owner/prestate receipt; its one-use native Stop
was cancelled. The production Host scheduled sequence 1 for update 3428, the
game-side held-action and release receipts both named update 3428, and TF3
visibly showed **Stopped**. The native terminal gate parked the engine and the
report outcome was `local_cycle_and_explicit_halt_passed`, with confirmed halt
source `native_terminal_parked`. See the top of `docs/completion-audit.md` for
the private report path and limits. This was one real engine with one local
receipt mirror; two-instance agreement and playable four-player co-op remain
unverified. The next critical step is a real second TF3 instance with matching
save/build/mod, then compare a no-input checkpoint and one ordered action.
The disposable source save is unchanged and the loader is unstaged.
The Join launch plan now fetches the authenticated Host save before starting
TF3, creates a one-use disposable startup-load request, and verifies the exact
prepared file against Host admission before `save_ready`. A local encrypted
transfer/CLI integration test passed; a Join TF3 load and second-engine
checkpoint have not been observed. The full suite still exits with the five
previous native controller/observer fixture failures; the new Join tests pass.
The two-instance plan accepts explicit `--host-bind` and `--join-host` IP
addresses for a second machine; its default remains local loopback. LAN and
port-forwarded Internet have not been exercised.
Host/Join launcher buttons now use a qualified one-process runner: they stage
the exact loader if absent, create one native credential handoff, launch TF3,
and pass native credentials and the correct bridge directory to production
Host/Join. Join prepares its authenticated save before launch. The launcher
builds. A disposable-save TF3 check of the Host runner passed native bind,
save-transfer listening, bridge connection, Host listening, and host-local
save-ready. Steam restarted TF3 under a new PID; the runner now follows the
actual process instead of treating the first PID exit as failure. Join launch
and a second engine are still unverified; the UI is not yet playable co-op.

## Earlier terminal-halt attempts — 23 September 2026

The latest exact-build single-game run again cancelled one owned Stop and
applied host sequence 1 once at update 3210; TF3 visibly showed the vehicle
Stopped. Its native terminal gate parked, but the local report timed out
waiting for a separate game mailbox halt that cannot execute after parking.
The adapter now treats the correlated native `terminal_parked` event as the
normal-run halt proof and keeps unknown/disconnect outcomes fail-closed. Twelve
focused tests pass. This change has not yet passed the complete TF3 run.
Two subsequent disposable runs missed the five-second native arm; neither
captured, ordered or replayed a Stop. Do not repeat the unchanged UI timing
test. Improve the bounded test control offline, then verify this halt change
in TF3 and proceed to the two-instance checkpoint/action baseline. The source
save is unchanged and the loader is unstaged. Stage 6 and four-player
acceptance remain open.

The one-game ordered Stop path now worked on exact UI build 40392. A moving
owned vehicle's one-use native Stop was cancelled, host sequence 1 was applied
at its scheduled update 3114, and TF3 showed the vehicle Stopped. The report
has one real engine and one local receipt mirror; it is not two-game agreement.
The native terminal gate subsequently timed out after the local pass and
fail-stopped. Investigate that terminal event while preparing a second real
instance with the same save/build/mod, then compare no-input checkpoints and
one ordered action. Continue the separate-company road loop and Host/Join
toward playable four-player LAN and port-forwarded Internet. See the top of
`docs/completion-audit.md` for the exact evidence and test results.
An unmodded no-save second launch on this Windows/Steam profile left only one
TF3 process after 12 seconds. This rules out that simple same-profile launch
as a two-instance test; it does not establish a multi-game result.

## Previous exact-build Stop checkpoint — 23 September 2026

On installed UI build 40392 (SHA-256 `cbd8092757e539a42f56c51e00eeb7671d967a9072838d7a5f47d2de88348716`), the rebuilt native loader started, the production Host passed its native capability gate, and the disposable save connected to the live bridge. Host company 3141 received a fresh owner/prestate receipt for moving Road Vehicle 1, entity 66005; company 55652 remained the second-company receipt mirror. The native Stop arm was issued after the control hold/release sequence. Two fresh runs clicked Stop within 284 ms and 319 ms of arm, respectively. The arm expired without a claim, host order, replay, or stopped vehicle. The second run's bounded native deltas were all zero: factory, admission, correlation, callback, send return, marshaler return, post-send body, and dropped candidates. Thus the immediate failure is the selected GUI action not entering the observed native command sites on this build. Trace the actual build-40392 UI-to-command path offline before another live run; preserve the fail-closed arm and do not retry an unknown mutation. The disposable save SHA-256 remained `ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`; the loader was unstaged. Stage 6 remains open. After this one-game ordered Stop succeeds, resume the full two-instance multiplayer objective.

## Current Stage 6 state — 23 September 2026

The installed `TransportFever3.exe` now hashes to
`cbd8092757e539a42f56c51e00eeb7671d967a9072838d7a5f47d2de88348716`
(UI build 40392). The previous native Stop qualification below belongs to
`297ef05b740de1a3c4b375fd53ca69f371347a4b1546a37525f04aab6bc8e6e6`
(UI build 40390). During the latest one-game attempt the native pipe was absent
after this build change; no Stop was clicked, ordered or replayed. The loader
was unstaged, TF3 exited without saving, and the disposable save retained SHA-256
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`.
Requalify the current executable's native sites before another Stop trial.
The one-game cancelled Stop → host order → held execution → observed vehicle
postcondition remains the immediate Stage 6 integration target. Then verify
the two-instance synchronized baseline and action. Stage 6 remains open.

## Previous-build Stage 6 checkpoint — 23 September 2026

The replacement TF3 executable (SHA-256
`297ef05b740de1a3c4b375fd53ca69f371347a4b1546a37525f04aab6bc8e6e6`)
has been requalified at the exact native Stop observation and cancellation
sites. Two initial disposable runs expired safely without a cancellation claim:
the candidate factory belonged to a different command tag. Hash-pinned
disassembly identified the Stop tag (`0x32`) factory at `0x9ef112` and its
post site at `0x9ef188`; the native runtime was rebuilt and smoke tested.

In a fresh run, Road Vehicle 1 (entity 66005) was moving when its Stop was
armed and clicked. TF3 produced one correlated factory, admission, callback,
send return, marshaler return and post-send-body receipt, all tied to invocation
1. The one-use arm completed with callback result zero and the vehicle panel
still showed 25 km/h afterward. The separate native gate held, released,
re-held and detached. TF3 exited without saving, the hash-matched loader was
unstaged and the source disposable save retained SHA-256
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
This establishes a single-game native Stop cancellation on the current build.
The production Host CLI's cancellation → authenticated host action route has
model/network tests but has not yet been run through host ordering and held
execution in TF3. That one-game composition, with an engine postcondition,
is the next critical Stage 6 action. A second game/system is needed later for
multi-instance acceptance. Stage 6 remains open.

## TF3 executable changed during native Stop trial — 23 September 2026

Steam replaced `TransportFever3.exe` at 13:43:57 UTC while the qualified
native loader was staged. The installed SHA-256 is now
`297ef05b740de1a3c4b375fd53ca69f371347a4b1546a37525f04aab6bc8e6e6`,
different from the loader's exact-build qualification
`a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`.
The game loaded the disposable save, but the native runtime correctly did not
expose its IPC pipe; no Stop click, cancellation, host order or replay occurred.
The game exited without saving, the source save hash stayed unchanged, and the
hash-matched loader was removed. A subsequent staging attempt rejected the new
executable. The live checker now checks the staged manifest against the installed
executable before launch and rechecks after an unavailable runtime. Requalify the
new build's native sites before another live native trial. Host ordering and
replay can continue through focused model tests while that gate is closed.

## One-game checkpoint and native halt composition — 23 September 2026

The live diagnostic now shares one bridge owner between the checkpoint cycle
and exact-build native controller. In one disposable TF3 world it captured and
released a two-company checkpoint with production coverage, then requested a
native terminal halt directly from running. The checker observed continued
control traffic while the world was parked. The disposable save hash was
unchanged and the hash-checked loader files were removed after exit. This was
one TF3 process with no network peer, cancelled Stop, host-ordered action or
held replay; Stage 6 remains open. The next critical step is the cancelled
Stop through host ordering and held execution in one game, with correlated
postcondition. Try a second local TF3 process after that slice is working;
use two systems for multi-instance acceptance if local coexistence fails.

## One-use native Stop to host ordering path — 23 September 2026

An explicit Host CLI command now arms one selected Stop through the qualified
native IPC client after engine ownership and running prestate checks. The host
accepts only a completed, invocation-correlated native cancellation with exact
callback/send/post-send evidence and an unchanged engine Stop flag. It then
sends one authenticated host-local `action_request` through the same authority
and coordinator path as clients, and waits for the matching coordinated
`command_completed` frame. Any uncertain submitted outcome halts the session;
the helper never retries this arm or action. Focused native/host/network tests
passed 40/40. The full integration suite reported 932 cases: 926 passed,
5 failed, 1 skipped; the five failures are the existing native controller and
observer teardown cases. This route has **not** been exercised with a native
loader, TF3 action, or second game instance. Stage 6 remains open. The next
critical test is a qualified two-instance disposable-save run through capture,
native cancellation, host ordering, held replay and matching postconditions.

## Running-world owner receipt window — 23 September 2026

The targeted owner receipt now tolerates bounded update advance while TF3 is
running. It remains nonce/request/company/entity bound, must be produced after
the request, and may be at most 32 updates behind host admission; a paused
world still requires exact update equality. Engine `executeHeld` independently
rechecks ownership at application. In one ordinary TF3 instance using the
disposable two-company save, entity 66005/company 3141 returned a running
receipt: request update 3140, engine receipt 3142, observed update 3143. No
native loader or multiplayer action was used. TF3 exited without saving; the
save SHA-256 remained
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
The native cancellation-to-host-ordering path and multi-instance application
remain outstanding. Stage 6 remains open.

## Targeted engine ownership at host admission — 23 September 2026

The GUI bridge and engine script now answer a read-only lookup for a specified
vehicle entity and company. The Node bridge requires a nonce-bound receipt at
the observed update. The host waits for that exact receipt before assigning a
vehicle command sequence and rejects overtaking requests while inspection is
pending. The production Host CLI uses this route only when the native gate is
ready. In one paused TF3 instance, entity 66005 returned `found` for company
3141 at update 2998; asking for the same entity as company 55652 was rejected.
The game exited without saving and the disposable save SHA-256 remained
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`.
This was a read-only single-game check, without native loader or action
execution. Focused admission/bridge tests passed 33/33 and mod review passed.
The full integration run reported 926 cases: 920 passed, 5 failed, 1 skipped;
all five failures were older native controller/observer teardown cases. The
next critical action is to route one natively cancelled vehicle
intent through host ordering and held execution, then verify its correlated
engine postcondition. Stage 6 remains open.

## Paused TF3 ownership receipts — 23 September 2026

The first read-only live probe found a mod dispatch gap: company inspection
returned host company 3141 and second company 55652 at held update 3075,
but vehicle discovery timed out because it was polled only in vehicle-test
mode. Vehicle discovery now runs in the common GUI bridge dispatch. After
reviewing and staging that mod, a fresh load of the same disposable save
returned owned vehicle 66005 for company 3141 and the same company pair at
held update 2962. The save SHA-256 remained
`CCBF4BEB740E53323E06D20890FD029C8E174D3E85EFB06801A8B4275C762FB5`
after quitting without saving. Focused discovery/inspection tests passed
11/11 and mod review passed. No native loader was used. This verifies
read-only receipts in one TF3 instance; the Host CLI capture command and
native action route have not been run together in TF3. The next critical
action is to connect fresh engine ownership and the cancelled vehicle intent
to host ordering and held execution, then verify one application with a
correlated postcondition. Stage 6 remains open.

## Host scheduling clock wired; ownership still open — 23 September 2026

The production Host CLI now samples the fresh game bridge update count for
authority scheduling. One authenticated request uses the same sample for its
coordinator checks, authority acceptance and proposal. A missing or stale
bridge produces an invalid clock and fails the request closed. Focused network
and clock tests passed. The Host CLI still lacks an engine verified vehicle
ownership resolver, so a real native-cancelled intent cannot yet enter host
ordering. The next step is to consume a fresh ownership receipt at the held
update, then route one cancelled vehicle intent through the existing
coordinator and executeHeld path.

Composition audit: the first-party provider requires a `companies` Map with
two to four distinct verified members when its adapter is constructed. The
Host local wrapper now waits for the authenticated coordinator capture frame
to construct its adapter with that roster. The host has a matching capture
entry point and the wire protocol admits the capture kind; focused network
tests pass. The Node bridge has a bounded reader for the existing read-only
vehicle discovery receipt, now also consumed in the paused single-game trial
above. A GUI vehicle selection alone does not prove ownership.

The Host CLI now has an explicit one-attempt
`multiplayer-capture-two-confirmed` command for the saved two-company test
fixture. It waits for a paused, fresh `company_inspection` receipt, checks the
current host company/update and native gate again, binds the authenticated
host and second player, then sends coordinator capture. This path has passed
focused network and mock-mailbox tests. It has not been exercised in TF3 and
does not select arbitrary companies or support three/four-company admission
yet. The live action ownership resolver and cancelled-intent route remain
unwired, so Stage 6 is still open.

The capture integration run reported 921 test cases but did not exit after
the final case; it was stopped after over two idle minutes. Six native
controller/observer/IPC cases failed in that run. Five were the previously
observed teardown failures; the IPC rebinding case passed when run alone.
The focused capture/network/provider tests passed 27/27. This is an
integration-suite failure, not a TF3 runtime qualification.

## One-use vehicle Stop cancellation — 23 September 2026

The native arm now substitutes a distinct read-only failure-completion vtable
at the original indirect call, after validating the target entity, command,
thread and callback shape. It is default disabled, expires after at most five
seconds, and is exposed only through a bounded authenticated host IPC request.
Owned fixture and native host tests cover one-use claim, mismatches, timeout,
revocation, callback failure and cleanup.

One fresh disposable-save Road Vehicle 1 Stop was armed and clicked. The native
arm claimed invocation 1 exactly once for entity 102852/stopped 1; callback
and marshaler returned 0, followed by send return and one correlated post-send
receipt. The vehicle panel continued to show the vehicle moving, at 35 km/h
when checked. The checker also held, released, re-held and detached the native
gate. An earlier arm expired before any click, with no claim or game mutation.
TF3 was closed without saving, the staged loader removed, and the original
save hash remained unchanged. This qualifies one local cancellation and UI
recovery sample. Stage 6 still needs host ordering, replay and exactly-once
application across the intended multiplayer path; readiness remains below
**6/10**.

## Correlated cleanup qualified once — 23 September 2026

One fresh disposable-save Road Vehicle 1 Stop produced exactly one correlated
post-send-body receipt tied to admission and send return by invocation token,
thread and stack identity. The existing six receipts also remained one each;
the UI reached Stopped, and the separate native gate held, released, re-held
and detached. The generic send-body path fired thousands of times, so its raw
count is diagnostic only. TF3 was closed without saving and the temporary
loader removed. Owned correlation tests and focused IPC/client/checker tests
passed. This was the earlier single-game normal-path qualification. The later
EH4 assessment and bounded cancellation sample are recorded above. Host
ordering and exactly-once application remain outstanding. Same-process world
reload remains a separate lifecycle issue.

## Seventh-site live finding — 23 September 2026

The exact-build post-send-body NOP at `0xe17838` is reachable in TF3, but it
is a busy generic scripting continuation. In one fresh disposable load, its
raw count rose from 555 to 6,346 during the action window, while one stock
Road Vehicle 1 Stop produced one each of the previously qualified six-site
receipts and the UI displayed Stopped. The checker correctly rejected its
new exactly-once assumption. The raw continuation count cannot prove that
this vehicle invocation completed cleanup. The failed checker shut down the
native runtime; TF3's Return to Desktop UI hung, so the exact verified test
process was stopped without saving and the hash-matched loader removed.

The next native increment is to bind the post-send-body continuation to the
specific admitted invocation using its thread and caller stack identity, then
repeat a fresh single-load trial. Keep cancellation disabled until the
correlated cleanup receipt, exception path, UI recovery and one-use lifecycle
are qualified. Stage 6 remains open.

## Fresh six-site passive qualification — 23 September 2026

One fresh-process, single-load disposable run observed exactly one stock Road
Vehicle 1 Stop across all six native sites, including the new normal send and
marshaler returns. The UI displayed Stopped; the separate gate held, released
one boundary, re-held and detached; TF3 exited without saving. This is a
single-game passive qualification, not stage 6. The TalCo bridge was inactive
for that save, so no game-side clock correlation was claimed. The previous
same-process reload failure remains unresolved at its lifecycle boundary;
first-thread-only hit accounting is confirmed in code and owned tests, but
the failed run did not record the two thread IDs needed to prove migration.

After correlating cleanup, use the qualified normal-return evidence and
independent ABI review to test one authenticated, expiring, atomically consumed
cancellation for one exact reversible Stop. Require unchanged live userStopped,
responsive UI and clean teardown before connecting the already guarded
executeHeld route to host ordering. A safe same-process world reload requires
an explicit quiescent epoch rebind; no owner reset has been added.

## Earlier six-site gate — 23 September 2026

At that point readiness was below **6/10**. Two normal-return observation sites
were implemented and owned-tested, but the first six-site live run never reached an action-ready
state after a second world load in one process: public tick/update advanced
3,422 with no native observer-hit increase. Diagnose whether the observer's
first-thread-only counter saw a new world thread; then run a fresh single-load
trial and qualify normal send/marshaler returns. Subsequent normal cleanup and
bounded cancellation results are recorded above. Neither a passive receipt nor
the previous gate pass met stage 6. See `native-review-handoff.md` for the
failed run and exact safety cleanup.

Integration builds passed. The final elevated full suite found **912 tests:
906 passed, 5 failed, 1 skipped**; the five out-of-process native debugger
teardown failures remain open. The full multiplayer goal remains active and
incomplete.

## Live callback and speed-qualified gate — 23 September 2026

Readiness is approximately **5.9/10**, not stage 6 or the requested stage 8.
The exact-build native observer now sees one stock road-vehicle Stop action
through factory → scripting admission → correlated native callback wrapper,
with one copied pointer-free receipt (entity 102852, stopped 1, entry result 0,
callback result 1). The callback wrapper is not proof the Lua/UI completion ran.
The first bridge-connected gate check failed its public-clock assertion at 4x;
the native release/re-hold had occurred, but the checker assumed an unqualified
one-boundary-to-one-update mapping at that speed. The checker now requires
normal speed. A separate speed-1 gate-only run passed one native release,
one public tick/update, re-hold, detach and resume. The failed trial's
shutdown intentionally fail-stopped its game; it did not qualify normal
teardown. TalCo was confirmed active for both disposable loads and the
original save hash stayed unchanged.

A repeat stock road-vehicle stop at observed speed 1 confirmed an empty
admission progress pair and the admission/callback thread (37136), but its
combined gate check exposed a further issue: native boundary hits stayed
fixed while the public update count advanced once during hold (1037707 →
1037708). The checker failed closed, and the disposable game was exited
without saving. The checker had counted repeated reads of one stale game-side
sample as separate stable observations. It now requires fresh producer
counters and exactly one public tick/update per speed-1 release. A further
disposable gate-only run passed this stricter criterion: held tick/update
1207524/1037489, re-held 1207525/1037490, native hits 260 → 261, detached
and resumed 1207527/1037492. The earlier failure remains in the audit; it
does not alone establish a world mutation after hold. General synchronized
simulation and the action-containing hold sequence remain unqualified.

Next: keep the callback route passive while qualifying the send continuation, Lua marshaler
return, and exceptional cleanup. Only then attempt one-use cancellation.
Capture a semantic intent *after confirmed suppression*, feed both host and
client actions through the retained coordinator, apply once at the native
boundary with correlated postconditions, and compare two real instances at
matched updates. Expand from that slice to the complete separate-company road
loop, checkpoint recovery and LAN/Internet/four-player acceptance. Model tests,
the callback receipt and the speed-1 gate are necessary but do not satisfy
stage 6 alone. Current full suite: **911 discovered, 905 passed, 5 failed,
1 skipped**; the five are older out-of-process debugger fixture teardown
failures. No multiplayer gameplay family is yet enabled.

## Read-only admission qualification — 22 September 2026

Readiness is about **5.8/10**, still below stage 6. A second disposable TF3
run confirmed the stock Train 1 stop command's result byte was zero at the
admission boundary and its live callback value resolved to the exact-build
callback vtable/invoke shape. The vehicle then displayed Stopped. This
qualifies two more inputs to a bounded rejection experiment, but no real
action was suppressed, host-ordered or replayed. The next implementation
step is a one-use, exact-action, recoverable no-mutation cancellation trial;
after its callback/cleanup behavior is verified, connect intent acceptance
and exactly-once execution to Host/Join. Do not count the current diagnostic
as stage 6. The full regression suite has five reproducible older native
debugger-fixture failures, separately recorded in `completion-audit.md`.

## Owned cancellation fixture — 22 September 2026

The MOV-site target-substitution mechanism now has an isolated x64 fixture:
`Build-OwnedVehicleCancelFixture.ps1` and `test/native-owned-vehicle-cancel.test.mjs`.
It verifies register emulation, callback invocation without original submission,
nested calls, exception unwind and sequential teardown. It does **not** raise
readiness from 5.7/10: no TF3 cancellation, authoritative ordering, or replay
has been observed. Next, qualify the real callback/value shape and its UI
completion semantics under a bounded disposable-game test before enabling any
production cancellation.

## Live stock-action qualification — 22 September 2026

Readiness is **5.7/10**, below the requested 6/10 gate. A disposable TF3 run
now observed one stock Train 1 stop action through the exact-build native
factory and common scripting submission sites: factory 1, submission 1,
correlated 1, dropped 0, entity 163575, desired stopped value 1. The same run
held, released exactly one engine boundary, re-held, detached and resumed.
The factory/submission observer reported cross-thread activity; the world
boundary was on a third reported thread. This proves a real passive action
route, **not** suppression, host ordering, or replay. The first trial's action
window expired before its click and produced no factory hit; the controlled
second trial succeeded. The exact disposable save and staged loader were removed
after TF3 closed; the source save hash remained unchanged.

Next critical step: qualify the common scripting send body's ownership and
callback/progress exit paths across the observed thread transfer, then implement
capture-before-mutation and suppression with a fail-stop reserve. Feed the
pointer-free intent through retained Host/Join ordering, apply once under the
qualified update gate, and compare native/public postconditions. A second real
TF3 process and no-input checkpoint baseline follow. This work is unfinished
implementation, not an external blocker. No supported multiplayer gameplay
family is released yet. The full suite is **909 discovered, 879 passed, 0 failed,
30 skipped**; the skipped cases are not evidence of live qualification.

Older readiness/test counts below are chronological and superseded here.

## Active stage-6 path — 22 September 2026

Readiness is approximately **5.3/10**. The stage-5 native-control gate is now
real rather than prospective: the production-qualified disposable TF3 run held
the world at update 2978, advanced exactly once to 2979, re-held, detached and
resumed at 2980 while authenticated IPC remained live. A separate run held and
terminal-parked directly from running generation zero at update 2979 while
control traffic remained responsive and the native/bridge clocks stayed fixed.
Host/Join now requires that exact gate contract, continuously drives each real
engine adapter, refreshes a native 15-second fail-safe lease, and revokes
admission on malformed, unmatched, timed-out, silent or disconnected gate
traffic. Older 4.5/10 and “hold absent” statements below are chronological, not
current.

The shortest path to 6/10 is now:

1. Use the completed exact-build ABI inventory in
   `docs/vehicle-abi-static-evidence.md`: 46 decoded calls prove the factory
   lifetime and Add ownership obligations, while the scripting route proves
   Add is not universal. The alternate adapter queues through TLS or calls the
   apply wrapper directly.
2. Qualify bounded observation of the stock vehicle UI path without suppression:
   factory → common scripting submission identity, selected adapter, thread,
   nesting, output lifetime and detach survival. Add is evidence for one branch,
   not the global admission boundary. Do not reuse the quarantined debugger
   profiles as authority.
3. Implement suppression at the common submission interface only after an owned fixture proves every cleanup and
   callback obligation. Reserve capture capacity before suppression; uncertainty
   or overflow must sticky-halt rather than execute locally or promise replay.
4. Publish a pointer-free semantic intent through native IPC only after confirmed
   suppression. Host and client origins use the same coordinator admission and
   order. Resolve vehicle/company identity locally on each instance and recheck
   ownership at execution.
5. Under the real update hold, consume a one-use authorization, apply once, and
   require callback plus observed state/update/finance postconditions. Duplicate,
   late or unknown results halt without retry.
6. Demonstrate that cycle on two actual TF3 processes from one authenticated
   transferred save, then run the no-input six-domain checkpoint baseline before
   expanding the supported action set.

After 6/10, stage 7 completes the road loop and separate-company economy; stage
8 integrates divergence recovery/checkpoint reload; stage 9 performs sustained
multi-instance/LAN/Internet release qualification; stage 10 is the verified,
packaged, documented four-player release. Rail, shipping, aviation and other
families remain explicit unfinished scope until implemented.

Current clean verification is **905 discovered, 875 passed, 0 failed and 30
skipped** in 53.724 seconds. A deliberate legacy debugger-fixture run separately exposed five
teardown failures and is recorded in the handoff; the production in-process gate
does not use that path. There is no implementation blocker. Cross-machine,
four-player and port-forwarded Internet acceptance still requires suitable
external machines/network access later.

## Correlated-boundary critical path — 22 September 2026

The live post-site observer is now correlated with the public bridge clock in a
real disposable world: 128 native hits accompanied exactly 128 tick and 128
update increments at speed 1, on one owner thread. The generic always-held
controller and its authenticated owned-process adapter also pass exact-release,
responsive-traffic, disconnect, timeout/unknown-outcome, duplicate/order, epoch
and malformed-frame cases. Neither is connected to TF3 yet.

The immediate critical path is narrower and evidence-led:

1. The owned cross-image prerequisite now passes beyond `rel32` range with
   exact DLL/EXE EHCONT destinations, 8/8 complete-state hold/resume cases,
   56/56 actual-PC unwinds, native-exception propagation and bounded teardown
   behavior while CFG/CET remain enabled. Before live activation, implement the
   production terminal park, immutable owner/generation publication, stack
   headroom and live mitigation gates, and explicit resume/detach lifecycle.
   Keep VEH bounded to classify/emulate/publish/redirect.
2. Connect that lifecycle to the exact TF3 post site and prove live hold,
   single advance, sticky disconnect halt and explicit
   resume/detach in the disposable game while IPC and GUI traffic remain live.
   Extend the 1:1 boundary correlation across batch edges and supported speeds,
   and continue distinguishing protocol halt, held simulation thread and proven
   engine halt.
3. Bind that qualified adapter to retained Host/Join, then run two local TF3
   instances from one authenticated save at matching updates and compare the six
   public checkpoint domains. Hidden RNG remains an explicit blind spot.
4. Qualify TF3 vehicle factory `0x9EEE60` through admission `0x9D3120`, including
   command/output-handle lifetime and callback obligations. Publish only after
   confirmed suppression; send semantic desired state through existing
   host-authoritative order; resolve local identity, recheck ownership and apply
   once with callback plus state/finance postconditions.
5. Continue through the full road loop and checkpoint reload/recovery before
   cross-machine, four-player LAN and port-forwarded Internet acceptance.

The conventional arbitrary-RIP `PROC FRAME` route is explicitly rejected by a
real unwinder test and remains disabled. This is engineering work, not an
external blocker. Readiness stays **4.5/10** until actual TF3 hold and the first
two-instance authoritative action pass.

## Current critical path — 22 September 2026

Commit `95d79c8` now provides the shortest genuine path from Steam launch into a
real TF3 engine instruction: exact-hash collision-refusing staging, one-shot
owner-only credential handoff, exact WinHTTP ABI forwarding, probe-gated runtime,
exact mapped-image/site qualification, post-iteration `INT3`/VEH observation and
authenticated IPC reporting. A disposable live run reported one hit on one
thread with no cross-thread fault, restored the byte on authenticated shutdown,
and TF3 continued from displayed update 3037 to 4368 before cleanup. This passes
the read-only observation gate, not the engine-control or multiplayer gate.

The implementation order is now:

1. Turn the qualified boundary into a bounded real hold/release/halt primitive
   while its separate IPC worker continues receiving traffic. Prove failure and
   disconnect halt the actual simulation, then correlate the boundary with the
   existing game-side update and six-domain checkpoint receipt.
2. Bind that production adapter into the retained Host/Join composition. Run two
   local TF3 instances from one transferred disposable checkpoint and compare
   all public domains at the same engine update; report hidden RNG explicitly
   and investigate divergence before broadening action replication.
3. Capture and suppress one stock reversible vehicle stop/start action, route
   host and participant origins through the same authoritative sequence, resolve
   instance-local identity, apply once and require correlated native ownership,
   state, update and finance postconditions. Unknown execution halts without
   retry.
4. Complete the supported road loop: roads, depots, stops, vehicle
   purchase/assignment/start-stop/sale, line create/edit/remove, separate-company
   controls, native charges, operating cost/income and cross-company rejection.
   Veto every unsynchronized native action during multiplayer while leaving
   ordinary single-player behavior alone.
5. Integrate coordinated checkpoints, authenticated save transfer/reload, fresh
   epochs and duplicate fences; then execute disconnect, lateness, divergence,
   native-exception and rejoin recovery. Only after that run cross-machine,
   four-player LAN and port-forwarded Internet acceptance.

Current verification is 878 discovered, 848 passed, 0 failed and 30 explicitly
skipped in the unrestricted suite. The focused new native/control set passes
20/20. The control, control-IPC, negative continuation, same-image cold and
cross-image native builds pass MSVC `/W4 /WX` and their applicable smoke tests.
The existing production post-observer, runtime, native IPC and reversible
WinHTTP proxy builds also pass at this milestone.
Single-game in-process observation is verified; two-instance/cross-machine/
four-player/Internet remain unperformed. There is no external blocker to the
next control investigation. Readiness is approximately 4.5/10: observation is
real, but actual in-process control and the first two-instance ordered action are
still below the 5/10 gate.

## Superseding next critical path — 21 September 2026

The full multiplayer objective remains active. Commit `db22017` establishes a
real single-game vertical slice through automatic disposable load, exact-build
simulation observation, authenticated native hold/release, and one reversible
HostAuthority-sequenced vehicle action with observed restoration. Commit
`8333ae3` adds the production-gated live checkpoint producer, host-local authority
path and bounded action-trace machinery. Neither establishes multiplayer
readiness.

Continuation evidence: the native controller now uses strict tracked-thread,
exception-address, RIP and execution-slot ownership; cleanup forwards all
second-chance traps and has a real unowned-exception regression. The observer's
active classifier now also rejects every second-chance event before owned-site
handling. Authenticated
client fanout now carries only verified host frames, providing a safe prerequisite
for later production adapter construction. The host-local composition routes
host actions through a real authenticated loopback participant, fails closed
while its injected adapter attaches, closes late adapter resources, and respects
explicit bind addresses; the CLI still needs a real production binding factory.
A corrected disposable launch reached
`Game is ready`, but TF3's shipped UI source proves the direct `--script`
`app.loadGame` call bypasses the stock `ProgressPage` React mount and causes the
observed MainMenu/WindowContainer faults. Automatic load remains implementation
work, not completed functionality. A fresh ordinary-UI disposable run passed the
production public-domain checkpoint gate at exact held/released update 3052;
this is single-game evidence only. A separate lease-loss run proved the actual
TF3 engine halted at update 3335 after helper renewal stopped. The last fully
passing exact unrestricted suite discovered 850 tests: 820 passed, 0 failed and
30 native executable tests were skipped because Windows Security quarantined the rebuilt observer. The prior
pre-quarantine integration tree passed 830/830; current native source passes
MSVC `/W4 /WX /Zs` syntax/type checking.

The reviewed handler/apply sites were exercised through bounded WinDbg trials.
They show continuous autonomous apply traffic, exactly one nested vehicle
handler pair for each reversible stop/start action, and payload bytes encoding
entity 66005 at `+0..+3` plus stopped state at `+4`. Rechecking the raw returns
corrected the earlier derived-RVA error: all three imply base
`0x7ff6386e0000` and align with the exact-build dispatcher/apply call returns.
That is coherent routing evidence, not independent module-map or safe-hook
qualification; bytes `+5..+7` are unqualified padding rather than a flags word.
This narrowed the next ABI work,
but did not pass safety: the final detach produced a TF3 execute-at-zero access
violation, and Windows Security quarantined the rebuilt custom observer as a
behavioral defense-evasion detection. Do not bypass protection or enable either
live action/command profile. A clean supported attach/detach mechanism is now a
required prerequisite to interception work.

Work in this order:

1. Keep live `--profile command` quarantined. Strict trap ownership and teardown
   regressions are implemented, but independently review the `0x80000004` crash
   at admission RVA `0x9D3120` and qualify a safe semantic command boundary on
   disposable instances before any suppression experiment.
2. Implement immutable command capture, origin suppression, host admission for
   host and participant actions, per-instance entity resolution, exactly-once
   replay and correlated native postconditions. Cover both stock vehicle-window
   and bulk-manager paths; do not leave unsynchronized bypasses enabled.
   The mod-owned vehicle action now uses the documented after-execution callback
   and verifies its callback payload plus public postconditions. Stock UI
   capture/suppression remains the missing boundary.
3. Construct the real production `EngineSessionAdapter` in Host and Join. Reuse
   the gate's persistent binding and authenticated client subscription, keep
   transport receipts outside world evidence,
   and provide a complete hold/release/halt lifecycle that continues receiving
   control traffic while simulation is paused.
   The reusable participant lifecycle now validates the signed two-to-four-
   company capture, bounds frames while attaching, preserves order and fails
   closed. Host and Join CLI now use the first-party provider, and Join verifies
   the downloaded save and subscribes before `save_ready`. This is integrated
   composition, not live multiplayer proof: the native controller still reports
   `productionQualified:false`.
4. Resolve background synchronization. The game producer now reads public
   `Town`/`TownBuilding` growth controls and bounded construction parameters in
   addition to the other public domains. Production admission now requires all
   six public domains and allows only explicitly unavailable hidden RNG state;
   the live single-game producer passed this gate. Compare two instances at the
   same updates, investigate any baseline divergence, and either qualify enough
   deterministic state or implement concrete host-authoritative replication.
5. Implement coordinated save checkpoints/reload, authenticated redistribution,
   persistent company assignment, fresh epochs and duplicate barriers after
   recovery. Never retry unknown mutations or repair balances.
   This includes a supported or qualified way to enter TF3's stock
   `ProgressPage` load lifecycle; the current direct startup script is diagnostic.
6. Complete the road loop and native accounting: roads, depots, stops, purchase,
   assignment, start/stop, sale, lines, construction/purchase costs, operating
   costs and income, including cross-company rejection.
7. Only then run two-instance no-input/action/recovery tests, followed by LAN,
   port-forwarded Internet and four-player acceptance.
   The two-instance planner now emits isolated Host/Join commands and an honest
   evidence collector; it has not launched or verified two TF3 processes.

Current safety gates are engineering work, not an external blocker. The lack of
a second controlled machine leaves cross-machine acceptance open, but does not
justify stopping source/native integration. Exact status, crash evidence and the
consolidated procedure are in `native-review-handoff.md`.

## Current priority — native integration, 21 September

The user has authorized a native-first feasibility track, superseding the older
script-first preference below. The active goal is a usable up-to-four-player,
separate-company setup, not completion of isolated Phase 2 script diagnostics.
See [native integration](native-integration.md) for the reference audit, actual
native artifacts, missing engine hooks and ordered acceptance gates. Prioritize
two real simulations staying aligned before expanding construction features.
No further stop-placement test is requested for the pending matrix repair.

Review-batch update: the pinned TF2 clone was inspected locally at exact revision
`9f99097cb05333db18015da8296b7356c76a1612`; it is the clone's current default
head, is MIT-licensed, and no implementation code was copied. Static TF3 mapping
now fingerprints the exact PE and candidate ranges, validates bounded x64 unwind
chains, and distinguishes chained `GameSim::Step` assertion fragments from their
primary runtime entry. Exact static match remains non-activating. The common
labelled marker at RVA `0x55B70` is only `ret` plus `int3` padding, so it is not a
usable instrumentation API. The standalone V1 probe adds a structural mapped-
image consistency check but still exposes zero gameplay/hook capabilities.

Checkpoint parsing now has a schema-v2 whole-world coverage contract for
towns/growth, economy, topology, vehicles, company ownership, lines/services and
RNG/hidden state. The current engine producer remains schema v1 and therefore
non-comparison-ready. Next implementation dependency is a qualified, read-only
native observation boundary plus real producers for those domain digests; only
then can the two-instance no-input baseline start. Do not connect remote gameplay
or claim a canonical checkpoint from the schema contract alone.

Revised 20 September 2026 following the user's scope and economy clarification.
This is the current plan. Historical status is in completion-audit.md and
archive/roadmap-before-scope-review.md; historical blockers do not override this plan.

21 September update: the 08:08 run passed clock, pause, ownership and road-membership
checks, then failed at transform copying. The current repair follows stock TF3
matrix callers (`matrix:cols(0..3)`), correcting the misleading declaration comment
used by the first reader. Complete readback remains unverified; resource/params
reads follow the matrix. Legacy full-proposal capture also needs its matrix
access corrected before reuse; it is not this workflow's replay input. Do not
advance to replay or Phase 2 acceptance on the strength of offline checks.

Current pre-replay status: the 21:09 preview/cancel check is complete. Do not
repeat it or request a placed stop to investigate the same missing fields.
The 20:51 runtime report identified absent singular `laneConfig` on both road
segments and absent stop `modelInstance`. Singular absence now round-trips as
null, while plural `laneConfigs` remains required; reconstruction requires matching
native absence rather than defaulting an empty vector. The model remains a blocker.
That check confirmed the lane errors are gone. The stop still exposes neither
modelInstance nor the alternative model/edgeEntity/param fields; oneWay and name
are present but insufficient. Next work must identify a supported data source or
record the native boundary as blocked, not extend a field-guessing test loop.

The next implementation batch adds read-only **post-apply** inspection of the
actual returned stop entity via public EDGE_OBJECT, PLAYER_OWNED, BASE_EDGE and
StreetSystem reads. It captures the construction resource, relative position,
transform, typed parameters and observed side/options. This follows the agreed
record/reload experiment, not a pre-spend multiplayer interception requirement.
The diagnostic artifact is deliberately not accepted by the existing replay
case loader. Mapping post-build edges to the untouched checkpoint and qualifying
the public SimpleProposal construction path remain required before replay.
Use [the placed-stop check](road-stop-readback-test.md) once staged; do not repeat
preview-field probing or click the old Capture placed stop for this new path.

Next local proof (user clarification): record one normal action, reload its
exact pre-action disposable checkpoint, then explicitly replay it once and
compare ownership, resulting construction and actual charge. This avoids double
application and does not require a pre-commit interception hook for the local
experiment. Capture/reconstruction comes first; live host ordering and concurrent
admission remain separate requirements, not prerequisites to this replay test.
Revision 7 integrates bounded copied road-stop capture into the passive observer;
native field access and reconstruction still require game evidence. The guided
local replay workflow is implemented in Debug, with explicit confirmation only;
see [the bounded procedure](road-stop-replay-test.md). It is not Phase 2 completion.

The first live full capture rejected `nodeConfigs` before exporting an artifact.
The public node-configuration schema is now preserved across capture, strict
parsing and native reconstruction, including lane connections, crosswalks and
traffic-light settings. Local replay confines these edits to existing captured
road endpoints. Offline checks do not establish native replay success; restart
from the untouched checkpoint with the repaired staged mod for that same gate.
The subsequent preview identified a runtime/declaration mismatch:
userModifiedLaneConnections is absent. Capture preserves it as null, and replay
requires matching absence rather than inventing false or writing an unavailable
field. This compatibility repair still needs the native capture/replay result.

The local replay adapter now composes baseline checking, model resolution,
native command preparation, one-shot submission and observed stop ownership/debit.
It is now registered behind the local company-test bridge, with a helper request
method, correlated receipt polling and a guided launcher flow. Its limited
success result deliberately does not claim native funds enforcement, complete
road-state equivalence or a working second-company service. These remain Phase 2
acceptance requirements. Reuse existing checks during integration; add tests only
where a changed safety boundary requires them, per the user's latest instruction.

`tools/road-stop-replay-case.mjs` records checkpoint identity before placement and
then creates a capture artifact from the apply envelope. Both outputs are exclusive
new files; neither operation dispatches construction or proves the loaded save.

The helper's `requestRoadStopReplay` requires explicit reload confirmation,
matching checkpoint identity, a fresh paused observation and the captured local
company. Publication is exclusive: a consumed request remains on disk across
helper shutdown. Do not remove it to retry an uncertain operation. The engine
also preserves its saved consume latch. This is one-shot disposable-save proof,
not yet general multiplayer construction or second-company service acceptance.

The read-only vehicle service collector is now registered behind the local bridge.
After verified setup, explicit start/end observations bind to that service's saved
receipt, require paused endpoints, and permit simulation between them. They copy
the vehicle account's exact-window net and four raw maintenance-filter values,
with ownership, route and helper-session rechecks. The helper exposes this as a
post-assignment continuation; no new launcher controls or manual test are requested
yet. Setup still ends with `SETUP_VERIFIED_SERVICE_NOT_OBSERVED`, and raw collection
does not change that acceptance status.

Next: qualify native accounting filter semantics and observed service operation, and
finish the normal-placement route to target-company assets. Do not substitute
company balance deltas, historical visit flags or another coordinate-picker
feature for this missing acceptance evidence.

Raw service observations now extend the same local setup report without changing
its setup-only outcome or claiming a completed trip. The current public-API
[company-control audit](company-control-api-audit.md) finds a target-company
parameter for direct construction but no controlled-player switch for stock tools.
Do not mistake a display-only company selector for playable company control.
Continue via captured native placement and explicit target-company submission;
the pre-action admission and correct native owner/debit still need qualification.

The offline replay artifact now also binds the stop model's resource name and
numeric ID. This prevents a same-ID/different-resource match from passing the
offline identity check. Source now captures the name through the protected native
event callback and carries it in a schema-2 diagnostic envelope; this read still
needs native permission qualification and reload-time resolution. The read-only baseline preflight is experimental, not a
claim that the entire loaded save is identical. Replay uses the existing durable
company transaction boundary; these preparation changes do not enable execution.

Current priority (20 September, after the 12:24 UTC setup run): reuse normal
native placement and capture its complete proposal/command. Stop extending the
station coordinate picker or treating guessed placement as an acceptance task.
Funding passed; depot construction was rejected with native `Collision`, before
either station. See [normal placement capture](native-placement-capture.md) for
the newly identified declared GUI preview callback and remaining capture/replay
boundaries. Stock mission source additionally handles `builder.proposalCreate`
and `builder.proposalApply` through guiHandleEvent, with restriction results.
Verify this concrete lifecycle candidate in free play before a preview wrapper
or native companion. No interception or multiplayer construction is implemented yet.
The passive lifecycle observer is now implemented; follow
[normal-placement observation](native-placement-observer-test.md) for its bounded
free-play delivery check. Revision 7 adds bounded copied proposal files to the
scalar summary logs and leaves native actions
unchanged. It does not require the Phase 2 setup helper or a custom placement UI.
The first free-play observation recorded readiness but no native event samples.
Revision 4 retains the restricted-context-safe observer and tests the GUI route
with bounded startup retries and an established read-only status control. Revision
3's one-shot check ran at game readiness and returned no acknowledgement; it did
not exclude subscription initialization timing.
This repairs diagnostic ambiguity, not a proven native capture/replay path.
Latest live result: revision 5 recorded eight create samples and one apply sample
from `streetTerminalBuilder`, with successful outer payload inspection and zero
observer errors. The normal roadside-stop lifecycle route is locally verified.
Next gate: supported proposal representation and execution-boundary qualification
for company-bound capture/replay. Event delivery is not interception or replay.
Revision 6 adds fixed, bounded proposal-field diagnostics for the normal roadside
stop: counts, owner fields, cost/error flag and result count. This is implemented
for live field qualification, not a complete codec or an execution command.
Revision 6 is now locally qualified: eight create samples and one apply sample
returned readable fields with no observer errors. The stop proposal adds and
removes one road segment and adds one edge object, owner 3141, declared cost
67500, critical=false. Full segment/object serialization, entity references,
pre-execution admission and company-bound replay remain the next gate; the
reported cost is not evidence of a verified debit.
The offline copied-proposal schema/canonicalizer and file checker are now
implemented for the road-stop subset; see road-stop-codec-spec.md. Revision 7
connects native extraction, with live field compatibility not yet qualified.
An unregistered reconstruction candidate now round-trips the copied fields in
executable Lua fixtures. The apply-only replay-case record binds the input to a
pre-placement save hash and matching game/mod hashes, but cannot establish which
save is loaded. Native reconstruction, execution and accounting remain unverified.
Unsupported node-configuration/construction/terrain variants reject explicitly.

Earlier live evidence (20 September, 10:23 UTC): the modular passenger station
template evaluated successfully: three modules, two subconstructions and scalar
resource cost 283500. This verifies evaluation only, not placement or spending.
The source now connects depot, vehicle, two station builds and line assignment
through correlated engine receipts. A combined local setup controller has passed
automated mailbox/report tests. A guided launcher flow now prepares read-only
in-game point/model selection and requires a separate canonical-plan confirmation.
See phase2-guided-setup.md for the bounded disposable-save setup qualification.
Real target-owned stop placement/connectivity, native
insufficient-funds qualification and operating-accounting observation still
precede acceptance. No new multiplayer capability is claimed.

## Goal and invariants

Up to four players, each with a separate company and independent money/assets.
One host orders and validates every player's requests, including its own.
Automatic authenticated save download; LAN or host-side port forwarding.
No shared-company feature, VPN requirement, relay infrastructure or host migration.

Historical script-track rule: supported script/public APIs first and no automatic
game launch. The current mission permits only deliberate, bounded assistant-launched
TF3 investigation under `AGENTS.md`; game-file patching, silent funding, save
overwrite and public release remain prohibited. Native process attachment is
not part of the current implementation and is never implied by installing the
mod; it is a separately authorized, opt-in compatibility phase described below.
Unknown execution must remain unknown: no automatic retry or compensation of
uncertain mutations. Keep diagnostics separate from supported multiplayer claims.

## Compatibility strategy and native boundary

Update, 20 September: the user approved considering an opt-in native companion
for unsupported action capture. Bring forward the **feasibility investigation**
from Phase 8 alongside Phase 2; this does not make native mode implemented or
qualified. See native-compatibility-prototype.md for scope, failure boundaries and
the staged validation plan. The historical no-launch rule is superseded only by
the bounded 21 September permission above; process attachment still requires its
own qualified, fail-closed path.

The shipping foundation is a host-authoritative, typed-action pipeline: capture
or originate a supported intent, bind it to the authenticated player's company,
order it on the host, execute it at the agreed update, then verify a correlated
engine receipt and relevant state. Networking, ownership, ordering, receipts,
halts and recovery are required regardless of how an action is captured.

The installed public TF3 declarations provide command submission and selected
UI recipe replacement, but no documented global native-command interception,
cancellation or deferral interface. Therefore the supported set has explicit
compatibility tiers:

| Tier | Scope and promise | Capture boundary |
|---|---|---|
| 1. Supported multiplayer actions | The declared road-transport action set and approved mod set. | Mod-owned UI/tools or individually audited public recipe replacements. |
| 2. Stock-UI compatibility | Selected ordinary TF3 controls work through the same authoritative pipeline. | Individually qualified public replacements, or a later native compatibility layer. |
| 3. Third-party mods | No blanket compatibility claim. Each mod/action family is qualified and versioned separately. | Its own documented capture/replay path and test evidence. |

An unsupported mutating path must not be advertised as synchronized. In a
general-play multiplayer session it must either be covered by its feature's
authoritative path or be unavailable; this does not justify temporary blanket
restrictions during controlled tests.

The optional native compatibility layer is not a shortcut around multiplayer
correctness. It would only broaden capture/cancellation coverage for stock UI;
it would still need logical action decoding, canonical ordering, per-company
validation, exact execution, receipts, state checks and recovery. Deployment is
deferred pending qualification; the approved investigation now evaluates the
concrete roadside-stop capture gap alongside public-API alternatives.

## Client/host economy relationship

- Clients display their assigned company's balance and provide normal local
  affordability controls. Other players need no placement price UI for it.
- Clients submit bounded action intents, never authoritative balance changes.
  The authenticated session binds the company; payloads cannot choose a payer.
- The host orders all actions, including its own, and executes them through TF3
  with explicit company ownership/payer context and native validation enabled.
- Local affordability is not final authority: two queued purchases can each look
  affordable against the same stale balance. Check against host-ordered state.
- Clients apply accepted actions and compare observed balances/state at agreed
  barriers. Mismatch halts for recovery, not balance overwrite, refund or replay.
- Prove native debit attribution and insufficient-funds handling in the disposable
  acceptance run. UI gating alone does not prove native enforcement. If native
  commands permit overdrafts, a supported host-side check is needed before play.
- Custom remote pricing UI and retained GUI proposal userdata are not dependencies.

## Planning rule: build reusable capabilities, not temporary obstacles

Every new task must either implement a shipping capability, provide evidence for
the current feasibility gate, or protect the state actually touched by that test.
If it does none of those, defer it. Do not add a mechanism solely to remove it in
a later phase. Prefer exercising the real adapter over adding another parallel
diagnostic implementation or another button.

Controlled tests may have explicit operator constraints. For Phase 1, do not
build, buy/sell, edit lines, change company or use native speed/vehicle actions
outside the instructed steps. Leave construction tools unchanged. An accidental
out-of-scope action invalidates the run; stop and use a known disposable save.
This is a test condition, not a claim that normal multiplayer is safe.

Before general multiplayer use, route each supported native action through the
authoritative path. Any remaining unsupported mutating entry points must be
unavailable in that multiplayer mode. Design this capability gating alongside
the feature batches, not as a blanket Phase 1 construction lockdown. Ordinary
single-player controls must remain unaffected.

## Where we are

- Phase 1 controlled runtime gate passed at 15:45 UTC: four exact-update actions
  at 1x/2x/4x with matching releases and confirmed terminal halt. Report:
  local-batch-9bac565c-2596-4495-851f-8b52eb6d1566. This closes the controlled
  single-game feasibility milestone, not real multiplayer qualification.
- Phase 2 is in development. Depot validation is joined by funding, purchase,
  assignment and service-accounting contracts; the live construction/service
  adapter and consolidated test UI remain outstanding. A read-only depot preview
  is connected to launcher Debug and in-game placement controls; the user verified
  ghost rendering, but subsequent pricing experiments crashed. The last staged
  build disables pricing. A native owner/payer-bound executor and postcondition
  checks are now source-only; they are not integrated into the game or acceptance
  UI. See phase2-acceptance-readiness.md for the current incomplete live path.
- Locally game-verified building blocks: exact-update pause, held vehicle action,
  resume, selected-state capture, tested speed/vehicle guards and watchdog expiry.
- Exercised together in the controlled TF3 run: binding,
  observed checkpoint agreement, repeated prepare/execute/release, lease renewal,
  mailbox/session adapter and control-lock integration.
- A consolidated local coordinator driver now exercises the real adapter through
  a helper entry point: capture, four vehicle cycles and confirmed explicit halt.
  The second protocol member is explicitly a receipt mirror, not another game.
  Launcher 0.6.22 offers this driver through Run local sync test, with read-only
  vehicle selection and existing-company inspection. Barrier releases now request
  and verify 1x/2x/4x speed; timing and confirmed-vs-unknown halt evidence are
  recorded. The integrated path passed the controlled single-game run above.
  docs/phase1-integrated-test.md preserves the test procedure.
- Separate-company creation/inspection and isolated credit/debit have local
  evidence. Playable independent services and multiplayer simulation do not.
- Laptop transport/save-transfer evidence is not a second running TF3 instance.

## Phases and acceptance gates

| Phase | Work | Exit evidence |
|---|---|---|
| 1. Synchronization feasibility | Integrate the real asynchronous adapter, binding, observed hold agreement, repeated Stop/Start, coordinated pause/resume and supported speed changes; exact execution receipts, selected-state hashes, latency/deadline measurements and failure halt. Use a controlled disposable-save session. | One game repeatedly completes the integrated cycle; pause still receives control traffic; late/duplicate/missing work is handled without replay; actual stopped state is distinguished from unknown. Document input constraints and unsupported API blockers. No whole-world or multi-game claim. |
| 2. Playable second company | Direct depot placement/build owned and charged to the second company from creation; explicit bounded funding; vehicle purchase, line and basic service; independently attributed spending, operating costs and income. No ownership-transfer shortcut or remote price UI requirement. | Two working companies in one game with verified ownership and separate finances, including insufficient-funds handling. |
| 3. Two-game synchronization proof | Same checkpoint/build/mods, distinct authenticated companies, host as participant; no-input baseline, repeated Stop/Start, simultaneous requests, pause/speed and matching execution updates/state. | Two real TF3 instances stay aligned through the bounded test. Explain baseline divergence before adding actions. Requires a second game-capable instance. |
| 4. Failure, saving and recovery | Real halt on disconnect/stall/mismatch; coordinated checkpoint and company mapping; authenticated checkpoint-based rejoin. No hot-join or host migration. | Injected failures cannot silently continue divergent play or repeat spending; recovery restores verified common state. |
| 5. Road-transport alpha | Roads, depots, stops, vehicles and lines through the same typed intent, ownership, ordering, execution and verification path. Use mod-owned or individually audited public UI capture/capability gating with each action. | Two independent services operate for a sustained session, with correct costs/income, save and recovery. Unsupported actions cannot silently mutate a general-play session. |
| 6. Host/Join experience | Host, Join and Debug; supported save/mod setup, download, company assignment, readiness and understandable errors. Where automation is unsupported, give one accurate manual step. | A new user can host/join without manually moving saves or reading diagnostic procedures. |
| 7. Four-player/Internet qualification | Four real games, concurrent companies/actions, supported speeds, recovery, port-forwarded Internet and adverse networks; security/distribution review. Publish the supported action/mod compatibility matrix. | Recorded real-game/network matrix, one versioned distribution and explicit approval before publication. No unrestricted stock-UI or third-party-mod claim. |
| 8. Optional native compatibility layer | Only after explicit approval and applicable permission: evaluate a separately installed, opt-in native companion for selected stock command capture/cancellation. Add exact-build identification, allowlists, self-test, failure latch and kill switch. Decode/replay one action family at a time; never transmit raw process memory or silently load it. | For each approved executable build and action family, two real games prove capture before mutation, cancellation of the original, canonical replay, correct ownership/finance, state agreement and safe disable on an unknown build. This phase is required only for the broader stock-UI promise, not for Tier 1 alpha support. |

Phase 1 does not require four-player testing, a second machine, broad construction
restrictions or a production-complete recovery system. Phase 3 is not cleared by
Phase 1. Controlled Phase 3 experiments can also use declared input constraints;
they do not authorize advertising unrestricted stock-UI or third-party-mod
multiplayer. Phase 8 release qualification remains later; its newly approved
feasibility investigation can proceed now without blocking public-API alternatives.

## Immediate implementation batch

1. Use engine-owned SimpleProposal construction with explicit owner/payer and
   native validation. Custom price UI for other players is not required. Qualify
   correct charging and insufficient-funds behavior without GUI native-data retention.
2. Connect bounded, explicitly confirmed funding and direct depot construction
   to engine-persistent one-attempt guards and correlated result inspection.
3. Implement second-company vehicle purchase, two-stop line setup and assignment.
4. Observe actual operation with independently attributed expense and income.
5. Deliver one consolidated guided disposable-save test, not another Phase 1 run.
   Run automated success/failure checks and stage only a coherent live batch.

Ready for testing means this integrated entry is built, verified and staged with
a bounded script. It is not the same as the in-game exit gate having passed.

## Keep, defer and avoid

Keep ownership rechecks, typed requests, sequence/duplicate protection, actual
receipts, engine watchdog and unknown-outcome handling: these are shipping
foundations. Keep existing tested speed/vehicle guards without expanding them
merely to claim full input coverage.

Defer new construction/terrain/bulldozer blocking wrappers, comprehensive UI
lockdown, native attachment work and polished release UX. Their eventual
permanent integration belongs with the corresponding action or release gate.
Second-company development is now the immediate batch. Do not begin Phase 8
without explicit authorization and applicable permission for process attachment.

Avoid new one-off tests when the integrated path can exercise the same behavior,
repeated tiny launcher releases, and rising test counts as a substitute for the
real-game milestone. Remove obsolete debug entry points only when their useful
coverage is replaced; do not delete proven safeguards as an incidental cleanup.

## Evidence and change discipline

For every batch, distinguish implemented, automated-tested, locally game-verified
and multi-game-verified. Document changed hashes and exact remaining limitations
in completion-audit.md. Preserve earlier evidence without presenting old source
limitations as current facts. Do not claim selected-company/vehicle hashes prove
the whole simulation or identify the loaded save.
