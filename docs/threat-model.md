# Direct-connect threat model

Assets are deterministic session state, player/company authorization, local
secrets and the integrity of the game installation. Trust is limited to the host
operator and possession of a fresh session secret; every client request remains
untrusted.

In scope: malformed/oversize JSON, wrong secrets, replay/duplicate/out-of-order
messages, identity spoofing, request floods, incompatible builds/mods, invalid
ownership, unsupported payloads and late commands. Controls are bounded frames,
AES-256-GCM authenticated encryption, monotonic sequences, session-wide
message IDs, 30 request/s peer limit, 100,000-message session cap, four-player
cap, strict top-level fields, payload validation at the authority, compatibility
hashes, authenticated-origin binding, authoritative entity-owner resolvers,
independent client authorization and fail-closed nondecreasing scheduling.

The optional no-op userdata probe adds a local file boundary. Its in-scope
threats are path redirection, links, partial writes, oversized files, duplicate
fields, nested tables, executable Lua text, stale counters and response
overwrite. Controls are an explicit absolute directory named
`tf3mp_status_1`, real-path/link checks, a 4 KiB cap, a non-executing allowlist
parser, unique response names, flush-before-publish and atomic hard-link
publication. The probe carries no secret and submits no gameplay command.

Out of scope: compromised host, stolen session secret, traffic analysis,
OS/process compromise, Internet-scale denial of service and host migration.
Direct hosting does not conceal the host's public IP or provide managed
denial-of-service filtering. A compromised
host can order or reject commands but must not gain an in-game economy override;
that invariant remains to be proved in the future game adapter.

Recovery is stop-and-preserve: disconnect, stop command application, retain
redacted diagnostics, and restart from a manually agreed identical checkpoint.
No peer supplies executable code, mods, assets, saves or arbitrary filesystem
paths through this protocol.
