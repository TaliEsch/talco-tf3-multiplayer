# Owned cold-fragment continuation evidence — 22 September 2026

`Build-OwnedColdContinuation.ps1 -RunSmokeTest` builds and executes an owned
process fixture. It contains no game path, game read, game patch or activation
mode, and is not linked into the production runtime. It is a concrete positive
alternative to the conventional arbitrary-RIP `PROC FRAME` rejected by
`inprocess_continuation_gate_probe.*`.

## Mechanism and exact scope

`native/owned_cold_continuation.asm` constructs an ordinary called function with
the audited Step frame shape: body RSP is 16-byte aligned, the actual return is
at +0x58, saved XMM6 at +0x20 and original nonvolatile registers at +0x30 through
+0x70. It executes `INC r15d` before an owned static breakpoint. The VEH in
`native/owned_cold_continuation.cpp` changes only RIP to the owned gate; it does
not wait, allocate, create a return address or change the shadow stack. This
models the state after production's already-tested INC emulator, whose audited
TF3 continuation is RVA `0x159584`. That RVA is evidence only, never dereferenced
or executed by this fixture.

The gate is described as a cold fragment of the interrupted frame. Complete
unwind records describe each temporary RSP state and restore the original
function's saved registers and real return address directly. A 16 KiB temporary
frame is probed a page at a time, all GPRs/flags are saved, DF is cleared for the
helper, and XSAVE/XRSTOR preserve the currently enabled user XSTATE. The buffer
is zero-initialized, 64-byte aligned and rejects CPUID sizes above 0x3dc0. The
fixture requires OSXSAVE and AVX. Ordinary helper execution can wait while the
controller continues. No waiting occurs inside VEH.

Windows classified an initial final direct JMP as a tail-call epilogue and
unwound the wrong return slot at that PC. The final design uses complementary
JZ/JNZ branches to the same continuation, preserving all restored flags and
registers while keeping those PCs ordinary body instructions. It has no
fabricated CALL/RET. These direct branches are inside one owned image; their
rel32 range and actual cross-image installation are not qualified.

The build uses `/W4 /WX`, assembler `/W3 /WX`, `/guard:cf`, `/guard:ehcont`,
`/CETCOMPAT`, `/DYNAMICBASE` and `/NXCOMPAT`. The small build-time COFF transform
`tools/build-owned-ehcont-object.mjs` adds exactly the gate's symbol index to
`.gehcont$y` in the owned assembler object and sets its EHCONT feature bit.
It does not modify executable instructions. The resulting loaded image is
checked for that exact EH continuation target before the fixture can run.
No protection is disabled. The symbol-index format is illustrated by the
[LLVM linker fixture](https://raw.githubusercontent.com/llvm/llvm-project/main/lld/test/COFF/guard-ehcont.s);
Windows' continuation validation is described in
[Microsoft's EHCONT documentation](https://learn.microsoft.com/en-us/cpp/build/reference/guard-enable-eh-continuation-metadata).

## Observed result

On this machine CFG, CET shadow stacks and CET context-IP validation were all
enabled. XCR0 was 231 (`0xe7`), with 2,432 bytes of standard XSAVE state.

- Eight actual breakpoint → gate → wait → resume cases passed. Seeds exercise
  zero/nonzero, overflow, carry preservation, 32-bit zero extension and DF
  restoration. Both final conditional-branch paths execute.
- All 15 general registers, RSP and flags matched the pre-trap values exactly.
  All 2,432 saved XSTATE bytes matched. Nonzero x87, XMM/YMM, AVX-512 upper
  vectors, ZMM16/ZMM31 and opmask samples are seeded; the helper changes sampled
  state before restoration. This is meaningful sample coverage, not every
  possible value of every extended register.
- The worker remained blocked for a bounded 25 ms observation per case while
  the controller made 800 total progress increments. This verifies ordinary
  waiting and independent thread progress, not production network IPC.
- Windows' real `RtlVirtualUnwind` restored the expected original frame and
  every saved nonvolatile at all 58/58 actual gate instruction PCs exported by MASM,
  including each stack-probe/restore transition and final branches. Initial
  byte-PC scans were replaced because displacement bytes are not valid PCs and
  can spuriously resemble epilogues after a link changes CALL displacements.
- A ninth breakpoint entered the helper and raised a native exception. The
  real caller's `__except` received the exact fault through the cold fragment,
  with CET enabled. The fixture restores its initial XSTATE after that catch
  as test cleanup; it does not claim Windows automatically restores volatile
  XSTATE on exceptional unwinding.
- The two focused Node regression tests pass (0 failures, 0 skips). Their first
  sandbox attempt could not spawn a process (`EPERM`); rerunning with the
  authorized unrestricted test runner passed. `git diff --check` also passes.

## Remaining qualification before a TF3 adapter

`activationPermitted`, `tf3Qualified`, `tf3CetQualified` and
`crossImageContinuationQualified` remain false. The positive result qualifies
only this owned fixture and current mitigation configuration. It does not
qualify a live game hold, engine-halt semantics or a canonical simulation update.

The real Step unwind and language-handler metadata must be checked explicitly.
If it has scope-sensitive C++/SEH cleanup, cloning register-unwind data alone is
insufficient: the correct handler/search behavior and original control PC must
also be represented. Real stack headroom, guard-page exhaustion, nested/native
exceptions at each gate phase, concurrent teardown, multiple entrants and
long-lived holds require further work. The fixture retains static code until
its process exits and removes VEH only after both owned executions finish.
It does not implement a production lifetime protocol or a controller failure
latch.

Cross-image continuation must preserve the final branch semantics and obey
relative range, load-time relocation, unwind and EHCONT constraints. No game
code should use these fixture unwind offsets until its exact loaded build and
original unwind metadata have been independently compared. A normal function
call boundary remains a possible alternative where it can be qualified.
