# Phase 2 native funds API audit

Scope: read-only audit of the locally installed TF3 public declarations and
first-party content. No game was launched and no game data, archive, save, or
mod source was changed. This is static evidence, not runtime qualification.

Audited installation: `E:\Steam\steamapps\common\Transport Fever 3`
(executable size: 69,690,808 bytes; modified 2026-09-18T18:07:21Z). Inputs:

| Input | SHA-256 |
| --- | --- |
| `api/tealdef/api/cmd.d.tl` | `7BB6EB57B3915D7F0D9BAD615F28E8A920613C7B8F98CD864F0C28916672C766` |
| `api/tealdef/api/engine/util.d.tl` | `B5BA8C2467C6247866FE4B3088EF7ADF2388E1B71528DB9082C12B71558973F4` |
| `base/content/gui.zip` | `86A5743783A90D9657D6BE92FD1369713D822C6433545551021F38F8456F199A` |

## What the supported API establishes

`api.cmd.sendCommand(cmd, callback, progress)` is public. Its callback receives
`(data, success, resultEntities)`; execution is immediate in engine state but
deferred on GUI/console state. A command object or a promise is consequently not
a receipt.

`makeVehicleBuyCmd(playerEntity, depotEntity, TransportVehicleConfig)` is public.
The result data has `playerEntity`, `depotEntity`, config, and output-only
`resultVehicleEntity`. It has no published free-purchase, ignore-cost, or
`applyPurchaseCost` argument. `applyPurchaseCost` is a **VehicleReplace** field,
not a VehicleBuy feature.

`makeWorldBuildProposalCmd` has `Proposal` and `SimpleProposal` overloads with
`(proposal, context, ignoreErrors, playerInitiated, doDust?)`. `Context.player`
is public. Its result contains `resultProposalData` and `resultEntities`; public
`ProposalData.costs` is an integer. This supports explicit payer context and
post-command entity/result inspection.

`api.engine.util.finance.getPlayersBalance(playerEntity)` is the supported
company-balance read and may return `nil` for infinite money. It is only a
snapshot, never an atomic affordability guarantee.

For a processed **Proposal**, public
`api.engine.util.proposal.makeProposalData(proposal, context?)` returns
`ProposalData`, including `costs`. It has no declared `SimpleProposal` overload;
do not cast a SimpleProposal or assume one. First-party
`gui/entity_window/bridge_and_tunnel.tl` uses `builtin.ProposalViewer` to obtain
ProposalData, compares `costs` against the selected player's balance, and then
submits the command. This is a supported quote/UI-preflight pattern, not an
execution-time funds guarantee.

For stock new-vehicle UI, first-party
`gui/line_vehicle_mgmt/vehicle_store_util.tl` builds `VehicleData.price` from
the selected models' `ModelMetadata.Cost.price`; the store compares that result
(less any explicit replacement refund) with the selected player's balance before
enabling Buy. `vehicle_react_util.tl` then submits
`makeVehicleBuyCmd(getPlayer(), depotEntity, config)`. This supports the stock
configuration's local affordability check. It does not by itself publish a
general authoritative quote API for an arbitrary externally constructed
`TransportVehicleConfig` (especially a multiple-unit configuration).

`api.engine.util.vehicle.getPartPrice(TransportVehiclePart)` is public but
documented only as a part “value.” First-party vehicle-store code uses it for
existing nonzero-`purchaseTime` parts in its Modify path; new Buy display pricing
uses `VehicleData.price` instead. Do not represent `getPartPrice` as a proven
fresh-purchase quote without a configuration-matched runtime check.

## Flags: no supported cost bypass is identified

`WorldBuildProposalCommandData` includes `withCostRep`, with an adjacent
generated comment saying it “ingore[s] costs if set to true.” It is not a
factory parameter, is callback/result data rather than a documented input, and
its name contradicts that comment. No implementation may set or depend on it as
a free-build switch. `ignoreErrors` is a separate documented factory argument:
it permits building despite *non-critical proposal errors*, not a documented
funds bypass; keep it `false`. `playerInitiated` has no published funds meaning.

The first-party bridge/tunnel source builds a Context for the selected player and
calls `makeWorldBuildProposalCmd(proposal, context, false, true)`; it does not
set a hidden cost flag.

## Native insufficient-funds evidence and limit

The stock vehicle store locally disables Buy for an insufficient displayed
balance, then still has a command callback failure branch in
`vehicle_react_util.tl` that reports “Could not clone vehicles (not enough
money).” This is strong first-party evidence that submitted `makeVehicleBuyCmd`
has an insufficient-money failure path. The bridge/tunnel source also performs
the corresponding build-price/balance preflight.

It is not static proof of the acceptance requirement. The public declarations
do not specify that command-time insufficient funds always yield `success == false`,
prohibit overdraft, guarantee an exact debit, or explain whether a nonselected
`Context.player` changes those rules. The audited content contains no engine
implementation. A UI preflight can also be stale when execution occurs.

## Acceptance consequence: concrete remaining blocker

The host can use supported preflight and receipt methods: immediately recheck
binding, ownership/payer, balance, and a configuration-matched quote where one
is available; issue one native command with explicit target company and
`ignoreErrors = false`; require callback success plus output/entity inspection;
then read and record the target balance. False, timeout, or mismatched state is
terminal—no retry, funding, compensation, or inferred success.

The remaining blocker is a disposable-save live qualification, not another API
workaround. Through the real target-company paths, run otherwise-valid but
intentionally unfunded build and vehicle actions. Record before balance,
callback data/success, after balance, and target entity count/ownership. Passing
native enforcement requires callback failure, no new target entity, and no debit
(or recording a contrary observed result as an acceptance failure). Then perform
funded counterparts and record success, target ownership, and the native debit.
Until that run, Phase 2 may claim supported preflight/receipt APIs and
first-party source evidence, but must not claim native insufficient-funds
enforcement is qualified.

