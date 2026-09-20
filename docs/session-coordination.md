# Session coordination layer

Implemented and tested with two/four simulated participants over real localhost
encrypted sockets. No game was launched, no live save changed, and no remote
TF3 executor is connected. The existing confirmed single-PC vehicle tests and
laptop diagnostics remain separate.

## Gates

1. Host admission still verifies executable and mod hashes. Required host-save
   transfer must be acknowledged before readiness can be accepted.
2. A trusted local adapter calls beginCoordination only after assigning real
   company entities to all 2–4 participants, including the host's participant.
   The roster freezes; new gameplay joins require a new session.
3. Every participant confirms the same checkpoint hash/update and its assigned
   company, against the host's supplied reference. This unlocks proposals.
4. The authority validates identity, ownership, payload and canonical order.
   command_prepare is broadcast, NOT an execution instruction. Every participant
   must acknowledge preparation before the target update.
5. Only then does command_commit authorize execution. One command remains
   outstanding until all exact-update applied receipts contain the same state
   hash. Only then is command_completed broadcast and the next proposal allowed.

Missing preparation, expired acknowledgment windows, heartbeat loss, clock
reset, mismatched state and roster disconnection latch session_halted.
There is no automatic rejoin, retry, unhalt or rollback. A fresh verified
checkpoint/session is required. Late packets cannot reopen an expired barrier.

## Important limits

This is a transport state machine, NOT an atomic distributed transaction or an
engine pause barrier. A disconnect during commit distribution can leave one
engine changed and another unchanged. Halting blocks future host proposals;
it cannot undo an already delivered command or physically pause TF3. Engine
adapters must gate local execution, track host liveness and recover safely.

Reported hashes are assertions from authenticated participants, not independent
proofs of their game state. Shared session-key transport is not a malicious-peer
identity/cheat protection scheme. Company provisioning, real checkpoint hashing,
host participant enrollment, pre-execution engine barriers, real-engine client adapters,
native action coverage and common-checkpoint recovery are still outstanding.

The shipping CLI has no call to beginCoordination and no independently verified
remote company mappings, so it intentionally cannot enable remote gameplay.
The normal host now rejects network gameplay proposals with
COORDINATION_NOT_READY until this trusted setup occurs. This does not block the
separate laptop diagnostic connection/save test.

legacyModelRelay is an explicit function option used ONLY by older model-test
fixtures. It is not exposed through CLI flags or launcher settings. Tests of
the new coordination path do not use it.

## Evidence and commands

Run npm run check, or Debug → Run offline checks, for the entire suite. New
tests in test/session-coordinator.test.mjs exercise invalid receipts, deadlines,
identity, company bindings, snapshot immutability and permanent halts.
test/coordinated-network.test.mjs exercises two/four participants over sockets,
pre-readiness rejection, preparation/commit/application, disconnect and divergent
state. Their company IDs and state hashes are synthetic fixtures, not TF3 data.

No new manual game/laptop test is needed to validate this source-only layer.
Restart the Host helper when convenient to load updated helper code. The staged
mod and launcher EXE have not changed in this development batch.

## Participant execution contract

19 September update: synchronous `hold(updateCount)`, `release(updateCount)` and
`barrierState()` are now required. Holds are checked before readiness, before/after
application and while awaiting completion. Matching host readiness/completion
permits release. Promises are not engine receipts. See phase1-engine-control-audit.md
for the still-unimplemented real TF3 adapter and native-control limitations.

`src/session-participant.mjs` now implements the client half of coordination.
It requires an independently supplied company map and checkpoint, validates
ownership when preparing AND immediately before execution, and snapshots the
prepared command. Only an identical commit permits execution at the exact
scheduled update. Missing/late/conflicting commits, disconnects, host silence,
clock reset, divergent completion receipts and uncertain adapter results latch
a halt and close the connection. Executed commands are never retried.

Host coordination heartbeats and participant heartbeats provide liveness even
while a model's simulation clock is paused. Heartbeats cannot extend command
deadlines or reopen a halted session. The participant must remain at the
application-update barrier until the host confirms every receipt matches.

This adapter contract is synchronous: checkpoint/clock/owner reads and `apply`
must run in a trusted simulation context; `apply` returns the actual update and
post-state hash. `halt` must stop that adapter's execution. Polling must occur at
every simulation update, including liveness polling while paused. The existing
asynchronous userdata bridge DOES NOT satisfy this contract. No real game
adapter or CLI activation was added, and the state machine cannot physically
pause TF3. A dropped connection during commit distribution still requires
common-checkpoint recovery; this is not distributed atomic execution.

Tests cover the participant fault matrix and consecutive commands with two/four
participants over encrypted localhost sockets using synthetic engine adapters.
These tests establish the client/host protocol path, not real TF3 synchronization.
