# نمای کلی فعلی محصول

> Status: CURRENT
> Source of truth: This document for current product purpose and scope
> Owner: Product Owner
> Last validated: 2026-08-17 against the Product Owner `SINGLE-COMPANY-FIRST` scope decision
> Supersedes: none
> Superseded by: none

Tapra2 یک برنامه تحت وب برای مدیریت فرایندهای مالی و اداری سازمان است. این سند فقط دامنه‌ای را توضیح می‌دهد که در branch فعلی پیاده‌سازی و با code یا test مشاهده شده است.

## دامنه فعلی

قابلیت‌های موجود شامل این حوزه‌ها هستند:

- درخواست‌های مالی، گردش تایید، کارتابل‌ها، آرشیو و خروجی پرداخت گروهی؛
- شرکت‌ها، مراکز هزینه، کاربران، نقش‌ها و permissions؛
- ذی‌نفعان و دسته‌بندی آن‌ها؛
- نامه‌ها، ارتباطات، اعلان‌ها، پیام‌ها و کارهای ارجاع‌شده؛
- پرونده‌های support و شکایت؛
- موجودیت Customer، نمای Customer 360 و ورود کنترل‌شده CSV؛
- صف فروش، کمپین، کاتالوگ، فاکتور و fulfillment در پوسته mature بازیابی‌شده؛
- ناوبری چندتبی و تنظیمات ظاهری کاربر.

این فهرست معرفی سطح بالا است. مرجع جزئیات هر حوزه در [فهرست مالکیت مستندات](../README.md) مشخص شده است.

## مرز اجرایی فعلی

- یک Foundation server-backed برای login، Workspace/Company context، membership/permission و Customer create/read وجود دارد.
- Foundation از Express و PostgreSQL استفاده می‌کند و Customer create را همراه AuditEntry ثبت می‌کند.
- Customer 360 اکنون ورود محدود CSV با staging، reconciliation و Approval صریح دارد؛ جزئیات در [Customer Import](../domains/sales/customer-import.md) است.
- Customer و Customer Import در رابط عادی تنها از مسیر SaaS server-backed ارائه می‌شوند و انتخاب‌گر فنی منبع داده ندارند.
- سایر domainهای بازیابی‌شده هنوز client-side هستند و عمدتاً از `localStorage` استفاده می‌کنند؛ تفکیک backing store در رابط عادی به شکل محصول دوم نمایش داده نمی‌شود.
- داده legacy حذف یا به‌طور خودکار به PostgreSQL منتقل نمی‌شود.
- این سند ادعای `Production-Ready` بودن، امنیت enterprise یا persistence سروری ندارد.
- طراحی‌های آینده sales، backend و API جزو رفتار فعلی محسوب نمی‌شوند.

## اولویت فعلی توسعه: `SINGLE-COMPANY-FIRST`

Tapra2 فعلاً با اولویت محصول و UX به‌صورت `SINGLE-COMPANY-FIRST` توسعه می‌یابد. این تصمیم فقط ترتیب توسعه قابلیت‌ها و نحوه ارائه تجربه کاربری را تعیین می‌کند و به معنی تبدیل معماری به `single-company-only` نیست.

- معماری `Workspace → Company → Membership → Permission → Scope`، مرزهای Company، RLS، company isolation و تمام آزمون‌های multi-company حفظ می‌شوند.
- هیچ `Company ID` یا مرز امنیتی حذف نمی‌شود و multi-company از معماری کنار گذاشته نمی‌شود.
- UI و Workflowهای جدید ابتدا برای فعالیت در یک Company فعال طراحی می‌شوند. وقتی کاربر فقط یک Company قابل‌استفاده دارد، انتخاب Company باید تا حد ممکن خودکار باشد و پیچیدگی فنی Workspace/Company از کاربر عملیاتی پنهان بماند.
- توسعه قابلیت‌های cross-company فعلاً `DEFERRED` است؛ از جمله cross-company sales، inter-company settlement، Contract responsibility routing و multi-company operational workflows.
- آغاز دوباره توسعه قابلیت‌های multi-company به تصمیم صریح آینده Product Owner نیاز دارد.

این اولویت هیچ تغییری در authorization، Scope، tenancy enforcement، schema یا migration فعلی ایجاد نمی‌کند.

## مخاطبان فعلی

ساختار برنامه برای کاربران درخواست‌کننده، تاییدکننده، خزانه‌داری، مدیران سازمانی، کارشناسان support و نقش‌های مدیریتی طراحی شده است. دسترسی واقعی هر کاربر توسط مدل roles و permissions برنامه تعیین می‌شود.

## مراجع مرتبط

- [معماری فعلی](../architecture/current-system.md)
- [وضعیت فعلی API](../architecture/api-status.md)
- [مدل داده فعلی](../data/current-data-model.md)
- [Persistence فعلی](../data/persistence.md)
- [راهنمای توسعه](../engineering/development.md)
- [وضعیت کیفیت](../engineering/quality.md)
- [فهرست مستندات](../README.md)
