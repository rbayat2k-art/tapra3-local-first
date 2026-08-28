# TAPRA3 Local-first Constitution

## Core Principles

### I. Evidence Before Implementation

Every non-trivial change MUST begin with an explicit requirement, observable acceptance criteria, and repository evidence for current behavior. Agents MUST read `AGENTS.md`, `docs/engineering/source-of-truth.md`, and the task-routed current domain documents. Planned, deprecated, or conflicting documents MUST NOT be treated as implemented behavior. Missing product authority MUST be labeled `NEEDS PRODUCT DECISION`; implementation stops when the answer materially changes policy, access, money, employment, retention, or irreversible behavior.

### II. Preserve the Active Local-first Architecture

The active path is Persian RTL React UI → application/domain command → authorization and workflow guards → `StorageAdapter` → browser IndexedDB → history/audit/domain event. UI MUST NOT access IndexedDB directly or become the final authorization boundary. Historical Server/PostgreSQL designs are not current runtime authority. New abstractions MUST solve a real current use case and SHOULD have at least two consumers before becoming shared framework code.

### III. Authorization and Workflow Authority Are Non-negotiable

Sensitive commands MUST enforce permission, organizational scope, resource ownership, pinned workflow version/route, current stage/assignee, and maker/checker constraints in the service. UI hiding is only presentation. Missing historical policy MUST fail closed. HR, finance, workflow, custody, impersonation, banking, export, backup/restore, and recruitment changes MUST include denied-path tests and MUST NOT expose sensitive values in audit, events, logs, fixtures, or screenshots.

### IV. Data Evolution and Final Outcomes Must Be Recoverable

One business outcome spanning multiple stores MUST commit in one IndexedDB transaction or use a documented durable, idempotent saga with retry and recovery tests. Migrations MUST be additive and idempotent, preserve user data and historical versions, and be tested from a genuinely older fixture rather than a fixture generated wholly from the current seed. Stale-write and double-submit behavior MUST be explicit for approvals and editable records. Historical records SHOULD be retained through status/version/lineage instead of physical deletion.

### V. Persian RTL Experience and Existing Patterns

User-facing UI MUST remain Persian, RTL, responsive, keyboard-usable, and consistent with active `src/local-foundation` patterns and tokens/classes in `src/index.css`. Local Foundation dates MUST use the active Jalali UI/ISO storage boundary in `src/local-foundation/PersianDate.tsx`. Status and errors MUST NOT rely on color alone; icon-only actions need accessible names. Agents MUST verify a component exists and is active before calling it canonical. New shared UI primitives require two real consumers or an approved consolidation task.

### VI. Test and Review Before Done

Product code MUST pass `npm run typecheck`, `npm test`, and `npm run build`, plus risk-selected gates in `docs/engineering/testing-policy.md`. Bug fixes require regression evidence; access changes require negative tests; persistence changes require migration, reload, rollback, concurrency, or failure tests as applicable. Independent AI/scanner findings are advisory until classified `VALID`, `FALSE POSITIVE`, or `NEEDS PRODUCT DECISION`. No agent may declare completion with a required gate failing, an applicable valid high-risk finding unresolved, or documentation falsely marked Verified.

## Delivery and Branch Constraints

- Work occurs on a reviewable non-protected branch/worktree with a known base and clean rollback point.
- Commits remain single-purpose and reversible. Unrelated user changes are preserved.
- Parallel agents are preferred for independent read-only analysis and review; one owner controls overlapping writes.
- Dependency or CI additions require a concrete gap, pinned/reviewable configuration, minimal permissions, and a rollback path.
- Pushing the isolated branch requires authorization. Creating or merging a PR, modifying branch protection, or changing external repository settings requires explicit scope; merge is never automatic.

## Spec-driven Workflow

For a bounded feature or behavior change, use Spec Kit artifacts in this order:

1. `$speckit-specify` creates the technology-neutral requirement and acceptance criteria.
2. `$speckit-clarify` resolves material ambiguity when needed.
3. `$speckit-plan` maps the requirement to the current TAPRA architecture and UI rules.
4. `$speckit-tasks` creates dependency-ordered, test-aware tasks.
5. `$speckit-analyze` checks cross-artifact consistency for medium/high-risk work.
6. `$speckit-implement` executes only after constraints are approved.
7. `$speckit-converge`, project agents, deterministic gates, and independent review identify remaining work.

The repository `$tapra-feature-delivery` skill is the TAPRA-specific orchestration layer and remains authoritative for role selection, risk gates, finding triage, branch safety, and final hand-off.

## Governance

This constitution governs Spec Kit output and is subordinate only to explicit user instructions and repository `AGENTS.md` precedence. Amendments require a documented reason, affected principles, migration/rollout impact, and review on a non-protected branch. Runtime claims must cite active code/tests/config; product ambiguity is escalated instead of inferred. Compliance is checked during planning, task generation, review, and Definition of Done.

**Version**: 1.0.0 | **Ratified**: 2026-08-24 | **Last Amended**: 2026-08-24
