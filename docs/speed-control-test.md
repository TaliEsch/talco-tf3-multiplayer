# Temporary native speed-control diagnostic — launcher 0.6.15

Local normal path and orderly-helper-stop cleanup verified in user reports on
19 September: held update 2916, visible buttons greyed, explicit restore/resume,
then separate stop-helper test unlocked immediately without resuming simulation.
Keyboard/controller coverage and forced-crash expiry remain unverified.
Single game, disposable save, solo host.
This test changes only the GUI GameSpeedControl feature flag; it neither changes
simulation speed nor blocks building, vehicle commands or other mods.

## Normal path

1. Start a fresh solo host, load your disposable save yourself, leave speed at 1x.
2. Debug → Test exact-update hold. Wait for `pause_test_held`.
3. Debug → Test speed controls; confirm. Wait for `control_test_locked`.
4. Try ordinary pause/resume and speed buttons and your normal speed keyboard
   shortcuts (controller too if available). The simulation must remain paused.
   Report which inputs you tried and whether any worked. A flag acknowledgement
   alone does not prove that controls are blocked.
5. Click Restore speed controls. Wait for `control_test_released`.
6. Click Release pause test. Expect `pause_test_passed`; normal speed controls
   should work again. Stop helper before ending/reloading the game.

If any speed input advances simulation, stop the helper. Do not continue or
retry the held action. Report the input and log. Multiplayer stays disabled.

## Cleanup path (separate fresh helper/test)

Repeat steps 1–3, then click Stop helper without restoring/releasing first.
The simulation should stay paused. Within several seconds normal controls
should return; resume manually. This tests cleanup, not a synchronization pass.
If controls do not return, exit to the main menu or close the game without
overwriting your save. Never assume restoration from helper shutdown alone.

## Limits

The installed getter returns the live GUI feature map. This diagnostic temporarily
changes only one field and preserves its prior nil/false value. It refuses a
pre-existing speed restriction or GameSpeedPause, detects map replacement and
attempts cleanup on explicit release, request/config removal, stale helper
acknowledgements, callback failure and UI unmount. It never sets GameSpeedPause,
whose semantics can resume simulation.

There is no documented ownership token for this map: another writer setting the
same true value on the same table cannot be distinguished. Restoration can also
fail if the GUI stops executing. This is an isolated compatibility experiment,
not production-safe coexistence with arbitrary missions/mods or a command firewall.
Do not enable other diagnostics, reload, join players or use a valuable save.
