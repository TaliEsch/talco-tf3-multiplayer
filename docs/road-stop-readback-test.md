# Placed-stop readback: one disposable-save check

Purpose: qualify public reads of an actual placed stop after the preview event
proved incomplete. This is not replay, second-company construction, or Phase 2
completion. The mod does not construct or charge anything during this check.
Only the player's normal placement changes the disposable game.

1. With the repaired mod staged, manually start TF3 and load the untouched
   disposable save selected in Host. Keep the launcher helper running.
2. Pause the simulation and wait for `engine_pause_observed`.
3. Use **Record checkpoint** before construction to preserve the selected save's
   identity. Do not use a session that has consumed a replay attempt.
4. Place exactly one roadside stop with the normal game tool. Leave the game
   paused; do not build anything else, save over the baseline, or reload yet.
5. Wait a few seconds and click **Check capture diagnostics**.

Expected helper code: `PLACED_STOP_READBACK_ONLY_NOT_REPLAY_READY`.
Expected native log: `native_stop_readback` / `COPIED_PLACED_OBJECT_ONLY`.
The bounded copied export is `tf3mp_status_1/road_stop_readback.lua` in local
userdata. It carries the helper nonce, apply observation ID, owner, live stop and
edge IDs, exact parameter and transform, construction resource, side/options, and
typed parameter values. Its parser checks schema, bounds, identity and freshness.

Do **not** click Capture placed stop, Load replay case or Confirm replay: those
belong to the older full-proposal path. The new diagnostic is not a replay case.
If the export is unavailable, timed out or invalid, stop and report it; do not
place more stops to retry. The observer intentionally handles one apply result
per game load, and never scans unrelated world entities to find a substitute.

After this check, reconstruction still needs a verified mapping back to the
pre-action road and native construction/ownership/debit qualification. Success
here does not waive those checks or enable remote gameplay.
