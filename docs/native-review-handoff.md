# Native-integration review handoff — 21 September 2026

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
  subprocesses. TAP showed 478/478 tests passing. The first sandboxed run had one
  `spawn EPERM` in `helper-lifecycle.test.mjs`; the same test passed in the
  permitted rerun, so this was recorded as an environment denial, not a product
  failure.
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
