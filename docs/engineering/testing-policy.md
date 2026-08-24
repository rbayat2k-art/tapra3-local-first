# سیاست تست و Quality Gate

> **وضعیت:** `CURRENT`; جدول، Gate لازم را بر اساس ریسک تغییر تعیین می‌کند.

## Gate پایه هر تغییر کد

```text
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

Playwright/axe و visual regression فقط وقتی Gate آن‌ها در CI فعال و baseline توسط مالک محصول تأیید شده باشد `Verified` هستند. Snapshot بصری بدون baseline تأییدشده نباید به‌تنهایی Merge را مسدود کند.

## Coverage

Coverage برای جلوگیری از افت استفاده می‌شود، نه بازی با درصد. ابتدا baseline واقعی ثبت، سپس threshold روی فایل‌های دامنه‌ای جدید/تغییریافته اعمال و به‌تدریج افزایش داده می‌شود. کاهش threshold برای عبور PR ممنوع است مگر با تصمیم ثبت‌شده.

## پذیرش Finding

خروجی AI یا Scanner حکم خودکار نیست. هر Finding یکی از وضعیت‌های زیر را می‌گیرد:

- `VALID`: شاهد و اثر واقعی دارد؛ اصلاح یا risk acceptance لازم است.
- `FALSE POSITIVE`: با شاهد دقیق رد می‌شود.
- `NEEDS PRODUCT DECISION`: رفتار درست بدون تصمیم مالک محصول مشخص نیست.

