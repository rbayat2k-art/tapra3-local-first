# معماری آینده Platform و Backend

> Status: DRAFT
> Source of truth: این سند برای جهت معماری platform/backend آینده و مرز آن با سیستم فعلی است.
> Owner: Architecture Owner
> Last validated: 2026-08-11 against accepted SaaS foundation ADRs and `agent/docs-migration@120e813`
> Supersedes: none
> Superseded by: none

این سند تکمیل platform آینده را توصیف می‌کند، نه Foundation محدودی که اکنون اجرا شده است. وضعیت اجرایی فقط در [current system](current-system.md) و [API status](api-status.md) است.

تصمیم‌های پذیرفته‌شده Foundation در [ADR index](../decisions/adr/README.md) authoritative هستند. این سند overview آینده و محل جزئیات هنوز حل‌نشده باقی می‌ماند و نباید تصمیم پذیرفته‌شده ADRها را دوباره تعریف کند.

## مسئله‌ای که معماری آینده باید حل کند

Foundation فعلی مرزهای اولیه Backend، PostgreSQL، Identity، tenancy و Audit را برای Customer ایجاد کرده است، اما بیشتر domainهای Prototype هنوز client-only هستند. platform آینده باید بدون مخلوط‌کردن قواعد دامنه با transport، migration کامل، backup، reliability و integrationها را پوشش دهد.

## تصمیم‌های Foundation پذیرفته‌شده

- مدل Hybrid با `Workspace/Tenant` به‌عنوان مرز امنیت و داده: [ADR-001](../decisions/adr/ADR-001-tenant-workspace-model.md)
- `Modular Monolith` به‌عنوان topology اولیه Backend: [ADR-002](../decisions/adr/ADR-002-modular-monolith.md)
- `PostgreSQL` managed/shared با enforcement چندلایه tenancy: [ADR-003](../decisions/adr/ADR-003-postgresql-tenancy.md)
- جداسازی Identity/Membership/Role/Scope و authorization سمت Server: [ADR-004](../decisions/adr/ADR-004-identity-session-authorization.md)
- Audit append-oriented، Transactional Outbox و integration قابل‌اعتماد: [ADR-005](../decisions/adr/ADR-005-audit-outbox-reliability.md)
- migration تدریجی Prototype با Strangler و reconciliation: [ADR-006](../decisions/adr/ADR-006-prototype-migration.md)
- مرزهای deny-by-default برای Data، AI و Security: [ADR-007](../decisions/adr/ADR-007-data-ai-security-boundaries.md)

## مرزهای پیشنهادی

| لایه | مسئولیت پیشنهادی |
|---|---|
| Web client | UI فارسی/RTL، تجربه task-based و نمایش داده مجاز؛ نه مرجع نهایی authorization. |
| Application API | use caseها، validation، authorization و orchestration دامنه. |
| Domain services | مالی، پشتیبانی، فروش، مشتری، catalog، fulfillment و settlement با مرزهای مستقل. |
| Persistence | دیتابیس مرکزی، transaction، migration نسخه‌دار، backup و retention. |
| Identity & access | احراز هویت server-side، session/token امن، role/permission و data scope. |
| Audit & integration | event/audit غیرقابل‌بازنویسی، اعلان، بانک، Issabel، پیامک، پست و import. |

## اصول پذیرفته‌شده از دانش پروژه

- زنجیره خزانه‌داری، سلسله‌مراتب فروش و قلمرو سازمانی مفاهیم مستقل‌اند.
- رفتار هر domain باید از contract و eventهای صریح عبور کند؛ تغییر مستقیم storage مشترک بین domainها مجاز نیست.
- تاریخچه مالی، فروش، تخصیص و ساختار سازمانی باید snapshot زمان رخداد را حفظ کند.
- کالا و خدمت در فاکتور ترکیبی مسیر اجرای مستقل دارند.
- داده حساس و authorization باید server-side کنترل شود.
- migration از `localStorage` باید برنامه استخراج، پاک‌سازی، mapping و reconciliation داشته باشد؛ migration خودکار فعلی وجود ندارد.

## مسیر تکاملی پیشنهادی

1. تعریف identity، organization scope، audit و قراردادهای نسخه‌دار.
2. انتقال persistence از browser به database با import کنترل‌شده.
3. انتقال use caseهای مالی و پشتیبانی با حفظ tracking/history.
4. تکمیل بخش‌های باقی‌مانده Sales پس از Customer/Lead و Sale/Invoice/Payment اجراشده، بر اساس طراحی پذیرفته‌شده و حل پرسش‌های باز.
5. افزودن integrationها پس از تثبیت domain contracts.

## موارد deferred و غیرمسدودکننده Foundation

pipeline محدود Customer Import اکنون CURRENT است و در [سند authoritative آن](../domains/sales/customer-import.md) توضیح داده می‌شود. scale آینده باید بدون حذف staging/approval شامل object storage امن، streaming/chunking، background worker، checkpoint/resume، batch idempotency و monitoring باشد. `102M` ingestion، fuzzy/AI resolution و mapping تاریخچه خرید به Invoice هنوز DRAFT/deferred هستند.

- انتخاب backend framework، Cloud provider و ابزار deployment.
- Identity Provider دقیق، MFA، recovery و session library.
- ترتیب domain-level migration، ابزار import و مدت coexistence.
- سطح consistency جزئی برای عملیات بانکی، inventory و settlement.
- AI provider، سیاست حقوقی/retention، SaaS billing، Enterprise SLA و Dedicated Database tier.
- مقادیر نهایی `RPO/RTO` و integrationهای آینده.

تا زمان تصمیم رسمی، هیچ محصول یا فناوری نمونه در اسناد legacy الزام معماری محسوب نمی‌شود. endpointهای پیشنهادی در [API contract draft](../future/api-contract-draft.md) DRAFT هستند.
