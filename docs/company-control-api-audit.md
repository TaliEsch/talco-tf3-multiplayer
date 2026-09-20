# Company control versus company-bound construction

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
