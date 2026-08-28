# Tasks: هسته واحد حقوقی و بازرسی

**Input**: Design documents from `specs/005-legal-inspection-v1/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/local-service.md

## Phase 1: Setup

- [x] T001 ثبت specification و checklist در `specs/005-legal-inspection-v1/spec.md` و `specs/005-legal-inspection-v1/checklists/requirements.md`
- [x] T002 [P] ثبت plan/data model/contracts/quickstart در `specs/005-legal-inspection-v1/`
- [x] T003 [P] ثبت مرز prototype و تصمیم‌های امنیتی در `docs/decisions/adr/ADR-012-legal-inspection-local-prototype.md`

## Phase 2: Foundational

- [x] T004 افزودن مدل‌های Legal Phase 1 و Foundation projection در `src/local-foundation/legal-inspection/model.ts` و `src/local-foundation/model.ts`
- [x] T005 افزودن storeهای افزایشی و schema 15 در `src/local-foundation/model.ts` و `src/local-foundation/storage.ts`
- [x] T006 [P] نوشتن migration fixture واقعی schema 14 و idempotency tests در `src/local-foundation/storageMigration.test.ts`
- [x] T007 [P] تعریف permission/resource/field projection در `src/local-foundation/legal-inspection/policy.ts` و `src/local-foundation/legal-inspection/projection.ts`
- [x] T008 اتصال facade و state loading بدون raw PII/bank در `src/local-foundation/service.ts`

**Checkpoint**: schema 15 و projection امن آماده باشد و کل baseline بدون regression پاس شود.

## Phase 3: User Story 1 - ثبت و مشاهده امن پرونده (P1) 🎯 MVP

**Goal**: ایجاد پرونده با اشخاص و شرکت‌های مرتبط، tracking یکتا و write اتمیک.

**Independent Test**: create/reload/denied scope/replay/conflict/rollback همگی روی داده مصنوعی پاس شوند.

- [x] T009 [P] [US1] نوشتن تست‌های create/reload/scope/replay/rollback در `src/local-foundation/legal-inspection/legalInspection.test.ts`
- [x] T010 [US1] پیاده‌سازی aggregate و validation پرونده/party/link در `src/local-foundation/legal-inspection/service.ts`
- [x] T011 [US1] اتصال createLegalCase به session/CAS/idempotency/history/audit/event transaction در `src/local-foundation/service.ts`
- [x] T012 [US1] افزودن projection resource-bound پرونده و اشخاص در `src/local-foundation/legal-inspection/projection.ts`

**Checkpoint**: MVP سرویس پرونده بدون UI مستقل قابل اثبات باشد.

## Phase 4: User Story 2 - داده مرجع شخصیت و حساب (P2)

**Goal**: مدیریت entity/bank/account با مالک واحد و masking پیش‌فرض.

**Independent Test**: کاربر عادی فقط masked، کاربر full-view فقط در scope، و account غیرفعال برای پرونده جدید رد شود.

- [x] T013 [P] [US2] نوشتن تست مالکیت حساب، masking، cross-company deny و audit redaction در `src/local-foundation/legal-inspection/legalInspection.test.ts`
- [x] T014 [US2] پیاده‌سازی commandهای legal entity/bank/account در `src/local-foundation/legal-inspection/service.ts`
- [x] T015 [US2] اتصال commandهای master data به transaction facade در `src/local-foundation/service.ts`
- [x] T016 [US2] ثبت snapshot ماسک‌شده حساب روی پرونده بدون raw duplicate در `src/local-foundation/legal-inspection/service.ts`

## Phase 5: User Story 3 - UI مصنوعی و قابل‌دسترسی (P3)

**Goal**: صفحه فارسی RTL پرونده‌ها با بنر دائمی منع داده واقعی.

**Independent Test**: desktop/mobile/keyboard/denied/empty/create form و reload از UI پاس شود.

- [x] T017 [P] [US3] ساخت صفحه و فرم با patternهای Local Foundation در `src/local-foundation/legal-inspection/LegalInspectionPage.tsx`
- [x] T018 [US3] افزودن tab/navigation و facade callbacks در `src/local-foundation/FoundationApp.tsx`
- [x] T019 [US3] افزودن styling semantic و responsive در `src/index.css`
- [x] T020 [P] [US3] افزودن تست UI/axe و synthetic banner در `e2e/legal-inspection.spec.ts`

## Phase 6: Synthetic QA and Hardening

- [x] T021 ساخت blueprint و command اتمیک/idempotent materialize/reset پنجاه سناریوی مصنوعی در `src/local-foundation/legal-inspection/qaScenarios.ts` و `src/local-foundation/service.ts`
- [x] T022 افزودن negative tests نشست stale، role revoke، QA access-view و direct-open در `src/local-foundation/legal-inspection/legalInspection.test.ts`
- [x] T023 افزودن failure injection و concurrent tracking/idempotency tests در `src/local-foundation/legal-inspection/legalInspection.test.ts`
- [x] T024 به‌روزرسانی feature matrix، data dictionary و flow در `docs/_meta/FEATURE-MATRIX.md`، `docs/23-DATA-DICTIONARY.md` و `docs/21-USER-FLOWS.md`
- [x] T025 اجرای targeted، lint، typecheck، full unit، build، E2E، diff و secret/PII scan طبق `specs/005-legal-inspection-v1/quickstart.md`
- [x] T026 اجرای independent architecture/security/test review و طبقه‌بندی یافته‌ها در handoff فاز اول

## Dependencies & Execution Order

- T004-T008 foundation مشترک و blocker همه storyهاست.
- US1 پس از foundation شروع می‌شود و MVP مستقل است.
- US2 به entity/store foundation نیاز دارد اما مستقل از UI است.
- US3 فقط پس از projection و facade امن متصل می‌شود.
- T021-T026 پس از storyهای انتخاب‌شده برای checkpoint اجرا می‌شوند.

## Parallel Opportunities

- T006 و T007 در فایل‌های مستقل قابل انجام‌اند.
- تست‌های T009/T013 می‌توانند پیش از implementation نوشته شوند.
- T017 و مستندسازی T024 پس از freeze قرارداد می‌توانند موازی باشند؛ مالک write اصلی service واحد می‌ماند.

## Implementation Strategy

1. schema/projection foundation را با migration/denied tests ببند.
2. US1 را به‌عنوان MVP سرویس اتمیک تحویل بده.
3. US2 masking/master data را اضافه کن.
4. UI US3 را فقط روی projection امن وصل کن.
5. داده مصنوعی، race/failure و full gates را قبل از PR اجرا کن.

## Phase 7: Shared Treasury Master and Row-based Cases

- [x] T027 ثبت ADR منبع واحد اطلاعات پایه بانکی و بازنشستگی mutation ماژول عمومی `bank-account`
- [x] T028 ساخت projection و policy مستقل خزانه برای شخصیت حقوقی، بانک و حساب ماسک‌شده
- [x] T029 ساخت صفحه اختصاصی «اطلاعات پایه بانکی» در خزانه و انتقال همه کنترل‌های مدیریت master از حقوقی
- [x] T030 تبدیل فهرست پرونده‌ها به جدول قابل جست‌وجو/فیلتر و Dialog جزئیات و Timeline
- [x] T031 افزودن پیوند چندفاکتوری فقط‌خواندنی با کنترل scope و projection حداقلی
- [x] T032 افزودن تست‌های دسترسی خزانه/حقوقی، بستن generic bypass، جدول/جزئیات/موبایل و regression دیتاست QA
- [x] T033 اجرای targeted/full/typecheck/build/lint/E2E/diff و بازبینی مستقل معماری و امنیت
