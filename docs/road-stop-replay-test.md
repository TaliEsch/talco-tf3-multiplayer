# Normal road-stop capture and reload/replay

This checks the native replay path, **not full Phase 2 acceptance**. It does not
prove a second company's working service, income or operating expenses. Use a
disposable save and keep the same launcher window open throughout. Do not run
the legacy coordinate service setup in this session.

1. Select the untouched pre-action save in Host. Manually load that exact save
   with the staged TalCo mod, pause, and wait for the bridge to connect. Do not
   overwrite the selected save or place anything before recording.
2. In Debug, expand **Advanced — Road stop replay**. Click **Record checkpoint**
   and confirm. Wait for the checkpoint-recorded message.
3. Use the game's normal roadside-stop tool to place exactly one stop. Keep the
   game paused and make no other changes. Wait a few seconds for capture to be
   exported, then click **Capture placed stop**. Wait for “Replay case captured”.
4. Click **Stop helper**. Manually reload the original, untouched save without
   saving the placed stop. Start a fresh solo Host using the same selected save.
   Leave the game paused and wait for the bridge to connect.
5. Click **Load replay case**. After the helper confirms readiness, click
   **Confirm replay** and read the confirmation. It can build and charge once for
   the company captured in step 3. This is deliberately not an ownership transfer.
6. Leave TF3 paused. Expected limited result: `road_stop_replay_result` with
   `code: ROAD_STOP_OWNER_AND_DEBIT_OBSERVED`, `outcome: verified`, and a positive
   `stopEntity` and `chargedCost`. Visually check the stop. Copy the result log.

On a timeout, rejection, crash or unknown outcome, stop the helper and inspect
the game; do not press replay again, delete its request file or assume it did
nothing. The request file and engine latch intentionally prevent duplicate
construction. No automatic rollback, retry, save loading or save writing occurs.

Records live under `reports/road-stop-replay/<recordId>/`. They are local test
data, not source-control artifacts. A file-hash match does not establish which
save TF3 loaded; the manual reload confirmation and engine baseline checks are
both required. Full Phase 2 still requires two independently owned services and
verified purchase, operating-cost, revenue and insufficient-funds behavior.
