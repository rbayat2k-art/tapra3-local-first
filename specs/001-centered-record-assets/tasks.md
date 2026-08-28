# Tasks: پنجره‌های عملیاتی وسط‌صفحه و دارایی‌های پرونده پرسنلی

**Input**: `specs/001-centered-record-assets/`

## Phase 1: Foundation

- [X] T001 [US1] افزودن regression test اولیه برای semantics، جایگاه و موبایل پنجره در `e2e/record-dialog-assets.spec.ts`
- [X] T002 [US1] ساخت پوسته مشترک focus و dialog در `src/local-foundation/RecordDialog.tsx`

## Phase 2: User Story 1 — پنجره‌های عملیاتی وسط‌صفحه

- [X] T003 [US1] انتقال جزئیات عمومی و مساعده به `RecordDialog` در `src/local-foundation/ErpWorkspacePage.tsx` و `src/local-foundation/EmployeeAdvanceUi.tsx`
- [X] T004 [US1] انتقال خرید و خزانه با حفظ چاپ در `src/local-foundation/PurchaseRequestUi.tsx` و `src/local-foundation/TreasuryExecutionUi.tsx`
- [X] T005 [US1] انتقال اموال، خروج و استخدام در `src/local-foundation/AssetCustodyUi.tsx`، `src/local-foundation/LifecycleOperationsUi.tsx` و `src/local-foundation/RecruitmentPage.tsx`
- [X] T006 [US1] تعریف layout centered دسکتاپ و bottom-sheet موبایل و حفظ print در `src/index.css`

## Phase 3: User Story 2 — خطای قابل‌مشاهده

- [X] T007 [US2] افزودن پوشش مرورگر برای خطا و حفظ پنجره در `e2e/record-dialog-assets.spec.ts`
- [X] T008 [US2] نمایش alert سراسری بالاتر از scrim با dismiss قابل‌دسترسی در `src/local-foundation/FoundationApp.tsx` و `src/index.css`

## Phase 4: User Story 3 — دارایی‌های پرونده پرسنلی

- [X] T009 [US3] افزودن سناریوی مرورگر برای حضور تب و نبود actionهای self-service در `e2e/record-dialog-assets.spec.ts`
- [X] T010 [US3] افزودن حالت فقط‌خواندنی پرونده و فیلتر Scope/Resource به `src/local-foundation/MyAssetsSection.tsx` و `src/local-foundation/personnelAssetVisibility.ts`
- [X] T011 [US3] افزودن تب «دارایی‌ها و اموال» و اتصال state/service در `src/local-foundation/PersonnelPages.tsx`

## Phase 5: Documentation and Verification

- [X] T012 [P] ثبت قرارداد پنجره و نمای دارایی در `docs/ui/design-system.md` و `docs/21-USER-FLOWS.md`
- [X] T013 اجرای targeted Vitest/Playwright، `npm run lint`، `npm run typecheck`، `npm test` و `npm run build`
- [X] T014 بررسی مستقل findings و رفع موارد VALID با ریسک بالا
- [X] T015 اجرای converge و کنترل نهایی `git diff --check`
- [X] T016 ایجاد commitهای تک‌منظوره و گزارش rollback؛ بدون merge به main

## Dependencies

- T002 پیش‌نیاز T003 تا T005 است.
- T003 تا T006 برای تکمیل US1 لازم‌اند.
- T008 مستقل از داده دامنه است و پس از T007 اجرا می‌شود.
- T010 پیش‌نیاز T011 است.
- T013 تا T016 پس از همه storyها اجرا می‌شوند.

## Independent Acceptance

- **US1**: نمونه عمومی مرخصی و یک نمونه عریض در دسکتاپ centered، در موبایل بدون overflow و با focus trap باشند.
- **US2**: validation داخل فرم و service error بالاتر از scrim دیده شوند؛ پنجره و ورودی حفظ شوند.
- **US3**: پرونده موجود تب دارایی را با چهار گروه اطلاعات نشان دهد و هیچ action خودخدمتی برای شخص دیگر نداشته باشد.
