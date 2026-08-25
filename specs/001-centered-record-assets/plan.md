# Implementation Plan: پنجره‌های عملیاتی وسط‌صفحه و دارایی‌های پرونده پرسنلی

**Branch**: `fix/ocr-blockers-20260824` | **Date**: 2026-08-25 | **Spec**: `specs/001-centered-record-assets/spec.md`

## Summary

هفت خانواده جزئیات/اقدام عملیاتی موجود با یک پوسته نمایشی مشترک و قابل‌دسترسی، در دسکتاپ به پنجره وسط‌صفحه تبدیل می‌شوند و در موبایل به‌صورت تمام‌عرض پایین صفحه باقی می‌مانند. خطای سراسری عملیات بالاتر از لایه پنجره و در viewport نمایش داده می‌شود و validation محلی بدون تغییر داخل فرم می‌ماند. بخش موجود `MyAssetsSection` با حالت فقط‌خواندنی در پرونده پرسنلی بازاستفاده می‌شود تا داده‌های جاری، انتقال‌های باز، تاریخچه و گزارش‌های مشکل بدون ایجاد Store یا منطق دامنه جدید نمایش داده شوند.

## Technical Context

**Language/Version**: TypeScript 5.8، React 19، Node.js 22+

**Primary Dependencies**: Vite 6، lucide-react، IndexedDB از طریق StorageAdapter موجود

**Storage**: IndexedDB مرورگر؛ بدون تغییر schema، migration یا store

**Testing**: Vitest 4 و Playwright 1.62 با axe-core

**Target Platform**: مرورگر دسکتاپ و موبایل، رابط فارسی RTL و local-first

**Project Type**: برنامه تک‌صفحه‌ای React

**Performance Goals**: بازشدن پنجره و محاسبه نمای دارایی بدون درخواست شبکه و بدون کپی‌کردن داده

**Constraints**: حفظ کامل مجوزها، transitionها، OTP، چاپ خزانه، داده فرم در خطا و مسیرهای فعلی ذخیره‌سازی

**Scale/Scope**: هفت خانواده پنجره، یک پیام خطای سراسری و یک تب جدید در پرونده پرسنلی

## Constitution Check

- **Evidence Before Implementation — PASS**: موجودی هفت drawer، مسیر خطا و مدل دارایی از کد و تست‌های فعال استخراج و در spec ثبت شد.
- **Local-first Architecture — PASS**: تغییر UI است و فقط از state/service موجود استفاده می‌کند؛ دسترسی مستقیم IndexedDB اضافه نمی‌شود.
- **Authorization/Workflow — PASS**: فرمان یا مجوز جدید نداریم؛ نمای پرونده فقط‌خواندنی است و عملیات دارایی در مسیرهای موجود می‌ماند.
- **Recoverability — PASS**: هیچ schema، migration، transaction یا outcome دامنه تغییر نمی‌کند.
- **Persian RTL — PASS**: پوسته مشترک، logical layout، موبایل، focus و پیام متنی خطا در قرارداد UI آمده است.
- **Test and Review — PASS**: تست regression مرورگر، تست‌های موجود دامنه و gateهای کامل اجباری هستند.
- **Branch Safety — PASS**: کار روی `fix/ocr-blockers-20260824` انجام و در commitهای تک‌منظوره نگهداری می‌شود؛ main تغییر نمی‌کند.

## Project Structure

### Documentation

```text
specs/001-centered-record-assets/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ui-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code

```text
src/
├── index.css
└── local-foundation/
    ├── RecordDialog.tsx                 # پوسته مشترک نمایشی و focus
    ├── FoundationApp.tsx                # پیام خطای عملیات
    ├── ErpWorkspacePage.tsx             # جزئیات عمومی
    ├── EmployeeAdvanceUi.tsx
    ├── PurchaseRequestUi.tsx
    ├── TreasuryExecutionUi.tsx
    ├── AssetCustodyUi.tsx
    ├── LifecycleOperationsUi.tsx
    ├── RecruitmentPage.tsx
    ├── MyAssetsSection.tsx              # حالت self و personnel-profile
    └── PersonnelPages.tsx               # تب دارایی‌ها و اموال

e2e/
└── record-dialog-assets.spec.ts
```

**Structure Decision**: ساختار تک‌برنامه‌ای موجود حفظ می‌شود. پوسته مشترک فقط presentation/focus را مالک است و هفت مصرف‌کننده واقعی دارد. هیچ منطق دامنه، مجوز یا persistence وارد آن نمی‌شود.

## Design Decisions

1. کلاس‌های `drawer-*` در این مرحله برای سازگاری و چاپ خزانه حفظ می‌شوند اما رفتار دسکتاپ آن‌ها centered می‌شود.
2. پنجره مشترک focus entry، Tab/Shift+Tab، Escape، بازگرداندن focus و بستن با backdrop را یک‌دست می‌کند.
3. خطای سرویس به‌صورت alert ثابت و قابل‌بستن، بالاتر از scrim نمایش داده می‌شود؛ خطاهای فیلدی در `FormValidationSummary` همان فرم باقی می‌مانند.
4. `MyAssetsSection` حالت نمایش پرونده می‌گیرد و در آن همه فرمان‌های self-service پنهان‌اند؛ فقط داده و جزئیات نمایش داده می‌شود.
5. جریان تعویض تخصصی دارایی خراب ایجاد نمی‌شود؛ داده‌های مسیر فعلی گزارش، رسیدگی، عودت و تحویل جدید فقط قابل مشاهده می‌شوند.

## Complexity Tracking

هیچ تخطی از قانون اساسی پروژه یا abstraction بدون مصرف‌کننده ایجاد نمی‌شود.
