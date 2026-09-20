# Offline native-image investigation — 20 September 2026

Implemented `tools/inspect-native-image.mjs` as a read-only PE inventory, not an
injector or hook scanner. It bounds headers, sections and export tables, reports
incomplete prefix inspection explicitly, hashes through the same opened handle,
and rejects detected file changes. Certificate-table presence is not signature
verification. Debug-directory presence is not access to debug symbols. The tool
never launches or attaches to a process and never returns executable bytes.

Primary-agent inspection of the installed `TransportFever3.exe` found:

- SHA-256 `a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`.
- x64 PE; 69,690,808 bytes; eight sections.
- Export-name table fully inspected within the 64 MiB inspection prefix.
- Named exports are FT_/TT_ font-library functions, not gameplay command entry
  points. No exported stop-placement, capture, cancellation or replay API found.
- Three debug directory entries and a certificate table; neither symbols nor
  signature trust was established. No adjacent .pdb file was found in the game
  installation root; that is not a claim about every location on the machine.

This inventory does not locate internal functions or establish their ABI. No
address, signature, function layout or safe interception point is qualified.
Native development still requires concrete command-boundary discovery and a
supervised disposable-process validation before interception/replay. A DLL loader
alone would not solve this missing boundary and is not an acceptance deliverable.

The public station alternative remains recorded in
`phase2-station-template-path.md`: the evaluator exists, but complete initial
params and placement/connectivity need qualification. Neither path clears Phase 2.
