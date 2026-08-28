# Implementation Plan: هسته واحد حقوقی و بازرسی

**Branch**: `codex/legal-inspection-v1` | **Date**: 2026-08-28 | **Spec**: [spec.md](spec.md)

## Summary

فاز اول یک bounded context مستقل زیر Local Foundation می‌سازد: داده مرجع شخصیت حقوقی/بانک/حساب، پرونده و اشخاص مرتبط، projection فیلدی و صفحه فارسی با هشدار داده مصنوعی. schema از 14 به 15 افزایشی می‌شود. هیچ مسیر legacy مربوط به SupportCase یا CompanyBankAccount و هیچ اتصال ساختگی به مالی استفاده نمی‌شود.

## Technical Context

**Language/Version**: TypeScript 5.8، React 19

**Primary Dependencies**: LocalFoundationService، StorageAdapter، IndexedDB، Zod موجود، Vite

**Storage**: IndexedDB محلی با storeهای افزایشی و snapshot import/export سازگار

**Testing**: Vitest + fake-indexeddb، Playwright/axe برای UI فعال

**Target Platform**: مرورگر دسکتاپ و موبایل با UI فارسی RTL

**Project Type**: برنامه وب local-first

**Performance Goals**: نمایش فهرست نمونه تا ۵۰ پرونده بدون تأخیر ادراکی؛ ایجاد پرونده زیر ۳ دقیقه برای کاربر

**Constraints**: فقط داده مصنوعی؛ بدون فایل حساس، export حساس، پرداخت نهایی یا ادعای هم‌زمانی چند دستگاه؛ هیچ مقدار کامل بانکی در state/history/audit

**Scale/Scope**: فاز اول، حدود ۹ شخصیت حقوقی، ۱۳۰ حساب مرجع و ۵۰ سناریوی QA مصنوعی در ادامه؛ MVP شامل مدل، migration، پرونده پایه و صفحه فهرست/ایجاد است

## Constitution Check

- **Evidence before implementation**: PASS — spec، قرارداد محصول و تحلیل معماری/امنیت ثبت شده‌اند.
- **Active local-first architecture**: PASS — UI فقط facade سرویس را مصرف می‌کند؛ persistence از StorageAdapter است.
- **Authorization/workflow authority**: PASS BY DESIGN — permission فیلدی و scope داخل transaction بازخوانی می‌شود؛ UI مرز امنیت نیست.
- **Recoverable evolution/outcomes**: PASS BY DESIGN — schema 15 افزایشی، create چند-store اتمیک و idempotent است.
- **Persian RTL patterns**: PASS BY DESIGN — صفحه فعال Local Foundation و tokenهای موجود reuse می‌شوند.
- **Tests/review**: PASS PLANNED — migration fixture 14، denied path، rollback، replay، UI accessibility و full gates الزامی‌اند.

## Project Structure

### Documentation (this feature)

```text
specs/005-legal-inspection-v1/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── local-service.md
└── tasks.md
```

### Source Code (repository root)

```text
src/local-foundation/
├── legal-inspection/
│   ├── model.ts
│   ├── policy.ts
│   ├── projection.ts
│   ├── service.ts
│   ├── LegalInspectionPage.tsx
│   └── legalInspection.test.ts
├── model.ts
├── storage.ts
├── storageMigration.test.ts
├── service.ts
└── FoundationApp.tsx

docs/decisions/adr/
└── ADR-012-legal-inspection-local-prototype.md
```

**Structure Decision**: منطق دامنه در پوشه مستقل نگهداری می‌شود و LocalFoundationService فقط facade/transaction integration باقی می‌ماند. Blob/file و integration واقعی عمداً وارد فاز اول نمی‌شوند.

## Phase 0 Research Result

تصمیم‌های research.md همه unknownهای مادی را بسته‌اند. استفاده عملیاتی از داده واقعی همچنان خارج scope و ممنوع است.

## Phase 1 Design Result

- schema 15 با storeهای مرجع و پرونده افزایشی است.
- حساب کامل فقط در store حساس می‌ماند؛ projection عادی masked است.
- create case یک transaction شامل counter/case/links/history/audit/event/receipt/meta است.
- UI یک tab اختصاصی Local Foundation و بنر آزمایشی دارد.

## Post-design Constitution Check

PASS. هیچ exception یا complexity waiver لازم نیست.

## Complexity Tracking

هیچ تخلف توجیه‌شده‌ای از constitution وجود ندارد.
