# اصول آینده محصول Tapra2

> Status: APPROVED-FUTURE
> Source of truth: این سند برای اصول cross-domain پذیرفته‌شده‌ای است که جهت آینده همه domainهای Tapra2 را تعیین می‌کنند.
> Owner: Product Architecture Owner
> Last validated: 2026-08-11 against confirmed product consolidation decisions and `agent/docs-migration@be6908c`
> Supersedes: none
> Superseded by: none

این سند رفتار `CURRENT` را توصیف نمی‌کند. وضعیت پیاده‌سازی‌شده در [product overview](../product/overview.md) و [module catalog](../product/module-catalog.md) ثبت شده است. جزئیات هر domain در authority همان domain باقی می‌ماند و این سند فقط اصول مشترک را تعیین می‌کند.

این اصول تصمیم‌های پذیرفته‌شده‌اند و نباید بدون تصمیم صریح جدید و ثبت rationale در [Decision Log](../decisions/DECISION_LOG.md) دوباره به‌عنوان سؤال باز مطرح شوند.

## ۱. Vision محصول

Tapra2 فقط یک CRM نیست؛ جهت محصول، یک platform منعطف `ERP / Automation / AI` برای ساختارهای چندشرکتی است.

این platform برای پشتیبانی از companyها، departmentها، partnerها، Customerها، employeeها، supplierها، workflowها، Finance، Sales، Operations و AI intelligence تکامل می‌یابد.

## ۲. معماری Multi-company

- یک platform می‌تواند یک یا چند company داشته باشد.
- هر company می‌تواند مستقل عمل کند.
- گزارش‌گیری group-level فقط با permission مناسب مجاز است.
- `company data isolation` الزامی است.
- اشتراک داده فقط بر پایه Contract و permission انجام می‌شود و خودکار نیست.

## ۳. مدل Identity

`Person identity`، `Company relationship`، `Role`، `Permission` و `Membership` مفاهیم مستقل‌اند.

یک Person می‌تواند هم‌زمان یا در دوره‌های مختلف با چند company رابطه داشته باشد و در هرکدام context، Role، Permission و Membership متفاوتی دریافت کند. شناسایی یک Person در سطح platform به معنی دسترسی سراسری به داده شرکت‌ها نیست.

## ۴. Workflow منعطف

فرایندهای کسب‌وکار نباید در platform به یک مسیر ثابت hard-code شوند. طراحی آینده باید از موارد زیر با versioning پشتیبانی کند:

- company workflow؛
- department workflow؛
- approval flow؛
- automation rule.

نسخه مؤثر Rule و Workflow در زمان هر رویداد مهم باید برای audit و تفسیر تاریخی قابل بازیابی باشد.

## ۵. System of record

Tapra2 به primary business system و مرجع اصلی داده و فرایندهای منتقل‌شده تبدیل می‌شود.

سامانه‌های خارجی، فایل‌های legacy و ابزارهای تخصصی فقط migration source یا integration source هستند و authority دائمی موازی محسوب نمی‌شوند. بازنشستگی هر منبع قدیمی باید پس از import، validation، reconciliation و parallel verification انجام شود.

## ۶. اصول AI

AI می‌تواند:

- به کاربر کمک کند؛
- پیشنهاد ارائه دهد؛
- داده و رویدادها را تحلیل کند؛
- خطا، ریسک یا رفتار مسئله‌دار را تشخیص دهد.

AI نباید:

- business fact اختراع کند؛
- permission یا data scope را دور بزند؛
- تصمیم حساس کسب‌وکار را بی‌صدا تغییر دهد.

تمام AI actionها باید تحت policy صریح، permission، traceability و سطح اختیار مشخص انجام شوند.

## ۷. اصل User Experience

پیچیدگی باید در automation، policy و orchestration پشت‌صحنه مدیریت شود. کاربر باید interface ساده، dashboard متناسب با Role و فقط اطلاعات لازم برای کار خود را ببیند.

سادگی UI نباید باعث حذف validation، audit، مسئول، status یا اقدام بعدی در پشت‌صحنه شود.

## ۸. Audit و History

رویدادهای مهم کسب‌وکار باید حداقل actor، time، previous value، new value و reason را ثبت کنند.

تاریخچه معتبر نباید حذف یا با تغییرات بعدی بازنویسی شود. UI می‌تواند خلاصه و ساده بماند، اما جزئیات audit باید برای کاربران مجاز قابل بازیابی باشد.

## ۹. خلاصه جهت Sales

جهت معماری Sales شامل `Customer 360`، `Prospect`، `Lead`، `Opportunity`، Contract-driven selling، Pricing ruleها، Attribution، Partner ecosystem، AI Sales assistance، Manager OS و Forecasting است.

این فهرست فقط خلاصه جهت محصول است. قواعد و مرزهای Sales در [approved Sales design](../domains/sales/approved-design.md) و تصمیم‌های هنوز حل‌نشده در [Sales open questions](../domains/sales/open-questions.md) نگهداری می‌شوند.

## مرز تصمیم‌های جزئی

این اصول، state machine، schema، فناوری backend، قرارداد API یا policy اجرایی هر domain را تعیین نمی‌کنند. موارد جزئی تا زمان تصمیم در authority همان domain با وضعیت `DRAFT` باقی می‌مانند.
