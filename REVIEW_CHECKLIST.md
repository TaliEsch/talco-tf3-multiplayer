# Manual review checklist

This package is ready for source and controlled load review. It is not a claim
that multiplayer gameplay works. The reviewer should stop on the first failed
check and preserve the relevant local log excerpt.

## 1. Source/package review

- Confirm `mod.json`, `_content.json`, and `_metadata/modinfo.json` parse as JSON.
- Confirm `_content.json` names exactly the seven files under `content/`.
- Confirm no executable, DLL, game asset, save, credential, IP address, or secret
  exists in `mod/`.
- Run `npm run check`; all automated helper tests must pass.
- Run `node src/cli.mjs hash-game --exe <TransportFever3.exe>` and require
  `supported: true`.
- Run `node src/cli.mjs hash-mod --path mod` and record the result.

## 2. Controlled source-mod load

Only after confirming the applicable game/Steam EULA and official mod policy:

1. Use launcher option 2, or copy `mod` as `tf3mp_status_1` to this machine's
   detected per-user staging location:
   `E:\Steam\userdata\109855567\3493540\local\staging_area\tf3mp_status_1`.
   Do not place it in or overwrite the game's built-in `mods/release` directory.
2. Enable **TF3 Multiplayer Prototype — Safe Mode** for a disposable test save.
3. Load the save. Expect one Info notification titled
   **TF3 Multiplayer Prototype — Safe Mode** stating that networking and gameplay
   interception are disabled.
4. Confirm the game bar contains a **TF3MP SAFE** panel showing live `tick`,
   `update`, and `bridge OFF` values.
5. Inspect the local game log for `tf3mp_diagnostic`. The payload must be JSON
   text containing `schemaVersion`, `tickCount`, `updateCount`, and
   `bridge:"disabled"`.
6. Pause the simulation: `tickCount` should continue changing while
   `updateCount` remains fixed. Resume and confirm both advance.
7. Save, exit, reload, and confirm the counters resume and the mod does not emit
   a duplicate status notification if its state persisted correctly.
8. Disable the mod and load a separate disposable save. Confirm normal
   single-player behavior and no `tf3mp_diagnostic` entries from that session.

## 3. Failure criteria

Fail review if the game rejects any resource, the notification is absent, the
log contains a Teal/runtime error, counters contradict documented clock behavior,
state fails to persist, disabling the mod affects unrelated behavior, or the
executable/mod hashes differ from the recorded compatibility matrix.

Do not proceed to networking/game-action experiments from a failed status-mod
review. Do not install hooks, inject code, patch binaries, or change the firewall.
