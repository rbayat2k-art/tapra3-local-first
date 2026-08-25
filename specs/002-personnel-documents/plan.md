# Implementation Plan: مدارک و تکمیل پرونده پرسنلی

## Architecture

- `personnel_documents`: metadata نسخه‌دار و رکورد عملیاتی.
- `personnel_document_files`: محتوای فایل؛ خارج از `FoundationState` و فقط از سرویس خوانده می‌شود.
- helper خالص `personnelDocuments.ts`: کاتالوگ، projection کامل/ناقص، validation فایل و scope resource.
- component مشترک `PersonnelDocumentsSection.tsx`: حالت self، gate و HR.
- service اختصاصی برای upload/replace/download؛ مسیر generic اسناد پرسنلی fail closed می‌شود.
- صف نقص از projection لحظه‌ای ساخته می‌شود و store تازه‌ای برای صف ایجاد نمی‌شود.
- سطح تکمیل از همان projection ساخته می‌شود؛ در این نسخه به RBAC متصل نیست.
- تعویق تکمیل به‌ازای کاربر ثبت و ممیزی می‌شود و پس از مهلت دوباره یادآوری خواهد شد.

## Migration

- schema 10 → 11 و افزودن store محتوا.
- استخراج `fileDataUrl` رکوردهای legacy به store محتوا، checksum و حذف bytes از metadata/history.
- حفظ رکوردهای legacy به‌عنوان unclassified؛ بدون شمارش در الزام‌های جدید.
- snapshot ساده در حضور فایل ممنوع؛ snapshot رمزگذاری‌شده کامل باقی می‌ماند.

## Verification

- unit projection و file validation.
- service authorization، scope، self/HR، stale replacement، redaction و rollback.
- migration واقعی schema 10 و reload.
- E2E gate، self upload، صف HR، پرونده HR، موبایل و accessibility.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, targeted/full Playwright.
