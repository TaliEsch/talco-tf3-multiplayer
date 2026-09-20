# Atomic request publication on Windows

Observed failure: local coordinator fixture reported `EPERM`, operation `prepare`,
publication stage `replace`. The exact holder/cause was not identified. Windows
file replacement can fail when an existing open file lacks sharing permissions:
[Microsoft file replacement documentation](https://learn.microsoft.com/en-us/windows/win32/fileio/moving-and-replacing-files).

`replaceUnpublished` addresses transient replacement failures without retrying
gameplay. It retains the same pending filename, bytes, nonce and operation ID.
Only Windows EPERM/EBUSY receive up to five replacement attempts, with 25-ms
backoffs and a 150-ms retry window. This is not a deadline capable of interrupting
an in-flight filesystem syscall. No retry begins after the window expires.

The original pending file must remain a single-link regular file containing the
exact encoded request. Its identity is checked with bigint inode/device values;
zero device metadata is unavailable on some Windows path stats. Missing files,
altered bytes, unsafe paths and uncertain inspection preserve the original
publication failure. Recheck after backoff, before another replacement. Halt or
close preempts further attempts. Do not remove the destination to work around a
lock. Never reconstruct an already-consumed temporary file.

Successful rename means only that the request was published. Existing engine
identity, duplicate barriers, receipts and postcondition checks remain required.
An uncertain mutation is never reissued, refunded or treated as completed.
