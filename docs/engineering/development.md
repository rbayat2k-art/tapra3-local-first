# راهنمای توسعه فعلی

> Status: CURRENT
> Source of truth: This document for current development setup and commands
> Owner: Engineering Owner
> Last validated: 2026-08-17 against `agent/role-permission-foundation`
> Supersedes: none
> Superseded by: none

## پیش‌نیازها

- Node.js و npm
- PostgreSQL 18.x از Docker Compose در ماشین‌های پشتیبانی‌شده
- در Windows بدون Docker: PostgreSQL native فقط به‌عنوان development fallback

## محیط

`.env.example` را به `.env.local` کپی و placeholderها را محلی جایگزین کنید. `.env.local` ignored است و هرگز نباید commit شود. runtime باید از `tapra2_app` و migration از `tapra2_owner` استفاده کند؛ `postgres` superuser برای اجرای برنامه مجاز نیست.

در Windows، `scripts/setup-native-postgres.ps1` با دریافت تعاملی رمز admin، database/userهای محدود را ایجاد می‌کند. رمز admin ذخیره نمی‌شود.

## فرمان‌ها

| فرمان | کارکرد |
|---|---|
| `npm install` | نصب dependencyها |
| `npm run infra:up` | اجرای PostgreSQL با Docker Compose |
| `npm run db:migrate` | اعمال migrationهای نسخه‌دار |
| `npm run db:seed` | ایجاد داده deterministic توسعه |
| `npm run db:setup` | migration سپس seed |
| `npm run dev:all` | اجرای Web روی `3000` و Backend روی `3101` |
| `npm run local` | setup database و اجرای هر دو process |
| `npm run local:docker` | بالا‌آوردن container و اجرای local workflow |
| `npm run build` | build Web و Backend |
| `npm run lint` | typecheck Web و Backend؛ ESLint نیست |
| `npm test` | integration test روی `tapra2_test` |

داده seed صرفاً توسعه‌ای است و نباید برای production استفاده شود.

## روش توسعه محصول

ترتیب مصوب توسعه هر vertical slice چنین است و پرش از business contract یا acceptance مجاز نیست:

`Master Blueprint → approved role/workflow → UI → business contract → permission/scope → backend gap → implementation → local product acceptance → regression tests → audit → PR/CI → merge`

هر کار جدید از آخرین `origin/stable` روی branch/worktree ایزوله آغاز می‌شود. `stable` مستقیم تغییر نمی‌کند؛ merge فقط پس از Draft PR، CI و review مستقل انجام می‌شود.
