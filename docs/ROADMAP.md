# TalCo TF3 multiplayer — current delivery plan

## Current priority: playable separate companies — 28 September 2026

The two-instance diagnostic sessions proved one Host-origin ordered Stop
(run 18) and three matching no-input covered-state checkpoints in one session
(runs 24 and 25). They did **not** prove a playable Join company. The Join
currently claims company 55652 in the protocol while TF3's stock UI still
selects Host company 3141. Do not spend another live run repeating that Stop
until the local-company presentation gate below is resolved.

1. **Qualify local company control.** Trace exact installed TF3 40408
   `getPlayer()` initialization/change and find a supported or exact-build
   qualified way to bind each instance to its assigned company. Finish with
   source/ABI evidence and a minimal implementation decision. If this is not
   safely possible, record the precise gap before choosing an alternative.
2. **Prove the stock UI in one disposable game.** Bind to company 55652;
   independently read the engine's selected player, balances and owners.
   TF3's stock finance display must show 55652's balance, and Host vehicle
   66005 must use the game's existing non-owned vehicle presentation. The
   Host assets and both wallets must remain unchanged by binding.
3. **Integrate company authority.** Bind Host and Join before playable
   admission. Remove the passive-Join exception from that path. Reject a
   foreign vehicle action at the local capture, Host admission and engine
   execution boundaries; prove that manager controls and shortcuts cannot
   mutate a foreign vehicle. Keep unqualified actions disabled.
4. **Prove two-way play in concurrent games.** Give each company one owned
   vehicle. Each player must see and control their own vehicle while seeing
   the other's as non-owned. For one action from each owner, require one Host
   sequence, distinct game-side execution receipts and fresh postconditions;
   denied foreign actions must leave both engines unchanged. Retain three
   matching no-input covered-state checkpoints in the same acceptance run.
5. **Finish a bounded road economy loop.** For each company, verify depot,
   stops, line, vehicle purchase/assignment, operation and sale where qualified.
   Native charge and income receipts must agree with independent engine
   balances and the stock finance UI; a discrete mutation must not charge the
   other company.
6. **Finish session lifecycle.** Verify coordinated speed, pause and failure
   halt, then save/rejoin and checkpoint-based divergence recovery in real
   games with exact versions and bounded evidence.
7. **Finish release acceptance.** Verify up to four assigned companies and
   direct LAN and port-forwarded Internet on separate machines. Do not call
   the mod ready or publish a release before these gates pass.

TF2 multiplayer credits Swiss's sequential save-sharing company mod as an
inspiration; it does not depend on that mod at runtime. TF2's own
`companies.lua` and foreign-window guards are implementation references for
concurrent play. Evaluate its asset/wallet swap against TF3's canonical
company entities and native charges before adapting it. Installed TF3
40408's stock vehicle UI already branches on ownership; its stock money
display reads the current player's balance. Use those existing UI paths first.

### Controlled second-company selection — 28 September 2026

In one disposable TF3 40408 load, the exact-build, one-use load-return binder
changed the loaded selected-player field from 3141 to 55652 before stock game
UI construction. It reported one four-byte write, readback, restored debug
registers, detach and a surviving game. The game's bridge independently
reported `companyEntity=55652`, known balance 0, and advancing updates; the
stock Account display showed 0. A passive rail construction preview reported
`ownerCompany=55652`, so at least that stock construction tool received the
second company. No construction was placed. TF3 quit normally without saving;
the source save hash remained unchanged. The fixed attempt journal prevents
repeating this exact save/company assignment. Private bounded evidence is in
`reports/company-selection-20260928` and the profile's TF3 log.

This is a **single-game selection result**, not a playable Join or a complete
company switch. Foreign vehicle 66005's stock non-owned panel, unchanged
Host ownership and both wallet values after binding, Host/Join integration,
and two-instance company authority remain open. The second-company target
was previously observed in the same save under build 40396; this run provides
the first exact-40408 game-side selected-company and balance readback.

## Latest PC ordered Stop — 27 September 2026

On exact installed TF3 40408, one guarded GUI Stop for owned moving vehicle
66005/company 3141 was cancelled by native invocation 1. The separate owner
readback still had Stop flag 0 at update 3098. Host ordered sequence 1 for
update 3163; the held engine receipt reported Stopped there, then the release
completed. A fresh game-side owner readback had Stop flag 1 at update 3169,
and the TF3 vehicle panel displayed Stopped. The bounded private trace is
`reports/ordered-stop-40408-20260927-run12/host.jsonl`. The source disposable
save SHA-256 remained `ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`;
TF3 is closed. This requalifies the complete ordered Stop in **one PC game**.
The prior run 11 exposed a release/readback race; production now waits for
the released running game clock before the final inspection. Focused tests
passed 20/20. The full serial isolated suite passed 1,260/1,261 with zero
failures and the existing Windows symlink skip. Two-device baseline and
matching Stop receipts remain open;
automatic Join save loading and initial checkpoint save are not established by
this Stop run.

## Phase 8 checkpoint-save boundary — 26 September 2026

Installed TF3 40408 declares GUI `app.saveGame(name, callback, isMapEditor,
skipSetName?)` in `api/tealdef/app.d.tl:83-88`; its callback has no success
value. The opt-in `--initial-held-save true` Host path now retains the initial
checkpoint after all participant receipts, issues one nonce-bound GUI save,
checks the callback's before/after update and reads the resulting disposable
`.sav` bytes independently before releasing. Focused socket/bridge/coordinator
tests pass; no TF3 save run has verified the GUI call or resulting bytes yet.
This is an initial held checkpoint, not mid-session recovery. The saved
coordination nonce and watchdog lease still reject fresh binding after reload;
their lifecycle needs exact reload evidence before recovery is enabled.
Automatic Join loading through the native DLL also remains unqualified: the
stock menu load and Start Game lifecycle needs a build-specific, safe trigger.
The installed 40408 GUI source places the stock load closure in `MainPage`
and calls it on `ProgressPage`'s second step; Start Game separately waits for
ready state. A hash-pinned read-only native review found the main-menu
`ScriptComponentRoot` and GUI deferred-step registration, but did not prove
that the `--script` worker shares its Lua state or can install a recipe before
the menu closes replacement registration. These RVAs are observations, not
approved hook sites. Finish the GUI VM ownership/callback lifetime chain before
an automatic load experiment.

## Latest PC run — 26 September 2026

The next disposable 40408 game reached Start Game and loaded the source save,
but `START_HOST` was sent after the native runtime's three-minute no-client
lease expired. The Host saw `NATIVE_RUNTIME_CONNECT_FAILED:connect ENOENT`;
no Stop was armed or executed (`reports/ordered-stop-40408-20260926-rebuild-run6`).
Connect the Host promptly after the next announced launch, then gather one
bounded action trace. The user closed TF3 after the run.

## Current PC ordered Stop follow-up — 26 September 2026

The rebuilt `ordered-stop-40408` runtime and reviewed mod were staged and
loaded in TF3 40408 on the disposable source save. The fresh Host connected,
confirmed ownership of moving vehicle 66005, and released its capture barrier.
Two one-use cancellation attempts then expired before the operator clicked
Stop: native claimed-invocation and callback deltas were zero, and Host halted
without ordering an action. Their private traces are
`reports/ordered-stop-40408-20260926-rebuild-run2` and
`reports/ordered-stop-40408-20260926-rebuild-run5`. The save remained at SHA-256
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`.
These timing failures do not negate the successful single-game ordered Stop
recorded below from 25 September. Review the arm-receipt-to-click timing before
another live run; preserve the one-use permit and unknown-outcome halt.

## Service income qualification boundary — 26 September 2026

The installed TF3 declarations distinguish net vehicle balance from income
and maintenance categories, but do not define whether a maintenance-filtered
balance includes income or how interval endpoints are counted. The existing
collector's five values therefore cannot certify company revenue or expense.
At the next disposable service run, compare those bounded raw values with
stock account-chart Revenue/Expenses and both companies' finance categories
at the same paused endpoints, including a naturally posted running cost and
paying unload. Record chart bin coordinates and ownership; derive no credit
or gameplay pass until the readings agree. TF2 journal semantics are a
reference for questions to measure, not TF3 proof.

## Join Load Game instruction timing — 26 September 2026

After the authenticated save is prepared and TF3 launch is requested, Join
now switches from transfer progress to the explicit Load Game page. Its
company-claim button stays disabled until the production helper reports
`session_ready` after connecting to the loaded game's bridge. This avoids an
indeterminate transfer spinner at TF3's expected main menu. Launcher source
compiles as a temporary library and 18 focused launcher/Join/save tests pass.
The two canonical launcher processes remain running, so the executable was
not replaced. Neither Load Game visibility nor loaded-save identity has been
verified in TF3.

## PC-only service interval correlation — 26 September 2026

The Phase 2 service setup report now checks whether its two bounded raw
endpoint reads refer to one advancing, entity-matched interval. It records
whether the visited-stop mask or stop index changed. Twelve focused verifier,
file-bridge and guided-report tests pass; independent source review found no
overclaim in the new fields. The report still marks completed trip, company
income and continuous ownership unverified. The TF3 meanings of the raw
vehicle finance counters and a real sustained service remain untested.

## PC-only native observer cleanup correction — 26 September 2026

The debugger event's thread handle does not guarantee query or synchronization
rights. Each observed thread now retains a separate handle with those rights.
Cleanup treats a signaled handle as confirmed terminated and otherwise still
requires register restoration and independent readback before detach. The
observer and controller both close that handle on ordinary thread exit.
Unknown wait/suspend results remain fail-closed with bounded diagnostics.
The rebuilt observer/controller focused suite passes 30/30. The permitted
full integration suite passes 1,238/1,239 with zero failures and the existing
Windows symlink skip; private log:
`C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926-native-exit-handle.log`.
This fixes a rights and exited-thread accounting defect in owned-process
cleanup; it is not evidence that TF3 Stop or Join loaded the revised build.

## Earlier native observer cleanup diagnosis — 26 September 2026

At this point the intermittent owned action-trace cleanup failure was unresolved.
Read-only review found a worker-exit race and an unchecked exit-query failure
as plausible causes; the failing log did not distinguish them. Cleanup now
records the query result, pending debug event and actual suspend error, and
the test prints the failing mode plus a bounded stdout tail. Four abandoned
`--fixture-action-trace` child processes from prior tests were confirmed by
their command lines and stopped so the native test binaries could be rebuilt.
The observer and controller then compiled, and their owned-process focused
suite passed 30/30. This is diagnostic and fixture evidence, not a native
cleanup fix or TF3 qualification; retain fail-closed teardown on unknown state.

## PC-only Phase 7 four-company receipt hashes — 26 September 2026

Held depot builds and vehicle purchases now carry sorted before/after balances
for every authenticated company in their game-side receipts. The production
decoders require exact target debit, unchanged non-target balances and a
complete 2–4 company roster; their state hashes include that roster. The
local diagnostic run accepts the revised state scope. Focused Lua, mailbox,
decoder and local-driver tests pass 47/47; controlled mod review passes 52
content files at manifest SHA-256
`4eb7ac50dbfe08e2ebd0b98b06f259a823c1d7ddcec897ce8f52fbd8a1be2388`.
The permitted full suite passed 1,237/1,239 with one existing Windows symlink
skip and one native observer fixture cleanup failure (`restore_suspend_failed`,
Win32 5); the entire 18-test observer file then passed alone. Private logs:
`C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926-roster-digest-escalated.log`.
The full integration gate remains open. The running TF3 and launcher still use
older staged content; no new game-side debit or four-company comparison was
verified in TF3.

## PC-only Join profile selection — 26 September 2026

When multiple TF3 Steam save folders are present, Join now requires an
explicit selection from their profile IDs and paths, with no most-recently
modified default. The chosen folder is still checked against the discovered
TF3 profile set before any copy. Launcher source compiles and 13 focused
launcher/save tests pass. The currently running canonical launcher has not
been replaced; neither Load Game visibility nor loaded-save identity has been
verified in TF3.

## PC-only Phase 8 baseline divergence evidence — 26 September 2026

A valid held checkpoint that differs from the operator's expected baseline
still causes an immediate local halt and disconnect, with no readiness or
release. The participant now retains the bounded expected/observed hashes,
round, company and update before that halt; the production adapter emits a
redacted `engine_checkpoint_divergence` diagnostic. Focused participant,
adapter and diagnostic tests pass 91/91, including malformed and late receipt
cases. The Host currently sees a disconnect rather than a paired divergence
record, so the affected game machine's diagnostic is required for recovery
analysis. The full suite passes 1,238/1,239 with zero failures and the existing
Windows symlink skip; private log:
`C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926-baseline-divergence.log`.
This path has not run in TF3 or across two devices.

## PC-only Phase 7 native action-bar restriction — 26 September 2026

The native-control latch now checks every existing action-bar click and value
change callback at invocation time. Unsupported buttons stay held after
acquisition or helper failure; only the exact Start/Stop tag retains its narrow
one-use Stop permit. Focused callback and review tests pass 6/6; controlled
mod review passes at manifest SHA-256
`161031bc11fd790a2a5b47f5b45bfc8228d54c4ad164ea12b0ce640dbdc2fd99`.
The full suite passes 1,235/1,236 with zero failures and the existing Windows
symlink skip; private log:
`C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926-actionbar.log`.
This closes a concrete GUI callback escape, not all native TF3 mutation routes.
The currently running game has older staged mod content. No TF3 run verified
the new restriction.

Installed TF3 UI source also confirms that Load Game builds its tile label
from the save filename's parsed group name (`gui/menu/savegame_react_util.tl`),
so the Join launcher can direct the user to its stable disposable filename.
This source inspection does not prove the copy appears in the correct Steam
profile or that TF3 loaded it; those still need a disposable PC game check.

## PC-only Phase 8 initial rollback preparation — 26 September 2026

The new `prepare-recovery` CLI verifies the original Host save bytes against
an exported initial checkpoint agreement plus the supplied executable and
staged mod. It atomically publishes a separate `tf3mp_rollback_*.sav` copy and
a non-overwriting agreement file for a **fresh** Host session. It does not
start TF3, issue a startup-load request, clear old latches, or retry an unknown
action. Focused module, CLI, agreement and diagnostic tests pass 19/19. This
prepares rollback to the original pre-binding save only: the agreement is not
a newly saved mid-session world. A manual Load Game, fresh native binding and
matching game-side checkpoint still require controlled TF3 evidence. The
current non-disposable game process was not touched.
The first 26 September full suite exposed a concurrent release race in an
owned native fixture. After a one-use resource-release fix and recovery
publication correction, focused tests pass 22/22 and the full suite passes
1,234/1,235 with zero failures and the existing Windows symlink skip. Private
log: `C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926-recovery-final.log`.
This remains source/owned-process evidence; no TF3 or laptop run occurred.

## Phase 7 owner-selected action correction — 26 September 2026

The held line create, empty-line remove and vehicle line assignment paths now
accept the instance whose selected company owns the action, while retaining
the authenticated player mapping, lease and live ownership checks. Their
unknown execution receipts carry an integer update count so the GUI can
forward a correlated failure immediately. Line removal also requires the
post-action line set to equal the prior set minus its target. Focused Lua
tests pass 22/22, the mod review passes with manifest SHA-256
`4959744b5bbd14d7291dbcaf95c78a00dca22014ff9dd621cc5c027e1d2f8601`,
and the full suite passes 1,220/1,221 with zero failures and the existing
Windows symlink skip. Private full-suite log:
`C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926-phase7-approved.log`.
These are source/model checks. The running TF3 and launcher still use older
staged content. The purchase and depot owner-selected work below was added
after this particular suite run.

## Phase 7 owner-selected native charges — 26 September 2026

An independent review found that purchase and depot command builders rejected
the paying company when selected locally, and that ordered readback wrongly
required the selected company's balance to stay unchanged. Ordered prepare now
permits that selection; the older local diagnostic execute still requires two
different companies. Both held ordered paths snapshot the 2–4 company roster,
verify the target's exact native debit and preserve every other balance. Vehicle
purchase chooses the same non-target reference company on every instance so
its state hash does not depend on the local selection. Focused preparation,
executor, third-company-drift and actual factory tests pass. Mod review passes
with manifest SHA-256
`011b8d983fbc89f0ca41d0d5af6e445ebde7c7befe0637d2d7f450a51b9f645d`.
The first full run found an unrelated asynchronous test-event race, which was
fixed and passed in isolation. The rerun passed 1,227/1,229 with one existing
Windows symlink skip and one intermittent native observer fixture cleanup
failure (`restore_suspend_failed`, Win32 5); that entire 18-test observer file
then passed alone. Private full-run log:
`C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926-owner-actions-final.log`.
The full integration gate is therefore still open. No TF3 process or laptop
run has verified these new native charges.

## Current PC 40408 offline qualification — 26 September 2026

Read-only checks confirm the running PC `TransportFever3.exe` still hashes to
`de1daad3a13f3b7e9f79903361bb43769cf4f15e59271a263aefe1f075f23ef2`.
Both installed native DLLs match their `ordered-stop-40408` manifest. The
newer native source builds separately and its owned-process smoke test passes;
27 focused native tests pass against the rebuilt output. That output has not
replaced the DLLs used by the running non-disposable TF3 process, and these
offline checks do not extend the earlier real single-game Stop result.

## Passive Join save-name evidence — 26 September 2026

The existing GUI default-save-name hint is now consumed by the Join bridge as
bounded, nonce-correlated diagnostic evidence. It reports only whether the
hint matches the prepared disposable filename; the raw name and hex are not
logged. A match does not prove which file TF3 loaded and never authorizes
admission or recovery. Focused parser, bridge and diagnostic tests pass,
including a changed-name result. The full integration suite passes
1,216/1,217 with zero failures and the existing Windows symlink skip; private
log: `C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926-join-hint.log`.
No TF3 run has qualified this hint.

## Join terminal-state correction — 26 September 2026

When the Join helper exits, the launcher now retires its Load Game spinner and
claim instructions. It shows a stopped-session page, keeps a bounded startup
or engine-verification failure reason, and leaves Debug available. This stops
an ended session from looking like an active manual-load wait. Launcher source
compilation and 18 focused launcher/Join tests pass. The two running canonical
launcher processes were not replaced, and no TF3 or laptop run tested this UI.

## PC-only Phase 8 divergence provenance — 26 September 2026

The Host's bounded diagnostic writer now retains the checkpoint or state
digest's source, player and company from a disagreement record. It accepts
only a coherent operator-baseline or authenticated-participant source shape;
malformed values are omitted. Focused diagnostics/coordinator tests pass
29/29. This improves evidence for a later recovery decision; it does not
authorize reload or establish loaded-save identity.

## PC-only Phase 7 action admission repair — 26 September 2026

Production prepare and execute requests use distinct operation IDs. The sale,
line removal, line assignment and line creation game paths now bind the saved
prepare receipt to its own ID while keeping the later execute ID on the one-use
barrier. A fixture using distinct IDs exposed the prior live-arm rejection.
The sale receipt also snapshots all 2–4 authenticated companies and rejects
any non-selling company balance change before accepting native credit. Focused
action and mod-review tests pass 50/50; the full integration suite passes
1,213/1,214 with zero failures and one existing Windows symlink skip. Private
log: `C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926-phase7-integration-v2.log`.
This remains source/model evidence.
The running non-disposable TF3 world and launcher were not changed. The revised
launcher source compiles, while its running executable remains older. A fresh
disposable TF3 test must still verify the sale credit and these action paths.

## Join Steam-profile save-folder guard — 26 September 2026

The launcher now discovers TF3 save folders from both the game library and
Steam's registered installation. Join refuses an arbitrary folder when no TF3
profile save folder exists, so a verified copy cannot silently be placed where
Load Game will never list it. Its Host status says the file was verified on
disk, without claiming a loaded world. The launcher source compiled as a
temporary library; the running canonical executable was not replaced. This
has not yet been tested through TF3's Load Game menu.

The normal Host launcher now requests the initial checkpoint agreement export
to a session-specific private path under the user's local app data. It reports
success only after all game-side checkpoint receipts agree and the file was
published; an export error is visible. The updated source compiles, while the
running launcher still needs replacement before this can be tested in TF3.

## PC-only initial checkpoint agreement export — 26 September 2026

After unanimous initial checkpoint receipts from 2–4 participants, the Host
retains the exact round, update, digest and authenticated company roster. A
Host-only option can publish a bounded `initial_checkpoint_agreement` JSON
file once, without overwriting an existing file. A fresh Host session may use
that record as an exact save/build/mod/roster/digest admission constraint via
`--expected-baseline`. It explicitly carries `saveLoadVerified: false` and
cannot reload TF3 or reset a consumed native binding. Focused coordinator,
socket and file tests pass 58/58; the full suite passes 1,210/1,211, with zero
failures and the existing Windows symlink skip. Private log:
`C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926-initial-agreement.log`.
This is PC-only model/socket evidence. The current non-disposable TF3 world was
left untouched. A qualified loaded-save receipt and two-machine test remain
open for the morning.

## PC-only road receipt logging repair — 26 September 2026

The accepted execution diagnostic now handles sale, line create/remove and
line assignment state shapes without assuming a vehicle Stop field. This
prevents logging from interrupting the post-receipt path. Focused adapter and
sale tests pass 24/24; no new TF3 sale or line run occurred. The installed
TF3 GUI uses `api.engine.util.vehicle.getDepreciatedValue` as a candidate
refund quote, but current evidence does not establish equality with the
native sale credit. Record both values in a future disposable-game test before
using the quote as an exact sale gate.

The sale execution receipt now carries that candidate quote's availability,
value and equality with the observed native credit as diagnostic fields.
These fields are logged with the correlated sale execution but excluded from
the authoritative post-sale state hash. A missing getter does not change the
one-use send or turn an unknown native result into success. Focused tests pass
41/41, mod review passes 52 content files, and the full integration suite
passes 1,204/1,205 with zero failures and the existing Windows symlink skip.
Private test log:
`C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926-sale-quote.log`.
Actual TF3 quote-versus-credit equality remains untested.

## PC-only Join instructions and held-clock guard — 26 September 2026

The Join launcher now states that TF3 opens at its main menu and gives the
exact disposable save name to choose under Load Game. Its post-transfer screen
distinguishes a verified file on disk from the unverified identity of the
loaded TF3 world. It displays the destination Steam save folder and asks for
an explicit profile choice if more than one is found. The launcher source
compiles; two running canonical launcher
processes prevent replacing their executable in place. The current PC TF3
world is not a disposable test save and remains untouched.

The Host now halts if an authenticated heartbeat advances beyond a pending
held checkpoint or an applied command's scheduled update before all peer
receipts arrive. Two- and four-participant model tests and an authenticated
socket test pass. The full suite passes 1,201/1,202 with zero failures and one
existing Windows symlink skip; private log:
`C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926-clock-guard.log`.
The coordinator fix is committed and pushed as `debb4ff`. These are offline
and network checks; the loaded-save identity and two-game barriers remain
unverified. Keep laptop testing paused until morning.

The Host's periodic PC game-clock observation now enforces the same held
checkpoint and applied-command limits; a missing or advanced clock halts before
release. Focused coordinator, participant and socket suites pass 117/117 after
this extension, committed and pushed as `62fd6ee`. The full suite above ran
before this small follow-up; no additional TF3 run was made.

## PC-only owner-selected sale repair — 26 September 2026

The opt-in vehicle-sale order no longer rejects the instance where the local
player selected the selling company. All engines choose the same unaffected
reference company from the authenticated roster, freeze it during preparation,
and include its entity in the held execution receipt and canonical state hash.
Signed reference and target balances survive the bounded userdata parser.
Focused Lua, mailbox, IPC and mod-review tests pass; the full serial suite
passes 1,197/1,198 with zero failures and the existing Windows symlink skip.
The private full-suite log is
`C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926-sale-reference.log`.
Native sale credit semantics and the full road economy remain unverified in
disposable TF3; this source repair does not enable general gameplay.

## PC-only divergence source attribution — 26 September 2026

The command barrier now treats each participant's prepare and applied receipt
as one-use. A duplicate halts before command commit or completion; focused
coordinator/socket tests pass 25/25. This is offline receipt-policy evidence,
not a second-game delivery result.

Checkpoint and post-command mismatch records now identify both the differing
participant and the source of the expected digest. An explicit expected
baseline is labeled `operator_baseline`; a digest learned during capture or
execution names its supplying player and company. The two- and four-participant
model cases and the two-participant socket mismatch case pass 32 focused tests.
The full serial integration suite passes 1,191/1,192 (zero failures, one
existing Windows symlink skip); its private output is in
`C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926-phase8.log`.
This improves failure evidence only; no new TF3 or second-machine result was
obtained.

## PC-only expected-baseline admission — 26 September 2026

An explicit Host `--expected-baseline` path now accepts a bounded local JSON
record for a fresh session from a pre-binding disposable save. Before launch,
the wrapper checks its save bytes/hash and exact game/mod hashes. At roster
capture, the Host requires the observed paused update, Host company and full
company set to match the record, then uses the existing expected-hash
checkpoint protocol instead of accepting the first observed digest. Both
deferred adapters attach on `coordination_prepare`. The two- and four-player
model cases and an authenticated socket case halt on an agreed wrong digest
without release; focused tests pass. Empty, Join-side and solo Stop option
combinations fail closed. This does not reload a game or prove the selected
save was loaded. A saved native binding remains a hard rejection; mid-session
checkpoint recovery still needs a separately qualified game lifecycle. The
full serial integration rerun passes 1,191/1,192, with zero failures and the
existing Windows symlink skip. An initial run had one failure whose test name
was lost to truncated output; the captured rerun is green and its private log
is `C:\Users\olihf\Downloads\Temp\tf3mp-full-suite-20260926.log`.

Manual Join preparation now copies through a private temporary file, verifies
its bytes, and atomically publishes the stable Load Game name. Cancellation
before publication cannot leave a partial file under that name. Focused save
tests pass; the current TF3 and launcher processes remain untouched.

## Join preparation and second-device gate — 26 September 2026

PC-only Join cancellation now reaches the authenticated save download before
TF3 launch. A stalled preparation helper receives Stop, aborts its HTTP request,
removes its partial file and cannot proceed to native handoff or game launch.
The focused stalled-request and transfer cleanup tests pass. The control-frame
decoder now bounds each incoming frame before copying bytes, including when a
large network read contains many small frames. The full serial suite passes
1,178/1,179 with zero failures and the existing Windows symlink skip. These
are source/process tests; no new TF3 or laptop run was performed. The current
launcher processes and non-disposable TF3 world remain untouched.

Further PC-only Join correction: manual Load Game may take more than five
minutes, so production Host/Join now waits for live bridge telemetry while the
exact native gate remains healthy and the helper remains cancellable. A fixed
five-minute timeout could previously strand a correct late load. Startup
failures now run shutdown cleanup, including releasing the exclusive bridge
lock, and exit nonzero. A disposable diagnostic-only subprocess proved lock
removal after a post-bridge startup failure; focused Join/bridge suites pass
57/57. The full serial suite now passes 1,175/1,176 with zero failures and the
existing Windows symlink skip. The current PC TF3 process loaded `comp.sav`,
so it was not used for a disposable-save mutation. The canonical launcher is
still running and has not been replaced in place; laptop Join remains untested.

PC-only Phase 8 follow-up: structurally valid checkpoint and post-command
digest disagreements now retain one bounded Host-local comparison record
(expected/observed hash, participant, company, round, update and sequence)
before the permanent session halt. The Host diagnostic log includes the
build/mod identity; it does not send the record to peers or authorize reload.
The composed 2- and 4-participant offline test now delivers the halt frame to
each participant, observes one typed halt request each, no release, and an
unknown halt state when no receipt arrives. Focused suites pass 39/39; the
full integration suite passes 1,171/1,172 with no failures and the existing
Windows symlink skip. This is model/socket evidence, not two-game divergence
or checkpoint-reload proof. Phase 7 road-service and checkpoint focused tests
pass 29/29; their unqualified game actions remain pending. Keep laptop tests
paused until morning.

PC-only integration follow-up: authenticated Join and Host-local adapter
attachment now fence a terminal session frame before or during asynchronous
adapter construction. Join bootstrap also subscribes before its save/provider
awaits and refuses a late `save_ready` after a Host halt or socket close.
Focused attachment, bootstrap and network suites pass 39/39. This is offline
race evidence; it does not qualify a second game or the laptop's native load.
The integration suite now passes 1,169/1,170 tests with zero failures and one
symlink test skipped because this Windows environment cannot create the link.
Owned native fixture review corrected a target-lifetime race in the debugger
tests; it did not change the exact-build TF3 hook policy.
Production CLI shutdown now awaits Host/Join adapter closure before closing
the native runtime gate. Attachment teardown starts adapter closure while an
earlier poll is pending, so the adapter can request its typed native halt
without first waiting for a game receipt. Focused Host/Join attachment and
network tests pass 34/34; the full suite also covers the shutdown change.
This is source/network evidence, not a TF3 halt receipt for the new ordering.
The launcher source compile check passes, but the two running canonical
launcher processes prevent replacing the executable in place. The current TF3
world is active and was not treated as a disposable save, so no further game
mutation was attempted. Keep two-device testing paused until morning.

The laptop received and verified the authenticated Host save, but its TF3
process stayed at the main menu and the native Join pipe did not start. The
native startup trace reached the 40408 boundary and rejected its mitigation
check; the laptop's owned, non-game checker reports a successful CFG query and
`ERROR_NOT_SUPPORTED` (50) for the user shadow-stack policy query on ARM64.
The current native source now accepts that missing query only for an AMD64
image on an ARM64 host when Windows separately reports user CET unavailable;
all EH continuation, unwind, CFG and XSTATE checks remain. This revision has
passed the PC owned harness and runtime build, not the laptop's TF3 process.

Join preparation now produces a stable, hash-verified disposable save and the
launcher instructs the player to load its exact name through TF3's ordinary
Load Game menu. Automatic loading had not been qualified and is not part of
this Join route. Focused save-transfer/preparation tests pass. Second-device
testing is paused until the next morning at the user's request. Continue road
service, economy, recovery and Host/Join work that can be verified offline or
in one disposable PC game; retain two-game agreement as an open gate.

## Current ordered Stop result — 25 September 2026

Build 40408 passed the single-game Host-ordered Stop slice on the disposable
save. The Host acquired the control lock, opened the existing one-use GUI Stop
permit, cancelled the original native Stop, admitted sequence 1 at update 3672,
and held one game-side application until update 3732. An execution receipt for
vehicle 66005/company 3141 and a separate game readback both show Stopped at
3732; the TF3 panel also showed Stopped. See
`reports/ordered-stop-40408-20260925-run9` and the current completion audit.
This is one TF3 process, not two-instance synchronization proof. Next complete
the Stage 7 synchronized baseline and cross-machine Stop comparison when the
second PC is available, then continue road gameplay, economy and recovery.

## Current 40408 result — 25 September 2026

The controlled passive probe now captured one complete normal Stop result:
one factory/admission/send/dispatch/processor completion chain, then a
deferred validated callback and marshaler returning 1 for vehicle 66005/Stop
1 on the admission storage and thread. Independent bridge readback changed
stop flag 0→1. A native hold/release/detach also passed. The unrelated raw
tag-27 trap is excluded. The game is closed and diagnostics unstaged; the
source disposable save hash is unchanged. This qualifies the observed normal
result path on 40408, not production cancellation or ordered replay. Next:
offline qualify the one-use cancellation and cleanup against the exact 40408
result path, then run one guarded cancelled Stop, Host sequence and held
application with a separate stopped readback. Do not retry unknown outcomes.
Two-machine verification remains deferred by the user. Private evidence:
`reports/probe-40408-passive-stop-run2-20260925`.

## Current exact build: 40408 — 25 September 2026

40408 replaced 40405 before the Host-ordered Stop test. Its passive-only Stop
profile and boundary were qualified offline against the new executable hash,
but no 40408 TF3 run has occurred. The next controlled disposable-save run
must correlate one normal Stop's factory/admission/send, dispatch and
completion, callback/marshaler result and independent vehicle state. Only a
validated full tuple permits a guarded one-use cancellation attempt, followed
by Host ordering and one held replay. The 40408 probe staging was cleaned up
before launch while the user uses TF3. Two-machine verification remains
deferred by the user.

The first 40408 passive launch reached both native observer starts, but the
one-use pipe expired after 180 seconds while UI selection was in progress.
No Stop was clicked. Connect as soon as the disposable save loads, then select
the vehicle after the checker announces that the probe is attached.

## Build 40405 Stop result boundary — 25 September 2026

One normal, uncancelled Stop on disposable vehicle 66005/company 3141 reached
factory, admission, send return and post-send cleanup once. Exact-build passive
traps saw the same admission storage at dispatch and processor completion, each
with result 1 on thread 20964. Independent game readback changed stop flag
0→1; the UI showed Stopped. Deferred generic delivery and validated callback
counters rose after two observed updates, but the trace did not retain the
matched callback's full tuple; a later raw tag 27 remains ambiguous. The held simulation stayed
at one tick/update for eight pings, then one release advanced both by one.
This qualifies observation of the normal result path, **not** cancellation,
Host ordering or replay. A paused-save preflight was rejected before any click;
the next run used normal speed. The game is closed, hash-matched diagnostic DLLs
are unstaged, and the source save hash is unchanged. Next: offline qualify the
40405 failure completion/cancellation path, then one controlled cancelled Stop,
then Host order and one held replay. No laptop test until that single-game path
passes. Private trace: `reports/probe-40405-dispatch-completion-run2-20260925`.

## Build 40405 generic callback delivery probe — 25 September 2026

The exact-build passive site at RVA `0x9D2EC2` was added with full instruction
qualification and an owned emulation fixture. In one controlled Stop run,
generic delivery hits rose 1→2 but deliveries matching the selected Stop's
admission storage stayed 0. Factory/admission/correlation/send/cleanup each
rose once, and independent readback confirmed `stopFlag` 0→1. The old callback
tail again had no validated vehicle hit. This generic delivery candidate is
also uncorrelated with the Stop; no cancellation or Host order ran. Continue
offline through the 40405 dispatcher/result path, including RVA `0x9E26B7`,
before the next game run. The source save was unchanged and native diagnostics
were unstaged. Private evidence:
`reports/probe-40405-generic-delivery-20260925`.

## Build 40405 callback reason result — 25 September 2026

The next one-use disposable-save Stop separated the raw callback trap from
the admitted action. Factory, admission, correlation, send return and normal
post-send cleanup each advanced once for vehicle 66005; the bridge confirmed
`stopFlag` 0→1. Raw callback-tail traps rose 1→2, but the latest parse reason
was **tag mismatch** (`27`, not vehicle tag `0x32`) and its storage did not
match the latest Stop admission both before and after the click. Validated
vehicle callback and raw marshaler return remained 0. This raw trap is an
unrelated command, not evidence of a Stop callback. Find the updated 40405
Stop callback or result path from the exact adapter/send flow before another
game run or any cancellation/order attempt. The diagnostic was unstaged and
the source save hash was unchanged. Private evidence:
`reports/probe-40405-parse-reason-20260925`.

## Build 40405 raw callback probe — 25 September 2026

One fresh, one-use Stop click on disposable vehicle 66005/company 3141 was
4.684 seconds after the diagnostic click signal. The native factory, admission,
correlation, send return and post-send body each advanced once, with no dropped
candidate. Raw callback-tail traps advanced from 1 to 2, but the validated
vehicle callback stayed at 0; raw marshaler-return traps stayed at 0. The
independent bridge read changed the vehicle stop flag from 0 to 1. Thus a
40405 callback-tail trap occurred in the action window, but it was not
correlated to this Stop; the marshaler site was not reached. This is not
a cancellation or ordered replay receipt. The run failed closed, the exact
diagnostic process and hash-matched staged DLLs were removed, and the source
save hash was unchanged. Inspect the exact callback ABI before another game
run. Private evidence: `reports/probe-40405-raw-callback-20260925`.

## Build 40405 timed vehicle Stop observation — 25 September 2026

A one-use diagnostic on the exact 40405 build now reached a real UI Stop on
vehicle 66005/company 3141. The single click landed 8.479 seconds after
authorization, inside the 30-second observation window. Factory, admission,
correlation, send return and post-send body each advanced once with no dropped
candidate; the payload and adapter identity matched the selected Stop.
Independent bridge readback showed `stopFlag=1` and advancing tick/update.
However callback and marshaler-return counters stayed zero. This is partial
40405 native capture only: cancellation, Host ordering and replay remain
unqualified. Next inspect the exact 40405 callback/marshaler path, then run
one guarded cancellation and Host-ordered Stop with correlated receipts.
Private evidence: `reports/probe-40405-timed-stop-20260925`.

## Build gate changed during ordered Stop launch — 25 September 2026

Steam replaced the executable during the planned combined 40401 Stop run. The
main menu displayed build 40405 and the new executable SHA-256 is
`e4608a12c94e2e6a5592ed112f462b019271cf1012c6a83312092204c52c369f`.
The exact-40401 combined route rejected the image before any patch or Host
admission (`order-40401-start 4 0`, cleanup `3 0`, runtime result 6). The runner
also detected the hash change and stopped before a save load or vehicle click.
TF3 exited, the source disposable save hash stayed unchanged, and the
hash-matched staged DLLs were removed. Requalify the 40405 vehicle and boundary
sites from that build before another live action; the separate 40401 cancellation
and boundary evidence cannot certify 40405.

## Current build gate — 25 September 2026

The exact-40401 **single-game Stop cancellation** check has passed on the
disposable save. A Host-bound, one-use arm claimed exactly one UI Stop for
vehicle 66005/company 3141. Its callback and marshaler returned zero, the
native send body completed cleanup, and all seven correlated action counters
advanced once with no drops. Independent bridge readback kept `stopFlag=0`
while tick/update advanced from 57444/3156 to 57634/3346; the vehicle was
still moving in the UI. The runtime restored both observers on exit
(`cancel-40401-stop 2 2`); TF3 closed without saving, the source save hash was
unchanged, and the hash-matched diagnostic DLLs were removed. Private trace:
`reports/cancel-40401-20260925`. This remains an unqualified diagnostic with
no Host order, held replay or two-instance proof. Next qualify the production
40401 adapter/gate combination and run one Host-ordered Stop with a correlated
engine postcondition. Do not repeat cancellation alone.

The exact-40401 boundary-only experiment has now passed in a real disposable
TF3 game. A Host-bound native gate held the world while eight authenticated
pings succeeded and the observed tick/update clocks stayed fixed. One release
returned a correlated `boundary_applied` event and advanced each clock exactly
once; detach returned a correlated event and the observer became inactive.
The runtime stop trace was `boundary-40401-stop 0 3`. TF3 closed without
saving, the source save hash stayed unchanged, and the two diagnostic DLLs
were removed. Private trace: `reports/boundary-40401-20260925`. This qualifies
only the 40401 simulation boundary. The diagnostic handshake deliberately has
`productionQualified=false` and no vehicle cancellation capability. Next
qualify the Stop adapter's callback lifetime and one-use cancellation before
attempting Host-ordered vehicle replay; do not repeat the boundary-only run.

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

An opt-in `road.line.remove` path now handles an empty target-owned two-stop
ROAD line through Host ordering, held one-use native destroy, callback and
observed entity/getLines absence. It rechecks ownership and no assigned
vehicles immediately before send. Focused create/assign/remove/review tests
pass 46/46 and the 51-file mod review passes. This is source/model evidence;
the deletion and broader line-edit semantics still need real TF3 checks.

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
