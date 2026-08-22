# نمای کلی پروژه

> **وضعیت سند:** `Verified` | **دامنه:** اجرای فعلی Browser-local

## هدف

Tapra2 یک ERP فارسی RTL و single-company-first است که در مرحله طراحی و پذیرش محصول، تمام گردش‌ها را داخل مرورگر اجرا می‌کند. هدف فعلی، آزمون سریع نقش‌ها، مجوزها، منوها، فرم‌ها، گردش‌کارها، تاریخچه و بازیابی داده بدون نیاز به Backend است.

## اجرای فعلی

`Verified` — ورودی برنامه [`src/main.tsx`](../src/main.tsx) است، [`src/App.tsx`](../src/App.tsx) فقط `LocalFoundationApp` را mount می‌کند و هسته فعال زیر [`src/local-foundation`](../src/local-foundation) قرار دارد.

`Verified` — محصول شامل Foundation محلی، سازمان و پرسنل، کاربران و نقش‌ها، مشتریان، ساختار فروش، درخواست خرید و اجرای خزانه، مساعده پرسنلی، حساب کاربری، ثبت‌نام محلی، Audit، Notification، Snapshot و مدیریت نسخه‌ای گردش‌کار است.

`Verified` — Registry فعلی ۶۷ ماژول ERP را معرفی می‌کند. بسیاری از این ماژول‌ها فعلاً «گردش عمومی قابل نمایش/آزمون» دارند؛ منطق تخصصی عمیق در همه آن‌ها پیاده نشده است.

## مرزهای فعلی

- `Verified` — داده عملیاتی: IndexedDB با نام `tapra2_local` و schema version 9.
- `Verified` — ترجیحات UI: localStorage.
- `Verified` — احراز هویت، Permission، Scope، Policy و Workflow Guard محلی هستند.
- `Verified` — Snapshot ساده و رمزگذاری‌شده قابل Export/Import است.
- `Verified` — هیچ API Server، PostgreSQL، Queue خارجی، Email/SMS واقعی یا Object Storage در مسیر runtime فعال نیست.
- `Inferred` — برای داده حجیم و هم‌زمانی چندکاربر واقعی، معماری فعلی یک نمونه پذیرش محصول است و جایگزین سامانه Server-backed تولیدی نیست.

## بازیگران اصلی

`Verified` — Admin، مدیر گردش‌کار، مدیر/بازبین منابع انسانی، مدیر شعبه مساعده، بازبین حسابداری مساعده، تأییدکننده اصلی مساعده، درخواست‌کننده خرید، تأییدکننده خرید، مجری خزانه، فروشنده و نقش‌های عملیاتی مولدشده از Catalog.

## شاخص‌های قابل بازتولید

| شاخص | مقدار | وضعیت |
|---|---:|---|
| Object storeهای IndexedDB | 95 | `Verified` |
| ماژول‌های Registry | 67 | `Verified` |
| تست‌های Vitest فعال | 75 | `Verified` |
| commit پایه مخزن | `853dac0` | `Verified` |
| شاخه جاری هنگام مستندسازی | `feature/workflow-management` | `Verified` |

## محدودیت صداقت سند

`Conflict` — اسناد قدیمی این مخزن از Backend، PostgreSQL، Docker و صدها تست نسخه سروری صحبت می‌کنند. این موارد دانش تاریخی‌اند و وضعیت برنامه فعال را نشان نمی‌دهند. برای وضعیت فعلی از [معماری](03-ARCHITECTURE.md)، [مدل داده](06-DATABASE.md) و [وضعیت پروژه](18-CHANGELOG-AND-PROJECT-STATUS.md) استفاده شود.
