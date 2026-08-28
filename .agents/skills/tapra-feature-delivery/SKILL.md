---
name: tapra-feature-delivery
description: Deliver TAPRA3 product features, behavior changes, and high-risk fixes through durable requirements, domain/architecture checks, existing Persian RTL UI patterns, scoped implementation, risk-based tests, and independent review. Use for product requests that affect business rules, UI flows, permissions, workflows, IndexedDB persistence or migration, HR/finance/sales/assets, or multiple files. Do not trigger for a one-line documentation typo or a purely explanatory question.
---

# TAPRA Feature Delivery

Turn a raw Persian product request into a reviewable, tested change without relying on chat memory or inventing business rules.

## 1. Establish authority and safety

1. Read repository `AGENTS.md`.
2. Read `../../../docs/engineering/source-of-truth.md` and `../../../docs/ai/start-here.md`.
3. Confirm the current branch/worktree and working-tree state. Preserve unrelated changes.
4. Do not work directly on or merge a protected/default branch. If the current branch is unsafe, create a reviewable branch only within the user's authorized scope.
5. Load only the current domain documents routed by `start-here.md`; historical or planned text is not implementation authority.

## 2. Produce the requirement brief

Use [the feature brief template](references/feature-brief-template.md). For a non-trivial request, ask the project `requirement_analyst` agent for a read-only pass.

Separate:

- Repository evidence.
- Reasonable technical inference.
- Missing business authority.

If a missing answer changes policy, money, employment, retention, access, workflow responsibility, sensitive data, or irreversible behavior, label it `NEEDS PRODUCT DECISION` and stop before implementation.

For a bounded feature, use `$speckit-specify` to persist the approved requirement. Use `$speckit-clarify` only when material ambiguity remains; the TAPRA brief and constitution remain the domain guardrails.

## 3. Map domain, architecture, and UI

For domain/persistence/authorization work, ask `domain_architect` to trace the active path and return files in scope, files out of scope, invariants, reuse targets, migration/concurrency impact, and risks.

For UI work, ask `ui_reviewer` to map the request to `../../../docs/ui/design-system.md`, `src/index.css`, and the closest active `src/local-foundation` flow. Require an explicit UI N/A when the change has no presentation impact.

Do not claim a component or tool exists until it is present in the repository. Do not create a shared abstraction for one speculative consumer.

## 4. Build the test matrix and plan

Read [the gate matrix](references/gate-matrix.md) and `../../../docs/engineering/testing-policy.md`.

For HR, finance, auth, workflow, migration, custody, backup/import, or multi-record outcomes, ask `test_reviewer` for a read-only risk matrix before implementation. Ask `security_reviewer` when the change touches access, PII, banking, credentials/OTP, impersonation, export, restore, or dependencies.

The implementation hand-off must contain:

- Approved requirement and acceptance criteria.
- Files in/out of scope.
- Existing code/UI to reuse.
- Data and migration impact.
- Required positive and negative tests.
- Rollback point and commit boundary.

Persist the plan with `$speckit-plan`, generate dependency-ordered work with `$speckit-tasks`, and run `$speckit-analyze` before implementation for medium/high-risk cross-domain changes.

## 5. Implement with one owner

Keep one implementation owner. Use `implementation_worker` only for a bounded, approved scope and avoid concurrent edits to the same files.

Use `$speckit-implement` only after the requirement, architecture/UI impact, and test matrix are approved. Use `$speckit-converge` after implementation to append remaining work rather than hiding incomplete acceptance criteria.

Require the implementation to:

- Enforce authorization and workflow rules in the service, not only UI.
- Preserve history/audit/events without sensitive values.
- Use an IndexedDB transaction or durable idempotent saga for one business outcome.
- Add regression and denied-path tests with the change.
- Avoid unrelated cleanup and speculative architecture.

## 6. Validate and independently review

Run targeted tests first, then all required gates. At minimum for product code:

```text
npm run typecheck
npm test
npm run build
```

Run additional lint, coverage, browser, accessibility, migration, concurrency, failure, and security gates when configured and selected by the gate matrix.

Review the final diff with agents independent from the writer. Classify every finding:

- `VALID`
- `FALSE POSITIVE`
- `NEEDS PRODUCT DECISION`

Do not auto-fix an AI/scanner finding without validating its execution path and product intent.

## 7. Commit and hand off

1. Keep commits single-purpose and reversible.
2. Re-run affected gates after the final edit.
3. Push only the isolated branch when authorized. Do not create/merge a PR unless requested.
4. Report branch, base, commits, tests, warnings, unverified areas, and the exact next human decision.
5. Do not say Done unless `../../../docs/engineering/definition-of-done.md` is satisfied for all applicable items.
