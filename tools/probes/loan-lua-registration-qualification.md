# Loan callback registration: exact 40408 static evidence

Status: offline discovery, **no activation permission and no callable adapter
qualification**. This is the next path after the real GUI-to-Loan and
status-to-Loan module-sharing experiments failed. Do not repeat those experiments
or treat a saved Lua marker as a fresh one-use authorization.

## Image and private evidence

Executable SHA-256:
`de1daad3a13f3b7e9f79903361bb43769cf4f15e59271a263aefe1f075f23ef2`.
All addresses below are RVAs for that image, not portable addresses.

Root's private `.run/loan-lua-static-40408-20261003.mjs` checks the whole image
hash, bounded PE mappings, function ranges and function hashes, and RTTI
complete-object locator identity. Its JSON contains metadata, not game bytes.
RIP string and E8 call scans are candidates until decoded from real function
boundaries; a byte-pattern match alone does not qualify an instruction.
The executable has 119 inspected exports and no Lua-named exports. A `Lua 5.2`
string is supporting evidence, not proof of every ABI or configuration.

Root decoded these bounded private files:

- `loan-lua-loader-helper-register-40408-20261003.txt`
- `loan-lua-callee-2fbe030-40408-20261003.txt`
- `loan-lua-callee-2fbe610-40408-20261003.txt`
- `loan-lua-callee-2fbef90-40408-20261003.txt`
- `loan-lua-callee-2fbe9f0-40408-20261003.txt`
- `loan-lua-callee-2fbe960-40408-20261003.txt`
- `loan-lua-callee-2faf4b0-40408-20261003.txt`
- `loan-lua-callee-2faf5b0-40408-20261003.txt`
- `loan-lua-api-window-40408-20261003.txt`
- `loan-lua-first-closure-caller-40408-20261003.txt`
- `loan-lua-provider-usefn-40408-20261003.txt`

## Actual event route and registration arguments

Astra's exact-image review traced non-GUI `HandleEvent`:
`F43AB0 -> F45240 -> F3F7A0 -> F40F80 -> 2B75540`.
RTTI for vtable `3741350` identifies HandleEvent; `F43ED0` is PostUpdate,
not an event boundary. Do not reuse that earlier tentative identification.

`F41025` receives the provider's pair. `F4109B` loads its first member,
the `lua::State` wrapper; `F4109F` dereferences wrapper field zero;
`F410A2` passes that raw VM state to registration routine `9B4D90`.
Constructor `2FAF4B0` stores the allocator-created state at wrapper zero;
destructor `2FAF5B0` closes that same field.

The decoded registration routine passes raw state in RCX, a function object
in RDX and name in R8. It allocates userdata, looks up its registry metatable,
validates type 5, installs the metatable, clones the callback and publishes the
userdata by name. This uses TF3's C++ function-object machinery; its layout
must not be copied into a new adapter without independent qualification.

Comparison with the official Lua 5.2 `lapi.c` implementation supports these
API identities: `2FBE030` newuserdata, `2FBE610` rawgetp, `2FBEF90` type,
`2FBE9F0` setmetatable and `2FBE960` setglobal. Root corroborated their decoded
stack and type operations. Reference: https://www.lua.org/source/5.2/lapi.c.html
No Lua implementation code was copied.

The independently decoded `2FBE1F0..2FBE2B2` matches pushcclosure:
RCX raw state, RDX function pointer, R8D upvalue count. Its zero-upvalue branch
writes function/tag `0x16` and advances the top by 16 bytes. The other branch
allocates a closure, copies upvalues and writes tag `0x66`.
Actual decoded calls at `C6D3F0` and `C6D447` pass zero upvalues and native
function pointers. This establishes a concrete candidate for avoiding copied
C++ callback layouts, but does not establish safe registration timing,
script visibility, callback lifetime, exception behavior or unload safety.

## Resource and lifecycle constraints

Follow-up decoded the subscription selector `AAE550`: it invokes the registered
callback inline with the selected ResName and resolved script Entity. It does
not establish the Update worker's TLS context. Existing TLS is therefore not
an event identity check.

At post-registration NOP `F410A7`, R13 retains the invocation descriptor:
ScriptRep at `+0`, ScriptRef at `+8`, ResName pointer at `+0x10`, helper-slot
pointer at `+0x30`. Dereference the helper slot to obtain the live helper;
its Engine is at `+0` and Entity at `+0x10`. Recover the Lua wrapper from
`[RBP-0x80]`, then raw state from wrapper `+0`. RCX is volatile after the
registration call and must not be treated as the raw state at this NOP.
These are static operands, not qualified runtime pointer reads.

Root independently decoded comparator `9FF30..9FFB3`, which compares two
string fields at ResName `+0` and `+0x20`, selecting inline storage when
capacity is below 16 and pointer storage otherwise. The bounded observation
decoder `loan-resource-readback-40408.mjs` rejects invalid lengths, pointer
overflow, failed/partial reads and malformed strings. Seven focused tests pass;
they are synthetic layout tests, not owned native callback or TF3 evidence.
The actual Loan resource pair still needs correlated live readback.

Any passive observation must copy while this temporary invocation remains
alive. Saving pointers and reading them later on a worker is insufficient.
ReadProcessMemory inside VEH is not qualified by its ordinary API contract;
do not transplant the existing out-of-VEH trampoline from a different frame.
Before enabling this site, qualify bounded POD capture, nested read faults,
publication contention, exact NOP continuation and lifetime/cleanup in an owned
process. Decode and log the completed copy outside VEH. No observer is enabled.

Implemented a separate external diagnostic in the existing
`ExternalHardwareLoadProbe.exe --pid <explicit-PID> --loan-resource` tool.
It checks the exact image and mapped bytes at `F410A7`, holds the matching debug
event pending while copying, and leaves the original NOP to execute naturally
with RF. It never writes target memory or calls Lua. It temporarily modifies
hardware debug registers using the existing verified restoration/drain/detach
path. This mode refuses a target with the multiplayer native runtime or native
probe DLL loaded; it must not accompany the qualified multiplayer runtime.

`native/loan_event_resource_readback.h` copies the temporary frame's bounded
resource bytes before continuing the event. `native/loan_event_resource_readback_owned.cpp`
passed nine injected read failures with no partial publication, changed-header
rejection, guard/cross-page/no-access rejection, guard preservation, and pointer
overflow rejection. Sentinel Entity values remain observable and explicitly
invalid for identity, rather than hiding the diagnostic. The native JSON receipt
passed a round trip through the JS decoder. Nine focused JS tests pass; existing
debugger and company-assignment owned fixtures still pass. These are owned-process
and synthetic results, not TF3 resource or consumer qualification.

`Build-LoanResourceDebugOwned.ps1` builds and runs the reproducible owned-child
debugger fixture. Root independently ran both cases: two same-thread callbacks
(non-Loan then Loan), and 32 non-Loan callbacks ending at the sampling limit.
The cases verified 34 armed DR0/DR7/RF readbacks, normal continuation between
hits, restoration of original debug registers after detach, pending-event drain,
target survival and zero child exit codes. All 34 native copied-byte receipts
decoded through the JS helper. The fixture accepts no external target PID.
Private root evidence: `.run/loan-resource-debug-owned-root-20261003.log`.
These results permit the next bounded external observation attempt, not Lua
registration, actual Loan identity qualification or installment execution.

Astra traced provider lookup to `MSVCP140.dll!_Thrd_id`: the state is per-thread,
not Loan-exclusive. An authorization consumer must check the active Loan
resource/context, session, operation digest and current world generation;
matching a VM pointer is insufficient. Other scripts must not consume it.

Root independently corroborated RTTI and provider branches:

- `+C8`: StateProvider Reload, vtable `385CE00`; discovered callers include
  debug resource reload. Actual world Load Game linkage is unproved.
- `+C9`: ForceCollectLuaGarbage, vtable `385CEE0`; replacement is not proof
  of world reload.
- `+CA`: InvalidateCache, vtable `385CE38`; another distinct operation.

More importantly, actual HandleEvent supplies a Boolean that skips the pending
`+C8` replacement branch. Provider `2FB7FD0/2FB7FD8` checks that argument and
branches to `2FB805E`. These flags cannot authorize a fresh world generation.
The existing `32DE88` load-return observer remains observation only; it does
not invalidate permissions before load or prove safe same-address reuse.

## Actual world lifecycle found

A separate Astra review traced StartSavegame through StopGame to LoadGame.
Root independently checked the exact-image StartSavegame entry, simulation stop
and CGame destructor disassembly, including their `.pdata` ranges and hashes.

| Range | Static identity and scope |
| --- | --- |
| `6A6BB0..6A6D64` | CMenuUI StartSavegame; tests busy state then queues work. This is a request entry, not completed load. |
| `6A6D70..6A76D7` | CMenuUI StopGame; current CGame at UI `+0x6B0`; calls simulation stop before clearing that field. |
| `11F510..11F64F` | Stops actual CGame simulation thread and joins via `121EB0`. |
| `6900C0..690109` | Detached destruction thread; calls CGame destructor on the retained old game. |
| `11AD60..11B0C8` | CGame destructor; clears/destroys GameSim `+0x88/+0x90` and GameState `+0x78/+0x80` in its manager. |

StartSavegame's queued lambda calls StopGame at `69903D`, then preparation and
EnterGameAsynchronously before LoadGame `32B450`. LoadGame constructs a new
CGame and routes its primary GameState to the deserializer observed at
`32DE88`. These are actual world lifecycle links, unlike provider cache flags.

Destruction alone is too late for a request-time permission fence: StopGame
clears its CGame and starts a detached destruction thread. Also, a prevalidation
failure can bypass StartSavegame. Actual Loan ordering, cancellation and other
replacement paths remain unqualified. No live thread or ordering witness has
been collected; this discovery does not permit installation of a lifecycle hook.

## Next required proof

Trace the actual Loan resource context at callback invocation and real world
load begin/teardown before implementing registration. Then qualify a dormant
adapter in an owned process: balanced stack, exact return convention, denied
foreign context, one-use consumption, lifetime/cleanup and reload invalidation.
Only after those checks should a disposable TF3 run test positive consumption
and rejection of duplicates/stale evidence. The production ordinary-loan
resume gate stays false. No new loan execution, installment, reload acceptance
or gameplay readiness follows from this static evidence.
