# Local owned-vehicle experiment — launcher 0.6.6

Runtime result: the user confirmed Stop and Start, with engine applied receipts
at updates 2523 and 2633. Launcher 0.6.7 retains this immediate mode and adds a
separate [scheduled experiment](scheduled-vehicle-test.md), not yet verified.

This version tests an **immediate, single-host vehicle command**, not exact-update
gameplay synchronization. The separate no-op timing probe is unchanged.

## Why the test changed

0.6.4 inspection succeeded but commit timed out. 0.6.5 reported no_inspection
after a successful inspection, consistent with callback-local state not
surviving as assumed. Neither version established successful vehicle execution.

0.6.6 performs inspection and commit on fresh engine events. The receipt in
script state carries the inspection snapshot and duplicate barrier; no
Lua-local authorization must survive between calls. Commit rechecks the
snapshot against the current engine and executes immediately in that same
callback. There is no executable vehicle queue. Updates discard the obsolete
0.6.5 inbox and cannot execute it.

This is a narrower experiment, not a completed replacement for the multiplayer
 scheduler. Immediate Stop/Start is now user-confirmed inside TF3. The automated Node tests use
synthetic receipts; structural checks are not a Teal compiler or runtime test.

## One-PC test

1. Use a disposable copy of a save containing an owned transport vehicle.
2. Start Host in the main launcher, start TF3 yourself, and load that same
   mod-enabled save. Keep the simulation at normal speed.
3. Wait for bridge_connected, then choose Debug → Enable local vehicle test.
4. Open an owned vehicle's window and click MP test Stop exactly once.
5. Expect vehicle_test_inspecting, vehicle_test_accepted with code
   IMMEDIATE_LOCAL_TEST, then vehicle_test_applied or an explicit rejection.
   scheduledUpdate = 0 now deliberately means immediate. The receipt's
   updateCount is the actual observed execution update; do not compare it to 0.
6. Check the vehicle's stopped state in-game. Only after a confirmed outcome,
   click MP test Start once and verify its result.
7. Send both sets of logs. On failure, stop testing and report the code.

There is no queued acknowledgment expected for this version. Do not repeatedly
enable the test or click actions while waiting. Do not overwrite your original
save. Native vehicle controls do not pass through this adapter.

## Safety limits

- Disabled by default; solo Host only. Existing participants block enablement;
  subsequent control-channel joins are blocked until the helper restarts.
  The separate save-transfer listener remains available.
- Session nonce, action identity, immutable local-company binding, vehicle
  ownership, entity revision and desired state are checked. The engine requires
  the matching inspection and rejects backwards clocks, expired inspections
  and nonzero scheduled targets.
- Commit records a terminal duplicate barrier before calling the sole allowed
  mutation, makeVehicleSetStoppedByUserCmd. Failed or uncertain commits are
  never automatically retried.
- A saved receipt or old inbox alone cannot cause a vehicle mutation on load:
  update contains no vehicle execution path. This is not a general replay
  guarantee across restoring older saves while a helper/UI session stays live.
  Do not load saves, reload UI or switch companies during a test. Close the
  helper before changing saves and start a fresh session afterward.
- Stopping the helper cannot recall an event already delivered to the engine.
  Wait for its result before stopping. No production cancellation protocol exists.
- Local userdata is trusted executable mod data. Remote players cannot send
  arbitrary Lua through this adapter.

## Still missing

Exact-update real gameplay execution, remote executors, safe company
provisioning, pause/startup barriers, native-action interception, cancellation
and checkpoint recovery across running games. The laptop can later test
connections/transfers without TF3, but cannot verify two-engine synchronization.
