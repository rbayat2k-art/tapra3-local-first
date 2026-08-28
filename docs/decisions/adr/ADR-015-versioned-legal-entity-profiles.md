# ADR-015 — Versioned Legal-Entity Profiles in Treasury

> Status: ACCEPTED
> Date: 2026-08-29

## Context

The shared Treasury registry originally kept only a company name and a masked registration number. Legal work needs the legal form, national identifier, registration date, registered address, postal code and the current and historical composition of executives, board members and partners. These fields are shared reference data and must not be duplicated inside legal cases.

The current browser-local deployment is explicitly synthetic-only. The supplied production-like dataset contains identity and address data and is therefore not copied into source code, seed data, fixtures, screenshots or IndexedDB.

## Decision

- `organization_legal_entities` remains the parent and the single shared source of truth in Treasury. It gains optional registration/profile fields so incomplete legacy rows remain readable.
- `organization_legal_entity_officers` stores one versioned row per executive, board member or partner. Removing a person from the current form marks the row inactive; no historical row is physically deleted.
- `organization_legal_entity_history` is append-only metadata history. It records field codes and officer counts, never raw national identifiers, postal codes or addresses.
- Schema 17 adds only these two stores. Schema-16 snapshots may omit them; migration preserves parent identifiers and all existing legal/case links byte-for-byte.
- National identifiers, registration numbers, postal codes and officer national identifiers are accepted only by the synthetic local command, persisted masked and never returned raw in `FoundationState`, history, audit or domain events.
- Company profile creation and editing require active `treasury.reference.manage` and `treasury.reference.officer.manage` roles with exact company scope. System administration has no implicit business-data authority.
- Editing uses parent `expectedVersion`, stable command receipts and a single transaction for parent, officers, history, audit, domain event and receipt. Audit failure rolls the complete change back.
- Legal remains a read-only consumer of shared company references. It cannot create or edit Treasury master data.

## Consequences

- Treasury can show a row-based company registry and edit every profile without changing legal-case identifiers.
- A principal role (CEO, board chair or vice-chair) has at most one active holder. Other members and partners may be repeated.
- A blank sensitive field during edit preserves the previously masked value; the UI never attempts to reconstruct raw values.
- Exact real data requires the trusted backend, encryption/KMS, MFA, retention/legal-hold and tamper-evident audit gate described in ADR-012. Until then, production ingestion remains NO-GO.

## References

- [ADR-012 — Legal local prototype](ADR-012-legal-inspection-local-prototype.md)
- [ADR-013 — Shared Treasury master data](ADR-013-shared-treasury-master-data.md)
