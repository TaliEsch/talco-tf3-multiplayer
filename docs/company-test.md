# Company ownership and the local creation experiment

## Product rule

One connected user controls one distinct company. Company sharing is NOT a
feature. Assets and balances belong to in-game company entities, not connection
IDs. A user leaving does not transfer or delete the company's assets. Restoring
control after reconnect still requires a trusted, verified mapping; it is not
automatically implemented or inferred from a client claim.

HostAuthority now requires a host-approved company binding before accepting
actions. Requests carry targetCompanyEntity, which must equal that user's bound
company and the actual owner returned by the engine adapter. CommandQueue
independently checks the same company ID on arrival and again at execution.
Exclusive company mappings are enforced at host, coordinator and participant
boundaries. The old targetOwnerPlayerId request field is rejected. Restart all
helpers together; mixing old gameplay message schemas is unsupported. The
encryption envelope and laptop diagnostic protocol are unchanged.

This covers the current vehicle/speed command allowlist. It does not add native
construction interception, purchases, shared finance simulation or automatic
company selection. Each machine must ultimately simulate the common world;
locally displayed previews are not permission to commit uncoordinated purchases.

## Debug → Create test company (launcher 0.6.9)

This is an opt-in, REAL game mutation. Use only a disposable copy of a save.
The loaded game's save may differ from the launcher's selected transfer file.
Start a fresh solo Host, load the disposable mod-enabled save yourself, leave
vehicle tests disabled, and keep simulation running. Wait for
engine_observation_connected before using the button and accepting its warning.

The helper freezes remote admission for its lifetime and publishes one fixed,
short-lived creation request. The GUI consumes it before dispatch; the engine
rechecks the local company/clock and persists a one-attempt barrier before
makeGameAddPlayerCmd. Its documented immediate engine callback returns the new
entity. The test checks that the new entity exists, has a PLAYER component,
differs from the original company, and leaves the original local player selected.
No UI company switch or asset transfer is performed. A receipt is not a queue.

Look for company_test_result with code=created and distinct companyEntity and
newCompanyEntity. This proves only creation/component presence/local-selection
preservation, not working finances, vehicle operation or persistence. Those
remain subsequent experiments. A failed/missing callback can leave an unknown
outcome even if a company was created: NEVER automatically retry it.

There is no automatic undo. Stop the helper before leaving/reloading the save.
Do not save over your original. The one-attempt flag lives in the save's script
state and prevents another creation when that tested state is loaded; loading
an older save restores older barriers, so do not reload while a helper is live.
Discarding the disposable run avoids contaminating real play.

## Read-only inspection (launcher 0.6.10)

Runtime evidence supplied by the user on 18 September at 22:41:54 UTC: creation
returned code=created, original company 3141, new company 56075, update 2556.
This confirms creation/component/local-selection checks for that run, not
financial independence or vehicle operation.

Use Debug → Inspect test companies after loading the disposable save containing
the successful creation. This button never creates a company. It reads the
saved creation receipt, checks both companies still exist and the original local
company is selected, then logs company_inspection_result and two company_snapshot
records. Each reports companyEntity, balanceKnown, balance, assetCount,
vehicleCount and lineCount. balanceKnown=false means unknown/infinite money,
not a verified zero balance. Assets means entities with PLAYER_OWNED, not visible
buildings. Counts use getEntitiesWithComponent with requireOwnedByPlayer; lines
use api.engine.system.lineSystem.getLinesForPlayer. Balances use the finance
namespace. These are partial GUI observations, not a full checkpoint or proof
of cost attribution.

Read-only inspection may be repeated after completion. It cannot overlap a
vehicle experiment, engine probe or pending creation. no_test_company means
the loaded save has no successful creation marker and does not trigger creation.
If the creation run was discarded without saving a disposable copy, the company
and marker will not exist in the original save. Do not overwrite your original
or recreate a company automatically to recover a test result.

The new inspection is source/unit tested but has not yet been run in TF3.

## Automated verification scope

Automated tests cover parser identity/schema, duplicate prevention, timeout,
request cleanup, mutual exclusion with vehicle/probe tests, source guards and
company-based host/client authorization. They use synthetic receipts. Structural
source checks are not a Teal compiler or game runtime. No TF3 launch, company
creation, UI switch or in-game finance test was performed by the assistant.
