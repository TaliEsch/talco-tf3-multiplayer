# Security policy

## Scope

This prototype supports encrypted direct connections for controlled Internet
testing as well as LAN use. It has no telemetry, matchmaking, NAT traversal,
relay, host migration, or automatic router/firewall configuration. The host is
responsible for forwarding only the documented ports and stopping the session
when finished.

## Controls

- The helper binds to `127.0.0.1` unless `--bind` is explicitly supplied.
- Every protocol message is encrypted and authenticated with AES-256-GCM using
  a purpose-specific key derived from a session secret of at least 32 UTF-8
  bytes. Secrets and plaintext payloads are never written to diagnostics.
- Encrypted envelopes are newline-delimited JSON and limited to 65,536 bytes.
- Pre-authentication sockets time out after five seconds and at most 16 may be
  pending. A peer with more than 256 KiB queued outbound data is disconnected.
- Schema validation rejects unknown message kinds, unsafe integers, excessive
  strings, malformed hashes, and unsupported protocol versions.
- The host rate-limits requests, binds origin to the authenticated connection,
  owns canonical ordering, and requires an authoritative entity-owner resolver
  for entity actions. Clients require an equivalent resolver before applying;
  missing ownership state fails closed.
- Sequence numbers and message IDs provide replay and duplicate rejection.
- The audited TF3 build is recommended, not required. Other builds generate a
  warning. Host admission rejects clients whose executable hash differs from
  the host's; mod hashes must also match. Version matching is not evidence of
  runtime compatibility or protection against a modified malicious helper.
- Save transfer is opt-in and starts with a timestamped, single-use HMAC
  request. Metadata is authenticated and file contents are streamed as
  independently authenticated AES-256-GCM records. The host serves only the
  one explicitly selected regular file, never a caller-supplied path. Transfers
  are capped at 2 GiB and four concurrent downloads;
  clients write a unique temporary file, verify advertised length and
  SHA-256, and atomically link it into an existing non-linked destination
  without overwriting. Save names, paths, and contents are not logged.
- The dormant userdata probe accepts only an absolute, non-linked directory
  named `tf3mp_status_1`, reads only a regular `outbox.lua` of at most 4 KiB,
  and parses a fixed flat scalar grammar without executing Lua. It writes a
  completed response to a unique filename through a same-directory hard link
  and never overwrites an existing response.

The join code is a bearer credential containing the direct endpoint and session
secret. Launcher-created codes expire after 30 minutes, and the helper rejects
new control/save connections after that deadline. Anyone receiving a live code
can attempt to join, so communicate it privately and stop the host after use.
The recipient necessarily learns the host's public IP address. Logs contain
hashes and identifiers, never secrets or save contents.

AES-GCM protects traffic from passive inspection and modification when the join
code remains secret. This remains experimental software: it has not received an
independent security audit and does not provide denial-of-service protection
equivalent to a managed Internet service.

## Reporting

Do not include secrets, saves, personal data, or game binaries in a report.
Until a private reporting address exists, keep reports local to the project
owner.
