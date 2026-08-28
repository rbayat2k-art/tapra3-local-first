# آزمون

> **وضعیت سند:** `Verified` در تاریخ 2026-08-24 روی شاخه `fix/ocr-blockers-20260824`

## مجموعه فعال

Vitest فقط `src/local-foundation/**/*.test.ts` را در محیط Node اجرا می‌کند. هنگام این بررسی ۱۳۸ تست فعال در ۲۴ فایل وجود داشت.

`Verified` — اجرای نهایی در 2026-08-25: ۲۴ فایل تست موفق، ۱۳۸ تست موفق، بدون failure. این اجرا علاوه بر مسیرهای قبلی، validation فایل مدارک پرسنلی، جداسازی محتوای حساس، scope/ownership، rollback اتمیک، تعویق تکمیل و مهاجرت idempotent schema 10 به 11 را پوشش می‌دهد.

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

- `Verified` — ۸ سناریوی Playwright برای ورود، accessibility، گردش‌کار، هفت خانواده پنجره عملیاتی، دارایی پرسنل و صف/مدارک پرسنلی وجود دارد؛ visual regression، performance/load، coverage threshold و mutation testing هنوز وجود ندارد.
- `Unknown` — ماتریس رسمی مرورگر/موبایل و سقف ۵۰۰ کاربر به benchmark خودکار تبدیل نشده است.
- `Planned` — Playwright برای flowهای Admin/Requester/Approver/Treasury، تست multi-tab واقعی، quota/restore، print snapshot و dataset بزرگ.

## داده آزمون

`Verified` — seed deterministic برای پذیرش محلی است. داده واقعی مشتری/پرسنل نباید در fixture، screenshot یا Issue عمومی استفاده شود.
