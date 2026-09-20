TF3MP portable laptop network test (Windows x64)

VERSION 0.2.0 - ONE BATCH OF RESILIENCE CHECKS
Run once. It tests five fresh connections, rejects wrong control/save keys,
checks an authenticated diagnostic cannot send gameplay commands, downloads
and verifies the selected save, and checks the host still responds afterward.
Expected host warnings during the negative tests are normal.
No gameplay command payload is sent: the forbidden request is a diagnostic
challenge only. The diagnostic must receive DIAGNOSTIC_ONLY to pass this check.
An inconclusive network failure is NOT counted as a successful permission test.

DESKTOP:
Restart the normal launcher Host helper so it loads the updated source.
Choose LAN and a disposable/test save. Keep the helper running.
Do NOT enable either vehicle test. TF3 itself can stay closed.
Copy the private join code to the laptop. Do not post it publicly.

LAPTOP:
Copy this ZIP from the USB drive to Desktop and use Extract All.
Open the extracted folder and double-click Run-Laptop-Test.cmd.
Paste the desktop's LAN join code when prompted and press Enter.
No Node installation or TF3 installation is needed: Node is bundled with
its licence. The tool authenticates, exchanges a ping, and downloads the
host's selected save into test-results/run-... in this extracted folder.
The save is authenticated, decrypted and hash-checked, NOT opened as a game.

On PASS, send report.json (inside that run folder), not your private code.
The report contains size/hash/test status, not the code or session secret.
The code is visible when pasted into the local console; avoid screenshots
of it. Close the console afterward. Downloaded saves remain local until
you remove the test-results folder yourself.

On failure, send the displayed FAIL code. A failure-report.json with completed
checks is also saved when possible.
Do not combine files from different versions: extract into a new folder.
Both machines must be on the same LAN. Windows firewall must allow desktop Node on PRIVATE networks for
TCP ports 37333 and 37334. Do not disable the firewall or forward router ports.
Some guest Wi-Fi networks isolate devices. A fresh code expires in 30 minutes.

This is a network-only diagnostic, not a gameplay participant. It cannot
send gameplay commands or verify the laptop's game version. It does NOT
prove synchronization between two running games.
