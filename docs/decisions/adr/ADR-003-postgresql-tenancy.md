# ADR-003 — PostgreSQL and Tenancy Enforcement

> Status: ACCEPTED
> Date: 2026-08-11

## Context

`localStorage` فاقد transaction، constraint، concurrency control و tenant isolation قابل اتکاست. Foundation به persistence مرکزی و قابل مهاجرت نیاز دارد.

## Decision

- `PostgreSQL` پایگاه داده authoritative است؛ مدل اولیه managed/shared Database خواهد بود.
- داده business وابسته به Tenant دارای `workspace_id` و در scope شرکتی دارای `company_id` است.
- relationها با foreign key و constraint واقعی محافظت می‌شوند.
- authorization در Application اجباری است و PostgreSQL `RLS` فقط defense-in-depth است.
- identifierها از خانواده globally-safe مانند `UUID`/`ULID` هستند.
- زمان authoritative به‌صورت `UTC/timestamptz` ذخیره و Jalali فقط برای presentation استفاده می‌شود.
- schema change با migration نسخه‌دار و در تغییرهای سازگاری‌محور با الگوی `expand/contract` انجام می‌شود.
- Dedicated Database فقط tier احتمالی Enterprise آینده است، نه default.

## Consequences

تمام queryها، constraintهای tenant-sensitive و آزمون‌ها باید جداسازی Workspace را اثبات کنند. migration از داده Browser به mapping و reconciliation صریح نیاز دارد.

## Deferred decisions

Provider، region، `UUID` در برابر `ULID`، namespace دقیق schema، SLA و مقادیر نهایی `RPO/RTO` deferred هستند.

## References

- [Current persistence](../../data/persistence.md)
- [Current data model](../../data/current-data-model.md)
- [Future platform](../../architecture/future-platform.md)
