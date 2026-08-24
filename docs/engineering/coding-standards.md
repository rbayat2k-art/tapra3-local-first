# استاندارد کدنویسی

> **وضعیت:** `CURRENT`; کنترل‌های مکانیکی باید در CI پیاده شوند و متن جای آن‌ها را نمی‌گیرد.

## سادگی و مسئولیت

- هر Function/Component یک هدف روشن داشته باشد؛ نام باید رفتار یا مفهوم دامنه را بیان کند.
- Guard clause بر nesting عمیق ترجیح دارد. کد clever، hidden side effect و mutation غیرشفاف پذیرفته نیست.
- Logic تکراری پس از دومین use case واقعی استخراج شود؛ wrapper یا framework داخلی برای نیاز فرضی ساخته نشود.
- فایل جدید ترجیحاً کمتر از 400 خط و Function جدید ترجیحاً کمتر از 80 خط باشد. عبور از این مرز نیازمند توضیح در PR است، نه شکستن مصنوعی کد.
- به فایل‌های غول‌آسای شناخته‌شده مسئولیت جدید اضافه نشود؛ helper/domain module focused ایجاد شود.

## TypeScript و React

- Type دقیق بر `any` ترجیح دارد؛ cast فقط در boundary معتبر و با validation.
- Derived state دوباره ذخیره نشود مگر persistence آن یک requirement باشد.
- Effect برای همگام‌سازی خارجی است، نه جایگزین محاسبه مستقیم یا event handler.
- UI handler فرمان Service را فراخوانی می‌کند؛ Rule حساس فقط در Component باقی نمی‌ماند.
- متن کاربر فارسی؛ tracking code، event type، permission id و identifier پایدار انگلیسی.

## Persistence و امنیت

- همه دسترسی‌ها از `StorageAdapter` عبور کنند.
- Write چند Store یک transaction یا Saga صریح است.
- expected version و stale-write guard برای رکوردهای قابل ویرایش/تأیید لازم است.
- مقدار حساس در خطا، Audit، event payload، test fixture عمومی یا screenshot قرار نگیرد.
- Dependency production جدید نیازمند دلیل، بررسی maintenance/license/security و تأیید scope است.

## نگه‌داری

- Comment چرایی و invariant را توضیح می‌دهد، نه تکرار syntax.
- Dead code و TODO بدون owner/decision حذف یا به roadmap معتبر وصل شود.
- تغییر behavior هم‌زمان tests و سند authoritative مرتبط را به‌روز می‌کند.

