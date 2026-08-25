# سیاست تست و Quality Gate

> **وضعیت:** `CURRENT`; جدول، Gate لازم را بر اساس ریسک تغییر تعیین می‌کند.

## Gate پایه هر تغییر کد

```text
npm run lint
npm run typecheck
npm test
npm run build
```

## ماتریس ریسک

| نوع تغییر | تست/کنترل لازم |
|---|---|
| Business rule | unit/integration مثبت و edge case |
| Permission/Scope/Workflow | actor مجاز + actor/Scope/Stage/assignee غیرمجاز + impersonation در صورت ارتباط |
| IndexedDB write | reload/persistence و rollback یا failure injection |
| Schema/Seed | fixture نسخه قدیمی، حفظ داده/relationship، idempotency اجرای دوباره |
| Approval/Payment/Lifecycle/Custody | stale version، maker/checker، double-submit و atomicity |
| UI/Form | validation، loading/error/empty/disabled، RTL/mobile و accessibility |
| Navigation/session | refresh، login/logout/identity switch و دسترسی تب باقی‌مانده |
| Dependency/config/CI | lockfile، build، scanner مربوط و حداقل permission workflow |

## ترتیب نوشتن تست

برای Bug ابتدا regression test شکست‌خورنده یا failure reproduction قابل تکرار ساخته شود. برای Feature، Acceptance Criteria به test matrix تبدیل و منفی‌های امنیتی قبل از اعلام تکمیل افزوده شوند.

## Browser و Visual

Playwright/axe برای Chrome فعال است و دو smoke scenario قطعی دارد: خروج/ورود محلی همراه reload و حفظ session، و نبود تخلف `serious`/`critical` در صفحه ورود و داشبورد. CI trace، screenshot خطا و HTML report را نگه می‌دارد. Visual regression هنوز `Unverified` است؛ Snapshot بصری بدون baseline تأییدشده مالک محصول نباید Merge را مسدود کند.

## Coverage

Coverage برای جلوگیری از افت استفاده می‌شود، نه بازی با درصد. ابتدا baseline واقعی ثبت، سپس threshold روی فایل‌های دامنه‌ای جدید/تغییریافته اعمال و به‌تدریج افزایش داده می‌شود. کاهش threshold برای عبور PR ممنوع است مگر با تصمیم ثبت‌شده.

Baseline ثبت‌شده در 2026-08-24 روی 22 فایل و 124 تست: Statement برابر 27.21%، Branch برابر 23.79%، Function برابر 19.41% و Line برابر 37.52%. در این مرحله `npm run test:coverage` گزارش تولید می‌کند اما threshold سراسری عمداً Merge را مسدود نمی‌کند؛ ابتدا UIهای بدون تست و فایل‌های بزرگ باید به‌صورت هدفمند پوشش داده شوند.

ESLint فقط مسیر فعال Local Foundation و entry/configهای مرتبط را پوشش می‌دهد؛ prototypeها و پوشه‌های legacy فعلاً وارد Gate نشده‌اند. Baseline نخست 45 warning و صفر error است. `npm run lint` خطاها را متوقف می‌کند؛ `npm run lint:strict` بدهی هشدارها را نیز نشان می‌دهد و پس از پاک‌سازی baseline باید Gate اصلی شود.

## اسکن امنیتی

Workflow با نام `security-advisory`، Semgrep، Trivy و Gitleaks را با حداقل permission اجرا می‌کند. تا زمان triage اولین baseline، نتیجه Scannerها advisory است. حذف `continue-on-error` فقط پس از ثبت `VALID`/`FALSE POSITIVE`ها و تعیین allowlist مجاز است.

## پذیرش Finding

خروجی AI یا Scanner حکم خودکار نیست. هر Finding یکی از وضعیت‌های زیر را می‌گیرد:

- `VALID`: شاهد و اثر واقعی دارد؛ اصلاح یا risk acceptance لازم است.
- `FALSE POSITIVE`: با شاهد دقیق رد می‌شود.
- `NEEDS PRODUCT DECISION`: رفتار درست بدون تصمیم مالک محصول مشخص نیست.
