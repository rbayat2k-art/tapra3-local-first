# ERP محلی Tapra2 V1

> Status: CURRENT  
> Source of truth: معماری و رفتار اجرایی Complete Local ERP V1  
> Owner: Product Architecture / Product Owner  
> Last validated: 2026-08-18 against `src/local-foundation` and Blueprint V2  
> Supersedes: shell سرورمحور قبلی در `canonical-product-integration.md`

## دامنه پیاده‌سازی‌شده

ERP محلی V1 بنیادهای پذیرفته‌شده Phase A، B.1 و B.2 را نگه می‌دارد و یک هسته مشترک عملیاتی به آن‌ها اضافه می‌کند:

- Shell جدید فارسی و RTL
- IndexedDB با نام `tapra2_local` و Schema نسخه ۷
- `StorageAdapter` و پیاده‌سازی `IndexedDBAdapter`
- Permission Engine، Scope، Resource Policy و Workflow Guard
- Audit/Domain Event append-only
- نمای سازمان، درخت واحدهای قابل‌ویرایش و سمت‌های سازمانی مستقل از نقش امنیتی
- کاربران محلی با نام کاربری، رمز هش‌شده، واحد، سمت، مدیر، چند نقش و وضعیت
- پرونده مستقل پرسنل با اطلاعات فردی، تماس، همکاری، بانکی کنترل‌شده، تماس اضطراری و تاریخچه
- حساب کاربری خودخدمتی برای مشاهده پرونده شخصی و ثبت درخواست نسخه‌دار تغییر اطلاعات؛ داده مرجع فقط پس از تأیید منابع انسانی به‌روزرسانی می‌شود
- تولید خودکار و یکتای کد پرسنلی هنگام ایجاد پرونده؛ کاربر امکان ورود یا تغییر دستی کد را ندارد
- نمایش یکپارچه فیلدهای «الزامی»، «اختیاری» و مقادیر «تولید خودکار» در فرم‌های محصول، همراه با جلوگیری از ثبت فرم ناقص
- اتصال اختیاری `UserAccount → Personnel` بدون حذف پرونده در پایان همکاری یا غیرفعال‌سازی حساب
- مشتری حقیقی/حقوقی، تماس‌ها و نشانی‌های چندگانه، مالک پرونده، منبع، روابط، Timeline و یادداشت
- تشخیص تکراری امن، Merge با حفظ provenance و Audit، و ورود CSV محلی با پیش‌نمایش
- کتابخانه جامع نقش‌های قابل‌ویرایش با Permissionهای همه حوزه‌ها و Role Version
- ورود مستقیم کاربر با نام کاربری و رمز محلی
- «مشاهده دسترسی کاربر» فقط برای ادمین اصلی با بنر ثابت و ثبت Actor واقعی/کاربر مؤثر
- Navigation وابسته به Permission
- Seed قطعی، Reset، Snapshot Export/Import و Backup ساده/رمزگذاری‌شده
- تنظیمات ظاهری شامل اندازه فونت، پوسته، تراکم، فاصله قابل‌تنظیم ستون‌های جدول، کاهش حرکت و کنتراست در `localStorage`
- ثبت‌نام خوداظهاری با صف بررسی؛ متقاضی هرگز نقش خود را انتخاب نمی‌کند
- هسته عملیاتی registry-driven برای منابع انسانی، CRM، فروش، بازاریابی، کاتالوگ، خرید، تأمین‌کنندگان، مالی، خزانه، حسابداری، انبار، لجستیک، فعال‌سازی خدمات، پشتیبانی، قرارداد، دارایی، وظایف، ارتباطات، نامه و اسناد
- Commandهای واقعی ایجاد، ویرایش optimistic، تخصیص، Transition، Handoff و History روی IndexedDB
- Maker/Checker، دلیل اجباری، انتقال حساس fail-closed در حالت «ورود آزمایشی» و Idempotency Key
- Workflow Policy نسخه‌دار برای Queue، Assignment و Approval Policy بدون ویرایش آزاد State Machine
- گزارش KPI/MIS، Projection قابل بازسازی و Large QA Dataset جدا از NORMAL_DEMO

قواعد حقوقی، مالیاتی، استهلاک قانونی، حقوق و دستمزد و اتصال‌های بانکی که تصمیم محصول/حقوقی ندارند عمداً به‌صورت foundation شفاف علامت‌گذاری شده‌اند و قانون جعلی عمیق ندارند.

## مسیر اجرا

```text
React UI
→ LocalFoundationService
→ Authorization / Workflow rules
→ StorageAdapter
→ IndexedDBAdapter
→ IndexedDB
```

هیچ API، Server، PostgreSQL یا Proxy در مسیر عادی اجرا وجود ندارد.

## Object Storeها

Schema نسخه ۷ علاوه بر Storeهای Foundation و Phase B.2، Storeهای زیر را دارد:

- Workflow: `workflow_definitions`, `workflow_versions`, `workflow_history`, `idempotency_keys`
- Access/QA: `registration_requests`, `registration_reviews`, `qa_dataset_manifests`, `qa_scenario_runs`, `role_versions`, `projections`
- HCM/CRM/Sales: درخواست تغییر اطلاعات پرسنلی، قرارداد همکاری تا اسناد پرسنلی، Lead/Call/Follow-up/Opportunity، Quote/Sale/Invoice/Payment، Campaign/Promotion و Catalog/Price
- Supply/Finance: Procurement، Supplier 360، Cost Center/Budget/Finance Request، Bank/Treasury، Chart/Period/Journal/Reconciliation
- Operations: Warehouse/Inventory/Receipt/Reservation/Transfer/Adjustment/Count/Return/Movement، Shipment/Delivery، Service و Support
- Collaboration: Contract، Fixed Asset، Task، Chat/Message، Letter و Document

فهرست دقیق و نوع‌دار در `FOUNDATION_STORES` داخل `src/local-foundation/model.ts` authority اجرایی است.

## کنترل‌های پذیرش

1. ادمین از پروندهٔ کاربر «مشاهده دسترسی» را آغاز می‌کند و منو با Permission واقعی کاربر تغییر می‌کند.
2. تصمیم دسترسی از Permission، Scope، Resource Policy و Workflow Guard عبور می‌کند.
3. ورود مستقیم، مشاهده دسترسی، تغییر واحد/سمت/کاربر/نقش/مجوز/رمز، Backup، Restore و Reset در Audit ثبت می‌شوند.
4. Reload مرورگر Session و Audit را از IndexedDB بازمی‌گرداند.
5. Reset فقط داده عملیاتی را Seed می‌کند و تنظیمات ظاهری را حذف نمی‌کند.
6. Snapshot قبل از Restore از نظر Schema و checksum اعتبارسنجی می‌شود.
7. کاربران عادی هیچ کنترل QA نمی‌بینند و مشاهده دسترسی هیچ مجوز یا Policy را دور نمی‌زند.
8. ساختار واحدها چرخه نمی‌پذیرد و غیرفعال‌سازی رکوردهای دارای وابستگی فعال متوقف می‌شود.
9. ادمین یک استثنای صریح و محافظت‌شده است؛ کپی نقش ادمین این استثنا را منتقل نمی‌کند.
10. پرسنل می‌تواند بدون حساب وجود داشته باشد؛ ایجاد/اتصال حساب و تغییر وضعیت آن در تاریخچه دیده می‌شود.
11. مشتری تکراری خودکار بازنویسی نمی‌شود؛ Merge با تأیید صریح، نگهداری منشأ و Audit انجام می‌شود.
12. اطلاعات بانکی در فهرست و Audit نمایش داده نمی‌شود و View/Edit مجوز مستقل دارند.
13. هر رکورد عملیاتی Actor، زمان، Version، تاریخچه، دلیل، وضعیت و Handoff را حفظ می‌کند.
14. Transition حساس در حالت ورود آزمایشی رد می‌شود و Actor واقعی ادمین همراه Effective User ثبت می‌شود.
15. Large QA فقط رکوردهای `qaGenerated` را حذف می‌کند و NORMAL_DEMO باقی می‌ماند.
16. Projectionها از داده مرجع IndexedDB قابل بازسازی هستند.
17. فیلدهای الزامی با ستاره قرمز و برچسب فارسی مشخص‌اند و ثبت فرم ناقص، خلاصه خطای دقیق هر فیلد را نمایش می‌دهد.
18. کد پرسنلی در زمان ایجاد پرونده از روی آخرین شماره موجود توسط لایه Application تولید و از ورود دستی مستقل است.
19. تمام تاریخ‌ها و تقویم‌های رابط کاربری به‌صورت شمسی نمایش داده و انتخاب می‌شوند؛ مقدار عملیاتی در IndexedDB همچنان ISO استاندارد می‌ماند تا مرتب‌سازی، Snapshot و گردش‌کار پایدار و قابل مهاجرت باشند.
20. هر کاربر فقط پرونده متصل به حساب خودش را در «حساب کاربری» می‌بیند؛ تغییرات فردی، تماس، نشانی، بانکی و اضطراری به‌صورت درخواست مستقل با مقدار قبل/پیشنهادی، دلیل، Actor، زمان و نسخه ذخیره می‌شوند.
21. تأیید یا رد درخواست تغییر فقط با مجوز مدیریت پرسنل انجام می‌شود؛ تغییر بانکی مجوز مستقل بانکی می‌خواهد، ثبت‌کننده درخواست نمی‌تواند بازبین خودش باشد و واحد/سمت/شعبه فقط از گردش انتقال رسمی تغییر می‌کنند.
