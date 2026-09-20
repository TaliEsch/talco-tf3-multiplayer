# Combined local vehicle/hold test — launcher 0.6.14

Prerequisite evidence: the user passed exact hold at update 2904 on 19 September
08:19 UTC, fresh paused-event tick 57207, then explicit release and update 2909.
This batch tests an owned vehicle command INSIDE that kind of hold. It does not
apply a vehicle and pause simultaneously, connect remote gameplay, or restrict
native controls. It is an experiment, not a multiplayer feature.

## One bounded manual test

1. Close the old game/helper. Use an untouched disposable save with this staged
   mod and an owned running vehicle. Do not overwrite the original save.
2. Start a fresh solo Host, launch TF3 yourself, load the disposable copy at 1x,
   and open the running vehicle window. Wait for engine observation connected.
3. Debug → **Test vehicle + hold**; accept the warning. Do not enable other tests.
4. Wait for `combined_test_select_vehicle` ("Held • click MP test Stop").
   The simulation should already be paused at the logged scheduled update.
5. Click **MP test Stop** once in that vehicle window, not the normal stop button.
6. Wait for `vehicle_test_applied` and `combined_test_action_held`. The action's
   scheduledUpdate/updateCount must equal the pause's heldUpdate.
7. Click **Release pause test**. Expect `combined_test_passed` after resume and
   advancing updates. Confirm the selected vehicle remains user-stopped while
   the rest of the simulation runs. Send pause_test, vehicle_test and combined_test logs.

If anything fails, do not retry or assume nothing changed. Stop the helper and
resume manually if needed. Events already dispatched cannot be recalled. A failed
vehicle test deliberately does not authorize helper-controlled release. Do not
reload with the helper active; do not save over the original. The saved scheduled
pause attempt marker means a save made after the previous test cannot repeat it;
use a clean disposable copy rather than clearing the marker.

## Safety and evidence boundaries

- Fresh solo host closes remote admission for its lifetime.
- Pause is scheduled +40 updates and checked exactly in a fresh engine event.
- A new paused event establishes the checked hold before vehicle intent is enabled.
- Held vehicle requests/receipts use schemaVersion 2; legacy v1 cannot certify it.
- Inspection, owner/revision checks and the existing pre-mutation duplicate barrier
  remain. Engine requires the same session/company checked hold, zero speed and
  exact update both before and after vehicle execution. No speed command is
  added to the vehicle handler.
- One vehicle transaction per helper: successful completion disables further
  intents and enables explicit release; failure never retries or resumes.
- A lost hold or connection cancels pending approval/application, but cannot undo
  an already applied command. Normal game controls remain unchanged; leave them alone.
- Automated tests use synthetic receipts and real local files, not TF3. Only the
  user's new runtime result can establish held execution. Multi-game timing,
  canonical hashes and native-control coverage remain unverified.
