# Reference architecture review

## Follow-up review — 18 September 2026

Read the reference's current public README and architecture page again:
https://github.com/silver2127/tpf2-multiplayer/blob/main/docs/ARCHITECTURE.md
This follow-up is architectural reading of the moving main branch, not a new
pinned source import. No TF2 implementation code has been copied or adapted.
The historical pinned review below remains separate.

The key missing capability is command interception, not transport: TF2 uses
native command-factory and command-list hooks to capture/cancel local actions
before script replay. Its native simulation hooks also help pacing. These are
TF2-specific and do not establish equivalent hooks in TF3. The user still
prohibits launching TF3, and has confirmed the new engine probe is untested.
Do not skip the runtime timing gate or install a proxy/patch to imitate TF2.

An original queue hardening pass now rejects missed execution updates, missing
predecessors at a deadline, conflicting duplicate sequences, backward clocks,
inconsistent schedules, and excess pending commands. It snapshots payloads and
checks the company mapping/vehicle ownership again when returning a due batch.
Faults latch and cannot be cleared by retrying; recovery must start a new session
from a common checkpoint. This is a helper-model safety property, not a TF3
pause barrier, gameplay adapter, rollback implementation, or desync proof.

56 automated tests pass, including two model queues receiving different arrival
orders and producing identical exact-update batches. No TF3 execution occurred.

Current boundary: user runs Debug → Test engine bridge; then timing and the
mod-owned vehicle action can be developed/tested against a disposable save.
Full native UI replication still needs a documented veto/defer capability or a
separately reviewed, authorized, build-specific native approach. A custom mod
button alone cannot prevent arbitrary normal UI actions from diverging worlds.

The TF2 reference was inspected read-only at pinned commit
[`af939eee28393fbeb508f7ce28ff7c73cd0e5dfa`](https://github.com/silver2127/tpf2-multiplayer/commit/af939eee28393fbeb508f7ce28ff7c73cd0e5dfa),
the last revision retaining its known-issues document. Its
[`LICENSE`](https://github.com/silver2127/tpf2-multiplayer/blob/af939eee28393fbeb508f7ce28ff7c73cd0e5dfa/LICENSE)
was verified as the standard MIT licence, copyright 2026 silver2127. No source,
text, data, or test implementation was copied or adapted.

Clean-room ideas retained: separate game adapter, deterministic lockstep core,
authenticated host relay, future-update scheduling, canonical ordering and
deduplication, compatibility gates, and checkpoint state hashes. TF2 engine
hooks, DLL/proxy/offset work, Lua/API calls, command codecs, UI, save-file format handling,
text IPC, identity scheme, and roster protocol must all be rewritten or omitted.

The join design now includes an original authenticated save-transfer stage:
the host selects one authoritative `.sav`, the client pulls it into a unique
local name, and admission cannot be treated as gameplay-ready until size and
SHA-256 verification succeeds. Manual distribution is not a production path.

Risks brought forward as requirements include per-peer stream state; strict
schema parsing; snapshot watermarks if hot join is ever added; supported-command
prechecks; hashing hidden/depot state; deterministic same-update conflict policy;
and treating engine determinism as a hypothesis to test, not an assumption.

Primary reference documents:

- [Architecture](https://github.com/silver2127/tpf2-multiplayer/blob/af939eee28393fbeb508f7ce28ff7c73cd0e5dfa/docs/ARCHITECTURE.md)
- [Known issues](https://github.com/silver2127/tpf2-multiplayer/blob/af939eee28393fbeb508f7ce28ff7c73cd0e5dfa/docs/KNOWN_ISSUES.md)
- [Testing](https://github.com/silver2127/tpf2-multiplayer/blob/af939eee28393fbeb508f7ce28ff7c73cd0e5dfa/docs/TESTING.md)
