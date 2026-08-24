# TAPRA repository instructions

## Start here

- Treat `docs/engineering/source-of-truth.md` as the repository and branch authority.
- Read `docs/ai/start-here.md`, then only the domain documents relevant to the task.
- Current runtime is a Persian RTL React application backed by `LocalFoundationService`, `StorageAdapter`, and browser IndexedDB. Do not infer a live API, PostgreSQL service, or production deployment from historical documents.
- Labels matter: `Verified` and active code/tests may describe current behavior; `Planned`, `Deprecated`, and `Conflict` do not.

## Delivery workflow

For a non-trivial product change, do not start by editing code.

1. Convert the request into goal, actors, current behavior, expected behavior, rules, edge cases, permissions, data/UI impact, acceptance criteria, and open product questions.
2. Trace the current domain and architecture path. Identify files in scope, files out of scope, reuse opportunities, migration impact, and risks.
3. For UI work, map the change to `docs/ui/design-system.md` and existing components/classes before proposing new primitives.
4. Plan positive, negative-authorization, persistence/migration, concurrency, failure, and accessibility tests as applicable.
5. Implement the smallest coherent change on a non-protected branch.
6. Run the gates in `docs/engineering/testing-policy.md` and triage independent-review findings as `VALID`, `FALSE POSITIVE`, or `NEEDS PRODUCT DECISION`.
7. Never report completion while a required gate is failing or a product decision remains unresolved.

Use the repository skill `$tapra-feature-delivery` for feature work or cross-domain behavior changes.

## Multi-agent policy

- For broad or high-risk changes, delegate independent read-only work to the project agents in `.codex/agents/`: requirement analysis, domain/architecture, UI, tests, and security as applicable.
- Use only the agents relevant to the task. Small mechanical changes do not require a council.
- Keep implementation ownership with one agent unless write scopes are explicitly disjoint. Parallel reviewers must not edit product files.
- The primary agent validates evidence, resolves disagreements, and owns the final test run.

## Product and data invariants

- Preserve Persian copy, RTL layout, responsive behavior, and current accessibility semantics.
- Display/select operational dates in Jalali where the existing UI does; persist canonical operational dates in ISO/Gregorian form.
- Never enforce authorization only in the UI. Service commands must enforce permission, organizational scope, resource ownership, workflow version/route, current stage, and maker/checker rules.
- Historical workflow versions and routes fail closed when missing. Do not silently fall back to an active policy for pinned records.
- Multi-store business outcomes must use one IndexedDB transaction or a documented, durable, idempotent saga with retry tests.
- Schema/seed upgrades are additive and idempotent. Preserve user records and historical workflow versions; test a real older fixture rather than a fixture built from the current seed.
- Do not physically delete historical business records when status/version/audit retention is the established pattern.
- Never put passwords, OTPs, banking values, real PII, secrets, or snapshot contents in logs, audit summaries, fixtures, screenshots, or committed files.
- Do not invent a business rule. Mark missing authority as `NEEDS PRODUCT DECISION`.

## UI rules

- Follow `docs/ui/design-system.md`, the tokens/classes in `src/index.css`, and the closest active page under `src/local-foundation`.
- Reuse an existing page, dialog, field, table, button, date, validation, loading, empty, or error pattern before creating another.
- `src/components/ui/primitives.tsx` is an incomplete legacy/shared-library effort, not the canonical Local Foundation system. Reuse it only after verifying its tokens and behavior in the active flow.
- For new Local Foundation date input, use `src/local-foundation/PersianDate.tsx`, not the legacy date picker that persists a Jalali string.
- A new shared abstraction requires at least two real consumers or an approved consolidation task.
- Do not add raw color values when an existing semantic token expresses the meaning.
- Status and validation meaning must not depend on color alone. Icon-only controls require an accessible label.

## Code and verification

- Keep UI components away from direct IndexedDB access; use the application/storage boundary.
- Prefer explicit, single-purpose domain helpers over clever or speculative abstractions.
- Do not increase the responsibility of known giant files when a focused module can own the new behavior.
- Add regression tests before or with a bug fix. Authorization changes require denied-path tests; persistence changes require rollback or migration tests.
- Baseline required gates are `npm run typecheck`, `npm test`, and `npm run build`. Additional gates are selected by `docs/engineering/testing-policy.md`.
- Keep unrelated user changes intact. Do not merge, force-push, or modify protected branches unless the user explicitly authorizes it.
- Make reviewable commits with one purpose and explain any remaining warning or unverified area.

## Code Review Rules

### Authorization and workflow authority

- Flag any command that relies on UI hiding, generic permission alone, or a current active workflow when the record pins a version/route/assignee. Safe path: enforce scope, resource, stage, assignee, maker/checker, and pinned policy in the service and cover denied paths.

### Atomic local-first outcomes

- Flag sequential writes that can expose a final state across personnel, users, workflow records, assets, history, audit, or events. Safe path: one IndexedDB transaction, or a durable idempotent saga whose pending state survives failure and is retry-tested.

### Upgrade and sensitive-data safety

- Flag destructive/non-idempotent migrations and fixtures derived entirely from the current seed. Also flag secrets, OTPs, banking data, or real PII entering logs/audits/tests. Safe path: additive migration from a genuinely older fixture and metadata-only observability.
