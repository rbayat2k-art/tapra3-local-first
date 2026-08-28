# امنیت

> **وضعیت سند:** ارزیابی اجرای محلی، نه گواهی امنیت Production

## کنترل‌های موجود

- `Verified` — رمز کاربر با PBKDF2/SHA-256 و salt تصادفی Hash می‌شود.
- `Verified` — Snapshot رمزگذاری‌شده از PBKDF2 با 210,000 iteration و AES-GCM-256، salt 16-byte و IV 12-byte تصادفی استفاده می‌کند.
- `Verified` — Snapshot ساده checksum SHA-256 دارد؛ checksum امضای دیجیتال و اثبات مبدأ نیست.
- `Verified` — Permission/Scope/Policy/Maker-checker قبل از فرمان‌های حساس بررسی می‌شوند.
- `Verified` — Audit شامل actor، effective user، زمان، outcome، reason و correlation ID است.
- `Verified` — فایل‌های درخواست خرید به data URL در IndexedDB ذخیره می‌شوند و محدودیت نوع/اندازه در UI اعمال می‌شود.

## Threat model فعلی

| تهدید | وضعیت |
|---|---|
| دست‌کاری داده توسط مالک دستگاه/DevTools | `Known risk`؛ Browser-local مرز اعتماد ندارد |
| سرقت Snapshot ساده | `Known risk`؛ Export رمزگذاری‌شده توصیه می‌شود |
| XSS و فایل مخرب | `Partial`؛ React escaping کمک می‌کند، ولی CSP/اسکن فایل رسمی تأیید نشد |
| Brute-force ورود | `Unknown`؛ rate limit/lockout دیده نشد |
| Supply-chain | `Partial`؛ lockfile و CI وجود دارد، اسکن dependency خودکار تأیید نشد |
| از دست رفتن دستگاه | `Known risk`؛ Backup دستی و رمزگذاری‌شده لازم است |

## داده حساس

`Verified` — مدل داده شامل کد ملی، موبایل، نشانی، حساب/کارت/شبا و فایل‌های مالی است. این داده‌ها در IndexedDB دستگاه نگهداری می‌شوند و encryption-at-rest مرورگر توسط برنامه تضمین نشده است.

`Verified` — یک credential پذیرش deterministic در seed/README قدیمی پروژه وجود دارد. مقدار آن در این اسناد تکرار نشده و نباید برای محیط واقعی استفاده شود.

## الزامات قبل از Production

- `Planned` — Backend trusted، TLS، encryption at rest، key management، CSP، file malware scanning، audit export tamper-evident، rate limiting، MFA، retention/erasure policy و security review.
- `Planned` — حذف credentialهای demo از distribution واقعی یا محدودسازی صریح build mode.
- `Unknown` — طبقه‌بندی داده، مبنای حقوقی نگه‌داری، مدت retention و مسئول امنیت سازمان.
