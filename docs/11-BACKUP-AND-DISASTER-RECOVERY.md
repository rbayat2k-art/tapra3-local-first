# پشتیبان‌گیری و بازیابی بحران

> **وضعیت سند:** `Verified` برای قابلیت محلی؛ RPO/RTO رسمی `Unknown`

## انواع خروجی

1. `Verified` — **Snapshot ساده:** JSON کامل + checksum. برای داده حساس مناسب انتقال ناامن نیست.
2. `Verified` — **Snapshot رمزگذاری‌شده:** envelope با AES-GCM و کلید مشتق‌شده از رمز کاربر.

## Runbook پشتیبان‌گیری

1. با نقش دارای مجوز Data control وارد شوید.
2. در «پشتیبان‌گیری» Export رمزگذاری‌شده را انتخاب کنید.
3. رمز قوی و خارج از همان دستگاه نگهداری کنید.
4. فایل را در دو محل مستقل و کنترل‌شده ذخیره کنید.
5. به‌صورت دوره‌ای Restore آزمایشی را روی پروفایل مرورگر جدا انجام دهید.

## Runbook بازیابی

1. از داده موجود Snapshot بگیرید، اگر هنوز قابل دسترس است.
2. فایل صحیح و رمز آن را انتخاب کنید.
3. Import اعتبار schema/store/checksum را کنترل می‌کند.
4. تأیید کنید که users، workflows، audit، purchase/advance و notifications قابل مشاهده‌اند.
5. build/version و زمان Restore را در گزارش عملیاتی ثبت کنید.

## Reset محلی

`Verified` — Reset کل داده عملیاتی دستگاه را با seed deterministic جایگزین می‌کند. این عمل destructive است و فقط پس از Backup و تأیید کاربر باید اجرا شود.

## محدودیت‌ها

- `Verified` — Backup زمان‌بندی‌شده، cloud copy، retention rotation و restore point incremental وجود ندارد.
- `Unknown` — RPO، RTO، مالک Backup و دوره نگه‌داری تصویب نشده‌اند.
- `Planned` — در production باید backup خودکار، encryption managed، restore drill، integrity monitoring و cross-region policy تعریف شود.
