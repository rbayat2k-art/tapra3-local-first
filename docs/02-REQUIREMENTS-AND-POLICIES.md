# نیازمندی‌ها و سیاست‌های محصول

> **وضعیت سند:** ترکیبی از `Verified`، `Documented` و `Planned`

## اصول تصویب‌شده

- `Verified` — UI فارسی، RTL، single-company-first و قابل استفاده بدون Backend.
- `Verified` — operational data فقط در IndexedDB؛ localStorage فقط برای theme، font size، density، فاصله/چیدمان ستون‌ها و وضعیت منو.
- `Verified` — QA Persona به شکل «ورود آزمایشی به‌عنوان کاربر» و فقط برای Admin ارائه می‌شود؛ کاربران عادی کنترل Persona نمی‌بینند.
- `Verified` — مجوز + Scope + Resource Policy + Workflow Guard مدل دسترسی است.
- `Verified` — هر تغییر مهم باید actor، timestamp، history، reason، handoff و audit داشته باشد.
- `Verified` — حذف فیزیکی برای رکوردهای تاریخی الگوی اصلی نیست؛ وضعیت/نسخه و Audit حفظ می‌شود.
- `Documented` — State machine آزاد برای V1 مجاز نیست؛ فقط Queue، Sequence، Assignment و Approval policy قابل تنظیم‌اند.
- `Documented` — multi-company UX فعلاً خارج از دامنه است.

## تصمیم‌های دامنه‌ای کلیدی

| موضوع | سیاست | وضعیت |
|---|---|---|
| Opportunity | برای فروش ساده اختیاری | `Documented` |
| Quote | مستقل از Invoice Draft | `Documented` |
| زنجیره تأیید مالی | قابل تنظیم با مبلغ، نوع درخواست و Cost Center | `Documented` / `Planned` |
| Refund limit | Policyمحور و بدون عدد ثابت | `Documented` / `Planned` |
| Split shipment | مجاز، غیراصلی، نیازمند Permission و Reason | `Documented` / `Planned` |
| Chat edit/delete | ویرایش با History؛ حذف فیزیکی ممنوع | `Documented` / `Planned` |
| Snapshot encryption | اختیاری کنار Export ساده | `Verified` |
| Conflict چندتب | Optimistic concurrency و Refresh/Retry | `Verified` |

## قواعد عمومی UI و داده

- `Verified` — فیلد اجباری با ستاره قرمز، برچسب «الزامی» و خلاصه خطا قبل از ذخیره نمایش داده می‌شود.
- `Verified` — کد پرسنلی در سرویس تولید می‌شود.
- `Verified` — تاریخ نمایشی و انتخاب تاریخ شمسی است؛ تاریخ عملیاتی داخلی ISO/Gregorian نگهداری می‌شود.
- `Verified` — موبایل ۱۱ رقم با `09`، کد ملی ۱۰ رقم، کارت ۱۶ رقم، کدپستی اختیاری ۱۰ رقم و شبا ۲۴ رقم پس از `IR` اعتبارسنجی/نرمال می‌شوند.
- `Verified` — مبلغ با جداکننده سه‌رقمی نمایش داده می‌شود و محاسبات درخواست خرید از `bigint` استفاده می‌کند.
- `Verified` — جدول‌های اصلی Sorting و Search دارند؛ الزام «همه جدول‌های آینده» یک سیاست طراحی است، نه تضمین خودکار.

## سیاست ویرایش گردش‌کار

`Verified` — نسخه منتشرشده درجا ویرایش نمی‌شود. مدیر گردش‌کار «نسخه جدید» می‌سازد؛ رکوردهای موجود نسخه و مسیر اولیه خود را نگه می‌دارند و رکوردهای جدید از نسخه فعال استفاده می‌کنند. مسیرهای فعال یک شعبه نباید هم‌پوشانی مبهم داشته باشند.

## موارد خارج از تعهد فعلی

- `Planned` — ServerApiAdapter، Backend production، احراز هویت مرکزی، SMS واقعی، فایل‌استوریج خارجی، Field merge و deployment production.
- `Unknown` — SLA، RPO/RTO رسمی، retention قانونی، سقف فایل‌ها، سیاست حریم خصوصی و ماتریس نهایی جداسازی وظایف سازمان.
