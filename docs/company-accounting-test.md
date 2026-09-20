# Company accounting isolation — launcher 0.6.11

This is a disposable-save-only real finance mutation. It is NOT a purchase or
proof that vehicle operating costs are attributed correctly.

The confirmed inspection run showed original company 3141 with balance
40,397,153, 5 owned entities, 1 vehicle and 1 line; company 55652 had balance 0
and no owned entities, vehicles or lines (update 2614). A purchase requires a
usable depot, which the second company does not have. This batch deliberately
does not transfer the original company's depot or buy without a valid setup.

## Installed API evidence

api/tealdef/api/cmd.d.tl documents makeJournalBookAssetCmd(player, entry,
position?) and immediate engine command callbacks. The bundled first-party
game_mechanics/finance/loan.script.tl uses that command with a player entity.
game_mechanics/subventions/subvention_util.tl creates JournalEntry objects,
sets positive/negative amounts, time=-1 and Type.SUBSIDY, then books them with
the same command. We follow that API shape and specify the test-company entity,
not the original local player. The original company stays selected throughout.

## Exact test

1. Read both known, finite balances and check the saved successful creation marker.
2. Persist financeTestAttempted before any command (one attempt per save state).
3. Credit exactly 1,000 to the test company with a SUBSIDY journal entry.
4. Require a successful synchronous callback, target balance +1,000 exactly,
   and an unchanged original balance. Otherwise stop with an unknown outcome.
5. Only after exact credit confirmation, persist the next stage and debit 1,000.
6. Require another successful callback, target restored to its starting balance,
   and the original still unchanged. Only then report passed.

This is a planned credit/debit pair, not an automatic rollback. An uncertain
credit is never followed by a compensating debit or retry. Extra funds and
journal entries may remain after a partial test; even a successful test leaves
journal history. The only amount allowed in engine code is +/-1,000; neither
the network nor the local request can supply an arbitrary amount.

The original and target balances are compared within the same fresh engine
event. Node independently checks the signed numeric receipt and all exact
postconditions before logging success. Receipt/state is not executable pending
work. A new helper cannot reset a saved attempt barrier; loading an older save
can restore older barriers, so never reload with the helper active.

## Manual procedure

Start a fresh solo Host, then load your disposable save containing the created
test company and the updated mod. Leave other tests disabled and simulation
running. Wait for engine_observation_connected, then choose Debug → Test company
accounting and read/accept the warning. Press it once. It blocks remote joining
until helper restart. Send finance_test_result plus finance_test_balances lines.

If the outcome is uncertain, do not repeat it or assume no change happened.
Use the read-only Inspect test companies after the request finishes to inspect
balances. Stop the helper before exiting/reloading. Never save over the original.

## Evidence boundary

User runtime evidence on 19 September 2026 at 07:34:30 UTC reports `passed`,
update 2898. Original company 3141 remained at 40,393,094 before credit, after
credit and after debit. Test company 55652 went from 0 to 1,000 to 0. This
confirms the bounded journal test on that save/build; it does not prove actual
construction or vehicle cost attribution. The second company is still unfunded.

Automated tests cover synthetic success/unknown/timeout outcomes, strict signed
balance validation, mutual exclusion and no-retry guards. They do not execute
Teal or journal commands in TF3. Actual vehicle purchases, depot provisioning,
operating costs and multi-game synchronization remain open. Direct depot
placement, not ownership transfer, is the selected next route; see
`direct-depot-placement.md`.
