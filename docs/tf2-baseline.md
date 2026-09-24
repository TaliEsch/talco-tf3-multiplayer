# TF2 multiplayer baseline for the TF3 Stop path

Reference: the sibling `TF2 Mp/tpf2-multiplayer` repository, MIT License,
Copyright (c) 2026 silver2127. No TF2 source code or hook addresses were copied
in this checkpoint. If code is copied later, retain its full MIT notice and
attribution in the distributed source.

| TF2 implementation | TF3 decision for the first two-engine Stop |
| --- | --- |
| `native/src/slice/capture.inl` and `add_hook.inl` correlate a command factory with the queued command and suppress the local action. `inject.lua` carries the cancellation verdict into scheduling. | Keep the qualified TF3 one-use Stop arm. Admit an action only after the native invocation, cancellation and unchanged engine prestate are confirmed. The TF2 pointer layout and hook sites are TF2-only. |
| `net.lua` `scheduleLocal` assigns an origin, sequence and future simulation step, accounting for delivery delay. `vehicles.lua` replays strict cancelled actions on the originator as well as peers. | Keep the authenticated TF3 Host sequence and one-use `executeHeld` on every participant. Production now uses the 60-update lead seen in the successful TF3 single-game Stop, with a 30-second coordinator timeout; eight updates was only the transport fixture default. The first two-game run must measure whether this lead suffices. |
| `net.lua` encodes semantic command fields in stable order. `vehicles.lua` maps save-loaded vehicles by saved ID and later purchases by origin/sequence keys. | Keep TF3's strict canonical command envelope and owner checks. The initial Stop targets a vehicle present in the transferred save. Its ID and ownership must be observed independently in both TF3 games before treating the mapping as valid. New-vehicle keys are for later purchase gameplay. |
| `net.lua` retains stamped history and repairs UDP gaps; `pacing.lua` governs a follower against the leader clock. | Keep the existing direct TCP transport, host authority, checkpoint and engine barriers. Do not add TF2's UDP resend or PID pacing to the first Stop test. Record both engines' clocks and accepted receipts; add a bounded drift response only after live measurements show its need. |

The required next evidence is a real Host and Join loading the same authenticated
save, accepting the same checkpoint, then applying one native-cancelled Stop at
the same Host sequence/update with matching observed postconditions. Mock or
single-game results do not satisfy that requirement.
