# تغییرات و وضعیت پروژه

> **آخرین اعتبارسنجی مستند:** ۱۴۰۵/۰۶/۰۲ (2026-08-24)

## وضعیت Git

- `Verified` — repository عمومی مقصد: `rbayat2k-art/tapra3-local-first` طبق تاریخچه گفتگو و remote پروژه.
- `Verified` — شاخه اصلاحات مستقل: `fix/ocr-blockers-20260824`؛ هنوز با شاخه اصلی ادغام نشده است.
- `Verified` — commit پایه اصلاحات: `a0f02dd` از `feature/workflow-management`.
- `Verified` — tag/release پایه `v1.0.0` به‌عنوان نقطه بازگشت ساخته شده است.
- `Verified` — working tree هنگام مستندسازی تغییرات ثبت‌نشده مرتبط با Workflow management، مساعده، خرید، UI و سرویس دارد؛ این سند وضعیت همان working tree را نیز منعکس می‌کند.

## قابلیت‌های تثبیت‌شده تا این نقطه

- Foundation محلی، IndexedDB، snapshot/reset، Audit/Event، notification و QA login
- Shell فارسی RTL، theme/font/density و navigation permission-aware
- سازمان، شعبه، واحد، سمت، پرسنل، کاربر، نقش و permission override
- ساختار فروش versioned و انتصاب فروشنده
- مشتریان و import/merge پایه
- درخواست خرید چندشعبه‌ای، approval، correction/reject و خزانه
- مساعده پرسنلی با کارتابل‌های نقش‌محور و route نیابتی
- Workflow management با نسخه جدید و route شعبه‌ای
- تاریخ شمسی، format/validation داده و جستجو/sort در فهرست‌های اصلی

## وضعیت کیفیت

`Verified` — در پایان اعتبارسنجی 2026-08-25، `npm run typecheck` و lint بدون error موفق شدند، هر ۲۴ فایل و ۱۳۸ تست Vitest و هر ۸ سناریوی Playwright ترتیبی عبور کردند و production build با ۱٬۷۳۷ ماژول موفق بود. تنها هشدار build، بزرگ‌تر بودن chunk اصلی از 500 kB بود.

## تغییرات مستندسازی این مرحله

`Verified` — مجموعه ۲۱ سند شماره‌گذاری‌شده + Policy به‌عنوان مرجع جاری افزوده/به‌روزرسانی شد؛ اسناد قدیمی حذف نشدند و وضعیت تاریخی/متعارض آن‌ها مشخص شد.

## تعارض تاریخی

`Conflict` — اسناد قبلی درباره Server/PostgreSQL/Docker و branchهای قدیمی وضعیت نسخه‌های پیشین‌اند. اجرای جاری Server-backed نیست.
