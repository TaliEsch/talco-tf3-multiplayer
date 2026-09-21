# Exact-build command qualification — offline, 21 September 2026

## Live command profile quarantined after debugger failure

At 17:36:18 on 21 September, a controlled observer run against PID 33732
validated the exact image and recorded 42 apply-entry events, then TF3 exited.
Windows Application Error recorded exception `0x80000004` (SINGLE_STEP) at RVA
`0x9D3120`, the armed admission candidate. Site counts were `[0,0,42,0]`; no
factory, admission or handler event was captured. The parallel vehicle slice
reached enablement but produced no discovery or mutation receipt before bridge
disconnect. This is a failed observation run, not command/action qualification.

`--profile command` is now rejected **before opening or attaching to a live
process**. RVA `0x9D3120` and this profile remain unqualified/unsafe for live
use. The observer's old exit reporting incorrectly printed successful detach
after process exit; it now emits the actual exit code, `targetExited:true`,
`restoredAndDetached:false`, and fails a live run when its target exits.

Code review found a concrete exception-forwarding hole: the active event loop
required a corresponding DR6 status bit and matching RIP, and silently forwarded
all other SINGLE_STEP events. Unlike cleanup, it did not use the exception
record's address. Missing/inconsistent DR6 could therefore send an observer-owned
trap to the game's handlers. The failed run did not record rejected exception
contexts, so **the precise Windows context/race that caused this live crash is
not established**. Do not report DR6 loss as a reproduced live root cause.

The observer now matches exception address, RIP, the tracked armed thread and
the configured enabled execution slot; DR6's slot bit is diagnostic evidence,
not the sole ownership test. It rejects mismatched addresses, disabled/data
slots, trap-flag stepping and DR6 BD/BS/BT causes. It logs missing DR6 and every
unrecognized SINGLE_STEP, writes only control/debug context on resume, and
reads back each thread's armed debug registers. Unexpected exceptions remain
forwarded. The controller's separate active event classifier must be assessed
independently; shared source does not automatically replace its dispatch logic.

Owned-only regression cases use 16 simultaneous non-current worker threads,
each executing every armed site 20 times (1,280 traps). A vectored exception
handler exits the child with code 96 if any SINGLE_STEP escapes the debugger.
Tests cover debugger-created and already-running targets, eight concurrent
cutoff/detach runs, and a separate deterministic missing-DR6 fault injection in
the observer's **local context copy only**. That synthetic fault does not claim
Windows naturally lost DR6. These fixtures exercise the forwarding hole and
cleanup; passing them does not remove the live quarantine.

The application boundary at RVA `0x9E2380` is now connected statically to a
specific reversible action, `VehicleSetStoppedByUser`, and to three decoded
call sites. It is suitable for further bounded observation. It is **not** a
qualified suppression, retention, replay or global command-admission interface.
This pass did not launch, attach to, or control TF3, and changed no installed
files. No runtime observations or gameplay capabilities are established here.

## Evidence and reproducibility

Image: `E:\Steam\steamapps\common\Transport Fever 3\TransportFever3.exe`.
SHA-256: `a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`.
PE timestamp: `1789752802`; image size: `70545408`.

`node tools/inspect-native-hooks.mjs <image>` was rerun and returned the exact
static profile with evidence digest
`112ea9e2d0b193f6081be3b12589e14e2c3dffbcaf442510f433d05b1ac122a8`,
`hookReady:false` and `activationPermitted:false`.
The application range `[0x9E2380,0x9E26EE)` has SHA-256
`f56af579847e08f46ad6b47e9e4955ee7c4dc87f18ca4c3930203be6e2d11212`.
Its unwind flags are `3` (exception/unwind handler), not a leaf ABI.

All instruction claims below were checked with the existing hash-pinned
`tools/disassemble-native-candidate.ps1`, using the image/hash above and
`-StartRva`/`-EndRva` for the cited ranges. A read-only executable-section scan
for relative CALL and RIP-relative LEA patterns located candidates; decoded
instructions, rather than scan hits alone, support the call relationships.
Scans cannot exclude indirect calls or establish complete coverage.
No proprietary instruction bytes or disassembly files were added to source.

## Application ABI and ownership

The decoded instructions are consistent with the Windows x64 ABI: RCX and RDX
are the two consumed incoming pointer arguments, saved as R15 and R14. No
incoming R8/R9 or stack argument is consumed by this wrapper. Treat this as a
candidate `Apply(context*, entry*)` shape, not a callable C++ declaration. The
wrapper's RAX return value has no established contract; callers do not use it.

| Location | Decoded evidence | Interpretation and limit |
| --- | --- | --- |
| Entry `+0x00` | Loaded into R8 before dispatch | Pointer to owned command storage, not a vtable pointer or portable ID |
| Entry `+0x08/+0x10/+0x18` | Begin/end/capacity-style pointers; iterated at `0x10` stride; freed/replaced after apply | Dependency vector; 16-byte records, with a 32-bit entity-like value at record start. Remaining bytes are not qualified |
| Entry `+0x20/+0x28` | Pair used for weak-to-strong-style reference-count acquisition; writes `0x3F800000` through first pointer if acquisition succeeds | Progress-like object and control block; not established as the completion callback |
| Entry `+0x30` | Dispatcher AL stored at `0x9E2443`; zero stored on dependency failure at `0x9E2517` | Result byte; entry value is not a completed receipt |
| Context `+0x08/+0x18` | Used in visitor context and dependency lookup/update | Engine-owned contexts, not established company or session identity |
| Command `+0x9B8` | Signed byte, incremented by one, used as dispatcher index | Variant discriminator; do not accept an arbitrary/unmapped tag |

At `0x9E23D2..0x9E2401` each dependency record is checked via `0x2BB5DC0`.
A returned first DWORD of `-1` skips command dispatch and sets the result byte
to zero. Normal execution builds a four-pointer visitor context on this
function's stack: context `+8`, context pointer, address of entry `+0x20`, and
address of a temporary vector. At `0x9E243E`, `0x9D7AA0` receives RCX = tag + 1,
RDX = this temporary visitor context, and R8 = command storage pointer.
Neither the visitor context nor its vector survives the call.

Dispatch is followed by progress handling and replacement of the dependency
vector via `0x2BB5A50`. Skipping the function or returning from the middle would
skip these effects. A zero result cannot be assumed to mean a safe cancellation
or a lack of all side effects.

Ownership is stronger than a pointer-lifetime guess. The decoded leaf routine
`0x9CF510..0x9CF56B` moves the entry's pointer fields to its destination and zeros
the source pointer fields. The result byte is copied. The destructor range
`[0x9CF750,0x9CF7FE)` releases the progress weak reference, frees dependency
storage, dispatches destruction using the command tag, then frees command
storage with size `0x9C0`. Retaining either entry or command pointer beyond its
original call/lifetime is unsafe. A shallow byte copy duplicates ownership and
is not a deferral or serialization mechanism.

## Three application callers, with different lifetimes

| Call / return RVA | Container and continuation | Consequence |
| --- | --- | --- |
| `0x11EBB6` / `0x11EBBB` | Outer loop `[0x11E230,0x11EEB2)` traverses `0x38`-byte entries from manager `+0x150` to `+0x158`; selects context through index `+0x98` and array `+0x78` | Batched execution; return advances to the next entry |
| `0x120354` / `0x120359` | `[0x1202F0,0x1203AC)` moves input into a stack-local entry; invokes callback-like virtual `+0x10` at `0x120368`, then destroys the entry at `0x12036F` | Immediate path; entry/command lifetime ends directly after callback |
| `0x1204DF` / `0x1204E4` | `[0x120430,0x120535)` checks TLS. Non-null TLS queues/moves into a `0x38` vector; null TLS applies immediately, calls virtual `+0x10` at `0x1204F3`, and destroys at `0x1204FA` | Context-dependent batching versus immediate execution; same function can take either path |

These calls use the same two-argument shape. The routine's profiler label says
“Simulation Thread: Apply Command”, but the label does not prove all callers
run on one thread. Both caller classification and thread identity must be
captured. The installed public declaration `api/tealdef/api/cmd.d.tl:591..600`
independently describes context-dependent immediate/later execution and an
after-execution callback; it does not grant native ABI or cancellation support.

## Reversible vehicle action: complete static dispatch chain

The installed declaration `cmd.d.tl:493..499` names the data fields
`vehicleEntity` and `userStopped`; `:931..936` describes stop/start as the
vehicle-dialog action. Static evidence connects that declaration's names to:

1. Factory `[0x9EEE60,0x9EEF2C)` has an assertion string
   `make_cmd::VehicleSetStoppedByUser`. It consumes output pointer RCX, context
   pointer RDX, entity R8D and stopped R9B. It rejects entity `-1` through an
   assertion path. It places entity at temporary payload `+0`, stopped at `+4`,
   and tag `0x32` at payload `+0x9B8`, builds dependencies, and returns the
   output-entry pointer in RAX. The factory does not by itself submit execution.
2. The application wrapper reads that tag and uses index `0x33`.
   The DWORD table entry at `0x9D93D8` (`0x9D930C + 0x33*4`) is RVA `0x9D8E32`.
3. The decoded branch at `0x9D8E32` moves command storage to RDX and visitor
   context to RCX, then calls `0x9E1710` at `0x9D8E38`.
4. Handler `[0x9E1710,0x9E18CC)` references `VehicleSetStoppedByUser`, reads entity
   DWORD `+0` and stopped byte `+4`, writes stopped to a resolved component at
   `+0xAC`, and makes additional stop/start-dependent calls. Its normal return
   sets AL to one. Directly writing the component flag would miss side effects.

The factory's one found direct CALL is `0xE18B76` in
`[0xE18A70,0xE18CAF)`, returning to `0xE18B7B`. That caller supplies a stack
output entry, context `[returned object +0x18]`, entity R8D and a zero-extended
stopped byte R9D; afterward it packages the result and destroys the local
entry. This resembles a scripting wrapper, but UI versus script provenance has
not been proved. The factory's single direct-call result does not exclude
indirect paths, inlining or alternative constructors.

The tag and five payload bytes support a narrow read-only decoder for this
exact image. They do not supply company authority, portable entity identity,
allocation/ownership rules for replay, or a stable supported ABI.

## Earlier admission candidate and TF2 comparison

TF3 `[0x9D3120,0x9D347D)` is a stronger queue-admission candidate than the apply
wrapper. At entry its consumed arguments are RCX list-like object, RDX output
handle-like object, R8 source entry, R9 callback-like object, and fifth argument
at original RSP `+0x28` containing a progress-like pair. It moves that pair into
the entry, moves the entry into the list's `0x38` vector, registers a callback
when present, initializes an output object, and destroys moved-from inputs.
The nearby `CommandList::Add::<lambda_1>::operator ()` label belongs to
`[0x9D2B20,0x9D2C86)`, a callback/lambda that indexes the same vector, **not**
the Add entry itself. The Add candidate's callback registration points back
to that entry-index/generation-shaped state. Full cancellation semantics remain
unqualified. A byte scan found 45 direct-call candidates; their individual
callers and provenance have not all been decoded.

The practical TF2 baseline was rechecked at
`9f99097cb05333db18015da8296b7356c76a1612` in the supplied local clone.
`native/src/slice_hook.cpp:11..44` explicitly separates factory capture from
Add suppression, uses caller provenance to avoid intercepting its own replay,
and documents decode failures running natively. `native/src/slice/add_hook.inl`
begins with a concrete crash caused by skipping initialization of Add's output
handle; its `ZeroAddResult` exists because discarding RAX was insufficient.
`native/src/slice/capture.inl:267` captures factory arguments and separately
classifies scripting callers. Those are useful proof obligations, not TF3
structures or offsets. No TF2 code was copied. TF3 must preserve outputs,
ownership transfer, callback completion and replay-origin distinction using its
own evidence. Unknown local execution must halt multiplayer admission, not
inherit the TF2 decode-failure behavior.

## Implemented bounded command observation profile

`native/runtime_observer.cpp` now offers `--profile command` with exactly four
hardware execution breakpoints: factory `0x9EEE60`, admission `0x9D3120`, apply
`0x9E2380`, and handler `0x9E1710`. The existing simulation profile is still the
default and can also be selected with `--profile simulation`. This addition has
been built and exercised against owned fixtures; it has not, by itself, been
verified against a live TF3 action. It installs no injected hooks and writes no
instruction or game-data memory. Attachment and debug registers perturb timing.

The command profile requires the exact image SHA above, the existing mapped PE
identity checks and 32 matching immutable executable image bytes at **each**
selected site before any breakpoint is armed. Schema-v2 command observations
include image hash, process creation identity, run ID, ordinal/elapsed time,
thread/site, RCX/RDX/R8/R9/RSP and checked return-address classification against
the validated image size. Factory fields are incoming arguments; output storage
is explicitly not constructed. Admission/apply copy only entry bytes through
`+0x30`, report dependency pointer shape/count and progress-pair presence, then
read the tag. Only tag `0x32` permits the five-byte action payload read, and
non-boolean stopped bytes are explicitly invalid. Handler entry observes its
RDX payload directly. Admission also copies the fifth stack argument value.

Each event attempts at most 128 remote bytes, rejects address overflow, checks
every spanned page for committed/readable/non-guard protection, and reports
read failures and unsupported tags. No dependencies, vtables, reference counts,
or full command storage are traversed. The four entry sites cannot capture
post-apply results: `entryResultByte` is a pre-execution diagnostic,
`resultIsCompletion:false`, and `completeCommandPayload:false` always. No
entry/exit or callback correlation is claimed. The profile stores no pointer
for asynchronous reads. The existing maximum of 256 events/30 seconds remains;
completion records the stop reason and `captureComplete:false` even when cleanly
detached. Reaching a cap means evidence may be incomplete.

After `./Build-NativeRuntime.ps1`, owned-only qualification commands include:

```powershell
.\dist\native-runtime\TF3RuntimeObserver.exe --self-test-command-stress
.\dist\native-runtime\TF3RuntimeObserver.exe --self-test-command-stress-attach
.\dist\native-runtime\TF3RuntimeObserver.exe --self-test-command-stress-cutoff
.\dist\native-runtime\TF3RuntimeObserver.exe --self-test-command-dr6
```

Live command-profile selection remains blocked. Do not schedule another TF3
action to test these changes. Keep diagnostic output local and uncommitted.
The observer refuses pre-existing hardware breakpoint state and does not submit
vehicle actions or qualify ownership/replay. Normal detach and target exit are
distinct outcomes; neither fixture success nor a dead target qualifies live
teardown safety.

Owned tests `--self-test-command`, `--self-test-command-attach`,
`--self-test-command-timeout`, `--self-test-command-mismatch`, and
`--self-test-command-armed-failure` exercise all four sites, two threads,
known/unsupported tags, malformed booleans, invalid/inverted pointers, null and
overflowing command addresses, guard-page preservation, exact-byte refusal,
and detach/cleanup. These are integration tests of the observer, not game ABI
or gameplay evidence.

## Future apply-return correlation contract

The additional return-correlation contract below remains a design. The command
profile above deliberately selects handler entry as its fourth site and does
not implement apply-RET pairing. Do not interpret the simulation profile's
generic stack word as a return address except at a decoded function entry or
fully restored RET.

Use a separate four-hardware-breakpoint command profile for one bounded run:
factory entry `0x9EEE60`, Add candidate entry `0x9D3120`, apply entry `0x9E2380`,
and apply RET `0x9E26ED`. The RET is after the epilogue restores original RSP;
it catches all normal wrapper returns without changing return addresses.
It is not the current simulation observation profile and cannot be added as
four extra sites to the same x64 debug-register set. A second observation pass
can substitute handler entry `0x9E1710` to confirm the action-specific chain.

Each event should contain only the following bounded, local diagnostic data:

- Schema version, executable hash, process creation identity, run ID, monotonic
  event ordinal/time, thread ID, site RVA, mapped-site verification status.
- Register values as diagnostic addresses, not network identities: RCX, RDX,
  R8, R9, RSP; RAX at RET; and checked eight-byte `[RSP]` return address. Use
  actual validated image size for module-relative addresses, not a guessed
  address window. Non-image return addresses are explicitly classified.
- Factory: output-slot address, context address, signed entity R8D, stopped
  byte R9B. Do not read output storage as constructed at function entry.
- Add/apply: source entry address (R8 at Add; RDX at apply), copied command
  pointer, dependency-vector pointer triple/count, progress pair presence and
  result byte. Address relationships stay local. Do not dump a whole heap object.
- Read command tag at `command+0x9B8`; only tag `0x32` permits decoding exactly
  four entity bytes and one stopped byte. Reject non-boolean stopped values;
  preserve unrecognized tags as unsupported, never coerce them into this action.
- Optional dependency detail: at most eight 16-byte records, recorded as local
  entity/revision evidence only after validating ordered pointers, stride,
  readable extent and checked arithmetic. Mark larger vectors incomplete;
  truncation must never become an apparently complete command payload.
- At RET: pair with a per-thread stack of entry records using entry RSP and
  unchanged return address, then recopy entry `+0x30` and dependency metadata
  before the caller can destroy them. Record missing entry, nesting overflow,
  exception/unwind, read failure or unmatched exit explicitly. RAX/AL at RET is
  not the apply result; entry `+0x30` is the observed dispatcher-result location.

Every remote read must be bounded, overflow-checked and report exact-size
failure explicitly. Query committed/readable/non-guard pages before optional
reads; never probe guard pages, invoke target methods, dereference vtables,
increment reference counts, or retain a game pointer for a later asynchronous
read. Copies exist only while stopped at the observation event. Use fixed event,
nesting, byte and duration caps; overflowing a cap ends the observation with
incomplete status rather than silently dropping evidence. No raw payloads,
memory addresses or proprietary images belong in network messages or commits.

Keep the observer's identity checks, original-debug-register preservation,
all-thread/new-thread handling, unexpected-exception forwarding and verified
detach discipline. Validate the exact image and mapped bytes for each new site
before arming. Debug-register/RF changes and debugger attachment perturb timing;
“observe-only” means no instruction/game-data writes or semantic suppression,
not that the process runs without perturbation. Fixture-test the new schema,
read failures, nested correlation, mismatch refusal and cleanup before TF3 use.

## Concrete next runtime evidence before suppression/replay

Use an untouched disposable checkpoint, one known owned vehicle, and a bounded
local-only session. Capture idle background traffic first; perform one normal
stop then one normal start, with public pre/post stopped-state readback and
correlated command callbacks. Repeat the same action through the public script
factory/send path in a separate controlled case. Required results are:

1. Factory argument/payload agreement for both boolean values, expected tag,
   entity match, dependency shape and apply result; no decode from padding or
   accidental pointer interpretation.
2. Factory/Add/apply/RET/callback ordering, thread identities, concrete caller
   provenance and immediate versus batched route. Observe paused and running
   cases. Do not equate factory count with applied-command count.
3. Ownership and lifetime through move, callback and destruction; normal and
   failed/stale dependency paths, with no forced malformed in-game pointers.
   A runtime schema capture remains observation, not permission to steal an
   entry or fabricate reference counts.
4. Host-owned replay distinction that covers real UI and script paths, company
   validation at execution, complete immutable action data, and instance-local
   entity resolution. No caller-RVA allowlist is qualified from this static pass.
5. Before any suppression experiment, prove the selected admission boundary's
   output handle and callback contract, cancellation cleanup, queue ownership,
   error/unwind behavior, and safe teardown. Only then use a disposable single
   reversible action to show absence of local effect and a completed truthful
   receipt; do not jump over apply or return guessed success.
6. Before multiplayer, qualify command reconstruction, exactly-once execution,
   canonical simulation-step placement, real postconditions and two-instance
   comparison. Existing static hashes and isolated harness tests do not pass
   those gates.

No runtime action is requested from the user by this report. The next engineering
task is independent review and owned-process investigation of the SINGLE_STEP
escape. The live command profile must remain disabled until the failure mode is
understood and a separate controlled requalification is explicitly authorized.
