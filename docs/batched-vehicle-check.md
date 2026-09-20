# Combined local check — launcher 0.6.8

Purpose: validate shorter delivery and disable in one session, rather than
asking for a new build after each successful button click. Immediate execution
and 60-update scheduled Stop/Start have already been user-confirmed.

## One report, one session

1. Use a disposable save. Start a fresh Host, launch TF3 yourself, load the save
   and keep normal speed. Do not reload, pause, switch companies or change saves.
2. In Debug choose **40 updates (~8s)**, then **Enable scheduled vehicle test**.
   20 and 40 are experimental; 60 remains the tested default.
3. Perform Stop → Start → Stop → Start, waiting for an applied result and
   checking the visible vehicle state after EACH action. Targets and actual
   updates must match. Extra clicks during a transaction are discarded.
4. If all four succeed, request one more Stop. As soon as accepted appears,
   choose **Disable vehicle test**, confirm promptly, then wait at least
   15 seconds. Observe whether the vehicle stopped. Do not issue further actions.
5. Choose **Copy logs** and send the complete result plus what you observed.
   Any earlier failure: stop the sequence and send the logs immediately instead.

Disable removes the helper command and restores telemetry-only mode. The GUI
rechecks both just before dispatch. It cannot recall an event already delivered;
CANCEL_REQUESTED_OUTCOME_UNKNOWN is intentionally not a cancellation-success
claim. A disabled/faulted test needs a fresh Host session; do not retry an
uncertain action automatically or assume it was undone.

## Offline checks

Debug → Run offline checks runs the automated Node suite in temporary directories
and localhost sockets. It does not launch/use TF3 or mutate your live save or
bridge. The suite includes 2/4 synthetic participant models, receipt integrity,
ownership, early/late/expired/failed outcomes at each preset, disconnect/reset,
extra-click dropping, and disable behavior. Passing these tests does not prove
the real engine's behavior or synchronization between two running games.

The non-game laptop can later exercise network connection/transfer tests.
Remote gameplay is still blocked during vehicle tests. Company provisioning,
production timing barriers, command coverage and multi-game recovery remain
separate work; the global gameplayVerified flag remains false.
