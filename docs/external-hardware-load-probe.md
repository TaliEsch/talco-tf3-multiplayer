# External loaded-game return probe

This is a separate, observation-only Windows debugger for the installed TF3
40408 image. It has no DLL, patch, write to game memory, or engine callback.
It is independent of the in-process INT3 candidate and does not alter the
older runtime observer's image profile.

Build with `Build-ExternalHardwareLoadProbe.ps1`. The executable accepts only
`--pid <decimal-PID>`. The operator must attach to an explicitly selected TF3
process at the main menu, before loading a disposable saved game. The load
wait is bounded at 120 seconds. No command in this package launches TF3.

The probe checks the exact executable SHA-256
`de1daad3a13f3b7e9f79903361bb43769cf4f15e59271a263aefe1f075f23ef2`,
the file-backed executable RVA `0x32de88`, mapped bytes `45 33 f6`, a read-only
executable image mapping belonging to the main image, PID creation time, and
image path. It refuses any existing DR0-DR3 address or nonzero DR7 on every
thread as it appears. It arms one local execution breakpoint in DR0 per thread.
The initial attach breakpoint becomes the readiness barrier after all reported
initial threads are armed. Later thread creation events are armed before they
continue.

The first owned first-chance single-step event reports thread ID, RIP, R14,
DR0, DR6, DR7, and a guarded signed dword read from R14+`0x20c` while the
debuggee is stopped. The dword is labeled `player`; it is an observed field,
not a manager-register conclusion. Unreadable memory is reported as such.
Fresh-hit classification requires DR6.B0 alone among B0–B3, unused DR1–DR3,
and only the armed DR7 slot apart from the architectural bit 10. The owned
fixture rejects different/mixed slot status, foreign addresses and extra
enabled slots. This stricter classifier was
built and all eight owned cases passed after the live read-only run. It has not
been exercised by a second TF3 attach.
The debugger sets only the CPU resume flag and clears DR6 so the original
instruction can execute once; it does not write a target memory page.

Cleanup suspends live armed threads, restores and reads back their debug
registers, releases its own suspension counts, continues any pending event,
drains queued debug events, detaches, and checks short-window process survival.
An exit event during drain is a failed probe, even if a hit was captured.
Pending single-step events are reclassified on cleanup retry; an uncertain
owned trap is left stopped rather than forwarded. Only the initial attach
breakpoint is consumed; later target breakpoints are forwarded.
If restoration fails, the debugger retains the stopped target and its
kill-on-exit policy. This is fail-stop behavior, not a guarantee that TF3 can
survive an unrecoverable debugger failure. The output distinguishes hit,
timeout, target exit, teardown verification, and failure.

`Build-ExternalHardwareLoadHarness.ps1` builds and runs an owned process
fixture. Its cases cover initial and later thread arming, stopped R14 capture,
mapped-byte refusal, timeout cleanup, a foreign debug-register refusal,
restoration and pending-context failures followed by retry, process exit during
drain, and a later target DebugBreak. The fixture remains alive until detach
and survival are verified, then checks natural continuation and normal exit.
These tests do not qualify the behavior of TF3 itself. After development, one
observation-only attach to exact installed TF3 40408 succeeded on 28 September
2026: the probe armed 79 threads at the main menu, read selected player `3141`
through R14 at the one loaded-game return, then reported restored registers,
drained events, clean detach and a live target. The disposable save opened and
the game exited normally; its source hash remained unchanged. This proves one
read at that boundary, not a safe write or second-company behavior.
The owned tests also do not deterministically inject a context-read failure
after a second hardware trap has already queued during drain. They do exercise
the same pending-event retry classifier with two consecutive read failures at
the active hit. The queued-drain failure path remains an unverified edge and
must not be treated as a live safety qualification.
