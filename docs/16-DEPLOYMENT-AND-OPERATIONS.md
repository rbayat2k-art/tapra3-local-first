# استقرار و عملیات

> **وضعیت سند:** `Verified` برای build استاتیک؛ Production deployment `Planned`

## Build

```bash
npm ci
npm run typecheck
npm test
npm run build
```

خروجی در `dist/` یک SPA استاتیک است. `npm run preview` فقط برای بررسی محلی build است و سرویس Production محسوب نمی‌شود.

## CI

`.github/workflows/ci.yml` روی push به `main` و pull request اجرا می‌شود: Node 22، `npm ci`، typecheck، test و build. Permission workflow فقط `contents: read` است.

## اجرای محلی

- داده هر browser profile مستقل است.
- پاک‌کردن site data یا profile می‌تواند داده عملیاتی را حذف کند.
- قبل از تغییر دستگاه/مرورگر باید Snapshot رمزگذاری‌شده گرفته شود.
- URL query صفحه و کارتابل را نگه می‌دارد؛ refresh باید همان context را بازسازی کند.

## استقرار عمومی

`Planned` — برای انتشار استاتیک باید fallback همه routeها به `index.html`، HTTPS، CSP، cache policy، immutable assets و backup guidance تنظیم شود. با وجود استقرار روی وب، داده همچنان محلی هر مرورگر باقی می‌ماند.

`Unknown` — hosting provider، domain، release cadence، rollback owner و محیط‌های dev/stage/prod تعریف نشده‌اند.

## هشدار ظرفیت

`Verified` — build فعلی هشدار chunk بزرگ می‌دهد. پیش از انتشار گسترده، code splitting و lazy loading برای صفحه‌های سنگین پیشنهاد می‌شود.
