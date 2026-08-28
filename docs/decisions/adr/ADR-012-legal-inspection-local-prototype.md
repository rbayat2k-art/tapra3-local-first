# ADR-012 — Legal and Inspection Local Prototype Boundary

> Status: ACCEPTED
> Date: 2026-08-28

## Context

The legal and inspection unit needs case, party, judicial, restriction, notice, settlement, mission and document capabilities across several legal entities and bank accounts. The active runtime is a browser-local IndexedDB application. It does not provide trusted backend tenancy, encrypted secure blob storage, MFA, malware scanning, tamper-evident audit or approved retention/legal-hold enforcement.

Legacy support-case and company-bank-account screens are not part of the active Local Foundation path and expose full banking values through local state/localStorage without the required authorization and transaction contract.

## Decision

- Build the domain as an independent bounded context under `src/local-foundation/legal-inspection` with a narrow facade in LocalFoundationService.
- Phase 1 includes legal entity/bank/account reference data, cases, company links, parties, field-level projections, additive schema migration and a Persian RTL page.
- در فاز محلی، `companyId` مرز workspace/tenant امنیتی است و حدود ۹ شرکت واقعی فقط به‌صورت `LegalEntity` مستقل درون همان workspace مدل می‌شوند. پرونده چندشرکتی با `LegalCaseCompanyLink` صریح میان همین شخصیت‌ها ساخته می‌شود؛ ارتباط میان دو `companyId` امنیتی متفاوت fail-closed است.
- Bank accounts have one legal owner. Full values stay in a protected raw store; ordinary projection is masked. Cases retain only account id and an immutable masked snapshot.
- Every mutation rechecks current session, active role, permission, resource scope, referenced records, expected version and SHA-256 command receipt inside one IndexedDB transaction. History, audit and events contain metadata only.
- Physical delete is not available. Manually entered prototype records are made inactive, void or superseded with a fixed reason category; even the generic local reset/restore fails closed while legal evidence exists. Free text is never copied into history/audit/event. The sole exception is the dedicated QA reset command, which physically removes only rows carrying the exact `qaDatasetId=legal-qa-scenarios-v1` marker and records a reset audit. Dataset-owned master data and parties cannot be linked to manually entered cases, and reset authorization is evaluated as a company aggregate (never as a caller-owned `SELF` resource), preventing dangling references and scope escalation.
- Legal business authority is derived only from active assigned legal roles and their exact persisted scope. Generic `isAdmin` status never widens a legal `SELF`, `RECORD` or `UNIT` role to `COMPANY`; an administrator without an appropriately scoped active legal role has no legal data access.
- QA-dataset cases are lifecycle fixtures, not manually editable cases. Manual create/edit dialogs consume only non-dataset master data, while dataset cases can only be created or physically removed by the dedicated atomic dataset commands.
- The UI permanently labels this phase as synthetic-data-only. Both route and service are enabled only on localhost/test, labels must declare synthetic intent, and real legal, banking, identity or document data is prohibited.
- Generic backup/export and restore fail closed whenever any legal store has rows. A future sensitive export/import requires its own field-scoped server contract.
- Document blobs, sensitive export, external representative access, final settlement/payment and live CRM/Finance/Treasury integration are deferred until their security and product contracts exist.
- The current XLSX dependency is not extended for this sensitive domain. A future export port starts with formula-safe, scoped, audited output after approval.

## Consequences

- The team can validate the legal information model and workflow with deterministic synthetic scenarios without pretending the local prototype is production-safe.
- Existing support, finance and bank-account modules remain unchanged and are consumed only through future explicit ports/snapshots.
- Schema 15 is additive. Older snapshots treat absent legal stores as empty and migration reruns are idempotent.
- Production use remains NO-GO until central trusted storage, TLS/MFA, encryption/key management, secure file handling, tamper-evident audit and retention/legal-hold are implemented and reviewed.

## Implementation evidence

- Schema `15` adds eight legal stores and upgrades a real schema-14 fixture additively and idempotently.
- Service tests cover active-role/tenant/resource denial, empty QA projection, hidden-count protection, backup/restore denial, stale session, replay/conflict, concurrent tracking allocation, audit rollback, masked projection, party-match suggestion/linking, basic edit and soft status/void.
- The browser acceptance flow creates two independent party roles and multiple linked legal entities, reloads the case, proves full card values are absent, and passes mobile overflow and serious/critical axe checks.
- Fifty deterministic synthetic scenarios are materialized atomically into the legal stores alongside any manual prototype cases. The dedicated reset removes only that identified dataset, preserves manual records and the tracking counter, and keeps reset audit evidence.
- Case history is projected as a complete persisted timeline with action, previous/new status, fixed reason category, actor snapshot and time. Linking or projecting a masked bank account requires the independent masked-bank permission; basic case access alone does not reveal the account id or mask.
- Schema 14 coverage uses an actual IndexedDB database opened at version 14 with frozen rows independent of the current seed, then proves additive and idempotent upgrade.

## Alternatives rejected

- Extending legacy SupportCase/CompanyBankAccount: active-path and security guarantees are missing.
- Modeling the domain as generic operational payloads: field-level projection, lineage and legal invariants would be fail-open.
- Storing full account numbers in cases/history: duplicates sensitive data and rewrites historical meaning when master data changes.
- Connecting unfinished finance flows and marking settlement paid: creates false finality without verified treasury evidence.

## References

- [ADR-008 — Local command concurrency](ADR-008-local-command-concurrency.md)
- [ADR-009 — Work continuity](ADR-009-work-continuity-deactivation.md)
- [Feature specification](../../../specs/005-legal-inspection-v1/spec.md)
