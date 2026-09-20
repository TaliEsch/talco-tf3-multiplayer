# UI restriction hotfix — 2026-09-18

User runtime evidence: `API is currently restricted`, starting at
`getAllUserdata` in the status panel's engine-state callback. This invalidates
the earlier assumption that GUI userdata declarations alone establish access
inside this callback.

Read-only inspection of installed base/content/gui.zip confirms that
engine_react_util.useStepStateTimer invokes its callback through
react.onStepTimer, which queues deferred steps. The declaration at
base/tealdef/scripts/react.d.tl:400 explicitly describes restricted APIs for
deferred steps. Moving the file exchange to another timer would not fix it.

Removed all panel userdata calls and restored read-only clock sampling. The
panel now reports bridge unavailable. Added a package regression check for
restricted userdata calls. The helper's experimental file worker still exists,
but no live game exchange or gameplay synchronization is claimed. A permitted
callback must be established before reconnecting it.

TF3 has not been launched or reloaded by the assistant. This change removes
the reported failing call path; runtime validation remains with the user.

## Regular-step workaround

Installed `gui/main/react.lua` forwards `react.onStep` directly to the recipe
context, unlike `onStepTimer` which calls `enqueueDeferredStep`. Installed
`gui/map_editor/map_editor.tl` calls `app.getAllUserdata` inside `react.onStep`.
This is evidence for trying the regular callback, not proof that every userdata
operation is permitted for a mod in the game UI.

The panel now keeps engine-clock sampling in the restricted reader and performs
the telemetry exchange in a protected regular `onStep` callback, once per 30 UI
steps. All file API calls are inside `pcall`; on an exception the bridge stops
trying until the script is reloaded and displays a file-access failure. No
notifications, gameplay commands, network sockets, or automatic reloads are
introduced. Existing nonce and acknowledgment checks remain in use. Very low
frame rates can cause the helper's five-second stale timeout.

The automated suite (42 checks) covers the helper protocol and structural
regressions: userdata outside the isolated exchange, exchange in the engine
reader, and removal of the failure latch. These checks are not a Teal compiler
or an in-game runtime test. No TF3 launch or reload was performed.

User-controlled test: select Host or Join in the launcher, then launch/load the
mod-enabled save yourself. Expect `bridge connecting`, then `bridge connected /
diagnostics`. `helper offline` means no bridge configuration was found in the
game's userdata directory; `bridge disconnected` means no recent acknowledgment;
`bridge unavailable / file access failed` means the protected attempt failed.
Connection confirms telemetry only, not synchronized multiplayer gameplay.
