# Opt-in native compatibility investigation

Status: investigation/design authorized by the user on 20 September 2026.
No native hook, DLL loader, process attachment or game launch has been performed.
No executable build is native-qualified. The existing static API audit is not
native-hook approval. Phase 2 remains incomplete.

## Why investigate now

The immediate gap is capturing ordinary roadside-stop placement before it changes
the simulation. Detecting a finished construction and copying it afterward does
not prevent duplicate commands, spending or divergent local entity references.

The public route is not proven impossible: freestanding modular road stations
have a declared construction submission route. Their initialized template payload
and connectivity remain unqualified. See phase2-stops-api-audit.md. Native work
is a feasibility investigation alongside that option, not evidence that DLL
injection automatically solves construction, finance or synchronization.

## Minimal boundaries to establish

1. **Capture before mutation.** Locate the actual command submission boundary for
   one stock roadside-stop action. Establish its thread, ABI, lifetime and all
   side effects. A preview callback or entity-created callback is insufficient.
2. **Defer without executing.** Demonstrate that withholding the original command
   prevents both construction and spending, including hotkeys and alternate UI
   paths for that action. Never infer this from hiding a button.
3. **Decode to a bounded intent.** Extract resource identity, placement, stable
   street reference and supported options. Local selected-company focus is not
   authoritative ownership. Never transmit native pointers, process memory,
   arbitrary functions or executable payloads.
4. **Authoritative replay.** Existing host ordering and company checks remain in
   charge. Resolve references locally, revalidate ownership and affordability,
   execute on the correct engine thread at the agreed barrier and return actual
   results. Distinguish replay from a new user action to prevent capture loops.
5. **Verify effects.** Correlate command identity with construction/stop ownership,
   original/target debits, duplicate protection and canonical state. Observation
   alone is not replay capability or proof of simulation agreement.

These are required hook roles, not discovered function names or offsets. No ABI,
signature scan, cancellation contract or threading guarantee has been established.

## Build and installation policy

- Native integration is a separate opt-in component, disabled by default. Do not
  silently load it from ordinary Host/Join or install it into game files.
- Exact executable and relevant module fingerprints must match a reviewed native
  build profile. An unknown fingerprint must refuse attachment and native mode,
  not guess offsets or reuse a nearby build's hooks.
- Preserve advisory game-version behavior for the script-only path. Matching
  player versions still applies. Native mode adds its own stricter compatibility
  requirement; never mark a static API audit as a native capability certificate.
- Establish module architecture, hook preconditions and clean original bytes
  before activation. Keep qualification evidence tied to the exact companion
  artifact too. No approved profiles exist yet.
- No anti-cheat, DRM, platform-security bypass, stealth, persistence or public
  distribution. Stop if the supported environment requires any such mechanism.

## Local communication and failure policy

Use a local, explicitly authenticated companion/helper channel bound to this
session and expected process identity; constrain access to the intended local
user/processes. Bound messages, queues and timeouts; use typed allowlisted actions,
nonces and sequence numbers. Do not add an unauthenticated network listener to
the DLL or expose process-memory operations through the gameplay protocol.
Bind PID together with process creation identity to avoid PID-reuse mistakes.
Local authentication is not protection against a fully compromised same-privilege
account; do not describe the companion as cheat-proof.

Before mutation begins, communication loss disables the test. After a command
may have been submitted, the outcome is unknown until verified; never resend it.
Helper loss must not release intercepted stock commands into an active session.
Actual engine halt needs its own qualified mechanism: stopping IPC is not a halt.

A kill switch stops admission. It must not blindly unload code while a hook or
callback is executing. If safe quiescence/unhooking cannot be proven, require a
controlled game shutdown and common-checkpoint recovery. Never promise that an
in-process native crash can be contained by the helper.

## Qualification order

1. Offline inspection: executable/module inventory, relevant exported or debug
   information where available, supported APIs and first-party command flow.
   Do not invent addresses or publish proprietary disassembly.
2. Separate synthetic host harness: typed intent codec, sequencing, bounded queues,
   replay-loop prevention, unknown-build rejection and teardown concurrency.
   This validates companion logic, not a TF3 hook.
3. User-supervised disposable-game test: begin observation-only; correlate exactly
   one selected stop placement with a command before attempting suppression.
4. In a separately confirmed mutation test, qualify suppression, one replay,
   correct payer/owner, insufficient funds, duplicates and loss-of-helper behavior.
5. Two real games: matched checkpoint, ordered replay, state agreement and recovery.

Do not broaden to other construction families until this action passes. Native
compatibility does not waive Phase 2 service/accounting or Phase 3 simulation gates.

## Immediate deliverable and stop conditions

Produce a hook-feasibility report identifying a concrete capture/deferral/replay
route and its evidence. If no reliable command boundary, supported lifetime or
safe deferral is established, record that blocker and retain the script route.
Do not offer an injector as an acceptance-ready feature merely because a DLL can
be loaded. Live process attachment and the disposable test must be clearly
announced and user-supervised; existing no-automatic-game-launch rules remain.
