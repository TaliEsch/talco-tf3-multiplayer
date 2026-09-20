# Simulation-thread bridge test — 18 September 2026

## Confirmed engine round trip and next timing test

User evidence: `engine_probe_started` at 18:45:36.549Z followed by
`engine_probe_succeeded` at 18:45:37.667Z, tick 56726/update 2438. This confirms
the immediate diagnostic route after the subscription fix; it does not prove
scheduled execution or multiplayer.

Launcher source 0.6.3 adds **Test scheduled update** alongside the existing
immediate engine test. Run the simulation at normal speed, wait for a connected
bridge, then click it once. It schedules a no-op for the last observed update
plus 60. The game script waits for equality with that target, or returns `late`
if it has passed, or `clock_reset` if its clock moves backwards. The helper
checks the nonce, request, target, outcome and actual update; a receipt cannot
claim success merely because its handler ran. The timeout is 60 seconds.

Expected result: `timing_probe_succeeded` with identical `scheduledUpdate` and
`updateCount`. A failed/timeout result is evidence to investigate, not permission
to relax exact-update execution. A paused simulation will not reach the target.
Helper shutdown, timeout, or bridge loss removes its mailbox. Any already queued
game no-op may still finish later, but it cannot change gameplay, and its old
receipt cannot satisfy a newer request/session.

66 automated tests pass, including synthetic scheduling success, late/reset
failure, invalid correlations, timeout, and rejection of impossible success
receipts. These are helper tests, not execution of the Teal scheduler. TF3 was
not launched or reloaded by the assistant. Cross-instance timing, pause barriers,
real company mapping, and vehicle action replication remain unimplemented or
unverified as described in the completion audit.

Startup samples from an earlier helper nonce are now ignored without flooding
the log. Other malformed sample warnings are rate-limited to one per five
seconds; neither kind is acknowledged as valid telemetry.

## Receipt subscription correction

User tests at 18:41:36Z and 18:41:59Z still timed out after the logger fix.
The current game log now shows successful `tf3mp_diagnostic` output instead of
the previous repeated logger errors. No receipt file was present.

Inspection of installed `base/content/game_mechanics.zip`, entry
`game_mechanics/company/company.script.tl`, shows its engine state explicitly
subscribes to the GUI event names handled by `guiHandleEvent`. Our script only
subscribed to the engine probe event. Source now also subscribes to receipt and
status queries. A persisted subscription-version field ensures existing saves
with the old nonempty subscription set receive the additional registrations.
This is a concrete omission corrected, not a claim the runtime round trip has
passed. Repeat the user-controlled test after restaging with TF3 closed.

Telemetry is user-confirmed in the current game. This adds a separate, manually
triggered test of helper → GUI → simulation script → GUI → helper. It is not
gameplay replication, deterministic scheduling, or a two-player test.

## User-controlled test

1. Close the previous launcher and open `TF3MP-Launcher.exe` (0.6.2).
2. Start Host (or Join), then launch TF3 yourself and load the mod-enabled save.
3. Wait for `bridge connected / diagnostics` in the bottom bar.
4. In the launcher, open Debug and click **Test engine bridge** once.
5. Expect **Engine bridge test passed** in the launcher and `engine test passed`
   in the game bar. If it times out, try with the simulation running. Keep the
   Debug output and any game error for investigation; do not infer success.

The assistant has not launched/reloaded TF3 or invoked this test against it.
No second machine is needed for this local adapter test.

## Contract and safeguards

The local stdin command `engine-probe` is not a network command. The helper
requires fresh telemetry, publishes a fixed-schema `engine_request.lua` with
its existing random session nonce and an increasing request ID, and permits
only one outstanding test. No arbitrary command names or Lua are accepted.

The regular GUI callback validates the request and sends a single namespaced
`makeScriptingSendEventCmd`. `handleEvent` checks source/id/name, nonce shape,
and request ID, then records the current engine clocks in this mod's state.
The GUI reads the receipt with `fireGuiScriptEvent` and writes a fixed-schema
`engine_receipt.lua`. Direct or one-level collected GUI return tables are
supported, but that return shape still needs runtime verification. Only the
matching nonce/request can acknowledge the outstanding helper test.

Dispatch is marked before sending and never automatically retried. A caught
probe exception disables probe dispatch for that helper nonce without disabling
telemetry. Timeout/disconnect removes the request; shutdown removes both test
mailboxes. A late engine event can only update diagnostic state, not gameplay.
The nonce correlates this local exchange; it is not protection from another
local process or mod with the same userdata access.

Static API evidence: installed `api/tealdef/api/cmd.d.tl` documents script-event
submission; `api/tealdef/api/gui.d.tl` documents returned GUI-script events;
`base/tealdef/scripts/gamescript.d.tl` documents event subscriptions and engine
versus GUI state. No installed game sources were copied into the mod.

Automated helper tests cover offline/busy rejection, mismatched/stale receipts,
malformed input, successful synthetic receipt, timeout, and shutdown. They do
not compile Teal or prove the engine executed the event. Before gameplay writes,
we still need this runtime result, authoritative entity ownership, synchronized
scheduling/pause barriers, and desync recovery.
