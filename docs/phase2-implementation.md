# Phase 2 implementation status

## Current boundary

Latest source batch: depot construction now traverses the helper request, protected
GUI mailbox, strict engine event and correlated receipt. Its reviewed Lua adapter
is registered in mod source, not staged. Placement serialization accepts bounded
signed decimal coordinates without widening the generic userdata parser. Engine
admission requires explicit confirmation, the recorded second company, selected
original company, paused simulation and a fresh request. Failure persistence uses
the newest saved state so consumed mutation latches cannot be overwritten.

Funding and construction are still internal, fresh-helper-only entry points;
there is no guided funding-to-build-to-service session yet. Do not run acceptance
or another preview-only test against the existing launcher.

A new experimental service adapter creates a fresh target-company line between
two existing target-owned road stations, then assigns a target-owned road vehicle.
The shared fault remains latched across both commands. It checks actual identity,
owner, stop/terminal configuration and assignment, but does not establish movement,
income or expense attribution. Vehicle and service adapters remain unregistered.
Creating the two target-owned stops, their road connectivity, guided consent and
operating-accounting observation are remaining work, not manual-test-only gaps.

Reviewed adapter batch (20 September): the experimental depot executor now binds
session/action/consent correlation and preserves its one-attempt-per-save guard.
It checks new owner/resource/debit plus preservation of existing construction and
depot membership. This does not prove unchanged terrain or network state. Native
rejection is still unknown, never automatically an insufficient-funds pass.

experimental/native-vehicle-command.lua now prepares a one-part road purchase
for a target-owned depot. First-party makePart/HandleVehicleChanges informed load
configuration, auto-load flags and purchase timestamp; result checks require a new
matching vehicle, target owner, unchanged original balance and positive target debit
without overdraft. That debit is diagnostic evidence, not an independently verified
new-buy price. It is unregistered; native behavior and availability remain unqualified.

Funding and both experimental adapters share phase2CompanyFault: persisted before
mutation and cleared only after verified postconditions. CompanyTransaction also
serializes different action types and retains a checkpoint/company-wide barrier
after unknown execution or helper crash. A fresh action ID cannot bypass it.
JSON conversion cannot silently change the data that was explicitly confirmed.

Funding now has a connected source path through helper, regular GUI mailbox,
engine event and correlated receipt. The engine rechecks paused state and recorded
company identity, persists its one-attempt latch before credit, and requires exact
target credit with unchanged original balance. No automatic debit/compensation.
The helper ignores unrelated receipts and treats timeout/close as terminal unknown.
This is not exposed in the launcher or staged; integrated confirmation, stage
sequencing, native execution and the remaining construction/service flow are pending.

**Current development route after user clarification:** remote players do not
need custom pricing UI. The engine-side native command factory now constructs a
fresh SimpleProposal with explicit target owner/Context.player and native validation
enabled. Its reviewed copy is now registered in source, not the deployed mod.
src/native-depot-result.mjs verifies actual post-command ownership and debit without
requiring a GUI quote. The experimental executor now persists a one-attempt latch
before sending, binds consent to the exact placement/company, and checks actual
new construction/depot ownership and debit. Missing/late callbacks and unverifiable
rejections remain unknown. Source identity/consent transport is connected; guided
funding, purchase/service and insufficient-funds qualification remain outstanding.
Source checks do not execute Lua or qualify native semantics.
The source-only preview now projects scalar display estimates during the first-party
callback, never retaining native callback data. This is not authoritative pricing
and is not staged. No repeat preview-only test is requested.

### Historical containment and superseded custom-quote prerequisite

**Current: pricing disabled after native crash (20 September 08:16 UTC).**
The retained-reference experiment crashed on preview. The native crash report
5484f95a-e9cf-4ce2-ba72-646eaa9b11c7_2007.json has no message or stack trace;
a callback lifetime problem is suspected, not proven. Callback arguments are
now entirely ignored: no read, clone or retained native reference. The existing
pricing implementation is unreachable because processed remains nil. Ghost
rendering remains available, with PRICING_DISABLED_NATIVE_CRASH shown explicitly.
Do not request further user pricing tests until supported ownership/lifetime or
an alternative conversion path is established. Building and funding stay off.

### Previous unsuccessful pricing experiment

20 September: screenshot confirms callback delivery but PROPOSAL_COPY_FAILED.
Removed the unnecessary native clone from the read-only callback. The callback
retains its Lua proposal reference locally; all inspection and target-context
pricing remain in the protected engine reader. Missing and invalid callback
arguments now have separate failure codes and never fall back to viewer costs.
The old generic error cannot establish whether clone itself failed or its input
was absent. Runtime success is not yet established; no native lifetime guarantee
or verified target-company quote is claimed from source checks.

User confirmed the native placement ghost renders without crashing after the
seed fix. This verifies rendering only, not quoting, construction or spending.
The panel remained on Preparing. The preview now supplies a placement-specific
proposalId, following the installed bridge_and_tunnel.tl example; missing native
callbacks time out after 30 observation samples, failed proposal copies report
PROPOSAL_COPY_FAILED, and quote stages have explicit bounded diagnostic codes.
Whether proposalId resolves delivery remains unverified. No build/funding action
is enabled until the target-company quote is established.

**Missing construction seed repair awaiting runtime confirmation:** subsequent
preview reached native proposal processing but asserted `params.GetPtr("seed")`.
The copied selectable resource defaults did not include the engine construction
seed. Installed constructionutil.lua asserts params.seed; construction.script.tl
also reads constrParams.seed. The read-only preview now supplies seed=1 explicitly
after resource defaults, without global RNG changes. Panel padding is increased
to 28 and vertical spacing to 12. Native rendering still needs verification.

**World-preview context repair awaiting runtime confirmation:** the window now
opens, but Preview last map position triggered the native assertion
`!IsTransformWithContext(node.recipeId)` under TalCoDepotPreview/BoxLayout.
ProposalViewer was incorrectly appended as a layout child. Installed first-party
bridge_and_tunnel.tl uses ProposalViewer under ActionDescriptor via setActionFn.
The preview now owns a public tool-stack action, removes it on unmount, and keeps
only quote text in the panel layout. Scoped panel padding and a compact bottom-bar
button address the reported spacing/clipping. This remains read-only; automated
source checks do not execute TF3's native renderer.

Phase 1's controlled single-game run passed at 15:45 UTC on 19 September 2026:
report `local-batch-9bac565c-2596-4495-851f-8b52eb6d1566`. All four update errors
were zero, observed release speeds were 2/4/1/1, and terminal halt was confirmed.
This is not two-game evidence. Preserve a backup when staging Phase 2 work.

Phase 2 is **not ready for its final manual test**. The live building, purchase,
line setup and service-monitoring adapter and full consolidated GUI are outstanding.
Do not ask for another runtime run of the existing Phase 1 button to test Phase 2.

## Implemented authoritative contracts

`src/depot-placement.mjs` already validates an owner/payer-bound depot plan,
quote, fresh confirmation and post-construction balances/entities.

`src/company-service.mjs` adds:

- Explicit bounded test funding, tied to the current company/checkpoint/balances.
  The target balance must increase by the confirmed amount and the original
  balance must remain unchanged in the transaction callback.
- One road vehicle from an available configuration and connected target-owned
  depot. Confirmation binds company, checkpoint, depot, configuration digest and
  price. Changed price/configuration/depot requires fresh confirmation.
- A new vehicle receipt with correct owner/depot/configuration and exact target
  debit, without an original-company debit. Unknown/partial results do not verify.
- Two-stop road service assignment requiring both vehicle and line ownership.
- Service proof requiring both visited stops and positive expense and revenue
  attributable to that vehicle/company. A net balance change alone is insufficient.

These functions consume **trusted engine evidence**, not client assertions. They
do not send game commands, grant network authority, or replace engine-side
rechecks and persistent consume-before-mutation fences. A future adapter must
enforce those fences independently. Automated tests use synthetic data only.

`src/company-transaction.mjs` implements the local diagnostic transaction shell:
explicit confirmation digest, a durable exclusive claim before preparation,
fresh confirmation comparison, bounded execution wait and verified receipt.
Concurrent calls and helper restarts cannot repeat the same company/checkpoint/
action. Timeout stays unknown even if a late receipt arrives. A timed-out
preparation cannot subsequently submit a command. Claims deliberately remain
consumed on rejection too; this conservative disposable-test shell is not a
general repeated-purchase API. It is not yet connected to the live adapter.
The independent save-persistent engine guard remains mandatory.

## Installed public API findings

### Read-only preview candidate

`mod/content/tf3mp_depot_preview.script.lua` implements native SimpleProposal
creation and a tool-action-owned ProposalViewer with a separate quote layout. It resolves the exact
constructionRep name instead of treating an archive entry as a runtime identity,
uses the target company as construction owner, clones the processed preview
locally, and requests explicit-context repricing through an engine-read hook.
It reports quote/balances or unavailable; it never emits a game command, grants
funding, serializes native userdata, or enables building. Closing the component
invalidates late callbacks. Changed placement IDs discard the previous native
preview before creating another.

Launcher source 0.6.23 adds **Debug → Advanced — individual diagnostics → Phase 2: depot preview**.
The helper requests a correlated read-only company inspection before enabling
the in-game tools. Remote admission and other diagnostics are unavailable until
that helper stops. The in-game controls select the last terrain position, rotate
90 degrees or clear the preview. The bottom bar contains only **Company tools**;
click it to open a separate movable/closable window containing all instructions,
controls and quote details. Missing/mismatched/stale helper acknowledgements
hide the tools and discard the preview. No company creation, funding or building
is performed. Both mod source and launcher must be updated together.

File-bridge integration tests exercise valid/missing company evidence, request
identity, diagnostic exclusion and close cleanup. GUI regression tests are
structural source checks, **not Lua/GUI execution**.
Native Proposal access across GUI/engine-read callbacks, default depot parameters,
road connection/slot behavior and target-context pricing remain runtime-unverified.
Even a successful preview will not establish atomic execution-time validation.
The helper now accepts namespace-qualified resource syntax while continuing to
reject traversal, filesystem drives, alternate extensions and URL-like paths.
Repository existence and supported-depot identity are separate adapter checks.

### Bounded preview check (not the final Phase 2 test)

After the matching launcher/mod batch is built and staged, load the disposable
save containing the already-created test company and start a fresh solo Host.
Open the preview action under Debug's specialist checks. In game, click
**Company tools** on the bottom bar. In its separate window, point at empty
ground near a road, then click **Preview last map position**. Rotate or clear it.
Expected: a read-only ghost and either target-company cost/balance or a clear
unavailable state. No depot, vehicle or journal entry should be created. Stop
the helper to hide the tools. Do not rerun Phase 1 for this feature.

Read from the locally installed audited game; no binary patching or injection:

| Requirement | Public API evidence | Remaining integration |
|---|---|---|
| Direct construction ownership | `api/tealdef/api/type.d.tl`: `SimpleProposal.ConstructionEntity.playerEntity`; `Context.player` | Both must use the second company from creation; no ownership transfer. |
| Preview processing | `base/tealdef/scripts/builtin.d.tl`: `ProposalViewerParam.simpleProposal`; `onCreateProposalData(ProposalData, Proposal)` | Obtain the processed proposal, inspect side effects and bind the displayed quote to it. |
| Explicit-context quote | `api/tealdef/api/engine/util.d.tl`: `proposal.makeProposalData(Proposal, Context?)` | It documents processed `Proposal`, not `SimpleProposal`. Do not assume an unlisted overload. |
| Build | `api/tealdef/api/cmd.d.tl`: `makeWorldBuildProposalCmd` has SimpleProposal and Proposal overloads with context | Fresh price/owner/funds checks, one attempt, callback/result entity inspection. |
| Vehicle purchase | Same file: `makeVehicleBuyCmd(playerEntity, depotEntity, TransportVehicleConfig)` and callback `resultVehicleEntity` | Verified configuration/price/availability, owner and debit readback. |
| Line creation | Same file: `makeLineCreateCmd(name, color, player, Line)` | Two valid reachable stops, original ownership and balances untouched during mutation. |
| Assignment | Same file: `makeVehicleSetLineCmd(vehicle, line, stopIndex)` | Recheck both owners immediately before execution and read assignment afterward. |
| Operating accounting | `engine/util.d.tl`: `finance.calculateBalance`, account charts and company income helpers | Separate vehicle expenses and income over a bounded interval, not merely net company balance. |

The first-party `gui/entity_window/bridge_and_tunnel.tl` inside `base/content/gui.zip`
demonstrates ProposalViewer and an explicit-context build, but uses the selected
player. It is reference evidence, not proof of second-company attribution.
The road depot source is in `base/content/depots/road.zip`, entry
`road/road_depot/road_depot.con.lua`. Do not publish or copy proprietary resources
into our distribution; reference installed resources through supported APIs.

The key next implementation is the **processed preview → engine revalidation**
boundary. The definitions provide a plausible supported GUI path, but do not
establish an engine-side SimpleProposal-to-Proposal conversion or safe transport
of a native Proposal through scripting events. Resolve this explicitly; never
cast a SimpleProposal and claim it has been priced under the target context.

## Consolidated test delivery still required (current)

1. Site/orientation selection and explicit target company; no custom quote prerequisite.
2. Separate explicit funding confirmation (bounded amount) and build confirmation.
3. Fresh owner/payer/native-funds checks and one depot construction attempt, followed by actual debit verification.
4. A connected depot, vehicle purchase, target-owned line and checked assignment.
5. Company-specific balance/asset display and a bounded operating observation.
6. One report distinguishing implemented, local-game-verified and not verified.

Do not silently fund or borrow from the original company. Original balances must
be unchanged within each construction/purchase callback, but may legitimately
change while its existing service operates during the longer observation period.
Keep unknown operations terminal, without automatic refund, rebuild or repurchase.
