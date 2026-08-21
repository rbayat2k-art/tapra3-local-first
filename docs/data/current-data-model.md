# مدل داده فعلی

> Status: CURRENT
> Source of truth: This document for current conceptual data model
> Owner: Data Owner
> Last validated: 2026-08-16 against migrations `0001`–`0023`
> Supersedes: none
> Superseded by: none

در دوره migration دو مدل داده اجراشده هم‌زمان وجود دارند و نباید با هم یکی فرض شوند.

## مدل server-backed Foundation

تعریف دقیق schema در migrationهای `server/migrations/` است:

| مرز | موجودیت‌ها |
|---|---|
| Organization | `workspaces`, `companies`, `organization_units` برای `BRANCH`، `DEPARTMENT`، `TEAM` و `SHARED_SERVICE` |
| Identity | `persons`, `user_accounts`, `sessions` |
| Access | `memberships`, `roles`, `permissions`, `role_assignments`, `role_permissions` و `legacy_role_mappings` |
| Workspace identity | `customer_identities` و `customer_identity_phones` برای هویت/شماره مرکزی و یکتا در Workspace؛ status و alias به canonical Identity برای reconciliation |
| Company relationship | `customers` رابطه Company با `identity_id` تاریخی و `canonical_identity_id` فعال؛ `customer_phones` و `customer_addresses` observation و داده عملیاتی Company |
| Provenance | `customer_sources` برای منبع، reference، زمان مشاهده/ورود، confidence و verification foundation |
| Customer history | `customer_timeline_events` برای eventهای server-generated اجراشده |
| Company relationship reconciliation | `customer_merge_operations` برای merge دو profile همان Company و unmerge واقعی بدون حذف profile بازنده |
| Central identity reconciliation | `customer_identity_merge_operations` برای lineage، reason، snapshot، Audit و reverse هویت Workspace-level |
| Sales policy | `sales_policies` برای outcome مؤثر، lock و رفتار assignment بدون hard-code در service |
| Sales operation | `sales_leads`, `sales_lead_assignments`, `sales_call_logs` برای Lead متصل به `canonical_identity_id`، رابطه `customer_id`، مالکیت عملیاتی و تماس Company-scoped |
| Sales relationship/history | `sales_customer_relationships`, `sales_customer_relationship_events`, `sales_lead_timeline_events` برای lock و history قابل‌ردیابی |
| Sales marketing context | `sales_lead_marketing_links` برای reference و snapshot نوع `campaign`/`promotion` متصل به Lead و relationship همان Company |
| Sale/Invoice | `sales_transactions` برای seller/actor/entry mode و Identity/relationship؛ `sales_invoices`، `sales_invoice_lines` و `sales_invoice_revisions` برای یک Invoice در هر Sale و revisionهای غیرمخرب |
| Payment review | `financial_accounts`، `sales_payment_method_policies`، `sales_invoice_policies`، `sales_payments` و `sales_payment_review_events` برای پرداخت‌های مستقل، حساب وصول و approval policy در Company؛ `payment_gateways` فقط foundation رزروشده و بدون endpoint اجرایی است |
| Invoice history | `sales_invoice_events` و Customer timeline برای transitionهای Invoice/Payment و Audit قابل‌ردیابی |
| Warehouse master | `warehouses`, `warehouse_locations`, `inventory_items`, `inventory_lots`, `inventory_serials` و `stock_identities`؛ Serial فیزیکی در Workspace/Item یکتا و مالک Company روی StockIdentity مستقل از operator است |
| Inventory ledger/projection | `inventory_movements` به‌عنوان ledger تغییرناپذیر و `inventory_balances` به‌عنوان projection قابل بازسازی با quantity دقیق `numeric(20,6)` |
| Warehouse operation | receipt/line، reservation/allocation، transfer/line، adjustment/line، count/line و return/inspection برای عملیات CURRENT انبار |
| Impersonation | `session_impersonations` برای نمای زمان‌دار، دلیل، actor/target context و پایان نشست |
| Audit | `audit_entries` با actor واقعی، user مؤثر، impersonation، context، action، resource و correlation |

شناسه‌ها UUID، زمان‌ها `timestamptz` و ارتباط‌های اصلی با foreign key محافظت می‌شوند. همه جدول‌های Customer 360، عملیات Sales فعلی، Warehouse Foundation و AuditEntry دارای PostgreSQL RLS اجباری هستند.

`Company` واحد تجاری/حقوقی است. `Shared Service` شرکت مصنوعی نیست و به‌صورت `organization_units.unit_type = 'SHARED_SERVICE'` با `company_id = NULL` در سطح Workspace ثبت می‌شود. واحدهای `BRANCH`، `DEPARTMENT` و `TEAM` به Company تعلق دارند و می‌توانند parent داشته باشند.

یک `UserAccount` می‌تواند از طریق چند `Membership` و چند `role_assignment` در Scopeهای `WORKSPACE`، `COMPANY`، `BRANCH`، `DEPARTMENT`، `TEAM` و `SELF` نقش متفاوت داشته باشد. assignment قدیمی بدون Scope هنگام migration بر اساس Company عضویت به Scope سازگار تبدیل می‌شود؛ assignment جدید Scope صریح دارد. Session، context فعال را با `membership + scope type + scope id` نگه می‌دارد، نه فقط Company.

شماره با تابع immutable `normalize_customer_phone` نرمال می‌شود و `customer_identity_phones` مانع تعلق بی‌صدای یک phone به دو identity ناسازگار در همان Workspace است. Identity بازنده حذف نمی‌شود و با `merged_into_identity_id` به canonical متصل می‌ماند. relationshipهای جدید و referenceهای آینده از `canonical_identity_id` استفاده می‌کنند، درحالی‌که `identity_id` اولیه برای lineage پایدار می‌ماند. هر Company فقط relationship و داده عملیاتی context خود را از طریق RLS می‌بیند. address دارای search text ساده است، ولی similarity/geocoding اجرا نشده است.

در relationship merge، phone/address/source روی Customer اصلی خود باقی می‌مانند و profile canonical آن‌ها را از رابطه merge فعال جمع می‌کند. در identity reconciliation نیز هیچ Identity یا phone حذف نمی‌شود؛ operation snapshot و alias canonical حفظ می‌شوند. unmerge مرکزی pointerهای canonical را بازیابی می‌کند و سپس unmerge رابطه می‌تواند profileهای مستقل را فعال کند.

هر Call Log مقدار `marketing_snapshot` مستقل دارد. linkهای جدید Campaign/Promotion می‌توانند بعداً به relationship متصل شوند، ولی snapshot تماس قدیمی بازنویسی نمی‌شود. این مدل فقط context و تاریخچه را ذخیره می‌کند و schema کامل Campaign/Promotion یا pricing نیست.

## مدل Prototype

مبلغ‌های Invoice/Payment در PostgreSQL `bigint` و در API رشته decimal Rial هستند. quantity موجودی در PostgreSQL `numeric(20,6)`، در API رشته decimal و در Backend arithmetic دقیق مبتنی بر `bigint` مقیاس‌دار است. `sales_payments` actor واقعی و user مؤثر سازنده را جدا نگه می‌دارد تا maker-checker حتی در Impersonation enforce شود. lifecycle تجاری Payment فقط `submitted`، `approved` و `needs_correction` است و revision اصلاحی با `corrects_payment_id` و `superseded_by_payment_id` مدل می‌شود، نه status چهارم. مدل‌های قدیمی مالی، Support، Letters، Chat، Task، Vendor و بخش‌های migrateنشده چرخه فروش در `src/types.ts` باقی مانده و با string ID در مرورگر مرتبط می‌شوند. وجود این typeها به معنی server persistence یا database constraint نیست. قرارداد Warehouse اجراشده در migrationهای `0019` تا `0023` است؛ Shipment، Delivery، Service Fulfillment، Refund و Finance عمومی همچنان Prototype/Future باقی‌اند. جزئیات در [Warehouse Foundation](../domains/warehouse/current-foundation.md) است.

## قواعد تغییر

- field دقیق Backend از SQL migration و DTO/service فعلی خوانده می‌شود.
- field دقیق Prototype از `src/types.ts` خوانده می‌شود.
- تغییر schema PostgreSQL فقط با migration جدید انجام می‌شود؛ migration اعمال‌شده بازنویسی نمی‌شود.
- مدل‌های Sales خارج از [عملیات فعلی Lead](../domains/sales/current-lead-operations.md) و [فروش، فاکتور و پرداخت فعلی](../domains/sales/current-invoice-payment.md) تا زمان implementation در اسناد `APPROVED-FUTURE` یا `DRAFT` می‌مانند.

## Customer Import staging

`customer_import_jobs` و `customer_import_records` مدل staging مستقل از Customer master هستند. هر دو Workspace/Company-scoped، دارای RLS اجباری و دارای reference به actor هستند. Job وضعیت، hash فایل، schema version، شمارنده‌ها و زمان completion را نگه می‌دارد؛ Record نیز raw row، مقدارهای normalized، reasons، candidateها، پیشنهاد، تصمیم reviewer و نتیجه اعمال را حفظ می‌کند.

`customer_sources.metadata` اطلاعات ساخت‌یافته purchase واردشده را بدون ساخت Invoice نگه می‌دارد. رویدادهای `customer_imported` و `import_data_linked` فقط پس از Approval به timeline اضافه می‌شوند. جزئیات رفتار در [Customer Import](../domains/sales/customer-import.md) است.
