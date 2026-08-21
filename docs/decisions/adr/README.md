# Architecture Decision Records

> Status: CURRENT
> Source of truth: این فایل برای مسیریابی تصمیم‌های معماری بنیاد SaaS است.
> Owner: Architecture Owner
> Last validated: 2026-08-11
> Supersedes: none
> Superseded by: none

`ACCEPTED` در این پوشه فقط وضعیت تصمیم را نشان می‌دهد و به‌تنهایی اثبات implementation نیست. بعضی بخش‌های Foundation اکنون اجرا شده‌اند، اما وضعیت دقیق و محدودیت‌ها فقط از [معماری فعلی](../../architecture/current-system.md) و authorityهای `CURRENT` خوانده می‌شود.

| موضوع | مرجع authoritative |
|---|---|
| Tenant و Workspace | [ADR-001](ADR-001-tenant-workspace-model.md) |
| topology اولیه Backend | [ADR-002](ADR-002-modular-monolith.md) |
| Database و tenancy enforcement | [ADR-003](ADR-003-postgresql-tenancy.md) |
| Identity، session و authorization | [ADR-004](ADR-004-identity-session-authorization.md) |
| Audit، event و integration reliability | [ADR-005](ADR-005-audit-outbox-reliability.md) |
| مهاجرت Prototype | [ADR-006](ADR-006-prototype-migration.md) |
| مرزهای Data، AI و Security | [ADR-007](ADR-007-data-ai-security-boundaries.md) |

تغییر یا جایگزینی هر تصمیم پذیرفته‌شده نیازمند ADR جدید و ثبت رابطه `Supersedes` است؛ متن ADR پذیرفته‌شده برای پنهان‌کردن تاریخچه بازنویسی نمی‌شود.
