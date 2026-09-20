# Read-only pause/company observations

This batch adds optional GUI-side snapshots of GameTime, GameSpeed, the local
company entity and its balance. It issues no game commands, creates no companies
and does not enable multiplayer execution. Data goes through a separate bounded,
nonce-bound flat-file parser; the established telemetry schema is unchanged.
Read/file failures are isolated from the working bridge. Negative balances use
an explicit sign flag; unknown/infinite balances have balanceKnown=0.

## Installed API evidence (static, not runtime proof)

Inspected on 18 September 2026 under
`E:/Steam/steamapps/common/Transport Fever 3/`:

- api/tealdef/api/engine.d.tl, GameSpeed/GameTime at lines 415–437:
  speedup 0 means paused; tickCount advances per frame even when paused;
  updateCount does not advance when paused. GAME_SPEED exists in ComponentType.
- base/content/gui.zip, gui/game_bar/game_bar_widgets.tl, lines 193–239:
  first-party speed controls select 0, 1, 2, 4 through the game-speed helper.
- api/tealdef/api/cmd.d.tl, GameAddPlayerCommandData, lines 142–150:
  resultEntity is the created company/player entity. This does not establish
  how to assign local control across two loaded games or deterministic creation.
- api/tealdef/api/engine/util.d.tl, getPlayer and getPlayersBalance:
  local company and balance access; balance may be nil for infinite money.
  The balance function belongs to UtilFinance: the full path is
  api.engine.util.finance.getPlayersBalance, NOT api.engine.util.getPlayersBalance.

The declarations do NOT prove a precise pause barrier, event processing during
pause, command ordering on resume, common RNG state, or synchronized company
creation. No automatic pause/resume implementation is enabled on that evidence.

## What the observer reports

- engine_observation_connected: first valid snapshot, with company/speed/clocks.
- engine_pause_observed: at least 1.5 seconds of fresh samples at speed zero,
  advancing frame ticks and unchanged simulation updates.
- engine_resume_observed: after an observed pause, positive speed and an
  advancing simulation update have been observed.
- engine_pause_observation_unstable: updates changed across speed-zero samples.
- engine_observation_invalidated: local company changed or clocks went backwards;
  restart the helper for a new observation session. Stale/replayed samples do
  not maintain availability or establish a pause observation.

These are sampled observations, NOT a pause lock, full-state fingerprint, or
shared checkpoint. The local company's balance is not a cross-player hash.
Every diagnostic keeps gameplayVerified=false.

Runtime follow-up: the first observation build used the incorrect balance API
namespace and its protective pcall silently suppressed the failure. Corrected
the namespace and added a source regression check. GUI failures now show
"observation unavailable" in the quiet status bar; missing/rejected files are
logged as engine_observation_unavailable at most once per 30 seconds. Neither
path creates audible notifications. A brief missing-file warning during load
can be normal; engine_observation_connected indicates subsequent success.

## One focused manual check when convenient

Restart the launcher/helper to load the Node source. Use the updated staged mod
in a disposable save with no vehicle test enabled. Start Host and load the game
yourself. In launcher Debug, wait for engine_observation_connected, then use
TF3's normal Pause control for about five seconds. Resume at normal speed for
five seconds. Copy the resulting engine_pause_observed and engine_resume_observed
lines. No new Debug button is needed; observation is passive.

If no observation_connected event appears, stop and provide the logs; do not
enable remote gameplay or infer that pause failed. Optional observations may be
unavailable while the established bridge still works. No game was launched in
development; Teal runtime/type validation is still pending the manual load.
