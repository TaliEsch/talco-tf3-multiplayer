# Phase 2 road-stop API audit

Correction, 20 September: the GUI `EdgeObjectBuilder` descriptor is declared in
`base/tealdef/scripts/builtin.d.tl`. `ConstructionActionParam.getProposalStringsFn`
also receives a native proposal for preview text. The earlier api-tree-only
search below missed this. It still does not establish command interception,
deferral or complete replay. See [current capture investigation](native-placement-capture.md).
The freestanding coordinate-picker route below is historical, not the next test.

**Result:** small curb stops cannot yet be created through a fully evidenced
public API route, but the stock modular street terminal is a distinct,
non-edge-object candidate for direct `SimpleProposal` construction owned by the
second company.  Its exact valid initialization, owner/payer debit semantics and
road connectivity are not fully documented, so do not add
`experimental/native-stop-command.lua` yet.  In particular, do not substitute a
post-build ownership transfer: that would violate the separate-company
requirement and would not prove who was charged at creation.

This is a source/API audit, not a game run.  It establishes neither successful
placement nor owner/payer attribution, funds debiting, insufficient-funds
rejection, connectivity, or a receipt in a disposable save.

## Evidence inspected

Installed files at `E:\Steam\steamapps\common\Transport Fever 3`:

| Input | SHA-256 | Relevant declared/source evidence |
| --- | --- | --- |
| `api/tealdef/api/cmd.d.tl` | `7BB6EB57B3915D7F0D9BAD615F28E8A920613C7B8F98CD864F0C28916672C766` | Lines 953-962 declare `makeWorldBuildProposalCmd` for a supplied `Proposal` or `SimpleProposal`; there is no declared `make...Stop...`, terminal-placement, or road-stop proposal factory. |
| `api/tealdef/api/type.d.tl` | `6A7ABA0F6B3A25764C89DD289D74EECB90B5489E9FF23F89AF47B3C8F07D700E` | Lines 2472-2485 declare `Context`, including `player`; lines 2758-2800 declare `SimpleStreetProposal`; lines 2821-2854 declare `SimpleProposal`. |
| `base/content/stations/street.zip` | `48CEF87FA67955DBA725EF76B52DD46DDB686600EA9C0A682992B883E77E72BA` | `street/small_stops/small_new.con.lua` is a built-in curb-stop resource.  Its `edgeObject` section has `snapToStreet = true`, so it is not an ordinary free-standing construction.  The same archive also contains the distinct modular road terminal and underground station candidates listed below. |
| `base/content/gui.zip` | inspected read-only | `gui/construction/construction_react_util.tl` maps every construction with `desc.edgeObject` to `ACTION_STREET_TERMINAL_BUILDER`, constructed with the GUI-native `ConstructionAction.EdgeObjectBuilder`. |

The latter builder is an application GUI action.  The first-party GUI aliases it
to `api.gui.react.params.builtin.ConstructionActionEdgeObjectBuilder`, but no
declaration for that type or an engine-side submit/factory was found in the
installed `api/tealdef` tree.  Its selected street edge and cursor position are
therefore not a documented script-level input.

## Freestanding stock road-station alternative

This audit enumerated every `*.con.lua` resource in each stock
`base/content/stations/*.zip` archive plus `base/content/assets/stations.zip`.
There is no `stations/road.zip`; the complete street-station list is:

| Resource | Kind | Direct target-owner candidate? |
| --- | --- | --- |
| `street/small_stops/{small_mid,small_mid_twosided,small_new,small_new_twosided,small_old,small_old_twosided}.con.lua` | Curb stop (`edgeObject.snapToStreet = true`) | No: it needs the undocumented GUI edge-object builder to attach to an existing road. |
| `street/modular_street_station/modular_terminal.con.lua` | Large modular passenger/cargo road terminal; it defines `constructionTemplates`, `createTemplateScript`, `updateScript`, and does **not** define `edgeObject` | Candidate.  `SimpleProposal.ConstructionEntity` explicitly provides `fileName`, `params`, `transf`, `name`, `playerEntity`, and `autoFillSlots`, including a documented construction-owner field. |
| `street/underground_station/underground_station.con.lua` | Large underground passenger/tram terminal; it defines dynamic construction templates and no `edgeObject` | Candidate in principle, but it builds tunnel/tram infrastructure and is not a simple near-road bus stop. |

Thus, a large modular street terminal is the only relevant stock non-edge-object
road-passenger alternative found.  It is structurally compatible with direct
target ownership from creation: create a `SimpleProposal.ConstructionEntity`
with `playerEntity = targetCompany` and submit it through the declared
`makeWorldBuildProposalCmd` route.  This is a better direction than ownership
transfer, but it is not yet an executable recipe.

The reason to stop short of code is precise.  The terminal is a dynamic template
construction: its packaged `createTemplateFn` reads `params.templateIndex`,
`params.platforms`, and, for cargo templates, `params.specialization`; its
`updateFn` also reads generated `params.modules`, `year`, and tram fields.  The
public type declares `autoFillSlots`, but does not document whether it creates
the template-selected modules, defaults those parameters, or makes a road
connection.  No declared helper generates this candidate's initial parameter
table or placement/connection proposal.  Guessing the parameter values or
assuming an automatic adjacent-road connection would violate the no-guess
constraint.

## Why the apparent proposal route is insufficient

`makeWorldBuildProposalCmd` is a supported *submission* command, but it only
accepts a proposal already generated by another mechanism.  `Context.player`
is promising ownership/payer-related data, but its meaning, debit behavior and
interaction with a stop are undocumented here; setting it would be a guess,
not proof of target-company charging.

For *curb stops*, the only declared simple structure that can name an edge object is
`SimpleStreetProposal.EdgeObject`.  Its own contract at lines 2763-2766 says
that `edgeEntity` **must be a new edge in `edgesToAdd`**, and the enclosing
`SimpleStreetProposal` says `edgeObjectsToAdd` must be compatible with those
new edges (lines 2781-2788).  That cannot express "put this stop onto this
existing road edge."  Constructing replacement streets merely to satisfy that
constraint would be a different, risky road-rebuild action and still requires
undeclared/unaudited `BaseNode` and `BaseEdge` proposal contents.

The fuller `Proposal.StreetProposal.EdgeObject` is likewise not a viable
documented factory: it exposes result/model-instance data but no declared
existing-edge identifier, edge-relative parameter, stop resource name, or
public proposal-creation function.  The available public proposal helpers in
`api/tealdef/api/engine/util.d.tl` create replacements/removals and selected
specialized proposals; none creates a road-terminal/edge-object placement
proposal.

## Supported next step

For curb stops, the intended first-party path is the
`ACTION_STREET_TERMINAL_BUILDER` GUI action, which creates the necessary
preview/proposal internally.  To turn that into a host-authoritative,
target-owned Phase 2 action, obtain one of the following before implementation:

1. A documented public factory/command that takes an existing street edge,
   relative placement, stop resource/parameters, and target company/payer; or
2. A public callback/recipe replacement that provides the completed proposal
   before mutation and documents how the target `Context.player` is enforced
   and billed.

Then implement two separate, exact intents with a durable attempt barrier
before each submit; revalidate the target company immediately before execution;
and read back each created station's `PLAYER_OWNED` component plus independently
observed account movement.  A callback success alone is not enough.  Acceptance
also needs an insufficient-funds result and line/road-terminal connectivity
readback in a disposable save.

For the modular-terminal candidate, first obtain the exact initial parameter
table and generated road-connection proposal through a documented public
factory, or demonstrate those fields once in a disposable save while retaining
the resulting proposal/receipt as evidence.  Only then can a bounded
owner-bound adapter be written.  It must still verify both created station
entities' `PLAYER_OWNED` components and observed target-account debit, and must
leave an uncertain attempt latched.

Until then, retain the existing service adapter's prerequisite that both stop
entities already exist and are owned by `binding.targetCompany`.  That adapter
does not create stops and must not be represented as doing so.
