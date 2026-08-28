# راهنمای توسعه

> **وضعیت سند:** `Verified`

## پیش‌نیاز

- Node.js 22 مطابق CI توصیه می‌شود.
- npm و مرورگر مدرن با IndexedDB/Web Crypto.

## راه‌اندازی

```bash
npm ci
npm run dev
```

Dev server پیش‌فرض package روی `0.0.0.0:3000` اجرا می‌شود. در اجرای هم‌زمان ممکن است Vite پورت دیگری انتخاب کند؛ URL ترمینال مرجع است.

## فرمان‌های کیفیت

```bash
npm run typecheck
npm test
npm run build
```

`npm run lint` در حال حاضر همان `tsc --noEmit` است و ESLint جداگانه ندارد.

## روش توسعه ایمن

1. قبل از تغییر، `git status` و تغییرات موجود کاربر را بررسی کنید.
2. برای قابلیت جدید ابتدا rule/use-case و تست دامنه، سپس UI را تغییر دهید.
3. IndexedDB را فقط پشت `StorageAdapter` صدا بزنید.
4. Permission را هم در UI و هم Service enforce کنید.
5. mutation باید audit/history/domain event متناسب داشته باشد.
6. تغییر schema نیازمند افزایش version و strategy مهاجرت است.
7. متن UI فارسی باشد؛ identifierهای کد انگلیسی و پایدار بمانند.
8. هیچ credential، Snapshot واقعی یا PII را commit نکنید.

## قواعد Git

`Documented` — تغییرات آزمایشی روی feature branch انجام، پس از پذیرش merge و برای نقاط امن tag/release واضح ساخته شود. کاربر نسخه پایه `v1.0.0` را به‌عنوان نقطه بازگشت منتشر کرده است.

## محدودیت

`Conflict` — راهنمای قدیمی توسعه Server/PostgreSQL برای این branch معتبر نیست. این سند و `package.json` مرجع اجرای فعلی‌اند.
