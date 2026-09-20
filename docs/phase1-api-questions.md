# Phase 1 supported-API questions — draft, not sent

Superseded as a user-facing blocker by our own source investigation in
`phase1-recipe-replacement-investigation.md`. That document answers the questions
where evidence exists and records the remaining runtime checks. Do not ask the
user to answer these engine implementation questions.

Context: an original script-only multiplayer prototype uses a local helper and
GUI-to-engine events. Local exact-update pause, held vehicle Stop/Start, selected
state reads and event-driven resume have been demonstrated. We do not patch
game files or inject code. Multiplayer is not enabled.

Follow-up inspection found mission-owned enable-rule aggregation and
guiHandleProposal / mission.buyVehicle hooks. These are being investigated as
supported alternatives; the questions below concern their scope and lifecycle,
not an assertion that the game has no relevant hooks.

The remaining feasibility question is how a mod can prevent native local
commands from bypassing host authority while retaining a safe GUI lifecycle.

1. Is there a supported pre-command hook that can veto or route native gameplay
   intents before engine application, including vehicle/line manager actions,
   construction tools and keyboard/controller routes? Post-command notification
   is insufficient for purchases and construction because rollback is uncertain.
   Specifically, can an independent GameScriptWithGui participate in the builder
   proposal checks, and which events are guaranteed to run before application?
2. For `api.gui.byId.setEnabled`, can a mod read the current override, acquire a
   scoped rule, or remove only its own rule? The shipped ById declarations expose
   a setter and nil reset but no getter or ownership token. How should a mod avoid
   overriding mission/other-mod rules when unloading or after its helper fails?
3. Does ToolStackAPI.setActionsDisabled have a supported scoped counterpart or
   readable current state? Does it cover input callbacks outside the tool's
   action function, or must those be restricted separately?
4. Can a mod take exclusive ownership of simulation speed? GameSpeedControl
   gates normal input, but GameSpeedHelper also commits automatic speed clamping
   against a machine-local estimated maximum. We need an agreed effective speed,
   not independent writes by each client.
5. Is there a supported game-script load/session-generation callback or identity
   for distinguishing restored state from a live session? Saved operation
   receipts must never grant permission to replay uncertain work after reload.
6. Is an engine-side lease-expiry stop from update/postUpdate supported, including
   exact callback/postcondition semantics? Receiving a fresh engine event while
   paused works locally, but a GUI-only timeout is not a watchdog if the GUI stops.

Desired result: a documented script/public-API route and its limitations. We are
not asking for private symbols, DLL attachment, binary patches or security bypass.
Do not attach private saves, beta binaries or source archives to this draft.
