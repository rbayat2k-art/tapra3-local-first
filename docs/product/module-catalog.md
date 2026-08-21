# فهرست ماژول‌های فعلی

> Status: HISTORICAL — فهرست قابلیت‌های Shell سرورمحور پیش از Local-first Phase A
> Source of truth: این سند برای فهرست ماژول‌های پیاده‌سازی‌شده و مرز مسئولیت آن‌ها است.
> Owner: Product Owner
> Last validated: 2026-08-16 against `agent/global-operational-shell-hardening`
> Supersedes: none
> Superseded by: [Local Foundation](../architecture/local-foundation.md)

> در Phase A فقط Foundation محلی اجرا می‌شود. Domainهای این فهرست در Navigation جدید فعال نیستند و برای فازهای بعدی صرفاً دانش بازیابی محسوب می‌شوند.

این فهرست مرز قابلیت‌های قابل‌دسترسی در shell عملیاتی را ثبت می‌کند. وجود View قدیمی در source به معنی فعال بودن آن در محصول نیست. جزئیات قواعد هر دامنه در سند همان دامنه نگهداری می‌شود.

## ماژول‌های عملیاتی

| حوزه | Viewهای اصلی | مسئولیت فعلی | قواعد authoritative |
|---|---|---|---|
| ورود و context | `FoundationLogin`, `ContextSelector`, `FoundationContextBar` | login سروری، انتخاب مجموعه/شرکت و نمایش context فعال | [current system](../architecture/current-system.md) و [security](../engineering/security-and-privacy.md) |
| Dashboard | `OperationalDashboardView` | context فعال، راهنمای انتخاب شرکت و میان‌برهای مجاز؛ بدون آمار ساختگی | [current-system](../architecture/current-system.md) |
| سازمان و دسترسی | `OrganizationAdminView` | شرکت، واحد، کاربر، عضویت، نقش، محدوده و ورود ممیزی‌شده به نمای کاربر | [security](../engineering/security-and-privacy.md) |
| مشتریان | `SaasCustomerWorkspace`, `SaasCustomersView`, `CustomerImportView` | نمای جامع مشتری و Import سروری؛ relationship شرکتی مستقل و آشتی هویت مرکزی Workspace | [current customer](../domains/sales/current-customer.md)، [Customer Import](../domains/sales/customer-import.md) |
| Sales Lead/queue | `SaasSalesQueueView`, `SaasLeadAssignmentView` | Lead، صف شخصی، assignment/reassignment، Call Log و Campaign/Promotion context متصل به PostgreSQL | [current lead operations](../domains/sales/current-lead-operations.md) |
| Sales invoice/payment | `SaasSalesInvoiceView` | ثبت مستقیم/کاغذی Sale، ساخت و revision فاکتور، Payment مستقل و بررسی مالی متصل به PostgreSQL | [current invoice/payment](../domains/sales/current-invoice-payment.md) |
| Warehouse Foundation | `WarehouseFoundationView` | Warehouse، ledger موجودی، Receiving، Reservation چندانباره، Transfer، Adjustment، Count و Return متصل به PostgreSQL | [current Warehouse foundation](../domains/warehouse/current-foundation.md) |

## قابلیت‌های حفظ‌شده اما خارج از ناوبری عملیاتی

Viewهای درخواست مالی عمومی، خزانه، Support، Communications، Campaign/Promotion کامل، Catalog، Batch/Coordination، Sales Organization، Fulfillment legacy، Letters، Archive و Admin قدیمی همچنان برای بازیابی دانش و migration بعدی در source وجود دارند. آن‌ها `PROTOTYPE` یا `LEGACY` هستند، از منوی عادی باز نمی‌شوند و نباید authority اجرای روزمره یا authorization تلقی شوند.

## زیرساخت مشترک UI

- `App.tsx` shell، tabها و اتصال Viewهای CURRENT را نگه می‌دارد؛ state قدیمی برای حفظ سازگاری source باقی است اما entry point عملیاتی ندارد.
- `src/config/navigationRegistry.ts` registry واحد backing status، context requirement و Permission سروری منوها و actionهای عملیاتی است.
- `Sidebar.tsx` و `TabBar.tsx` از همان registry برای ناوبری چندتبی استفاده می‌کنند.
- View بازشده تا زمان بستن tab، mount می‌ماند و هنگام تعویض tab فقط مخفی می‌شود.
- با تغییر session context یا هویت، tabها به `dashboard` بازنشانی می‌شوند تا state متعلق به context قبلی باقی نماند.
- `openTab` پیش از mount، Permission و context موردنیاز مقصد را بررسی می‌کند؛ guard صفحه‌های Company-scoped مانع API زودهنگام در context مجموعه می‌شود.
- Dashboard میان‌برها را فقط از registry عملیاتی و Permissionهای context فعال می‌سازد. تا زمانی که metric API معتبر وجود ندارد، وضعیت «آمار عملیاتی در دسترس نیست» نشان داده می‌شود.

## خارج از وضعیت فعلی

Backend و API Foundation، Customer 360/Import، Sales Lead/Queue/Assignment/Call/Marketing Context، Sale/Invoice/Payment/Financial Review و Warehouse Foundation اکنون CURRENT هستند. UI و منطق مدیریت کامل Campaign/Promotion، Catalog، Batch Invoice، Coordination، Shipment/Delivery و Service Fulfillment همچنان prototype-backed یا future هستند؛ linkage فعلی فقط reference و snapshot تاریخی را ثبت می‌کند. Outbox و integrationهای بیرونی در [future platform](../architecture/future-platform.md) و اسناد future فروش باقی می‌مانند.
