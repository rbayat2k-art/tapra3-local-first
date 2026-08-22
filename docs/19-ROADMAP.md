# نقشه راه

> **وضعیت سند:** `Planned` مگر جایی که خلاف آن ذکر شود.

## اولویت ۰ — تثبیت همین شاخه

- تکمیل QA مرورگر برای Workflow versioning، route شعبه‌ای و کارتابل مساعده
- افزودن E2E نقش‌های Admin/Requester/Approver/Accounting/Treasury
- شکستن `FoundationApp.tsx` و `service.ts` به use-caseهای کوچک‌تر
- code splitting و کاهش chunk build
- تست restore، quota و multi-tab واقعی

## اولویت ۱ — کامل‌سازی محصول محلی

- افزایش عمق دامنه‌های عمومی Registry بر اساس اولویت Product Owner
- pagination/virtualization برای ۵۰۰+ کاربر و تاریخچه حجیم
- مدیریت فایل با quota warning و preview امن‌تر
- گزارش/چاپ استاندارد و exportهای سازگار
- داشبورد سلامت داده، backup و workflowهای گیرکرده

## اولویت ۲ — آمادگی Server phase

- تعریف Portهای Application/Repository و DTOهای versioned
- طراحی ServerApiAdapter بدون تغییر UI flow
- API contract، server-side authorization و session واقعی
- PostgreSQL schema/migration، object storage، outbox و observability
- migration/export از IndexedDB به سرور با reconciliation و audit

## اولویت ۳ — Production readiness

- threat modeling، privacy/retention، penetration test و dependency scanning
- SLO/SLA، RPO/RTO، backup drill و incident ownership
- performance/load و disaster recovery
- stage/prod deployment، rollback و release governance

## شرط شروع

`Documented` — توسعه هر دامنه بعدی باید با تأیید Product Owner انجام شود؛ Planned بودن در این سند مجوز خودکار برای پیاده‌سازی نیست.
