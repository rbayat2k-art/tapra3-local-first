# ورود کنترل‌شده Customer از CSV

> Status: CURRENT
> Source of truth: این سند برای رفتار پیاده‌سازی‌شده Customer Import، staging و reconciliation است.
> Owner: Sales Domain Owner
> Last validated: 2026-08-17 against `agent/operational-ui-acceptance-v1`
> Supersedes: none
> Superseded by: none

## دامنه فعلی

مسیر اجراشده چنین است:

`UTF-8 CSV → Upload → Staging → Normalize/Validate → Duplicate Detection → Reconciliation → Explicit Approval → Customer 360`

UI عملیاتی دلایل classification را با برچسب فارسی نشان می‌دهد؛ در حالت ناشناخته fallback امن دارد و بعد از اعمال ردیف، UUID مشتری را نمایش نمی‌دهد.

ورودی حداکثر `512 KiB` و `500` ردیف داده دارد. فقط فایل `.csv` با `Content-Type` سازگار پذیرفته می‌شود. parser داخلی از quote و comma استاندارد CSV پشتیبانی می‌کند و هیچ formula یا کد داخل فایل را اجرا نمی‌کند. مسیر filesystem از کاربر دریافت نمی‌شود و قابلیت جدید از dependency قدیمی `xlsx` استفاده نمی‌کند.

schema فعلی `customer-import-v1` است. headerهای الزامی `full_name` و `phone` هستند. headerهای پشتیبانی‌شده دیگر شامل phone دوم، استان، شهر، نشانی، کدپستی، reference/date/amount خرید، منبع و `purchased_item` است.

## ImportJob و staging

- `customer_import_jobs` مالک context، filename، hash فایل، source، schema version، state، شمارنده‌های classification/approval/rejection و زمان‌های ایجاد/تکمیل است.
- `customer_import_records` ردیف خام، مقدارهای normalized قابل اتکا، validation reasons، candidateها، پیشنهاد، تصمیم reviewer و نتیجه اعمال را نگه می‌دارد.
- staging به‌تنهایی هیچ تغییری در `customers`، phone، address، provenance یا timeline نمی‌دهد.
- داده نامعتبر در `raw_data` برای traceability باقی می‌ماند، ولی در ستون typed به‌عنوان مقدار معتبر جعل نمی‌شود.

stateهای فعلی Job عبارت‌اند از `staged`, `in_review`, `approved`, `failed`. در وضعیت فعلی `approved` یعنی transaction نهایی کامل شده و `completed_at` ثبت شده است.

## Classification و تصمیم

classificationهای فعلی:

- `VALID`
- `INVALID`
- `EXACT_MATCH`
- `POSSIBLE_DUPLICATE`
- `REVIEW_REQUIRED`

تطبیق قطعی بر normalized phone متکی است. نام یکسان فقط هشدار احتمالی است. تکرار phone در همان فایل به ردیف رهبر متصل می‌شود تا چند purchase row یک شخص، چند Customer نسازد. هنگام Approval، owner شماره از `customer_identity_phones` resolve و alias احتمالی به canonical Identity دنبال می‌شود؛ Import نمی‌تواند Identity دوم ناسازگار برای همان شماره بسازد. fuzzy matching، address similarity و AI resolution اجرا نشده‌اند.

تصمیم‌های پشتیبانی‌شده عبارت‌اند از `CREATE_NEW`, `LINK_TO_EXISTING`, `LINK_TO_STAGED`, `REJECT`, `KEEP_FOR_REVIEW`. تصمیم‌های کم‌ریسک می‌توانند دسته‌ای ثبت شوند، اما موارد مبهم به تصمیم صریح reviewer نیاز دارند. Import تا وقتی تصمیم باز وجود دارد approve نمی‌شود و Import هرگز Customerها را خودکار merge نمی‌کند.

## مرز Approval، provenance و تاریخچه خرید

Approval در transaction tenant-scoped اجرا می‌شود و پردازش تکراری همان Job، Customer یا source تکراری ایجاد نمی‌کند. فقط در این مرز Customer جدید ساخته یا source به Customer موجود متصل می‌شود. عملیات material در `audit_entries` ثبت می‌شوند و timeline رویدادهای `customer_imported` یا `import_data_linked` دریافت می‌کند.

وجود Identity در Company دیگر به Import نمایش داده نمی‌شود. در Company جدید، Approval می‌تواند relationship مستقل را به همان canonical Identity متصل کند، اما candidateها و داده عملیاتی Company دیگر را برنمی‌گرداند.

اطلاعات purchase شامل reference، date، amount و item/service در staging و `customer_sources.metadata` حفظ می‌شود. این اطلاعات Invoice authoritative نیست. تبدیل آن به Sales/Invoice رسمی به مدل Sales آینده موکول شده است.

## امنیت و دسترسی

permissionهای server-side عبارت‌اند از:

- `customer.import.read`
- `customer.import.create`
- `customer.import.review`
- `customer.import.approve`

`read` فقط summary پاک‌سازی‌شده را مجاز می‌کند. مشاهده `raw_data`، candidateها و تصمیم‌های ردیفی به `read + review` نیاز دارد. `customer.read` به‌تنهایی هیچ دسترسی به Import نمی‌دهد.

هر دو جدول Import دارای `RLS` و `FORCE ROW LEVEL SECURITY` بر اساس Workspace/Company فعال هستند. candidate matching نیز در همان transaction و context انجام می‌شود؛ client نمی‌تواند Workspace یا Company مقصد را در payload تعیین کند.

## موارد deferred

این قابلیت برای فایل محدود Sprint 3 است، نه migration حجیم. موارد زیر CURRENT نیستند:

- ingestion با حجم `102M`؛
- streaming/chunked parser، background worker، resume و batch checkpoint؛
- fuzzy یا AI entity resolution؛
- ساخت Invoice از purchase history؛
- import با XLSX.

مسیر scale آینده باید staging فعلی را با object storage امن، job queue، chunkهای idempotent، checkpoint و monitoring توسعه دهد؛ قرارداد approval و tenant isolation نباید حذف شود.

## شواهد پیاده‌سازی

- `server/migrations/0005_customer_import_staging.sql`
- `server/migrations/0006_customer_import_completion_fields.sql`
- `server/migrations/0007_customer_import_read_permission.sql`
- `server/src/modules/customer-imports/`
- `src/foundation/customers/CustomerImportView.tsx`
- `server/fixtures/customer-import/`
