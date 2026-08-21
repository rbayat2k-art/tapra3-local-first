# Persistence فعلی

> Status: CURRENT
> Source of truth: This document for current persistence model
> Owner: Data Owner
> Last validated: 2026-08-16 against `agent/warehouse-foundation`
> Supersedes: none
> Superseded by: none

Tapra2 اکنون persistence دوگانه و صریح دارد.

## PostgreSQL

- session، Organization/Access foundation، Customer 360/Import، Lead، مسیر فعلی Sale/Invoice/Payment، Warehouse Foundation و AuditEntry در PostgreSQL ذخیره می‌شوند.
- migrationها checksum، ترتیب نام و advisory lock دارند و تکرار اجرای آن‌ها idempotent است.
- service runtime با نقش محدود `tapra2_app` و migration با `tapra2_owner` اجرا می‌شود.
- تمام relationهای Customer 360، Sales فعلی و AuditEntry در transaction دارای tenant context اجرا و با RLS محدود می‌شوند.
- ایجاد profile، افزودن phone/address و merge/unmerge همراه timeline و AuditEntry در transaction واحد انجام می‌شوند.
- migration `0004_customer_360_identity.sql` ردیف‌های Sprint 1 را بدون حذف backfill می‌کند و اجرای تکراری migration runner با checksum کنترل می‌شود.
- migration `0008_customer_identity_scope.sql` identity را Workspace-wide و relationship را Company-scoped می‌کند؛ backfill داده موجود زیر transaction انجام و `FORCE RLS` پیش از commit بازگردانده می‌شود.
- migrationهای `0009` و `0010` ساختار Organization/Scope و Impersonation ممیزی‌شده را اضافه می‌کنند.
- migrationهای `0011` و `0012` reconciliation مرکزی Identity، lineage/recovery و eventهای timeline را بدون یکی‌کردن relationshipهای Company اضافه می‌کنند.
- migration `0013_sales_lead_queue.sql` policy، Lead، assignment، Call Log، relationship و history فروش را Company-scoped اضافه می‌کند؛ assignment/call/relationship/audit در transaction واحد به‌روزرسانی می‌شوند.
- migration `0014_sales_marketing_context_links.sql` Campaign/Promotion reference و snapshot تماس را بدون ساخت موتور Campaign یا pricing اضافه می‌کند؛ link، relationship history، Customer timeline و Audit در transaction tenant-scoped ثبت می‌شوند.
- migration `0012z_legacy_sales_renumber_bridge.sql` فقط installationهای دارای نام‌های قدیمی `0009_sales_*`/`0010_sales_*` و checksum شناخته‌شده را بدون اجرای دوباره جدول‌سازها به نام‌های canonical `0013`/`0014` ارتقا می‌دهد؛ روی نصب تازه no-op است.
- migration `0015_sale_invoice_payment.sql` Sale، Invoice revision، Line، Payment مستقل، حساب مقصد، method policy، history، RLS و Audit foundation را اضافه می‌کند.
- migrationهای `0016` تا `0018` setup عملیاتی مالی و lifecycle سه‌حالته Payment را به‌صورت forward-only تثبیت می‌کنند.
- migration `0019_warehouse_inventory_core.sql` master data انبار، tracking، ledger append-only، projection موجودی، Permission و RLS را اضافه می‌کند.
- migration `0020_warehouse_operations.sql` Receiving، Reservation/Allocation و Transfer را اضافه می‌کند.
- migration `0021_warehouse_controls_and_returns.sql` Adjustment، Count و Return/Inspection را با maker-checker اضافه می‌کند.
- migration `0022_invoice_inventory_item_handoff.sql` اتصال nullable و non-destructive ردیف Invoice به Inventory Item پایدار را ایجاد می‌کند.
- migration `0023_warehouse_integrity_remediation.sql` به‌صورت forward-only محل قابل‌فروش، یکتایی فیزیکی Serial، reversal اتمی Transfer و کنترل consistency projection را enforce می‌کند و در داده Serial مبهم fail-closed است.
- Docker Compose روش reproducible رسمی development است؛ native PostgreSQL فقط fallback محلی از طریق environment است.

## localStorage

سایر قابلیت‌های Prototype همچنان از `src/utils/storage.ts` و کلیدهای موجود مرورگر استفاده می‌کنند. هیچ پاک‌سازی، تبدیل یا انتقال خودکار داده قدیمی اجرا نشده است. مسیر عادی Customer، Lead/Queue، «فاکتور فروش»/«تأیید مالی فروش» و «عملیات انبار» فقط PostgreSQL را استفاده می‌کنند؛ storage قدیمی Customer/Sales/Fulfillment صرفاً برای compatibility، قابلیت‌های migrateنشده و migration evidence در code باقی است.

## محدودیت‌ها

- backup/restore production، retention و disaster recovery هنوز پیاده‌سازی نشده‌اند.
- migration خودکار داده Prototype به PostgreSQL هنوز وجود ندارد؛ داده جدید Sales در schema جدید ساخته می‌شود.
- هم‌زیستی backingها موقت است، اما UI یک محصول واحد نشان می‌دهد؛ backing status در مستندات migration ثبت می‌شود و انتخاب فناوری به کاربر عادی واگذار نمی‌شود.
- `localStorage` همچنان برای داده حساس واقعی یا enforcement امنیتی مناسب نیست.

## Persistence مربوط به Import

- migrationهای `0005` و `0006` staging، completion counts و structured purchase provenance را بدون حذف Customer 360 موجود اضافه می‌کنند.
- staging و Approval در PostgreSQL هستند؛ فایل روی filesystem برنامه ذخیره نمی‌شود.
- Approval همه تغییرات master، provenance، timeline و audit را در transaction tenant-scoped انجام می‌دهد.
- اجرای مجدد migration با checksum و اجرای مجدد Approval با state/idempotency کنترل می‌شود.
