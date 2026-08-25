# Data Model: نمای دارایی‌های پرونده پرسنلی

این قابلیت مدل ذخیره‌سازی جدیدی ایجاد نمی‌کند و فقط داده‌های موجود را compose می‌کند.

## موجودیت‌های خوانده‌شده

### PersonnelRecord

- شناسه پرسنل، نام و اطلاعات سازمانی.
- کلید اتصال نمای پرونده به انتقال‌ها و گزارش‌های دارایی.

### Fixed Asset (OperationalRecord)

- منبع: `fixed_assets`.
- فیلدهای نمایشی: عنوان/نام، کد دارایی، سریال، متولی فعلی و وضعیت.
- دارایی جاری فقط پس از قطعی‌شدن انتقال نمایش داده می‌شود.

### Asset Transfer (OperationalRecord)

- منبع: `asset_transfers`.
- تحویل یا عودت، وضعیت تأیید دوطرفه، تاریخ‌ها و رسیدها.
- انتقال باز جدا از دارایی قطعی نمایش داده می‌شود؛ انتقال قطعی و عودت‌شده در تاریخچه باقی می‌ماند.

### Asset Maintenance (OperationalRecord)

- منبع: `asset_maintenance`.
- نوع مشکل (خرابی، مفقودی یا سایر)، شرح و وضعیت رسیدگی.
- با همان personnel/asset reference موجود فیلتر می‌شود.

## روابط نمایشی

```text
PersonnelRecord 1 ── * AssetTransfer * ── 1 FixedAsset
PersonnelRecord 1 ── * AssetMaintenance * ── 1 FixedAsset
```

## قواعد

- هیچ داده‌ای از این تب نوشته نمی‌شود.
- self-service confirmation/report/return در نمای شخص دیگر ارائه نمی‌شود.
- داده قدیمی ناقص با «ثبت نشده» نمایش داده می‌شود.
- تاریخچه عودت با تغییر متولی حذف نمی‌شود.
- schema version، store list و migration بدون تغییر می‌مانند.
