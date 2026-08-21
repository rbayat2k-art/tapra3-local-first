# ADR-004 — Identity, Session and Authorization

> Status: ACCEPTED
> Date: 2026-08-11

## Context

Login و permission فعلی Client-side هستند. SaaS چندسازمانی باید identity انسانی، credential ورود، عضویت سازمانی و اختیار روی resource را از یکدیگر جدا کند.

## Decision

- مفاهیم `Person`، `UserAccount/Identity`، `Workspace`، `Company`، `Membership`، `Role`، `RoleAssignment`، `Permission` و `Scope` مستقل‌اند.
- Person می‌تواند Membershipهای مجاز در چند Workspace یا Company داشته باشد؛ Membership به‌تنهایی دسترسی نامحدود نمی‌دهد.
- تمام requestهای protected در Server و با رویکرد deny-by-default authorize می‌شوند.
- Identity architecture standards-based و externalizable است.
- برای Web، session مدیریت‌شده Server/BFF ترجیح دارد.
- password و token حساس بلندمدت در Browser persistence نگهداری نمی‌شود.

## Consequences

UI فقط قابلیت قابل‌نمایش را هدایت می‌کند و مرز امنیت نیست. authorization مؤثر باید Identity، Membership، RoleAssignment، Scope و policy مربوط به resource را ترکیب و در هر request بررسی کند.

## Deferred decisions

Identity Provider، session library، MFA، recovery و federation تا زمان implementation انتخاب می‌شوند، بدون تغییر این مدل مفهومی.

## References

- [Current roles and permissions](../../domains/finance/roles-and-permissions.md)
- [Security and privacy](../../engineering/security-and-privacy.md)
- [Product principles](../../architecture/product-principles.md)
