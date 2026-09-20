# Static compatibility audit: Steam build 25304653

Audited 2026-09-16. TF3 was not launched, as requested by the user. No game
installation or staged-mod files were changed. This supersedes the executable
mismatch finding in review-2026-09-16.md; its other open findings remain.

Accepted scope: helper networking, save transfer and experimental diagnostic
userdata bridge. Gameplay synchronization and the updated mod's runtime load
are unverified. This audit inspects the current declarations and relevant
first-party patterns; it is not a byte-for-byte comparison with the old API.

Steam appmanifest_3493540.acf identifies build 25304653, branch beta_4.
Executable SHA-256:
`e9dd1e2bce6e4e9e52dbe3228b65d82657636700807680b36a580453a4757686`.

## Inspected interfaces

Paths below are relative to the installed Transport Fever 3 directory.

| Interface | Current evidence | Assessment |
|---|---|---|
| Custom userdata | api/tealdef/app.d.tl:137–157, 205–206 | load/save/list/root signatures match calls in panel bridge |
| Game clocks | api/tealdef/api/engine.d.tl:423–436 | tickCount and updateCount are integers; paused-clock distinction remains documented |
| Script state and lifecycle | base/tealdef/scripts/gamescript.d.tl:40–72 | State get/set, update, GUI update and GUI events remain available |
| GUI polling | base/tealdef/gui/main/engine_react_util.d.tl:20–24 | Timer callback and interval signature match the panel |
| Plugin registration | base/tealdef/scripts/react.d.tl:262 | Zero-parameter extension registration returns Recipe0 |
| Game bar extension | base/tealdef/gui/game_bar/game_bar_widgets.d.tl:30 | GameBarInfoDisplayExtension remains ExtensionPoint0 |
| Bundled examples | base/content/gui.zip | Earnings plugin still returns BoxLayout; map editor and mod-selector GUI still call custom userdata load/save/list APIs |

Only relevant archive entries were read in memory; first-party source was not
copied into this project. No external Teal compiler was found or run. The
project package validator is a structural check, not TF3's Teal type checker.

## Evidence fingerprints

- app.d.tl: `dc6cfb79170131d944e36b182bf0dd6df779225f817256bb4710005b3b629a56`
- engine.d.tl: `ffb5b3a70470939947fb898f2032f80f2424ecff39c33b54d6f9cc6a1e16627a`
- gamescript.d.tl: `67d326b893b3eb5187c26338d1dc40d5b46c3d9212463767aa03c18201fdc463`

## Remaining runtime checks

Actual userdata serialization format, visibility after atomic replacement,
missing-directory behavior, GUI responsiveness, and bridge acknowledgements
must be verified when the user chooses to run TF3. Automatic save loading,
company assignment, action interception and synchronized command execution
are not established by this audit. Unknown executable hashes still fail closed.
