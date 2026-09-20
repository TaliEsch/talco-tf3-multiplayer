# Phase 2 acceptance readiness — 20 September 2026

**NOT READY. Do not run another preview-only test as Phase 2 acceptance.**

Current priority: normal native placement capture, not the station coordinate
picker. The guided setup below is on hold after a native depot collision; no
station was attempted. See native-placement-capture.md and
native-placement-observer-test.md. Phase 2 completion additionally requires live
service ownership and independently attributed expense/income evidence.

Latest progress: the normal `streetTerminalBuilder` now delivers create/apply
events with readable outer payload slots and no observer errors. This clears
the basic delivery gate, not capture/replay. The inspected stock mission handler
uses apply to signal completed construction. Final-click deferral and a complete,
company-bound transport representation remain unqualified. See
proposal-transport-audit.md for the declared data/factory boundaries. Do not
transmit opaque Proposal userdata through the table-based file IPC or replay an
already-applied sender action as if it had been held before mutation.

A guided **setup qualification** is now exposed in launcher Debug (0.6.25.0).
See phase2-guided-setup.md. It selects three locations and a bus without spending,
then requires a separate launcher confirmation for bounded test funding and
construction/purchase/line setup. It ends paused and does not certify service
operation, insufficient-funds rejection or Phase 2 completion.

## Latest implementation delta

The depot, vehicle, station and service adapters are registered in source, with helper/GUI/engine
request and receipt transport. Verified funding can advance to construction;
verified depot construction can advance to a single explicitly consented vehicle
purchase in the same helper, for the same companies, depot and held update.
Unknown/rejected receipts, wrong identities, changed updates, duplicates and
timeouts cannot advance this sequence. The continuation now includes two station
slots followed by line creation/vehicle assignment. Each result requires the
same paused update and actual asset/company identities. There is still no
complete acceptance/accounting UI or game-verified station/service execution.

The registered one-model vehicle adapter uses the stock Buy price source:
`vehicle_store_util.collectVehicleData` sums model cost metadata. It checks the
target's current funds while held and verifies the exact debit, rather than
merely accepting any positive charge. Arbitrary multi-unit/modify pricing is not
covered. The registered purchase adapter checks the actual returned one-part
configuration as well as owner, depot and exact debit. Service creates one
two-stop target-owned line and separately assigns the verified vehicle, retaining
the persistent fault latch between commands. This is not game verification.

A read-only experimental service collector reads actual owners, assignment,
two-stop configuration, visited-stop history, game-time/update bounds and direct
vehicle account data. It bounds copied arrays and rejects a changed route; its
raw chart evidence is not yet a normalized operating-income/expense pass.

Road-stop setup is the outstanding construction boundary. Small curb stops use
the native edge-object builder. The modular road-station template evaluator
passed in TF3 at 10:23 UTC. The registered two-slot station builder constructs
owner/payer-bound proposals and checks actual new station/construction ownership,
membership preservation and debit. It is exposed only through confirmed disposable
setup, not normal Host/Join gameplay. Its evaluated-
parameter conversion, seed handling and actual road connection still require
qualification; evaluating a template alone does not establish these contracts.
See phase2-station-template-path.md. Native compatibility investigation is
approved, not implemented/qualified; no DLL has been attached.

The service collector now retains exact-window raw vehicle-account net and
typed-category reads. The documented filter does not establish whether income
is excluded, so it deliberately does not derive separate revenue/expense values.
See phase2-service-accounting-findings.md. A service pass remains unavailable.

Remaining release-to-test work: qualify that station path, connect accounting
reads, qualify the guided placement/confirmation/report flow, then
build/review/stage one coherent batch. Phase 2 completion additionally requires
the real-game ownership/funds/operating-service results. No test count removes
these gates. The sections below preserve earlier context where explicitly marked.

## Execution principles and historical implementation notes

Implementation/deployment statements below are historical; the latest delta
above and completion-audit.md take precedence. Safety requirements still apply.

Clients display/gate their own company's spending and submit actions, not balance
deltas. Host ordering and explicit company-bound native execution are authoritative.
Observed balance differences are sync evidence, not commands to rewrite money.
Concurrent purchases must be checked in host order, including host-originated
requests. Mismatch stops further actions rather than silently repairing balances.

Custom remote price preview is NOT an acceptance dependency. Prefer standard
native construction validation/charging with explicit target ownership/context.
The direct engine factory/executor has a reviewed registered source copy of
experimental/native-depot-command.lua, but is not deployed. It creates one seeded stock road depot, no explicit
removals, requires a held engine and sets ignoreErrors=false, playerInitiated=true.
The executor binds explicit native-charge consent to the placement/company and
persists a one-attempt guard before sending. The caller must still bind authenticated
identity, fresh event/session correlation and consent UI. Missing or late callbacks
remain unknown. A rejected command with unchanged measured balances/entity membership
does not prove terrain and existing assets were unchanged, nor prove insufficient funds.
src/native-depot-result.mjs checks actual owner/resource/new entities and exact
target debit with unchanged original balance. Synthetic tests do not prove native
funds enforcement. No custom price approval is required for other players.

The live acceptance session must test insufficient funds on the disposable save
before confirmed funded construction. Native command failure alone is insufficient:
verify no new assets, no original-company debit and no target overdraft. Never retry
an uncertain command. If native enforcement is absent, stop before enabling normal
construction and design a supported pre-execution constraint. Do not charge then refund.

The earlier mandatory custom processed-quote approach below is historical and
superseded as a prerequisite. Ownership, consent, duplicate protection and actual
accounting remain mandatory. Integration, vehicle purchase and service are not ready.

## Investigation result

The installed public API separates a placement description (`SimpleProposal`)
from a processed world edit (`Proposal`). Its public engine quote function,
`api.engine.util.proposal.makeProposalData`, takes the latter, with a `Context`.
The build factory accepts either type, but sending it executes construction;
it is not a dry-run conversion API. `Command<T>` exposes no documented data
getter. `Context` has a player but no documented maximum-charge parameter.
Building first and inspecting the result is not pre-confirmation validation.

The first-party `gui/entity_window/bridge_and_tunnel.tl` consumes callback
`ProposalData.costs` and error messages immediately. This supports a scalar
display estimate, not transporting a native proposal across callback boundaries.
Our previous clone failed and retaining the callback proposal crashed. The
crash report gives no stack, so native lifetime is suspected, not established.
No engine-side conversion for arbitrary new depots was found in the installed
public definitions. This is a search result, not proof that no API exists.

Source now reads only scalar display data in that callback, keeps no callback
userdata, removes the dead native repricing implementation, and explicitly labels
the result an unverified estimate. This source change is not staged and does not
enable construction. The installed containment build remains unchanged.

## Historical processed-quote investigation (not the current acceptance gate)

Obtain an engine-owned processed proposal for a new depot from a bounded plain
placement intent, inspect its full side effects, price it for the second company,
and repeat that inspection immediately before applying the confirmed edit.
Acceptable resolution is a documented conversion/ownership contract or a
supported equivalent atomic validation mechanism. It must not require injection,
ownership transfer, blindly retaining callback userdata, building as a probe,
or charging the original company and reimbursing it.

Developer/API clarification needed: what owns the second ProposalViewer callback
argument, what is its actual type for SimpleProposal input, in which context may
it be copied, and which public engine operation processes a fresh SimpleProposal
without committing it? No proprietary files have been sent or published.

## Current live implementation still required

- Funding backend is connected in source: helper request -> regular GUI mailbox
  callback -> engine event -> saved attempt guard -> exact balance receipt ->
  helper validation. It requires explicit confirmed consent, paused simulation,
  the recorded test-company identity and an amount from 1 to 1,000,000. Seven new
  automated checks cover contracts, structural engine guards and real temporary-
  file success/timeout/close paths. Native TF3 execution has not been tested.
  There is intentionally no launcher button or remote endpoint yet. Integrate it
  into the guided run after the unfunded construction qualification; do not add
  another standalone restart/test step.
- Wire the transaction stages and explicit confirmations into the guided session.
- Wire direct construction, native validation, owner/debit readback and receipt.
- Build the target-company vehicle configuration and price/availability checks,
  purchase through makeVehicleBuyCmd, then verify new entity and exact debit.
  An unregistered engine adapter now exists in experimental/native-vehicle-command.lua;
  its selected road configuration follows first-party initialization and it checks
  new identity/owner/configuration and observed isolated spending. No native run or
  authoritative new-buy price/availability qualification has occurred.
- Create two target-owned reachable stops and a line, assign the new vehicle,
  and verify actual service and separately attributed income/operating expense.
- Integrate these in one guided run with terminal unknown handling and a report.

Public factories for purchase, line creation and assignment exist, and validation
contracts are tested, but those facts do not constitute live adapter implementation.

## Single acceptance session to deliver (not runnable yet)

1. Load a disposable copy of the prepared two-company save, start a solo host,
   and record save/build/mod identity plus both companies' balances/assets.
2. Choose a depot site/orientation and confirm requesting company/native charging
   consent. Other players need no price UI. Cancel once: no entity/financial change.
   Reject client-supplied balance fields as authority.
3. Test an unfunded target on a valid site first: require an attributable funds
   rejection and unchanged balances/assets. Other failures are inconclusive, not
   an affordability pass. Unknown execution stops the run, without retry or funding.
4. After a verified rejection, explicitly approve bounded test funding and verify
   only the target increases. Then confirm one funded depot build through native validation.
   Verify construction/depot ownership from creation,
   target debit, unchanged original balance within the same execution context,
   road access and no unapproved removals/network edits.
5. Confirm one vehicle purchase; verify identity, owner, configuration and debit.
6. Create and assign the two-stop target-owned service. Reject a foreign-company
   selection before submission. Duplicate confirmation must not duplicate spending.
7. Observe both services operating; verify target vehicle visits both stops and
   journal evidence attributes operating expense and revenue to its company.
8. Produce one report with receipts and pass/fail/unknown for every requirement.
   A timeout never triggers an automatic rebuild, purchase, refund or retry.

The current experimental executor permits only one attempt per saved state. The
unfunded and funded stages need separate persistent stage receipts before this
session can be enabled; a helper restart must never reset either stage's latch.

Unknown funding/build/purchase must also retain the shared phase2CompanyFault in
engine state and CompanyTransaction's checkpoint/company-wide durable barrier.
Changing action IDs or trying the next stage is not a recovery mechanism.

Readiness requires the complete live entry and failure handling before asking
the user to restart. Pricing screenshots are not acceptance evidence. Record
native-cost accounting receipts even when no custom quote was displayed.
