# Scheduled local vehicle test — 0.6.7

User result: scheduled Stop at 2603 and Start at 2818 both matched their targets.
Launcher 0.6.8 adds shorter optional delays and disable; use the
[combined check](batched-vehicle-check.md) for the next session.

Immediate Stop/Start was confirmed by the user at updates 2523 and 2633.
This next test checks a real action at an exact update, on one PC only.
It does not establish multiplayer synchronization.

## Run once

1. Use launcher 0.6.7 and a disposable mod-enabled save. Start a fresh Host.
2. Load that save yourself and run at normal speed. Wait for bridge_connected.
3. In Debug choose **Enable scheduled vehicle test**. Do not enable the
   immediate test first: mode is fixed for the lifetime of this helper.
4. Open an owned vehicle and click **MP test Stop** once.
5. Expect vehicle_test_accepted with code SCHEDULED_LOCAL_TEST and a positive
   scheduledUpdate (current helper update + 60). Wait without other clicks.
6. Success is vehicle_test_applied with updateCount equal to scheduledUpdate,
   plus a visibly stopped vehicle. Only then test MP test Start once.
7. Send the log events. On rejection, stop; do not retry in that session.

Do not pause, change speed, reload the UI, load another save or close the
helper while waiting. Save only to a disposable slot if necessary. The original
immediate test remains available in a fresh helper session.

## Design and limits

The GUI caches the fixed-schema approved command, outside GameScriptState.
A regular per-frame callback reads the current game update and tries dispatch
at target minus one. Installed API documentation says GUI commands execute on
the next simulation step. Whether GUI snapshot timing aligns exactly is not
yet tested. Missed frames may cause safe rejection; this is not a production
lockstep scheduler or pause barrier.

Before dispatch, the GUI checks that the live helper config and command file
still match. It consumes its pending command before dispatch and never retries.
The engine performs the action only inside the fresh event callback, after
exact-update, expiry, inspection, ownership and revision checks. An early or
late event returns its actual update and makes no vehicle mutation. The helper
independently refuses an applied receipt for any other update.

Only snapshots/receipts persist in script state; updates discard the obsolete
inbox and contain no vehicle execution path. Saved data alone cannot execute
a pending vehicle action. Do not restore saves while leaving the helper and
GUI session live: restoring an older duplicate barrier is not supported.

Remote admission stays blocked. Cancellation after engine delivery is not
guaranteed. Local userdata remains trusted executable mod data. Tests cover
the Node controller and synthetic mailbox flow plus source structural guards;
they do not run the TF3 engine or compile Teal.
