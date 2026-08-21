# وضعیت ادغام محصول Canonical Tapra2

> Status: HISTORICAL — وضعیت Shell سرورمحور پیش از Local-first Phase A
> Source of truth: این سند برای وضعیت اجرایی ادغام محصول legacy با Foundation SaaS است.
> Owner: Product Integration
> Last validated: 2026-08-17 against `agent/role-permission-foundation`
> Supersedes: none
> Superseded by: [Local Foundation](../architecture/local-foundation.md)

> **توجه:** از 2026-08-17 مسیر اجرایی جدید Tapra2 در Phase A مرورگرمحور و بدون Server است. متن زیر برای بازیابی دانش Shell قبلی حفظ شده و رفتار جاری محسوب نمی‌شود.

## محصول visible فعلی

Tapra2 یک shell عملیاتی واحد دارد. ورود، context فعال، منوها، tabها، میان‌برها و عملیات قابل‌مشاهده با session و Permissionهای server تعیین می‌شوند؛ role یا permission قدیمی نمی‌تواند قابلیت عملیاتی جدیدی باز کند.

- مسیر عادی login محلی prototype ندارد.
- ناوبری عادی فقط `CURRENT` و بخش معتبر `HYBRID` را نشان می‌دهد؛ Viewهای `PROTOTYPE` و `LEGACY` برای حفظ دانش در source باقی مانده‌اند اما entry point عملیاتی ندارند.
- مسیرهای Company-scoped پیش از mount شدن View و ارسال API، به context شرکت معتبر نیاز دارند.
- صفحه مشتری همیشه `SaasCustomerWorkspace` و صفحه سازمان همیشه `OrganizationAdminView` را باز می‌کند؛ بخش حساب‌های بانکی legacy در صفحه سازمان mount نمی‌شود.
- Dashboard از session و capabilityهای مجاز استفاده می‌کند و تا وجود API معتبر، آمار ساختگی یا `localStorage` را به‌عنوان شاخص عملیاتی نشان نمی‌دهد.
- تعویض context، tabهای نامعتبر را می‌بندد و دسترسی هر tab دوباره با Permission و context جدید محاسبه می‌شود.
- داده legacy `localStorage` حذف یا خودکار ingest نشده است.

## قرارداد زبان و نمایش UI

- تمام UI کاربر نهایی Tapra2 باید فارسی و RTL باشد.
- هر عنوان، منو، دکمه، فرم، label، tooltip، status، warning، error، success message و confirmation جدید باید فارسی باشد.
- اصطلاحات فنی English فقط در code، API، database و اسناد فنی باقی می‌مانند.
- UI عادی نباید نام‌هایی مانند `PostgreSQL`، `localStorage`، `Workspace` یا `Scope` را بدون نیاز کاری صریح به کاربر نمایش دهد؛ این مفاهیم باید با واژگان قابل‌فهم محصول بیان شوند.
- action فاقد Permission باید مخفی باشد. action دارای Permission که پیش‌شرط کسب‌وکارش برقرار نیست باید غیرفعال بماند و علت روشن فارسی در همان context نمایش داده شود.

این بخش authority قرارداد زبان و نمایش UI است. اسناد و راهنماهای دیگر باید به آن لینک دهند و متن Rule را تکرار نکنند.

## مرز backing

| بخش | backing فعلی |
|---|---|
| Login، session، Workspace، Company، Branch/Department/Team/Shared Service، Membership/Role/Scope/Permission، Organization Admin و Impersonation | `SaaS-backed` |
| Customer 360، identity/relationship، phone/address/source/timeline، merge/unmerge | `SaaS-backed` |
| Customer Import و reconciliation | `SaaS-backed` |
| Sales Lead، Queue، Assignment/Reassignment، Call Log و Campaign/Promotion context | `SaaS-backed` |
| Sale/Invoice/Payment و Financial Review فروش | `SaaS-backed` |
| Warehouse Foundation | `SaaS-backed` |
| Dashboard، navigation، tabs و theme | `Hybrid`؛ authority دسترسی server و state نمایشی محلی، بدون metric ساختگی |
| مدیریت کامل Campaign/Promotion، Commission، Finance عمومی، Support و Communications | `Prototype-backed` و مخفی از ناوبری عملیاتی |
| bank/Issabel/SMS/portal/commission/GL/DR/BPMN و Logistics پیشرفته | `Future` |

جزئیات capability-by-capability، شاهد Git/stash و تصمیم preservation در [Legacy Product Preservation Matrix](../archive/legacy-product-preservation-matrix.md) ثبت شده است. آن ماتریس همچنین Legacy → SaaS migration map و role mapping را نگه می‌دارد و این سند آن محتوا را تکرار نمی‌کند.

## RBAC reconciliation

`resolveLegacyShellUser` فقط identity نمایشی و کم‌اختیار shell را می‌سازد. این adapter نه permission server را به permission قدیمی تبدیل می‌کند و نه هیچ حسابی را به مدیر prototype ارتقا می‌دهد. تمام APIها session، Membership، permission و RLS را مستقل enforce می‌کنند.

login محلی legacy در مسیر عادی قابل‌استفاده نیست. Impersonation فقط از مسیر server-backed، با permission اختصاصی، reason الزامی، انقضای محدود و Audit actor/effective user قابل‌استفاده است و permission مؤثر را بالاتر از Admin آغازکننده نمی‌برد. roleهای legacy برای migration حفظ شده‌اند، اما مرجع authorization SaaS نیستند.

## Validation ثبت‌شده

- `npm run lint`: موفق برای Web و Backend.
- `npm run build`: موفق؛ هشدار bundle بزرگ باقی است.
- `npm test`: `495/495` موفق در `34` فایل، شامل PostgreSQL، migration، Organization/Scope، Customer identity reconciliation، Sales، Invoice/Payment، Warehouse و تست‌های domain legacy.
- `npm run lint` و `npm run build`: موفق؛ هشدار شناخته‌شده اندازه bundle باقی است.
- migration QA جداگانه: زنجیره `0001` تا `0023` روی database تست اعمال و seed کنترل‌شده با موفقیت اجرا شد؛ migration جدیدی در این تغییر وجود ندارد.
- browser: مدیر مجموعه و کاربر محدود impersonated در desktop و viewport عرض `390px` بررسی شدند. ناوبری Permission-aware، guard شرکت، Dashboard بدون metric ساختگی، Organization server-backed، Customer خواندنی، RTL، Drawer موبایل و پیام خطای فارسی تأیید شدند.
- tenant check مرورگر: Company بتا Customer نمونه بتا را دید و Customer نمونه آلفا را ندید.
- browser console: بدون warning/error در سناریوی بررسی‌شده؛ یک `<main>` و بدون overflow افقی در desktop/mobile.

پوسته عملیاتی علاوه بر enforcement مستقل Backend، View و action فاقد Permission را نمایش نمی‌دهد. Warehouse Foundation نیز mutationها را به permission جزئی همان action محدود می‌کند؛ پیش‌شرط ناقص، دکمهٔ مجاز را با علت فارسی غیرفعال می‌کند. خطاهای API در client متمرکز به پیام امن فارسی برگردانده می‌شوند و متن خام یا فنی Backend در UI عادی نمایش داده نمی‌شود. این کنترل‌های نمایشی مرز امنیتی جایگزین server نیستند.

این validation گواه production readiness کامل نیست. ماژول‌های prototype-backed باید به‌ترتیب vertical slice به Backend منتقل شوند.
