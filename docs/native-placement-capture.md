# Normal placement capture: source trace

20 September 2026. Read-only investigation of the installed game; no game run,
native attachment, command interception or replay was performed.

## Decision

Do not rebuild road snapping, collision handling or a station placement picker.
Reuse native placement and investigate access to its complete proposal/command.
The current guided coordinate test is not a station acceptance task.

The previous assertion that the native road-stop builder has no script declaration
was too broad. Its GUI descriptor **is declared in base/tealdef**, not in the
api/tealdef tree searched in that audit. A proposal preview callback also exists.
Neither establishes an interception or network serialization contract.

A stronger subsequent lead is the stock mission script's proposal lifecycle:
`builder.proposalCreate` and `builder.proposalApply` arrive through its ordinary
`guiHandleEvent`. It unpacks native proposal/data/result entries and returns
error/warning tables. Prioritize investigating that path before wrapping preview
recipes. Free-play delivery, precise execution timing and veto scope remain
runtime questions; do not describe this as a proven global hook.

## Trace and evidence

Paths below are relative to `E:/Steam/steamapps/common/Transport Fever 3`.
Archive references name an entry and its one-based source lines. No stock source
is copied into the mod.

- `base/content/mission.zip!mission/mission_sim.script.tl:220-294`:
  checks create/apply event names, unpacks param[1] as Proposal, param[2] as
  ProposalData and param[3] as result entities, calls task proposal handlers,
  and aggregates warnings/errorMessages. At 811-842 the ordinary guiHandleEvent
  invokes this logic and returns its restriction result.
- `base/tealdef/mission/tasks/build_construction/mission_task_build_construction_util.d.tl:7-35,79-85`:
  declares proposalFilter to disallow actions and proposalApply to detect success,
  including stop and snapping checks. The framework is a concrete construction
  lifecycle candidate, not evidence of a hook for every command type.
- `base/tealdef/scripts/gamescript.d.tl:40-69`: named/all-event subscriptions and
  GUI event handlers exist, but the declaration alone neither enumerates native
  events nor specifies execution timing or cancellation. Stock mission behavior
  above provides the specific evidence missing from a generic keyword search.

- `base/tealdef/scripts/builtin.d.tl`, record `Type.ConstructionAction.EdgeObjectBuilder`:
  a native GUI descriptor with constructor, resource, params, one-way and
  underground options. This is a real candidate for reusing native stop placement,
  not an engine factory for an already-selected road edge.
- `base/content/gui.zip!gui/construction/construction_react_util.tl:3267-3274`:
  stock code instantiates that descriptor. Snapping and final submission are not
  implemented in this script branch.
- `base/tealdef/scripts/builtin.d.tl:1355-1384`:
  `ConstructionActionParam` includes `getProposalStringsFn(Proposal, ProposalData)`
  returning strings, and the native `ConstructionAction` recipe.
- `base/content/gui.zip!gui/construction/construction_react_util.tl:3812-3864`:
  stock code uses that callback to read proposal statistics and display reputation
  text. This proves a proposal reaches script for preview text. It does **not**
  prove it is the final committed proposal, that it can be retained safely, or
  that changing/returning from the callback cancels execution.
- `base/tealdef/scripts/react.d.tl:280-284,422-436`:
  recipe replacement and calling the original recipe exist. Wrapping the native
  construction recipe to observe the preview callback is a candidate, not yet
  runtime verified. Keep the original callback result and builder behavior.
- `base/content/gui.zip!gui/construction/construction.tl:1288-1301`:
  a script-visible world-build send exists, but it changes an existing
  construction's parameters. It is not the normal new-stop placement submit path.
  Wrapping script `sendCommand` cannot be claimed to capture native builder sends.
- `api/tealdef/api/cmd.d.tl:15-21,588-601,953-962`:
  command objects are opaque in the declaration, callbacks belong to supplied
  commands and run after execution, and world-build accepts an existing Proposal.
  There is no declared general command-to-bytes/from-bytes facility here.

Fingerprints: builtin.d.tl
`4ea99cbbe07655a881fad8fbfe9ea348880cb6bb99f2018c4a1b96aef90cd8d8`;
gui.zip `86a5743783a90d9657d6be92fd1369713d822c6433545551021f38f8456f199a`.

## Next bounded investigation

### Qualification update after the revision-5 live run

Normal roadside-stop delivery is now locally verified: `streetTerminalBuilder`
emitted create and apply events; proposal/data were userdata and apply result was
a table. No observer errors. Do not rerun the basic observer gate for this action.

Further first-party source inspection distinguishes notification from submission:
`mission/tasks/build_construction/mission_task_build_construction_util.tl:123-125`
uses `event.isApply` to send task completion with `param.result[1]`; its declaration
labels proposalApply "to detect success" and proposalFilter "to disallow stuff".
This supports treating apply as a success notification, not a qualified
pre-execution hold point. Exact native timing is still not runtime-qualified.

The apparent input-hook alternative also has a narrower demonstrated scope:
`base/tealdef/scripts/builtin.d.tl:1355-1384` exposes ConstructionAction input maps
and an inputActionsHandler, but the stock configuration at
`gui/construction/construction_react_util.tl:3866-3973` wires mode, snapping,
underground, height/slope and parameter-window actions. It does not expose a
stock final-submit override in that inspected block. Do not replace it and claim
that mouse/gamepad construction has been intercepted.

Next implementation must resolve two independent boundaries: complete supported
proposal transport, and final action admission before native spending. Clone()
is declared on Proposal, but that is a local native copy, not network serialization
or proof of safe lifetime across GUI/engine contexts. The user-requested normal
placement path remains the target; a new coordinate picker is not a substitute.

1. First establish whether our game-script GUI handler receives the stock
   create/apply events during normal free-play depot, curb-stop and terminal
   placement. Correlate event order with actual construction results. Fall back
   to the recipe preview observer only if this event route is unavailable.
   Record only bounded scalar diagnostics during callbacks; do not serialize
   userdata, retain native references across callbacks, submit or mutate proposals.
2. Separately establish a committed-command notification or pre-execution
   defer/cancel contract. Preview visibility is not proof of a click or a command.
   Do not suppress native input and assume all paths were intercepted.
   Qualify the mission-style error return independently on a disposable save;
   an observed apply event is not evidence that an earlier create event can hold
   an accepted command pending a network response.
3. Establish complete proposal transport: existing entity/revision references,
   newly generated entities, resource identity and company context must survive
   transfer. This is encoding the existing action, not recomputing snapping.
4. Only after those boundaries are verified, connect host ordering and exactly-
   once application (including the sender). An after-execution-only feed needs
   an explicit different ordering/reconciliation design; do not quietly enable it.

If step 2 or complete transport is unavailable through supported scripting, the
missing native boundary is specific: obtain/hold the final native command and
replay it with correlated results. Continue the opt-in native feasibility track,
not another station coordinate UI. No hook address, ABI or safe attachment is
established by this source trace.

## Latest live setup evidence

12:24 UTC: target 55652 received explicit 1,000,000 funding. The first depot
attempt was rejected; TF3 stdout reports `ProposalData error: Collision` at
12:24:41 UTC. The receipt shows original balance 40393094 unchanged and target
balance 1000000 unchanged during that attempt. The broader mutation outcome
remains unknown; no automatic retry/refund. No vehicle or station was attempted.
