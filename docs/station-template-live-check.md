# One-shot station-template live check

This is a prerequisite investigation, **not Phase 2 acceptance**. It resolves an
engine evaluator contract that cannot be established by the available source
alone. It is not a repeat depot-ghost test. No construction, funding, purchase or
DLL attachment is performed. A native evaluator assertion could still crash;
use a disposable save and do not save over the original.

Prepared launcher: `TF3MP-Launcher.exe` version 0.6.24.0.
Staged source manifest:
`fa8a425ee21c65c699a12a6f7c06dd4c8f12660d57b37f27686ac043ae5bf95f`.

1. Open the launcher, start a fresh solo Host, and manually load a disposable
   save with the mod active, from before the prior station probe (do not reload
   a save containing its spent one-shot latch). Wait for `bridge_connected`.
2. Open Debug -> Advanced -> **Inspect station template**. Read and accept the
   one-shot read-only native-evaluator warning. Do not start another diagnostic.
3. Copy the `station_template_result` log. A result normally arrives within
   30 seconds; on failure/timeout/crash, stop the helper and do not retry.

`TEMPLATE_EVALUATED` confirms only the evaluator returned inspectable data. The
receipt reports params/module presence and bounded counts, subconstructions and
an optional scalar resource cost. It is not a placed/connected station, a company
debit, a world-build quote or a service pass. Zero modules is useful negative
evidence, not success at constructing a station.

`PROBE_FAILED`, a stage-specific `*_FAILED` code, `ALREADY_ATTEMPTED` or `PROBE_UNAVAILABLE_NO_RETRY` require log
review. Every native inspection consumes a saved attempt first. A receipt cannot
authorize construction. No automatic repeated native evaluator calls occur.

The previous staged mod/cooked cache was preserved at
`E:\Steam\userdata\109855567\3493540\local\tf3mp_backup_d810ecb8e65a4d9b83ea0fe35f44510f`.
