# Phase 2 modular-street-terminal template path

## Live evidence update — 20 September 2026, 10:23 UTC

The corrected read-only probe passed in TF3. Source manifest
`fa8a425ee21c65c699a12a6f7c06dd4c8f12660d57b37f27686ac043ae5bf95f`;
game hash `a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`.
Receipt: TEMPLATE_EVALUATED, paramsPresent=1, modulesPresent=1, moduleCount=3,
subconstructionCount=2, costKnown=1, cost=283500, templateIndex=0, platforms=1,
tickCount=57156, updateCount=2868. No construction or finance command was sent.

Do not repeat this diagnostic as an acceptance gate. The remaining question is
actual construction/road connectivity and owner/payer readback. The sections
below preserve the static investigation; their proposed evaluator-only test has
now been completed. Resource cost is not a terrain-inclusive world-build quote.

## Result

The installed public API has a **construction-result evaluator** that the
previous audit did not record:

`api.engine.util.construction.getConstructionResult(constructionResName,
constructionTemplate, parameters)`.

It is useful evidence for evaluating the stock modular terminal's dynamic
template.  It is not, however, an evidenced proposal or placement factory.
The installed first-party GUI prepares the parameter table before it calls the
evaluator, and uses the returned result only to derive menu attributes.  No
installed first-party caller uses `ConstructionResult.params` as the input to a
`SimpleProposal`, and no public declaration makes that conversion or a
road-connection proposal.

Consequently, this source-only investigation removes the claim that there is
no public template-processing API, but it does **not** authorize a native stop
command.  The exact remaining contract is the conversion from an evaluated
modular construction into a submitted `SimpleProposal` (including placement
and road connection) and the ownership/payer semantics at submission.

This is not a game run.  It establishes neither a valid placement, station
connectivity, target ownership, target-account debit, rejection on insufficient
funds, nor a correlated receipt.

## Evidence inspected

All reads were from `E:\Steam\steamapps\common\Transport Fever 3`; no game
files were changed and no source was copied into this repository.

| Input | SHA-256 | Relevant evidence |
| --- | --- | --- |
| `api/tealdef/api/engine/util.d.tl` | `B5BA8C2467C6247866FE4B3088EF7ADF2388E1B71528DB9082C12B71558973F4` | Lines 807-814 declare `UtilConstruction.getConstructionResult`, accepting a resource name, an integer template index, and the parameters supplied to the construction update function.  Lines 815-817 also declare `getGlobalConstructionParams`. |
| `api/tealdef/api/type.d.tl` | `6A7ABA0F6B3A25764C89DD289D74EECB90B5489E9FF23F89AF47B3C8F07D700E` | Lines 2677-2684 declare `ConstructionResult`, including `subconstructions`, metadata, cost fields, terminal data and `params`.  Lines 2821-2854 continue to declare the distinct `SimpleProposal.ConstructionEntity` input. |
| `base/content/stations/street.zip` | `48CEF87FA67955DBA725EF76B52DD46DDB686600EA9C0A682992B883E77E72BA` | The stock terminal resource and its script define the dynamic template and its required values. |
| `base/content/gui.zip` | `86A5743783A90D9657D6BE92FD1369713D822C6433545551021F38F8456F199A` | First-party GUI source shows both the normal-construction evaluator call and the separate native GUI builder action. |
| `base/content/scripts.zip` | `FC749931E0D3611E16F3A251DDD994C7E578C5F019A3F5ACB618B97AFBBBD2BE` | The terminal's shared tram parameter definitions. |

## Verified first-party path

The GUI registers each construction template as an
`ACTION_CONSTRUCTION_BUILDER` item.  Its template number is `(index - 1)`, so
it is zero-based.  For the modular terminal's six stock templates, the source
ordering makes these indices:

| Index | Template |
| --- | --- |
| 0 | passenger, era A |
| 1 | passenger, era B |
| 2 | passenger, era C |
| 3 | cargo, era A |
| 4 | cargo, era B |
| 5 | cargo, era C |

For the normal GUI preview/info path, first-party code does the following:

1. obtains `paramsAll` from `getGlobalConstructionParams()`;
2. overlays the active GUI definition's parameters;
3. calls `getConstructionResult(resource, templateIndex, paramsAll)`; and
4. reads the result to compute displayed attributes.

This proves that the evaluator is a supported first-party mechanism for
dynamic constructions and that a caller should preserve the global parameter
table rather than inventing time-related fields.  It does **not** prove that an
empty table is default-initialized for a dynamic construction.  The only
first-party empty-table evaluator call found is for an edge-object terminal,
where it reads only `streetTerminal` data; it is not the modular terminal path.

The GUI's actual build action instead instantiates
`builtin.type.ConstructionAction.ConstructionBuilder`, sets its construction
resource, zero-based template index, filtered menu parameters, height and
rotation, then returns it to the GUI action system.  That native GUI type has
no declaration in the installed `api/tealdef` tree and no engine-side callback
or submit API was found for it.  It is therefore evidence of how the game UI
prepares a build, not a callable host-authoritative factory.

## Verified template inputs and processing boundary

The terminal's template script reads `params.templateIndex`.  It selects a
passenger layout for indices below 3 and a cargo layout otherwise; cargo also
reads `params.specialization`.  It reads `params.platforms` to determine the
initial platform module layout.  Its update function then iterates
`params.modules`, reads `params.year`, and treats absent or value-1
`tramTrack` as no-tram rendering.

The stock GUI metadata establishes `platforms` default index 1.  The shared
tram parameter has no explicit `defaultIndex`; source inspection establishes
the update script's absent/value-1 no-tram branch, but does not establish a
public general rule that a missing `defaultIndex` is automatically materialized
as a particular input value.

`ConstructionResult.params` is publicly exposed, but the declarations do not
state whether it is a canonical, template-expanded input table, merely the
processed input parameters, or a table acceptable to
`SimpleProposal.ConstructionEntity.params`.  No installed first-party source
consumer answered that question.  The evaluator's return also contains no
`SimpleProposal`, placement transform, collision/proposal data, or road-edge
connection instructions.

## Exact supported next diagnostic

In a disposable loaded save, a **read-only** diagnostic may call the public
evaluator using the same preparation order as the GUI: global construction
parameters plus the selected zero-based template and selected menu values.  It
may record, without submitting anything, whether a non-nil result exposes a
complete `params.modules` table and expected `streetTerminal` data.  It must
not infer success from a non-nil result, fabricate omitted values, or submit a
proposal based on that observation alone.

Before a build adapter can be written, obtain at least one of these concrete
missing contracts:

1. Public documentation or an observed disposable-save trace that specifies
   how `ConstructionResult.params` maps to
   `SimpleProposal.ConstructionEntity.params`, including the template selection
   and generated modules; and
2. a documented public factory or captured proposal showing the terminal's
   world transform and road connection, with target-company owner/payer
   semantics on `makeWorldBuildProposalCmd`.

Only after those are established may the adapter create a durable attempt
barrier, immediately revalidate the requested target company, submit once, and
read back both ownership and independently observed target-account movement.
An uncertain submission remains latched; a callback or evaluator result is not
evidence of engine work.
