# TalCo TF3 multiplayer — current delivery plan

Revised 20 September 2026 following the user's scope and economy clarification.
This is the current plan. Historical status is in completion-audit.md and
archive/roadmap-before-scope-review.md; historical blockers do not override this plan.

Next local proof (user clarification): record one normal action, reload its
exact pre-action disposable checkpoint, then explicitly replay it once and
compare ownership, resulting construction and actual charge. This avoids double
application and does not require a pre-commit interception hook for the local
experiment. Capture/reconstruction comes first; live host ordering and concurrent
admission remain separate requirements, not prerequisites to this replay test.
Revision 7 integrates bounded copied road-stop capture into the passive observer;
native field access and reconstruction still require game evidence. There is no
replay button or automatic construction in this build.

The offline replay artifact now also binds the stop model's resource name and
numeric ID. This prevents a same-ID/different-resource match from passing the
offline identity check; the name still needs capture-time native evidence and
reload-time resolution. The read-only baseline preflight is experimental, not a
claim that the entire loaded save is identical. Replay uses the existing durable
company transaction boundary; these preparation changes do not enable execution.

Current priority (20 September, after the 12:24 UTC setup run): reuse normal
native placement and capture its complete proposal/command. Stop extending the
station coordinate picker or treating guessed placement as an acceptance task.
Funding passed; depot construction was rejected with native `Collision`, before
either station. See [normal placement capture](native-placement-capture.md) for
the newly identified declared GUI preview callback and remaining capture/replay
boundaries. Stock mission source additionally handles `builder.proposalCreate`
and `builder.proposalApply` through guiHandleEvent, with restriction results.
Verify this concrete lifecycle candidate in free play before a preview wrapper
or native companion. No interception or multiplayer construction is implemented yet.
The passive lifecycle observer is now implemented; follow
[normal-placement observation](native-placement-observer-test.md) for its bounded
free-play delivery check. Revision 7 adds bounded copied proposal files to the
scalar summary logs and leaves native actions
unchanged. It does not require the Phase 2 setup helper or a custom placement UI.
The first free-play observation recorded readiness but no native event samples.
Revision 4 retains the restricted-context-safe observer and tests the GUI route
with bounded startup retries and an established read-only status control. Revision
3's one-shot check ran at game readiness and returned no acknowledgement; it did
not exclude subscription initialization timing.
This repairs diagnostic ambiguity, not a proven native capture/replay path.
Latest live result: revision 5 recorded eight create samples and one apply sample
from `streetTerminalBuilder`, with successful outer payload inspection and zero
observer errors. The normal roadside-stop lifecycle route is locally verified.
Next gate: supported proposal representation and execution-boundary qualification
for company-bound capture/replay. Event delivery is not interception or replay.
Revision 6 adds fixed, bounded proposal-field diagnostics for the normal roadside
stop: counts, owner fields, cost/error flag and result count. This is implemented
for live field qualification, not a complete codec or an execution command.
Revision 6 is now locally qualified: eight create samples and one apply sample
returned readable fields with no observer errors. The stop proposal adds and
removes one road segment and adds one edge object, owner 3141, declared cost
67500, critical=false. Full segment/object serialization, entity references,
pre-execution admission and company-bound replay remain the next gate; the
reported cost is not evidence of a verified debit.
The offline copied-proposal schema/canonicalizer and file checker are now
implemented for the road-stop subset; see road-stop-codec-spec.md. Revision 7
connects native extraction, with live field compatibility not yet qualified.
An unregistered reconstruction candidate now round-trips the copied fields in
executable Lua fixtures. The apply-only replay-case record binds the input to a
pre-placement save hash and matching game/mod hashes, but cannot establish which
save is loaded. Native reconstruction, execution and accounting remain unverified.
Unsupported node-configuration/construction/terrain variants reject explicitly.

Earlier live evidence (20 September, 10:23 UTC): the modular passenger station
template evaluated successfully: three modules, two subconstructions and scalar
resource cost 283500. This verifies evaluation only, not placement or spending.
The source now connects depot, vehicle, two station builds and line assignment
through correlated engine receipts. A combined local setup controller has passed
automated mailbox/report tests. A guided launcher flow now prepares read-only
in-game point/model selection and requires a separate canonical-plan confirmation.
See phase2-guided-setup.md for the bounded disposable-save setup qualification.
Real target-owned stop placement/connectivity, native
insufficient-funds qualification and operating-accounting observation still
precede acceptance. No new multiplayer capability is claimed.

## Goal and invariants

Up to four players, each with a separate company and independent money/assets.
One host orders and validates every player's requests, including its own.
Automatic authenticated save download; LAN or host-side port forwarding.
No shared-company feature, VPN requirement, relay infrastructure or host migration.

Supported script/public APIs first. No automatic game launch, game-file patching,
silent funding, save overwrite or public release. Native process attachment is
not part of the current implementation and is never implied by installing the
mod; it is a separately authorized, opt-in compatibility phase described below.
Unknown execution must remain unknown: no automatic retry or compensation of
uncertain mutations. Keep diagnostics separate from supported multiplayer claims.

## Compatibility strategy and native boundary

Update, 20 September: the user approved considering an opt-in native companion
for unsupported action capture. Bring forward the **feasibility investigation**
from Phase 8 alongside Phase 2; this does not make native mode implemented or
qualified. See native-compatibility-prototype.md for scope, failure boundaries and
the staged validation plan. No automatic game launch or process attachment.

The shipping foundation is a host-authoritative, typed-action pipeline: capture
or originate a supported intent, bind it to the authenticated player's company,
order it on the host, execute it at the agreed update, then verify a correlated
engine receipt and relevant state. Networking, ownership, ordering, receipts,
halts and recovery are required regardless of how an action is captured.

The installed public TF3 declarations provide command submission and selected
UI recipe replacement, but no documented global native-command interception,
cancellation or deferral interface. Therefore the supported set has explicit
compatibility tiers:

| Tier | Scope and promise | Capture boundary |
|---|---|---|
| 1. Supported multiplayer actions | The declared road-transport action set and approved mod set. | Mod-owned UI/tools or individually audited public recipe replacements. |
| 2. Stock-UI compatibility | Selected ordinary TF3 controls work through the same authoritative pipeline. | Individually qualified public replacements, or a later native compatibility layer. |
| 3. Third-party mods | No blanket compatibility claim. Each mod/action family is qualified and versioned separately. | Its own documented capture/replay path and test evidence. |

An unsupported mutating path must not be advertised as synchronized. In a
general-play multiplayer session it must either be covered by its feature's
authoritative path or be unavailable; this does not justify temporary blanket
restrictions during controlled tests.

The optional native compatibility layer is not a shortcut around multiplayer
correctness. It would only broaden capture/cancellation coverage for stock UI;
it would still need logical action decoding, canonical ordering, per-company
validation, exact execution, receipts, state checks and recovery. Deployment is
deferred pending qualification; the approved investigation now evaluates the
concrete roadside-stop capture gap alongside public-API alternatives.

## Client/host economy relationship

- Clients display their assigned company's balance and provide normal local
  affordability controls. Other players need no placement price UI for it.
- Clients submit bounded action intents, never authoritative balance changes.
  The authenticated session binds the company; payloads cannot choose a payer.
- The host orders all actions, including its own, and executes them through TF3
  with explicit company ownership/payer context and native validation enabled.
- Local affordability is not final authority: two queued purchases can each look
  affordable against the same stale balance. Check against host-ordered state.
- Clients apply accepted actions and compare observed balances/state at agreed
  barriers. Mismatch halts for recovery, not balance overwrite, refund or replay.
- Prove native debit attribution and insufficient-funds handling in the disposable
  acceptance run. UI gating alone does not prove native enforcement. If native
  commands permit overdrafts, a supported host-side check is needed before play.
- Custom remote pricing UI and retained GUI proposal userdata are not dependencies.

## Planning rule: build reusable capabilities, not temporary obstacles

Every new task must either implement a shipping capability, provide evidence for
the current feasibility gate, or protect the state actually touched by that test.
If it does none of those, defer it. Do not add a mechanism solely to remove it in
a later phase. Prefer exercising the real adapter over adding another parallel
diagnostic implementation or another button.

Controlled tests may have explicit operator constraints. For Phase 1, do not
build, buy/sell, edit lines, change company or use native speed/vehicle actions
outside the instructed steps. Leave construction tools unchanged. An accidental
out-of-scope action invalidates the run; stop and use a known disposable save.
This is a test condition, not a claim that normal multiplayer is safe.

Before general multiplayer use, route each supported native action through the
authoritative path. Any remaining unsupported mutating entry points must be
unavailable in that multiplayer mode. Design this capability gating alongside
the feature batches, not as a blanket Phase 1 construction lockdown. Ordinary
single-player controls must remain unaffected.

## Where we are

- Phase 1 controlled runtime gate passed at 15:45 UTC: four exact-update actions
  at 1x/2x/4x with matching releases and confirmed terminal halt. Report:
  local-batch-9bac565c-2596-4495-851f-8b52eb6d1566. This closes the controlled
  single-game feasibility milestone, not real multiplayer qualification.
- Phase 2 is in development. Depot validation is joined by funding, purchase,
  assignment and service-accounting contracts; the live construction/service
  adapter and consolidated test UI remain outstanding. A read-only depot preview
  is connected to launcher Debug and in-game placement controls; the user verified
  ghost rendering, but subsequent pricing experiments crashed. The last staged
  build disables pricing. A native owner/payer-bound executor and postcondition
  checks are now source-only; they are not integrated into the game or acceptance
  UI. See phase2-acceptance-readiness.md for the current incomplete live path.
- Locally game-verified building blocks: exact-update pause, held vehicle action,
  resume, selected-state capture, tested speed/vehicle guards and watchdog expiry.
- Exercised together in the controlled TF3 run: binding,
  observed checkpoint agreement, repeated prepare/execute/release, lease renewal,
  mailbox/session adapter and control-lock integration.
- A consolidated local coordinator driver now exercises the real adapter through
  a helper entry point: capture, four vehicle cycles and confirmed explicit halt.
  The second protocol member is explicitly a receipt mirror, not another game.
  Launcher 0.6.22 offers this driver through Run local sync test, with read-only
  vehicle selection and existing-company inspection. Barrier releases now request
  and verify 1x/2x/4x speed; timing and confirmed-vs-unknown halt evidence are
  recorded. The integrated path passed the controlled single-game run above.
  docs/phase1-integrated-test.md preserves the test procedure.
- Separate-company creation/inspection and isolated credit/debit have local
  evidence. Playable independent services and multiplayer simulation do not.
- Laptop transport/save-transfer evidence is not a second running TF3 instance.

## Phases and acceptance gates

| Phase | Work | Exit evidence |
|---|---|---|
| 1. Synchronization feasibility | Integrate the real asynchronous adapter, binding, observed hold agreement, repeated Stop/Start, coordinated pause/resume and supported speed changes; exact execution receipts, selected-state hashes, latency/deadline measurements and failure halt. Use a controlled disposable-save session. | One game repeatedly completes the integrated cycle; pause still receives control traffic; late/duplicate/missing work is handled without replay; actual stopped state is distinguished from unknown. Document input constraints and unsupported API blockers. No whole-world or multi-game claim. |
| 2. Playable second company | Direct depot placement/build owned and charged to the second company from creation; explicit bounded funding; vehicle purchase, line and basic service; independently attributed spending, operating costs and income. No ownership-transfer shortcut or remote price UI requirement. | Two working companies in one game with verified ownership and separate finances, including insufficient-funds handling. |
| 3. Two-game synchronization proof | Same checkpoint/build/mods, distinct authenticated companies, host as participant; no-input baseline, repeated Stop/Start, simultaneous requests, pause/speed and matching execution updates/state. | Two real TF3 instances stay aligned through the bounded test. Explain baseline divergence before adding actions. Requires a second game-capable instance. |
| 4. Failure, saving and recovery | Real halt on disconnect/stall/mismatch; coordinated checkpoint and company mapping; authenticated checkpoint-based rejoin. No hot-join or host migration. | Injected failures cannot silently continue divergent play or repeat spending; recovery restores verified common state. |
| 5. Road-transport alpha | Roads, depots, stops, vehicles and lines through the same typed intent, ownership, ordering, execution and verification path. Use mod-owned or individually audited public UI capture/capability gating with each action. | Two independent services operate for a sustained session, with correct costs/income, save and recovery. Unsupported actions cannot silently mutate a general-play session. |
| 6. Host/Join experience | Host, Join and Debug; supported save/mod setup, download, company assignment, readiness and understandable errors. Where automation is unsupported, give one accurate manual step. | A new user can host/join without manually moving saves or reading diagnostic procedures. |
| 7. Four-player/Internet qualification | Four real games, concurrent companies/actions, supported speeds, recovery, port-forwarded Internet and adverse networks; security/distribution review. Publish the supported action/mod compatibility matrix. | Recorded real-game/network matrix, one versioned distribution and explicit approval before publication. No unrestricted stock-UI or third-party-mod claim. |
| 8. Optional native compatibility layer | Only after explicit approval and applicable permission: evaluate a separately installed, opt-in native companion for selected stock command capture/cancellation. Add exact-build identification, allowlists, self-test, failure latch and kill switch. Decode/replay one action family at a time; never transmit raw process memory or silently load it. | For each approved executable build and action family, two real games prove capture before mutation, cancellation of the original, canonical replay, correct ownership/finance, state agreement and safe disable on an unknown build. This phase is required only for the broader stock-UI promise, not for Tier 1 alpha support. |

Phase 1 does not require four-player testing, a second machine, broad construction
restrictions or a production-complete recovery system. Phase 3 is not cleared by
Phase 1. Controlled Phase 3 experiments can also use declared input constraints;
they do not authorize advertising unrestricted stock-UI or third-party-mod
multiplayer. Phase 8 release qualification remains later; its newly approved
feasibility investigation can proceed now without blocking public-API alternatives.

## Immediate implementation batch

1. Use engine-owned SimpleProposal construction with explicit owner/payer and
   native validation. Custom price UI for other players is not required. Qualify
   correct charging and insufficient-funds behavior without GUI native-data retention.
2. Connect bounded, explicitly confirmed funding and direct depot construction
   to engine-persistent one-attempt guards and correlated result inspection.
3. Implement second-company vehicle purchase, two-stop line setup and assignment.
4. Observe actual operation with independently attributed expense and income.
5. Deliver one consolidated guided disposable-save test, not another Phase 1 run.
   Run automated success/failure checks and stage only a coherent live batch.

Ready for testing means this integrated entry is built, verified and staged with
a bounded script. It is not the same as the in-game exit gate having passed.

## Keep, defer and avoid

Keep ownership rechecks, typed requests, sequence/duplicate protection, actual
receipts, engine watchdog and unknown-outcome handling: these are shipping
foundations. Keep existing tested speed/vehicle guards without expanding them
merely to claim full input coverage.

Defer new construction/terrain/bulldozer blocking wrappers, comprehensive UI
lockdown, native attachment work and polished release UX. Their eventual
permanent integration belongs with the corresponding action or release gate.
Second-company development is now the immediate batch. Do not begin Phase 8
without explicit authorization and applicable permission for process attachment.

Avoid new one-off tests when the integrated path can exercise the same behavior,
repeated tiny launcher releases, and rising test counts as a substitute for the
real-game milestone. Remove obsolete debug entry points only when their useful
coverage is replaced; do not delete proven safeguards as an incidental cleanup.

## Evidence and change discipline

For every batch, distinguish implemented, automated-tested, locally game-verified
and multi-game-verified. Document changed hashes and exact remaining limitations
in completion-audit.md. Preserve earlier evidence without presenting old source
limitations as current facts. Do not claim selected-company/vehicle hashes prove
the whole simulation or identify the loaded save.
