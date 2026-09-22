# Owned cross-image continuation evidence — 22 September 2026

This fixture moves the Step-shaped caller into `TF3OwnedCrossContinuation.exe`
and the ordinary continuation gate into `TF3OwnedCrossGate.dll`. Build and run
with `Build-OwnedCrossContinuation.ps1 -RunSmokeTest`. It does not read, launch,
patch or otherwise integrate with TF3. Product activation remains unavailable.

## Implemented and observed path

`native/owned_cross_step.asm` in the EXE creates the same audited frame shape
as the earlier cold-fragment fixture and samples registers/flags/XSTATE around
its owned trap. The DLL's exact-site VEH redirects RIP to the DLL gate, without
waiting or fabricating stack frames. `native/owned_cross_gate.asm` saves state,
probes its temporary frame and calls an ordinary helper. The controller remains
active while that helper waits. The gate then restores state and executes a
second owned INT3. VEH checks the exit site, owner thread, in-flight state and
original RSP, then redirects RIP back to the EXE continuation.

Both transfers use Windows' exception-context continuation, so there is no
rel32 return-range requirement or tail-call epilogue ambiguity. The original
real return/shadow-stack pair is unchanged. The native build uses `/W4 /WX`,
`/MD`, `/guard:cf`, `/guard:ehcont`, `/CETCOMPAT`, `/DYNAMICBASE` and `/NXCOMPAT`.
The EXE continuation and DLL gate are separately present in their respective
EHCONT tables; both are checked before starting. The new COFF metadata tool
only accepts those two owned symbol names. No mitigation is weakened.

The local run placed the EXE and DLL farther apart than the rel32 range, with
CFG, CET shadow stacks and CET context-IP validation all enabled:

- Eight actual held/resumed cases preserved all sampled GPRs, RSP, flags and
  the full 2,432-byte enabled XSAVE area (XCR0 `0xe7`), including nonzero AVX-512
  and opmask samples. Seeds cover DF, carry, zero, overflow and zero-extension.
- The worker remained blocked for 25 ms per case while its independent
  controller progressed 800 times. This is thread-control evidence, not a test
  of the production IPC protocol or game simulation semantics.
- All 56/56 actual gate instruction PCs passed Windows virtual-unwind checks,
  restoring the original caller's saved registers and actual return address.
- A ninth entry raised a native exception in the DLL helper. It unwound through
  the DLL cold fragment into the EXE caller's `__except`, which received the
  exact code. The fault latch then rejected another arm. The caller explicitly
  restored fixture XSTATE after catching the exception; automatic restoration
  of volatile XSTATE during native unwind is not claimed.
- Stop while held was rejected, without releasing the worker. After completion
  and join, stop succeeded. `FreeLibrary` succeeded but the explicitly pinned
  DLL remained mapped. A retained inert VEH handled one later owned entry trap
  by bypassing the gate; register/flags/XSTATE comparison still passed.
- Invalid XCR0 and continuation inputs were rejected. While held, a different
  thread could neither acquire the owner slot nor finish that owner's case.

The cross-image build/smoke command passes. The focused cross-image and prior
single-image suites together pass 4/4 tests, 0 failures and 0 skips using the
authorized unrestricted runner. JavaScript syntax checks and `git diff --check`
also pass. The full regression suite remains the integration lead's check.

## Boundaries of this evidence

This demonstrates a working cross-image ABI route under the observed Windows
mitigations. It does not qualify TF3: `activationPermitted`, `tf3Qualified` and
`productionLifecycleQualified` remain false. There is no game module loading,
game address, game command or production adapter in these files.

The teardown protocol tested here is deliberately bounded: stop is attempted
while one known worker is held, or after it has finished and joined. Pinning and
an inert retained handler avoid unloaded callbacks. This is not a proof of
concurrent arm/stop races, multiple simulation entrants, pending kernel
exception delivery or production control-disconnect fail-stop behavior.

The DLL's unwind data describes the owned EXE frame with no language handler.
TF3's actual Step handler/scope metadata must be checked before adaptation;
register-unwind equivalence alone is insufficient for language-specific cleanup.
The real game's accepted continuation target, stack headroom, module lifetime,
nested exceptions, exact mapped build, simulation semantics and two-trap cost
must also be qualified. No activation against TF3 follows from this fixture.
