# Passive normal-placement observation

This replaces the coordinate-picker experiment, not normal construction. It is
not command interception, cancellation or multiplayer. The mod records at most
eight create and eight apply events per GUI-state lifetime, plus one readiness
record. GUI reloads can start another lifetime. It never retains native proposal
objects, returns restrictions, funds a company, or submits a gameplay command.

Revision 2 fixes a diagnostic blind spot: revision 1 read the engine clock and
logged inside guiHandleEvent, with exceptions silently swallowed. That could
produce readiness without samples even if events arrived; it is not a confirmed
cause of the previous missing events. Revision 2 queues scalar text for guiUpdate,
uses unknown (-1) clocks, reports callback failures, and sends a once-only
synthetic GUI self-test under a separate mod-owned event name. The self-test is
not a native placement or a construction command and does not count as one.

## One disposable-save run

Revision 6 adds a separate read-only field qualification for
`streetTerminalBuilder` only. It records counts of added/removed street nodes and
segments, edge objects, construction additions/removals and result entries, plus
declared proposal cost, critical-error flag and consistent owner fields. Arrays
are bounded at 64 entries; no native references, parameter tables, terrain data
or executable payloads are stored. These are selected facts, not a full proposal
codec or a validated payer/debit receipt. An unavailable/bounded read names its
fixed field when possible. Other builders keep delivery-only observation.

For this revision, combine loading and normal preview/cancel/place in one run,
then collect the log; no separate routing-only repetition is needed. The normal
placement remains an ordinary purchase by the active company on a disposable
save. No helper, funding action or Company Tools button is required.

Revision 5 addresses the next live result: revision 4 passed both route checks,
but native events triggered nine observer errors and no usable samples. This
proves arrival at one of the native-event branches, not successful payload capture
or which stages arrived. `rawget` was used only by our observer, whereas stock
mission code uses direct outer positional indexing. Its availability in this
runtime was not established; it is the leading suspect, not a proven diagnosis.
Revision 5 uses the stock indexing pattern inside a separate protected block.
Failure there now records event delivery with `shapeInspected: false` and unknown
slot types instead of dropping the sample. Only type strings are retained, never
native proposal objects. Other observer failures still report as errors.

Revisions 4–5 retain the synthetic route check from the status panel's regular
react.onStep, the established receipt-reading context. The game-script handler
returns an explicit scalar acknowledgement without modifying GUI state. The
report distinguishes a thrown dispatch (`selfTestCallSucceeded: false`) from a
completed call without the expected acknowledgement (`true` with delivered false).
Revision 3 called only once on the first GUI step and reported no acknowledgement
on the same timestamp as `Game is ready`. Subscriptions are installed by the game
script's update, so that result did not exclude an initialization race. Revision 4
checks every 60 GUI steps, up to 12 attempts, stopping on the exact acknowledgement.
This is a frame-count bound, not a wall-clock deadline. Only read-only diagnostic
calls retry. Each attempt also checks the established `tf3mp_get_status` route and
logs only its success flag plus the self-test return type, never returned payloads.
The positive control is not a substitute for the self-test acknowledgement.

First load the save and let the agent inspect this automatic check. Do not place
another stop until routing is confirmed; the steps below then use the same load.
Let the simulation run briefly after loading so engine subscriptions can initialize.

1. Load a disposable save with the newly staged TalCo mod. Launch TF3 yourself.
   No helper, Company tools or Phase 2 setup button is needed for this observer.
2. Open the game's **normal roadside bus-stop tool**. Move it along an existing
   road until the native preview snaps and shows a valid location.
3. Cancel that preview once. Reopen the normal tool and place one valid stop.
   This is an ordinary local purchase by your currently selected company; use a
   disposable save. Do not use multiplayer, company funding or setup diagnostics.
4. Tell us the action finished (or report any unexpected UI/game error). Do not
   restart the game before collecting stdout: a new launch can replace that log.

The observer does not require restarting the helper. One game reload is needed
to load this changed script. No road-snapping approximation is requested.

## Read the result

From the project directory:

```powershell
node tools/read-native-placement-log.mjs "E:\Steam\userdata\109855567\3493540\local\crash_dump\stdout.txt"
```

This reads only the log and prints sanitized scalar evidence, not native payloads.
The game writes `native_placement_observer_ready` and, if delivered,
`native_placement_observed` events into that log. Events do not appear in launcher
Debug in this batch; no new launcher executable or diagnostic button is needed.

- `OBSERVER_NOT_SEEN`: this log contains no readiness record; it cannot test
  event delivery. Check staged version, active mod, log path or runtime error.
- `NO_PLACEMENT_EVENTS_SEEN`: observer readiness exists but neither event was
  recorded in the latest GUI lifetime. Investigate subscription/delivery; do not
  conclude that the engine cannot expose proposals.
- `GUI_ROUTE_PENDING`: revision 4 or later has not completed its bounded startup check.
- `GUI_SELFTEST_NOT_DELIVERED`: the mod-owned GUI diagnostic returned no verified
  acknowledgement (revision 4: all 12 attempts exhausted). This does not prove
  the callback was never invoked. Compare `controlDelivered` and `selfTestReturnType`.
  Investigate routing before
  drawing conclusions about native placement. This is not a command veto test.
- `OBSERVER_CALLBACK_FAILED`: a native placement callback reached the handler
  but observation threw; the diagnostic failure is no longer silently discarded.
- `PARTIAL_EVENT_OBSERVATION`: one lifecycle stage was seen.
- `CREATE_AND_APPLY_OBSERVED`: both event names were seen. This does not pair
  individual previews with purchases or establish a pre-execution interception
  point. Clock values are observational and may be unknown (-1).

Results from earlier GUI lifetimes are not merged with the latest one. Preview
sampling is capped and may end before the final valid preview. Returned userdata
types are evidence of outer payload shape only, not a serialization guarantee.
For revision 5, `shapeInspected: false` means all three slot types are unknown;
their `nil` placeholders must not be interpreted as observed absent slots.
Unknown/error observations never trigger retries, refunds or replay.
Revision-6 `proposalFacts.code: readable` means only that the selected fields
were readable and bounded. `unavailable`, `bounds` or parser-side `invalid` do not
erase valid basic delivery evidence and do not permit execution. All multiplayer
and replay-verification flags remain false regardless of those facts.
