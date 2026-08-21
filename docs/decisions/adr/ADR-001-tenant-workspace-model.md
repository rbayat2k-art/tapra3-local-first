# ADR-001 — Tenant / Workspace Model

> Status: ACCEPTED
> Date: 2026-08-11

## Context

Tapra2 باید از مشتریان تک‌شرکتی و گروه‌های چندشرکتی پشتیبانی کند، بدون اینکه شناسایی یک Person یا گزارش گروهی باعث دسترسی میان مشتریان مستقل شود.

## Decision

- مدل tenancy از نوع Hybrid است.
- `Workspace/Tenant` مرز اصلی مشتری SaaS، امنیت و داده است و یک یا چند `Company` دارد.
- `Company` شخصیت تجاری/حقوقی داخل Workspace است؛ `Department`، `Branch` و `Team` scopeهای داخلی‌اند.
- داده Tenantها isolated است؛ دسترسی Company-scoped و گزارش گروهی نیازمند permission صریح است.
- تطبیق identity میان Tenantهای مستقل دسترسی متقابل ایجاد نمی‌کند.
- روابط cross-tenant فقط با Contract، integration یا reference صریح برقرار می‌شوند.

## Consequences

مشتری تک‌شرکتی یک Workspace با یک Company دارد. Membership و policy باید scope را صریح نگه دارند و هیچ request نباید tenant context را صرفاً از ورودی Client بپذیرد.

## Deferred decisions

مدل نهایی billing، entitlement و جزئیات tier اختصاصی Enterprise تا زمان نیاز deferred است.

## References

- [Product principles](../../architecture/product-principles.md)
- [Future platform](../../architecture/future-platform.md)
