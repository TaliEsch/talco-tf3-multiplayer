# Receipt-driven coordination batch — 19 September 2026

## Current scope correction

The revised ROADMAP.md is authoritative. This file includes historical design
notes and version-specific progress below; references to complete native-control
restrictions are general-play admission gates, not prerequisites for the next
controlled local test. Leave construction tools unchanged and document that the
operator must not use them during the run. Reuse the existing adapter and tested
speed/vehicle guards; do not add blanket construction-locking wrappers for Phase 1.
Common-save verification and two-real-game proof remain their own later gates.
Coordinated pause/resume, supported speeds and failure handling remain Phase 1
work; the scope correction does not waive those functional requirements.

## Historical implementation notes

Implemented as library code and tested independently of TF3. Not connected to
the production Host/Join path. Existing launcher/mod 0.6.15 remain unchanged.
No user restart or manual game test is required for this batch.

## Boundaries

- AsyncSessionParticipant accepts the existing coordinator messages, but emits
  typed engine requests instead of calling a synchronous engine adapter.
- A resolved publication promise means delivery only. Operation ID, round ID,
  schema and actual engine postconditions must match before progress is reported.
- AsyncEngineMailbox flattens bounded vehicle requests into data-only userdata
  tables. Reads are bounded to 4096 bytes; partial/stale receipts cannot acknowledge
  an action. It uses serialized atomic replacement and exclusive local ownership.
- SessionCoordinator with `requireReleaseAck: true` waits for all participants'
  actual release receipts before accepting another command. The legacy synchronous
  model mode is preserved; it is not suitable for an asynchronous engine adapter.

## Required engine operations

| Request | Required engine result |
|---|---|
| holdCheckpoint | Actual held update and verified common checkpoint identity. |
| prepare | Fresh actual entity owner before the scheduled update. No mutation. |
| executeHeld | Engine-side exact-target hold, atomic owner recheck before a single vehicle action, post-action canonical state hash, held actual update. |
| release | Confirmed release of that hold and actual update. Publication alone is insufficient. |
| halt | Independent acknowledgement that simulation really stopped. |

Only vehicle Stop/Start is permitted through the new action path. Speed changes,
construction, purchases and arbitrary scripts are rejected. The engine must
retain its own duplicate/uncertain-outcome guards: host-side receipt validation
after application cannot prevent a malicious or incorrect engine adapter.

Halt is permanently latched in the participant before callbacks. Status is
pending, confirmed or unknown; it never equates transport disconnection with a
stopped game. Missing/late acknowledgements, lost observations, conflicting
commits, lost holds, ownership changes and mismatched state stop further work.
Execution is never retried or undone. Publications already in flight cannot be
recalled, so the engine adapter must implement cancellation/lease expiry and
still report uncertain outcomes honestly.

## Automated batch

Run `npm run check`. New coverage includes two/four asynchronous participants
through the real coordinator with synthetic engines; three successive commands;
injected state divergence; delayed and duplicate receipts; malformed commands;
lost holds; uncertain delivery; observation loss; engine-operation deadlines;
release acknowledgement gating; and actual temporary-file checkpoint/release
exchange. This is not a real TF3 synchronization or Internet test.

## Integration work still required

0.6.18 implements a real read-only engine snapshot event and protected GUI
request/receipt path in the existing local bridge. After a held vehicle action,
two fresh events read company balance, vehicle owner/running state and held
update. The helper canonicalizes the data as `held_vehicle_company_v1` and
requires matching hashes. Local receipt IDs, ticks and revision are excluded.
Revision remains available as receipt evidence, not part of the selected hash.

This is a selected-state stability check, NOT a whole-world snapshot, checkpoint
identity verification, persistence verification or evidence of equal simulation
across games. It is part of the guided local batch, not the production asynchronous
participant adapter. Its engine code has source guards and synthetic receipt
integration tests; the user's 09:31 UTC run also verified it locally at held
update 2970. This does not verify the reusable coordination consumer.

Development source consumes bindSession and terminal halt from coordination_request.lua in
watchdog_test mode only, with fresh GUI acknowledgement and a matching active,
unexpired engine lease. It emits coordination_receipt.lua in the participant's
existing schema. The engine persists a one-shot unknown receipt before calling
the existing single-attempt halt command; only verified same-update pause yields
status ok. Duplicate requests never dispatch again, including after reload.
This path is source/automated-tested, not staged or game-verified. The launcher
does not yet start a coordinator session or bind a round to the engine lease.
bindSession encodes a strict two-to-four-entry roster as numbered scalar fields;
the engine verifies unique players/companies, existing PLAYER entities, matching
local player/company and live lease. It persists one binding, never reassigns a
saved binding or allows binding after a terminal halt. When a binding exists,
halt also checks its round identity. Binding makes no financial/company mutation.
Its receipt acknowledges mapping installation only, not checkpoint identity.
AsyncSessionParticipant's requireEngineBinding option inserts that acknowledged
step before holdCheckpoint; synthetic pre-bound tests keep the option off. Any
real session driver must enable it. Such a driver is not yet implemented.
Preparation is now wired to actual engine reads in development source. It checks
the 15-field command schema, session/round/lease, roster mapping, next host
sequence, bounded future update, existing transport vehicle and PLAYER_OWNED.
The ten-field wire receipt reports the observed owner; unknown decisions cannot
be overwritten. Inspection metadata/revision is retained but never executed from
update/postUpdate. Only one outstanding preparation currently exists; repeated
rounds depend on the missing execute/release lifecycle. This path is not staged
or runtime verified. holdCheckpoint now requires a matching live binding/lease
and exact current update, takes the existing single-attempt pause path if needed,
then reads each bound company's balance while held. The engine exports raw
selected-state fields, never the request's expected hash. The mailbox derives a
canonical held_company_balances_v1 digest and, by default, rejects a digest-only
receipt. This is not a save-file identity, whole-world hash or determinism proof.
The session driver must independently establish the expected selected-state
baseline at a common held update and verify the loaded-save/checkpoint manifest;
that bootstrap is not yet implemented. Initial checkpoint release is now wired:
matching bound round, live lease, verified held checkpoint and exact paused update
are required. A persisted release_unknown phase/receipt precedes the single
resume command; only same-update speed 1 confirmation enables running/preparation.
No duplicate retry or release after halt. This is initial release only, not the
repeatable command lifecycle. executeHeld remains unavailable, so a full
coordinator session still cannot run. Initial hold remains one-shot
per save through the diagnostic pause safety latch; repeated command barriers
need their own guarded operation lifecycle, not removal of that latch.
Do not manually publish coordinator requests into a user's running session.

Existing experimental
hold/vehicle handlers deliberately have one-shot persisted safety latches and do
not yet implement this new engine contract. Do not remove those latches simply
to reuse the existing tests. Implement a scoped, engine-owned session lease with
per-operation duplicate records, expiry/stop handling and safe reset boundaries.

Also required: canonical snapshots from actual TF3 state, verified checkpoint
identity and company binding, complete native-control restrictions, host-as-player
wiring and two real game instances. Visible disabled speed buttons alone do not
block keyboard/controller actions, construction or other mods. The GUI shared-map
ownership limitation remains. This batch clears none of those runtime gates.

## Consolidated next manual session (not ready to run yet)

After the engine consumer is implemented, use one disposable-save load and one
guided run to check: baseline snapshot; exact hold; blocked speed inputs; one
vehicle action and snapshot while held; confirmed release; repeated operation IDs
without repeated effects; explicit stop while held. Export one summary with the
build/mod hashes, per-step outcomes, actual updates and unknowns. Put helper-loss
last, since it ends the session. Do not attempt repeated purchases or building.

Only require a reload when changing game scripts or when a persisted safety latch
has been consumed. A user must explicitly start the game; the assistant does not.
Real crash/lease-expiry behavior is unverified until tested inside TF3.

## Halt/teardown hardening

The mailbox now latches halt before queued I/O runs. Unpublished normal requests
(including release) are cancelled, subsequent work is rejected, and only the
single halt request may proceed. Closing cancels unsent work as well. A rename
already issued or command already consumed by the engine cannot be recalled;
this is not proof of cancellation inside TF3. A halt receipt is still required.

After a halt receipt, the participant monitors continued held-state observations.
Advancing updates, a released hold, malformed observations or stale evidence
change haltState from confirmed to unknown without reopening the participant or
retrying work. A later ordinary observation cannot recertify that failed session.
These changes have automated coverage only; the real game consumer is still absent.

## Reload boundary

### Renewable watchdog controller

createEngineLease consumes fresh engine observations and explicit session-health
status. It publishes a single arm followed by serial, receipt-confirmed renewals.
Each request expires after 100 engine ticks; renewal starts after 40 ticks. While
awaiting renewal acknowledgment the previous confirmed expiry remains binding.
Simulation pause does not stop renewal if engine ticks continue. Lost evidence,
failed publication, expired lease or acknowledgment timeout terminally stops it.
It neither resumes TF3 nor certifies that expiry has stopped TF3. The real session
driver must wire this controller, observe separate halt evidence, and enforce
input restrictions before enabling remote gameplay.

### Execution receipt evidence

### Observed startup agreement

SessionCoordinator.capture(players,{updateCount}) broadcasts coordination_capture
without an expected hash. Each asynchronous participant binds, schedules the hold
and reports the digest computed from its raw held snapshot. The first digest is
only a candidate; every distinct participant must match before coordination_ready
permits any release. Duplicate readiness and mismatch halt. prepare still requires
an explicit expected hash. Neither path establishes which save was loaded or
whole-world equivalence from company balances alone.

Development engine release now accepts checkpoint_held or action_held. Action
release requires a successful matching execution receipt and current sequence.
Only observed successful resume advances nextSequence and retires the completed
command slots. Previous release identity/update and monotonic command sequence
remain persisted replay fences; unknown release never reopens preparation.
This repeatable lifecycle is implemented in source, not game-verified.

The mailbox requires successful executeHeld replies to contain snapshotVersion 1,
hostSequence, entity, ownerCompanyEntity, stopFlag (0/1), balance (absolute safe
integer) and negative (0/1), in addition to the eight common receipt fields.
The snapshot must be held. It rejects extra fields, including supplied stateHash.
The adapter derives held_vehicle_company_balance_v1 state and its canonical hash.
This is selected-state comparison, not whole-world equivalence. The engine
producer still needs implementation; this contract alone does not execute work.

The actual helper observation monitor now invalidates the session permanently
when the local GUI producer's counter rolls backwards or changes data under the
same counter. Repeated identical file reads do not refresh availability. A later
counter catch-up cannot reopen a session; the guided batch fails without resume.
This is tested through the file bridge, but it is not a complete reload detector.

The installed GameScript/GameScriptWithGui declarations expose update,
postUpdate, handleEvent and GUI callbacks, not a dedicated load callback. A
persisted engine journal therefore cannot simply be treated as an active live
lease on reload, nor can clearing it in every update distinguish reload from
ordinary execution. The reusable consumer must establish an explicit fresh
session boundary and reject restored pending operations before it is wired to
commands. Existing diagnostic latches remain unchanged. Do not claim helper
fencing alone stops TF3 or prevents delivery of an already-consumed request.
