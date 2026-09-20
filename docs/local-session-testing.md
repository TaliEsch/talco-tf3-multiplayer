# Single-machine validation — 18 September 2026

The user has no second machine available. Continue validating locally without
treating model results as multiple TF3 simulations.

## Run

From the project directory: `npm run test:local-session`.
This runs two-participant and four-participant scenarios. The full suite,
`npm run check`, includes both scenarios and the helper cleanup regression.

The runner binds real control/save sockets only to 127.0.0.1 on ephemeral ports.
It uses random test credentials and a generated 96 KiB synthetic save fixture
in its own temporary directory. It never opens TF3, uses the live bridge folder,
reads user saves, changes the firewall, or touches ports 37333/37334. It closes
its sockets and removes only its own temporary directory on completion/failure.

## What passed

Both scenarios exercised real encrypted helper connections and save downloads:

- Distinct participant IDs; the host seat also uses a normal client connection.
- Action rejection before verified save readiness.
- Each participant pulls byte-identical synthetic save data.
- Build mismatch rejection in the two-player scenario and fifth-player rejection
  in the full four-player scenario.
- Cross-company action rejection using authoritative synthetic ownership.
- Identical canonical host order received by every connected participant.
- Independent model queues accept differing arrival order, deduplicate, and
  return owned-vehicle stop commands only at the exact scheduled update.
- Independent client authorization rejects a forged target; late delivery faults
  the model queue instead of silently applying a late action.
- Model state hashes match after execution and differ after an injected balance
  change. Hash comparison here is in the test harness, not a live networked
  desync detector or game recovery system.
- Leave/rejoin creates a new identity with no implicit company or save readiness.

Synthetic company IDs, balances and vehicle owners are explicitly supplied by
the fixture. This does not prove real company provisioning or roster propagation.
The model application loop is not TF3's physics/economy/vehicle simulation.
It does not prove pause barriers, host migration, cross-PC determinism, complete
mod compatibility, Internet security, or automatic save activation.

## Helper cleanup correction

The helper now treats closure of its controlling stdin pipe as a shutdown
request. This covers the launcher exiting and dropping its pipe without first
sending `stop`. The process regression test spawns a real Node host using a
synthetic build/save file, closes stdin, checks clean exit and removal of bridge
control/lock files, then starts a second host using the same directory.

This prevents that tested orphan path; it does not recover existing orphaned
helpers or guarantee cleanup after forced process termination or power loss.
Use a newly started session to pick up the code change. CLI users must leave
stdin open while hosting; piping a command whose input immediately ends now
ends the session intentionally.

## Results

`npm run test:local-session`: both scenarios passed.
`npm run check`: 69 passed, zero failures. The sandbox initially blocked spawning
the lifecycle-test subprocess (`EPERM`); rerunning with approved subprocess
permission passed. No tests were skipped or marked successful on that error.

The user separately supplied successful TF3 immediate and scheduled no-op
receipts at updates 2760, 2452, 3015 and 3256. These are single-game evidence;
the logs do not independently identify speed/pause settings. Vehicle command
execution in TF3 remains disabled and must be implemented/validated separately.
