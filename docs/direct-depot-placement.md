# Direct depot placement — implementation boundary

User-selected route: create a new depot for the second company directly. Do not
build for the original company and transfer it. Do not change the selected
company as a workaround. No shared-company mode.

## Implemented in this batch

`src/depot-placement.mjs` is an engine-independent validation contract, with eight
automated tests. It binds location, orientation, approved resource, original and
target companies, save identity, budget and expiry to a placement plan. A trusted
quote must describe exactly one construction and one depot, owned by and charged
to the target company, without removal, external network edits, collisions,
errors or warnings. Unknown balances and insufficient target funds are rejected.

A changed proposal hash or price invalidates confirmation. Result checking
requires newly created distinct construction/depot entities, correct ownership
on both, unchanged original balance and an exact target debit. Any ambiguous
post-submission result must be treated as unknown, not as permission to retry,
refund, transfer ownership or issue a second build.

These are validation functions, not an execution controller. The live helper
does not import them yet. There is no new launcher button or staged-mod change.
All 185 tests pass; no game was launched. Mock results are not runtime evidence.

## Installed API evidence (current audited build)

Read locally from the installed game's type definitions:

- `api/tealdef/api/type.d.tl`: `SimpleProposal.ConstructionEntity.playerEntity`
  explicitly specifies the construction owner. `Context.player` specifies a
  separate proposal context player. Both must target the second company.
- `api/tealdef/api/cmd.d.tl`: `makeWorldBuildProposalCmd` accepts a proposal and
  explicit context; `ignoreErrors` must remain false. Callback data exposes
  `resultProposalData` and `resultEntities` for checking outcomes.
- `api/tealdef/api/type.d.tl`: `ProposalData.costs`, collision data and error state
  can support price/safety checks. Do not infer correct charging from owner alone.
- `base/tealdef/scripts/builtin.d.tl`: `ConstructionBuilder` exposes resources,
  parameters and orientation, but no company field. `ProposalViewer` accepts a
  simple proposal and returns processed proposal/data through
  `onCreateProposalData`. It does not expose an explicit general player context.
- `api/tealdef/api/engine/util.d.tl`: `makeProposalData` accepts a processed
  `Proposal` and optional context, not a `SimpleProposal` in the documented type.
- The installed bridge/tunnel GUI uses `ProposalViewer` for preview and price.
  This demonstrates preview plumbing, not second-company cost attribution.

Therefore neither mutating a native builder preview nor a post-build event is
assumed to cancel/replace native placement safely. An after-build callback is
too late to prevent an original-company charge or duplicate construction.

## Required before enabling a live action

1. Implement a dedicated location/rotation preview using a verified depot
   resource and validated/default parameters. No arbitrary resource or Teal/Lua
   input from the network. Do not reuse an existing depot as the build target.
2. Process the proposal under the target context, inspect every generated child
   and side effect, and expose the actual target-company price before confirmation.
   Proposal hashes must cover normalized native data, not merely the user input.
3. Offer an explicitly confirmed, bounded test-company funding operation. The
   successful +/-1,000 accounting test restored its balance to zero and cannot
   finance a depot. Do not silently fund it or debit the original company.
4. Wire fixed-schema local IPC and a fresh engine-event handler, solo-host
   admission isolation and a saved attempt barrier written BEFORE submission.
   Recompute the proposal, recheck context/funds/price/expiry, then submit once.
   Async or missing callbacks leave an unknown outcome; no automatic retries.
5. Read both balances and resulting construction/depot ownership in that same
   engine event. Validate road connection separately before attempting purchases.
6. Extend the review allowlist only for the audited guarded command path, then
   rebuild/stage with a backup while the game is closed. Ask the user to run the
   disposable-save test; never launch the game automatically.

No live construction, funding, purchasing, ownership transfer or multiplayer
replication is enabled by this batch. In particular, cost semantics still need a
controlled runtime test despite the promising explicit-context API.
