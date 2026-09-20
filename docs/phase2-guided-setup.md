# Guided disposable-company setup

**On hold following the 20 September live test.** Do not repeat this coordinate-
based station setup. The depot attempt encountered a native collision after
funding; stations were not attempted. Normal placement capture replaces further
picker work; see [current investigation](native-placement-capture.md). The script
below is retained as historical test evidence, not a request for another run.

This is a local setup qualification run, **not Phase 2 acceptance or multiplayer**.
The launcher does not launch TF3, load a save, or execute this run automatically.
Native station construction and service assignment have not yet been game-verified
and may fail or crash TF3. Do not use a valued save.

## Run once

1. Open the canonical `TF3MP-Launcher.exe` (0.6.25.0). Start a fresh solo Host.
   Load a disposable copy of the known save containing the existing test company.
   That second company must have zero money and no assets, vehicles or lines.
   Do not create a company or run another diagnostic in this helper session.
2. Pause the game, then select **Debug → Phase 2: service setup**. The initial
   dialog prepares read-only selection; it does not grant spending permission.
3. Open **Company tools** in the game. Point at clear, level ground beside an
   existing road and select the depot point. Select two distinct station points
   beside roads, with enough space for freestanding passenger terminals. Rotate
   their orientations as needed. These are point selections, not native station
   previews; road connectivity is not yet verified.
4. Cycle to an appropriate road bus for the save's year. Review the three stored
   coordinates, orientations and model. Click **Submit plan to launcher**.
   The proposal freezes; nothing has been funded or built yet.
5. Return to Debug and click **Confirm disposable setup**. Check the original and
   target company IDs. The default-No dialog authorizes exactly 1,000,000 test
   funding to the target company, one depot, one bus, two stations and one line
   assignment. Costs are charged through native target-company commands, then
   checked against actual balances. There is no automatic retry or refund.
6. Leave the game paused. Do not build, switch companies, change speed, or use
   other diagnostics during the run. Wait for the launcher result.

## Expected evidence

Successful setup emits the following correlated results in order:

- `phase2_funding_result`: `funded`.
- `phase2_depot_result`: `NATIVE_BUILD_ACCOUNTING_VERIFIED`.
- `phase2_vehicle_result`: `NATIVE_VEHICLE_ACCOUNTING_VERIFIED`.
- Two `phase2_station_result` records: `NATIVE_STATION_ACCOUNTING_VERIFIED`, slots 1/2.
- `phase2_service_result`: `NATIVE_SERVICE_LINE_AND_ASSIGNMENT_VERIFIED`.
- `phase2_setup`: `SETUP_VERIFIED_SERVICE_NOT_OBSERVED`.

The report is under **Open batch reports → local-batch-… → report.json**.
It should contain six receipts and the created asset IDs. Setup success means
the engine reported the guarded setup postconditions; it does not prove income,
operating expenses, path reachability in operation or multi-game synchronization.
`gameplayVerified`, `multiGameVerified` and `checkpointVerified` remain false.

On failure, retain the report/logs and inspect existing assets. If the game is
running, pause it manually, then Stop helper. Do not repeat the confirmation or
reload-and-retry an uncertain mutation. A setup selection failure before any
confirmation cannot have sent these mutation requests; it does not itself require
restarting the game. Later testing must account for persistent consumed attempts.

Native insufficient-funds rejection and actual service income/expense isolation
remain separate qualification requirements. Do not infer either from this run.
