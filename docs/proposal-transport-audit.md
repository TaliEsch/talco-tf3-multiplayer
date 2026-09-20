# Proposal transport audit

20 September 2026. This is a read-only audit of the installed declarations at
`E:/Steam/steamapps/common/Transport Fever 3` and the already-recorded normal
roadside-stop observation. It does not establish a replay path, cancellation
point, or company-bound construction execution.

## What the observed native event contains

The locally game-verified `streetTerminalBuilder` run delivered eight `create`
and one `apply` event. Every event had an outer Lua table; slots 1 and 2 were
`userdata`; create slot 3 was `nil` and apply slot 3 was a table. The observer
only called `type` on the three positional slots and did not retain or traverse
them: `mod/content/tf3mp_status.script.tl:107-151`. The reported result and its
limits are recorded at `docs/completion-audit.md:5-20`.

This agrees with the installed public event shape:

- `api/tealdef/api/type.d.tl:2801-2806` declares `ProposalEventData` as
  `proposal: Proposal`, `data: ProposalData`, and `result: {Engine.Entity}`.
- `api/tealdef/api/type.d.tl:2486-2489` explicitly marks `Proposal` as
  `userdata`. Thus the live slot types are not evidence that either slot is a
  serializable Lua table.
- The stock mission source trace independently says that its handler reads
  positional `param[1]`, `param[2]`, and `param[3]` as Proposal, ProposalData,
  and result entities respectively:
  `docs/native-placement-capture.md:30-34`. This is useful confirmation of the
  event layout, not a transport contract.

## Declared in-process representation and factories

There is a rich *in-engine* representation. It is sufficient to describe what
must survive an eventual encoding; it is not a declared wire format.

- `Context.new()` and `Context.player` are declared at
  `api/tealdef/api/type.d.tl:2471-2484`. `player` is the available explicit
  company/payer context. It is not contained in `ProposalEventData`, so capture
  must bind it from authenticated/player state or another qualified source; it
  cannot be inferred from the observed three event slots.
- `Proposal.new()` and `Proposal.clone(Proposal)` are at
  `api/tealdef/api/type.d.tl:2653-2654`. In the declarations searched, clone is
  the only Proposal-specific copy factory found. It returns a `Proposal`, and no
  declaration says it turns into portable Lua data.
- The native representation includes removals, negative-new-entity mapping,
  street nodes/segments/edge objects, construction additions, transforms,
  resource names, and construction owner entities:
  `api/tealdef/api/type.d.tl:2491-2561,2631-2673`. It also contains native
  vectors, components, metadata, and tables (`:2520-2525`, `:2576-2581`), so
  copying only scalars visible in the observer would not be complete. In
  particular, terrain's `GridVec2f` has public constructors, dimensions/origin,
  and `at` accessors (`api/tealdef/api/type.d.tl:896-930`), but that does not by
  itself establish an action-complete terrain encoding or a need to treat all
  terrain as opaque.
- `ProposalData` exposes processed collision/error data, generated construction
  data, terrain preview data, transport-network mapping, and `costs`:
  `api/tealdef/api/type.d.tl:2687-2753`. It is an evaluator/result view, not a
  documented inverse factory for `Proposal`.
- The public, script-constructible alternative is `SimpleProposal.new()` plus
  `SimpleProposal.ConstructionEntity.new()` and `SimpleStreetProposal.new()`.
  It supports construction params/owner and streets/edge objects, including
  street terminals; its documented negative IDs and old-to-new maps are at
  `api/tealdef/api/type.d.tl:2755-2799,2808-2853`. This is a separate recipe
  representation. No declaration supplies `Proposal -> SimpleProposal`, or a
  complete builder-event-to-SimpleProposal conversion.

## Declared evaluation and execution boundary

- `api.engine.util.proposal.makeProposalData(proposal, context?)` returns a
  `ProposalData` (`api/tealdef/api/engine/util.d.tl:923-925`). Its direction is
  proposal to processed data; no inverse appears in the installed declarations.
- `cmd.makeWorldBuildProposalCmd` accepts either an already-live `Proposal` or a
  newly constructed `SimpleProposal`, plus context, and produces an opaque
  `Command<WorldBuildProposalCommandData>`:
  `api/tealdef/api/cmd.d.tl:953-962`. The command data retains `proposal`,
  `context`, `resultProposalData`, and post-run `resultEntities` at
  `api/tealdef/api/cmd.d.tl:509-523`.
- `cmd.sendCommand` returns callback data, success, and entity/revision pairs
  only after execution (`api/tealdef/api/cmd.d.tl:588-600`); GUI calls execute
  on a later simulation step (`:2-10`). This supports correlated *local*
  receipts, but not sending a command object to another process.

## Serialization finding

Additional first-party source check: `base/content/base.zip!base/serialize.lua`
129-156 does contain generic userdata introspection via metatable/member access.
This qualifies the earlier declaration-only search: there is a diagnostic
serializer, not an identified lossless Proposal wire codec. It can emit
`[truncated]`, fallback `tostring(userdata)` or `<function>` markers, and supplies
no inverse constructor. Its recursive introspection is not used by this mod.
The explicit bounded copied-field route remains necessary unless a complete
supported round-trip contract is established.

The installed declarations expose these general serialize/deserialize operations:
`app.saveUserdata(directory, fileName, table)` and
`app.loadUserdata(...) : table`, at `api/tealdef/app.d.tl:137-157`. They are
explicitly table-based custom userdata-file APIs. This audit found no declared
Proposal/ProposalData/Command serializer, decoder, byte representation, or
clone-to-table operation in the installed `api/tealdef` files. There is also no
factory that consumes a *serialized* command representation: the available
world-build factory consumes live `Proposal` or `SimpleProposal` objects. The
declaration scan found only this userdata-table serialization and
`Proposal.clone`.

Consequently, putting either live event userdata into the existing file IPC is
unsupported. Even an in-process clone would omit the action's payer unless its
`Context.player` were separately captured and revalidated. A custom, bounded
codec might still be possible, but only after it has an exact mapping for every
field needed by this action family and a separately qualified execution context.
Until then, rebuilding a `SimpleProposal` from selected scalars is a new action
recipe, not a proven replay of stock snapping/collision decisions.

## Specific gap and next implementation

The present gate is not “more proposal fields needed.” It is a concrete missing
conversion and boundary:

```
streetTerminalBuilder event
  -> [Proposal userdata, ProposalData userdata, result table]
  -> no identified built-in Lua/data serializer or decoder
  -> no identified built-in Proposal -> SimpleProposal converter
  -> no qualified pre-execution hold/cancel point
  -> host cannot safely transmit/replay this stock action
```

Do one bounded, supported-API qualification before implementing transport:

1. In a disposable save, add a temporary passive diagnostic that is allowed to
   inspect a *fixed, documented scalar subset* of the event only if the runtime
   permits it: proposal resource/owner/entity references, negative-ID maps,
   `ProposalData.errorState`, `costs`, and result entity/revision identities.
   It must emit copied scalars only, never userdata, native vectors, components,
   params tables, or raw event data. If any field cannot be read as an ordinary
   scalar/table, record that exact field as unavailable and stop.
2. If—and only if—the field audit supplies an exact action-family mapping, make
   an **offline** bounded codec specification for copied scalar/table values and
   list every unrepresentable field. Do not evaluate a proposal, call engine
   utilities, or construct a `SimpleProposal` from the GUI callback; that
   context is known to have restricted API access. A later engine-side,
   separately verified context may qualify evaluation of an allowlisted recipe,
   but that is a distinct test and not an automatic consequence of capture.
3. Independently qualify whether the mission-style restriction result is a true
   pre-execution defer/cancel boundary. Existing apply delivery and result slots
   are post/outcome evidence, not proof that a host can wait for authorization.
   If either the conversion or hold boundary is unavailable, retain this as the
   specific supported-API gap and continue the separately authorized opt-in
   native feasibility investigation; do not serialize userdata or enable stock
   construction synchronization.
