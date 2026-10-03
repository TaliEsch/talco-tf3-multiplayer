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

## Protected Lua registration and consumer

`native/loan_lua_consumer.h` uses the [public Lua 5.2 API](https://www.lua.org/source/5.2/lua.h.html)
with a zero-upvalue registration thunk inside `pcallk`, balanced original stack,
exact string/hex validation and one Boolean return. Native Claim is required
at compile time to be nonthrowing. Registration must permit C++ unwinding;
Lua's [C++ error path](https://www.lua.org/source/5.2/ldo.c.html) cannot cross
`noexcept` or a broad exception-suppression bridge.

`Build-LoanLuaConsumerOwned.ps1` passes 52 checks using unchanged Lua 5.2.4
compiled as a C++ DLL. These cover protected registration, growing-allocation
failure, a Lua C++ error crossing the DLL boundary, malformed/extra arguments,
non-string rejection without conversion, duplicate consumption and actual
Lua-to-native stack traversal through the owned invocation fixture. A shared
VM without an invocation, a foreign owned resource and mismatched raw state
are denied. Resource and borrower observations in this fixture are synthetic;
they do not qualify TF3's layout or world lifecycle.

The root fixture is built with `/EHs` so C linkage on the owned ASM callbacks
does not imply they are nonthrowing. The upstream runtime uses its normal C++
API exports. All 58 upstream C/header files are compared with a freshly
extracted hash-pinned official archive before building. Upstream code and its
copyright/license remain in private test/build directories, not game packages.

A registration failure can leave an earlier global closure installed. The
actual adapter must independently disable Claim/arming and halt on failure;
returning false from registration is not revocation. Code stays pinned while
Lua can retain a callback pointer.

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
