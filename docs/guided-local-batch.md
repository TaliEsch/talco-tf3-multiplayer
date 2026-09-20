# Guided local batch — launcher 0.6.20 source/build

Current staging: 19 September, 12:07 UTC, update-result handoff repair
`84a6261dd3b303e3582529ffcf227c78b91bfae2291768909924261952560a09`.
Update now returns a non-nil transient marker for active leases so the registered
postUpdate can run. Earlier steps passed in the 12:04 run; autonomous expiry did
not. Same guided procedure, fresh pre-test save, no runtime success claim yet.

Previous staging: 19 September, 12:01 UTC, callback-registration repair manifest
`cdd6e7b0218efa9921a90ba68244c33280f256fb5b81da1a53b04c7980596fba`.
postUpdateScript now references the watchdog callback; the preceding build
omitted that registration and timed out. Use a fresh host and pre-test disposable
save for the same guided batch. The expected final event remains
watchdog_test_confirmed, then LOCAL_BATCH_PASSED_REPORT_SAVED.

Previous staging: 19 September, 11:56 UTC, watchdog postUpdate repair manifest
`4a2cd6e332806aca553770c57f7638d3e2d13c6bc35539c2cb6296a6345e3a35`.
The 11:49 run passed through resume but failed autonomous expiry. The watchdog
now attempts its single stop in postUpdate; handler exceptions are explicit.
Use the same guided batch and pre-test disposable save; runtime repair unverified.

Previous staging: 19 September, 11:45 UTC, layout repair manifest
`d72a3e6f8f784ca1a9de56b55111896ffa552caa1903c02c7c3e762bf380ab97`.
The prior 11:38 run held correctly but crashed when opening a vehicle; the
action-bar and manager wrappers now have builtin layout roots. Before starting
the batch, open vehicle, maintenance-station and vehicle-manager windows to
check ordinary unlocked rendering. Stop if a UI error occurs. Use a disposable
save from before the failed hold, not a save made during/after that test.

0.6.20 replaces the explicit terminal stop with engine watchdog expiry after
the existing resume check. This workflow is automated-tested but not TF3-runtime verified
in TF3 yet. It is an intermediate Phase 1 capability test, not the full phase exit.
Reports have `testPlanVersion:3`; old reports do not cover watchdog expiry or the
new native vehicle/manager confirmation. This capability batch was staged at
10:54 UTC on 19 September after confirming TF3 was closed. Source/copy validation
passed; the prior staged mod and cooked cache were backed up. One user-run
disposable-save test is now needed before relying on these engine/UI mechanisms.

User runtime passed on 19 September at 09:08 UTC: hold and vehicle action at
update 2947; control acknowledgement/confirmation/restoration; resumed to 2951;
LOCAL_BATCH_PASSED_REPORT_SAVED. This is local evidence only.
Launcher 0.6.17 retains this workflow and moves individual tests into a collapsed
Advanced section. Confirmation is enabled only at the control-check stage.

0.6.18 adds a new read-only step after the held vehicle action: two fresh engine
snapshots of the vehicle and its company must match before controls are tested.
The user's 09:31 UTC run passed this addition at held/action update 2970 and
resumed to 2974. No repeat is needed just to confirm the snapshot step.

This combines the existing proven diagnostics in one load and produces one JSON
report. It is not the asynchronous multiplayer engine adapter and does not prove
two games stay synchronized. Remote joining is blocked for the helper lifetime.

## One session

1. Use a fresh solo host and a disposable save from before any exact-hold test.
   Load it yourself, leave simulation at 1x, and open a running vehicle you own.
   Wait for the bridge to connect.
2. Debug → Run guided local batch. Confirm the local vehicle mutation warning.
   Engine probe and exact hold run automatically.
3. When prompted, click MP test Stop ONCE in the open vehicle window. The batch
   verifies the held update and action receipt, then locks speed controls.
4. Try native speed buttons AND keyboard shortcuts. Try the native vehicle
   Start/Stop toggle and check that its stopped state cannot change. Open the
   vehicle manager and verify that the TalCo restriction message replaces it.
   If all checks pass and the game stays paused,
   click Confirm batch controls → Yes. This explicitly authorizes restoration
   followed by brief resume and watchdog expiry, each requiring its own
   acknowledgement. If anything
   bypasses the restriction choose No, then Stop helper; do not retry the action.
   Cancel leaves the game held while you finish checking.
5. The helper sends one watchdog arm and no renewals. The engine must stop at
   lease expiry without receiving an explicit stop request. Allow up to 45 seconds.
   The helper checks the matching expiry receipt, fixed update,
   zero speed and later advancing ticks. Leave speed controls untouched until
   Local batch passed. The game ends paused and the selected vehicle stays stopped.
   Open batch reports and send the latest local-batch-…/report.json, then Stop
   helper. Resume manually only if appropriate after checking the game.

No manual engine-probe, pause, control-lock, restore or release buttons are needed.
Other diagnostic commands are rejected while this batch owns the helper, including
after a terminal result; Stop helper to exit. Do not reload with it active.

## Evidence and failure rules

The report includes build/mod hashes, selected scalar events, stage outcomes,
actual/target updates and explicitly labelled user confirmation. It excludes
keys, join codes, raw payloads, save contents and player names. Each transition
updates one report atomically. A reporting failure is not reported as success.

Current helper source also records monotonic elapsed event times and a `timing`
summary. Intervals run from request-start/acceptance to helper-observed success;
the hold interval includes scheduling and stability checks, and the release
interval includes confirmation of progress. These are not one-way network or
engine execution measurements. Waiting for the user to select a vehicle is not
included in the accepted vehicle interval. Missing samples remain unavailable;
explicit late/timeout counts do not prove the absence of unobserved failures.
No scheduling lead is automatically shortened from these measurements.

Stop records interrupted/unknown, never rollback or success. No automatic retry,
compensation or resume follows failure. Stop the helper, check the controls and
resume manually if appropriate. If the process is killed, the latest report may
remain in_progress: that is incomplete, not passed. GUI cleanup after forced
process death remains unverified. This batch intentionally does not crash TF3 or
the helper or test purchases/construction.

The game-side one-shot safety latches remain intact. Repeating the batch after a
hold still requires a pre-test save reload. Larger batches reduce reloads; they
do not bypass the safety boundary.

The terminal stop is triggered by engine lease expiry in this diagnostic. The
helper remains alive to collect evidence, but sends neither renewals nor a stop.
A real killed-helper run still needs separate evidence. The helper monitors
the confirmed stop until shutdown: stale observations, drift or manual resume
produce `watchdog_test_unknown`. The report records the bounded completed check,
not a guarantee of continued pause after the test or helper shutdown.

## Implementation status

The automated suite covers the controller with simulated events, error paths,
report persistence, and one complete batch through the actual file-based bridge
with synthetic engine receipts. The user's 09:08 UTC run verified the complete
guided controller locally; this does not verify a multi-game session.
For 0.6.18 the mod has changed (subscription migration 6 and snapshot events).
Use the matching staged mod and a pre-test disposable save. The 0.6.18 snapshot
step now has its own user-supplied local evidence; it is not a multiplayer pass.
