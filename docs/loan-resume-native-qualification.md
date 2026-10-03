# Native Loan resume: dormant components

These components implement necessary permission mechanics; they do not enable
TF3 servicing. No Lua consumer, lifecycle hook or engine mutation is installed
by either fixture. Production Loan resume remains disabled.

## Current-thread invocation witness

`native/loan_invocation_stack.cpp` walks the current thread with Windows unwind
metadata. It accepts only the nearest matching function at the exact return
address, publishes no frame on rejection, and rejects absent unwind metadata.
It never scans stack words for an older invocation. Its guarded scope recovers
only access-violation/in-page faults, not guard-page, stack-overflow or C++
exceptions. No Lua calls occur in this scope.

`Build-LoanInvocationStackOwned.ps1` passes 12 owned-process checks: nested and
outer frame recovery, descriptor/wrapper recovery, wrong-return rejection,
bounded depth, absence after return, invalid adapter, and rejection of an
unregistered frame above an otherwise matching invocation. The ASM fixture
uses its own code and unwind metadata, not copied game instructions.

Actual 40408 resource observations and static invocation operands are recorded
in `tools/probes/loan-lua-registration-qualification.md`. Recovering the actual
Lua-to-consumer call chain, resource identity and raw VM remains unperformed.

## One-use native permission

`native/loan_resume_authority.h` stores no game pointers or saved Lua state.
Permission binds a fresh authenticated epoch, native world generation, nonce,
grant digest, observed borrower and loan, and a bounded native deadline.
An SRW lock serializes arming, consumption and invalidation. The monotonic
clock is sampled after lock acquisition. Consumed permission cannot be retried
or rearmed; expiry and backward clock revoke without allowing world reopening.
Invalidation returns a transition serial; only its matching completion may
open the next world. Generation exhaustion permanently denies.

`Build-LoanResumeAuthorityOwned.ps1` passes 31 checks and 64 consume/invalidate
races, including two simultaneous consumers, stale load completion, expired
permission, a consumer waiting beyond its deadline, and invalidation before
publication. Its injectable clock and synchronization barriers belong to the
owned fixture. They do not prove actual TF3 lifecycle behavior.

## Remaining integration gates

- A fresh process/session epoch from authenticated native ingress; never reuse
  an epoch restored from a save or instantiate a second authority for one world.
- Qualified ordinary-thread registration and visibility of the Lua consumer,
  with real callback ABI, protected errors, stack restoration and pinned code.
- Actual current Loan resource, raw Lua state and borrower/loan revalidation;
  arguments supplied by Lua cannot establish those observations.
- Invalidation coverage for load, new game, cancellation, stop, disconnect and
  detach; stale/failed lifecycle completions must not reopen authority.
- Exclusion of post-consumption Lua/engine work from world teardown. Atomic
  consumption alone does not provide that exclusion. Never carry the SRW lock
  across Lua calls, engine mutations or simulation-thread joins; never use it
  inside VEH or recursively.
- Disposable single-game and paired servicing evidence, correlated exactly-once
  receipts, borrower/reference balances and confirmed halt.

These owned results qualify component behavior only. They grant no permission
to activate a guessed hook, call Lua from a worker/VEH, or retry unknown work.
