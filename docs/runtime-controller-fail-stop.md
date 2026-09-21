# Runtime controller fail-stop semantics

`TF3RuntimeController` is a bounded Windows debugger qualification gate, not a
production adapter. It is exact-build gated for an explicit TF3 PID and its
automated coverage uses only a controller-created fixture process; the tests do
not locate, attach to, or terminate Transport Fever 3.

After the controller has created or attached its debug relationship it calls
`DebugSetProcessKillOnExit(TRUE)`. If that controller is terminated abruptly
while the target is held, Windows terminates the still-attached target instead
of detaching and resuming it. This is intentionally fail-stop: it can lose the
target process and unsaved work.

The only normal resume route is an authenticated `shutdown` request. It restores
the debugger registers, drains outstanding debug events, calls
`DebugActiveProcessStop`, and only after successful detach clears the
process-wide kill-on-exit setting. A cleanup failure leaves the fail-stop policy
armed; the controller does not silently detach or resume the target.

During the controller loop, a `SINGLE_STEP` belongs to the gate only when the
thread is tracked and armed, the exception address and RIP both match the same
configured site, and that site's hardware slot contains the same address with
its local execution breakpoint enabled and length-one execution mode selected.
TF and DR6 BD/BS/BT causes are rejected. DR6 B0–B3 hit bits are advisory because
Windows can omit them even when the remaining execution-trap evidence matches.
An unowned trap retains its context and `DBG_EXCEPTION_NOT_HANDLED` disposition
in an emergency hold; release is refused. Authenticated shutdown may then
deliver that original exception to the target, which can terminate if unhandled.
Accepted traps set RF for one-instruction resume and clear DR6; the saved debug
registers are restored during explicit shutdown.

Owned-process regression modes `--fixture-multithread` and
`--fixture-missing-dr6` exercise all four slots across 16 threads, repeated
pre/post/release cycles, whole-process holds, and detach. The missing-DR6 mode
clears only B0–B3 in the controller's classification input after real hardware
traps; it is not evidence that every Windows delivery variation is covered.
The child fails if a `SINGLE_STEP` reaches its exception handler.
`--self-test-trap-ownership` separately rejects unknown/unarmed threads,
address/RIP/slot mismatches, disabled slots, data/length modes and TF/BD/BS/BT.

The shared observer `Session::Clean` records per-thread arm ownership and any
visible execution-trap evidence before restoring registers. A queued first-chance
event is consumed only once, when its address, RIP and cause match either the
still-armed delivered execution slot or the saved trap evidence with already
restored registers. Concurrent trap contexts can become visible only when their
events are delivered. The currently pending event cannot supply a queued-trap
claim. Second-chance `SINGLE_STEP` events are
always forwarded, including those at configured addresses; cleanup must not
reinterpret a rejected exception as an owned breakpoint.

`--fixture-unowned-trap` raises a real OS `SINGLE_STEP` exception in the owned
child with a configured exception address but a different RIP. Its integrated
test verifies an emergency hold before exception-handler delivery, refused
release, responsive authenticated control, frozen foreground/background counters,
and explicit shutdown delivering the exception once to the child. The child
leaves it unhandled; cleanup forwards its second chance and verifies exit code
`0x80000004`. This tests actual exception delivery and teardown, but does not
qualify TF3 exception behavior or every possible Windows debug-event race.

This does not make the debugger gate production-qualified, prove a TF3
simulation boundary, preserve unsaved work, or protect against a machine or OS
failure. It also cannot make termination atomic with external operating-system
failure. It simply provides the documented Windows debugger behavior for an
abrupt controller-process exit while a debuggee remains attached.
