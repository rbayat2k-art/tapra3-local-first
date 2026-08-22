# ساختار پوشه‌ها

> **وضعیت سند:** `Verified`

```text
.
├─ .github/workflows/ci.yml       کیفیت CI روی main/PR
├─ docs/                          اسناد جاری و اسناد تاریخی
├─ src/
│  ├─ main.tsx                    ورودی Browser
│  ├─ App.tsx                     mount برنامه Local Foundation
│  ├─ index.css                   Design system و RTL
│  ├─ local-foundation/           کد فعال محصول
│  ├─ components/                 اجزای قدیمی/غیرفعال در مسیر اصلی
│  ├─ foundation/                 foundation قدیمی
│  ├─ integration/                قراردادها/دانش انتقالی
│  ├─ prototype/                  prototype قدیمی
│  └─ utils/                      ابزارهای مشترک منتخب
├─ package.json                   فرمان‌ها و dependencyها
├─ tsconfig.json                  محدوده TypeScript فعال
├─ vite.config.ts                 Build/dev
└─ vitest.config.ts               Test scope
```

## راهنمای `src/local-foundation`

| گروه | فایل‌های مهم | مسئولیت |
|---|---|---|
| Shell | `FoundationApp.tsx`, `navigationUrl.ts` | session، menu، route، preference، page dispatch |
| Data | `model.ts`, `storage.ts`, `seed.ts` | schema، adapter، snapshot، seed |
| Access | `authorization.ts`, `organizationAccess.ts` | permission/scope/resource/maker-checker |
| Catalog | `erpCatalog.ts`, `ErpWorkspacePage.tsx` | registry و گردش عمومی ماژول‌ها |
| Organization | `OrganizationPages.tsx`, `PersonnelPages.tsx`, `BranchesPage.tsx` | واحد، سمت، شعبه، پرسنل، کاربران، نقش‌ها |
| Sales structure | `SalesStructuresPage.tsx`, identity helpers | مسیر فروش و انتصاب |
| Purchase/Treasury | `purchaseRequest.ts`, `PurchaseRequestUi.tsx`, `TreasuryExecutionUi.tsx` | درخواست خرید، تأیید، پرداخت، چاپ |
| Advance | `employeeAdvance.ts`, `EmployeeAdvanceUi.tsx` | مساعده و کارتابل‌های نقش‌محور |
| Workflow admin | `workflowPolicy.ts`, `WorkflowAdminPage.tsx` | نسخه و مسیرهای شعبه‌ای |
| QA | `*.test.ts`, `qaPersonnelCompletion.ts` | تست و تکمیل داده seed |

## کد فعال و غیر‌فعال

`Verified` — `tsconfig.json` مسیرهای اصلی و `src/local-foundation/**/*` را پوشش می‌دهد. پوشه‌های prototype/foundation قدیمی بخشی از UI اصلی فعلی نیستند؛ حذف آن‌ها بدون تحلیل import و دانش تاریخی توصیه نمی‌شود.

`Unknown` — مالک رسمی هر پوشه و CODEOWNERS تعریف نشده است.
