# Phase 2 service accounting findings

Audited 20 September 2026 against the locally installed Transport Fever 3
public Teal declarations and first-party GUI archive. This is static interface
evidence only; the experimental collector remains unregistered and has not
been qualified in a disposable save.

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

Static source does not substitute for a real game run. A disposable-save
observation must first establish filter semantics: with an interval containing
income and vehicle running cost, compare the raw net and typed-filter result
against native account/journal evidence. A documented/public query or
first-party caller that proves the typed read excludes income is required before
deriving separate amounts. Until then the outcome remains
`unverified_accounting_category_scope`; it is not a service-operation receipt
and must not authorize retries, compensation, or multiplayer play.
