# ADR-014 — Legal Case Operational Dossier

> Status: ACCEPTED
> Date: 2026-08-28

## Context

Phase 1 established the legal case, stable parties, shared Treasury references, invoice summaries and an append-only timeline. The next step needs in-case operational detail without creating a second source of truth for banking, finance or documents. The local IndexedDB architecture is still synthetic-only and cannot safely hold real legal document content.

## Decision

- `LegalCase` remains the parent aggregate. Proceedings, notices, deadlines and document metadata are independent versioned child aggregates.
- Schema 16 adds `legal_proceedings`, `legal_notices`, `legal_deadlines` and `legal_document_metadata` additively. Schema-15 rows are preserved byte for byte; absent new stores mean empty collections.
- A proceeding records a controlled authority type/name, stage, owner and an already-masked external reference.
- A notice belongs to exactly one visible proceeding and case. It may atomically create one deadline and one metadata-only document record.
- The deadline uses an ISO instant, explicit `Asia/Tehran`, a current active internal assignee and an independent version. Overdue is derived and never persisted as a competing status.
- Document records contain metadata only. Blob, data URL, storage path, download URL and real content are forbidden in this phase.
- Child visibility requires both parent-case visibility and the dedicated child permission. Counts, audit visibility and the UI are derived from those projected child rows.
- Every mutation revalidates the current session, active assigned role, exact scope, parent resource and child version inside one IndexedDB transaction. Child/history/audit/event/receipt/meta are committed together.
- There is no physical-delete command. A future correction must use `superseded` or `void` while preserving lineage.
- A case cannot be closed while an active proceeding, unacknowledged notice or open deadline exists. Voiding an erroneous synthetic case preserves its children and history.
- Payment/refund, judicial restriction, file upload/download, external representative accounts, GPS and background SLA guarantees remain outside this slice.

## Consequences

- Legal users can register and inspect a real operational sequence in a row-based case detail while keeping finance and Treasury read-only.
- Replaying the same command is safe, conflicting command reuse fails, and audit failure rolls the whole operation back.
- Local timers do not constitute a guaranteed legal reminder service. A trusted backend scheduler is required before production use.
- Real legal data and document content remain `NO-GO` until trusted backend tenancy, encryption/KMS, MFA, secure blob storage, malware scanning, tamper-evident audit and retention/legal-hold controls exist.

## References

- [ADR-012 — Legal local prototype](ADR-012-legal-inspection-local-prototype.md)
- [ADR-013 — Shared Treasury master data](ADR-013-shared-treasury-master-data.md)
