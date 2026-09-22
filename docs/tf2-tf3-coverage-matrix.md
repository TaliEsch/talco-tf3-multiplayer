# TF2 → TF3 implementation coverage matrix

Reference inspected: `C:\Users\olihf\Downloads\Temp\TF2 Mp\tpf2-multiplayer`, exact HEAD `9f99097cb05333db18015da8296b7356c76a1612`. TF2 source is evidence of one implementation on TF2 build 35924, not evidence that its addresses, ABI, data layouts, APIs, clocks or behavior apply to TF3. TF3 evidence below is current through `95d79c8` (including checkpoint work from `8333ae3`); runtime evidence is distinguished from model/source tests.

“Owner” names the implementation workstream, not an external dependency. These assignments are concrete next work; they do not delegate away the root agent’s integration and evidence responsibility.

| TF2 capability | TF2 implementation source / symbol | TF3 equivalent / evidence | Current TF3 implementation and verification | Remaining gap | Concrete owner / dependency assignment |
|---|---|---|---|---|---|
| Command creation, admission, capture, suppression and replay | `native/src/slice_hook.cpp` (`CaptureFactory`, factory/`CommandList::Add` detours and caller dispatch), `native/src/slice/capture.inl` (bounded decode/arm), `native/src/slice/add_hook.inl` (callback/defer/cancel). `mod/.../inject.lua` converts captures; `roads.lua`, `cons.lua`, `vehicles.lua`, `lines.lua`, `stops.lua` replay or read back families. Add cancels only an armed, shipped capture; decode failures often deliberately run natively (fail-open). | TF3 `mod/content/tf3mp_road_capture.lua` copies bounded road proposals; `tf3mp_road_replay_{prepare,preflight,execute}.lua` reconstructs, checks and sends local diagnostic replay. Exact-build analysis in `docs/vehicle-abi-static-evidence.md` traces vehicle factory `0x9EEE60` through scripting submission and proves Add `0x9D3120` is only one branch: adapter `0x120430` queues through TLS or applies directly. | The static verifier decodes 46 calls/44 functions plus 41 route instructions/21 functions. An authenticated pointer-free passive diagnostic schema is owned-tested but production-disabled. Road/stop codecs and local replay retain their focused tests. | No TF3 native event enters multiplayer admission; the common submission interface is not yet passively observed or suppressed, normal UI mutations are not globally vetoed, and local replay is not host ordered or peer applied. | Qualify exact-build passive factory/common-submission observation and teardown, then implement immutable intent plus origin suppression behind fail-closed guards. Add-only interception is explicitly insufficient. |
| Command lifetime, wire format, ordering, duplicates and retransmission | `mod/.../net.lua`: per-origin sequence, ACK/NACK gaps, retained history (`histPush`, `histServe`), deduplication and `scheduleLocal`; `lockstep.lua` sorts due work. `native/src/slice/add_hook.inl` uses callback/defer rather than retaining speculative command pointers. | TF3 `src/protocol.mjs`, `session-coordinator.mjs`, `session-participant.mjs`, `coordinator-execution.mjs`, `engine-operation-journal.mjs`, `async-session-participant.mjs`, `async-engine-mailbox.mjs`; native IPC now exists in `native/runtime_ipc*` and `native/runtime_controller.cpp`. | Strict host sequence/schedule, prepare/commit/applied barriers, duplicate rejection and unknown-outcome latching have model/local-file coverage. They are not connected to a general native gameplay command path (`docs/completion-audit.md`, `docs/native-integration.md`). | Need native event identity, host-action parity, per-instance apply receipt and observed postcondition; timeout cannot retry mutation. | Connect qualified immutable intents to coordinator/mailbox, including host actions, exactly-once barriers, correlated receipts and fail-closed unknown outcomes. |
| Simulation pacing, update boundary, coordinated pause and actual halt | TF2 `native/src/speedhook.cpp` (`SpeedHook_Install`, `SpeedHook_Pace`) changes TF2 `CGame::Step`; `mod/.../pacing.lua` (`paceV2`, `paceTick`, `ensureRunning`, votes/gap holds) coordinates sim-time and pause; `slice_hook.cpp` captures speed/pause. ABI and units are TF2-build-specific. | TF3 `native/runtime_observer.cpp` observes exact-build process events/candidate thread activity; `runtime_controller.cpp` owns debug-register boundary traps and hold/release/halt controls. `src/engine-observation.mjs`, `pause-probe.mjs`, `halt-probe.mjs` parse/check diagnostic events. | Observer/controller and IPC are implemented, with fail-stop hold mechanics and teardown checks. User-confirmed local evidence: immediate pause/event/resume at update 2879, exact hold at update 2904, and an owned vehicle action inside a local hold (`docs/pause-barrier-test.md`, `docs/vehicle-hold-test.md`). TF3 candidate `GameSim::Step` at `0x1593b0` may batch multiple world updates, so its entry is not yet a canonical single update. | Local diagnostics do not establish synchronized multi-game clock/barrier, global speed arbitration or general multiplayer input lock. | Establish an engine-produced canonical update counter and demonstrate all-instance hold/release via coordinator, preserving emergency fail-stop and live control transport. |
| Entity identity and instance-local resolution | TF2 roads.lua resolves topology by positions and topology context; cons.lua, vehicles.lua, lines.lua assign session keys (origin:seq) and save-scoped keys, then map each key to local IDs. inject.lua serializes facts rather than native pointers. docs/REPLICATION.md enumerates family-specific keys. | mod/content/tf3mp_road_capture.lua records proposal entities/positions; mod/content/tf3mp_road_replay_prepare.lua and preflight.lua rebuild/check local proposal; src/held-snapshot.mjs validates checkpoint identity. src/company-inspection.mjs and engine observations identify current company values for diagnostic use. | Isolated mapping/rebuild and local company-gate test paths exist (test/native-road-stop-rebuild, test/company-*, test/road-stop-readback). No multi-instance entity equivalence test exists. | No general session/checkpoint-scoped logical identity map for TF3 roads, stops, depots, vehicles, lines and company-owned assets. Raw per-instance IDs cannot cross wire; ambiguous resolution must reject. | Domain adapter owner: define typed logical keys: saved entities scoped to checkpoint plus type; session-created entities scoped to host epoch plus origin sequence. Resolve locally and reject missing/ambiguous keys. Begin with vehicle action; extend through complete road loop. Validate current owner immediately before each mutation. |
| Autonomous simulation and deterministic scripts | TF2 `deterministic_script.lua` wraps only Natural Town Growth with simulation-clock time and saved per-script Park–Miller RNG, sorting town/cargo iteration. `hash.lua` samples state; `docs/DETERMINISTIC_SCRIPTS.md` lists excluded cached references, other PRNGs, async/native effects and lack of universal proof; same-machine runs in `docs/re/GAME_LOOP_AND_UI.md` are bounded. | TF3 `src/held-snapshot.mjs` and `src/coordinator-checkpoint.mjs` schema v2 define town/growth, economy, topology, vehicles, ownership, services and RNG/hidden-state domains. `mod/content/tf3mp_status.script.tl` produces canonical public-domain digests. | A real disposable game produced all six public domains at exact held/released update 3052 with `comparisonReady:true`; hidden RNG remained explicitly unavailable and `coverage.complete:false`. No two-instance no-input baseline exists. | Autonomous growth, financial accrual, transport simulation, scripts, RNG and async effects remain un-compared between instances at matched updates; public coverage still has documented subfield blind spots. | Compare two matching instances at equal observed update counts, report blind spots explicitly and investigate mismatches before general command replication. Add state replication if lockstep is not viable. |
| Ownership, separate companies, spending, revenue and operating cost | TF2 `companies.lua` implements permission checks, authenticated player/company mapping, `cmOwnerOf`, foreign-owner guards, journals/wallets and ownership transfer; `inject.lua` stamps/replays company-sensitive actions. `docs/REPLICATION.md` records settlement caveats. | TF3 `src/company-service.mjs`, `company-transaction.mjs`, `company-inspection.mjs`, `finance-probe.mjs`; mod has company-scoped road/vehicle/station/service diagnostics. | Source/probes verify selected company, live vehicle owner, balance and a local road-stop charge in a disposable replay. Separate-company model/phase tests exist; no integrated multiplayer execution or cross-peer revenue/cost proof. | No production identity→company admission binding for all actions. Local checks do not establish synchronized multi-company accounting, autonomous costs/revenues, or transfer/purchase semantics. | Bind authenticated identity to checkpointed company, recheck native execution company per action, then verify payer/debit and resulting state on all peers. Extend from local debit to buy, service income/cost and foreign-owner rejection. |
| Checkpoints, resynchronization and recovery | TF2 `resync.lua` coordinates hold/save/transfer/load/compare/fresh epoch; `net.lua` keeps history relative to save watermark; `native/src/native_io.cpp` and `netpunch/sync_snapshot.py` transfer/reload saves. `docs/RESYNC.md` records bounded evidence and limitations. | TF3 `src/save-transfer.mjs`, `coordinator-checkpoint.mjs`, `held-snapshot.mjs`, `async-session-participant.mjs`; `8333ae3`/`110d405` add live schema-v2 checkpoint coverage and host-local authority plumbing. | Authenticated save transfer and coordinator barriers have implementation/tests. A real local production-gated hold captured all six public domains and released at update 3052. This is single-game evidence, not cross-instance agreement or automatic recovery. | Host/Join recovery still needs native hold, verified save/load on each game including host, old-epoch fencing, restored identity/company map, producer-backed comparison and coordinated release. Unknown outcome must halt, never retry. | Integrate the verified local checkpoint path into native hold and Host/Join recovery; exercise mismatch, participant loss, native exception and unknown execution receipt across multiple processes. |
| Gameplay command families and known limitations | TF2 docs/REPLICATION.md gives actual source-backed coverage: strict/cancel-and-replay roads/rail/builds/stops/terrain/assets and some vehicles/lines; polling/replay for others; explicit refusal/fail-open cases. native/src/slice/*.inl, inject.lua, roads.lua, cons.lua, vehicles.lua, lines.lua, stops.lua, terrain.lua implement families. docs/KNOWN_ISSUES.md retains unsupported or unverified gaps. | TF3 current content has road/stop capture/replay and probes, station/depot/service/vehicle test modules, but no general supported-action policy shown in source/docs; Host/Join native action integration is absent. | Road/stop focused source/model tests and probe workflows exist; see test/road-stop-*, test/native-road-stop-*, test/phase2-*. These do not constitute an integrated supported gameplay set. | Define and enforce the complete enabled action allowlist. For product road loop implement road construction, depot/stops, vehicle buy/assign/start-stop/sale, line create/edit/remove; native UI must not allow unreplicated mutations. Track rail/shipping/aviation/terraform and all other omitted actions as explicitly unsupported until implemented. | Gameplay-domain owner: build one full road loop over verified generic boundary/identity/economy path; host and clients use same admission. Add family-by-family native UI gate based on live session support. Do not disable solo-game actions. Expand beyond road only after full loop tests on two game processes. |

## Focused TF2 reversible-vehicle trace — 22 September 2026

The concrete TF2 `VREV` path was traced through source, rather than inferred
from the architecture documents. `native/src/slice_hook.cpp:186` identifies the
Reverse factory; `native/src/slice/capture.inl:267` captures the local vehicle
ID and publishes `VREV`; `native/src/slice/add_hook.inl:365` correlates the
immediate command pointer and suppresses the matching `CommandList::Add`;
`native/src/deferrelay_slice.asm` returns the suppressed result; and
`mod/mp_lockstep_1/res/scripts/mp/inject.lua:1270`, `mp/net.lua:477,522`,
`lockstep.lua:652,1110` and `mp/vehicles.lua:689,760,829` serialize, order,
deduplicate, resolve and replay it. The native command object is never retained
for the network; only semantic values cross the boundary. The factory output
pointer is an immediate correlation token, and caller cleanup of the suppressed
Add output handle is a separate lifetime obligation.

This trace also identifies policies that must **not** be copied. TF2 origins
assign their own timestamp/sequence and peers order by timestamp/origin/sequence;
TalCo retains host-authoritative order for host and participant actions. TF2
publishes `ARMED` before suppression is proved, uses a single global pending
pointer, does not recheck vehicle ownership immediately before `VREV`, has no
independent state/balance postcondition for it, executes late remote commands,
and uses financial repair/ownership-transfer fallbacks for some purchases.
TalCo must publish capture only after confirmed suppression, bind it to the
authenticated company, recheck local ownership at execution, apply the desired
stopped state once, and halt on late or unknown outcomes without balance repair.

The strongest reusable design is TF2's persistent logical vehicle registry in
`mp/vehicles.lua:79,92,99,131,142,1129`: entities present in the common save
receive save-scoped keys; newly purchased vehicles receive origin/sequence keys
bound from the local result entity; the high-water state survives reload. Any
adaptation will use the TalCo checkpoint identity, host epoch and host sequence,
and will retain the TF2 MIT copyright/permission notice. No source was copied in
this batch. The immediate TF3 qualification target remains factory candidate
`0x9EEE60` through admission candidate `0x9D3120`, including output-handle and
callback ownership; those RVAs/layouts are TF3 evidence and are not derived from
the TF2 ABI.

## Reuse and licence decision

The TF2 reference root LICENSE is MIT, copyright 2026 silver2127. There is no code copied or adapted into this matrix or TF3. Most tempting pieces are coupled to TF2's game-script API, Lua state, binary interface, build 35924, file IPC, entity model and save semantics; use them as implementation evidence, not as drop-in components. Plausible future adaptation after interface review includes pure algorithms (sequence-gap tracking, command-history watermark/pruning, canonical ordering, Park–Miller PRNG, deterministic sorting) and transport-independent state-machine ideas. Reuse only after confirming the source file's licence and separating game-independent code; preserve the original copyright/license notice in source/distribution and include the MIT licence text and attribution in third-party notices. Do not copy TF2 addresses, signatures, layouts, calling conventions, hooks, Lua game calls, codecs, DLL loader/proxy, or protocol as though they were compatible.

## Implementation priority distilled from the matrix

1. Qualify TF3 world-update/thread and a reversible native action boundary, then activate controlled hold/halt and teardown only with exact-build and runtime evidence.
2. Connect native IPC to existing Host/Join ordering, including host actions, duplicate barriers, correlated receipts and fail-closed unknown outcomes.
3. Produce and compare real world observations across two instances at matching simulation updates; understand autonomous divergence before choosing lockstep versus host-authoritative state replication.
4. Complete one company-bound road-transport loop and prove native account effects, instance-local mapping and cross-company rejection.
5. Integrate common-save recovery and then test failure cases. Keep every unimplemented native mutation unavailable during an active multiplayer session, and retain unrelated single-player behavior.

The matrix is an assignment and gap map. It is not evidence that the listed TF3 capabilities work.

## Current evidence correction and critical path (22 September 2026)

The older TF3 cells above predate the latest in-process observer and live
checkpoint work. Read them with these current facts:

- `native/production_boundary_gate.cpp` now owns the exact-image/site-gated
  post-update RVA `0x159581`. A production-qualified disposable run correlated
  it with the public bridge clock, held tick/update 57266/2978, released exactly
  one update and re-held at 57267/2979, then restored/detached and resumed at
  57268/2980 while authenticated `native/runtime_ipc.cpp` traffic remained live.
  A separate live run went directly from running generation zero to terminal
  park at 57267/2979; native and bridge clocks remained fixed while a later
  authenticated ping succeeded. This
  qualifies bounded single-game hold/release/halt/detach on the current
  build; it does not qualify any gameplay command or two-instance agreement.

- `native/runtime_observer.cpp` and `native/runtime_controller.cpp`, with `native/runtime_ipc*`, implement a TF3 exact-build observation/control path. It is not a qualified gameplay command hook. `docs/native-integration.md` records the disassembly evidence: candidate `GameSim::Step` entry `0x1593b0` may loop over multiple updates, so its entry count is not a canonical clock.
- `docs/pause-barrier-test.md` records user-confirmed local pause/event/resume at update 2879 and exact hold at 2904; `docs/vehicle-hold-test.md` records an owned vehicle action inside a local hold. These are solo diagnostics, not synchronized peers, global input veto, or multiplayer command execution.
- The live schema-v2 producer captured all six public domains in a real disposable game at exact update 3052. Hidden RNG remains explicitly unavailable, so the result is comparison-ready but not complete. This is not two-instance agreement, a complete serialization of hidden state, or integrated Host/Join recovery.
- The reference map is source-backed: command capture/suppression is in `native/src/slice_hook.cpp`, `native/src/slice/capture.inl`, and `native/src/slice/add_hook.inl`; lifecycle/reliability is `mod/mp_lockstep_1/res/scripts/mp/net.lua` (`scheduleLocal`, history, ACK/NACK/dedup) plus `lockstep.lua`; pacing/pause is `pacing.lua`; family identity/replay resides in `roads.lua`, `cons.lua`, `vehicles.lua`, `lines.lua`, `stops.lua`, and `inject.lua`; ownership/economy is `companies.lua`; recovery is `resync.lua`; bounded script determinism is `deterministic_script.lua` and `hash.lua`. TF2's strict capture is not universal: polling/replay and fail-open cases remain documented in `docs/REPLICATION.md` and `docs/KNOWN_ISSUES.md`.

Three implementation assignments, in critical-path order:

1. Complete command admission/object-lifetime qualification around TF3 factory
   `0x9EEE60` and Add `0x9D3120`; its source/callback/progress cleanup and
   reference-counted output contract must be owned-tested before suppression.
   Produce immutable intent, confirmed origin suppression, fail-closed
   unknown-outcome handling and safe teardown. Reuse the production boundary
   gate, not TF2 ABI or offsets.
2. Connect that intent to Host/Join coordinator and native IPC: host-action parity, per-instance identity/ownership checks, sequence/dedup barriers, scheduled apply and correlated receipts. A timeout or ambiguous result halts admission without retry.
3. Populate real canonical snapshot domains and compare two instances at equal updates; then complete one company-bound road-transport loop and checkpoint recovery before broadening supported actions. Local hold/checkpoint evidence does not replace this comparison.

Licence attribution remains unchanged: no TF2 code was copied or adapted; its MIT notice must accompany any future copied/substantial source portions.
