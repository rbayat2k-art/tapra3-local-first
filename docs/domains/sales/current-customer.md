# رفتار فعلی مشتری فروش

> Status: CURRENT
> Source of truth: این سند برای قابلیت پیاده‌سازی‌شده Customer identity/profile و relationship شرکت است.
> Owner: Sales Domain Owner
> Last validated: 2026-08-17 against `agent/operational-ui-acceptance-v1`
> Supersedes: none
> Superseded by: none

محصول visible فقط یک مسیر Customer دارد: Customer 360 سروری. Lead، صف، assignment و Call Log محدود نیز server-backed شده‌اند و authority آن‌ها [عملیات فعلی Lead](current-lead-operations.md) است. UIهای فاکتور فروش، Promotion، Campaign کامل و Fulfillment از legacy بازیابی شده‌اند، اما backing آن‌ها prototype است و Backend Sales کامل را اثبات نمی‌کنند.

## Customer SaaS / PostgreSQL

- کاربر ابتدا login و یک membership مجاز را به‌عنوان Workspace/Company context انتخاب می‌کند.
- permissionهای `customer.read`، `customer.create`، `customer.identity.manage` و `customer.merge` در server enforce می‌شوند. reconciliation مرکزی permission مستقل `customer.identity.reconcile` و Scope فعال `WORKSPACE` می‌خواهد.
- Customer profile والد است و phone/addressهای چندتایی و source/provenance دارد.
- هر normalized phone در Workspace فقط یک owner identity دارد. `identityId` lineage تاریخی رابطه و `canonicalIdentityId` مرجع فعال هویت است؛ هر Company relationship و داده عملیاتی مستقل دارد و Company visibility/RLS مانع مشاهده context دیگر می‌شود.
- timeline علاوه بر eventهای profile، `customer_identity_merged` و `customer_identity_split` را در همان Company و بدون نمایش داده عملیاتی Company دیگر ثبت می‌کند.
- duplicate check شماره دقیق را `EXACT_MATCH` و نام دقیق را فقط به‌عنوان `POSSIBLE_DUPLICATE` برای بررسی انسانی برمی‌گرداند؛ merge خودکار وجود ندارد.
- merge رابطه شرکتی دارای permission، confirmation UI، transaction، AuditEntry و انتخاب deterministic canonical است. profile بازنده حذف نمی‌شود و unmerge واقعی داده و استقلال آن را بازمی‌گرداند.
- UI فقط Customer 360 و Import طبیعی داخل همان workspace را نشان می‌دهد و هیچ انتخاب فناوری database ندارد.
- UI برای event و source ناشناخته برچسب فارسی امن نشان می‌دهد و کد داخلی سرور را به کاربر نشت نمی‌دهد.

fuzzy matching، ارتباط هویت میان Workspaceها، import انبوه، AI entity resolution و جریان کامل Prospect/Opportunity هنوز CURRENT نیستند. وجود Lead محدود فعلی به معنی پیاده‌سازی کامل موتور Campaign/Opportunity نیست.

## Customer Resolution پیش از ایجاد

مسیر عادی ساخت Customer با شماره تماس آغاز می‌شود:

1. UI ابتدا normalized phone و نام را از endpoint تشخیص duplicate بررسی می‌کند.
2. `EXACT_MATCH` کاربر را به همان Customer/Identity موجود هدایت می‌کند و ساخت duplicate را مجاز نمی‌کند.
3. `NO_MATCH` اجازه ساخت profile جدید را می‌دهد؛ constraint شماره Workspace-level همچنان در PostgreSQL از race یا دورزدن UI جلوگیری می‌کند.
4. `POSSIBLE_DUPLICATE` ایجاد خودکار یا merge خودکار انجام نمی‌دهد و فقط پس از بررسی انسانی می‌تواند به profile جدا منجر شود.

این flow به معنی جست‌وجوی سراسری داده عملیاتی Companyهای دیگر نیست. resolution شماره در server بدون existence oracle انجام می‌شود و Company جدید فقط relationship مستقل و مجاز خود را به Identity مرکزی متصل می‌کند.

## مرز دو نوع merge

- `POST /customers/merge` فقط دو relationship قابل‌مشاهده در همان Company را یکپارچه می‌کند و history آن در `customer_merge_operations` است؛ این عملیات به‌تنهایی هویت مرکزی را merge نمی‌کند.
- `POST /customer-identities/merge` فقط برای Data Steward دارای `customer.identity.reconcile` در `WORKSPACE` scope است. winner از Identity قدیمی‌تر و سپس UUID تعیین می‌شود، بازنده حذف نمی‌شود و به alias هویت canonical تبدیل می‌گردد.
- history مرکزی در `customer_identity_merge_operations` با snapshot هویت، phone و relationship، Actor واقعی، reason، Audit و idempotency نگهداری می‌شود.
- اگر هر دو Identity در یک Company relationship فعال داشته باشند، ابتدا باید relationship merge صریح انجام شود؛ reconciliation مرکزی حق ندارد آن تعارض عملیاتی را پنهان کند.
- برای recovery، ابتدا identity reconciliation و سپس relationship merge بازگردانی می‌شود. ترتیب معکوس در server رد می‌شود تا دو relationship فعال با یک canonical Identity ساخته نشوند.
- endpoint جست‌وجوی سراسری Identity وجود ندارد. duplicate check و profile همچنان Company-scoped هستند؛ بنابراین Company A از وجود رابطه یا داده Company B آگاه نمی‌شود.
- Lead فعلی به `canonicalIdentityId` متصل است و `customerId` را برای relationship عملیاتی همان Company نگه می‌دارد. referenceهای آینده مانند Invoice نیز باید همین مرز را رعایت کنند؛ Invoice در این Sprint ساخته نشده است.

## Customer Prototype / localStorage compatibility

- `Customer` اطلاعات اختیاری هویت و نشانی، `createdAt` و `activityLog` دارد.
- `phone1` در UI نقطه شروع جست‌وجو/ثبت است و توضیح type آن را در صورت وجود یکتا می‌داند؛ storage قید دیتابیس واقعی برای uniqueness ندارد.
- داده با `STORAGE_KEYS.CUSTOMERS` در `localStorage` ذخیره می‌شود.
- مالک فعال فیلد ذخیره‌شده نیست و با `getCurrentActiveSalespersonId` از entry دارای `status: 'active'` derive می‌شود.

## جست‌وجو و قفل مالکیت

- `findCustomerByPhone` روی `phone1` و `phone2` جست‌وجوی سراسری انجام می‌دهد و عمداً به دید سلسله‌مراتبی محدود نیست.
- `canStartNewSale` فقط وقتی true است که چرخه active وجود نداشته باشد.
- `startNewSaleCycle` در وجود چرخه active تغییری ایجاد نمی‌کند؛ caller باید پیام قفل مالکیت را نمایش دهد.
- فقط فروشنده مالک چرخه active می‌تواند آن را با `closeSaleCycle` به `completed` ببرد.
- بستن چرخه در وضعیت فعلی دستی/آزمایشی است و به تکمیل فاکتور متصل نیست.

## دید سلسله‌مراتبی

- زنجیره فروش فقط از `User.salesSupervisorId` ساخته می‌شود.
- `getVisibleCustomerIds` مشتریانی را برمی‌گرداند که current user یا زیرمجموعه‌های او entryای در `activityLog` دارند.
- admin همه مشتریان را می‌بیند.
- این زنجیره کاملاً مستقل از `approvalChain` و `allowedApproverIds` خزانه‌داری است.

## دسترسی

- tab visible «مشتریان» همیشه `SaasCustomerWorkspace` را باز می‌کند؛ permission و داده Customer در Foundation مستقل و server-side است.
- کاربران نمونه فروش، `User.role: 'requestor'` و `customPermissions: ['sales_access']` دارند؛ `UserRole` مخصوص فروش اضافه نشده است.

هیچ داده `localStorage` به‌طور خودکار migrate یا حذف نشده است. طراحی ادامه فروش در [approved design](approved-design.md) و ابهام‌های آن در [open questions](open-questions.md) است. منبع تاریخی کامل در [Sales Draft archive](../../archive/sales/SALES_ARCHITECTURE_DRAFT.md) و Snapshot باقی می‌ماند.

## Customer Import فعلی

Customer workspace اکنون upload محدود CSV، staging، validation، duplicate detection، reconciliation و Approval صریح دارد. staging هیچ Customer اصلی نمی‌سازد و ردیف‌های مبهم auto-merge نمی‌شوند. هنگام Approval، phone موجود به canonical Identity همان Workspace resolve می‌شود و relationship جدید فقط در Company فعال ساخته می‌شود. permissionهای مستقل Import سمت server enforce می‌شوند. منبع authoritative این رفتار [Customer Import](customer-import.md) است.
