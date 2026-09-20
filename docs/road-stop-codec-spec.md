# Road-stop proposal capture and replay qualification

20 September 2026. The registered diagnostic captures the normal `streetTerminalBuilder` roadside-stop proposal. Capture does not authorize remote execution. Native reconstruction and replay remain unqualified.

## Next gate: record, reload, replay

Use the user's proposed single-machine experiment. Begin from an identified
disposable pre-placement checkpoint, record one normal valid placement, then
reload that exact checkpoint before explicitly replaying the captured apply
proposal once. Compare construction, reference mapping, ownership and actual
company debit against the original action. Do not replay into the world where
the original action already exists. Preview and cancellation are not commits.

This separates reconstruction qualification from live interception. Match the
game/mod builds and resources, validate existing entity references after reload,
and record starting balances/state. Timing and spontaneous simulation changes
must be controlled or reported; reloading alone does not prove determinism.
Never auto-load, auto-replay or retry an uncertain construction. A successful
record/reload/replay test does not establish network ordering, concurrent-action
safety, pre-spend admission or multi-game synchronization.

## Evidence and non-claim

### Reconstruction candidate and checkpoint record

`experimental/native-road-stop-rebuild.lua` reconstructs the copied road-stop
subset using supplied public constructors. The caller must supply `Proposal`,
`Proposal.NodeAndEntity`, `Proposal.SegmentAndEntity`, `Vec3f`, `Vec4f`, `Mat4f`,
`GridVec2f`, enum groups and `Engine.Component` constructors. This is not a remote
payload validator; inputs must first pass the strict copied schema. Optional
JSON null components become absent Lua fields. Native exceptions export only a
fixed unqualified error, never a raw exception.

The installed declarations provide constructors for nodes/segments/components,
but `ModelInstance`, `Proposal.EdgeObject`, `StreetProposal` and `Terrain` expose
structural fields without constructors. The candidate assigns complete structural
records; actual native setter conversion still needs qualification. It never
calls proposal evaluation, command submission or world APIs and is not registered.
Executable tests rebuild and re-capture all fixture fields through the actual Lua
collector and JS codec. That does not establish TF3-native reconstruction.

Root binding audit additionally found that declared `new` methods are not enough
to establish a usable runtime path. `Type.enum` exposes the common enum groups;
`PrecedencePreference` is declared but absent from that published group list.
`GridVec2f` is declared but absent from the `Type` namespace list. Engine component
constructors are nested declarations whose usable runtime paths still need stock
source or live confirmation. Do not guess these bindings or numeric enum values.
The capture adapter now uses `api.type.enum` plus `api.type.Mat4f` correctly and
returns unsupported if a required group is unavailable. Fixture-supplied bindings
do not prove those missing runtime capabilities exist.

Stock-source refinement: `base/content/mission.zip` entries
`mission/tasks/auto_builder/track_builder.tl:10-47` and
`mission/tasks/auto_builder/electrify.tl:9-25` demonstrate initialized node/segment
`.comp` records and assigning a live BaseEdge into a segment wrapper. The candidate
now prefers those initialized records. This removes the need for separate
BaseNode/BaseEdge constructors on that path; it does not establish street-edge,
terrain or full Proposal reconstruction and does not authorize copying live
world components without checkpoint/reference validation.

`src/road-stop-replay-case.mjs` creates/checks an offline apply-only case bound to
the pre-placement save SHA-256, game SHA-256, mod manifest and stop owner. It
preserves road ownership rather than silently rewriting it. Digest validation
detects accidental modification, not a malicious party who can recompute hashes.
File identity matching is not loaded-world verification or execution authority;
both remain explicitly false. No checkpoint load, replay or retry is automatic.

Declaration evidence: `api/tealdef/api/type.d.tl` lines 565–590 (Vec3f), 649–668
(Vec4f), 741–757 (Mat4f columns), 897–930 (empty GridVec2f), 2230–2240
(ModelInstance), 2488–2674 (Proposal records/factories); `api/tealdef/api/engine.d.tl`
99–163 (road components), 352–364 (emitter), 855–860 (owner). These are the locally
installed public declarations, not evidence of a completed native round trip.

### Offline implementation

`src/road-stop-capture.mjs` now parses bounded JSON into an explicit copied-value
schema and produces canonical JSON plus a SHA-256 digest. It covers street
nodes/segments/components, one stop object, reference maps and explicitly empty
terrain. Nonempty construction additions, node-configuration edits and terrain
grids are rejected, not silently removed. Numeric model references are retained
for capture analysis only; resource identity and entity-reference resolution
remain unqualified. No company payer, final-click identity or execution authority
is inferred from a valid capture.

`node tools/check-road-stop-capture.mjs <capture.json>` checks an offline file and
prints only its digest, counts and explicit false verification/authorization
flags. It does not read live Proposal userdata or send game commands. Its success
means the copied JSON fits this schema, not that TF3 has exported or reconstructed
it. Revision 7 adds copied capture files alongside the summary facts; do not feed
the summary facts into this checker as a complete proposal.

Next integration: bounded native extraction and enum/matrix conversion, followed
by engine-side reconstruction qualification against the same normalized data.
Keep the direct Proposal constructor route open; no SimpleProposal conversion is
assumed. Admission before native spending is still a separate required gate.

The extraction module is registered at `mod/content/tf3mp_road_capture.lua`.
It copies fixed declared fields, maps enums by explicit constant equality, reads
matrix columns through the documented 1..4 accessor, and returns bounded JSON
or a fixed unsupported-field label. The observer attempts one capture per stage
within its bounded event window. Executable
Lua fixture tests round-trip its output through the JS canonicalizer; they do
not establish TF3 enum bindings, GUI permission to read matrix columns, native
data completeness, capture freshness or engine reconstruction.

`src/road-stop-capture-envelope.mjs` defines the separate diagnostic userdata
envelope (revision 7, stage/sequence, hex-encoded JSON). The checker accepts it
with `--userdata`. This parser never evaluates Lua; arbitrary fields, duplicate
keys, executable trailing text and invalid UTF-8 are rejected. The gameplay IPC
parser retains its original 4096-byte limit. A protected regular GUI step writes
at most one file per stage, independently of helper availability. Publication
errors disable only the diagnostic writer; they do not retry or submit anything.
Metadata alone never establishes capture freshness or execution rights.

Revision 6 observed nine normal-builder events: each selected proposal exposed `proposal.proposal.addedSegments = 1`, `removedSegments = 1`, and `edgeObjectsToAdd = 1`; `addedNodes`, `removedNodes`, `proposal.toAdd`, `proposal.toRemove`, and apply `result` had count zero. It also read edge-object owner `3141`, `ProposalData.costs = 67500`, and `ProposalData.errorState.critical = false`. See `C:/Users/olihf/Downloads/Temp/tf3-multiplayer-prototype/docs/completion-audit.md:5-20` and the bounded collector at `C:/Users/olihf/Downloads/Temp/tf3-multiplayer-prototype/mod/content/tf3mp_proposal_facts.lua:44-104`.

Those are selected facts, **not** proof that the three non-empty records have the same contents between runs, nor that every empty list is semantically irrelevant. Replacement requires both the removed existing road and the added road; the count says nothing about IDs, components, geometry, old/new maps, edge-object placement/model, terrain, or independently required payer context. `ProposalEventData` provides only a live `Proposal`, `ProposalData`, and result entity list; it does not include a `Context` (`E:/Steam/steamapps/common/Transport Fever 3/api/tealdef/api/type.d.tl:2801-2806`).

The event's outer slots were live userdata, not a documented table transport: `Proposal` is declared `userdata` at `E:/Steam/steamapps/common/Transport Fever 3/api/tealdef/api/type.d.tl:2486-2489`. The source trace establishes neither a pre-spend hold point nor replay authority; see `docs/native-placement-capture.md:17-36,80-117` and `docs/proposal-transport-audit.md:88-105`.

## Required lossless source coverage

This is the minimum complete *public declaration* coverage for serializing a processed `Proposal`. It is a checklist, not evidence that every runtime value is readable or that a decoder can reconstruct it. Native-vector mirror fields must not be independently encoded: they duplicate their table field and need an equivalence check if both are observable.

| Source path | Required value coverage | Observed in rev6 | Portable decoding status |
| --- | --- | --- | --- |
| `Proposal.proposal.addedNodes` / `removedNodes` | Every `NodeAndEntity`: entity ID and complete `Engine.Component.BaseNode`; removed records retain identity and declared record data. | counts 0 only | No `SimpleProposal` inverse; `SimpleStreetProposal.nodesToAdd/nodesToRemove` is a separate recipe shape. |
| `Proposal.proposal.addedSegments` / `removedSegments` | Every `SegmentAndEntity`: entity ID, `BaseEdge`, type, `BaseEdgeStreet`, optional `EmissionEmitter`, optional `PlayerOwned`. `BaseEdge` includes endpoint IDs, positions/tangents, road template/style, lane config(s), objects and decorations. | counts 1 / 1 only | No declared Proposal-to-Simple conversion. A recipe needs exact components plus old/new identities. |
| `Proposal.proposal.edgeObjectsToAdd` | Result entity, category, full `ModelInstance` (model ID, `transf0`, `transf`, transformator), owner, side. | count 1; owner 3141 | Simple edge object instead requires negative added-edge ID, normalized edge parameter, one-way, side, resource model, owner, name. No public mapping. |
| `Proposal.proposal.new2oldEdgeObjects` / `old2newEdgeObjects` | Every map key/value and canonical encoding of entity lists. | not read | Required for replacement/attachment relationships; no observed mapping. |
| `Proposal.proposal.nodeConfigsToAdd` / `nodeConfigsToRemove` | Each configuration entity and complete `BaseNodeConfig`, including lane connections/crosswalks; every removed entity ID. | not read | Recipe lists exist but no conversion/capture evidence. |
| `Proposal.toRemove`, `Proposal.old2new` | Every globally removed entity and old-to-new index. | removals count 0; map not read | Recipe field exists, but index binding must be preserved; no capture. |
| `Proposal.toAdd` | Each `ConstructionEntity`: resource, cargo flag, `ConstructionDesc`, generated `Construction` (subconstructions/models/metadata/station/colliders, frozen/station/depot/etc. entities, persistent metadata, params), transform, owner. | count 0 only | Simple construction accepts file/params/transform/name/owner/autofill, not generated construction/description. |
| `Proposal.terrain.baseHeightMod` | Grid origin, dimensions, and every `Vec2f` cell in stable order. | not read | Grid constructors/accessors exist, but no callback-read or action-complete reconstruction evidence. |
| Execution context (outside proposal) | `Context.player` payer, context flags, refundable entity/revision pairs, authenticated request/company binding, current world revisions. | owner is not payer; context absent | Must be separately supplied and revalidated immediately before execution. |

Declaration anchors: outer `Proposal` graph is `E:/Steam/steamapps/common/Transport Fever 3/api/tealdef/api/type.d.tl:2491-2673`; `BaseEdge`/`BaseNode` are `E:/Steam/steamapps/common/Transport Fever 3/api/tealdef/api/engine.d.tl:97-163`; `ModelInstance` is `.../api/type.d.tl:2230-2240`; `Context` is `.../api/type.d.tl:2471-2484`; terrain grid shape is `.../api/type.d.tl:896-930`.

## Factory map and hard gaps

| Factory / operation | Declared input and use | What it does not establish |
| --- | --- | --- |
| `Proposal.new`, `Proposal.clone` | Live copy at `.../api/type.d.tl:2653-2654`. | No table/byte export, safe cross-callback retention, or `SimpleProposal` conversion. Clone is not a wire codec. |
| `SimpleProposal.new`, `SimpleProposal.ConstructionEntity.new`, `SimpleStreetProposal.new`, `SimpleStreetProposal.EdgeObject.new` | New recipe with construction owner/street edits (`.../api/type.d.tl:2755-2853`). | No factory maps processed components, model instance, edge-object relationships, terrain, generated construction, or native snap result to this recipe. |
| `api.engine.util.proposal.makeProposalData` | Evaluates an already-live `Proposal` with optional context (`.../api/engine/util.d.tl:924-925`). | Proposal-to-data only; not data-to-Proposal or Simple-to-Proposal. Do not call it in GUI capture. |
| `cmd.makeWorldBuildProposalCmd` | Accepts live `Proposal` or fresh `SimpleProposal`, context, error/player flags (`.../api/cmd.d.tl:953-962`). | Submission only; not a decoder and can fail. |
| `cmd.sendCommand` | Returns success and entity/revision pairs after execution (`.../api/cmd.d.tl:588-600`; GUI later-step at `:2-10`). | Local receipt is not cross-process transport, interception, or equivalent replay. |

`ProposalData` is evaluation data, not a proposal source: collision data, generated construction data, parallel strips, terrain preview, transport mapping, errors and cost are declared at `E:/Steam/steamapps/common/Transport Fever 3/api/tealdef/api/type.d.tl:2687-2753`. No declared `Proposal`/`ProposalData`/`Command` serializer, byte decoder, or serialized world-build factory was found. The declared persistence API is table-based, not a Proposal codec, as recorded in `docs/proposal-transport-audit.md:78-93`.

Do not mistake `base/tealdef/scripts/construction/construction_util_serialized.d.tl` for an exception: its header says it defines plain Lua resource-script tables read by C++ and must not reference C++ userdata (`E:/Steam/steamapps/common/Transport Fever 3/base/tealdef/scripts/construction/construction_util_serialized.d.tl:3-6`). It is not a `Proposal` transport contract.

## Bounded codec design (only after every gate passes)

1. Versioned envelope: protocol/mod/game declaration fingerprints, action family, nonce, source entity/revisions, canonical company identity, payer context, and canonical payload digest.
2. Explicit schemas for every row above, using typed primitive encodings for entity IDs/revisions, resources, booleans, finite numbers, vectors/matrices, finite arrays/maps. Construction params need a discovered per-resource schema; arbitrary Lua tables, functions, userdata, native vectors and implicit defaults are forbidden.
3. Canonical ordering: semantic array order; maps sorted by typed key; preserve negative IDs and every map/index relationship. Encode no pointer, callback reference, object identity, or `*_native` duplicate.
4. Qualify reconstruction into a fresh `Proposal` using its declared constructor and writable members first; a `SimpleProposal` conversion is an alternative only if it preserves the native action exactly. Use a fresh authenticated `Context` in the engine context. Recompute native data, compare a complete normalized action digest, then revalidate ownership, payer, funds and entity revisions immediately before one command attempt. Constructor availability alone does not prove all nested members can be reconstructed.
5. Treat `costs`, error state, result entity/revision pairs and actual debit as nonce/digest-correlated receipts, not payload substitutes. Timeout, mismatch, duplicate or unknown effect permanently latches the request; never retry or compensate.

There is no fallback that serializes userdata or rebuilds a proposal from rev6 counts/cost/owner. Any missing field, type, resource-parameter schema, reference, or digest mismatch is `ROAD_STOP_CODEC_UNSUPPORTED` and leaves native construction synchronization disabled.

## Precommit gates

Offline codec implementation and passive capture qualification can proceed now. Do not enable gameplay replay until these gates are evidenced on a disposable save and reviewed against the installed build:

- A synchronous passive bounded audit reads every non-duplicate row above for representative curb-stop/terminal variants: actual components, edge-object model/placement, maps, IDs, terrain and context. It emits copied primitives only; no retain/copy/mutate/evaluate/command call in the GUI event.
- A declared tested decode route reconstructs every captured field into a fresh allowlisted proposal. No guessed defaults, omitted empty field, lossy resource/model mapping, or `ProposalData`-as-inverse shortcut.
- Native recomputation under authenticated target payer produces an exactly equal canonical normalized proposal (references and ownership included), accepted error state, expected cost, current funds. Edge-object/construction owners and `Context.player` must both equal target company; rev6's `3141` owner is insufficient.
- A separately qualified pre-execution boundary holds/cancels the *final* native action before debit. `builder.proposalApply` and command callbacks are outcome evidence, not that boundary.
- One-shot execution yields correlated result entity/revision identities, observed ownership and debit postconditions. Exercise malformed payload, version/resource mismatch, stale revision, insufficient funds, collision, timeout, disconnect, duplicate and unknown outcome; never automatic retry, compensation, or after-apply replay.

Until then, the precise supported-API gap is not merely an unlisted field: it is no complete qualified `Proposal -> portable schema -> fresh Proposal or equivalent SimpleProposal` mapping plus no pre-spend final-action admission point. Keep remote road-stop construction disabled.

The stock mission handler is a scoped lead only: it processes builder proposal events and aggregates error/warning results (`base/content/mission.zip!mission/mission_sim.script.tl:220-294,811-842`, independently source-checked). It does not yet prove a free-play final-click veto or a network wait/defer mechanism; qualify that separately before treating returned errors as admission control.
