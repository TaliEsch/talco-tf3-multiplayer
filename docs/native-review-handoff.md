# Native-integration review handoff — 22 September 2026

## Read-only admission qualification addendum — 22 September 2026

Readiness remains below the **6/10** authoritative-action gate (approximately
**5.8/10**). `native/inprocess_vehicle_observer.cpp` now reads, without
mutation, the local entry's result byte and the scripting callback's bounded
implementation/vtable/invoke shape at the real admission trap. The pointer-free
facts cross authenticated `native/runtime_ipc.cpp` and are validated in
`src/native-runtime-client.mjs`. `tools/live-inprocess-loader-check.mjs` now
requires both expected conditions for its passive-action qualification. This
does **not** substitute a callback target, suppress a command, or connect
stock UI actions to Host/Join ordering.

In a second disposable TF3 run, the stock Train 1 stop action gave exactly
one factory, one admission and one correlated observation, zero dropped
candidates, entity 163575, stopped=1, `entryResultZero:true` and
`callbackShapeMatches:true`. The submission trap ran on thread 12704,
distinct from the observed world-update thread 33608. The stock vehicle
panel subsequently displayed **Stopped**. The authenticated engine gate
held at update-boundary hit 2497, released one boundary, re-held at 2498 and
detached/resumed. That stop was normal pass-through execution, not cancelled
or host ordered. An earlier run with optional mod-bridge correlation failed
`GAME_BRIDGE_OBSERVATION_UNAVAILABLE` because its bridge data was stale; no
correlation or multiplayer claim comes from that run.

The native observer/runtime builds and smoke tests passed; 29 focused elevated
tests passed. The first full suite run in the restricted sandbox failed child
process creation (`spawn EPERM`). A permitted full rerun failed five older
native debugger-fixture tests; the two relevant CLI test files passed 14/14
when rerun with child-process permissions. A focused rerun reproduced the
five debugger-fixture failures (25/30 passed). Three assert that stderr must
be empty despite emitted teardown diagnostics; two report debugger target
survival/restore failures (Win32 1067/121). These are open verification
failures, not a green-suite claim. An isolated action-trace rerun also hit
Win32 access denied (5) while suspending owned fixture threads; its exact
orphaned fixture process was stopped. The installed executable was not modified.
TF3 exited normally; three hash-matched staged loader files and manifest,
then the exact hash-matched disposable save/preview, were removed. The
original save/preview remain unchanged. No second instance was run.

Next critical work remains bounded live cancellation with qualified callback
cleanup, then accepting/ordering/replaying one vehicle intent exactly once
through Host/Join and checking real postconditions. No external blocker has
been established for that implementation work.

## Owned cancellation-mechanism addendum — 22 September 2026

`Build-OwnedVehicleCancelFixture.ps1` builds an isolated x64 MOV/indirect-CALL
fixture (`native/owned_vehicle_cancel_fixture.asm` and `.cpp`). Its breakpoint
handler emulates the displaced `RDX=RBX`, then substitutes the owned callback
target only for a prequalified callback value. The original indirect CALL is
unmodified. Sequential tests cover one rejected action without submission or
value change, nested callbacks, ordinary C++ exception unwind, and normal
behavior after byte/handler restoration. The handler's inactive patch-window
path is implemented but not exercised under concurrent entry. This is an
owned-process mechanism test, **not** a qualified TF3 hook or an integrated
Host/Join action. Start/Stop concurrency, real callback cleanup and UI pending
completion remain unverified. The independent ABI review confirmed the exact
TF3 MOV/CALL shape and flagged those remaining limitations.

Independent verification for this addendum: native build/smoke passed, the
focused Node fixture passed 1/1, `git diff --check` passed, and the full suite
reported **910 discovered, 880 passed, 0 failed, 30 skipped** (53.934 seconds).

The subsequent paragraph below saying the fixture is missing is historical;
this addendum supersedes that single statement, not the live readiness verdict.

## Live passive stock-action addendum — 22 September 2026

Current readiness is **5.7/10**; the full multiplayer objective remains active.
`native/inprocess_vehicle_observer.cpp` now passively observes the exact-build
factory at `0x9eee72`, its constructed-output post site at `0x9eeee8`, and the
common scripting submission move at `0xe26a2c`. It correlates the five-byte
semantic action across moving entry addresses by bounded command-storage
identity; it does not suppress, execute or serialize an engine pointer.
`native/inprocess_runtime.cpp` arms the sites before the separate engine gate,
publishes a diagnostic-only snapshot over authenticated `native/runtime_ipc.cpp`,
and disarms the sites on teardown. `src/native-runtime-client.mjs` validates
the pointer-free snapshot. No Host/Join gameplay authority is granted by this
diagnostic capability.

An actual disposable TF3 run selected stock Train 1 and issued one stop action.
The observed counters were factory **1**, submission **1**, correlated **1**,
dropped **0**, entity **163575**, stopped **1**, latestValid true and
`crossThread:true`. The latest action-site thread was **18796**; the world
update thread was **28196**. The observer then passed held → single release →
re-held → detached/resumed with authenticated control traffic. This establishes
a real vehicle command route and safe bounded teardown for this run, but not
the factory-thread ID, safe suppression, native application outcome or a
two-instance result. The first trial's action window expired before the click
and returned `PASSIVE_VEHICLE_FACTORY_NOT_OBSERVED`; no success is inferred
from that trial. `tools/live-inprocess-loader-check.mjs` now emits an explicit
ready boundary and exact counter diagnostics for failed trials.

The factory entry trap precedes `mov rdi,rcx`; its output argument is **RCX**.
The owned fixture initially mirrored an incorrect RDI assumption and was
corrected to set RDI independently before the trap. That correction passed
the owned fixture and the live trial. Static command-lifetime findings in
`docs/vehicle-abi-static-evidence.md` remain applicable, including the Add-
bypass path and callback/progress obligations. The observed cross-thread route
rules out a same-thread-only command-lifetime design. The next independent
review should focus on trap register emulation, candidate-slot publication,
cross-thread storage identity/ABA, exception/unwind/teardown, and whether the
common send-body boundary can safely defer without leaking or double-owning
callbacks and progress.

Further exact-build read-only analysis found a specific cancellation candidate,
not an activated hook: the current trap at `0xe26a2c` emulates `mov rdx,rbx`
and resumes at the unpatched indirect call `0xe26a2f`. After the entry move,
the normal return path destroys the owned entry and releases progress,
callback and scripting references. A selected native failure-completion
callback target could let the stock UI decrement its pending-command counter
without executing the original action. The installed vehicle UI requires that
callback; skipping the call alone would leave its state refresh pending.
The proposed target substitution has an owned exact-callsite mechanism and
ordinary C++ exception-unwind test, but still lacks TF3 callback/cleanup
qualification and a bounded live no-mutation check.
It is therefore not production-qualified suppression, and it is a rejection
of the original action rather than accepted deferral or replay. See
`docs/vehicle-abi-static-evidence.md` for the exact register/cleanup evidence.

Native builds and owned fixture passed. Full regression: **909 discovered,
879 passed, 0 failed, 30 skipped** in 54.244 seconds. The game's installed
binaries were not overwritten. The exact nonce-tagged disposable save,
preview and startup request were removed after TF3 closed; original source
save SHA-256 remained `cbbc1a4642734600e9e9c994a6b0be7e014c20c097b418752642e5157f402f7c`.
The staged loader's three hash-matched files and manifest were removed.
No second TF3 process, LAN/Internet or four-player acceptance was performed.
No multiplayer gameplay family is released as synchronized.

This is implementation progress, not the 6/10 authoritative-action gate.
Suppression, host ordering, replay/postconditions, checkpoints and recovery
remain implementation work. There is no known external blocker to continuing
that investigation; suitable separate machines/network access are still needed
for later cross-machine and Internet acceptance.

## Authoritative current handoff — 22 September 2026

This section supersedes older status statements below; the remainder is retained
as chronological evidence. The full multiplayer goal is active and incomplete.
Readiness is approximately **5.3/10**: real TF3 simulation hold/release/halt and
controlled detach now work, but no native gameplay command has yet completed the
capture → suppression → host order → exactly-once replay path.

### What became functional

- `native/production_boundary_gate.cpp` now owns the exact-build post-update
  byte at RVA `0x159581`, preserves full enabled XSTATE outside VEH, holds the
  simulation owner, consumes one release permit, fail-stops, restores its byte,
  and confirms detach. Activation is gated by executable SHA-256
  `a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`,
  exact bytes, unwind/EHCONT and live mitigation checks.
- `native/inprocess_runtime.cpp` exposes that gate through
  `native/runtime_ipc.cpp`. The IPC worker remains responsive while the engine
  owner is held and publishes correlated typed receipts/events for hold,
  release, halt and detach.
- `src/native-runtime-client.mjs`, `src/native-host-join.mjs`, and
  `src/production-engine-binding-provider.mjs` carry the production
  qualification and typed gate contract into the retained Host/Join seams.
  Admission fails closed without `simulation.hold`, `engine.halt`, typed gate
  receipts and an authenticated session binding. Invalid/unmatched terminal
  events, malformed receipts, timeouts and disconnects now revoke readiness,
  reject every waiter and close the native endpoint exactly once. The engine
  adapter requests a typed generation-zero terminal halt and accepts it only
  after both its receipt and correlated `terminal_parked` event validate.
  Ordinary authenticated Host and Join attachments now own a serialized adapter
  poll loop, so mailbox receipts and deadlines are serviced outside test
  harnesses. This is integration of engine control, not yet integration of
  gameplay execution.

The live end-to-end control path is:

`Stage-NativeLoader.ps1` → application-local `native/winhttp_proxy.cpp` →
one-shot `native/native_session_handoff.cpp` → `native/inprocess_runtime.cpp` →
`native/production_boundary_gate.cpp` → `native/runtime_ipc.cpp` →
`src/native-runtime-client.mjs`. Host/Join consumes the same client through
`src/native-host-join.mjs` and `src/production-engine-binding-provider.mjs`.

### Live qualification evidence

The clean production-qualified disposable-world run reported
`productionQualified:true`, `engineObserver:true`, `guiFreezes:true`, and the
capabilities `simulation.hold`, `engine.halt`, `simulation.gate-receipts.v1`
and `engine.detach`. Native hits 5→135 correlated with bridge tick/update
57134/2846→57265/2977 (native delta 130; tick and update deltas 131). The gate
then held the real world at tick/update 57266/2978, consumed one release and
re-held at 57267/2979, restored its owned byte, detached, and the world resumed
at 57268/2980. The owner was thread 12412, minimum observed stack headroom was
324704 bytes, CFG policy was known, CET flags were 256, and no cross-thread
observation was reported. The game remained responsive after detach. The exact
test process was stopped and `Unstage-NativeLoader.ps1` removed only the three
hash-matched loader files, one-shot handoff and manifest; installed game
binaries were not overwritten.

A final direct terminal-halt run correlated native hits 5→136 with bridge
tick/update 57134/2846→57265/2977 (all three deltas 131), on owner thread
16928 with 326160 bytes minimum stack headroom and known CFG/CET policy. From
the initial running generation **0**, it terminal-parked the real world at
tick/update **57267/2979**. A later authenticated ping proved native control
traffic remained live, while the native boundary count and bridge tick/update
remained unchanged. The typed receipt was `halt_requested` and the independently
delivered event was `terminal_parked`, both carrying the same epoch/generation.
This exercises the same running→halt coordinate used by the production adapter,
not the weaker held→halt path. The exact TF3 process was then stopped; final
inspection found zero TF3 processes and zero staged loader files. This is direct
single-game engine-halt evidence, not a two-instance failure/recovery result.

The native pipe now has a 15-second authenticated session lease for qualified
gates. Host/Join refresh it with a non-overlapping one-second heartbeat even
while the simulation owner is held; connected silence makes the native server
return and the runtime's existing cleanup request a real halt. Correlation IDs
use a constant-space monotonic high-water replay barrier rather than the former
512-request lifetime cache. Owned native tests crossed 600 requests and verified
duplicate, old-ID and connected-silence failure paths.

This qualifies the exact current build's bounded update gate. It does not prove
every speed/batch path, semantic command interception, command object ownership,
two-instance agreement, or recovery. The TF3 continuation has no EHCONT table
entry only when the image advertises no EHCONT table; that accepted legacy case
and the exact continuation semantics remain review points. Stack headroom is
checked before the first controlled hold rather than before passive startup.

### Command boundary and TF2 baseline

Fresh static inspection of the hash-matching TF3 executable identifies factory
`0x9EEE60` (`VehicleSetStoppedByUser`) as the strongest capture candidate and
Add `0x9D3120` as the matching admission/suppression candidate. Add moves the
source into a `0x38`-stride vector, constructs a reference-counted 16-byte
output pair (`0x3035600`/`0x30355A0`), and owns destruction of source, callback
and progress inputs. Its output destructor at `0x3035650` tolerates null, but
the stock vehicle caller's null-result/callback expectations are not qualified.
No skip or return patch is authorized from this evidence.

The subsequent exact-build caller inventory materially corrected that model.
All 45 decoded direct Add callers destroy its heap-backed output handle
immediately, and Add consumes/moves the source entry, callback and progress
objects with distinct destruction rules. More importantly, the scripting
`sendCommand` binding has an alternate adapter at `0x120430` which bypasses Add:
it queues the moved entry through a TLS vector when present or calls apply
wrapper `0x9E2380` directly. The common semantic lead is now the scripting
submission virtual call at `0xE26A2F`, not Add alone. The complete reproducible
static trace is in `docs/vehicle-abi-static-evidence.md`; it qualifies neither
suppression nor replay.

An authenticated, pointer-free passive-diagnostic IPC schema is implemented
and owned-fixture tested. It uses lossless decimal uint64 counters and strict
client validation, but the production runtime deliberately supplies no provider
and advertises no capability until exact-site ownership and clean teardown are
qualified. This is an integration seam, not a functioning TF3 action observer.

The TF2 reference remains at `9f99097cb05333db18015da8296b7356c76a1612`.
Its `native/src/slice/add_hook.inl` supports factory/Add correlation,
output-handle initialization and caller-specific callback handling as design
evidence. TF2 explicitly does not implement vehicle stop/start replication, so
there is no command implementation to transplant. No TF2 code has been copied.
If compatible TF2 code is later adapted, retain its MIT copyright/licence text
and attribution in third-party notices alongside TalCo's PolyForm
Noncommercial licence.

### Verification accounting

- Clean unrestricted suite: **905 discovered, 875 passed, 0 failed, 30
  skipped**, 53.724 seconds. An intermediate integration run failed 12 cases:
  one obsolete test double lacked the newly mandatory `poll`/`close` contract,
  and 11 owned-control cases rejected a stale native fixture before execution.
  The test double was corrected, the fixture rebuilt, its 11 real native cases
  passed, and the complete clean suite above then passed. The independent reviewer previously reran its
  then-current tree and obtained **756/756**; **478/478 was an incomplete TAP
  count**, not the review result.
- Production boundary, integrated gate, cross-image continuation, in-process
  control/IPC, runtime IPC, runtime loader and WinHTTP proxy builds passed their
  MSVC x64 `/W4 /WX` builds and applicable smoke tests.
- A separate attempt deliberately built the quarantined legacy debugger
  observer/controller, activating 29 tests normally skipped. It produced five
  teardown failures (three controller, two observer; Win32 121/1067) and is not
  counted as a green suite. Those reproducible debugger executables were removed
  afterward; the production in-process gate does not use that debugger path.
- Single-game verified: exact-build load, authenticated bind, real boundary
  correlation, hold, exactly-one update release, re-hold, detach/resume, and a
  direct running-generation-zero terminal park with control traffic still live.
- Isolated/model-tested only: coordinator ordering, duplicate/deadline fences,
  save transfer, checkpoint schemas, company/economy adapters and recovery
  state machines.
- Not performed: two real TF3 instances, cross-machine, four-player, LAN/Internet
  gameplay, integrated recovery and any native replicated gameplay action.

### Supported scope, remaining implementation and acceptance

No gameplay family is yet supported for general multiplayer. Road, depot, stop,
line and vehicle modules below are diagnostic/model work; rail, shipping,
aviation, terrain and every other action family are unsupported. Required
implementation remains: qualify command lifetime and safe suppression; add a
bounded semantic native capture event; route host and clients through the same
authoritative sequence; resolve local identities; execute and observe exactly
once; run a two-instance no-input baseline; connect the six-domain checkpoint
producer to coordinated save/reload recovery; then complete and verify the road
loop, ownership, charges, costs and income.

There is no current external blocker to that implementation. A second physical
machine and port-forwarded network are unavailable for later acceptance, so
cross-machine/four-player/Internet gates must remain open unless suitable access
becomes available.

The consolidated current acceptance procedure is: build every production
native component; stage only with the hash-gated scripts while TF3 is closed;
start `tools/live-inprocess-loader-check.mjs` with the disposable bridge once
with `--gate-detach` and once with `--gate-halt`; manually select only the named
disposable save and Start Game; require the exact production handshake plus
held/re-held/resumed evidence and separately stable terminal-park evidence;
close the exact disposable process; run `Unstage-NativeLoader.ps1`; then run
`npm run check` unrestricted. Full-product acceptance must extend this same
procedure to two isolated TF3 instances and finally four/cross-machine/Internet;
those latter steps are not yet runnable as a functioning product.

Branch is `main`; private remote is
`https://github.com/TaliEsch/talco-tf3-multiplayer.git`. Review should focus on
VEH/XSTATE/unwind correctness, accepted EHCONT-absent continuation policy,
gate/IPC epoch transitions, shutdown-versus-halt behavior, and the unresolved
Add ownership/callback contract before any suppression experiment.

## Correlated live boundary and owned control — 22 September 2026

The full-readiness goal remains active. A corrected disposable-world run now
correlates the in-process post-site observer with the existing game-produced
bridge clock. Over 245 accepted samples at displayed speed 1, native hits moved
from 5 to 133 while bridge `tickCount` moved from 57134 to 57262 and
`updateCount` from 2846 to 2974: all three deltas were exactly 128. The observer
remained on thread 27704 with no cross-thread flag. One transient bridge sample
was rejected and explicitly reported; the checker ignored unavailable data and
required monotonic accepted endpoints. This is single-game evidence that the
chosen post site corresponds one-for-one with those public updates in this run.
It does not yet prove the relationship at every speed/batch path or qualify the
site as a mutation-free command boundary.

The first attempt at this correlation failed and is not counted: world loading
consumed the sampling deadline, leaving zero time for post-load comparison. The
checker now uses separate world-observation and correlation deadlines, refreshes
the native ping at the first accepted bridge sample, prints endpoint/delta
evidence on success, and performs authenticated shutdown on assertion failure.
Its process field is named `launchPid`, because Steam can replace the process
that performed the initial launch. The successful run used launch PID 29596;
the sole running game process was PID 34036 when cleanup began.

The runtime restored its owned instruction on authenticated shutdown. PID 34036
was then stopped, and `Unstage-NativeLoader.ps1` removed only the three
manifest/hash-matched files plus session/manifest. No TF3 process remains; the
five owned staging paths are absent; executable SHA-256 remains
`a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5` and
stock `alut.dll` remains
`814c615139b129c14897382fd30df164e5461d82b5329985907f0ef6b7a5ed19`.

An isolated ordinary-execution controller now implements the intended
always-held state machine: acknowledged hold, exactly one advance to the next
boundary, sticky halt/disconnect and bounded stop. Its authenticated owned IPC
adapter stays responsive during a slow in-flight iteration, rejects duplicate,
out-of-order, stale-epoch, malformed and partial traffic, and reports a consumed
permit timeout as `UNKNOWN_ITERATION_OUTCOME` without retry. It exposes
`protocolHalted`, `simulationThreadHeld`, `fixtureWorkerStopped` and
`engineHalted` separately; `engineHalted` and `productionQualified` remain
false. Review also closed the lost-wake, pre-ack release, halt/stop promotion and
overlapping-release races: a hold is published only after its acknowledgement,
release ownership is single-flight, and a consumed timed-out permit remains
unknown rather than becoming retryable. This is implementation of the
control/transport prerequisite, verified only against an owned worker—not a TF3
hook.

The ABI review rejected waiting in VEH and rejected an ordinary `PROC FRAME`
continuation entered by changing RIP. Windows' real unwinder reads the
interrupted function's local stack value as the conventional function's return
address, and the conventional allocation misaligns its helper call. The live
machine reports CFG enabled and CET user shadow stacks enabled. The negative
assessment therefore reports `qualified:false`, `activationPermitted:false`
and `holdImplemented:false`; no unsafe redirect was executed.

A separate owned cold-fragment fixture now establishes a viable alternative on
this machine without weakening protections. Its VEH changes only RIP; ordinary
gate execution blocks outside VEH, preserves all 15 GPRs, RSP, flags and all
2,432 enabled XSAVE bytes in eight arithmetic/flag cases, and resumes the real
caller. Windows unwound all 58 actual gate instruction PCs correctly, and a
ninth entry propagated a native exception to that caller. CFG, CET shadow stacks
and CET context-IP validation remained enabled; the gate is explicitly present
in the image's EHCONT table. A direct final jump failed unwind qualification and
was replaced by complementary flag-preserving conditional branches. This is a
positive owned-process ABI result, not TF3 activation. See
`docs/owned-cold-continuation-evidence.md`.

A second owned fixture now qualifies the required cross-image shape without a
`rel32` assumption. An EXE trap redirects into a separately loaded DLL gate;
ordinary DLL execution waits outside VEH, restores the complete enabled state,
then a second exact trap transfers to an EXE continuation. The images were
beyond relative-branch range, both destinations were present in exact EHCONT
tables, CFG/CET/context-IP validation stayed enabled, all eight cases preserved
GPRs, flags and 2,432 XSTATE bytes, and Windows unwound all 56/56 actual gate
instruction PCs. Busy teardown was refused, post-join cleanup succeeded, an
inert pinned handler preserved state, and a ninth native exception reached the
EXE caller. The fixture explicitly reports `tf3Qualified:false`,
`productionLifecycleQualified:false` and `activationPermitted:false`.
Production still needs a terminal park that cannot fall back into TF3 after
halt/disconnect, one immutable generation/owner record, live mitigation and
stack-headroom checks, and safe explicit resume/detach. See
`docs/owned-cross-continuation-evidence.md`.

Independent hash-pinned parsing also removes one real-Step uncertainty. The nine
runtime ranges covering `[0x1593B0,0x159622)` are either primary flags 0 or
`CHAININFO` only; none has an exception/unwind language handler or scope table.
Their complete post-site chain exactly matches the cold fixture's body frame:
RSP is entry minus `0x58`, the real return is `+0x58`, XMM6 is `+0x20`, and the
saved nonvolatiles occupy `+0x30..+0x70`. The 626-byte Step range hashes to
`579c4f55b3be35d2826321901410c27503c16f7445b9c18358a51b68f27c9768`.
That flattened metadata is valid only at the qualified post state, not at the
zero-iteration or arbitrary Step paths. Static PE inspection also finds no TF3
EXE EHCONT table or CET declaration; the eventual DLL gate must carry and verify
its own metadata, and live process mitigation policy still requires observation.

The focused TF2 baseline trace now follows reversible vehicle `VREV` from its
native factory through `CommandList::Add` suppression, semantic serialization,
logical-key resolution and replay. It confirms that native command pointers are
only immediate local correlation tokens. TF3 will retain host-authoritative
order and stronger execution-time ownership/postcondition checks; it will not
copy TF2's peer-assigned timestamps, fail-open admission, late execution or
financial repair fallbacks. No TF2 source was copied in this batch; any future
adaptation of its persistent logical-key registry must retain silver2127's MIT
notice.

Current evidence tiers: implemented/isolated includes the control state machine,
owned authenticated adapter, negative conventional-frame assessment and
positive same-/cross-image owned continuation fixtures; single-game
verified includes transparent load, exact observer, the 128/128/128 correlation,
authenticated teardown and hash-clean cleanup. Two-instance, cross-machine,
four-player and Internet verification remain unperformed. Readiness stays
approximately **4.5/10**: the boundary is now correlated, but actual in-process
hold, production Host/Join binding, stock command interception and two-instance
execution are still required before 5/10.

Current verification for this batch is 878 discovered, 848 passed, 0 failed
and 30 explicitly skipped in the unrestricted suite. The focused native/control
set passed 20/20. The control, IPC, negative continuation, same-image cold and
cross-image builds all passed MSVC `/W4 /WX` and their owned smoke tests. The
existing production post observer, runtime, native IPC and reversible WinHTTP
proxy were also rebuilt successfully with their applicable smoke tests. The 30
skips are environment-gated native executable suites and are not counted as
passes. No new live TF3 activation occurred in this batch.

## In-process post-iteration observation — 22 September 2026

The full-readiness goal remains active. Commit `95d79c8` crosses the first real
in-process engine boundary: the exact audited TF3 build now loads the TalCo
runtime transparently, passes an exact image/site gate, observes execution at the
qualified post-iteration instruction and reports that observation over the
authenticated IPC connection. It is not yet engine control or multiplayer.

### What became functional and the real execution path

- `Stage-NativeLoader.ps1` verifies `TransportFever3.exe` SHA-256
  `a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`,
  refuses every collision and atomically stages only three TalCo files. The
  original executable and installed DLLs are never overwritten.
- `native/native_session_handoff.cpp` writes one 316-byte, owner-only,
  `CREATE_NEW`, 120-second credential record. `native/winhttp_proxy.cpp`
  consumes it delete-on-close after Steam's relaunch, forwards the exact 14
  imported WinHTTP exports unchanged to the absolute System32 DLL, and starts
  `TF3InProcessRuntime.dll` from an ordinary WinHTTP call rather than `DllMain`.
- `native/inprocess_runtime.cpp` loads only the exact sibling probe and requires
  its observation-only exact-build result. `native/inprocess_post_observer.cpp`
  then verifies the disk hash, mapped PE identity, executable/non-writable
  section, mapped bytes and exact 12-byte instruction sequence at RVA
  `0x159581` (`inc r15d; cmp r15d,r12d; jl 0x1594c0`). Only after those checks
  does it install a one-byte `INT3` and vectored handler.
- The handler accepts only a first-chance breakpoint whose exception address and
  RIP are the exact owned site. It emulates `inc r15d`, including zero extension
  and the five affected flags while preserving CF/unrelated flags, records only
  lock-free counters/thread identity, and resumes at the following instruction.
  No allocation, lock, IPC, logging or game-memory traversal occurs in VEH.
- `native/runtime_ipc.cpp` serves an owner-only, local-only pipe, strict
  fixed-shape JSON, one persistent session binding and duplicate-correlation
  barriers. Partial frames and writes have a fixed five-second deadline. The
  observer capability is advertised only after successful activation; hold,
  release and halt still truthfully describe transport state, not engine state.
- `tools/live-inprocess-loader-check.mjs` completed an authenticated host bind
  in real TF3 process 13820. Its final ping reported
  `engineObserver:true`, `observationHits:1`, owner thread 16196,
  `observationActive:true`, no cross-thread hit and no saturation. This was a
  real execution at the qualified site during disposable-save loading, not a
  synthetic callback or DLL-load inference.
- Authenticated shutdown restored the original instruction byte and left the
  observer inert. The disposable world subsequently ran from displayed TF3MP
  update 3037 to 4368, its town grew from 81 to 86 and the date/account changed,
  showing that the game continued normally after teardown. The game ignored UI
  and `WM_CLOSE` requests, so the exact disposable process was finally stopped;
  it was not allowed to write into any user save.
- `Unstage-NativeLoader.ps1` removed only manifest/hash-matched TalCo files. The
  post-run executable hash remained the value above, stock `alut.dll` remained
  `814c615139b129c14897382fd30df164e5461d82b5329985907f0ef6b7a5ed19`,
  and the proxy, runtime, probe, manifest and one-shot handoff are all absent.

### Qualification evidence and unresolved assumptions

The owned-process harness passes 576 hardware-comparison flag cases, 1,004 real
traps, owner/cross-thread classification, counter saturation, concurrent stop,
late-trap handling after restore, pinned-module lifetime, dynamic-code-policy
rejection and foreign-byte preservation/retry. The live target has CFG enabled;
that is compatible because this observer creates no indirect call target and
changes no call/return stack. Dynamic-code prohibition and an active debugger
remain fail-closed. An earlier gate incorrectly compared the ASLR-rewritten
mapped ImageBase byte-for-byte; the corrected gate accepts only the disk
preferred base or the actual loaded module base while retaining all other PE,
section, hash and byte checks.

The site is a genuine post-iteration boundary and its live hit establishes one
simulation-thread owner. `r15d` is an intra-batch iteration index, not a proven
persistent world-update number, and `rbp` remains an opaque GameSim candidate.
The one live hit occurred while the disposable save was loading and was not
correlated to the existing public checkpoint receipt. Therefore this does not
yet qualify a canonical multiplayer clock, deterministic execution, hold,
release, halt, command interception or replay.

### Gameplay, state and recovery boundary

No normal TF3 gameplay family is presently enabled as synchronized multiplayer
through this runtime. Existing repository work has a single-game reversible
vehicle stop/start proof and experimental road/depot/station/vehicle/line
adapters, but stock UI capture/suppression, two-instance apply and complete road
loop accounting remain absent. Rail, shipping, aviation, terrain and every
other uncaptured mutation are unsupported in multiplayer, not implicitly
working. Normal single-player functionality remains untouched when the loader
is not staged.

The game-side checkpoint producer has separately observed six public domains at
one held update: towns/buildings/growth, economy, topology, vehicles, companies
and lines/services. Hidden RNG is explicitly unavailable. This observer batch
adds no new world reader and no two-instance comparison; update-to-checkpoint
correlation is the next prerequisite. Recovery still needs coordinated native
hold, save/reload on each instance, fresh epochs and post-load duplicate fences.

### Exact verification and evidence tiers

- Native builds passed MSVC `/W4 /WX`: post observer, in-process runtime,
  WinHTTP proxy and native IPC. Proxy ABI/System32 path/`LastError`, exact probe
  rejection, handoff collision and rollback were exercised.
- Owned/model-tested: observer safety cases above; strict bind/authentication,
  malformed/duplicate JSON rejection, partial-frame deadline and shutdown
  delivery; full unrestricted suite: 858 discovered, 828 passed, 0 failed,
  30 skipped. The 30 skips are older unavailable/quarantined observer/controller
  executable tests and are not counted as passes.
- Historical correction: the independent reviewer reran its earlier tree and
  obtained 756/756, not the incomplete 478/478 count. Neither historical number
  is used as current evidence.
- Single-game verified: transparent load, exact gate, real post-iteration hit,
  authenticated bind/ping/shutdown, instruction restore, continued disposable
  simulation and hash-checked cleanup.
- Two-instance, cross-machine, four-player and port-forwarded Internet: not
  performed. A local mirror is not counted as a second game.

### Remaining implementation, acceptance and blocker status

Implementation remains: qualify safe in-process hold/release/halt while the IPC
thread stays responsive; correlate this boundary with public update/checkpoint
receipts; connect the production adapter to Host/Join; capture/suppress/order and
apply one reversible vehicle command exactly once on two instances; then finish
the road loop, company-bound finances, supported-action veto and checkpoint
recovery. Cross-machine/four-player/Internet checks are acceptance work only
after those paths exist. There is no current external blocker to the next
in-process-control investigation. The unavailable second physical machine and
port-forwarded environment leave those later acceptance gates open; access to a
second installed TF3 machine/network would remove that acceptance limitation.

### Consolidated current-slice acceptance procedure

1. Build with `Build-InProcessPostObserver.ps1 -RunSmokeTest`,
   `Build-InProcessRuntime.ps1 -RunSmokeTest`, `Build-WinHttpProxy.ps1
   -RunSmokeTest`, `Build-NativeIpc.ps1`, `Build-InProcessControl.ps1
   -RunSmokeTest`, `Build-InProcessControlIpc.ps1`,
   `Build-InProcessContinuationGate.ps1 -RunSmokeTest`,
   `Build-OwnedColdContinuation.ps1 -RunSmokeTest` and
   `Build-OwnedCrossContinuation.ps1 -RunSmokeTest`; then run the unrestricted
   full Node suite.
2. Close TF3 and run `Stage-NativeLoader.ps1`. It must refuse unexpected files
   or a nonmatching executable. Run `node tools/live-inprocess-loader-check.mjs`
   and manually approve Steam's custom-parameter launch confirmation.
3. Load only the named disposable save. Accept only a JSON result containing the
   observer capability, a nonzero hit count/thread, no cross-thread hit and an
   authenticated shutdown receipt. Do not treat the result as hold or gameplay.
4. Close the disposable TF3 process, run `Unstage-NativeLoader.ps1`, and verify
   the five TalCo staging/session files are absent and the two stock hashes above
   are unchanged. Do not use a user save.

Branch is `main`; the current owned continuation/control and live-correlation
batch is commit `7139c53`, following pushed observer commits `95d79c8` and
`eb9b3ae`. The private `origin` remains the only configured publication target;
no release was created. Independent review should focus on terminal halt versus
explicit detach, immutable owner/generation publication, stack headroom, live
mitigation policy, every gate unwind PC, late trap/teardown lifetime and
release-outcome classification before any live hold is activated.

### TF2 baseline and licence

The TF2 baseline at `9f99097cb05333db18015da8296b7356c76a1612` uses an
`alut.dll` proxy plus renamed original and supplies useful command, pacing,
identity, economy and recovery patterns. Its MIT licence and silver2127
attribution were reviewed. No TF2 source was copied into this WinHTTP loader,
observer or IPC implementation. Any later copied/substantially adapted source
must retain its copyright/MIT notice. TF2 addresses, object layouts and calling
conventions remain inadmissible as TF3 evidence.

Readiness verdict: approximately **4.5/10**. Real in-process observation is now
working in TF3, but engine control, two-instance command execution and integrated
recovery are still required before 5/10, and full multiplayer is far from done.

## Superseding full-readiness handoff

This section supersedes the older review-batch narrative below. The objective is
full multiplayer readiness, and that objective is **not complete**. Commit
`db22017` advances a real single-game vertical slice and fail-closed native
tooling; continuation commit `8333ae3` adds the production-gated live checkpoint
producer, host-local authority path and bounded action-trace machinery. Neither
commit provides functioning multi-instance multiplayer.

### What became functional

- A launcher-prepared, exclusive disposable save copy can be hash/size verified
  and requested through a one-shot userdata record. A corrected live run with
  exactly one staged mod selected the intended 32-file source, consumed nonce
  `43b49d368fbbd409ae2614ada7b0c757`, loaded the disposable save and reached
  `Game is ready`. It also reproduced `GetApi() must not be called in the recipe`
  and `WindowContainer is not available`. Shipped TF3 source shows that stock
  loading first mounts `ProgressPage` and calls `app.loadGame` from its second
  React `onStep`; `--script` exposes no equivalent main-menu mount point. The
  direct loader is therefore a successful single-game diagnostic, not a clean
  production startup mechanism.
- The exact installed build was observed on a real simulation thread with four
  hardware execution sites, 128 hits, stable site order and verified register
  restoration/detach. This is an observed update boundary, not yet a canonical
  multiplayer clock.
- The authenticated native controller held the disposable TF3 process at the
  observed pre-update boundary, continued answering IPC pings while held,
  released exactly one iteration and explicitly restored/detached. Abnormal
  controller exit now uses Windows debugger kill-on-exit as a fail-stop; owned
  fixtures verify both that path and normal detach.
- The mod can discover one actually owned transport vehicle without mutation.
  A real disposable-world slice then routed stop/start through `HostAuthority`,
  produced host sequences 1 and 2, executed each once, observed updates 5597 and
  5605, and restored vehicle 66005 for company 3141 to its original running
  state. This is single-game evidence. Stock UI interception/suppression and
  cross-instance replay do not exist.
- The game-side checkpoint producer now emits schema-v2 domain digests for
  public town and town-building development state, company finances, topology, vehicles,
  companies and lines/services. Inaccessible RNG/hidden state is explicitly
  `unavailable`. Production mailbox admission requires all six public domains
  and permits only that explicit hidden-state absence; any unavailable or failed
  public domain is rejected. The legacy company-only path is explicitly
  `local_diagnostic`.
- A fresh ordinary-UI load of disposable save
  `tf3mp_disposable_43b49d368fbbd409ae2614ada7b0c757` passed the production
  checkpoint gate at exact held/released update 3052. All six public domains
  were observed, `comparisonReady:true`, hidden RNG remained explicitly
  unavailable, and checkpoint hash
  `57b5d6d7aa55af8e42bb27991867fea7986d108c2b3e2d7f671019fb13564f8d`
  was correlated through the hold receipt. This is one real game only; it is not
  evidence of agreement between instances. The original `comp.sav` remained
  byte-for-byte unchanged (87,719,389 bytes, SHA-256
  `ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`).
- A separate fresh disposable run used `tools/live-watchdog-expiry.mjs` to stop
  helper renewal while keeping engine observation alive. The lease was armed at
  tick 57526/update 3238; TF3 itself reached expiry and halted at tick
  57623/update 3335, then held `speedup:0` and the same update for the stability
  interval. This qualifies single-game lease-loss engine halting, not coordinated
  multi-instance failure recovery.
- Native IPC, client framing, persistent session binding, Host/Join admission
  gating, disconnect/halt fencing and diagnostic-only transport are implemented.
  Authenticated socket clients now expose stable snapshot fanout for verified
  host frames without replacing the existing admission/save handler; locally
  synthesized transport/lifecycle events never enter that authoritative stream.
  The current controller advertises `productionQualified:false`, so ordinary
  Host/Join correctly remains closed rather than mistaking debugger receipts for
  world evidence.
- Host/Join composition now rechecks live bridge and native-fence state after
  asynchronous provider loading. Native session admission rejects mismatched or
  non-accepted bind/ping receipts, and duplicate Join admission fails closed.
  The committed vehicle path now keeps its pre-persisted result unknown until
  the supported `sendCommand` callback confirms success, matching command data,
  ownership, stopped state, held update and balance. Missing, failed or stale
  callbacks do not retry or certify execution.
- `src/two-instance-acceptance-harness.mjs` and
  `tools/two-instance-acceptance-plan.mjs` now generate a non-launching but
  directly executable Host/Join plan with distinct bridge directories, ports,
  native identities, exact mod hash and exact host-save identity. Its collector
  validates equal save and held checkpoint evidence but deliberately cannot mark
  acceptance passed without two real TF3 processes and correlated action receipts.

### Real execution paths

1. `src/startup-load.mjs` creates and verifies a random disposable copy and the
   exact one-shot request. `mod/content/tf3mp_startup_load.script.lua` consumes
   that request before calling `app.loadGame`. This path reaches the world but
   violates the verified TF3 main-menu React lifecycle and is diagnostic-only.
2. `native/runtime_observer.cpp` performs exact-build, mapped-byte-gated
   observation. The default simulation profile is the only selectable live
   profile. Both command admission and `action-trace` are fail-closed after the
   live teardown failures below. `Build-NativeRuntime.ps1` builds it with
   `/W4 /WX` when Windows Security permits the unsigned diagnostic artifact.
3. `native/runtime_controller.cpp` owns authenticated native IPC, session
   binding, hold/release/halt and teardown. `src/native-runtime-client.mjs` is the
   framed client and `src/native-host-join.mjs` is the fail-closed admission gate.
4. `src/cli.mjs` requires that native gate for normal Host/Join and offers a
   non-admitting diagnostic transport mode. This gate is not yet a working
   gameplay adapter because no production-qualified native runtime exists.
   `src/client.mjs` now permits a future adapter to subscribe to authenticated,
   schema-checked host frames while preserving the existing primary handler.
   `src/authenticated-engine-session.mjs` consumes that fanout after a strict
   two-to-four-player `coordination_capture`, derives the unique authoritative
   player/company map, queues at most 16 frames during asynchronous adapter
   construction, preserves their order and closes transport plus adapter on any
   rejection. `src/join-engine-bootstrap.mjs` now invokes it from Join only
   after the authenticated host-save download matches exactly and the provider
   has loaded; it subscribes before sending `save_ready`. No-save production
   sessions are rejected because the current protocol has no safe async-adapter
   readiness barrier.
   `src/host-local-participant.mjs` additionally routes a host player's actions
   through that same authenticated loopback client/`HostAuthority` path as a
   remote player, and refuses `beginCoordination` while its injected engine
   adapter is still attaching. Registration precedes admission-observer delivery,
   late-resolving adapters are closed, and explicit host bind addresses are used
   for the loopback connection. It does not construct an adapter, create engine
   receipts, mark the native gate qualified, or waive production checkpoint
   coverage. The remaining binding inputs are still a real per-game
   `EngineSessionAdapter` factory, verified native player-to-company creation,
   native world/control evidence and an observed comparison-ready checkpoint.
   `src/host-local-cli-seam.mjs` and `--host-local-adapter-module` now expose that
   composition from host mode, but only for an explicit regular-file provider
   that receives the already-authenticated native binding/live bridge and returns
   a production-qualified engine binding, adapter factory and exact save proof.
   `src/production-engine-binding-provider.mjs` is now the built-in provider for
   Host and Join. It composes the existing `EngineSessionAdapter` only from the
   live bridge directory, independently verified save and persistent native
   binding. It is integrated and model-tested, but remains unreachable in a real
   production session while the native controller truthfully advertises
   `productionQualified:false`.
5. `mod/content/tf3mp_status_panel.script.tl` exchanges the fixed vehicle
   discovery/request files. `mod/content/tf3mp_status.script.tl` checks live
   company ownership/revision, executes one native vehicle command and records a
   correlated postcondition. `tools/live-vehicle-slice.mjs` drives the local
   HostAuthority-backed disposable-world proof.
6. `src/coordinator-checkpoint.mjs`, `src/async-engine-mailbox.mjs` and
   `src/engine-session-adapter.mjs` decode world evidence and refuse production
   comparison unless every public domain is observed; hidden RNG must either be
   observed or explicitly unavailable. `tools/live-checkpoint-capture.mjs`
   exercises that exact gate against a running game. Native transport
   acknowledgements are always marked `gameWorldReceipt:false`.

### Native qualification and the failed command-profile run

Exact image: SHA-256
`a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`,
build 40379, commit `377aeda1`.

The live simulation observer and controller results above are qualified only for
that image. A subsequent command-profile correlation attempt crashed TF3 before
vehicle discovery or mutation. Windows Error Reporting recorded exception
`0x80000004` at RVA `0x9D3120`, the proposed admission site. The observer saw
only 42 background apply-candidate hits and then target exit; the bridge reported
disconnect and no action receipt. Therefore no uncertain mutation was retried.

The observer and controller now classify first-chance status, exception address, RIP, tracked/armed
thread identity and the matching enabled execution slot; TF and DR6 BD/BS/BT
causes are rejected. An owned-looking second-chance exception is never consumed.
Teardown records strict per-thread ownership evidence,
consumes at most one qualifying queued first-chance trap and always forwards
second chance. An owned negative fixture proves an unowned trap remains held,
release is refused, control stays responsive and shutdown delivers the exception
exactly once. Nevertheless the precise live crash mechanism is unproven. Live
`--profile command` is quarantined before process access, and RVA `0x9D3120`
remains unsafe/unqualified. Owned-process tests do not requalify that TF3 site.

Unresolved ABI assumptions include semantic factory/admission boundaries,
output/callback ownership, command move/destruction rules, safe suppression,
replay-origin distinction, post-apply result correlation, exception/unwind
behavior and whether any proposed site is stable under all game workloads.

The offline dump review separated three failures rather than assigning them one
cause: Defender quarantined the custom observer; WinDbg's EngHost later faulted
reading address `0x8` in `dbgeng.dll`; and TF3 later executed address zero on a
different thread whose raw stack contained NVIDIA OpenGL and TF3 addresses.
Those raw words are not an unwound call stack and do not prove a driver cause.
The observer cleanup now verifies restored debug registers by readback, requires
three drain quiet periods, never consumes a second-chance system breakpoint,
reports teardown phases separately, and checks target survival after detach.
This is source/owned-fixture hardening only; the quarantined executable was not
rebuilt or restored, and no live profile was re-enabled.
The disabled action-trace implementation can pair nested handler/apply entry and
return observations by thread, entry RSP and return address in owned fixtures.
Controlled WinDbg observation established two real handler pairs for the known
vehicle stop/start and decoded payload bytes `+0..+3` as entity 66005 and byte
`+4` as the stopped value. A second static review corrected the earlier derived
RVA error: the three raw returns all imply base `0x7ff6386e0000` and align with
verified call returns `0x11ebbb`, `0x1204e4` and `0x9d8e3d`. This coherently
reconstructs the observed call chain, but lacks an independently preserved
module-map record. Bytes `+5..+7` are unqualified padding, not flags. The trace
also proved the outer apply wrapper runs continuously for
background work. However the final detach ended
in TF3 `0xC0000005` execute-at-zero, and an earlier detach crashed WinDbg's
engine. The custom observer rebuild was quarantined by Windows Security as
`Behavior:Win32/DefenseEvasion.A!ml` before its second smoke invocation and was
not restored or allowlisted. Exact-build sites therefore remain non-activating;
the evidence narrows the ABI but does not make command capture safe.

The disabled observer schema now preserves `imageBase`, `rawReturn` and an
overflow-safe, in-image `returnAddressRva` round trip so future evidence cannot
repeat the base-normalization error. Handler entry copies exactly five bytes:
the entity DWORD and stopped byte; it never reads or reports padding `+5..+7`.
Both live qualification constants remain false. Source assertions pass and the
observer passes MSVC x64 `/W4 /WX /Zs`; no quarantined executable was rebuilt.

### TF2 baseline and licence

The supplied TF2 checkout remains pinned at
`9f99097cb05333db18015da8296b7356c76a1612` and is MIT licensed, copyright 2026
silver2127. Its concrete replication documentation explicitly excludes vehicle
stop/start. There is no TF2 stop/start capture, suppression, wire tag or replay
implementation to port. Its general factory-capture/Add-suppression design and
per-instance identity rules remain useful proof obligations only. No TF2 code was
copied in `db22017`; future copied or substantially adapted code must retain the
TF2 copyright and MIT permission notice.

### Gameplay and state coverage

Single-game verified gameplay is limited to discovery plus one reversible
vehicle start/stop action for the current company. The request validates company,
entity, revision, scheduled update, duplicate barrier and observed stop flag.
This does not cover built-in UI suppression, instance-local entity mapping,
separate-company native execution, or network replay.

Roads, depots, stops, vehicle purchase/sale, assignment, line editing/removal,
construction charges, operating costs and income remain experimental contracts
or isolated tests. Rail, shipping, aviation and all other mutation families are
unsupported multiplayer scope. Their ordinary native UI actions are not globally
intercepted, so general multiplayer play must not be enabled.

Schema-v2 now compares sorted `Town` and `TownBuilding` IDs plus public growth
controls, distribution weights, cargo needs, emissions, construction identity
and bounded recursively canonicalized module parameters. Unsupported dynamic
module values fail the whole lane instead of producing a lossy match. The other
domains compare sorted public entity IDs/revisions and selected public fields.
It does not serialize a world and does not cover RNG, hidden native state, cargo queues,
pathfinder internals, async job order or all economic accumulators. RNG/hidden
state is explicitly unavailable. That residual uncertainty is accepted only as
an explicit blind spot after all six public domains are observed; it does not
prove determinism. No two-instance no-input baseline exists.

### Verification record

- Current exact unrestricted `npm run check`: **850 discovered, 820 passed,
  0 failed, 30 skipped** (39.05 seconds). The skipped tests are the unavailable native observer/
  controller executable tests because Windows Security quarantined the rebuilt
  observer and the stale controller was removed. All 804 non-native tests also
  passed in a separate explicit run. The last pre-quarantine integration tree
  passed 830/830 in 98.53 seconds. The independent reviewer did obtain 756/756
  on its earlier tree; the reported 478/478 was an incomplete TAP count.
- The six named-pipe/native IPC failures and one bridge lease failure from the
  restricted wrap-up run were environmental: the focused unrestricted rerun
  passed 15/15 before the complete passing suite above.
- Current native source passed MSVC x64 `/W4 /WX /Zs` syntax/type checking for
  both observer and controller. A current executable/smoke run was not performed
  after the security quarantine; protection was not bypassed.
- Last pre-quarantine observer/controller focused suite: 29/29 passed in 59.72
  seconds, including strict trap ownership, 16-thread/missing-DR6 stress,
  cleanup races, fail-stop real unowned-exception forwarding and bounded
  action-call pairing. It is historical evidence, not a current binary result.
- Authenticated network focused suite: 11/11 passed, including a signed
  post-admission coordination frame, primary-before-observer ordering, stable
  fanout, observer fault isolation and lifecycle separation.
- `Build-NativeIpc.ps1`: passed MSVC x64 `/W4 /WX` build.
- Mod review: 29 content files, zero executables, manifest
  `6f2334edb74e36e6b5e9e46190fccb18571ac93645cca056f25be200c70fce24`.
- `git diff --check`: passed before the implementation commit.
- Single-game verified: startup direct-path load with the UI lifecycle faults
  above, simulation observation,
  controller hold/one-release/teardown, vehicle discovery and reversible
  host-sequenced stop/start, and production-gated public-domain checkpoint
  capture/hold/release at update 3052. A separate run verified actual TF3
  watchdog-expiry halt at update 3335 after helper renewal stopped.
- Isolated/model-tested: native IPC/authentication/fail-stop, Host/Join gating,
  checkpoint schema/producer parsing, release acknowledgements, duplicate and
  failure handling, transport/save transfer.
- Not performed: two simultaneous TF3 instances, cross-machine, Internet,
  four-player, recovery reload, native economy/ownership across companies.

### Remaining implementation versus acceptance

Implementation still required: a clean supported/native route into TF3's stock
`ProgressPage` load lifecycle (or another qualified automatic load mechanism);
a safe qualified command interception boundary;
copy/suppress/replay and exact result correlation; production wiring from
Host/Join into one game adapter per process; a canonical cross-instance identity
map; complete or deliberately authoritative background-state synchronization;
actual coordinated checkpoint save/reload with fresh epochs; full road-transport
families and native accounting; prevention of unsupported local mutations.

Acceptance-only work begins only after those paths exist: two local TF3 instances,
then two machines over LAN, port-forwarded Internet, disconnect/recovery drills
and four-player soak. Cross-machine and Internet gates remain open because no
second controlled machine or router environment was available, but they are not
the current critical blocker—the implementation is not yet ready for them.

There is no external blocker to further source/native investigation. The current
critical safety gate is engineering evidence: identify why the admission
breakpoint escaped, qualify a non-crashing capture/suppression boundary, and wire
it to the production participant lifecycle. Re-enabling the quarantined profile
requires a deliberate new disposable-game run after independent review; fixture
success alone is insufficient.

### Consolidated setup and eventual acceptance procedure

Do not use the current normal Host/Join mode for gameplay; it intentionally
rejects the non-production native runtime. For the next reviewed disposable run:

1. Verify exact game, mod and native hashes; ensure TF3 is closed; stage the
   reviewed 29-file mod; create a fresh exclusive disposable copy of a known save.
2. Until an automatic stock-lifecycle integration exists, use TF3's ordinary
   Load Game UI to select the hash-verified disposable copy; never use the
   original save. The `--script .../tf3mp_startup_load.script.lua` route is a
   diagnostic only: its reaching `Game is ready` does not waive the observed
   MainMenu/WindowContainer faults.
3. Run only a separately reviewed exact-build native profile. Require mapped-byte
   validation, no instruction/game-data writes, controlled teardown and a live
   process after detach. The quarantined command profile is forbidden.
4. Once a production interceptor exists, start Host with a fresh secret and
   native pipe/token, advertise the authenticated save, then Join with the same
   session/build/mod identities. Require distinct company assignments and save
   hash verification before roster readiness.
5. At a common held update, require complete world coverage on every instance.
   Execute host and participant vehicle actions through the same host sequence,
   verify exactly-once postconditions/ownership/accounting, then exercise the
   complete road loop.
6. Force duplicate, out-of-order, missed-deadline, disconnect, mismatch and
   unknown-outcome cases. Require actual engine halt, no mutation retry, common
   checkpoint reload, fresh epoch/barriers and held agreement before release.
7. Repeat on two machines over LAN, then port-forwarded Internet, then four
   players. Record each evidence tier separately; do not promote a local harness
   result to cross-machine acceptance.

### Repository and independent review

Branch: `main`. Implementation commit: `db22017` (`Integrate guarded native
runtime qualification`). Private remote: `origin` at
`TaliEsch/talco-tf3-multiplayer`, independently confirmed `PRIVATE`. Commits
`db22017`, `b20367d`, `8ef0711` and continuation commit `068d7eb` were pushed to
`origin/main`. No release was published. Preserved staging backups were moved intact
outside TF3's scanned `staging_area` after they caused a duplicate-ID selection;
the corrected live run then matched the repository's 32-file source exactly.

Independent review should focus on the new cleanup ownership proof and remaining
Windows debug-event races; kill-on-exit teardown semantics; command lifetime/output contracts;
checkpoint digest coverage/collision properties; the missing production
Host/Join-to-adapter construction; prevention of stock-UI bypasses; and whether
the single-game vehicle result can be generalized without carrying local entity
IDs across instances. It should also review whether any supported, unmodified
TF3 entry point can reproduce the stock `ProgressPage` load sequence.

**Readiness verdict: not multiplayer-ready.** Real single-game engine observation,
control and one reversible host-ordered vehicle mutation are now demonstrated,
but safe command interception/replay, complete background synchronization,
recovery, separate-company road gameplay and all multi-instance acceptance remain
unfinished.

## Historical review-batch handoff (superseded where inconsistent above)

## 1. Objective and delivered scope

Objective: advance TalCo TF3 Multiplayer toward an up-to-four-player,
separate-company, host-authoritative implementation while preserving the existing
authenticated transport, automatic host-save transfer, coordinator, launcher and
fail-closed execution semantics.

This batch is ready for independent source/tooling review. It is **not** a claim
that TF3 multiplayer works or is ready to ship. Delivered scope:

- verified the supplied TF2 reference at the requested pin and mapped reusable
  principles to TF3 without copying implementation code;
- hardened the standalone, zero-capability native ABI/load probe with a structural
  mapped-image check and owned-process mismatch smoke test;
- completed the hash-pinned bounded disassembly helper without a path/hash race;
- hardened TF3 PE candidate parsing, including exact static-build fingerprints,
  per-runtime-range digests and bounded x64 unwind-chain validation;
- corrected the interpretation of three `GameSim::Step` label references as
  chained assertion fragments, not separate function entries;
- added a backward-compatible schema-v2 canonical checkpoint contract covering
  required world domains, with explicit incomplete/unavailable evidence;
- updated project permissions, roadmap and evidence to match actual capability.

No game files, saves, proprietary bytes, raw memory dumps or secrets were added.
No release was created. TF3 was not launched because no hook or native observation
path was sufficiently qualified to make a bounded game run informative.

## 2. Reference baseline and licence decision

Reference checkout: `C:\Users\olihf\Downloads\Temp\TF2 Mp\tpf2-multiplayer`.
The checkout was clean. Commit
`9f99097cb05333db18015da8296b7356c76a1612` was simultaneously `HEAD`, local
`main`, `origin/main`, `origin/dev` and `origin/HEAD`; the supplied clone had no
newer default-branch revision to adopt.

The reference licence is MIT, `Copyright (c) 2026 silver2127`. Copied or
substantial adapted portions would require preserving its copyright and
permission notice. This batch used architectural concepts, short symbol names
and source locations only; it copied no TF2 implementation. Therefore the
existing third-party notice remains accurate. See `tf2-reference-audit.md` for
the detailed command-family, pacing, mapping, recovery and determinism audit.

Retained principles: common host admission/order including the originator,
per-origin history and duplicate barriers, simulation-step rather than render-
frame ordering, per-instance entity resolution, measured pacing, explicit
divergence coverage and checkpoint reload/recovery. Excluded: TF2 addresses,
layouts, signatures, proxy-DLL installation, fail-open capture, pointer/ID
transfer, shared-company behavior, relay assumptions and universal-determinism
claims.

## 3. Architecture and integrated execution-path map

The shipping path remains intentionally gated:

1. `launcher/Program.cs` starts Host/Join helper processes and retains the existing
   authenticated save-transfer/user workflow. It was not changed in this batch.
2. `src/host.mjs`, `src/session-coordinator.mjs` and `src/lockstep.mjs` retain
   identity, separate-company admission, host sequencing, prepare/apply agreement,
   duplicate rejection and mismatch/disconnect halts.
3. `src/engine-session-adapter.mjs`, `src/async-session-participant.mjs` and
   `src/async-engine-mailbox.mjs` retain the bind/hold/prepare/execute/release/halt
   contract and require correlated engine receipts. Publishing a request is not
   execution.
4. `src/held-snapshot.mjs` now decodes legacy selected-state schema v1 as
   `comparisonReady:false` and defines schema v2 for towns/growth, economy,
   topology, vehicles, companies/ownership, lines/services and RNG/hidden state.
   Only seven observed domain digests are comparison-ready; explicit unavailable,
   unsupported and read-failed domains remain non-comparable.
5. The current mod producer still emits schema v1. A real schema-v2 producer and
   native observation boundary do not exist, so the normal Host path cannot yet
   claim a canonical world checkpoint.
6. `src/native-hook-candidates.mjs` parses a bounded PE64 file, locates static
   label references, validates runtime-function spans/unwind chains and hashes
   file-backed ranges. `src/native-build-profile.mjs` compares the exact known
   image/candidate evidence but always returns `activationPermitted:false`.
7. `tools/inspect-native-hooks.mjs` exposes that static report.
   `tools/disassemble-native-candidate.ps1` retains one no-write/no-delete-sharing
   handle across hash verification, PE parsing and `dumpbin`, and bounds the
   requested executable range.
8. `native/probe_dll.cpp` has inert `DllMain` and one V1 observation-only call.
   It hashes its calling executable, checks structural main-module PE64 consistency
   and reports zero gameplay/hook flags. `native/probe_host.cpp` is an owned-
   process ABI test only. There is no injector, IPC bridge or game hook.

## 4. Agent assignments and primary review

- `tf2_baseline_audit` (gpt-5.6-luna/low) owned only
  `docs/tf2-reference-audit.md`; after the local clone became available it verified
  the revision/licence and produced concrete source mapping. The primary agent
  independently read the licence, checked refs and inspected the principal
  architecture/determinism/recovery materials.
- `native_probe_runtime` (gpt-5.6-terra/medium) owned the native probe/build and
  disassembly helper. The primary agent read every resulting source file, checked
  the ABI remains zero-capability, and reran the native build/smoke.
- `checkpoint_coverage` (gpt-5.6-terra/medium) owned
  `src/held-snapshot.mjs` and its tests. The primary agent reviewed legacy
  compatibility, strict status/hash validation, deterministic hashing and the
  explicit producer gap, then ran the full suite.
- `abi_critical_review` (gpt-6-astra/high) was read-only. It independently
  verified the call graph, identified unwind chaining, the inert marker target,
  exception-handler concerns and tooling/parser weaknesses. The primary agent
  implemented and extended the parser/profile fixes, including malformed,
  missing and cyclic unwind tests.

Agents had non-overlapping write ownership. Summaries were not accepted as proof;
the primary agent inspected changes and performed integrated verification.

## 5. Native evidence, exact-build gates and remaining ABI assumptions

Installed image inspected read-only:

- path: `E:\Steam\steamapps\common\Transport Fever 3\TransportFever3.exe`;
- SHA-256: `a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`;
- PE timestamp: `1789752802`;
- `SizeOfImage`: `70545408`;
- exact candidate-evidence SHA-256:
  `112ea9e2d0b193f6081be3b12589e14e2c3dffbcaf442510f433d05b1ac122a8`.

The static profile matched exactly but remained non-activating. The three
`GameSim::Step` references in fragments starting at `0x1595B9`, `0x1595DA` and
`0x1595FB` have chained unwind metadata resolving to primary runtime entry
`[0x1593B0,0x1593CF)`. The outer loop calls `0x1593B0` at `0x11E346` and
`0x11ECF4` with EDX `0x30D40`, but the callee contains an inner loop; entry count
is not a canonical simulation clock. The outer loop calls the apply-command
candidate `0x9E2380` at `0x11EBB6` while traversing `0x38`-byte entries. The
candidate calls `0x9D7AA0` at `0x9E243E`; observed storage/refcount activity means
no command pointer may be retained or deferred from this evidence.

The shared labelled target `0x55B70` is only `ret 0` followed by `int3` padding;
it is not an instrumentation facility. Outer-loop/apply-command unwind metadata
references exception handlers, which a future trampoline must preserve.

Remaining assumptions are deliberately unresolved: decoded instruction boundaries
at a safe patch site, actual function ABI, command types/layout/lifetime, callback
ownership, simulation and UI thread identities, canonical update semantics,
pause/drain behavior, safe concurrent activation/teardown, runtime mitigation
policy and relocation-aware mapped-page identity. On-disk identity plus a mapped
PE header/extent check is not live code-page integrity.

## 6. Implemented, disabled and unverified

Implemented and isolated-test verified:

- V1 native load/ABI rejection, on-disk hash and structural mapped-image gate;
- owned-process negative test for a changed in-memory DOS signature;
- hash-pinned bounded disassembly with range/overflow/PE checks;
- PE candidate range digests, unwind-chain parsing and static-profile comparison;
- checkpoint schema-v2 validation/hashing and explicit coverage state;
- existing transport, save transfer, ordering, ownership and receipt machinery.

Implemented contract but not produced by TF3:

- seven-domain schema-v2 canonical checkpoint evidence;
- strict `requireCompleteCoverage` held-snapshot mode.

Disabled/absent:

- gameplay, hook and IPC capabilities in the native DLL (all flags are zero);
- native simulation observation, hold, command capture, suppression or apply;
- wiring a real native adapter into normal Host/Join;
- schema-v2 game producer and observable RNG/hidden-state coverage;
- common checkpoint reload/recovery automation.

Unverified: any live TF3 load of the DLL, any real TF3 native hook, two-instance
no-input agreement, host-ordered TF3 execution, separate-company native debit,
construction/line families, recovery, cross-machine behavior and four-player play.

## 7. Verification commands and results

- `npm run check`: passed after rerunning with permission for owned helper
  subprocesses. A fresh count-only Node test reporter on the current committed
  suite recorded 756 passed, 0 failed, 0 skipped/cancelled (37.7 seconds). The
  earlier 478 figure counted an incomplete visible TAP sequence and was wrong.
  The first sandboxed run had one `spawn EPERM` in
  `helper-lifecycle.test.mjs`; the same test passed in the permitted rerun, so
  this was an environment denial, not a product failure.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-NativeProbe.ps1 -RunSmokeTest`:
  passed with MSVC x64; malformed/null ABI, owned-memory mismatch and non-TF3 host
  rejection passed; the independently calculated host digest matched.
- `node tools/inspect-native-hooks.mjs 'E:\Steam\steamapps\common\Transport Fever 3\TransportFever3.exe'`:
  exact known profile matched; `activationPermitted:false`.
- focused parser/profile tests: 8/8 native candidate tests and 3/3 static-profile
  tests passed, including malformed PE, full instruction-span, unwind alignment,
  missing/cyclic chain and identity/evidence mismatch cases.
- the disassembly helper passed on the exact-hash step range and rejected a bad
  SHA and oversized range; `0x55B70` was independently inspected as inert.
- `git diff --check`: required before commit and recorded in the final status
  below.

Launcher build was not run because launcher source did not change. Mod review was
not run because mod source did not change. No TF3 game or multi-instance test was
run. No gameplay verification is claimed.

## 8. Known risks

- **Determinism:** no TF3 two-instance baseline exists. A shared seed, common
  save or loaded DLL does not cover native RNG, script clocks, iteration order,
  floating-point behavior, async tasks or hidden state.
- **Capture coverage:** no qualified TF3 admission/cancel boundary exists.
  Uncaptured local mutations would diverge immediately.
- **Command lifetime/exactly once:** observed command storage cannot safely be
  retained. Unknown native execution must remain unknown and non-retriable.
- **Accounting:** client balance is never authority. Native owner, payer, actual
  debit and unchanged peer balances need postconditions for every costly action.
- **Identity:** native pointers and local entity IDs are instance-local. Logical
  mapping by stable world facts remains unimplemented.
- **Checkpoint coverage:** schema v2 is a contract only. Missing RNG/hidden state
  prevents comparison; partial hashes must not be called world agreement.
- **Recovery:** the coordinator halts safely, but common save reload, fresh epoch,
  held verification and resumed admission are not integrated with TF3.
- **Hook safety:** exception/unwind behavior, runtime mitigations, activation
  atomicity and teardown are unresolved. A wrong hook could corrupt or crash TF3.

## 9. Consolidated manual two-machine acceptance procedure

Do not run this acceptance sequence until a reviewed build adds a qualified
command interceptor and production Host/Join engine adapter. Use disposable
saves and matching exact game/mod/native hashes on both machines.

1. Start Host, verify repository-distributed native files and load the same
   disposable checkpoint. Join from machine B and confirm authenticated save
   download/hash, distinct companies and frozen roster.
2. With no user input, hold both simulations at the same native update. Capture
   two fresh schema-v2 snapshots per machine. Require all public domains observed,
   every explicit blind spot identical, and matching hashes; repeat across pause
   and supported speeds for a meaningful interval.
3. While held, submit one reversible vehicle Start/Stop request from a client.
   Require host admission/sequence, ownership recheck, prepare receipts from both,
   exactly one apply on both at the agreed update, correlated postconditions and
   matching full snapshots. Repeat once from the host so host actions prove the
   same admission path.
4. Exercise a target-company line or construction action only after its family is
   qualified. Verify asset owner, exact native debit, unchanged other company and
   instance-local entity mapping on both machines. Test insufficient funds and a
   stale ownership request; neither may mutate.
5. Disconnect one participant during prepare and during uncertain execution.
   Require admission and simulations to halt. Do not retry the command.
6. Recover from a new host checkpoint: authenticated transfer, reload on both
   including host, fresh epoch/duplicate barriers, held schema-v2 agreement, then
   explicit release. Repeat over LAN before port-forwarded Internet and two
   players before four.

Collect exact hashes, logs, receipts, snapshots, update counts and failures.
Passing source tests or a single-instance DLL load is not acceptance.

## 10. Remaining blockers by impact

1. No qualified TF3 command admission/interception boundary or safe hook ABI;
   the simulation observer does not provide command capture.
2. The live schema-v2 producer covers six public domains, but RNG/hidden state
   remains unavailable and no second instance has tested whether that blind spot
   permits meaningful lockstep comparison.
3. No two-instance, no-input TF3 determinism baseline at common native updates.
4. No exactly-once real TF3 command capture/defer/apply path wired to Host/Join.
5. No production logical entity mapping or native separate-company accounting
   proof for vehicle, line and construction families.
6. No TF3 checkpoint reload/recovery integration after mismatch or uncertain
   execution.
7. No two-machine, Internet or four-player real-game acceptance.

Items 1-6 are unfinished engineering work, not external blockers. Item 7 remains
an acceptance gate requiring environments not currently controlled here.

## 11. Commits and repository status

Current continuation status: implementation commit `8333ae3` (`Add live
checkpoint coverage and host-local authority path`) was pushed to `origin/main`.
An authenticated post-push query reported
`TaliEsch/talco-tf3-multiplayer` as private, with default branch `main`; local
`main` and `origin/main` were 0 behind/0 ahead. No tag or release was created.
This documentation status update follows as a documentation-only commit.

Implementation commit:

- `c2085de` — `Harden native qualification and checkpoint coverage`

This report is delivered in the immediately following documentation commit named
`Add native integration review handoff`; its resulting hash is recorded in the
final task response and repository log rather than self-referenced here. The
earlier reviewed matrix fix `eae0a07` is also local and not yet on the remote.
Before the attempted push, authenticated `gh repo view` reported
`TaliEsch/talco-tf3-multiplayer` as `PRIVATE`/`isPrivate:true`. The intended final
status is a clean `main` matching `origin/main` after all three local commits.

Authoritative pre-push status: the worktree is clean and `main` is three commits
ahead of `origin/main` (`0` behind, `3` ahead). The first push attempt was denied
by the execution approval layer because it updates the shared default branch; it
did not change the remote. The user then explicitly authorized the push. The
three commits through handoff commit `45ab324` were pushed successfully, after
which local `main` and `origin/main` were `0` behind/`0` ahead. A final
authenticated query confirmed the default branch is `main` and the repository is
still `PRIVATE`/`isPrivate:true`. This post-push status correction is delivered as
the next documentation-only commit. Generated `dist/native` output remains
ignored. No tag or release is created.

## 12. Independent reviewer focus

Scrutinize:

- x64 `UNWIND_INFO` bounds, alignment, flag combinations, chain resolution and
  whether exact-profile evidence includes every field it claims;
- the distinction between an exception fragment, primary runtime entry and a
  decoded semantic function;
- the native probe's structural-memory claim versus full code-page integrity,
  especially TOCTOU, loader fixups and future capability gating;
- the disassembly helper's retained handle/share semantics and VA/RVA overflow
  checks;
- schema-v2 exact-field validation, explicit unavailable states and whether any
  caller could mistake legacy `comparisonReady:false` for world agreement;
- all documentation wording that might imply live hooks, full checkpoint coverage,
  actual native execution or real multiplayer;
- the next design's command lifetime, exception/unwind, thread ownership,
  activation/teardown and unknown-outcome behavior before allowing any game hook.
