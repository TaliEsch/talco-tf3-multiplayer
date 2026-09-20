# Four-player trusted-LAN validation matrix

Nothing in this matrix has been run. Four-player support must remain **unproven**
until every row passes on four TF3 machines/instances with evidence bundles.

| Scenario | Required observation |
|---|---|
| Join | Four authenticated peers receive immutable distinct player IDs and real TF3 player/company entities; fifth is rejected. |
| Leave/rejoin | Leaving removes the active connection without transferring ownership; authenticated rejoin restores the same mapping only under an explicit rejoin token design. |
| Balances | Four independent account balances are recorded before/after an owned expense. |
| Vehicle creation/control | Each player creates and controls only its vehicle; all four hashes match after each command. |
| Cross-company denial | Host rejects and every client independently ignores a request targeting another owner; state is unchanged. |
| Simultaneous valid input | Host canonical sequence is identical everywhere and same-update conflicts follow the documented policy. |
| Host pause | Host's own request uses the same request path and applies at the scheduled update on all peers. |
| Host-authoritative fast-forward | Accepted 2x/4x applies everywhere; unsupported levels fail closed. |
| Client speed/pause | Every player can request; last host-accepted request wins with requester and pending update visible. |
| Hash equality | Relevant-state hashes match before and after every scenario; mismatch stops the session and preserves logs. |
| Late delivery | No peer applies out of order; lateness triggers deterministic recovery rather than catch-up mutation. |
| Host disconnect | Session stops safely; no client self-promotes because host migration is out of scope. |
