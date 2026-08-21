# ADR-005 — Audit, Outbox and Reliability

> Status: ACCEPTED
> Date: 2026-08-11

## Context

عملیات مالی، تغییر دسترسی، integration و automation به تاریخچه قابل‌ردیابی و انتشار مطمئن event نیاز دارند؛ تغییر state بدون evidence یا event گم‌شده قابل قبول نیست.

## Decision

- business audit به‌صورت append-oriented حداقل actor، timestamp، Workspace/Company scope، action، result و در صورت نیاز reason و previous/new state را ثبت می‌کند.
- Audit history بی‌صدا بازنویسی نمی‌شود.
- انتشار domain/integration event از `Transactional Outbox` استفاده می‌کند.
- commandهای حساس idempotent هستند.
- integrationها retry، deduplication و correlation ID دارند.
- کارهای طولانی در Background Worker اجرا می‌شوند.

## Consequences

تغییر business state و ثبت outbox در یک transaction انجام می‌شود. Consumerها باید duplicate delivery را تحمل کنند و عملیات قابل ردیابی باشد.

## Deferred decisions

Queue/Broker، بازه retry، retention، archival و سطح نهایی tamper evidence deferred هستند.

## References

- [Product principles](../../architecture/product-principles.md)
- [Future platform](../../architecture/future-platform.md)
- [Finance rules](../../domains/finance/business-rules.md)
