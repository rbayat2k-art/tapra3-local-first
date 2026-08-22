# آزمون

> **وضعیت سند:** `Verified` در تاریخ 2026-08-22

## مجموعه فعال

Vitest فقط `src/local-foundation/**/*.test.ts` را در محیط Node اجرا می‌کند. هنگام این بررسی ۷۵ تست فعال در ۱۷ فایل وجود داشت.

`Verified` — اجرای نهایی در 2026-08-22: ۱۷ فایل تست موفق، ۷۵ تست موفق، بدون failure.

## پوشش رفتاری موجود

- Permission، Scope، maker/checker و user override
- navigation URL و حفظ مسیر
- Sorting عدد/تاریخ/حروف
- Persian date و form validation
- seed deterministic و تکمیل داده پرسنل
- سازمان، customer/personnel و دسترسی سازمانی
- درخواست خرید، تقسیم مبلغ، approval، treasury و follow-up
- مساعده، مسیر عادی/نیابتی، correction و visibility
- کارتابل‌های نقش‌محور
- workflow policy versioning و branch route
- export پرسنل و profile completion/change

## فرمان پذیرش

```bash
npm run typecheck
npm test
npm run build
```

## شکاف‌ها

- `Verified` — تست E2E مرورگر، visual regression، accessibility automation، performance/load، coverage threshold و mutation testing وجود ندارد.
- `Unknown` — ماتریس رسمی مرورگر/موبایل و سقف ۵۰۰ کاربر به benchmark خودکار تبدیل نشده است.
- `Planned` — Playwright برای flowهای Admin/Requester/Approver/Treasury، تست multi-tab واقعی، quota/restore، print snapshot و dataset بزرگ.

## داده آزمون

`Verified` — seed deterministic برای پذیرش محلی است. داده واقعی مشتری/پرسنل نباید در fixture، screenshot یا Issue عمومی استفاده شود.
