# Native integration track — 21 September 2026

## Objective and scope

Deliver up to four separate-company players, with host-ordered commands and
verified simulation agreement. The user has authorized native integration as
the new priority. This replaces the former script-first engineering restriction;
it does not establish vendor endorsement, transfer TF2 compatibility, authorize
public distribution, or permit installed-file changes. For this 21 September
mission only, deliberate bounded assistant-launched TF3 investigation is allowed
when useful, using disposable data and an explicit launch record. It is not
gameplay verification unless the observed test actually establishes that claim.

Keep the existing authenticated transport, save transfer, identity, coordinator,
launcher and usable script components. Do not rebuild those for the sake of DLLs.
The outstanding matrix-reader repair stays in source but is not a reason to ask
for another stop-placement test before the synchronization feasibility gate.

## TF2 reference, pinned and limited

Reference: silver2127/tpf2-multiplayer at
`9f99097cb05333db18015da8296b7356c76a1612`. The user-supplied local clone was
clean and had that exact revision at `HEAD`, `main`, `origin/main`, `origin/dev`
and `origin/HEAD`; it contained no newer default-branch revision. Its MIT licence
(`Copyright (c) 2026 silver2127`) permits reuse with notice retention for copied
or substantial portions. This batch copied no implementation code. See
`tf2-reference-audit.md` for the file/symbol mapping and exclusions.
Primary documents inspected: `docs/ARCHITECTURE.md`,
`docs/re/GAME_LOOP_AND_UI.md`, `docs/DETERMINISTIC_SCRIPTS.md`,
`docs/REPLICATION.md`. This is architectural reference, not an imported engine
implementation. No TF2 source, signatures, addresses or game data are copied.

The reference combines native command capture/defer and simulation pacing with
script replay and transport. Its determinism notes report a same-machine,
same-save, no-input comparison, explicitly not proof across different machines.
It also documents scoped script-RNG compatibility rather than a universal fix
for random behavior. Therefore neither DLL loading nor a shared random seed
qualifies TF3 synchronization. TF3 needs its own measured baseline.

We retain command ordering, instance-local entity resolution, measured pacing
and divergence detection as principles. We do not inherit its fail-open capture
behavior: uncertain local execution must stop admission, not silently continue.

## Implemented native foothold

`native/probe_dll.cpp` is an original x64 observation-only DLL. Its entry point is
inert. Only an explicit versioned probe call hashes the calling executable using
Windows BCrypt. The known TF3 image may report an observation-only match; no
build reports command, simulation or gameplay capabilities. Unknown executables
are unsupported. The probe also requires a structurally consistent mapped PE64
main-module header and image extent, with an owned-process mismatch smoke test.
This is not full mapped-code integrity and does not establish the correctness of
any future hook.

`Build-NativeProbe.ps1 -RunSmokeTest` builds the DLL and a standalone test host
using local MSVC. The host loads the explicit DLL path in its own process, tests
ABI rejection and confirms it is not mistaken for TF3. Output is under ignored
`dist/native`. Nothing is copied into the game installation. No injector, proxy
replacement, game hooks or multiplayer runtime exists in this native batch.

The installed TF3 PE inventory identifies x64 executable SHA-256
`a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`.
Its inspected exports are FreeType functions, not a game-command/simulation ABI.
No top-level PDB was found. Debug-directory presence is not usable symbols.

## Static mapping evidence (not hook qualification)

`node tools/inspect-native-hooks.mjs <absolute-exe-path>` reads a bounded x64 PE,
finds a fixed set of NUL-terminated labels and RIP-relative LEA byte candidates,
and associates those with exception-table ranges. It never attaches to a process
or enables a hook. Runtime ranges are sorted and overlap-checked in O(n log n),
not pairwise compared across the large exception table. The report includes PE
timestamp/image size, per-range SHA-256, bounded unwind-chain resolution and a
known-build evidence fingerprint. Even an exact profile match reports
`activationPermitted: false`; independent mapped-page and live ABI/thread gates
remain mandatory.

On the above exact TF3 hash it found 12 references across five labels. Root
inspection with MSVC dumpbin established an important distinction:

- `GameSim::Step` references at RVAs `0x1595B9`, `0x1595DA`, `0x159601`
  are assertion paths (source/line arguments, a common call, then INT3), not
  three simulation entry points. Disassembly starting at `0x1593B0` shows a
  routine branching to these paths, performing a loop and returning at
  `0x1595B8`. This is a stronger candidate for further investigation, not a
  qualified ABI or proof of one call per simulation update. Unwind metadata
  further shows that these assertion references are chained fragments whose
  primary runtime entry is `[0x1593B0,0x1593CF)`. The scanner reports fragment
  and primary ranges separately and rejects malformed, cyclic or unmapped chains.
  The outer loop range `[0x11E230, 0x11EEB2)` contains direct calls at
  `0x11E346` and `0x11ECF4` to `0x1593B0`, both loading EDX with `0x30D40`
  (200,000). This corroborates the call relationship only; the unit and semantic
  step count need live qualification. In particular the callee can loop over
  multiple world updates, so counting its entry is not yet a canonical clock.
- The `Simulation Thread: Apply Command` reference belongs to exception range
  `[0x9E2380, 0x9E26EE)`. Disassembly from its range start shows two incoming
  pointer arguments saved, a labeled instrumentation call, dependent-entity
  checks, and a call at `0x9E243E` to `0x9D7AA0`. This suggests an application
  path; it does not establish where commands are admitted or safely deferred.
  The outer loop also calls this routine at `0x11EBB6` while iterating entries
  with a `0x38` stride. Those pointer layouts and lifetime rules are not an
  authorized serialization format and must not be sent between machines.

Independent disassembly found that the common labelled marker target at RVA
`0x55B70` is only `ret 0` followed by `int 3` padding. It is not an available
instrumentation API or justified detour site. The outer-loop and apply-command
ranges also use exception handlers; a later trampoline would need to preserve a
verified unwind/exception contract.

These addresses are research notes for this exact image only. They are not
compiled into the DLL, approved patch sites, transferable TF2 offsets, or live
observations. Next: trace callers and object lifetimes, distinguish outer pacing
from actual world updates, and qualify argument/thread behavior before any hook.

The codebase map confirms the replacement boundary: preserve transport and
coordination, implement observation/hold/prepare/execute/release/halt behind the
engine adapter contract. The normal Host path does not yet connect a native
adapter. `held-snapshot.mjs` now defines a strict schema-v2 canonical checkpoint
contract across towns/growth, economy, topology, vehicles, company ownership,
lines/services and RNG/hidden state. Every domain is either an observed digest or
an explicit unavailable status; only all-observed snapshots are comparison-ready.
The current game producer still emits schema-v1 selected company/vehicle state,
so production whole-world comparison remains unavailable and strict mode is not
enabled on the live bridge.

## Ordered acceptance gates

1. **Native ABI/load:** compile, load/unload in our harness, reject malformed ABI
   and wrong executable. This is not an in-game test.
2. **TF3 hook qualification:** identify exact command admission and simulation
   step boundaries for this build, signatures/calling conventions, callback
   ownership, threading and safe teardown. Record provenance and expected bytes;
   ambiguous matches or changed bytes must refuse activation. No TF2 address reuse.
3. **Read-only in-game observation:** explicitly approved controlled load into
   a deliberately bounded game run; show actual thread/step observations with
   no command suppression or simulation mutation. Loading a DLL is not gate 2.
4. **Two-game no-input baseline:** identical checkpoint, build and mod manifest;
   compare at common simulation steps, not wall time or render tick. Include town
   buildings/growth, economy, transport topology and relevant hidden state.
   Report coverage; partial hashes cannot certify whole-world determinism.
5. **One controlled command:** defer an originating reversible vehicle action,
   host-order it, apply exactly once on both instances at an agreed step, then
   compare receipts and state. Distinguish GUI acknowledgement from execution.
6. **Separate-company playable loop and recovery:** construction, vehicles,
   lines, service accounting and ownership; stop on mismatch, load a common
   checkpoint on rejoin. Qualify two machines before four and Internet release.

Currently only the isolated load/ABI gate can be tested without additional engine
mapping. No verified TF3 command-admission or simulation-thread hook exists.
That is the next concrete engineering task, not another pricing/placement UI.
