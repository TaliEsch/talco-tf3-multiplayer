# Milestone progress report

## Outcome

The safe standalone foundation and transport gates are implemented at
`C:\Users\olihf\Downloads\Temp\tf3-multiplayer-prototype`. The end-to-end TF3
multiplayer milestone is not complete and is not claimed: the status panel has
been staged with explicit authorization but has not yet been enabled or
runtime-tested; a newly identified documented userdata IPC path
still needs a no-op probe, and no two-PC TF3 evidence exists. Direct script
networking and built-in action interception remain unavailable. The applicable
game EULA was not present locally. No game file was changed and no native bridge
was built.

## Built

- Zero-dependency Node.js encrypted direct-connect helper, localhost by default.
- AES-256-GCM authenticated-encryption frames, defensive top-level schema, per-peer rate
  limit, global message cap, session/identity checks and duplicate/replay checks.
- Four-player admission cap, immutable session IDs/slots, compatibility checks,
  host-only canonical ordering, future-update scheduling, ownership validation,
  local revalidation queue and provisional speed policy.
- Canonical relevant-state SHA-256 implementation.
- Exact TF3 executable build guard.
- Original source TF3 game script that persists only schema/counters/diagnostic
  cadence, records tick/update counts, provides GUI-readable safe-mode status and
  emits structured diagnostics. An original game-bar panel uses the verified
  `react-plugin ::GameBarInfoDisplayExtension` resource and
  `RegisterPluginRecipe` pattern found in the installed first-party earnings
  widget. An exact reviewed copy is present in the per-user TF3 staging area,
  and its quiet runtime visibility and clocks have been confirmed.
- Authenticated host-selected save streaming with client-side size/SHA-256
  verification, atomic non-overwriting installation, and a host readiness gate.
- Licence/provenance/security files and manual two-/four-machine validation plans.

## Compatibility evidence

- TF3 executable SHA-256:
  `79f4d460ea2529924459ca599a0226deecc9ddf558057d289f8709c4ad98b7c2`
- Source mod manifest SHA-256:
  `3ffb8a0fab917b1d92924e2faacf1a03675f0a790aeb8ffb26cd349f02b4fd90`
- Node.js 24.1.0; npm 11.3.0.
- The revised quiet 8-file mod tree was copied to
  `E:\\Steam\\userdata\\109855567\\3493540\\local\\staging_area\\tf3mp_status_1`.
  Source and staged relative paths and per-file SHA-256 hashes matched exactly;
  the staged canonical manifest hash is
  `3ffb8a0fab917b1d92924e2faacf1a03675f0a790aeb8ffb26cd349f02b4fd90`.
- TF3's validator was run by the user. Its first namespace error was repaired;
  second validation and simulation-load evidence are pending. No save or
  enabled-mod list was selected.

## Candidate action

The API audit identifies owned-vehicle stop/start as the smallest reversible,
observable candidate: the typed command is documented at installed
`api\tealdef\api\cmd.d.tl:931-936`, with running/stopped state at
`type.d.tl:425-432`. It is not selected for integration until a manual test and
supported interception/deferment path exist. The helper now models this exact
`vehicle.setRunning` action with a boolean payload, strict owner checks, and an
independently validated relevant-state slice; it does not yet mutate TF3.

## Verification performed

`npm run check` completed with 33/33 tests passing: canonical serialization,
encrypted fragmented frame round-trip, tamper rejection and plaintext absence,
distinct admission slots,
host sequencing, duplicate and cross-owner rejection, scheduled ordered queue,
state-hash canonicalization, speed ordering/bounds, authenticated TCP echo and
four-player cap, authenticated-origin binding, immutable unique company binding,
strict vehicle payload validation, monotonic client sequencing, independent
client revalidation (including unknown command/version/speed rejection),
non-terminal machine-readable command rejection, and
schedule-gap prevention, encrypted host-to-client save pull, wrong-secret
denial, expired-session rejection, and save-readiness command gating. A live TCP integration test carries an owned
`vehicle.setRunning` request and a speed request through host acceptance,
canonical sequencing, future-update scheduling, and broadcast. `node
src/cli.mjs hash-game`
matched the pinned build. All `.mjs`
files passed Node syntax checks and `mod.json` parsed successfully. No TF3 runtime
or multi-PC test was performed.

## Data flow

```text
player request -> encrypted helper -> authoritative host validate/order/schedule
                                     |
                                     v
                         canonical accepted command
                                     |
                       broadcast through host relay
                                     v
                    peer dedupe/order/auth recheck queue
                                     |
                     BLOCKED supported TF3 adapter
                                     v
                            TF3 typed command
```

## Licensing and provenance

The project is MIT and uses only Node built-ins. No game or reference-project
source/assets/declarations were copied. The TF2 repository was used as
architecture evidence only at MIT-verified commit `af939eee...`. The installed
`LICENSE.txt` is a third-party notice bundle/all-rights-reserved header, not a
game EULA or attachment permission. Game binaries, DLLs, scripts and assets are
not redistributed. See `THIRD_PARTY_NOTICES.md` and `docs/feasibility.md`.

## Recovery and limitations

Host loss stops the session; there is no migration. Late/gapped commands or hash
mismatch stop application and require a manually agreed identical checkpoint.
There is no encryption, public matchmaking, NAT traversal, automatic in-game save loading,
automatic installation, firewall change, terrain/build support or arbitrary-mod
compatibility. Four-player support remains unproven.

## Next smallest milestone

The explicitly authorized staging copy is complete. Next, manually enable only
the Safe Mode source mod in a disposable save, verify its
quiet status-panel/state persistence/clock behavior,
and preserve a redacted evidence bundle, including the game-bar panel. If that
passes, run the no-op documented userdata experiment in
`docs/userdata-ipc-experiment.md`. Only then add a custom owned-vehicle action
button and scheduled game-script event. If the non-invasive path fails, obtain
vendor guidance and review the governing beta EULA before considering anything
native.
