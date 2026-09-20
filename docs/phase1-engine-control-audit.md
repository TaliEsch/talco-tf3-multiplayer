# Phase 1: engine-control audit, 19 September 2026

Installed files inspected read-only. No game source copied into the project,
game commands sent or TF3 process launched.

## Evidence and limits

Current runtime evidence: immediate pause/event/resume, exact-update hold, and
combined held vehicle action have passed locally in user logs. The combined
run held and applied at update 2919, then explicitly resumed to update 2922.
The user subsequently verified visible speed restrictions/restoration and the
guided held-action/snapshot/resume batch. See ROADMAP.md for exact run evidence.

## Current native-control follow-up

Latest finding: public recipe replacement is available and was missed in the
earlier audit. See `phase1-recipe-replacement-investigation.md` for concrete
vehicle-window/manager boundaries and limits. Earlier statements requiring
shared-rule getters or vendor clarification are not exhaustive alternatives.

### Concrete bypass and supported alternative found

#### Mission-framework follow-up

The subsequent read-only search of `gui.zip`, `scripts.zip` and `base.zip`
found no script implementation consuming `builder.proposalCreate` /
`builder.proposalApply` return values. The construction GUI has onProposalApply
notifications, which are not a veto contract. Builtin construction-action
declarations identify native builder descriptors but do not establish the
missing ordering/return-value semantics. This is a limit of available evidence,
not a claim that the native game has no such mechanism.

Feasibility decision: do not enable replication, blindly reset shared GUI rules,
or describe the intermediate diagnostic build as the complete Phase 1 test.
The next gate-changing evidence must establish supported native input ownership
and restoration (or supported pre-command routing), including the Start/Stop
paths identified below. Vendor clarification or a separately agreed, bounded
runtime capability experiment is needed. A simulated callback test cannot answer
how the native builder consumes the result. Existing implementation is preserved;
no game files were changed and no external query was sent.

The follow-up search across **both** API and base declarations found
`MissionInterface.Task.getEnableRules` at
`base/tealdef/mission/mission_framework/mission_interface.d.tl:364`.
This is a task callback that supplies rules, not a getter for current GUI rules.
`base/content/mission.zip`, `mission/mission_sim.script.tl:957,1061–1067`
collects active task rules into a mission-owned map, removes vanished entries
with nil and reapplies active entries. This is a concrete shared writer; it
confirms why independent direct-set/reset calls can conflict. It also supplies
a supported lifecycle pattern to investigate through mission task integration,
without treating another script's private saved map as ours to edit.

The same mission script's `guiHandleEvent` (lines 811–845) handles
`vehicleStore` / `mission.buyVehicle` and delegates builder events to
`handleProposalCheck` (lines 220–295). The latter recognizes proposalCreate and
proposalApply names and returns error/warning tables. Its task callbacks receive
`isApply`; this must not be mistaken for proof that every apply notification
occurs before mutation. Next audit must locate the builder dispatch/return-value
consumer and establish the pre-apply boundary before implementing rejection.

GUI purchase call sites also vary: the manager clone path checks a returned
mission error before proceeding (`gui/line_vehicle_mgmt/manager_window.tl:8512`),
whereas the cart acceptance path (`vehicle_store_window.tl:4231`) stores a return
then calls onAccepted. Earlier UI validation may gate that path, but this call
alone is not a purchase veto. These are **specific public-event alternatives**,
not a general command interception API. They warrant further inspection before
requiring vendor assistance; the Start/Stop bypass remains unresolved.

Additional read-only inspection of the installed GUI archive confirms that
locking speed or construction tools does not cover the already-open vehicle UI:

| Source in `base/content/gui.zip` | Relevant behavior |
|---|---|
| `gui/entity_window/vehicle/vehicle.tl:322–338, 412–423` | Start/Stop creates a native command via useStepState; its action is shown when the vehicle is locally modifiable. It does not consult this mod's host admission or speed lock. The action tag is `entityWindow.vehicle.startStop`. |
| `gui/entity_window/vehicle/vehicle.tl:358–363` | Sell checks protectedEntities, unlike the adjacent Start/Stop command constructor. Entity protection cannot be assumed to block all vehicle actions. |
| `gui/line_vehicle_mgmt/manager_window.tl:5027–5047` | Selected-vehicle Start/Stop directly submits native commands. The button is enabled for a nonempty selection and uses tag `menu.management.startStop`. |
| `gui/line_vehicle_mgmt/vehicle_react_util.tl:350–354` | Vehicle purchase uses the native local player as payer. A menu-only lock cannot make this a host-authoritative purchase. |

`api/tealdef/api/gui.d.tl:379–425` exposes `api.gui.byId.setEnabled(idOrTag,
enabled, idOnly)` and a nil override reset. This is a **supported candidate**
for restricting those tagged controls without patching game files. It must not
be overlooked in favor of private hooks. However, the complete declared ById
interface has no getter for an existing enable override, no ownership token and
no conditional remove. Visibility getters do not answer whether an enable rule
was already installed. Setting nil is not restoration of an unknown prior rule.
The inspected GUI archive contains no use of byId.setEnabled demonstrating a
scoped acquisition/restoration convention.

Implication: supported setters exist, but a safe, complete restriction lifecycle
is still unproven. The current build has a concrete native Start/Stop bypass,
not merely a theoretical concern. Do not wire remote gameplay or declare Phase 1
ready on the strength of its existing guided pass. Establish a supported way to
read/own the rules (or an approved scoped command interception interface), cover
open-window and keyboard/controller routes, then test conflicts and teardown.
Questions for the beta developers are in `phase1-api-questions.md`; no message
has been sent and no game files have been patched.

Read-only inspection of the installed declarations and GUI archive identified:

- `base/tealdef/scripts/builtin.d.tl:1242`: ToolStackAPI exposes
  `setActionsDisabled(boolean)`, documented to suppress tool action functions.
  `gui/main/game.tl:402` handles `disableToolActions` by calling that setter.
  This is a supported candidate for construction-tool restriction, not a
  general command interceptor. There is no corresponding getter, ownership
  token or compare-and-restore operation in that declared interface. Blindly
  calling false on cleanup could override another GUI/mission restriction.
- `gui/main/game.tl:148` handles `setMenuFilter`; adjacent handlers replace
  vehicle filters and protected-entity maps. These are shared GUI context
  replacements, not host authorization. Existing open windows and already
  queued commands must be considered separately; disabling a menu is insufficient.
- `gui/main/game.tl:648–705`: GameSpeedHelper's internal commit does not itself
  enforce GameSpeedControl. The native input handlers check the flag, but the
  exposed speed API and automatic speed-clamping path remain distinct writers.
  Automatic fast-forward clamping can run while the input flag is set.
- The inspected GameReactGlobals declaration exposes the live disable-feature
  map and tool stack, not a general command-veto registration. WindowAPI offers
  removal/opening operations, not global immutable action authorization.

Next supported investigation: a mod-owned restriction lifecycle around tool
actions and individually audited mutable windows, with explicit restoration
and conflict detection. Do not substitute a blanket overlay or menu hide for
evidence of command prevention. Until these paths and the real coordination
consumer are tested, native construction, purchases and fast-forward cannot be
advertised as synchronized. Normal-speed held-action diagnostics remain useful,
but are not the complete Phase 1 exit gate. No game files were changed.

| Installed source | Finding and consequence |
|---|---|
| api/tealdef/api/cmd.d.tl, sendCommand | May execute later or immediately depending on context. Submission is not a completed engine hold. |
| Same file, makeGameSetSpeedCmd | Simulation-speed command exists; exact hold/callback ordering needs runtime proof. |
| api/tealdef/api/engine.d.tl, GameTime | tickCount advances paused; updateCount does not. Useful observation, not command prevention. |
| base/tealdef/scripts/gamescript.d.tl | No documented general command veto or step-lock among update/postUpdate/event interfaces. |
| base/tealdef/gui/main/game_context.d.tl and disable_features.d.tl | Filters and GameSpeedControl/GameSpeedPause flags are UI candidates, not a global command firewall. |
| base/content/gui.zip: gui/main/game.tl | Keyboard/controller speed handlers check GameSpeedControl. All entrypoints still require audit. |
| Same GUI source, GameSpeedHelper | GameSpeedPause rejects zero-speed commits and can resume a paused game onStep. Never use this as a multiplayer hold flag. |
| Same GUI source, GameSpeedHelper | Fast-forward is clamped to estimated local maximum speed and may be recommitted onStep. Different machines can get different effective speeds. |

Public declarations do not establish a mod-owned lifecycle for changing/restoring
the shared feature map without competing GUI/mission writers. Do not patch
game.tl or replace the singleton GUI root. Missing public interception is an
unresolved capability, not proof that private engine hooks do not exist.

## Implemented participant contract

The model participant previously relied on its caller to keep the engine at the
completion update. It now explicitly requires synchronous adapter methods:

- `hold(updateCount)` establishes a hold at exactly that update.
- `barrierState()` returns `{held, updateCount}` from the engine adapter.
- `release(updateCount)` releases only the confirmed matching hold.

Hold is checked before checkpoint readiness, before/after application and while
awaiting completion. Release requires matching host readiness/completion and an
unchanged update. Promises from adapter reads/actions fail closed; a later
resolution cannot reopen a participant. Async integration needs a separately
designed receipt-driven adapter, not a wrapper claiming file polling is synchronous.

These checks trust the local adapter. A fabricated held=true is not engine
evidence. Model holds cannot physically pause TF3. CLI remote gameplay remains
disabled and no real TF3 adapter was introduced. Network disconnect alone does
not establish that the required `halt` operation stopped the game.

## Historical initial diagnostic (0.6.12; subsequently passed locally)

Launcher 0.6.12 implements the following as a normal-speed-only solo-host test.
See pause-barrier-test.md. It does not implement a full exact-target barrier or
native-control restrictions; the automated tests do not run TF3.

1. Fresh solo host and disposable save; explicit opt-in, no other tests or peers.
2. Capture company/clock/prior speed; persist attempt barrier before submitting
   pause once in a fresh engine event. Record callback and actual resulting state.
3. Verify stable updates with advancing ticks, then deliver a fresh session-bound
   event while paused without advancing updateCount. Missing delivery blocks design.
4. Explicit release must revalidate session and held update, restore prior
   supported speed and verify progress. Do not auto-resume after helper failure or
   unknown execution; retain manual resume instructions.
5. Test keyboard/controller speed actions and ordinary construction/control paths.
   Any bypass keeps multiplayer disabled even if the pause probe passes.

Direct-depot and purchase tests cannot clear this gate. The next implementation
must be a real opt-in diagnostic with receipts, not an unverified gameplay switch.
Stop the release path if no supported safe barrier/control mechanism is found.
