# قواعد کسب‌وکار پشتیبانی و عودت

> Status: CURRENT
> Source of truth: این سند برای رفتار فعلی Support Case و گردش مالی عودت است.
> Owner: Support Domain Owner
> Last validated: 2026-08-11 against `stable@6d8414e0`
> Supersedes: none
> Superseded by: none

شواهد اصلی `SupportView.tsx`, `SupportCaseFormModal.tsx`, `SupportCaseDetailModal.tsx`, `App.tsx` و typeهای `SupportCase` در `src/types.ts` هستند.

## مالکیت و دید

- کارشناس دارای `manage_support_cases` پرونده را ثبت و پیگیری می‌کند.
- admin همه پرونده‌ها را می‌بیند؛ لیست عملیاتی کاربر عادی به `operatorId` خودش محدود است.
- گزارش جامع به admin یا `view_support_reports` وابسته است.
- ویرایش پرونده فقط برای مالک پشتیبان/admin، پیش از اقدام مالی مؤثر و تا قبل از بسته‌شدن مجاز است.

## ردیف مالی

- هر پرونده می‌تواند چند `SupportTransactionRow` داشته باشد.
- مبلغ نهایی عودت به‌صورت `max(0, totalInvoiceAmount - totalDeductions + litigationCost + extraCost + doorDeliveryAmount)` محاسبه می‌شود.
- ردیف تازه با `pending_financial_approval` ثبت می‌شود.
- تأیید مالی فقط برای ردیف `pending_financial_approval` که هنوز `paymentRequestId` ندارد مجاز است.
- تأییدکننده مالی می‌تواند ردیف را رد یا برای اصلاح بازگرداند؛ هر دو اقدام به توضیح دلیل‌دار نیاز دارند.
- تأیید `approved_pending_send` فقط پیش از ایجاد درخواست خزانه و با دلیل اجباری قابل لغو است. پس از اتصال ردیف به درخواست پرداخت، تصمیم مالی reset نمی‌شود.
- ردیف `needs_correction` توسط پشتیبانی اصلاح و دوباره به `pending_financial_approval` ارسال می‌شود.
- ردیف‌های `approved_pending_send` می‌توانند انتخابی یا یکجا به خزانه‌داری ارسال شوند.

## اتصال به خزانه‌داری

- ارسال ردیف تأییدشده، یک `PaymentRequest` از نوع `customer_refund` در گردش موجود خزانه‌داری می‌سازد.
- شناسه پرونده، tracking code پرونده، شناسه ردیف و نام مشتری روی درخواست پرداخت نگهداری می‌شود.
- `paymentRequestId` و `paymentRequestTrackingCode` روی ردیف Support ثبت می‌شوند.
- `sourceSupportTransactionId` روی درخواست خزانه ثبت می‌شود و وجود هر درخواست قبلی با همین شناسه—حتی اگر بعداً `cancelled` شده باشد—ایجاد درخواست دوم را رد می‌کند.
- ارسال چند ردیف atomic اعتبارسنجی می‌شود: وجود یک ردیف نامعتبر باعث می‌شود هیچ درخواست جدیدی از همان batch ساخته نشود.
- `App.tsx` تغییر وضعیت درخواست پرداخت را به ردیف مرتبط بازتاب می‌دهد؛ پرداخت تکمیل‌شده ردیف را به `paid` می‌رساند.

## تاریخچه و بستن پرونده

- timeline پرونده ایجاد، افزودن تراکنش، تصمیم مالی، اصلاح، ارسال به خزانه، پرداخت، توضیح و بستن را ثبت می‌کند.
- ارسال ردیف به خزانه به معنی تکمیل پرونده نیست.
- پرونده بدون ردیف یا دارای ردیف در حال بررسی/ارسال/پرداخت بسته نمی‌شود؛ بستن فقط وقتی مجاز است که همه ردیف‌ها `paid` یا `financial_rejected` باشند.
- بستن مجاز، `status` و `complaintStatus` را `closed` و `completedAt` را مقداردهی می‌کند.
- طراحی آینده اتصال Lead، فاکتور فروش و قرنطینه شکایت، رفتار CURRENT نیست و در [approved sales design](../sales/approved-design.md) و [open questions](../sales/open-questions.md) نگهداری می‌شود.
