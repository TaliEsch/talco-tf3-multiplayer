# Phase 1 — consolidated in-game test

Launcher 0.6.22. One game, one fresh helper, one report. This is a controlled
feasibility test, not supported multiplayer. No laptop is needed.

## Before starting

Use a disposable save containing the already-created test company and a running
vehicle belonging to your original company. Use a save from **before** earlier
coordination/watchdog tests; consumed engine safety latches intentionally survive
saving. Do not overwrite your normal save or create/fund another company for this
test. If the helper cannot inspect the saved test company, stop and report that
message instead of guessing entity IDs.

1. Open the canonical `TF3MP-Launcher.exe`, choose Host, and select that save.
2. Launch TF3 yourself and load the selected save with the staged mod enabled.
   Keep normal 1x speed. Wait for bridge connection in the launcher.
3. In Debug, click **Run local sync test** and accept the bounded test warning.
4. Open your running vehicle and click **Use for sync test** in its window once.
   This click only selects the vehicle; do not click the older MP Stop/Start buttons.
5. Leave the game running and foregrounded until the launcher reports completion.
   Do not build, buy/sell, edit lines, switch companies or use native speed/vehicle
   controls. Construction tools are unchanged; these are operator constraints.

Allow about two minutes after selection. No manual release/confirmation clicks
are required. If the UI reloads or any failure appears, do not retry this session.

## Expected sequence

- Read-only inspection and vehicle selection; no funding, construction or purchase.
- Bind distinct company identities, schedule a hold, and capture actual balances.
- Acquire the existing speed/vehicle guards, agree the held snapshot, then resume.
- Four ordered vehicle actions: Stop, Start, Stop, Start. Each action must report
  the exact scheduled update, then release with observed speed 2x, 4x, 1x, 1x.
- The mod arms a pause ahead of time and checks the target in engine postUpdate.
  A separate fresh event applies the vehicle action only after the held receipt.
  Persisted pause metadata cannot execute a vehicle action on reload. If an engine
  callback skips the target, the run fails; late execution is never accepted.
- The helper measures the observed update rate; it does not assume speed multiplies
  script callback frequency. Late delivery fails rather than executing late.
- A separate explicit stop request must have a matching held-engine receipt.
- Only after saving the successful report: `LOCAL_RUN_PASSED_GAME_HELD`.

The final game is **paused**, and the selected vehicle's requested state is Start.
The report records target/actual updates, selected-state hashes, preparation,
application/release latency, measured update rates, requested/observed speed and
terminal halt state. Reports are under `reports/local-batch-*/report.json`.

## Failure and finish

An accepted command is not proof it executed. Unknown effects are never retried
or automatically undone. A failed report remains failed even if a later stop
receipt confirms the game is held. If the game is not paused, pause manually if
possible, then Stop helper. Do not save over the source checkpoint. If controls
cannot be recovered, exit to the main menu or close TF3 rather than retrying.

After success, copy the final log/report, Stop helper and close the disposable
game without overwriting the original save. Send the report back for evaluation.

## What this establishes

A successful run demonstrates the integrated adapter/coordinator path in **one**
TF3 instance. The second protocol member deliberately mirrors actual receipts;
it is not a second engine and cannot reveal cross-machine divergence. Selected
company/vehicle hashes are not whole-world hashes or loaded-save identity proof.
Automated fault tests and earlier local watchdog evidence remain separate from
this run. Phase 1's runtime gate is assessed from this report, not from test count.
Phase 3 still requires two real game-capable instances.
