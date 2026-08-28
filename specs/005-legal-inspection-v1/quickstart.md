# Quickstart Validation: Legal Inspection Phase 1

## Preconditions

- checkout branch `codex/legal-inspection-v1`.
- use only committed synthetic fixtures.
- never paste a real name, national ID, bank account, card, IBAN or legal document.

## Targeted validation

1. Run legal domain and migration tests.
2. Create a synthetic entity, bank account, case and two party roles.
3. Reload state and verify tracking code and relations remain.
4. Switch to a basic legal user and verify account is masked and protected identity absent.
5. Switch to an out-of-scope user and verify direct case access returns no record.
6. Replay the same create command and verify one case; change payload with same command and verify conflict.
7. Inject a write failure and verify no case/link/history/audit/event/receipt remains.
8. Import a frozen schema-14 fixture and verify schema-15 empty legal stores plus unchanged prior rows; rerun migration.
9. Materialize 50 QA scenarios, verify 50 unique tracking codes and 100 party links, replay without duplicates, then run the legal-only reset.
10. Enter QA access-view and verify cases, history, party identity, banking and count deltas are all absent.
11. Verify generic export and restore fail closed whenever any legal store contains rows.

## UI validation

- open the Legal/Inspection tab at desktop and mobile widths.
- verify the synthetic-only banner is always visible.
- verify empty, loading, validation and denied states in Persian RTL.
- verify keyboard focus, labels and accessible button names.

## Full gates

```text
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e -- <legal phase test>
git diff --check
```

## Expected result

All deterministic gates pass; no real-data pattern, raw bank value, build output or test report is included in Git.

## Latest local evidence (2026-08-28)

- legal/migration targeted: 37/37 passed.
- full Vitest (single worker): 50 files, 470/470 passed, no timeout.
- Playwright legal flow: 2/2 passed, including multi-entity case, two independent party roles, masking, reload, mobile and axe.
- typecheck, lint, production build and `git diff --check`: passed; build retains only the pre-existing large-chunk warning.
