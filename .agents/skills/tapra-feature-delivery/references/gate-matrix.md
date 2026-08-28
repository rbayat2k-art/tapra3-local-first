# Risk-based gate matrix

| Change signal | Required evidence |
|---|---|
| Business rule | Positive unit/integration test plus boundary cases |
| Permission, scope, workflow, assignee | Allowed actor and denied actor/scope/stage; impersonation if relevant |
| Maker/checker | Same-actor denial and independent-actor success |
| IndexedDB write | Persistence after reload and transaction rollback/failure injection |
| Schema or seed | Genuinely older fixture, no data loss, relationship preservation, rerun idempotency |
| Approval or final multi-record outcome | stale version, double-submit/race, atomic commit |
| OTP/credential/sensitive data | expiry/rotation, actor isolation, no plaintext in storage/audit/log |
| Import/backup/restore | invalid input, integrity/checksum, partial-failure recovery, no overwrite outside scope |
| Form/modal/table | validation, disabled/loading/error/empty, RTL/mobile, keyboard/name/contrast checks |
| Navigation/session/identity switch | refresh, stale open tab, direct route, logout/login behavior |
| New dependency or CI action | lockfile, minimal permissions, version pin, vulnerability/license review |

Always run the repository baseline gates after targeted checks. Treat AI review as an independent advisory layer, not a substitute for deterministic gates.

