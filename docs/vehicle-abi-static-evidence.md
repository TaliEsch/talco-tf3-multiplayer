# Vehicle factory and admission ABI: exact-build evidence, 22 September 2026

This is read-only static evidence, not permission to activate a hook. The actual
installed `E:\Steam\steamapps\common\Transport Fever 3\TransportFever3.exe`
was rehashed as `a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`.
No game process was opened, no installed file changed, and no native function
was invoked. The existing debugger admission quarantine remains applicable.

## Reproduction and coverage

Run `node tools/inspect-vehicle-abi.mjs <absolute-image-path>` for CALL candidates,
containing exception-directory records and range hashes. Then run
`./tools/verify-vehicle-abi-callers.ps1 -ImagePath <absolute-image-path>`.
The second tool disassembles from each containing runtime-function beginning
with the existing hash-pinned helper, verifies the CALL at its exact address,
and checks the immediate output destructor after every Add call. This run
verified **46 CALLs in 44 containing functions: one factory and 45 Add calls**.
All 45 Add callers invoke `0x3035650` on their output storage immediately after
the call. No direct factory-to-Add call is present. No executable RIP-relative
LEA reference to these entries was found. Indirect calls, tail jumps, static
function-pointer tables and inlined equivalents are not excluded by this scan.

All 45 Add CALL RVAs (each return is CALL + 5):

```text
12028d 4aded2 4ae208 4ae689 4af3ab 4d486a 4faaf7 4fb01e 4fc152
4ff520 4ff823 4ffaec 51c3d7 52936f 538d00 539464 5395e8 543da5
549e65 58a14f 595768 5a6b2a 5bff28 5f58b4 656abf 6593d5 66133c
6642ed 664592 69aa3e 6ab6c4 7236de 7280b5 72a5d5 72a9c1 72adae
72c573 72dd14 736fae 786495 b9d551 dadf8c 27c440d 289bb7f 289c3cc
```

The reproducible inventory supplies exact containing ranges for each. Calls
`0x12028d`, `0x6ab6c4`, `0x786495`, and `0x27c440d` follow entry moves through
`0x9cf510`; most other sites follow different factories. Those surrounding
instructions prove multiple source paths, not that all are UI or player input.
No function names are inferred solely from neighboring placement code.

## Function boundaries and calling shape

| Entry | Primary range / unwind record | Normal RET | Consumed incoming values |
| --- | --- | --- | --- |
| Vehicle factory `0x9eee60` | `[0x9eee60,0x9eef2c)`, unwind `0x3a94fb0`, version 1, flags 2, seven slots, prologue 0x12, unchained, handler `0x318351f` | `0x9eef0a` | RCX output entry; RDX dependency context; R8D entity; R9B stopped |
| Add `0x9d3120` | `[0x9d3120,0x9d347d)`, unwind `0x3a92d98`, version 1, flags 3, ten slots, prologue 0x27, unchained, handler `0x3180984` | `0x9d347c` | RCX list wrapper; RDX output-handle storage; R8 source entry; R9 callback value; pointer at original RSP+0x28 to progress pair |
| Add callback lambda `0x9d2b20` | `[0x9d2b20,0x9d2c86)`, unwind `0x3a93014`, version 1, flags 2, eight slots, prologue 0x14, unchained | `0x9d2c4c` | RCX captured closure; RDX connection-like weak pair; R8 processed entry vector |

These are semantic primary function entries, not exception fragments. Factory
range SHA-256 is `768dabe73c16d61e4cee6915086cc76dfb06f054c945efd738470efbc22da2fd`;
Add is `9c74c9203e52cf3c8e7ae465c4b37fbe3651bc1cb4c5e385c2428d6b6ba2a39f`.
Both return their output pointer in RAX. Neither RAX is an execution-success
boolean. The factory has an assertion tail after normal RET; `end - 1` is INT3.
The lambda also has assertion/error tails. Exception-handler existence is
established; its full cleanup maps and abnormal-exit semantics are not decoded.

Factory body RSP is entry RSP minus `0xa18`; Add body RSP is entry RSP minus
`0x1a8`. Add's RBP is entry RSP minus `0xa8`, so `[RBP+0xd0]` is the fifth
argument at original RSP+0x28. No sixth argument is consumed in the decoded
Add body. These are observation shapes, not qualified callable declarations.

## Factory lifetime and scripting boxing

The factory initializes only entity bytes 0..3 and stopped byte 4, then copies
eight bytes into variant storage and sets tag `0x32` at `+0x9b8`. Bytes 5..7 are
uninitialized padding, unsuitable for hashing or semantic serialization. It
builds a one-entity dependency input and calls `0x9eca60` with RCX output,
RDX temporary variant, R8 context, R9 dependency vector. That helper constructs
owned command storage through `0x9ec950` (allocation size `0x9c0`), resolves
dependency records through `0x2bb5a50`, and transfers the resolved vector into
the output. Construction is therefore more than copying the five payload bytes.

The only decoded direct factory CALL is `0xe18b76`, return `0xe18b7b`, inside
`[0xe18a70,0xe18caf)`. It receives the output at its stack+0x78, context from
`[virtual-call result+0x18]`, entity from a converted argument and a canonicalized
boolean. At `0xe18b89` it calls `0xe3eb50`, which allocates a `0x48` scripting
userdata-shaped object through `0x2fba2c0`, moves the `0x38` entry to object+0x10
through `0x9cf510` at `0xe3ebcc`, and stores that address at object+8. The original
stack entry is destroyed at `0xe18b9d`. Thus factory output entry identity will
change before later submission; the moved command-storage pointer can be a
local correlation aid, but is not a durable/network identity. The userdata GC
destructor and eventual send-command unboxing route remain to be traced.

## Add ownership and output initialization

1. At `0x9d3175..0x9d318f`, Add moves the fifth argument's two qwords into
   source+0x20/+0x28 and zeros the supplied pair. Any old source progress
   control is released by decrementing control+0x0c and calling virtual+8 on
   last release (`0x9d319f..0x9d31ac`). This is not the callback handle's vtable.
2. At `0x9d31af..0x9d31d7`, `[RCX]` is the vector-owning object. Its first three
   qwords are begin/end/capacity. Add moves the source into an available slot
   with `0x9cf510`, advances end by `0x38`, or invokes growth helper `0x116620`.
   `0x9cf510` transfers command pointer, dependency triple and progress pair,
   zeros these source fields, and copies result byte+0x30. Padding is not copied.
3. Source destructor `0x9cf750` releases progress control+0x0c (virtual+8 on
   last), dependency storage, variant-specific payload, and `0x9c0` allocation.
   It is called inside Add on either normal branch (`0x9d31ef`/`0x9d341e`).
   A source pointer cannot be kept after return, and a shallow copy duplicates
   ownership. The moved-from source should have zero pointer fields at RET.
4. The incoming callback is a `0x40` value with an active implementation pointer
   at +0x38. Empty means that pointer is null. With a callback, Add moves it to
   a temporary using `0x71400`: inline implementation uses virtual+8 then
   virtual+0x20 cleanup; heap implementation pointer transfers directly. This
   zeros the source's +0x38. A subsequent virtual+0 clone copies the closure
   into registration storage. Raw memcpy is not an equivalent callback move.
5. The callback closure contains list wrapper at +0, moved callback at +8,
   entry index DWORD+0x48 and generation byte+0x4c. Its registration goes through
   `0x9d1180`, `0x9d3660`. At lambda invocation, generation equality returns
   without calling the user callback; differing generation validates index
   against processed vector length and calls callback virtual+0x10 with
   RDX = vector.begin + index*0x38. It also locks/releases a connection-like
   weak reference and calls `0x2ab6c0`. Full signal/disconnection semantics are
   not established; the output must not be described as a command result.
6. RDX output is **one qword pointing to a separately allocated 16-byte pair**.
   Empty-callback Add calls `0x3035600`: allocate 16 bytes, zero both qwords,
   store allocation in output. Callback Add calls `0x30355a0`: allocate 16 bytes,
   copy a pair from registration, increment control+0x0c if present, store
   allocation in output. Both handle allocation failure by storing null.
7. Every one of the 45 decoded callers immediately destroys this output with
   `0x3035650`. That routine reads `[output]`, decrements inner control+0x0c,
   calls virtual+0x10 on last, then frees the 16-byte allocation. It does not
   use the progress-control virtual+8 convention. Outputs cannot be treated as
   a 16-byte inline pair or initialized solely by setting RAX to zero.

These facts make entry-only suppression unsafe: it would omit input cleanup,
output initialization, callback registration/completion and progress ownership.
They narrow the work needed for a real defer path but do not yet qualify one.

## Passive observation contract and remaining evidence

A qualified observer should record bounded values synchronously while each
entry is valid, using per-thread nesting and original RSP/return-address pairing:

- Common: process creation identity, actual module base/hash, thread ID,
  monotonic ordinal, site, entry RSP/return RVA, and relevant simulation update
  when available. Never infer the module base from an arbitrary address window.
- Factory entry: output-slot address, context, signed entity and stopped byte.
  No reading unconstructed output. At normal RET `0x9eef0a`: require RAX equals
  captured output, then snapshot constructed entry pointer fields, tag and five
  payload bytes; no padding or full object copying.
- Add entry: capture all five pointer arguments; bounded copy of source through
  +0x30, command tag/five bytes when tag==0x32, callback active pointer at +0x38,
  fifth-argument pair, list vector triple and generation byte. Unknown tags and
  invalid reads remain explicit. The list's vector may reallocate during Add.
- Add normal RET `0x9d347c`: require RAX equals saved output; snapshot outer
  output qword and bounded inner pair; confirm source fields, callback+0x38 and
  fifth pair are moved-from; reread vector triple/generation and newly admitted
  command pointer while paired. Do not assume exactly one insertion if callbacks
  or allocation can reenter. Record nested events rather than flattening them.
- Keep progress and connection refcount layouts distinct. Reading their two
  counters is optional diagnostic evidence, never permission to increment them.
  Reference-count atomics do not establish thread safety for the whole object.
- On exception/unwind, lost pair, cap, overflow, unexpected thread or teardown,
  invalidate saved addresses and mark capture incomplete. No async heap reads,
  synthetic returns, callbacks, allocations, state mutations or refcount writes
  belong in passive observation.

No live Add/factory thread evidence was obtained in this task. Prior handler
observations were on one thread but suffered debugger-detach failures; they do
not prove admission/factory affinity. Add has no explicit synchronization around
the vector in its decoded body, so production capture must establish ownership
and permitted callers. A successful return only establishes admission; observed
apply result and public vehicle postconditions remain separate receipts.

The next concrete qualification is the scripting userdata unbox/submission
route, followed by passive factory/Add entry and return correlation through the
already reviewed in-process loading/observation mechanism. Entry/RET hooks still
need their own displacement, unwind, register-preservation, reentrancy and
teardown review. Static function boundaries alone do not qualify a detour.

## Follow-up: userdata submission and an Add-bypass route

This isolated follow-up rehashed and decoded the same installed image, read-only.
No process was opened or game function invoked. The earlier statements that GC
and send-command unboxing were untraced are superseded by the evidence below.
Run `node tools/inspect-userdata-route.mjs <absolute-image-path> <RVA> ...`
for range hashes, qword tables and candidate references. String queries use
`string:sendCommand`. Its CALL/JMP/RIP matches remain leads, not instruction
proof; references beyond 128 are explicitly truncated. Run
`./tools/verify-userdata-route.ps1 -ImagePath <absolute-image-path>` to decode
the complete containing functions and verify **41 exact instructions in 21
primary runtime-function ranges**. This passed against the pinned image.
Neither tool creates an activation profile or writes proprietary disassembly.

### Userdata lifetime and unboxing

The `0x48` object built by `0xe3eb50` has vtable `0x373a778` at +0, pointer to
its embedded entry at +8, and the owned `0x38` entry at +0x10. The vtable's first
qword is `0xe35150`. That destructor tests object+8, calls `0x9cf750` on
object+0x10 at `0xe35174` if non-null, replaces the vtable, and only calls sized
delete (size `0x48`) if EDX bit 0 was set. The generic scripting GC wrapper
`[0xefbcc0,0xefbcf0)` converts stack index 1 to userdata, passes EDX=0, and
calls its first virtual function at `0xefbce5`. Registration function
`[0x1426a50,0x1426d70)` installs this wrapper under the literal `__gc`
(`0x372cd34`) and publishes the owning metatable using the same key loaded
from `0x3cb9860` that the box constructor uses. GC therefore destroys the
embedded entry without separately deleting scripting-allocated userdata.

`[0xe21270,0xe21472)` is the typed command unboxer. It checks the script value,
calls metatable resolver `0xdc8d80` with keys from `0x3cb9858`/`0x3cb9860` at
`0xe212c1`, requires a non-null userdata and non-null object+8, then returns
that +8 pointer through RCX output. It does not clone the entry or increment
its ownership. Error paths produce an argument error/exception. After
submission moves the entry out, userdata+8 itself remains non-null while the
embedded entry's owned fields are zeroed by `0x9cf510`. A non-null unbox result
alone cannot prove that the command remains usable or has not been submitted.

The unboxer has two decoded direct callers: `0xe1e966` in the send-command
argument packer and `0x13f7e72` in a distinct scripting conversion path. The
second does not establish a submission route and is not conflated with one.

### Named binding to engine submission

The connected registration and call sequence is:

| Stage | Decoded evidence |
| --- | --- |
| Context registration | `0x1084220` receives submission callback as fifth argument and passes it in R9 to `0xe351c0` at `0x1084373`. |
| Named sendCommand registration | `0xe351c0` keeps that R9 in R13, clones its active callback into context offset +0 (`0xe354cb..0xe354e0`), constructs literal `sendCommand` from `0x3739b98`, and calls `0xddd970` at `0xe35602`. |
| Script callable | `0xddd970` copies the `0xe0` context via `0xe24590` into scripting userdata, and installs `0xe1d250` as `__call` at `0xdddbec..0xdddc3d`. |
| Binding entry | `0xe1d250` retrieves closure userdata, clones the submission/restriction callback values, retains a weak scripting-state pair, and calls `0xe177d0` at `0xe1d39d`. |
| Argument packing | `0xe177d0` calls `0xe1e900`; that packs optional progress at +0/+8 with presence byte +0x10, callback registry reference at +0x18, borrowed entry pointer at +0x28, and callable registry reference at +0x30. Unboxing occurs at `0xe1e966`. |
| Send body | `0xe177d0` passes the context, references, entry and optional progress to `0xe26870` at `0xe17833`. The body moves the entry from userdata at `0xe26a06` and dispatches via `[context+0x38].virtual+0x10` at `0xe26a2f`. |

The send body enforces its API restriction predicate first. A second predicate
rejects callbacks/progress where disallowed. Its error literals are `API is
currently restricted` and `Callbacks are currently disallowed`. These are
existing engine validation paths; the trace does not authorize bypassing them.
The entry move happens only after these checks and callback construction.

### Installed adapters and caller provenance

Three decoded adapters connect this boxed-command route to Add. At their
entry, RCX is the installed closure, RDX the moved entry, R8 the callback value,
and R9 a progress weak pair. Each moves the entry again, clones callback via
virtual+0, transfers progress, calls Add, destroys Add's allocated output
handle immediately, then destroys its moved-from local entry. The factory's
command-storage pointer survives these moves; entry addresses do not.

| Installer evidence | Closure vtable / invocation | Add call / return | List receiver provenance |
| --- | --- | --- | --- |
| `0x11c6e0`, nonzero incoming R9B branch, installs at `0x11c76c`; fifth arg to `0x1084220` at `0x11c7f6` | `0x3677c00`, +0x10 = `0x1201c0` | `0x12028d` / `0x120292` | `[[closure+8]+0x1e8]` |
| `0x69a350`, installs at `0x69a6e9`; fifth arg to `0x1084220` at `0x69a7a5` | `0x36c5c58`, +0x10 = `0x6ab5f0` | `0x6ab6c4` / `0x6ab6c9` | `[[[closure+8]+0x6b0]+0x1e8]` |
| `0x27c26a0`, installs heap closure at `0x27c30c9`; fifth arg to `0x1084220` at `0x27c3245` | `0x3783520`, +0x10 = `0x27c4330` | `0x27c440d` / `0x27c4412` | `+0x1e8` of the object returned by `[closure+0x40].virtual+0x10` |

This is structural caller provenance, not a live claim that a particular UI
button or script context selects any one adapter. The vtable `0x3677b20` also
invokes `0x1201c0` and is installed at `0x1184cc`; its downstream consumer was
not fully traced here. No tag filter in the three decoded adapters excludes
`VehicleSetStoppedByUser` tag `0x32`. They can receive that boxed entry through
the verified generic binding, but a live receipt must establish which one did.

**Add is not a complete command interception boundary.** The zero R9B branch
in the same `0x11c6e0` installer selects vtable `0x3677c38` at `0x11c895` and
passes it through the same fifth argument at `0x11c988`. Its invocation is
`[0x120430,0x120535)`, which never calls Add:

- It moves the entry and progress pair, then reads the per-thread pointer at
  TLS-block+0x10 (`0x120478..0x120490`). If present, it moves the entry directly
  into that vector, including vector growth through `0x116620`.
- If that pointer is absent, it obtains the interpreter from
  `owner=[closure+8]`, `pool=[owner+0x1f0]`, index DWORD at pool+0x98 and selected
  pointer at pool+0x78+index*8. It calls `0x9e2380` at `0x1204df`, then invokes
  the completion callback on the processed entry at `0x1204f3`.
- `0x9e2380` checks dependency identities/revisions through `0x2bb5dc0`, reads
  the command tag at +0x9b8, calls dispatcher `0x9d7aa0` at `0x9e243e`, stores
  AL in entry+0x30, completes live progress with float 1.0, and refreshes
  dependency records through `0x2bb5a50`. Invalid dependencies set result byte
  zero and skip dispatch. These semantics support execution, not just enqueue.

Thus an Add-only observer may remain useful for its explicit scope, but a
multiplayer capture/suppression claim must cover this separate TLS/immediate
route and establish the relevant context/thread selection.

### Callback, progress and retention obligations

Even an omitted user callback becomes a native callback wrapper in the send
body: allocated `0x28` closure with vtable `0x373a730`, registry reference at
+8/+0x10 and weak scripting-state pair at +0x18/+0x20. Its invocation entry
`0xe3a500` adds 8 to RCX and tail-jumps to `0xe260d0`. That function copies the
entry dependency records, verifies that the scripting state still exists and
the stored reference is a callable, then calls `0xe0d630`. Destroyed state
causes a logged skip (`0x3739ba8`), not a callback into freed state.
`0xe0d630` passes command pointer, pointer to result byte+0x30 and copied
dependency vector to callback marshaler `0xd8a820`. Callback invocation is
separate from admission output initialization.

Optional progress initially owns a strong pair in the argument pack. The send
body creates a weak pair by incrementing control+0x0c and hands it onward;
the outer argument pack releases its strong reference afterward. Callback
registry references have explicit retain/release helpers and source reference
sentinel `-2`. A deferred command cannot retain raw stack pointers, memcpy
callback values, ignore registry/state lifetime, or omit these releases.
The detailed exceptional cleanup maps, registry helper semantics, TLS queue
drain and callback timing remain unqualified.

The next passive correlation should include the three Add return RVAs above,
factory command-storage pointer and payload, plus the selected context adapter
where possible. The scripting send function supplies a more precise upstream
lead for the supported vehicle slice; it does not capture arbitrary native
builder actions by itself. No safe defer/replay implementation, caller thread
affinity, callback-after-recovery policy or live action execution is claimed
by this static trace.

## Follow-up: exact common send-call cleanup and stock UI completion

The installed image hash was rechecked as
`a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5`.
The send body `[0xe26870,0xe26b54)` has range hash
`c2bb518efc6ee463d21b2b5b1b050d9420f303ba4f4b0988e65d99a8a28fa5cf`.
After the owned entry is moved from userdata at `0xe26a06`, the indirect
submission call at `0xe26a2f` receives RCX=`[RSI+0x38]` implementation,
RAX=its vtable, RDX=RBX=local owned entry, R8=callback value at
current RSP+`0xf0`, and R9=progress weak pair at RSP+`0x30`.
Normal continuation at `0xe26a32` destroys the local entry through `0x9cf750`
at `0xe26a36`, releases progress at `0xe26a41..0xe26a5a`, destroys the
callback implementation at `0xe26a5e..0xe26a74`, and releases a scripting
registry reference at `0xe26a7b..0xe26a92`. This boundary is upstream of
the decoded Add and TLS/immediate adapters; it avoids synthesizing an Add
output handle, but does not itself provide a safe hook mechanism.

Stock vehicle-window source in the installed `gui.zip`,
`gui/entity_window/vehicle/vehicle.tl:323–338`, uses
`gui/main/engine_react_util.tl`'s `useStepState`.
Its lines 35–54 increment `cmdCounter` before `sendCommand` and decrement
only in the callback; lines 79–82 suspend state refresh while the count is
nonzero. Simply skipping submission without a completion callback would leave
the UI pending. The native callback implementation's vtable is `0x373a730`;
virtual +`0x10` is `0xe3a500`, which reaches `0xe260d0` and marshals the
result byte at entry+`0x30`. Destructor `0xe3a490` releases scripting-state
ownership and a Lua registry reference. Retaining or destroying it on an IPC
thread is not qualified. Synchronous native failure completion could be a
candidate for rejecting an original action before separately ordering a
semantic intent, but must be verified in an owned fixture and live disposable
game. Accepted deferral requires more extensive owner-thread lifetime work.

The live passive stop trial recorded `crossThread:true`: construction and
submission were not on one observer thread. No same-thread-only queue may be
inferred from the static call path. The current passive trap is at `0xe26a2c`,
the preceding `mov rdx,rbx`, and resumes at the **unpatched** indirect call
`0xe26a2f`; a narrowly validated call-target substitution could reuse that
mechanism without trapping the CALL itself. Whether the callback can safely
serve as that target under the active mitigations, exceptions and teardown is
still a qualification question. Patching `0xe26a2f` itself and resuming at
the same RIP would retrap and is not a valid design.
