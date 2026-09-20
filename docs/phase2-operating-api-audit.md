# Phase 2 operating-accounting API audit

Audited 20 September 2026 against the locally installed Transport Fever 3
public Teal declarations and read-only first-party GUI archive. This is a source
audit, not a TF3 run. It does not establish that the present adapter collects
this evidence or that a service has operated in a real save.

## Conclusion

The installed public interface supports a credible *asset-attributed* operating
receipt for the target-owned vehicle/line. It is stronger than a target-company
balance delta: the first-party vehicle and line panels themselves ask the
finance API for each asset entity, rather than for the selected player.

It also supports a direct two-stop observation: `TransportVehicle.visitedStops`
is documented as the stops at which that vehicle stopped. A snapshot with both
indices of a validated two-stop line is evidence of visits to both stops.

This is not yet an acceptance pass. The API does not offer a per-journal-entry
callback or a payer/company field on an income event. The declarations do not
name the chart series, but the shipped GUI statically establishes the audited
build's two-series order. It does not establish the numeric cost sign or the
meaning of an incomplete current bucket. The real disposable-save run must
preserve the raw observations and confirm those remaining details. Until then,
`verifyServiceOperation` remains a strict contract with no live evidence
producer.

## Primary public API evidence

Paths below are relative to the installed game at
`E:\Steam\steamapps\common\Transport Fever 3`.

| Need | Installed declaration | What it establishes |
| --- | --- | --- |
| Company/asset linkage | `api/tealdef/api/engine.d.tl:846-860`, `PlayerOwned.player`; `:1687-1713`, `getComponent` and owned-entity filtering | Read the current owner of the vehicle and line immediately before and after the observation. Require both to be the target player entity. |
| Vehicle is assigned to the intended line | `engine.d.tl:1457-1478`, `TransportVehicle.line` and `stopIndex`; `api/engine/system.d.tl:360-372`, line-to-vehicle and line-vehicle reads | Read the vehicle's line and/or the system's line-vehicle relation; neither a requested assignment nor a company balance is sufficient. |
| Two configured stops | `engine.d.tl:491-552`, `Line.stops` | Require exactly two configured stop records for the target line. The records identify station group, station, and terminal. |
| Actual visits | `engine.d.tl:1525-1532`, `TransportVehicle.visitedStops` | It is explicitly "The last stops on the line the transport vehicle stopped at" and is limited to the line's number of stops. With an exactly-two-stop line, distinct valid values `0` and `1` show that the vehicle stopped at both. |
| Company balance only | `api/engine/util.d.tl:858-874`, `getPlayersBalance`, `calcIncomeSince`, income times | These are player-level reads. They can corroborate the target company changed, but cannot allocate the change to one vehicle/line while other target-company assets run. |
| Net asset result for a bounded game-time interval | `api/engine/util.d.tl:841-848`, `finance.calculateBalance(entities, startTime, endTime, maintenanceIncomeOnly, maintenanceType?)` | The signature accepts a set of account entities, including a singleton vehicle or line, over an explicit game-time interval. It returns a summed balance, not separate income and expense fields. |
| Separate asset chart | `api/engine/util.d.tl:830-835`, `finance.getAccountChart(entity, config)`; `api/type.d.tl:5611-5636`, `ChartConfig`/`ChartResult.series` | A direct chart for an entity with an account is declared. Its raw result has no company-id parameter. The declaration does not name its numeric series; first-party consumer source below supplies the audited-build order. |
| Player finance table | `api/engine/util.d.tl:853-857`, `computeFinanceTable(playerEntity, config)`; `api/type.d.tl:5695-5713` | The only declared structured transport breakdown is player-scoped. It can corroborate the target company but cannot prove vehicle/line attribution. |

The missing company argument on `getAccountChart` is not a defect in the
asset-attribution route. Attribution has to be established by the conjunction
of (1) a direct read of the selected vehicle/line account and (2) fresh
`PlayerOwned.player == targetCompany` reads. Passing the company to a player
finance chart would instead aggregate all of that company's activity.

## First-party archive evidence

The following files were inspected in memory from `base/content/gui.zip`; no
first-party source was copied into this repository.

* `gui/line_vehicle_mgmt/vehicle_react_util.tl` creates a singleton table with
  the vehicle entity and calls `finance.calculateBalance(..., fromTime, toTime,
  true)` for its displayed vehicle balance.
* `gui/line_vehicle_mgmt/line_react_util.tl` makes the equivalent singleton
  `calculateBalance` call for the line entity.
* `gui/entity_window/vehicle/vehicle_eow.script.tl` and
  `gui/entity_window/line/line_eow.script.tl` each render an `account` chart
  for the direct entity with the two labels **Income** and **Running Costs**.
* `gui/entity_window/entity_window_util.tl` resolves chart type `account` by
  calling `api.engine.util.finance.getAccountChart(params.entityId, config)`.
  It gives `chart.series[i]` the same positional `params.labels[i]`; it does not
  transform the values.
* `game_mechanics/finance/finances_charts.tl` calls that same function for the
  player account and passes labels `{ "Revenue", "Expenses" }` in that order.
  The vehicle/line entity windows pass `{ "Income", "Running Costs" }` in the
  same order.

Together, those shipped consumers are primary implementation evidence that the
public account reads are intended to work on vehicle and line entities and that
the account chart is statically mapped for this audited build as first series
income/revenue and second series expenses/running costs. They do **not** show
whether costs are stored negative or positive, nor how an incomplete chart
bucket is handled. That blocks normalization into the existing positive-value
verifier, not collection of the raw asset-attributed evidence.

## What a live evidence producer must read

At observation start, capture one coherent record containing the game time,
update count, target company, vehicle and line entities, both `PlayerOwned`
components, the vehicle's `line`, the exact two `Line.stops`, and raw account
chart/balance data for the selected asset. Repeat it after simulation has
advanced and the vehicle reports both stop indices. Re-read ownership and line
assignment at the end; a stale initial owner is not authority for the result.

For `verifyServiceOperation`, the collector must retain the raw chart series,
game-time bounds, and the audited source's series mapping for a *single
selected asset account*. A later normalization step may derive `revenue` and
`operatingExpense` only after the live run establishes cost sign/bucket
semantics. It must not:

* use a company balance delta as either amount;
* use `computeFinanceTable` or `calcIncomeSince` as vehicle/line attribution;
* sum vehicle and line accounts, because the declarations/archive do not state
  they are disjoint ledgers;
* equate update counts with finance-chart times—the finance calls take game
  time, not `updateCount`;
* turn no observed income into zero, or negate/chart-normalize a value before
  the disposable run has established its representation.

The existing `src/company-service.mjs` contract correctly requires positive
separate amounts, target company fields, a bounded update interval and two
distinct stop indices. It has no Teal-side evidence collector at this audit
point, so its unit-test fixtures prove schema rejection only, not engine
accounting.

## Required disposable acceptance observation

Run only after the vehicle, line, assignment, and ownership paths are connected.
Keep the original company out of the selected asset accounting, but do not
assume its unrelated simulation is frozen. The acceptance artifact should show:

1. target ownership of the vehicle and line before and after;
2. a two-stop line and post-run `visitedStops` containing exactly the two valid
   indices (order need not be assumed by the current contract);
3. raw direct-asset chart/balance reads with game-time bounds, the static
   first-series revenue / second-series running-cost mapping, and the observed
   sign/bucket interpretation;
4. positive separately normalized operating expense and revenue from that one
   asset account; and
5. player-level finance/balance only as a secondary target-company corroboration.

If the chart has not advanced, has an unexpected number of series, the asset's
owner/line changed, or either normalized amount is absent/non-positive, the
result is `SERVICE_NOT_VERIFIED`, not a zero-income success and not a retry or
compensation action.

## Audit fingerprints

* `api/tealdef/api/engine.d.tl`:
  `7e524d16108fc5f0663397d4001d46ab1386ec3e340af7d4e5a7edbe47fa237a`
* `api/tealdef/api/engine/util.d.tl`:
  `b5ba8c2467c6247866fe4b3088ef7adf2388e1b71528db9082c12b71558973f4`
* `api/tealdef/api/type.d.tl`:
  `6a7aba0f6b3a25764c89dd289d74eecb90b5489e9ff23f89af47b3c8f07d700e`
* `base/content/gui.zip`:
  `86a5743783a90d9657d6be92fd1369713d822c6433545551021f38f8456f199a`
