# Feasibility decision

## Revision — 21 September 2026

The user has authorized a native engineering track; the earlier script-first
restriction is superseded. See [native-integration.md](native-integration.md)
for current artifacts and qualification gates. This authorization is not vendor
endorsement or a licence interpretation. Historical findings below are retained
as dated evidence, not a current prohibition on original native development.
Native command/simulation hooks and cross-machine determinism remain unverified.

Assessment date: 2026-09-13. Installation inspected read-only at
`E:\Steam\steamapps\common\Transport Fever 3`.

## Decision

| Approach | Decision | Evidence-led reason |
|---|---|---|
| Script only | No-go for multiplayer proof | The typed API exposes runtime scripts, state, events and commands, but no socket/HTTP/P2P transport and no local built-in command veto/defer API was found. |
| Standalone helper + script | Conditional go for a no-op userdata IPC probe; end-to-end proof remains unproven | The GUI API documents custom userdata load/save and first-party GUI code uses it. A custom vehicle-window action can avoid optimistic built-in mutation, while the helper remains the network authority. Runtime visibility, polling behavior, atomicity and GUI-to-game event ordering must be measured before action integration. |
| Native bridge | No-go pending express permission and verified hook | No installed EULA grants attachment/injection rights, no supported hook was found, and the licence bundle contains restrictive terms for some shipped components. No native code was created. |

This is evidence of absence in the inspected declarations, not a claim about
private engine internals. Private internals are out of scope until both legal
permission and a build-specific, fail-closed integration design are established.

## API capability matrix

All citations refer to the installed files; no declarations are copied here.

| Capability | Evidence | Result |
|---|---|---|
| Game-script lifecycle | `base\tealdef\scripts\gamescript.d.tl:55-67` declares update/postUpdate/handleEvent and GUI callbacks. `api\tealdef\api\type.d.tl:1356-1365` declares the matching script references. | Available; callback ordering relative to commands is undocumented. |
| State and events | `base\tealdef\scripts\gamescript.d.tl:40-48` exposes state get/set and subscriptions. `api\tealdef\api\engine.d.tl:399-410` describes stored game-script state/subscriptions. | Available; save/reload persistence still needs an empirical test. |
| Typed command submission | `api\tealdef\api\cmd.d.tl:588-600` documents `sendCommand`. | Available; no canonical serialization/replay API. |
| Script events | `api\tealdef\api\cmd.d.tl:780` exposes scripting send-event; `base\content\landmarks\landmarks.script.tl:60-61` uses it. | In-process only, not machine networking. |
| Timing | `api\tealdef\api\engine.d.tl:423-436` defines `tickCount` (even while paused) and `updateCount` (not while paused). | Available; cross-instance behavior unproved. |
| Simulation speed | `api\tealdef\api\cmd.d.tl:704-708` defines `GameSetSpeed`; `api\tealdef\api\engine.d.tl:413-420` describes speedup including zero/pause. | Command exists; native UI speed changes cannot be intercepted by documented API. |
| Players and ownership | `api\tealdef\api\cmd.d.tl:688-693` creates a player entity. `api\tealdef\api\engine.d.tl:20-29` describes account data; `:845-850` defines PlayerOwned. `cmd.d.tl:680-685` assigns an entity to a player. | Promising; distinct starting balances/invariants require a real-save test. |
| Candidate action | `api\tealdef\api\cmd.d.tl:931-936` documents vehicle stop/start; `api\tealdef\api\type.d.tl:425-432` exposes running/stopped state. | Preferred reversible action after interception is solved. |
| GUI communication | `api\tealdef\api\gui.d.tl:50-57` sends a GUI event to game scripts and returns a result. `base\tealdef\gui\game_bar\game_bar_widgets.d.tl:29-31` declares the game-bar extension; `base\tealdef\scripts\react.d.tl:261-265` declares plugin registration. The installed `base\content\gui.zip` entries `gui/game_bar/game_bar_display_earnings_plugin/game_bar_display_earnings.res.lua` and `.script.tl` demonstrate the `react-plugin ::GameBarInfoDisplayExtension` plus `RegisterPluginRecipe` lifecycle. | A source status-panel plugin now follows this verified public pattern and is ready for controlled runtime review. These APIs do not intercept built-in gameplay UI. |
| Userdata IPC candidate | `api\tealdef\app.d.tl:137-157` declares custom userdata load/save/list operations and `:205-206` exposes the userdata root. Installed first-party GUI source in `base\content\gui.zip`, including `gui/map_editor/map_editor.tl` and `gui/menu/mod_selector_page.tl`, calls these APIs. | Credible process boundary for bounded metadata files. It is not a network API and has not been runtime-probed from a game-bar plugin or external writer. |
| Owned custom action UI | `base\tealdef\gui\entity_window\vehicle\vehicle_eow.d.tl:17-33` exposes a vehicle extension parameter with entity ID and ownership state through `eow_extension_util.d.tl:3-16`. First-party vehicle resources use `react-plugin ::VehicleEowExtensionPoint` with ownership conditions. | A mod-owned button can submit a request without first applying the built-in stop/start action, avoiding the currently unavailable built-in UI interception hook for the narrow proof. Runtime implementation follows only after the IPC probe. |
| Networking/interception | Search of `api\tealdef` and `base\tealdef\scripts` found no relevant socket, HTTP, WebSocket, replication, replay, command interception/cancel/defer declaration. | Direct script networking and built-in command interception remain absent. The userdata/custom-action design may avoid both for the selected proof and must fail closed if its probe fails. |

The first-party example `mods\release\urbangames_tycoon\mod.json:7-15`
registers only a post-run script, and its `content\mod.script.tl:4-8` modifies a
company-growth resource. It does not demonstrate runtime networking or
interception.

## Licence and attachment boundary

Only `E:\Steam\steamapps\common\Transport Fever 3\LICENSE.txt` was found by a
recursive legal-file search. No game EULA, Terms, Legal, Notice, or Readme file
was present. The file starts with Urban Games' all-rights-reserved notice
(`LICENSE.txt:1`) and then labels third-party open-source licences
(`LICENSE.txt:14`). It is not an affirmative modding or attachment licence.

Some included NVIDIA terms retain rights and prohibit unlicensed use or
distribution (`LICENSE.txt:2211-2214`), limit distributable portions
(`:2247-2255`), and restrict reverse engineering and ungranted derivative work
(`:2338-2343`). Those clauses must not be generalized to every game component,
but they reinforce the decision not to inject, patch, proxy, extract, or
redistribute installed binaries.

Safe scope now: wholly original project files, separate process, localhost by
default, no game-file redistribution. Urban Games' official TF3 support page
states that mods are supported, and its July 2026 modding article says manual
mod installation will remain available and describes extensive scriptable UI:

- https://www.transportfever3.com/support/
- https://www.transportfever3.com/news/dev-blog-episode-5-highlights/

That is affirmative evidence for a normal source-mod review workflow, but not
permission for injection, process attachment, binary patching, or private API
use. The beta's applicable click-through EULA is still absent from the installed
files and must be checked before any native bridge work. This is an engineering
risk decision, not legal advice.

## Smallest blocker-clearing experiment

After explicit user authorization, run the controlled Safe Mode load review.
If the status panel succeeds, add a no-op userdata probe that writes only a
bounded nonce/counter through `app.saveUserdata`, has the helper read it without
executing Lua, writes an allowlisted response atomically, and has the GUI load
and display that response. Do not submit any TF3 gameplay command during this
probe. The exact procedure and stop conditions are in
`docs/userdata-ipc-experiment.md`.

Only after that pass should an owned vehicle-window button and scheduled
game-script event be implemented. If the file boundary or event ordering fails,
ask Urban Games for a supported alternative and do not add a native bridge
without the applicable beta EULA and express permission.
