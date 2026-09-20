# Third-party notices

The launcher/helper runtime uses only Node.js built-in modules. Development tests
use Fengari 0.1.5 (MIT), a Lua VM implemented in JavaScript:
https://github.com/fengari-lua/fengari. It is a devDependency, not bundled in the
launcher or mod. Its MIT attribution is Copyright 2017–2019 Benoit Giannangeli,
2017–2025 Daurnimator, and 1994–2017 Lua.org, PUC-Rio. The installed package
includes the complete licence. Exact development dependency versions and
integrity hashes are recorded in package-lock.json; transitive test dependencies
are readline-sync, sprintf-js and tmp, with their licences in node_modules.

`TF3MP-Launcher.exe` is original project code compiled against the Microsoft
.NET Framework already supplied by Windows. No .NET runtime or compiler binary
is redistributed with this project.

The Transport Fever 2 multiplayer repository by silver2127 was consulted only
as architectural background at a pinned commit documented in
`docs/reference-architecture.md`. No source code was copied or adapted.

Transport Fever 3 API declarations and first-party scripts were inspected in
the user's local installation as compatibility evidence. They are not copied
or redistributed here. Short file-and-line references appear in the project
documentation where necessary.
