# پیش‌نویس قرارداد API آینده

> Status: DRAFT
> Source of truth: این سند برای قرارداد مفهومی و غیرپیاده‌سازی‌شده API آینده است.
> Owner: Architecture Owner
> Last validated: 2026-08-11 against accepted SaaS foundation ADRs and `agent/docs-migration@120e813`
> Supersedes: none
> Superseded by: none

> هشدار: endpointهای کاندیدای این سند CURRENT نیستند. Foundation API محدودی اکنون اجرا شده و فهرست دقیق آن فقط در [API status](../architecture/api-status.md) authoritative است.

## قواعد قرارداد پیش از تصویب

- prefix، versioning، error envelope و pagination هنوز تصمیم نهایی ندارند.
- مدل مفهومی Identity/session/authorization در [ADR-004](../decisions/adr/ADR-004-identity-session-authorization.md) و الزام idempotency برای commandهای حساس در [ADR-005](../decisions/adr/ADR-005-audit-outbox-reliability.md) پذیرفته شده‌اند؛ شکل دقیق contract و فناوری implementation هنوز DRAFT است.
- typeهای client فعلی ورودی/خروجی دائمی backend نیستند؛ DTOها باید پس از تحلیل امنیت و validation تعریف شوند.
- authorization باید server-side و علاوه بر permission، شامل company/branch/team scope باشد.
- عملیات تغییر وضعیت باید audit، actor، timestamp و جلوگیری از transition نامعتبر داشته باشند.
- secret، password خام، Data URL بزرگ و object کامل `User` نباید بدون پالایش وارد response شوند.

## endpointهای کاندیدای legacy

این فهرست دانش نسخه pre-migration از `API_DOCUMENTATION.md` را حفظ می‌کند، اما approval یا implementation را ادعا نمی‌کند.

| Method و path پیشنهادی | Use case | وضعیت طراحی |
|---|---|---|
| `POST /api/auth/login` | شکل legacy ورود | Foundation مسیر نسخه‌دار متفاوتی دارد؛ این candidate پیاده‌سازی‌شده محسوب نمی‌شود. |
| `GET /api/users` | فهرست کاربران برای مدیر مجاز | نیازمند filtering و حذف فیلدهای حساس. |
| `PUT /api/users/:id` | تغییر کاربر و دسترسی | نیازمند DTO محدود، authorization و audit. |
| `GET /api/requests` | فهرست درخواست‌های قابل‌مشاهده | نیازمند scope و pagination. |
| `POST /api/requests` | ایجاد درخواست مالی | نیازمند validation و idempotency. |
| `PUT /api/requests/:id/approve` | تأیید/ارجاع | بهتر است command صریح و version-checked باشد. |
| `PUT /api/requests/:id/reject` | رد/عودت | reason، actor و transition باید اجباری/معتبر باشند. |
| `POST /api/treasury/export-batch` | ساخت خروجی پرداخت گروهی | نیازمند مجوز، audit و حفاظت داده بانکی. |
| `GET /api/letters` | فهرست نامه‌های مجاز | نیازمند scope و سیاست attachment. |
| `POST /api/letters` | ایجاد/ارسال نامه | نیازمند upload امن، malware controls و audit. |

## حوزه‌های contract که هنوز تعریف نشده‌اند

Support Case، Customer فراتر از endpointهای CURRENT، Sales فراتر از Lead و Sale/Invoice/Payment فعلی، catalog، logistics، inventory، inter-company settlement، notification، audit query و integrationهای بانکی/Issabel قرارداد مصوب ندارند. endpointهای اجراشده فقط در [API status](../architecture/api-status.md) مرجع هستند و نباید در این DRAFT تکرار شوند.

## معیار ارتقا از DRAFT

پیش از `APPROVED-FUTURE` شدن باید owner محصول و معماری، state transitionها، threat model، DTOها، errorها، idempotency، versioning و traceability به تصمیم ثبت‌شده را تأیید کنند. پیاده‌سازی نیز نیازمند تغییر جداگانه وضعیت [API status](../architecture/api-status.md) پس از اثبات با code است.
