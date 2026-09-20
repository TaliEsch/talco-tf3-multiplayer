# Supported UI replacement investigation — 19 September 2026

Read-only inspection of the installed build identified a supported route missed
by the previous audit. The user does not need to answer engine API questions.
This corrects the earlier conclusion that vendor clarification was the only next
step. These are source findings, not successful TF3 runtime tests.

## Public entry point

- `base/tealdef/scripts/react.d.tl:422–443` declares
  `ReactReplacementApi.ReplaceRecipe` and `ReactReplacementConfigDesc`.
- In `base/content/gui.zip`, `gui/main/bootstrap_game.tl`,
  `getReplacementConfigs` loads generic resources of type
  `react-replacement-config`, sorts their `order`, resolves the script function
  from `filePath` and `doReplaceFn`, and passes it the replacement API.
- The mod should register an original `.res.lua` resource with that type and a
  data record containing those fields, pointing to its own `.script.tl`.
  This does not require modifying installed game files or calling private APIs.
- `react.CallOriginalRecipe` is public, but explicitly excludes builtins
  (`react.d.tl:279–284`; `gui/main/react.lua:457–465`). A replacement must
  preserve the original parameter and provided-API contract.
- Replacements are registered before recipe execution. Do not attempt dynamic
  replacement registration after the UI starts. Change mod-owned state inside
  the installed replacement instead.
- `gui/main/react.lua:445–454` stores one replacement per recipe. This is not
  a middleware chain. A later replacement can supersede ours, and calling the
  original bypasses replacements. Compatibility/admission must account for this;
  do not claim arbitrary GUI-mod compatibility or inspect private tables to
  enforce it.

## Concrete native-control coverage

| Native path | Public boundary found | Limitation / implementation choice |
|---|---|---|
| Vehicle window Stop/Start | `EntityWindowUtil.ActionButtonBar` | Clone the button arrays/records and wrap the selected action callbacks; do not mutate caller parameters. Recheck the restriction at callback invocation, including callbacks captured before activation. |
| Manager bulk Stop/Start | `ManagerWindow.ManagerWindowContent` | The leaf bulk-action recipe is local; its button is built by a plain function. A compatible replacement of the exported content recipe can offer a restricted mod-owned view. Wrapping ActionButtonBar alone does not cover this path. |
| Generic send-command buttons | `EntityWindowUtil.SendCommandButton` | Exported, but not a global interception point. Its command factory has a non-nil command return contract; do not return nil as a speculative veto. |
| Visible speed controls | `GameBarWidgets.GameSpeedControl` | Replacement of the visible control does not remove root keyboard/controller handlers or the private speed helper's automatic writes. |

Supporting locations: `base/tealdef/gui/entity_window/entity_window_util.d.tl`
defines ActionBarButton/ActionButtonBarParams at 44–68 and SendCommandButtonParams
at 142–149. In `gui.zip`, `gui/entity_window/entity_window_util.tl`,
ActionButtonBar consumes the supplied callbacks; SendCommandButton at 2438 uses
an engine step-state commit. The native vehicle action tag is
`entityWindow.vehicle.startStop`; manager bulk action tag is
`menu.management.startStop`.

`base/tealdef/gui/line_vehicle_mgmt/manager_window.d.tl` exports
ManagerWindowContent as a parameterized recipe, without a provided API.
Its implementation starts at `gui/line_vehicle_mgmt/manager_window.tl:5896`;
ManagerToolWindow invokes it at 8222. Replacing only its content preserves the
outer window's close/back handling. Already-open windows, popovers, keyboard
routes and already-submitted commands still need explicit runtime checks.

## Answers to the earlier investigation questions

1. **General command veto:** still not found in the inspected public interfaces.
   Do not depend on one. Use supported replacement of individually audited native
   action surfaces and a narrow supported gameplay set. Mission proposal hooks
   remain unproven as a general pre-mutation veto.
2. **Shared enable-rule restoration:** no getter/token was found. Recipe-local
   callback restriction avoids writing/resetting that shared map for covered
   controls. The absence of a getter is therefore not itself a project blocker.
3. **ToolStack ownership:** no getter/token was found. The setter is not enough
   to claim a command firewall. Construction needs its own supported boundary;
   it is not covered by the vehicle/manager replacements above.
4. **Speed ownership:** `gui/main/game.tl:617–719` declares GameSpeedHelper as a
   local recipe. Its automatic recommit is conditional on requested speeds 2–4
   (687–689). A first 0/1-speed capability scope avoids that particular clamp
   path, provided all other speed writes are restricted and observed. This is
   not proof of exclusive ownership or support for fast-forward. Do not replace
   the singleton root or manufacture access to the local recipe.
5. **Load identity:** `base/tealdef/scripts/gamescript.d.tl:54–69` has update,
   postUpdate and event callbacks, not a load callback. GUI reinitialization can
   invalidate a session, but is not proven equivalent to engine save loading.
   Keep persistent unknown/duplicate barriers and require fresh session readiness;
   saved receipts must never authorize automatic replay.
6. **Engine-side expiry stop:** `api/tealdef/api/cmd.d.tl:2–9` explicitly documents
   immediate command effects/callbacks on engine states, unlike queued GUI
   commands. This supports investigating an engine update watchdog without
   asking the user about API semantics. Actual expiry timing, callback results
   and stopped-state persistence still need runtime verification. The existing
   explicit stop diagnostic is not that autonomous watchdog.

## Implementation direction and acceptance

Use the public replacement configuration, with original mod-owned code. Start
with ActionButtonBar callback guards and the restricted manager content. Keep
normal single-player delegation separate from an explicitly armed multiplayer
mode; losing the helper must not silently restore native mutation controls.
Do not bypass other mods' replacement rules by claiming composability that the
engine does not provide. A session must start from a known supported UI/mod set.

Before staging a coherent batch, verify resource validation and recipe signatures,
parameter immutability, callback-time checks, normal-mode delegation and failure
latching. Then include open-window, keyboard/controller, helper-loss and recovery
checks in one bounded game session. Rendering a greyed-out button is insufficient.
Remote gameplay stays disabled until real command-consumer and barrier gates pass.

No game was launched, no mod was staged, no vendor was contacted and no production
runtime code was changed for this investigation.
