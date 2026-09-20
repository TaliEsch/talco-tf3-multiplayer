# Phase 2 service accounting findings

Audited 20 September 2026 against the locally installed Transport Fever 3
public Teal declarations and first-party GUI archive. This is static interface
evidence only. The collector is now registered as
`mod/content/tf3mp_service_observation.lua`, but has not been qualified in a
disposable save. The earlier experimental source is historical, not the shipped
implementation.

## Exact attributed interval reads; split remains unproven

Use the singleton target-owned vehicle account and the exact observed game-time
endpoints:

```lua
local net = api.engine.util.finance.calculateBalance({ vehicle }, startTime, endTime, true)
local vehicleMaintenance = api.engine.util.finance.calculateBalance(
  { vehicle }, startTime, endTime, true, api.type.JournalEntry.Maintenance.VEHICLE)
```

`api/tealdef/api/engine/util.d.tl:841-848` declares the explicit `startTime`,
`endTime`, `maintenanceIncomeOnly`, and optional `JournalEntry.Maintenance`
filter. Its comments say that `maintenanceIncomeOnly` considers only
maintenance/income entries and that the final parameter considers the stated
maintenance type. They do **not** say whether supplying a maintenance type
excludes income entries. `base/tealdef/scripts/journal.d.tl` declares the
distinct `VEHICLE` and `VEHICLE_MAINTENANCE` categories, but does not specify
their ledger scope.

First-party `base/content/gui.zip` establishes that this filter is a live
supported accounting read: `gui/entity_window/entity_window_util.tl` calls
`calculateBalance(..., true, params.maintenanceType)` and displays the returned
signed scalar directly, assigning the negative presentation class when it is
less than zero. `gui/entity_window/maintenance_station/maintenance_station_eow.script.tl`
passes `VEHICLE_MAINTENANCE` for station maintenance. This proves signed raw
filter consumption, not that the filter is pure expense. The vehicle and line
account charts label the two untransformed account series `Income` and `Running
Costs`, but their buckets are not exact arbitrary game-time intervals and do
not resolve the filter ambiguity.

The experimental collector retains both raw exact-window values:
`intervalNet` and `intervalVehicleMaintenance`. It deliberately does not
derive `revenue` or `operatingExpense`, negate the filtered value, or claim the
difference is revenue. Ownership, line assignment, two-stop route, and exact
game-time advancement remain rechecked at both endpoints.

## Remaining qualification

The registered collector reads all four declared maintenance categories
(`VEHICLE`, `INFRASTRUCTURE`, `OTHER`, `VEHICLE_MAINTENANCE`) in addition to the
maintenance/income net, retaining signed integer results without deriving income.
First-party `game_mechanics/finance/finances_util.tl` labels income as revenue and
the two vehicle categories separately. That classification alone does not prove
whether `calculateBalance` keeps income while filtering maintenance entries. A
possible exhaustive-category subtraction is therefore a hypothesis, not a passed
accounting check. Account-chart bucket deltas are also not a replacement: public
declarations do not establish bucket anchoring or rollover semantics.

Both endpoints require a paused engine and the exact saved, successful service
assignment. The original company, target company, vehicle, line, depot and stations
are rechecked. The same helper nonce binds the endpoints. Visited-stop masks are
raw history, not proof of a trip during this interval or continuous ownership.
The helper never turns these raw receipts into `serviceAccountingVerified:true`.

Static source does not substitute for a real game run. A disposable-save
observation must first establish filter semantics: with an interval containing
income and vehicle running cost, compare the raw net and typed-filter result
against native account/journal evidence. A documented/public query or
first-party caller that proves the typed read excludes income is required before
deriving separate amounts. Until then the outcome remains
`unverified_accounting_category_scope`; it is not a service-operation receipt
and must not authorize retries, compensation, or multiplayer play.
