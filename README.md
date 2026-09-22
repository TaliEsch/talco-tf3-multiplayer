# TF3 Multiplayer Prototype

Mod display name: **TalCo Transport Fever 3 MP mod**. Its internal ID remains
`tf3mp_status_1` for compatibility with existing saves.

**Current phase/status/evidence:** [ROADMAP.md](docs/ROADMAP.md). Local engine
communication, scheduled vehicle actions, company creation and journal isolation
are confirmed. Real laptop transport/save tests passed. Real multi-game execution,
direct construction and purchases are not implemented/verified. Older versioned
instructions below describe individual experiments, not completed multiplayer.

This project is a safe, original foundation for an experimental Transport
Fever 3 direct-connect multiplayer prototype. It currently provides a tested,
encrypted and authenticated host-authoritative messaging helper; encrypted host-to-client
save transfer; canonical command ordering,
scheduling and state-hash primitives; a version guard; and a TF3 game
script that records `tickCount` and `updateCount`. The opt-in single-host
immediate Stop/Start experiment is user-confirmed in-game. Launcher 0.6.7 also
offers a separate **locally verified scheduled vehicle test**. Both change the loaded
save. See [immediate](docs/local-vehicle-test.md) and [scheduled](docs/scheduled-vehicle-test.md) instructions.

It is **not yet working TF3 multiplayer**. The inspected TF3 API has no direct
network ingress or local-command interception/deferment hook. A documented
custom-userdata API and owned vehicle-window extension now provide a credible
non-invasive IPC/custom-action path, now verified for local vehicle tests only. The
status game script has a GUI-readable status state and an original, quiet
game-bar status-panel plugin built against the verified public extension
pattern. Its runtime appearance has been confirmed. Native attachment is deliberately
not implemented because the locally installed licence bundle does not grant
permission and the game EULA was not present. See [feasibility](docs/feasibility.md).

## Requirements

- Windows 10/11
- Node.js 24 or newer (tested with 24.1.0)
- A locally installed, supported TF3 build for `host`, `join`, or `hash-game`

The launcher/helper have no npm runtime dependencies. Development tests use a
pinned Lua VM; run `npm ci --ignore-scripts` before `npm run check`. This tests Lua
logic against fixtures, not TF3's native bindings or restricted GUI contexts.

## Verify and test

```powershell
cd C:\Users\olihf\Downloads\Temp\tf3-multiplayer-prototype
npm run check
npm run review
node src/cli.mjs hash-game --exe "E:\Steam\steamapps\common\Transport Fever 3\TransportFever3.exe"
node src/cli.mjs hash-mod --path mod
```

The statically audited executable SHA-256 is
`a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`
(Steam build 25396671). This build is recommended, not required. Other builds
show a warning and may host/join. Admission requires every joining player's
actual executable SHA-256 to match the host, as well as the mod hash. Matching
versions do not establish runtime compatibility. This accepts helper and
diagnostic bridge testing; in-game operation and gameplay synchronization remain
unverified. See [the static audit](docs/build-25396671-audit.md).

## Windows launcher

Double-click `TF3MP-Launcher.exe` for the simplified native Windows GUI. Its
home screen has **Host**, **Join**, and **Debug tools**. Host finds the latest
TF3 save, asks whether the friend is connecting over the Internet or LAN,
starts the encrypted session, and produces
one private join code. Join asks only for that code, checks compatibility, and
pulls/verifies the host save automatically. The launcher ensures the reviewed
mod is installed in each player's per-user staging area; the authoritative
save's enabled-mod list activates it for both players when that save is loaded.
Validation, staging inspection,
raw logs, and helper controls live under Debug tools. It does not
contain, patch, inject into, or redistribute any game file. Keep the EXE,
project sources, and `mod/` directory together. The PowerShell and CMD launchers
remain as command-line fallbacks.

Rebuild it from the reviewed source with the Windows-bundled .NET Framework
compiler:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Launcher.ps1
```

Hosting, joining, validation, and save transfer require Node.js 24 or newer on
`PATH`. The EXE is a launcher, not a bundled TF3 gameplay bridge.

Build a non-overwriting manual-review ZIP containing the original source,
launcher, tests, documentation, licences, and per-file hashes with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-ReviewBundle.ps1
```

The bundle script runs the automated checks and source-mod validator first. It
records the actual per-build launcher and mod hashes in `BUNDLE_INFO.json` and
all file hashes in `SHA256SUMS.txt`. The legacy Framework compiler timestamps
its output, so launcher and ZIP hashes can change between otherwise equivalent
builds. The bundle does not include game files, saves, credentials, logs, or
third-party packages.

## Run the transport-only proof

On Windows, double-click `TF3MP-Launcher.exe` (or use the fallback
`TF3MP-Launcher.cmd`). Choose **Host** to select the authoritative `.sav`, pick
Internet or LAN, and receive a private expiring join code. Choose **Join** on
the other PC and paste that code; the launcher downloads, decrypts, and verifies
the save automatically. No manual save distribution is part of the supported
join design. Compatibility checks, staging verification, logs, and helper
controls are kept under **Debug tools**. The transport remains a prototype
because no supported TF3 gameplay bridge has yet been verified.

The equivalent command-line workflow follows.

Generate a fresh secret without saving it in the project:

```powershell
node src/cli.mjs generate-secret
```

Start the host on localhost (default and safest):

```powershell
$env:TF3MP_SESSION_SECRET = '<secret>'
node src/cli.mjs host --mod-hash <sha256> --save "E:\path\to\authoritative.sav"
```

The host prints a `sessionId`. In another terminal:

```powershell
$env:TF3MP_SESSION_SECRET = '<secret>'
node src/cli.mjs join --session <sessionId> --name Alice --mod-hash <sha256> --save-dir "E:\Steam\userdata\<steam-id>\3493540\local\save"
```

The join helper writes a unique `TF3MP_<session>.sav` only after authenticated
download and size/SHA-256 verification, and refuses to overwrite an existing
file. TF3's installed typed API exposes `app.findAllSavegames` and
`app.loadGame`; automatically invoking that final in-game load awaits the
helper-to-game IPC bridge. Until then, the received save appears in TF3's
normal load menu. Do not host a save until TF3MP has been enabled in that save;
the host confirmation calls out this prerequisite.

For Internet hosting, forward TCP ports **37333–37334** on the router to the
host PC's private IPv4 address and permit Node.js/the same ports through Windows
Firewall. Enter the host's public IPv4 address or DNS name when prompted; it is
placed inside the private join code and is therefore visible to its recipient.
The launcher never changes the router or firewall. Both control frames and save
contents use AES-256-GCM authenticated encryption with independent keys derived
from a fresh session secret. Join codes expire after 30 minutes and should be
sent only to the intended player. Existing admitted connections continue until
the host stops the session.

Direct Internet hosting has no rendezvous, VPN, account, or relay dependency.
It will not work through carrier-grade NAT (CGNAT), routers that cannot forward
ports, or inbound-blocking ISPs. LAN mode requires no port forwarding.

## TF3 mod

### Testing without another PC

Run `npm run test:local-session` for real localhost host/client and save-transfer
tests with two and four **simulated game states**. It uses synthetic data and
temporary ports, not TF3 or your saves. Both scenarios pass; the full suite now
has an expanded automated suite; use the current test-run summary for its count.
See [scope and limitations](docs/local-session-testing.md).
This is not playable multiplayer or a substitute for two-game validation.

The source-only mod is in `mod/` and is statically validated by `npm run review`.
The user has confirmed `bridge connected / diagnostics` in TF3: the regular UI
callback exchanges telemetry with the helper. Gameplay synchronization is still
disabled. The mod contains no sockets, injected hooks, or bundled game code.

Launcher 0.6.2 adds **Debug → Test engine bridge**. After starting Host or Join
and loading a mod-enabled save, this sends one diagnostic script event and waits
up to 15 seconds for its simulation-thread receipt. It changes only the mod's
own diagnostic state, not vehicles, money, companies, or speed. The user has
confirmed this local engine test; automated tests also simulate the file exchange.
See `docs/engine-bridge-test.md` for the test steps and limitations.

On this machine the detected per-user review location is
`E:\Steam\userdata\109855567\3493540\local\staging_area\tf3mp_status_1`.
`Stage-Mod.ps1` verifies all 8 source files by relative path and SHA-256. It
requires TF3 to be closed and preserves the previous staged mod/cache in a
separate backup before replacing it.

The current safe kill switch is simply leaving the mod disabled and not starting
the helper. Nothing patches or overwrites the installation.

## Architecture

```text
client request -> authenticated helper -> authoritative host validation
                                          | order + future update
                                          v
                               accepted canonical command
                                          |
                         broadcast to host and every client
                                          v
                           local revalidation + ordered queue
                                          |
                         [PENDING: userdata IPC/action adapter]
                                          v
                                 TF3 typed command API
```

The host gets no gameplay privilege: its own inputs travel through the same
validation, ordering, scheduling and local revalidation path.

## Project status

| Gate | Status |
|---|---|
| Reconnaissance | Complete from local API/licence evidence |
| Foundation | Runtime-confirmed quiet game-bar status panel; project, metadata/index, licences, tests, build guard, clock state, and diagnostics are ready for continued controlled review |
| Transport | Complete as a standalone localhost authenticated test helper |
| Timing | Local exact-update actions confirmed; real engine hold/control restrictions and two-game timing unverified |
| Company/authorization | Real creation and journal isolation confirmed; purchases, services and multi-game company control missing |
| One command | Local Stop/Start confirmed; remote TF3 adapter remains disconnected |
| Desync | Canonicalizer tested; no multi-instance evidence yet |

Do not report two-player or four-player support until the manual evidence bundles
defined in `docs/` exist and pass.

## Licence

Original project code is available under the
[PolyForm Noncommercial License 1.0.0](LICENSE). Noncommercial forks,
modifications, and redistribution are permitted provided the licence and its
required TaliEsch attribution notice are retained. Commercial use, including
sale, requires a separate licence from the copyright holder. Third-party
components remain under their respective terms in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
