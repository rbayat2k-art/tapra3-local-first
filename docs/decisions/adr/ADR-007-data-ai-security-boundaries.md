# ADR-007 — Data, AI and Security Boundaries

> Status: ACCEPTED
> Date: 2026-08-11

## Context

Tapra2 داده هویتی، مالی و سازمانی حساس دارد و AI آینده نباید مرز Tenant یا اختیار دامنه را دور بزند.

## Decision

- دسترسی deny-by-default، data classification و tenant isolation الزامی‌اند.
- secret خارج از source code و فایل‌ها در private object storage نگهداری می‌شوند.
- AI فقط context مجاز و permission-filtered دریافت می‌کند و از همان domain authorization عادی عبور می‌کند.
- AI حق اختراع business fact یا تصمیم‌گیری بی‌صدای حساس ندارد.
- action پرریسک AI تابع policy و approval پیکربندی‌شده است.
- پیشنهاد AI authoritative fact نیست و action مادی آن audit می‌شود.

## Consequences

AI به مسیر مستقیم و بدون کنترل برای خواندن یا تغییر Database دسترسی ندارد. تست tenant isolation، redaction و authorization بخشی از gate هر قابلیت AI است.

## Deferred decisions

AI provider، model، retention، استفاده از داده برای training، الزامات حقوقی و ماتریس دقیق approval تا زمان نیاز deferred هستند.

## References

- [Security and privacy](../../engineering/security-and-privacy.md)
- [Product principles](../../architecture/product-principles.md)
- [Future platform](../../architecture/future-platform.md)
