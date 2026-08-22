# بنیاد فعلی انبار و موجودی

> **Deprecated / Conflict:** این سند پیاده‌سازی Server-backed تاریخی را شرح می‌دهد؛ انبار جاری فقط Foundation عمومی Registry است. مرجع: [`../../_meta/FEATURE-MATRIX.md`](../../_meta/FEATURE-MATRIX.md).

> Status: CURRENT
> Source of truth: این سند برای رفتار اجراشده Warehouse Foundation و مرزهای آن است.
> Owner: Warehouse Domain Owner
> Last validated: 2026-08-17 against the local single-company rebuild, migrations `0019`–`0024`, UI tests and production build
> Supersedes: بخش Warehouse در `docs/domains/sales/fulfillment-policy.md` فقط در محدوده رفتارهای اجراشده این سند
> Superseded by: none

Warehouse Foundation اکنون server-authoritative و PostgreSQL-backed است. UI عملیاتی فارسی و RTL، APIهای `/api/v1/warehouse` و schema این دامنه یک vertical slice واحد هستند. Logistics، Shipment، Delivery، Fleet، Route و Contract engine هنوز CURRENT نیستند.

## مدل موجودی

- `inventory_movements` دفتر append-only و منبع حقیقت موجودی است. movement ثبت‌شده Update/Delete نمی‌شود؛ اصلاح فقط با movement معکوس و Audit انجام می‌شود.
- `inventory_balances` projection قابل بازسازی از ledger است و برای lock و query عملیاتی استفاده می‌شود؛ endpoint بررسی consistency آن را با بازسازی مستقیم از movementها مقایسه و mismatch را fail می‌کند.
- مقدار در API رشته decimal، در Backend محاسبه دقیق `bigint` با مقیاس شش رقم و در PostgreSQL از نوع `numeric(20,6)` است. محاسبه موجودی با `JavaScript number` مجاز نیست.
- trackingهای `NONE`، `LOT` و `SERIAL` اجرا شده‌اند. هویت فیزیکی Serial در هر Workspace با `(inventory_item_id, serial_code)` یکتا است؛ مالک عملیاتی روی `stock_identities` باقی می‌ماند و یک Serial نمی‌تواند هم‌زمان در دو مالک یا محل موجود باشد.
- `stock_identities.owner_company_id` مالک موجودی را از Warehouse operator جدا نگه می‌دارد. عملیات cross-company بدون Workspace authority صریح fail-closed است؛ Contract engine ساخته نشده است.

## عملیات اجراشده

| قابلیت | رفتار CURRENT |
|---|---|
| Warehouse و Location | چند Warehouse و locationهای `RECEIVING`, `SELLABLE`, `PICKING`, `PACKING`, `RETURNS`, `QUARANTINE`, `DAMAGED`, `TRANSIT` پشتیبانی می‌شوند. |
| Inventory Item | کالای پایدار با `sku`, `catalog_reference`, `uom` و tracking mode؛ Line کالای free-text یا unresolved قابل رزرو نیست. |
| Receiving | Purchase Receiving و Manual Receiving؛ حالت Manual به Permission مستقل، reason، evidence و Audit نیاز دارد. |
| Reservation | فقط current Invoice Line کالایی، دارای Inventory Item پایدار و دارای eligibility مالی؛ allocation فقط از location فعال `SELLABLE` انجام می‌شود، می‌تواند از چند Warehouse باشد و shortage/partial reservation را ثبت کند. |
| Release | Reservation آزاد می‌شود، اما موجودی فیزیکی تغییر نمی‌کند. |
| Transfer | ایجاد، خروج کامل از مبدأ و دریافت کامل در مقصد؛ reversal فقط به‌صورت اتمی برای کل سند Transfer مجاز است و برگشت یک `TRANSFER_OUT` یا `TRANSFER_IN` منفرد ممنوع است. schema برای partial receipt سازگار است ولی workflow جزئی در v1 فعال نیست. |
| Adjustment | create/submit/approve با Permissionهای جدا و maker-checker؛ creator یا نشست Impersonation نمی‌تواند تأیید کند. |
| Count | شمارش و approval مستقل؛ اختلاف با balance قفل‌شده هنگام approval به ledger وارد می‌شود. |
| Return | دریافت و inspection با dispositionهای `SELLABLE`, `QUARANTINE`, `DAMAGED`, `RETURN_TO_SUPPLIER`, `SCRAP`. |

## Invoice handoff و همزمانی

- `sales_invoice_lines.inventory_item_id` اتصال پایدار Line کالایی به Inventory Item است.
- reservation فقط برای revision جاری، Line حل‌شده و Invoice دارای payment کامل تأییدشده مجاز است؛ Warehouse وضعیت Payment را تغییر نمی‌دهد.
- allocation با lock قطعی balanceها و `FOR UPDATE` انجام می‌شود؛ رزرو همزمان نمی‌تواند oversell یا موجودی منفی ایجاد کند.
- partial reservation به معنی partial shipment نیست. Shipment/Dispatch عمومی ساخته نشده است؛ stock-out قطعی Shipment در vertical slice آینده تعریف خواهد شد.
- mutationهای create دارای `Idempotency-Key` هستند و transitionهای تکراری امن یا fail-closed می‌شوند.

## Permission، RLS و Audit

Permissionهای `warehouse.read/manage`, `warehouse.item.manage`, receiving، reservation، transfer، adjustment، count، return و movement reversal سمت server enforce می‌شوند. جدول‌های دامنه `ENABLE RLS` و `FORCE RLS` دارند. Scopeهای `BRANCH`, `DEPARTMENT`, `TEAM` و `SELF` تا زمان attribution صریح Warehouse به آن Scopeها fail-closed هستند؛ Scopeهای CURRENT فقط `WORKSPACE` و `COMPANY` هستند.

Audit با `auditIdentity(session)` هویت actor واقعی، effective user و Impersonation را حفظ می‌کند. approvalهای maker-checker در Impersonation ممنوع‌اند. UI فقط presentation boundary است و مرجع امنیت نیست.

bundleهای `inventory_maker` و `inventory_approver` مستقل‌اند و seed هیچ Role منفردی را به هر دو سوی create/approve مجهز نمی‌کند. حتی اگر هر دو bundle جداگانه به یک Membership برسند، Resource Policy تأیید Adjustment/Count ساخته‌شده توسط همان actor را رد می‌کند.

UI هر mutation را با permission جزئی همان operation نمایش می‌دهد. mutation فاقد permission مخفی است؛ mutation مجاز با ورودی یا پیش‌شرط ناقص غیرفعال می‌ماند و دلیل فارسی قابل‌مشاهده دارد. این رفتار presentation-level است و enforcement مستقل Backend، Scope، RLS و maker-checker را جایگزین نمی‌کند.

علت آزادسازی، برگشت و ثبت معکوس در فرم درون‌صفحه‌ای دریافت می‌شود و UI برای رزرو یا برگشتی UUID از کاربر نمی‌گیرد. fallback نام و وضعیت نیز برچسب فارسی امن است و UUID یا enum سرور را نشت نمی‌دهد. انتخاب ردیف رزرو از فاکتورهای کالایی دارای وضعیت مالی و اجرایی مجاز انجام می‌شود؛ بنابراین نقش رزروکننده برای استفاده از selector کسب‌وکاری باید Permission مشاهده فاکتور را نیز داشته باشد.

## شواهد پیاده‌سازی

- `server/migrations/0019_warehouse_inventory_core.sql` تا `0023_warehouse_integrity_remediation.sql`
- `server/src/modules/warehouse/`
- `server/tests/warehouse.integration.test.ts`
- `server/tests/warehouse-migration-compatibility.test.ts`
- `src/foundation/warehouse/WarehouseFoundationView.tsx`

## عمداً خارج از Scope

Fleet، Driver، Route، Shipment، Delivery، partial Transfer Receipt UI، Service Fulfillment، Payment Gateway، Contract engine و Inventory valuation/accounting ساخته نشده‌اند. قواعد پذیرفته‌شده مراحل آینده در [Sales Fulfillment Policy](../sales/fulfillment-policy.md) باقی می‌مانند.
