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

This historical four-site proposal includes the quarantined admission site and
is **not** the next live profile. The handler/apply `action-trace` profile below
supersedes it for initial observation; admission remains excluded.

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

## Bounded handler/apply entry-return tracing (21 September implementation)

`native/runtime_observer.cpp` now implements a separate `action-trace` profile
with four exact-build sites: vehicle handler entry `0x9E1710`, its selected
normal RET `0x9E18AA`, apply entry `0x9E2380`, and apply RET `0x9E26ED`.
The handler RET follows its stack restoration and register pops; `[RSP]` at
these entry/RET sites is the caller return address. Static disassembly is the
evidence for these instruction boundaries. The handler has code after the
selected RET, so this is not a claim that every exit path is captured.

Both `kLiveCommandProfileQualified` and `kLiveActionTraceQualified` remain
`false`. The command-admission site is unavailable to live observation. The
independently reviewed handler/apply instruction boundaries produced useful
live evidence, but the final controlled WinDbg run ended in a target access
violation during/after detach. Therefore an explicit custom-observer
`--profile action-trace` request is again rejected before process access. This
does not enable interception, suppression, command reconstruction or replay.
The pinned executable SHA256 remains
`a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`.
The existing exact-file, mapped-header, immutable executable page and 32-byte
site comparisons apply to the profile; they do not independently qualify safe
live debugger exception handling or engine semantics.

The implementation keeps one mixed-kind LIFO stack per thread. A return pairs
only with the top entry of the same handler/apply kind, identical original RSP,
and identical successfully read eight-byte caller return address. It records
entry ordinal, thread, depth, register snapshots, process creation time, image
hash and local run ID. Each hit also records RIP, DR0–DR3, DR6, DR7 and EFLAGS
before RF is set and DR6 is cleared, preserving ownership evidence. Addresses
are local diagnostic evidence. The trace does
not retain them for asynchronous memory reads or infer command completion from
RAX. Remote reads are eight bytes per hit, subject to the existing committed,
readable, non-guard page checks. No target instructions or game data are written.

Orphan returns and identity/read mismatches are explicit. A mismatch invalidates
all outstanding frames on that thread, with one incomplete record per entry;
it never searches past a newer call to manufacture a match. Target exceptions,
thread exit, event/duration limits, interruption and observation failure also
flush incomplete entries. The cap is 32 frames per thread and 256 total pending
frames; exceeding it ends observation and restores/detaches. Independent review
found that throwing at this cap before consuming the owned debug exception could
forward SINGLE_STEP into the target. The observer now sets `DBG_CONTINUE` and
installs the RF/DR6 resume context immediately after first-chance ownership is
established, before accounting or diagnostics can allocate/throw. Evidence still
uses the original context snapshot. A real four-thread depth-41 recursive fixture
reaches the cap under the debugger and requires all workers to finish normally
after restoration/detach; the regression repeats this three times. The selected RET
need not execute after an unwind or an alternate exit, so incomplete records
are expected evidence, not permission to reconstruct a successful application.

Owned fixture coverage uses actual hardware breakpoints on four concurrent
threads executing depth-four alternating recursive handler/apply functions.
For these fixture functions only, the observer resolves the compiler's optional
incremental-linker thunk, requires an exact primary runtime-function entry, and
requires a final `RET` byte at the compiler-described extent. It does not use
this fixture discovery algorithm on TF3. The ordinary and already-running
attach cases each exercise 256 traps and 128 paired calls. Separate cases cover
event-cap incompleteness, armed-failure cleanup, idle timeout and mapped-byte
rejection. Isolated pairing tests cover orphan returns, mismatched kind/RSP/
return address, unreadable return addresses and nesting overflow. Those isolated
records are not TF3 observations. Second-chance SINGLE_STEP rejection remains
in `OwnedFirstChanceTrapSite`.

Verification after the review fix: MSVC observer/controller builds passed
`/W4 /WX`; the combined native observer/controller suite passed **29/29**, with
zero skips or failures (46.11 seconds), including three actual debugger nesting-
cap runs. `git diff --check` passed. No game or multiplayer result is implied.

The independent instruction-boundary review is complete, and the bounded live
trials below resolved command routing plus one eight-byte vehicle payload field.
Clean live teardown is not qualified. Both custom live profiles remain disabled.
Command admission/suppression, full payload and lifetime ownership, replay,
actual native result correlation and two-instance verification remain open.

## Independent instruction/stack review and next observation protocol

Read-only reinspection of the pinned executable and the Windows Application
event log independently confirmed the following on 21 September. No game was
launched or attached, and neither live-profile gate was changed by this review.
The Application Error event at local time `17:36:18` names exception
`0x80000004`, fault offset `0x9D3120`, PID `0x83C4` (`33732`) and process creation
time `0x1DD49E55458347B`. That event identifies an escaped SINGLE_STEP; it does
not contain the debug-register context needed to distinguish the original
classification hole from a cleanup/race failure.

### Exact instruction and unwind evidence

The existing hash-pinned disassembly helper was rerun on the complete handler
and apply ranges and the admission prologue. A read-only PE exception-directory
inspection independently read each containing `RUNTIME_FUNCTION`, its unwind
header and operation slots. All three records are primary, unchained version-1
records; their frame-register nibble is zero even where code uses RBP as a local
address base. Range ends below are exclusive.

| Routine | Runtime range / unwind RVA | Unwind evidence | Stack consequence |
| --- | --- | --- | --- |
| Vehicle handler | `[0x9E1710,0x9E18CC)` / `0x3A937B4` | Flags `2` (unwind handler), handler RVA `0x318351F`, prologue size `0x13`, 9 code slots; save RBX at final RSP `+0x330`, allocate `0x300`, push RBP/RSI/RDI/R14/R15 | Body RSP is entry RSP minus `0x328`; `0x9E189C` adds `0x300`, five pops end at `0x9E18A9`, and RET `0x9E18AA` sees the original RSP |
| Apply wrapper | `[0x9E2380,0x9E26EE)` / `0x3A93360` | Flags `3` (exception/unwind handler), handler RVA `0x3180984`, prologue size `0x2C`, 11 code slots; save RSI/RBX at final RSP `+0xF8/+0xF0`, allocate `0xB0`, push RBP/RDI/R12/R14/R15 | Body RSP is entry RSP minus `0xD8`; `0x9E26D2` computes R11 = RSP + `0xB0`, `0x9E26E2` restores RSP from R11, five pops precede RET `0x9E26ED` |
| Admission candidate | `[0x9D3120,0x9D347D)` / `0x3A92D98` | Flags `3`, handler RVA `0x3180984`, prologue size `0x27`, 10 code slots; allocate `0x168`, push eight nonvolatile registers | Body RSP is entry RSP minus `0x1A8`; fault RVA is the first PUSH RBP, not an interior instruction selected by a string-reference scan |

Handler-range SHA-256 is
`24f97630f156d5c9e01ef2c2adefb741172d901e90dc81e56ba0d01f98479ffc`;
admission-range SHA-256 is
`9c74c9203e52cf3c8e7ae465c4b37fbe3651bc1cb4c5e385c2428d6b6ba2a39f`.
The apply digest remains the one recorded above. Hashes establish which code
was reviewed; unwind flags establish that exception paths exist, not their
semantic effect or observer safety.

The handler's `entity == -1` branch at `0x9E173A` targets `0x9E18AB`, after
the selected normal RET. That tail calls an assertion routine at `0x9E18C6`
and ends in INT3 at `0x9E18CB`. Do not choose `endRva - 1` as the game handler's
RET: it is an INT3. The fixture-only final-RET discovery algorithm cannot be
reused for this image. Normal execution sets AL = 1 at `0x9E1892`; that is a
handler return observation, not a correlated command callback or public-state
postcondition. The wrapper stores dispatcher AL at entry `+0x30` at
`0x9E2443`, can store zero on dependency failure at `0x9E2517`, and performs
further calls before its RET. RAX/AL at the wrapper RET is not that result.

The four existing `action-trace` locations are therefore defensible instruction
boundaries for a **call/return observation** once debugger containment is
independently qualified. Same-thread LIFO pairing using original RSP and caller
return address is supported by the decoded epilogues. It still cannot prove
command identity: the current emitter reads only the eight-byte `[RSP]`, stores
register values, and does not copy the pointed-to entity, stopped boolean, tag,
entry result, dependencies or callback. A matching action's UI timestamp alone
must not be reported as native semantic capture.

### Controlled live routing and payload evidence; teardown failure

After the review, three stock-UI-loaded disposable-world WinDbg trials were run
against build 40379, PID 6336. The first idle trace recorded 25 complete apply
entry/return pairs on thread `0x8454` and no vehicle-handler hit. The ordinary
apply pair used RSP `0x85af6ff228` and caller return
`TransportFever3+0x9efdb6`; several repeatable argument shapes and return values
occurred with no player input. This proves the apply wrapper also carries
autonomous/background work and cannot itself be classified as a player-command
boundary.

During a known reversible vehicle stop/start pair, the bridge reported entity
66005/company 3141 applied once at updates 4332 and 4342 and restored the
original running state. The trace recorded exactly two handler entry/return
pairs on the same thread. Each handler was nested inside two apply calls:
hits `153/154 -> 155/156 -> 157/158` and
`193/194 -> 195/196 -> 197/198`. Handler RSP was `0x85af6fd068` and caller
return RVA was `0x9b8e3d`. This is strong call-routing correlation, not yet a
native receipt.

A final bounded repeat captured only the first 512 readable bytes at handler
RDX for each already-known reversible action. The first qword was
`0x00000201000101D5` for stop and `0x00000200000101D5` for restore/start. Thus
the low 32 bits equal observed entity 66005 (`0x101D5`) and the high 32 bits
changed from `0x201` to `0x200` with the public stopped boolean. No larger layout
is claimed: bytes beyond that field differed radically and may be adjacent or
reused storage.

This trial did **not** pass the safety gate. Windows Error Reporting recorded
TF3 exception `0xC0000005`, execute violation (`P9=8`), unknown module and fault
address zero at 20:34:07 during/just after debugger detach; the process exited.
An earlier detach also crashed WinDbg's `dbgeng.dll` while TF3 survived. The
original `comp.sav` remained unchanged at 87,719,389 bytes and SHA-256
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`.
The custom observer rebuild was separately quarantined by Windows Security as
`Behavior:Win32/DefenseEvasion.A!ml` before its second smoke invocation;
Windows reported `DidThreatExecute:false`. Protection was not bypassed and the
quarantined artifact was not restored. These results keep both custom live
profiles fail-closed until a clean, independently repeatable attach/detach path
exists.

### Rejected alternatives and bounded sequence

Do not re-enable admission `0x9D3120`, substitute the lambda label at
`0x9D2B20`, call a native function with a guessed declaration, skip an apply
body, alter RIP/RSP to synthesize a return, or write component `+0xAC` directly.
These either repeat an unresolved debugger failure or bypass ownership,
initialization, callbacks and stop/start side effects. The apply-entry profiler
label also does not establish that every caller has simulation-thread affinity.

The following staged sequence was the pre-run protocol. It is retained to show
what was attempted; the action and payload observations passed their correlation
checks, but the final clean-detach requirement failed. Do not repeat it through
WinDbg or enable the custom profile until a supported attach/detach mechanism
has independent target-survival evidence:

1. First complete independent active-loop and teardown exception-containment
   review, including failures before/after context access, queued traps,
   first/second chance ownership, new threads and deadline/cap cleanup. Require
   owned-fixture stress, cutoff, nesting-cap, malformed-pair and foreign-trap
   cases to pass for the exact newly built observer. This document alone does
   not qualify or enable either live profile.
2. Record one launch, image hash, PID/process creation identity and a fresh
   disposable checkpoint copy. Load through the stock UI lifecycle. Select one
   known owned vehicle and record public owner/entity/stopped state plus the
   bridge/session identity. Close other debugger/controller sessions so a second
   debugger or pre-existing debug registers cannot contaminate the run. Do not
   run a native hold controller simultaneously with this debugger.
3. After a separately reviewed live-profile enablement, make an initial idle
   observation for at most 3 seconds/64 events, preserving all four sites.
   Verify target survival, original register restoration and actual detach.
   A cap, orphan, mismatched pair or unrecognized SINGLE_STEP is incomplete
   evidence; inspect it before another action trial. Attach can legitimately
   begin inside an existing call, so an initial orphan is not evidence of a
   corrupted game or permission to manufacture its entry.
4. Only after the idle result passes, prepare one stock vehicle-window toggle
   and observe for at most 30 seconds/256 events. Issue the single toggle only
   after the observer reports validated attachment. Use current public stopped
   state to choose the intended boolean, then collect public post-state. If the
   event cap or duration has already ended the observer, do not issue the action
   as part of that trial. Keep simulation state (paused/running) explicit.
5. Require intact apply and nested handler pairs on a single thread, their
   concrete caller RVAs, zero unexplained trap forwarding and successful detach
   with a live target. Public post-state establishes the intended change only
   for the public action. This version's trace establishes call routing and
   teardown only; it cannot certify that a particular native payload caused it.
6. Restore the vehicle through the normal public action only after confirmed
   post-state and a clean detach. If execution or target state is unknown, stop
   and discard/reload the disposable copy; do not retry or compensate a command
   whose outcome is unknown. No original save is overwritten.
7. A subsequent reviewed extension may copy the five-byte handler payload at
   entry, bounded apply entry/tag data, and the apply result while still stopped
   at its paired RET. Preserve the entry address only for same-thread correlated
   stopped-event reads, invalidate it on every exception/unmatched return, and
   never read it asynchronously. Fixture-test read failure, unsupported tags,
   nesting and lifetime invalidation before another live trial. Only then run
   separate stop/start cases for stock vehicle-window, bulk-manager and public
   script paths, paused and running, with callback and public-state correlation.

These steps intentionally leave suppression, queue ownership and replay
unqualified. An ordinary reversible action plus a clean trace does not prove
safe cancellation or permission to bypass a native command.
