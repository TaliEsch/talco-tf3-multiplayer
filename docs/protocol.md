# Protocol v2

The current helper is a transport-only prototype. TCP clients speak only to the
host. Each newline-delimited JSON envelope contains only a wire version, random
nonce, ciphertext, and AES-256-GCM authentication tag. The maximum encoded
frame is 65,536 bytes. A purpose-specific key is derived from the fresh session
secret, so control payloads and identifiers are not sent in plaintext.

The manual join command may send one `--test-message`; the host accepts exactly
one non-empty string field of at most 256 characters and echoes it only to that
peer. This confirms the authenticated path without collecting telemetry.

Every body carries protocol version, kind, unique message ID, monotonically
increasing peer sequence, session ID, admitted player ID, and an object payload.
The host rejects bad versions/schemas, authentication failures, replays,
duplicates, identity mismatch, excessive input rate, build/mod mismatch,
unauthorized ownership, unsupported command types and payload bounds.

The host assigns immutable session player IDs and collision-free transport-level
company slots, and broadcasts roster changes before later commands on each TCP
stream.
A host may select one authoritative save. A separate timestamped, single-use
HMAC request lets each admitted client stream that file as independently
authenticated AES-256-GCM records, verify its bounded plaintext length and
SHA-256, and atomically install it under a unique session name. The
client then sends `save_ready`; while a save is required, the host rejects all
gameplay requests from that peer with `SAVE_REQUIRED` until the announced hash
and byte count match. Test echo remains available for diagnosis.
A slot is deliberately not represented as a TF3 entity. Only a future verified
game adapter may set `companyEntity`, using the result of TF3's typed
`GameAddPlayer` command.

For accepted requests the host binds the command origin to the authenticated
connection, requires an authoritative entity-owner resolver for entity actions,
assigns a monotonically increasing host sequence and schedules at least eight
updates ahead without decreasing schedule time. With no verified TF3 adapter the
resolver is unavailable and entity actions fail closed. All peers must
independently verify origin/target ownership, buffer gaps, deduplicate, and apply only consecutive
host sequences whose scheduled update has arrived. Speed policy is deterministic
last-host-accepted-request-wins; supported provisional values are pause, 1x, 2x
and 4x. Actual TF3 supported levels must be measured before integration.

The only enabled entity action is `vehicle.setRunning`, carrying exactly one
boolean `running` field. It models TF3's documented reversible vehicle
stop/start command. The host requires an authoritative entity-owner resolver,
and every peer repeats the owner and payload checks before queueing. Client
sequence numbers must increase monotonically. No helper test is treated as
proof that the action reached TF3.

Host disconnect emits a terminal client event and ends the session. There is no host migration. Loading pauses
admission/application until compatibility and clock barriers are re-established.
A late command is a desync condition: stop application, pause through an already
accepted speed command if possible, preserve diagnostics, and reload the common
checkpoint. Automatic initial save transfer is implemented; later desync
checkpoint recovery is not.
