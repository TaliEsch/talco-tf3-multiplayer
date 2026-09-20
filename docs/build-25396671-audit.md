# Static compatibility audit: Steam build 25396671

## Runtime correction after this audit

The user's engine-probe attempt at 18:36:06Z timed out. Installed
`local/crash_dump/stdout.txt` subsequently shows repeated engine update errors:
`attempt to call field 'info' (a nil value)`, in our script at line 33.
This audit missed the logging API. `base/tealdef/scripts/log.d.tl` declares
`message(string)`, `verbose(string)`, `warning(string)` and `error`, not `info`.
Source now uses a protected `log.message` call; a package regression test rejects
`log.info(...)`. This prevents diagnostic failure from blocking `state:set`.
The change still needs staging after TF3 closes and an in-game probe retry.
The earlier static result must not be read as a complete script correctness audit.

Audited 2026-09-18, installed branch `beta_4`, app 3493540. Steam's installed
build and target build both report 25396671. Executable SHA-256:
`a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`.

Result: no declaration mismatch found in the interfaces used by the current
diagnostic mod. This hash is recommended for helper/diagnostic testing and is
classified `static-api-audit`, with `gameplayVerified: false`. Unknown builds
remain allowed; peers must still match the host's actual executable hash.
No game was launched, runtime probe executed, or game-install file changed.

## Evidence inspected

Paths are relative to `E:/Steam/steamapps/common/Transport Fever 3`.

| Area | Installed evidence | Result |
|---|---|---|
| Userdata | `api/tealdef/app.d.tl:141,147,157,206` | Load/save/list/root declarations fit the bridge calls. File hash equals the September 16 audit. |
| Clocks | `api/tealdef/api/engine.d.tl:425-437,1690` | Component access and integer tick/update counts remain present. Tick counts advance while paused; update counts do not. The overall declaration file changed; no claim of a full API diff. |
| Event submission | `api/tealdef/api/cmd.d.tl:1-10,598-600,781-788` | Typed script-event command and optional callback fit the probe. GUI commands run in a later simulation step, unlike immediate engine-state commands. |
| GUI receipt | `api/tealdef/api/gui.d.tl:50-57` | GUI-script events can return values; receipt aggregation shape still needs runtime confirmation. |
| Script lifecycle | `base/tealdef/scripts/gamescript.d.tl:40-68` | State, event subscription, engine and GUI handlers remain available. File hash equals the September 16 audit. |
| React | `base/tealdef/scripts/react.d.tl:262,291-304,400` | Plugin/state/regular-step declarations fit the panel. Deferred steps remain restricted. |
| Clock sampling | `base/tealdef/gui/main/engine_react_util.d.tl:20-24` | Generic reader and optional interval match the read-only timer. |
| Panel extension | `base/tealdef/gui/game_bar/game_bar_widgets.d.tl:30` | The zero-argument extension point remains declared. |

Read installed `base/content/gui.zip` entries in memory: `gui/main/react.lua`
still sends regular `onStep` directly to the recipe context and wraps timer
callbacks in `enqueueDeferredStep`; `gui/main/engine_react_util.tl` retains the
state timer; `gui/map_editor/map_editor.tl` still uses userdata listing inside
regular `react.onStep`. No proprietary source was copied into the project.

## Declaration fingerprints (SHA-256)

- app.d.tl: `dc6cfb79170131d944e36b182bf0dd6df779225f817256bb4710005b3b629a56`
- engine.d.tl: `7e524d16108fc5f0663397d4001d46ab1386ec3e340af7d4e5a7edbe47fa237a`
- cmd.d.tl: `7bb6eb57b3915d7f0d9bad615f28e8a920613c7b8f98cd864f0c28916672c766`
- gui.d.tl: `03326a59f342682720c991b82775dcbefb944786ba0b98aee22c6f7836b55d58`
- gamescript.d.tl: `67d326b893b3eb5187c26338d1dc40d5b46c3d9212463767aa03c18201fdc463`
- react.d.tl: `086f0b0edc43b11a42c56867c7161b935aee0d36cd523cbad19719189a69ccae`
- engine_react_util.d.tl: `f4c0d534743ad69726952c876ebecb15ae02ea1cbcae9d9294dcfe5bd89d2e31`
- game_bar_widgets.d.tl: `3eefd80acb917a5021d6453b81a936af25e3ed513ff1c39db1bd9c11effc07bc`

## Limits and session-status finding

The user previously confirmed telemetry, but that screenshot alone is not tied
to this exact executable hash. The engine probe is explicitly untested. No Teal
compiler, two-instance test, deterministic gameplay test, or security audit of
the entire executable was performed. API presence does not prove every callback
permits every call.

The supplied launcher screenshot says `Session ended` plus an unaudited-build
advisory. Source inspection shows the advisory only appends text in `SetStatus`;
it does not end a session. `Session ended` is the fallback when the helper exits
without a retained failure reason. No persisted launcher log was found in the
project; the Debug log is in memory. Its final lines are needed to diagnose the
exit. Updating this audit cannot be claimed to fix that separate failure.
