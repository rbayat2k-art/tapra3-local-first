# ADR-002 — Initial Application Topology

> Status: ACCEPTED
> Date: 2026-08-11

## Context

Prototype فعلی Client-only است. Foundation آینده به Backend authoritative نیاز دارد، اما مرزهای عملیاتی domainها هنوز دلیل کافی برای هزینه و پیچیدگی Microservices ایجاد نمی‌کنند.

## Decision

- Backend اولیه یک `Modular Monolith` با مرزهای صریح domain/module است.
- ارتباط Moduleها از contract و event صریح عبور می‌کند؛ دست‌کاری مستقیم storage یک Module توسط Module دیگر مجاز نیست.
- Frontend جدا می‌ماند، ولی Server مرجع validation، authorization و business transaction است.
- Module فقط با دلیل اثبات‌شده scale، reliability یا ownership می‌تواند بعداً به Service مستقل استخراج شود.
- Microservices در Foundation انتخاب نمی‌شود.

## Consequences

استقرار و transactionهای اولیه ساده‌تر می‌مانند، در حالی که جداسازی domain حفظ می‌شود. boundary test و dependency rule برای جلوگیری از تبدیل‌شدن Monolith به کد درهم لازم است.

## Deferred decisions

Backend framework، Cloud provider، container platform و زمان/معیار استخراج Serviceها implementation-selectable هستند.

## References

- [Future platform](../../architecture/future-platform.md)
- [Current system](../../architecture/current-system.md)
