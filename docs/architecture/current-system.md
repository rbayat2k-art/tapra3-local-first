# معماری فعلی سیستم

> Status: CURRENT
> Source of truth: This document for current system architecture and technology stack
> Owner: Architecture Owner
> Last validated: 2026-08-16 against `agent/global-operational-shell-hardening`
> Supersedes: none
> Superseded by: none

Tapra2 اکنون یک vertical slice از معماری SaaS را در کنار SPA قدیمی اجرا می‌کند. این coexistence عمدی و مطابق الگوی Strangler است؛ پیاده‌سازی کامل همه domainهای آینده را نشان نمی‌دهد.

## اجزای اجراشده

| بخش | وضعیت فعلی |
|---|---|
| Web client | React 19، TypeScript 5.8، Vite 6 و Tailwind 4؛ UI فارسی/RTL |
| Backend | Express modular monolith در `server/src/` با prefix نسخه‌دار `/api/v1` |
| Database | PostgreSQL 18.x با migrationهای ترتیبی در `server/migrations/` |
| Identity | login محلی، session opaque در database و cookie دارای `HttpOnly` و `SameSite=Lax` |
| Organization | `Workspace`، `Company`، `Membership`، انتخاب context و permission سمت server |
| Customer 360 slice | profile، phone/address چندتایی، provenance، timeline، duplicate check و merge/unmerge تراکنشی در PostgreSQL |
| Sales Lead slice | Lead، صف شخصی، assignment/reassignment، Call Log، relationship policy، Campaign/Promotion context و history تراکنشی در PostgreSQL |
| Canonical product shell | Dashboard عملیاتی، navigation و tabهای permission-aware برای Customer، Sales، Invoice/Payment، Warehouse و Organization در یک SPA واحد |
| Prototype preservation | منطق domainهای migrateنشده در source و `localStorage` حفظ شده، اما از ناوبری عملیاتی مخفی است و authorization SaaS محسوب نمی‌شود |

ورودی Backend در `server/src/index.ts` و composition آن در `server/src/app/create-app.ts` است. Web client فقط از client متمرکز `src/foundation/api/client.ts` به Foundation API متصل می‌شود.

## مرز فعلی migration

- session، Organization، Customer 360/Import، Sales Lead/Queue/Assignment/Call، Sale/Invoice/Payment/Financial Review و Warehouse Foundation از PostgreSQL استفاده می‌کنند.
- صفحه Customer فقط تجربه واحد `SaasCustomerWorkspace` را نشان می‌دهد؛ فناوری persistence از UI عادی حذف شده است.
- هیچ داده قدیمی `localStorage` حذف یا خودکار migrate نمی‌شود.
- domainهای مالی عمومی، Support، Letters، Chat و Sales خارج از vertical slice فعلی در source حفظ شده‌اند، اما هنوز server-backed نیستند و در ناوبری عادی نمایش داده نمی‌شوند.
- موتور کامل Campaign/Promotion، Shipment/Delivery، Service Fulfillment، Commission، AI Sales، Outbox و integration آینده با وجود ADR یا سند DRAFT، CURRENT نیستند. Invoice/Payment محدود فروش و Warehouse Foundation اجرا شده‌اند، اما Finance عمومی، accounting ledger یا Logistics پیشرفته نیستند.

Customer 360 foundation هویت Workspace-level را نگه می‌دارد و عملیات Sales فعلی relationship/activity، Sale و Invoice شرکت را به آن متصل می‌کند. fuzzy matching، import حجیم و AI entity resolution اجرا نشده‌اند. merge رکورد بازنده را حذف نمی‌کند و از رابطه دارای lineage برای unmerge استفاده می‌کند. UIهای Campaign، Catalog، Batch Invoice، Coordination و Fulfillment همچنان prototype-backed هستند؛ `SaasSalesInvoiceView` برای ثبت Sale/Invoice و Financial Review از Backend استفاده می‌کند، اما وجود این vertical slice به معنی Backend کامل Sales/Finance نیست.

## Technology stack

نسخه دقیق dependencyها از `package.json` خوانده می‌شود. اجزای اصلی عبارت‌اند از React، TypeScript، Vite، Tailwind، Express، `pg`، Zod و Vitest. PostgreSQL رسمی development با Docker Compose تعریف شده و native PostgreSQL فقط fallback تنظیم‌پذیر محیط توسعه است.

## مراجع

- [وضعیت API](api-status.md)
- [مدل داده](../data/current-data-model.md)
- [Persistence](../data/persistence.md)
- [توسعه](../engineering/development.md)
- [امنیت](../engineering/security-and-privacy.md)
- [عملیات فعلی Lead](../domains/sales/current-lead-operations.md)

## Customer Import اجراشده

Customer 360 اکنون یک pipeline محدود و server-backed برای UTF-8 CSV دارد. فایل ابتدا در `customer_import_jobs` و `customer_import_records` staging می‌شود؛ normalization، validation و duplicate detection قبل از هر تغییر master انجام می‌شوند. فقط تصمیم‌های نهایی و Approval دارای permission می‌توانند در یک transaction به Customer 360 اعمال شوند. جزئیات authoritative در [Customer Import](../domains/sales/customer-import.md) است.

این pipeline از `xlsx` استفاده نمی‌کند. پردازش `102M`، worker پس‌زمینه، fuzzy/AI resolution و تبدیل purchase history به Invoice هنوز اجرا نشده‌اند.

## ادغام محصول

جزئیات shell واحد، backing status و validation در [Canonical Product Integration](../engineering/canonical-product-integration.md) است. وضعیت Gateهای engineering در [Engineering Gate A](../engineering/engineering-gate-a.md) نگه‌داری می‌شود.
