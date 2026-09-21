# Native-integration review handoff — 21 September 2026

## Superseding full-readiness handoff

This section supersedes the older review-batch narrative below. The objective is
full multiplayer readiness, and that objective is **not complete**. Commit
`db22017` advances a real single-game vertical slice and fail-closed native
tooling; it does not provide functioning multi-instance multiplayer.

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
  construction/growth proxy state, company finances, topology, vehicles,
  companies and lines/services. Inaccessible RNG/hidden state is explicitly
  `unavailable`. Production mailbox admission now refuses incomplete coverage;
  the legacy company-only path is explicitly `local_diagnostic`.
- Native IPC, client framing, persistent session binding, Host/Join admission
  gating, disconnect/halt fencing and diagnostic-only transport are implemented.
  Authenticated socket clients now expose stable snapshot fanout for verified
  host frames without replacing the existing admission/save handler; locally
  synthesized transport/lifecycle events never enter that authoritative stream.
  The current controller advertises `productionQualified:false`, so ordinary
  Host/Join correctly remains closed rather than mistaking debugger receipts for
  world evidence.

### Real execution paths

1. `src/startup-load.mjs` creates and verifies a random disposable copy and the
   exact one-shot request. `mod/content/tf3mp_startup_load.script.lua` consumes
   that request before calling `app.loadGame`. This path reaches the world but
   violates the verified TF3 main-menu React lifecycle and is diagnostic-only.
2. `native/runtime_observer.cpp` performs exact-build, mapped-byte-gated
   observation. The default simulation profile is the only live profile still
   selectable. `Build-NativeRuntime.ps1` builds it with `/W4 /WX`.
3. `native/runtime_controller.cpp` owns authenticated native IPC, session
   binding, hold/release/halt and teardown. `src/native-runtime-client.mjs` is the
   framed client and `src/native-host-join.mjs` is the fail-closed admission gate.
4. `src/cli.mjs` requires that native gate for normal Host/Join and offers a
   non-admitting diagnostic transport mode. This gate is not yet a working
   gameplay adapter: no production-qualified runtime exists and normal network
   Host/Join does not construct a per-game `EngineSessionAdapter`.
   `src/client.mjs` now permits a future adapter to subscribe to authenticated,
   schema-checked host frames while preserving the existing primary handler.
5. `mod/content/tf3mp_status_panel.script.tl` exchanges the fixed vehicle
   discovery/request files. `mod/content/tf3mp_status.script.tl` checks live
   company ownership/revision, executes one native vehicle command and records a
   correlated postcondition. `tools/live-vehicle-slice.mjs` drives the local
   HostAuthority-backed disposable-world proof.
6. `src/coordinator-checkpoint.mjs`, `src/async-engine-mailbox.mjs` and
   `src/engine-session-adapter.mjs` decode world evidence and refuse incomplete
   production coverage. Native transport acknowledgements are always marked
   `gameWorldReceipt:false`.

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

The observer and controller now classify exception address, RIP, tracked/armed
thread identity and the matching enabled execution slot; TF and DR6 BD/BS/BT
causes are rejected. Teardown records strict per-thread ownership evidence,
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

Schema-v2 compares sorted public entity IDs/revisions and selected public fields
for the six observable domains listed above. It does not serialize a world and
does not cover RNG, hidden native state, every town-growth input, cargo queues,
pathfinder internals, async job order or all economic accumulators. RNG/hidden
state is explicitly unavailable, which makes the current producer ineligible for
production checkpoint agreement. No two-instance no-input baseline exists.

### Verification record

- Full regression suite after this integration: **813 passed, 0 failed, 0 skipped
  or cancelled** (`npm run check`, 88.55 seconds). This supersedes the prior 808
  result, the incorrect 478 count and the independently verified 756 baseline.
- `Build-NativeRuntime.ps1 -RunSmokeTest`: passed MSVC x64 `/W4 /WX` build and
  owned observer/controller smoke tests.
- Observer/controller focused suite: 25/25 passed in 36.00 seconds, including
  strict trap ownership, 16-thread/missing-DR6 stress, cleanup races, fail-stop
  and real unowned-exception forwarding.
- Authenticated network focused suite: 11/11 passed, including a signed
  post-admission coordination frame, primary-before-observer ordering, stable
  fanout, observer fault isolation and lifecycle separation.
- `Build-NativeIpc.ps1`: passed MSVC x64 `/W4 /WX` build.
- Mod review: 29 content files, zero executables, manifest
  `80ed637bb9c609d7e990616ebd1797b3571d1d536a39f447779af4b905fe1dc7`.
- `git diff --check`: passed before the implementation commit.
- Single-game verified: startup direct-path load with the UI lifecycle faults
  above, simulation observation,
  controller hold/one-release/teardown, vehicle discovery and reversible
  host-sequenced stop/start.
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
`db22017`, `b20367d` and `8ef0711` were pushed to `origin/main`; the current
trap/socket/live-loader continuation is not yet committed at the time of this
record. No release was published. Preserved staging backups were moved intact
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

Do not run this until a reviewed build adds a real, fail-closed native observer
and schema-v2 producer. Use disposable saves and matching exact game/mod/native
hashes on both machines.

1. Start Host, verify repository-distributed native files and load the same
   disposable checkpoint. Join from machine B and confirm authenticated save
   download/hash, distinct companies and frozen roster.
2. With no user input, hold both simulations at the same native update. Capture
   two fresh schema-v2 snapshots per machine. Require every domain observed and
   identical; repeat across pause and supported speeds for a meaningful interval.
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

1. No qualified TF3 native observation/admission boundary or safe hook ABI.
2. No live schema-v2 producer; relevant RNG/hidden state observability is unknown.
3. No two-instance, no-input TF3 determinism baseline at common native updates.
4. No exactly-once real TF3 command capture/defer/apply path wired to Host/Join.
5. No production logical entity mapping or native separate-company accounting
   proof for vehicle, line and construction families.
6. No TF3 checkpoint reload/recovery integration after mismatch or uncertain
   execution.
7. No two-machine, Internet or four-player real-game acceptance.

These are genuine live/native evidence blockers. Additional speculative wrappers
or launcher UI would not resolve them.

## 11. Commits and repository status

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
