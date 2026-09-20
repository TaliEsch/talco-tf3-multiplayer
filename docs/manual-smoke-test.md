# Manual smoke tests

These tests are specifications, not recorded passes. Run only after the user
explicitly authorizes enabling the source mod and after the applicable EULA/mod
policy is confirmed. Never modify game binaries or DLLs.

## Available one-machine loopback test

No second PC is required to validate framing, authenticated encryption, admission,
ordering, ownership rejection, or host-to-client save transfer. Run
`npm run check`; the loopback suite starts both endpoints on `127.0.0.1`, pulls
a generated save-shaped fixture from the host into an isolated client folder,
verifies its byte count and SHA-256, proves that plaintext save markers are not
visible on the wire, and proves that a wrong secret cannot download it. This is
transport evidence, not proof of two TF3 simulations.

## Future transport two-machine test

1. Confirm both machines report the pinned executable SHA-256 and the same
   canonical enabled-mod manifest hash.
2. Generate a fresh 32-byte secret; select the authoritative save in the host
   launcher. Confirm TF3MP is already enabled in that save, then choose LAN or
   Internet hosting. For Internet testing, forward TCP ports 37333–37334 to the
   displayed private LAN IP and enter the public IPv4/DNS endpoint. The launcher
   ensures the reviewed mod is
   installed in the host's per-user staging area without editing the save.
3. Join one client through the host. The client must pull the selected save,
   verify its announced size and SHA-256, install it under a unique session
   name without overwriting, and only then proceed to TF3 loading. Manual save
   copying is not an accepted test procedure. The launcher ensures the same
   reviewed mod is installed locally; loading the received save then applies
   the enabled-mod list embedded by the host.
4. Confirm distinct player IDs/company slots.
5. Exchange `test`/`test_echo`; try a wrong secret, replay, fifth join, mod/build
   mismatch, over-size frame and rate-limit burst. All invalid cases must fail.
6. Submit ordered `vehicle.setRunning` requests with synthetic owned-entity
   mappings and a cross-owner request. Confirm canonical order on both helpers
   and `NOT_OWNER` denial. This is still transport/model evidence, not a TF3
   vehicle mutation.

## Future two-instance TF3 proof

Prerequisites: a supported adapter that can receive helper commands and prevent
local optimistic actions; a status panel that has passed `REVIEW_CHECKLIST.md`;
and identical mod manifests. The client obtains the authoritative user-made
test save from the host during join; no out-of-band file copy is permitted.

1. Host selects the save. Client joins, downloads it from the encrypted and authenticated
   host endpoint, verifies its hash, and loads the received local copy. Record
   executable/mod/save hashes locally.
2. Add two players through the typed API and record returned entities, account
   balances and immutable mappings.
3. Compare tick/update clocks during pause, 1x, 2x, 4x and back to pause.
4. Request own-vehicle stop (preferred reversible candidate). Host validates and
   schedules at least eight updates ahead; neither instance acts early.
5. Both apply at the same `updateCount`. Record vehicle owner/state and the
   canonical relevant-state hash immediately before and after.
6. Attempt the same command from the other player and confirm host rejection plus
   independent client rejection, with no local state mutation.
7. Save/reload and confirm only mod-owned mapping/counter state persists.

Store redacted JSONL evidence per machine. A pass requires identical accepted
envelope, update count, resulting state and hash. A single-process run is never
multiplayer evidence.
