# ADR-013 — Shared Treasury Master Data and Legal Case Read Model

> Status: ACCEPTED
> Date: 2026-08-28

## Context

The legal prototype introduced precise legal-entity, bank and company-bank-account records. Treasury already exposed a generic `bank-account` operational module whose free-form records are not a valid banking registry. Keeping both active would create two sources of truth and would allow generic mutation paths to bypass field-level banking controls.

## Decision

- `organization_legal_entities`, its versioned officer/history children, `bank_institutions` and `company_bank_account_details` remain the canonical stores. No rows are copied; schema 17 adds only the two profile child stores described in ADR-015.
- Their management UI moves to Treasury under «اطلاعات پایه بانکی». Legal Inspection only selects active shared references.
- The `bank-account` route id is retained for compatibility, but it now renders the dedicated shared Treasury master page. Legacy free-form rows are never projected as master data and every generic mutation path fails closed.
- Shared-reference permissions are independent from legal-case permissions. Treasury stewards manage references; legal roles receive only reference and masked-account view. System administration has no implicit business access.
- Full account values are not displayed by this phase. Lists, cases, history, search, audit and events remain masked.
- Bank institutions are tenant/company-bound master rows in this prototype. Seed `v1.44` adds `tenantId` and `companyId` to legacy bank rows without changing their identifiers; unresolved legacy ownership fails closed. Projection, linking, status changes and QA reset all enforce the exact company boundary.
- Creating any shared master row is authorization against a system-owned company aggregate. A `SELF` role cannot turn a create operation into company-wide authority. Linking a legal entity to a case independently requires active shared-reference view permission.
- Legal cases use a row-based table and a resource-scoped detail dialog. Optional invoice links are read-only summaries derived from existing invoice records; legal roles receive no invoice mutation authority.
- All records remain synthetic-only until the backend/security production gate in ADR-012 is satisfied.

## Consequences

- Existing identifiers, case links and masked snapshots remain unchanged.
- Existing bank identifiers remain unchanged while ownership is backfilled additively and idempotently.
- Treasury can maintain shared references without seeing cases, parties or legal history.
- Legal staff can use references without creating or modifying them.
- Historical generic `bank_accounts` records are preserved but cannot become canonical records automatically.
- Invoice linkage is additive and missing links on schema-15 records are interpreted as an empty list.

## References

- [ADR-012 — Legal local prototype](ADR-012-legal-inspection-local-prototype.md)
- [Feature specification](../../../specs/005-legal-inspection-v1/spec.md)
- [ADR-015 — Versioned legal-entity profiles](ADR-015-versioned-legal-entity-profiles.md)
