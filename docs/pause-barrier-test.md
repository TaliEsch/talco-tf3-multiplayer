# Local pause diagnostics — launcher 0.6.13

## Confirmed evidence and new test

The user confirmed 0.6.12 on 19 September at 08:11 UTC: held update 2879,
fresh paused event tick 57181, explicit release, resumed progression to update
2883. This proves the immediate local pause/event/resume route only.

0.6.13 adds **Debug → Test exact-update hold**. Use a fresh solo Host and a
disposable save at 1x, then select this button instead of Test pause barrier.
The helper chooses observed update + 40, logs `scheduledUpdate`, and the GUI
dispatches at target-1 using the same experimental next-step convention as the
scheduled vehicle test. The engine requires actual update=target BEFORE changing
speed; early/late arrival is rejected and never retried.

Wait for `pause_test_held`, then choose **Release pause test**. Expected final
code: `LOCAL_EXACT_HOLD_EVENT_RESUME_ONLY`, with `heldUpdate == scheduledUpdate`
and the final `updateCount` greater than both. Send all pause_test lines. Keep
normal controls untouched. No vehicle action is included in this test.

The scheduled variant has its own saved attempt marker so the completed prior
immediate experiment does not block this new diagnostic. No saved executable
queue was added. Pending GUI delivery is rechecked against the current helper
nonce, mode and request before dispatch. Start the test once per helper/save
state; do not run both pause tests in one helper session.

This new variant remains runtime-unverified. Passing it still would not establish
native-control prevention, synchronized multi-game barriers or replicated actions.

This is a real speed mutation, opt-in and solo-host only. It is NOT an exact-target
multiplayer barrier, input lock, or proof of synchronized simulation. Normal UI
controls are deliberately unchanged. Do not touch them during the success test.

## Run once on a disposable save

1. Close TF3 and the old launcher before installing this staged mod/build.
2. Start the main TF3MP-Launcher.exe. Start a fresh Host, with no joining peers.
3. Launch TF3 yourself, load a disposable mod-enabled save, and run at normal 1x.
4. Wait for engine_observation_connected. In Debug choose **Test pause barrier**
   and accept its warning. Do not enable any other diagnostic first.
5. The game should pause. The helper waits at least two seconds with stable
   updates and advancing ticks, then sends a NEW engine event while paused.
6. Wait for `pause_test_held` / **Paused event passed**. Click **Release pause test**.
7. Expected final event: `pause_test_passed`, code `LOCAL_PAUSE_EVENT_RESUME_ONLY`.
   This requires an engine resume receipt followed by observed update progression.

Send the pause_test log lines and whether the game visibly paused/resumed.

## Failure and recovery

If it times out, loses the hold or gives an unknown result, do not repeat it.
Stop the helper, then resume using normal in-game speed controls if needed.
Stopping cannot recall an event already delivered to the engine; observe the
game before continuing. No automatic resume, refund, game launch or reload occurs.
Close the helper before reloading a save. Never save over the original.

The engine stores a one-attempt marker in mod state. The helper also isolates
the test for its lifetime and blocks remote admission. A failed or completed
test is not reset by clicking again. Reloading an untouched disposable copy with
the helper stopped resets save state; only do that when deliberately repeating
a new diagnostic build, not to retry an uncertain mutation.

## Implementation/evidence boundary

Fixed local requests and bounded receipts carry nonce, request ID, phase, company,
tick expiry and held update. Phases are pause, read-only check, explicit resume.
Engine phase changes require the previous successful receipt, same session/company,
unchanged held update and speed zero. Only speeds 0 and 1 are issued, in fresh
engine events. No saved work runs in update. Late callbacks cannot promote an
unknown result to success. Failures never trigger compensating speed commands.

GUI userdata stays inside the protected regular callback. Test success is based
on independent engine-event receipts plus clock observations, not a sleep alone.
GUI dispatch while paused is precisely what this runtime experiment must prove.

Automated controller, file-bridge and structural tests do not execute Teal in TF3.
Scheduled runtime remains unverified until the user runs this build. A pass only clears the
local pause/event/resume prerequisite; target-update gating, native-control
restriction, speed arbitration and multi-game validation still remain.
