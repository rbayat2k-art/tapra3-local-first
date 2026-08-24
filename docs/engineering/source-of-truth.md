# منبع رسمی توسعه TAPRA3

> **Status:** `CURRENT`
> **Last validated:** 2026-08-24

## Repository رسمی

- Remote: `https://github.com/rbayat2k-art/tapra3-local-first.git`
- Default/protected merge target: `main`
- Runtime جاری: React/TypeScript/Vite، `LocalFoundationService`، `StorageAdapter` و IndexedDB مرورگر.
- Branch `feature/workflow-management` شاخه فعال توسعه‌ای است که اصلاحات این مرحله از commit `a0f02dd` آن منشعب شده‌اند.
- Branch `fix/ocr-blockers-20260824` یک شاخه بازبینی/اصلاح مستقل است و تا زمان PR و تأیید کاربر، canonical تولید نیست.

نام‌های تاریخی `Tapra2` در package، نام دیتابیس و بعضی اسناد هنوز وجود دارند. Rename کردن IndexedDB یا شناسه‌های persisted یک تغییر داده‌ای است و بدون تصمیم محصول و migration انجام نمی‌شود.

## ترتیب authority

1. رفتار قابل اجرا و تست‌های موفق فعلی.
2. کد فعال، schema، configuration و CI همین Repository.
3. اسناد شماره‌گذاری‌شده `docs/01...27` با برچسب جاری، مخصوصاً 02، 03، 05، 06، 08، 09، 14، 15، 22، 24، 26 و 27.
4. تصمیم‌های تصویب‌شده و اسناد دامنه‌ای که صریحاً `CURRENT` هستند.
5. اسناد `Planned`, `Deprecated`, `Conflict` و snapshotهای تاریخی فقط برای traceability.

اگر کد و سند تاریخی تعارض دارند، اجرای فعلی مرجع واقعیت فنی است؛ اگر موضوع نیازمند تصمیم کسب‌وکار است، Implementation متوقف و `NEEDS PRODUCT DECISION` ثبت می‌شود.

## قاعده شروع و تحویل کار

1. Remote و base مورد تأیید Task مشخص شود؛ از ZIP، checkout قدیمی یا branch بسته‌شده شروع نشود.
2. تغییر روی branch/worktree غیرمحافظت‌شده انجام و baseline ثبت شود.
3. کامیت‌ها کوچک، هدف‌دار و قابل‌بازگشت باشند.
4. Gateهای `docs/engineering/testing-policy.md` اجرا شوند.
5. ورود به `main` فقط با PR، بررسی مستقل، تست کاربر و اجازه Merge انجام شود.
6. Force push، حذف branch محافظت‌شده، secret commit و Merge خودکار ممنوع است مگر بازیابی اضطراری با مجوز صریح.

## اسناد تاریخی

هر سندی که `tapra2.git/stable`، Backend/PostgreSQL فعال یا schema قدیمی را وضعیت جاری معرفی کند، canonical این Repository نیست؛ تا زمان پاک‌سازی کامل باید برچسب `Deprecated/Conflict` و لینک به این سند داشته باشد.
