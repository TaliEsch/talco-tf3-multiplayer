# TalCo TF3 multiplayer: current roadmap and evidence ledger

Updated 19 September 2026. This is the current status source. Chronological
entries in completion-audit.md and experiment documents are historical snapshots.

## Target and invariants

Latest control integration: bridge can acquire the existing native restrictions
while held under the coordinator lease, then retain them during valid running
simulation. Diagnostic behavior still requires a hold by default. Control failure
stops lease renewal and reports failure to the adapter; acquisition is single-use.
Actual native coverage remains speed/vehicle toggle/manager, NOT all gameplay.
Read-only audit of installed DisableFeatures exposes CreateNewLine, speed,
HUD/layers/entity-window switches but no blanket construction veto. Further
recipe/tool gating is required. No new staging or game launch.

Latest composition: engine-session-adapter.mjs now connects the existing bridge
lease, real mailbox and binding-required asynchronous participant. It forwards
only fresh observation counters, gates actions/release on control-lock evidence,
stops renewal on failure and keeps halt receipt polling distinct from teardown.
Temporary-file tests cover capture/release and loss/missing controls. Caller must
still supply real native-control coverage and authenticated transport; no launcher
entry or game-verified integrated driver yet. Phase 1 remains incomplete.

Current source (13:08 UTC): explicit coordinator.capture startup now negotiates
the actual selected-state digest. Capture requests omit expected hashes; each
participant hashes raw held engine state, and the coordinator releases only after
all bound participants agree at the target. Existing expected-hash prepare stays
strict. Duplicate readiness/mismatches halt. Source hash
`3cf6029425f18a65ba926a378b254d2bf484b6fcf74213db605f5f2206ad9c99`.
Two/four-participant model coverage only; common save identity, full world-state
equivalence, driver integration and real TF3 verification remain outstanding.

Current source (13:05 UTC): checkpoint GUI delivery can wait for a future update
and verifies the live request before one dispatch. Participant permits at most
600 updates of startup lead and fails if binding/hold misses the target. Hash
verification remains strict. Review hash
`d9af9653eaa3c79e481dc7da385e12393b25cc5166acc2216347df86d05c4ca9`.
Startup design gap remains explicit: the existing expected checkpoint digest
cannot predict future company balances. A real held-snapshot agreement stage is
required before release; scheduled delivery alone does not solve startup.
Not staged, no game test requested.

Latest bridge integration: startCoordinationLease now owns renewable watchdog
publication and receipt polling under bridge.lock and the existing serialized
helper lifecycle. It excludes diagnostic takeover for the remaining helper
lifetime, exposes lease state separately from halt evidence, and closes renewal
before bridge cleanup. A temporary-file integration test verifies arm, paused
renewal, session-health failure and diagnostic exclusion. Coordinator startup,
native restrictions and the consolidated in-game driver are still not wired.

Latest helper work: engine-lease.mjs implements receipt-driven arm/renew control.
Only fresh observations and healthy session state allow renewal; an unacknowledged
renewal cannot extend the confirmed expiry. Timeout, expiry, context/clock reset,
lost health and publication uncertainty are terminal. Paused simulation can renew
using advancing engine ticks. This controller is automated-tested, NOT wired to
launcher/session startup or locally game-verified. No new staged mod.

Current source (12:57 UTC): release supports both the initial checkpoint and a
confirmed action hold. Successful action release advances the persisted sequence
before opening the next preparation; unknown release remains terminal. Prior
release update/identity and sequence fences reject replay. GUI exchanges follow
the currently requested operation so old receipts cannot overwrite a later stage.
Source hash `9621673ecaebbab774cfc4c70e278a19c6f9b3a9505cc2436419bc710e5f3641`.
Unstaged, not TF3-verified. Session startup/renewal, broader input fencing and the
integrated game-test driver remain required for Phase 1.

Current development (12:54 UTC): one committed executeHeld now traverses scheduled
GUI delivery and the engine. It matches prepared identity, consumes permission,
requires exact update/active lease, pauses, rechecks live ownership and verifies
the observed vehicle state before returning raw snapshot evidence. No saved
executable queue or retry. Review manifest
`4cfe11adfb26419238cbdd9c7b9cb7d3633d5bf0d2ae4d64d8f293c194ae08b4`.
Unstaged and not TF3-verified. Repeated releases/commands, startup, lease renewal
and full control restrictions still prevent Phase 1 completion.

Latest adapter work: execution receipts now require raw selected-state evidence
(vehicle identity, actual owner/stop flag, company balance, sequence and held
update). The mailbox computes a scope-labelled digest and rejects digest-only
success receipts. 380 automated checks pass. This defines/validates the receipt
boundary; the engine executeHeld producer and repeatable lifecycle are still
missing. No mod or launcher change was staged, and Phase 1 remains incomplete.

Current source (12:43 UTC): initial checkpoint release is wired through the real
GUI/engine boundary. Same bound round, active lease, held receipt and exact paused
update are required; resume permission is consumed before one speed-1 command.
Unknown release stays terminal; preparation requires confirmed running phase.
377 automated checks pass; source manifest
`88e4eff11304bb02c7ea3bbd3a1d597e4821d4c2e4880aa73412c5c68f305244`.
Still unstaged/unverified in TF3. executeHeld, repeatable release/barriers, renewable
session startup and full input restrictions remain missing; Phase 1 is incomplete.

Current source (12:36 UTC): held checkpoint capture is wired across GUI/engine
and mailbox. It validates binding/lease/exact update, pauses through the existing
single-attempt command when needed, then returns raw company balances. The local
adapter computes a scope-labelled selected-state digest and rejects hash-only
echoes by default. This does NOT identify the entire loaded save. Common initial
baseline/load identity and a reusable operation lifecycle are still missing.
Review hash `2d777e69995a022ee2e6668f116d965dfdb0db543a490c9bb4b7324dbb5c528b`.
Not staged; no new user test yet. Phase 1 remains incomplete.

Latest source (12:29 UTC): prepare now traverses mailbox/GUI/engine inspection.
It verifies bound ownership, live lease, sequence and future schedule, reads real
vehicle ownership/revision, and returns the participant's correlated preparation
receipt. No vehicle mutation or saved automatic execution. Only one outstanding
preparation is allowed until execute/release exists. 374 checks pass; nine-file
review hash `04ce79345a576811a60fdf75da5f6789d876ad6b0d4f023461c4a45cdc213446`.
Unstaged; Phase 1 and the next integrated game test remain incomplete.

Current source (12:25 UTC): bindSession is wired through codec, optional participant
handshake, GUI and engine. Two-to-four distinct real company entities are checked
against the local player and live lease; accepted bindings cannot be reassigned.
Binding acknowledges the roster only, not the checkpoint. Source review hash
`d854beb2a0e25f56a5fa23ef220a28ad9fbc48079b230158f107ef7a8f510f54`.
Unstaged/unverified in TF3. Real driver startup and remaining engine operations
are still incomplete; the successful local diagnostic build remains installed.

Current development (12:20 UTC): the first engine mailbox consumer operation is
implemented in source: terminal halt, gated by matching active engine lease,
strict shape, local company and a persisted one-attempt barrier. GUI exports a
correlated receipt in the existing AsyncSessionParticipant format. Other
coordinator operations remain unavailable; no full adapter/session startup claim.
370 automated checks pass; source manifest
`d40d7a60a19e6e2cf922776875426405b842ebedd86d4879867156fbb3c959c7`.
Not staged; no new manual test requested. The proven 84a6261d build remains staged.

Current verified milestone (12:11 UTC): guided batch plan 3 passed in one real
TF3 instance on staged manifest 84a6261d. Exact held action/snapshot at 2910,
user-confirmed native restrictions/restoration, resume and autonomous expiry stop
at 3013 are recorded in reports/local-batch-940c26e4-8134-41b4-8141-92653f699d9d/report.json.
This closes the local diagnostic batch, not Phase 1. Real coordinator consumer,
repeatable engine operation boundary, speed arbitration and killed-helper evidence
remain open. Do not ask for another repetition of this successful batch.

Development after that pass: source-only receipt collection now continues after
helper heartbeat loss, while arm/renew command dispatch still requires a live
acknowledgement. Async participant halt-delivery failure cannot be recertified by
a later receipt. 368 automated checks pass. Source manifest a2388757 is NOT staged;
the proven 84a6261d build remains installed pending a coherent next test batch.

The repair chronology below is historical, superseded by the verified milestone.

Latest handoff (12:07 UTC): source/staged manifest
`84a6261dd3b303e3582529ffcf227c78b91bfae2291768909924261952560a09`.
The 12:04 run held/applied at 3001 and resumed, but watchdog stayed armed after
expiry. The registered postUpdate still received no update result: update returned
nil. Native fun_elements/fireworks scripts demonstrate the non-nil result handoff.
Update now returns a transient marker only for active leases; postUpdate checks
the marker and revalidates the live lease. 366 checks pass; source/copy verified,
previous mod/cache backed up. No game launch; actual expiry stop still unverified.

Latest correction (12:00 UTC): the 11:57–11:58 run again passed through resume
(held/action 2908) but watchdog timed out. postUpdate was implemented but omitted
from tf3mp_status.gs.lua, so the callback was not registered. Descriptor now
registers postUpdateScript; regression verifies all five implemented lifecycle
bindings. 366 automated checks and package review pass, source hash
`cdd6e7b0218efa9921a90ba68244c33280f256fb5b81da1a53b04c7980596fba`.
Staged at 12:01 UTC with TF3 closed and source/copy checks passing. Autonomous
stop remains unverified. Launcher was open but its binary was not changed.

Current repair: watchdog expiry now attempts its one engine stop in postUpdate,
following native game-script mutation examples. The 11:49 user run passed held
vehicle action/snapshot at 2931, control confirmation/restoration and resume,
but expiry at tick 57424/update 3037 stayed stopping/outcome_unknown and later
telemetry advanced at speed 1. The swallowed update exception was not captured;
an update-context restriction is a hypothesis, not a proven exception diagnosis.
New handler exceptions are reported as handler_failed without retrying the stop.
Source manifest: `4a2cd6e332806aca553770c57f7638d3e2d13c6bc35539c2cb6296a6345e3a35`.
Staged with backup/source-copy verification at 11:56 UTC; 366 automated checks pass.
Runtime verification remains required; Phase 1 is not complete.

Previous repair: the 11:38 UTC user run FAILED when opening a vehicle window;
the crash log also confirms the same failure in MaintenanceStationWindow.
Tf3MpGuardedActionBar returned a recipe node instead of a builtin layout root.
Source now wraps original action-bar and both manager delegation paths in
BoxLayout. Fixed source review hash:
`d72a3e6f8f784ca1a9de56b55111896ffa552caa1903c02c7c3e762bf380ab97`.
Staged at 11:45 UTC after confirming TF3 and launcher were closed; source/copy
verification passed. Runtime verification is still required.
Exact hold at update 2934 passed before the UI
reload; native restrictions and watchdog expiry were not reached. The producer
reset correctly failed the batch and remains a safety fence.

Previous handoff: launcher 0.6.20 and the matching source mod were staged for ONE
bounded local capability test (guided-local-batch.md), not a completed Phase 1
release. Staged review hash:
`f1c129c9229050952f211dd6175863adb43117130393098a2b00052c4490336b`.
Staging at 10:54 UTC preserved the old mod/cache in
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_a8750bb8bb8040a9948e487600e0295a`.
The assistant verified TF3 was closed and did not launch it. User runtime evidence
is needed for recipe loading, native restrictions and engine watchdog expiry;
the reusable consumer and broader Phase 1 gates are not claimed complete.

Four separate companies, one player per company, independent finances/assets.
Host-authoritative ordering; host inputs take the same validation path. Automatic
authenticated save download. Direct LAN/port-forwarded Internet play; no VPN,
relay, shared-company mode or host migration. Matching game/mod builds; audited
game builds recommended, not a blanket admission requirement.

No assistant-launched game, binary patching, silent funding, save overwrite,
native attachment or public publication. Use original code and supported APIs.
Unknown execution outcomes are not retried or automatically compensated.

## Phases and acceptance gates

| Phase | Current evidence | Remaining acceptance gate |
|---|---|---|
| 1. Synchronization | Local held vehicle action/resume, visible speed-button restriction/restoration and orderly helper-stop cleanup verified. Async participant/mailbox and release-ack coordinator tested with synthetic engines. | Real engine consumer, speed arbitration, comprehensive native-control restrictions, failure halt and multi-game barriers. |
| 2. Playable second company | Creation, inspection and journal isolation verified. Direct-depot validation functions exist, unwired. | Direct preview/build, confirmed funding, vehicle purchase, line/service, company UI and isolated expenses/income. |
| 3. Two-game proof | Not run; no real-engine adapter connected. | Same checkpoint, distinct companies, no-input baseline, Stop/Start/speed with equal actual updates and state hashes. |
| 4. Recovery | Protocol halt/no-retry behavior tested on models. | Actual engine halt, coordinated checkpoint, authenticated company restoration and checkpoint reload/rejoin. |
| 5. Road alpha | No complete replicated build/operate loop. | Roads/depots/stops, vehicles, lines and costs replicated; unsupported local controls blocked. |
| 6. Host/Join UX | Launcher, encrypted save pull and staging verification exist. | Supported save/mod activation/loading, company setup and readiness/recovery UI; otherwise precise manual instructions. |
| 7. Qualification | Two/four synthetic peers and real laptop transport tests. | Four real games, Internet failure/latency tests, security review and approved release bundle. |

Do not increase action coverage to compensate for a failed Phase 1 gate. Phase 2
may advance as isolated disposable-save experiments; it cannot prove multiplayer.
Build/stage coherent usable game-test batches, not helper-only model changes.

Adapter wire contract now preserves the origin player, client request identity,
protocol version and command type through mailbox serialization. Strict decoding
tests pass (361 total checks). This repairs a prerequisite for engine-side company
binding; it does not itself connect the TF3 consumer or establish load fencing.

Latest verification: 363 checks pass. The GUI entry allowlist now admits both
terminal stop modes (halt_test/watchdog_test); previously their handlers were
unreachable despite the synthetic helper tests passing. Source consistency tests
cover gate/dispatcher/helper mode agreement. That mode-gate fix was staged at
10:54 UTC; the newer layout repair above remains pending staging.

## Recorded evidence

Game results were supplied by the user; the assistant did not launch TF3. These
are save/build-specific, not general compatibility claims.

- Executable: `a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`.
- Quiet panel, GUI/helper communication and engine probe passed.
- Vehicle Stop/Start: immediate updates 2523/2633; scheduled target=actual
  2603/2818 and 2575/2627/2692/2757. All single-game experiments.
- Passive pause/resume observations passed; observation does not lock the engine.
- 0.6.12 immediate pause diagnostic passed at 08:11 UTC: held update 2879,
  fresh paused-event tick 57181 and explicit resume progression to update 2883.
- 0.6.13 exact hold passed at 08:19 UTC: target=held 2904, fresh paused event
  tick 57207, explicit release and update 2909. No native-control or two-game proof.
- 0.6.14 combined test passed at 08:30 UTC: target=held=vehicle application
  update 2919, sequence 1; explicit release then update 2922. A fresh vehicle
  action executed inside the local hold. No multi-game or native-input proof.
- Creation: original 3141, target 55652 at update 2546. Inspection at 2614:
  original balance 40,397,153, five assets, one vehicle/line; target zero.
- Accounting at 2898: original stayed 40,393,094; target 0 → 1,000 → 0.
  This leaves journal history; construction/operating cost attribution is unproven.
- Laptop `run-6BgxTG`: save download, five reconnects, wrong-key rejection,
  diagnostic gameplay rejection and final host health passed. Laptop cannot run TF3.
- Launcher 0.6.15 user run at 08:42 UTC held update 2916, acknowledged restriction
  and restoration, then resumed to 2921. User confirmed greyed-out speed buttons.
  Subsequent user cleanup test confirmed immediate unlock on Stop helper while
  simulation stayed paused until manual resume. Keyboard/controller bypass and
  forced-crash expiry remain unverified; see speed-control-test.md.
  Remote gameplay remains disabled. Final build/test evidence is in completion-audit.md.
  See vehicle-hold-test.md for the bounded manual test.
- Phase 1 contract batch: `npm run check` passed all 197 tests, including
  two/four real-socket synthetic adapters and 12 new barrier-failure tests.
  No Teal runtime or actual game barrier is exercised by those tests.

## Immediate blocker and next test

The native-control audit now identifies concrete bypasses: the ordinary vehicle
window and vehicle manager can submit Stop/Start outside host ordering. Public
`api.gui.byId.setEnabled` is a candidate for tagged controls, but reading/owning
and safely restoring existing rules is not exposed in its inspected declaration.
The speed/tool locks alone cannot close this gate. See the exact source locations
in phase1-engine-control-audit.md and the unsent phase1-api-questions.md draft.
The phase is not complete or generally game-test-ready; these feasibility gaps
must not be replaced by another narrower diagnostic success.

Further inspection found a public `react-replacement-config` resource and
`ReactReplacementApi.ReplaceRecipe` callback. Exported vehicle action-bar and
manager-content recipes offer a route that does not need shared enable-rule
restoration. This corrects the earlier assumption that vendor clarification was
the only next step. See phase1-recipe-replacement-investigation.md for verified
source boundaries, replacement conflicts, speed limits and remaining coverage.
Implementation/runtime verification is still required; no vendor query was sent.

Native-control implementation now exists in unstaged source: the public resource
installs an action-bar callback guard and a manager-content replacement. The
existing explicit control-acquire/release diagnostic arms/releases the GUI latch;
helper loss does not clear it. Acquisition now waits for zero original manager
subtrees across two checks, tracking from initial render through unmount. A
newly detected original subtree after acknowledgement causes a conflict instead
of retaining a successful receipt. Nine content files pass package validation and
350 automated tests pass. The new checks are source/package checks, not Teal
execution. Manager lifecycle behavior, previously queued commands, replacement
conflicts and GUI reload behavior remain unverified. Do not interpret the acquired
receipt as proof that every native control is restricted.
No new in-game test or staging is requested yet.

Engine watchdog source now accepts a strict eight-field arm/renew event, binds
the local company and nonce, and uses a 100-engine-tick expiry measured from the
request's issued tick (not receipt time). Expiry wins over renewal; only strictly
newer sequence/tick pairs extend a live lease. The engine update callback performs
one persisted stop attempt without GUI/helper participation. No resume/disarm or
saved-lease rearm is provided. This is an opt-in diagnostic foundation, not yet
connected to the reusable participant. GUI/helper delivery and a receipt-driven
one-arm/no-renewal expiry monitor are now implemented via requestWatchdogTest;
the guided launcher does not invoke it yet. Paused games may
not run update callbacks; a receipt while paused and stop timing require runtime
evidence. It is not a wall-clock guarantee or protection against manual resume
after the terminal one-attempt stop. Source migration is now 8. Package review
and 355 tests pass, including synthetic receipt/observation failure checks, not
engine execution. Real-file watchdog integration now passes expiry and missing-
receipt cases, terminal command fencing and cleanup. Guided plan version 3 now
invokes watchdog expiry instead of an explicit stop, and collects native vehicle
and manager confirmation alongside speed controls. Launcher 0.6.20 is built;
mod source remains unstaged, and reusable participant integration is outstanding.
The integration tests also found and fixed repeated helper shutdown: cleanup now
runs once, and an old helper cannot remove a newer helper's lock. Full check: 358
passing tests. No additional game load or staging is requested.

Work-in-progress mod source now includes an explicit fresh-event stop diagnostic,
GUI request/receipt transport and a helper state machine. A stop receipt plus
stable paused updates with advancing ticks is required; loss of evidence revokes
confirmation. It never retries or resumes. This is not an automatic helper-loss
watchdog or the reusable multiplayer consumer. The new handler has NOT been
tested in TF3 or staged. Launcher 0.6.19 integrates it as the final guided-batch
step after verified resume, without another button; the warning explicitly says
the game ends paused. Subscription migration is 7 in source, 6 in the last
staged build. Do not run/restage this intermediate source as a Phase 1 release;
the reusable consumer, watchdog and remaining native-control work are pending.

0.6.18 adds real read-only engine snapshots to the guided batch after its held
vehicle action. Two fresh reads must agree on the held update, company balance
and vehicle state; mismatches block the batch without retry/resume. Selected-state
hashes are recorded in the report, never labelled whole-simulation verification.
User's 09:31 UTC run verified this step locally: target/action/held update 2970,
two selected-state snapshots agreed, controls restored, resume reached 2974,
and LOCAL_BATCH_PASSED_REPORT_SAVED. No repeat of this build is needed.
The reusable coordination consumer and remote gameplay gates are still unfinished.

Current source work adds monotonic helper-observed timing to this same report
(probe, hold confirmation, accepted vehicle action, release progression), with
explicit late/timeout counts. It neither infers one-way/engine latency nor tunes
the scheduling lead. EngineOperationJournal tests cover persistent-before-effect
decisions and duplicate/unknown fencing in synthetic adapters; it is not yet a
TF3 consumer. No new launcher/mod release is claimed for these helper changes.

The user completed the guided batch at 09:08 UTC: held/action update 2947,
restored speed controls, resumed to 2951 and saved report. No repeat required.
Launcher 0.6.17 reduces Debug to five primary actions and collapses specialist
diagnostics under Advanced. This UI cleanup changes no game/mod behavior.

Launcher 0.6.16 consolidates the existing engine probe, exact hold, held vehicle
action, speed restriction and explicit restore/resume into one guided local
session with an atomic JSON progress/results report. See guided-local-batch.md.
This exercises existing engine handlers; it does not implement the new reusable
multiplayer engine consumer. No mod content change or restaging is required.

The new AsyncSessionParticipant and AsyncEngineMailbox implement receipt-driven
coordination, with an optional all-released gate in SessionCoordinator. They are
not yet connected to the TF3 mod or Host/Join. The mod needs a scoped engine
session consumer, atomic ownership/execution checks, canonical snapshots and
real halt/expiry behavior. See async-coordination.md for the contract and the
consolidated next manual-session plan. Do not wire remote gameplay before native
control coverage and the real adapter's acceptance gates. No private hooks.

A second game-capable instance is required for Phase 3; four are needed for the
Phase 7 claim. More laptop or Node tests cannot clear those runtime gates.
