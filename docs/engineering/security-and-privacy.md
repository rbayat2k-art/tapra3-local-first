# وضعیت امنیت و حریم خصوصی

> Status: CURRENT
> Source of truth: این سند برای وضعیت مشاهده‌شده امنیت، احراز هویت و ریسک داده در پیاده‌سازی فعلی است.
> Owner: Security Owner
> Last validated: 2026-08-16 against `agent/global-operational-shell-hardening`
> Supersedes: none
> Superseded by: none

این سند تأیید آمادگی production نیست.

## Foundation اجراشده

- passwordهای Foundation با `scrypt` و salt نگهداری می‌شوند؛ password خام در database ذخیره نمی‌شود.
- session opaque و hash token در PostgreSQL است؛ cookie دارای `HttpOnly` و `SameSite=Lax` است و در production باید `Secure` باشد.
- state-changing endpointها CSRF token می‌خواهند.
- membership، context و permission در server دوباره محاسبه می‌شوند.
- shell عملیاتی visibility منو، tab و action را از Permission و context سروری می‌سازد؛ این کنترل UX است و enforcement مستقل API/RLS را جایگزین نمی‌کند.
- `resolveLegacyShellUser` فقط identity نمایشی کم‌اختیار می‌سازد و هیچ server Permission را به permission قدیمی تبدیل یا کاربر را به مدیر prototype ارتقا نمی‌دهد.
- صفحه‌های Company-scoped پیش از mount شدن View و ارسال درخواست، context شرکت معتبر می‌خواهند. context مجموعه برای این صفحه‌ها fail-closed است.
- client متمرکز API متن خام Backend را در UI نمایش نمی‌دهد و خطاها را بر اساس status/code به پیام امن فارسی تبدیل می‌کند؛ جزئیات فنی با correlation ID در مسیر تشخیصی باقی می‌مانند.
- Customer context از session استخراج می‌شود و client نمی‌تواند tenant را در payload تعیین کند.
- PostgreSQL RLS و `FORCE ROW LEVEL SECURITY` لایه دفاعی دوم برای تمام relationهای Customer 360، عملیات Sales فعلی و Audit است.
- نقش runtime superuser، database creator یا role creator نیست.
- Customer create، phone/address، merge/unmerge، timeline و AuditEntryهای مربوط در server و transaction ثبت می‌شوند.
- duplicate check فقط داخل context فعال query می‌کند و اطلاعات Tenant دیگر را برنمی‌گرداند.
- identity و normalized phone در Workspace مرکزی هستند، اما relationship/query عملیاتی Customer همچنان Company-scoped است؛ test چندCompany نبود existence oracle را بررسی می‌کند.
- reconciliation مرکزی فقط با `customer.identity.reconcile` و Context فعال `WORKSPACE` اجرا می‌شود. endpoint عمومی برای enumerate/search هویت‌های Workspace وجود ندارد؛ داشتن permission در Company context نیز کافی نیست.
- merge مرکزی Identity را حذف نمی‌کند و Actor واقعی، user مؤثر، reason، idempotency، lineage snapshot و reverse را ثبت می‌کند. دو relationship فعال یک Company باید پیش از آن صریحاً در سطح Company reconcile شوند.
- permissionهای حساس `customer.identity.manage` و `customer.merge` سمت server enforce می‌شوند؛ UI مرز امنیتی نیست.
- response خطا secret و password را برنمی‌گرداند و correlation ID برای پیگیری دارد.
- مدیریت Company، Organization unit، UserAccount، Membership و RoleAssignment با Permission و Scope سمت server و Audit انجام می‌شود. RLS اجباری روی `organization_units` مرز Workspace را مستقل از filter برنامه کنترل می‌کند؛ جدول‌های bootstrap هویت همچنان به guard و queryهای Workspace-scoped برنامه متکی‌اند.
- UserAccount جدید credential تصادفی `scrypt` دریافت می‌کند که فقط یک‌بار در response ایجاد نمایش داده می‌شود؛ password legacy migrate، log یا commit نمی‌شود. تا زمان تغییر credential موقت، انتخاب Context و دسترسی به APIهای کاری با `requires_password_change` در server مسدود است؛ تغییر موفق password سایر sessionهای همان UserAccount را باطل می‌کند.
- Impersonation بدون Password هدف، با reason اجباری، مدت ۵ تا ۳۰ دقیقه، منع target خارج از Scope و Permission intersection اجرا می‌شود. Audit، Actor واقعی، User مؤثر و `impersonation_id` را جدا نگه می‌دارد و UI banner/بازگشت دارد.
- Financial Review در نشست Impersonation ممنوع است. Payment شناسه actor واقعی و user مؤثر سازنده را نگه می‌دارد و هر دو برای review همان Payment مسدودند؛ reviewer مستقل باید Permission و Scope معتبر داشته باشد.
- مبلغ مالی در API رشته decimal Rial، در Backend `bigint` و در PostgreSQL `bigint` است؛ overpayment هنگام review fail-closed و review هم‌زمان با row lock سری می‌شود.
- lookup واحدهای Organization برای ساخت Session با transaction دارای Workspace context انجام می‌شود؛ بنابراین `organization_units` RLS دور زده نمی‌شود و Scopeهای unit گم نمی‌شوند.
- Sales permissionهای `sales.queue.read`, `sales.call.create`, `sales.lead.create/read_all/assign/reassign` و `sales.marketing.link` سمت server enforce می‌شوند؛ فهرست assignee و marketing link نیز به Workspace/Company فعال محدود است.
- فروشنده عادی فقط صف membership خود را می‌بیند، endpoint self-claim ندارد و نمی‌تواند روی Lead فروشنده دیگر تماس ثبت کند. manager برای reassignment به permission و reason نیاز دارد و تغییر در history/Audit ثبت می‌شود.
- تماس ناموفق relationship/lock نمی‌سازد؛ تماس مؤثر فقط طبق `sales_policies` قابل‌تنظیم relationship/lock می‌سازد. پایان شیفت نیز در policy فعلی باعث انتقال خودکار assignment نمی‌شود.
- اتصال Campaign/Promotion فقط توسط manager مجاز است، زیر RLS همان Company اجرا می‌شود و نمی‌تواند Lead شرکت دیگر را آشکار یا تغییر دهد. این اتصال هیچ pricing/eligibility ضمنی ایجاد نمی‌کند.
- Warehouse Foundation با Permissionهای مستقل server-side و `ENABLE/FORCE RLS` اجرا می‌شود. Scopeهای واحد سازمانی که attribution صریح Warehouse ندارند fail-closed هستند و Company context نمی‌تواند مالک یا موجودی Company دیگر را جعل کند.
- ledger موجودی append-only است؛ Update/Delete movement ممنوع و correction فقط با reversal ممیزی‌شده انجام می‌شود. balanceها با lock قطعی و `FOR UPDATE` تغییر می‌کنند تا رزرو همزمان oversell یا موجودی منفی نسازد.
- Manual Receiving به Permission مستقل، reason و evidence نیاز دارد. Adjustment و Count maker-checker هستند؛ creator/effective user و نشست Impersonation نمی‌توانند approval همان رکورد را انجام دهند.

## ریسک باقی‌مانده Prototype

بخش‌های قدیمی همچنان permission client-side و داده در `localStorage` دارند؛ passwordهای نمونه legacy نیز در همان مدل قدیمی وجود دارند. login محلی و Impersonation legacy از مسیر عادی محصول حذف شده‌اند و صفحه‌های «سازمان و مدیریت»، «فاکتور فروش» و «تأیید مالی فروش» از Backend استفاده می‌کنند، اما سایر بخش‌های Prototype همچنان مرز امنیتی production نیستند.

## Gapهای باقی‌مانده

- MFA، recovery، rate limiting و lockout اجرا نشده‌اند.
- recovery، reset مدیریتی credential و سیاست production برای rotation هنوز اجرا نشده‌اند؛ flow تغییر اجباری credential موقت در development موجود است.
- TLS توسط خود برنامه local فراهم نمی‌شود و باید در deployment خاتمه یابد.
- secret manager، backup/restore، retention، encryption-at-rest policy و security monitoring production تعریف نشده‌اند.
- Audit فعلی append-oriented است، اما tamper-evident storage و Outbox هنوز اجرا نشده‌اند.
- credential واقعی فقط در فایل ignored محیطی مجاز است و هرگز نباید در repository یا log قرار گیرد.

## بدهی `xlsx`

dependency قدیمی `xlsx@0.18.5` هنوز برای export در `src/components/ArchiveView.tsx` لازم است و حذف آن در این Sprint می‌توانست Prototype را بشکند. Customer 360 هیچ import یا parsing جدیدی بر پایه آن ندارد. پیش از ساخت import آینده باید آن مسیر با یک library نگهداری‌شده یا pipeline کنترل‌شده CSV/server-side جایگزین و فایل‌ها از نظر اندازه، نوع، formula injection و محتوای مخرب validate شوند.

## مرز امنیتی Customer Import

- Import جدید فقط CSV متنی، حداکثر `512 KiB` و `500` ردیف را می‌پذیرد و هیچ formula را اجرا نمی‌کند.
- filename به نام امن `.csv` محدود است و مسیر filesystem کاربر پذیرفته نمی‌شود.
- staging و candidate matching زیر RLS همان Workspace/Company اجرا می‌شوند.
- مجوزهای `read`، `create`، `review` و `approve` مستقل و server-side هستند؛ `customer.read` داده Import نمی‌دهد و UI مرز امنیتی محسوب نمی‌شود.
- list فقط summary پاک‌سازی‌شده می‌دهد؛ raw staging/candidate detail هم‌زمان به `customer.import.read` و `customer.import.review` نیاز دارد.
- داده master فقط پس از تصمیم کامل و Approval transaction-safe تغییر می‌کند.
- dependency `xlsx@0.18.5` همچنان legacy debt مربوط به export Prototype است؛ Customer Import جدید هیچ استفاده‌ای از آن ندارد و گسترش استفاده آن مجاز نیست.

جزئیات در [Customer Import](../domains/sales/customer-import.md) است.

مرز امنیتی Sales در [عملیات فعلی Lead](../domains/sales/current-lead-operations.md) ثبت شده است.

مرز امنیتی Warehouse در [بنیاد فعلی انبار](../domains/warehouse/current-foundation.md) ثبت شده است.
