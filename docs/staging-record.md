# Safe Mode staging record

Staged at: 2026-09-13T21:30:55.7943228+01:00

- Source: `C:\\Users\\olihf\\Downloads\\Temp\\tf3-multiplayer-prototype\\mod`
- Destination: `E:\\Steam\\userdata\\109855567\\3493540\\local\\staging_area\\tf3mp_status_1`
- Mod ID: `tf3mp_status_1`
- Source files: 10
- Staged files: 10
- Missing files: 0
- Extra files: 0
- SHA-256 mismatches: 0
- Current source manifest SHA-256:
  `84b2d891b373d521fac1258bf712b11d88531b9e4ec42297863c375f835ea098`
- Staged `mod.json` SHA-256:
  `2d27b1cc900e01238a0f48659cc4378558a9f2cc853e7beccd0f89f8b75eedd1`

The destination did not exist before the copy, and the staging operation refused
to overwrite an existing destination. No file in the TF3 installation was
changed. TF3 was later launched by the user for validation; no evidence shows the
mod was enabled in a simulation or that a save was selected.

## Validator repair

TF3's validator report at 2026-09-13 21:36:33 identified a load-blocking
namespace error in `tf3mp_status_panel.script.tl`: four `ug_require` calls
resolved base GUI modules relative to the mod. The calls now use the explicit
`::/` base namespace. Only that staged source file was replaced, its SHA-256
changed from
`64fbd48d47580add757736d6d96069d59faaee6168b490ebd1c5c9bea179b648`
to
`14030bd7c35f3086b3803eb8bc67f4bc3ec516ffa70d1a7270e0c84259ecef8d`,
and all 10 staged source files again match the project source. TF3-generated
`.cooked_pc` and `.cooked_console` validator outputs are intentionally
excluded from source-package comparison. A second TF3 validation is pending.

The next TF3 startup reached the registered panel recipe but rejected its root
node because `GameBarInfoDisplayExtension` requires a layout. The panel now
matches the first-party structure: an outer `BoxLayout` containing the
tooltip `Component`. The staged script SHA-256 changed from
`14030bd7c35f3086b3803eb8bc67f4bc3ec516ffa70d1a7270e0c84259ecef8d`
to
`179b834085f469ad5c2f2205168c73dc6ce7132a1b07225c0dc2d8889981f1d6`.
All 10 staged source files match again; another startup is pending.

## Runtime confirmation and notification removal

The next runtime review confirmed that the game-bar panel renders and its tick
and update clocks advance. It also showed that the intended one-time
notification was emitted repeatedly, causing an audible alert roughly every
second. The notification command and both notification resources were removed
from the source package. The remaining game-bar panel is intentionally quiet,
and the package validator now fails if the notification command path is
reintroduced. The revised five-content-file manifest is
`3ffb8a0fab917b1d92924e2faacf1a03675f0a790aeb8ffb26cd349f02b4fd90`.
After TF3 closed, the revised source was restaged. All eight source files match
by relative path and SHA-256. The two obsolete notification source files and
their four generated cooked-cache counterparts were removed; no file whose
name contains `notification` remains in this staged mod.
