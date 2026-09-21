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

This does not make the debugger gate production-qualified, prove a TF3
simulation boundary, preserve unsaved work, or protect against a machine or OS
failure. It also cannot make termination atomic with external operating-system
failure. It simply provides the documented Windows debugger behavior for an
abrupt controller-process exit while a debuggee remains attached.
