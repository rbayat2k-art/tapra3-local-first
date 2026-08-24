# Security Baseline

> **وضعیت:** `CURRENT` — baseline ثبت‌شده در 2026-08-24؛ Findingها باید با تغییر lockfile یا رفتار محصول دوباره بررسی شوند.

## ابزارهای خودکار

- `npm audit`: dependency advisoryهای lockfile.
- Semgrep: static analysis مسیر فعال Local Foundation.
- Trivy: dependency، misconfiguration و secret scan.
- Gitleaks: secret scan تاریخچه کامل Git.
- Agent مستقل `security_reviewer`: threat/authorization/data-flow review متناسب با تغییر.

## Baseline وابستگی‌ها

`nanoid <3.3.18` به‌صورت transitive از PostCSS وارد شده بود. Override روی `3.3.18` قفل شده و باید تا زمانی که زنجیره upstream نسخه امن را مستقیم resolve می‌کند حفظ شود.

`xlsx@0.18.5` دو advisory سطح High در npm دارد و نسخه امن در همان registry ارائه نشده است. مسیر فعال فقط برای تولید فایل در `PersonnelExport.ts` و `TreasuryExecutionUi.tsx` از آن استفاده می‌کند و فایل XLSX کاربر را parse نمی‌کند؛ بااین‌حال export داده حساس و formula injection باید در جایگزینی بررسی شود. استفاده جدید از `xlsx` ممنوع است. جایگزینی با library نگهداری‌شده یا خروجی CSV کنترل‌شده یک تغییر مستقل با regression test فایل خروجی است؛ upgrade خارج از npm یا `npm audit fix --force` نباید خودکار انجام شود.

## معیار تبدیل Scanner به Gate مسدودکننده

1. اولین اجرای CI ذخیره و همه Findingها `VALID`، `FALSE POSITIVE` یا `NEEDS PRODUCT DECISION` شوند.
2. allowlist فقط مورد دقیق و دارای دلیل/تاریخ بازبینی را شامل شود.
3. نسخه ابزار و rule/config مشخص باشد.
4. سپس `continue-on-error` فقط برای Scanner baseline‌شده حذف شود.
