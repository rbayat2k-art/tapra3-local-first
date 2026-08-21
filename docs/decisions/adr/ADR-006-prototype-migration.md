# ADR-006 — Prototype Migration Strategy

> Status: ACCEPTED
> Date: 2026-08-11

## Context

React/`localStorage` فعلی Prototype و منبع شناخت و مهاجرت است، نه persistence نهایی. مهاجرت Big Bang خطر از‌دست‌رفتن داده و رفتارهای معتبر را دارد.

## Decision

- مهاجرت incremental و با الگوی `Strangler` انجام می‌شود و Prototype تا پذیرش صریح حفظ می‌گردد.
- export دارای schema version، source metadata و checksum است؛ raw source برای traceability نگهداری می‌شود.
- transform از import pipeline نسخه‌دار عبور می‌کند و legacy ID به ID جدید map می‌شود.
- داده مبهم یا شکسته quarantine می‌شود.
- import از dry-run، reconciliation و اجرای idempotent پشتیبانی می‌کند.
- سیستم قدیمی هنگام validation به‌صورت read-only قابل مقایسه می‌ماند و فقط پس از پذیرش retire می‌شود.
- passwordهای قدیمی credential معتبر مهاجرتی نیستند؛ حساب با onboarding/reset امن ایجاد می‌شود.

## Consequences

هر domain معیار شمارش، mapping، خطا، rollback و پذیرش خود را پیش از cutover تعریف می‌کند. حذف زودهنگام داده Browser مجاز نیست.

## Deferred decisions

ترتیب دقیق cutover domainها، ابزار import و بازه coexistence در برنامه اجرایی migration تعیین می‌شوند.

## References

- [Current persistence](../../data/persistence.md)
- [Current data model](../../data/current-data-model.md)
- [Sales approved design](../../domains/sales/approved-design.md)
