# منبع Canonical توسعه Tapra2

> **Deprecated / Conflict:** این سند snapshot تاریخی شاخه دیگری است و canonical وضعیت جاری نیست. ورودی معتبر فعلی: [`../README.md`](../README.md).

> Status: CURRENT
> Source of truth: این سند برای Git lineage، محل شروع توسعه و سیاست بازسازی Tapra2 است.
> Owner: Engineering Owner
> Last validated: 2026-08-11 by fresh clone of GitHub `stable@fcc3523c`
> Supersedes: استفاده از checkoutهای قدیمی یا ZIP به‌عنوان منبع فعال توسعه
> Superseded by: none

## منبع رسمی

تنها منبع رسمی کد و مستندات فعال Tapra2 این repository است:

- Remote: `https://github.com/rbayat2k-art/tapra2.git`
- Canonical branch: `stable`
- مسیر محلی پیشنهادی: `C:\Users\iLia\Documents\Tapra2\canonical`

در 2026-08-11 یک clone تازه فقط از GitHub `stable` ساخته شد. نصب dependencyها از lockfile، migration تکرارشونده، typecheck Web/Backend، build، `416/416` test و بررسی بصری Login، context، Dashboard، Customer 360، Import، Sales، Finance، Support و RBAC موفق بودند. بنابراین GitHub `stable` به‌تنهایی برای بازسازی محصول کافی است؛ secretهای محلی و داده PostgreSQL عمداً بخشی از Git نیستند.

## قاعده شروع کار آینده

1. ابتدا آخرین `origin/stable` fetch یا clone شود.
2. branch کاری جدید مستقیماً از همان commit ساخته شود، مگر stack صریح و تأییدشده‌ای وجود داشته باشد.
3. تغییر فقط از Pull Request با check اجباری `quality` وارد `stable` شود.
4. checkout قدیمی، Codex workspace قبلی یا branch بسته‌شده نباید به‌عنوان base کار جدید استفاده شود.
5. `.env.local` فقط محلی و ignored است؛ مقدارهای secret هرگز commit یا در گزارش چاپ نمی‌شوند.

## جایگاه Legacy

- `C:\Users\iLia\tapra2.zip` و forensic extraction فقط archive/recovery evidence هستند.
- هیچ فایل legacy مستقیماً روی canonical overwrite نمی‌شود.
- Preservation Matrix اشاره‌شده در نسخه قدیمی در snapshot فعلی وجود ندارد؛ بازیابی آینده باید منبع تازه و قابل دسترس تعریف کند.

## Branch protection

`stable` به Pull Request و check به‌روز `quality` نیاز دارد. force push و branch deletion ممنوع‌اند. admin bypass فقط برای بازیابی اضطراری حفظ شده و مسیر عادی توسعه محسوب نمی‌شود.
