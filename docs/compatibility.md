# Compatibility matrix

## Current assessment — 18 September 2026

Installed Steam build **25396671**, branch **beta_4**, passed the scoped static
API audit for the current diagnostic mod. Recommended executable SHA-256:
`a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`.
Classification remains `static-api-audit`, **not gameplay verified**. See
[the audit evidence and runtime limits](build-25396671-audit.md).

The helper reads this policy from project source. Restart the launcher or run
Debug → Validate to refresh its cached advisory; no new EXE or mod staging is
needed. Same-version enforcement between players is unchanged.

## Historical records

Policy updated 2026-09-18: the audited build is advisory. Other builds may
connect provided all participants report the same actual executable SHA-256
as the host. Mod hashes still must match. The launcher displays a nonblocking
recommendation and explains version-mismatch rejection. 39 automated tests
passed; launcher version 0.6.1.0 compiled. No game was launched.

Staging inspection on this date found the existing eight-file package, but
content/tf3mp_status_panel.script.tl differs from current source. Staging was
not overwritten. Use current source for a diagnostic-preview package and run
TF3's validator before uploading; gameplay synchronization is unfinished.

Current assessment (2026-09-16): build **25304653**, branch **beta_4**, is
accepted for helper/diagnostic use after static API inspection. SHA-256:
`e9dd1e2bce6e4e9e52dbe3228b65d82657636700807680b36a580453a4757686`.
The CLI reports `validation: static-api-audit`, `gameplayVerified: false`.
38 automated tests passed. TF3 was not launched. Current source mod hash:
`f9f65494c761a4ee5d9f90b01698d779ec8017111abc39e7077827bb0796628c`.
See [audit evidence and remaining runtime checks](build-25304653-audit.md).

The table below preserves the previous build's historical evidence; it is not
the acceptance record for the updated game or the current diagnostic bridge.

| Component | Exact version/hash | Validation |
|---|---|---|
| Windows host | Windows environment, Europe/London | Helper unit/integration tests only |
| Node.js | 24.1.0 | 33 automated tests passed, including encrypted control/save transport, plaintext-absence checks, expiry, and readiness gating |
| npm | 11.3.0 | `npm run check` passed |
| Compiled launcher | File version 0.5.0.0; SHA-256 `3954b1498d2694bf6cd0180712395ab8f695eb6f9bfb9980f3369418612a9b05` | Simplified WPF Host/Join/Debug interface; adds Internet/LAN selection, public endpoint codes, forwarding instructions, 30-minute join expiry, exact load instructions, and per-user mod-install preflight |
| Launcher compiler | Windows .NET Framework C# compiler 4.8.9221.0 | System compiler only; rebuildable from `launcher/Program.cs` with `Build-Launcher.ps1` |
| TF3 executable | SHA-256 `79f4d460ea2529924459ca599a0226deecc9ddf558057d289f8709c4ad98b7c2` | File hashed and build guard passed; TF3 validator subsequently run by user |
| Steam TF3 build | App 3493540, build ID 25229205, branch `beta_4` | Installed beta manifest inspected; first validator error repaired; simulation behavior not yet tested |
| Source mod manifest | SHA-256 `3ffb8a0fab917b1d92924e2faacf1a03675f0a790aeb8ffb26cd349f02b4fd90` using sorted relative path bytes followed by file bytes | Five source content files plus content index/metadata; repeating notification path removed after runtime observation; validator rejects its reintroduction |
| Per-user staged mod | `E:\\Steam\\userdata\\109855567\\3493540\\local\\staging_area\\tf3mp_status_1`; source manifest SHA-256 `3ffb8a0fab917b1d92924e2faacf1a03675f0a790aeb8ffb26cd349f02b4fd90` | Quiet build restaged after TF3 closed; all 8 source files match and no notification source/cached files remain |
| TF3 mod list/save | Not selected | No gameplay compatibility claim |

Every unaudited game update is marked as such, without blocking connections.
A source change to the mod requires a new manifest hash on all participants.
