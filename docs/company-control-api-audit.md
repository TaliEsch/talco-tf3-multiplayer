# Company control versus company-bound construction

## Exact-build follow-up — 28 September 2026

The installed TF3 40408 executable has SHA-256
`de1daad3a13f3b7e9f79903361bb43769cf4f15e59271a263aefe1f075f23ef2`.
Hash-pinned static disassembly narrowed `api.engine.util.getPlayer()` to a
provider-returned `GameState` signed dword at offset `+0x20c` (worker RVA
`0x24ed220`, read at `0x24ed2c8`). `GameState::Load` reads that value from
saved data (RVA `0x244c30`); `InitNewGame` initializes it (RVA `0x155630`);
`GameState::Replicate` copies it between snapshots (RVA `0x255de0`). Script
providers select one of two manager snapshots, whereas the GUI uses a
separate `MenuUI::SwitchToGameUI` provider. The offset is **not** a qualified
runtime setter. Writing a read snapshot or replacing the Lua getter could
leave simulation and stock UI disagreeing or be overwritten by replication.

The installed stock UI already has the desired ownership behavior:
`base/content/gui.zip!gui/entity_window/vehicle/vehicle.tl:377,395` gates
mutable vehicle controls through `isOwnedByPlayerOrNotOwned`, and
`gui/game_bar/game_bar.tl:220` reads the balance for `getPlayer()`. The current
Join diagnostic instead claims a second company while its stock UI remains on
the Host company (`src/cli.mjs`'s `stockUiCompanyEntity` and
`passiveJoinStop`). This cannot pass separate-company presentation.

Before any native mutation, identify the authoritative simulation snapshot,
the `GameState::Replicate` caller and GUI handoff, thread/lifetime, and all
relevant cached player IDs. Then qualify one held, disposable-game assignment
that leaves asset ownership and both wallets untouched. Stop if the active
state or any identity cache cannot be distinguished from a replica. This
follow-up is static evidence only; no TF3 company switch was performed.

The next static pass identified `CGame::Sync` (`0x11f650`) publishing a
completed state to the GUI before flipping the simulation snapshot index;
`CGame::RunGameSimLoop` then replicates the completed state into the next
write slot. That makes propagation through both snapshots plausible. However,
`UI::CGameUI::CGameUI` (`0x647860`) reads `GameState+0x20c` once during UI
construction and passes the value to multiple child constructors. Those
recipients may retain the old company even if a later held assignment updates
`getPlayer()`. The decisive remaining static check is their lifetime and
whether binding can happen before stock UI construction. Do not treat a
changed money display alone as proof that native tools changed company.

Further exact-build disassembly found retained company fields in three stock
tools built by `CGameUI`: `UI::ConstructionBuilder+0xa0`,
`UI::TrackModifier+0xa0`, and `UI::StreetBuilder+0xc0`. Their constructor
arguments come from the company value read when `CGameUI` is built.
`UI::CMenuUI::StartGame` also reads the selected company before constructing
`CGameUI`. A late held assignment is therefore unsuitable: construction tools
could remain bound to the old company even if `getPlayer()` and the money
display change. No declared stock UI rebuild API was found.

The next qualification candidate is the **loaded-game startup path after
`GameState::Load` and before other initialization, `CGame::StartGameSim` and
stock UI construction**. Static evidence places the call at RVA `0x32de7a`,
its return at `0x32de7f`, and the later `StartGameSim` call at `0x11dec8`. The startup
callback passes manager state slot 0 to `GameState::Load` and returns before
script initialization and simulation-thread startup. Script initialization
may still consume company identity, so binding after it would be too late.
At RVA `0x32de88`, the loaded-state pointer remains in nonvolatile R14
immediately before `xor r14d,r14d` (`45 33 f6`). This is a candidate for a
one-use, observation-only probe with exact-byte gating and owned-process
exception/teardown qualification. A delayed pointer dereference needs a
separate lifetime and synchronization proof. No native hook, setter or live
binding is approved by these observations. The existing post-Step hold is
too late for this candidate.

An isolated INT3 observer for this site was compiled and exercised only in an
owned-process fixture. Its real concurrent Stop/restoration test reproducibly
timed out after roughly 104 fixture calls (`WAIT_TIMEOUT=258`), even though
simple traps passed. A separate review found same-site breakpoint provenance
cannot be distinguished after teardown without exclusive lifetime ownership.
This candidate is **not** integrated or qualified for TF3. The next read-only
candidate is a dedicated one-hit hardware execution breakpoint at the same
exact-build site, with thread coverage, register restoration and detach tested
before any disposable-game observation. The older debugger action profiles
remain quarantined and are not evidence for this new profile.

The dedicated hardware-breakpoint observer passed its owned-process attach,
trap-forwarding, timeout and detach cases. On 28 September it attached read-only
to the installed TF3 40408 at the main menu, then observed one load of the
existing `tf3mp_disposable_43b49d368fbbd409ae2614ada7b0c757` save. Its
one hit at RVA `0x32de88` read `GameState+0x20c = 3141` through R14. Teardown
reported register restoration, drained events, detach and a live target. The
TF3 `stdout.txt` recorded the matching `Loading game from file` line in that
run. The
save entered the playable world with the stock balance shown, and TF3 was
closed normally. The source save remained 87,719,389 bytes with SHA-256
`ccbf4beb740e53323e06d20890fd029c8e174d3e85efb06801a8b4275c762fb5`.
This qualifies the **read location and timing for this one load**; no company
write, second-company UI, ownership change or multiplayer behavior was tested.
The bounded private record is `reports/company-load-observation-20260928/summary.json`.

An owned-process fixture now exercises one four-byte assignment at this trap
and checks after-trap consumers, adjacent canaries, simulated wallets and
owners. Its normal case and six injected fault cases pass with expected stage,
write count, journal contents and no surviving child; fault paths retain the
pending event and request owned-child termination. Storage flush failures are
simulated. These fixture results do not activate a TF3 writer. Before
a disposable-game write, the mutation profile still needs a fresh loaded-save
identity gate, target-company existence proof, durable one-use attempt record,
and an abort path that cannot resume a partial or unknown write.

One controlled disposable TF3 40408 run then exercised the new exact-build
assignment profile. It attached at the visible main menu, matched the source
save's fixed size/hash and one fresh TF3 `Loading game from file` line, and
stopped at RVA `0x32de88`. Its journal records one four-byte 3141-to-55652
write, readback, debug-register restoration and detach. The game bridge later
read selected company 55652 with known balance 0 at paused update 2992; the
stock Account display showed 0. A passive stock rail construction preview
reported `ownerCompany=55652`. No structure was placed, TF3 shut down
normally, and the source save hash stayed unchanged. This validates one
startup selection and one tool's captured company in a single game. It does
not establish foreign-vehicle UI, unchanged Host ownership and both wallets,
or two-game authority. The binder is still a one-save diagnostic and is not
integrated into Host/Join. The fixed attempt record is retained to prohibit
an automatic retry. The load gate's 13 owned-file cases, the write fixture's
seven owned-process cases, and the detached-abort helper's two cases passed;
these are offline checks, not TF3 evidence.

20 September 2026. Static read-only audit of the installed TF3 public declarations
and first-party content. No game launch, patching, native attachment or ownership
transfer. This narrows the implementation route; it is not a runtime pass.

All game paths below are relative to
`E:/Steam/steamapps/common/Transport Fever 3`.

## What exists

- `api/tealdef/api/type.d.tl:2471-2483` exposes `Context.new()` and
  `Context.player` as an entity.
- `api/tealdef/api/cmd.d.tl:953-962` exposes world-build factories taking a
  proposal and context. This allows a script-submitted action to specify its
  company before creation. Target ownership and actual debits still need native
  verification; changing context alone is not that verification.
- First-party `base/content/gui.zip!gui/entity_window/bridge_and_tunnel.tl:187-195`
  constructs a context, sets its player from `api.engine.util.getPlayer()`, and
  submits a world-build command. This is a direct-command precedent, not proof
  of a second-company UI selector.

## What was not found

- Public declarations expose `getPlayer()` at
  `api/tealdef/api/engine/util.d.tl:1021-1024`, but no inverse controlled-player
  setter or switch. This finding is scoped to the inspected public API, not a
  claim about undocumented engine internals.
- `api/tealdef/app.d.tl:45-55` and `StartGameParams` in
  `api/tealdef/api/type.d.tl:341-374` have no company-selection parameter.
- `ConstructionActionParam` in `base/tealdef/scripts/builtin.d.tl:1355-1384`
  has tool descriptors, preview strings and input maps, but no company/context
  field. Its `EdgeObjectBuilder` descriptor likewise has no declared owner.
- `ProposalEventData` at `api/tealdef/api/type.d.tl:2801-2805` carries proposal,
  data and result, not a mutable command context. Mission restriction handlers
  return allow/error information, not a replacement company-bound command.
- The `setPlayer(player : boolean)` in line-management utility declarations is
  a filtering/selection boolean, not an entity-valued controlled-player switch.
- `makeEntitySetPlayerCmd` is explicitly ownership transfer. It does not satisfy
  the requirement to create the asset for the intended company initially.

## Implementation consequence

Do not add a nominal company-selector button that merely changes displayed IDs
while native tools continue spending the original company's money. Do not mutate
the global `getPlayer` function or invent an undocumented startup parameter.

The supported construction candidate is the existing normal-placement capture
and reconstruction pipeline, followed by explicit target-company command context
and new-asset ownership. Preserve the captured road geometry/snapping and existing
asset owners. Qualify same-checkpoint replay first, then target-company execution
with actual owner/debit/funds evidence. The current local replay still deliberately
requires its captured/local company; this audit does not remove that guard.

Capturing an already-applied action and replaying it into another company is not
production routing: the original application must not also remain in that world.
The agreed reload-baseline experiment avoids that duplication for local proof.
Continuous native placement still needs a qualified submission/admission route;
an apply notification alone is not interception. Company-specific UI control and
construction are therefore open Phase 2 requirements, not completed by company
creation or by `Context.player` existing.
