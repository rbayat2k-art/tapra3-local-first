> Status: HISTORICAL
> Source of truth: این سند برای تاریخچه تصمیمات معماری و مهندسی است.
> Owner: Architecture Owner
> Last validated: 2026-08-11; legacy record copied verbatim from `DECISION_LOG.md` at `stable@cea6514`
> Supersedes: none
> Superseded by: none

متن زیر سابقه legacy را بدون تغییر حفظ می‌کند. وجود یک تصمیم تاریخی به‌تنهایی نشان‌دهنده وضعیت CURRENT یا APPROVED-FUTURE نیست؛ وضعیت فعال هر موضوع را از [documentation index](../README.md) بررسی کنید.

# 📋 ثبت تصمیمات معماری و مهندسی (Decision Log)

این سند شامل تاریخچه تصمیمات کلیدی معماری، فنی و تجاری اتخاذ شده در پروژه ERP است.

---

### Date: 2026-08-02

**Decision:**
استفاده از معماری Client-Side Single-Page Application (SPA) همراه با لایه ذخیره‌سازی محلی پیشرفته (`localStorage`) و نمونه‌داده‌های اولیه غنی (`src/utils/storage.ts`).

**Reason:**
دستیابی به سرعت اجرایی بسیار بالا، عدم نیاز به راه‌اندازی سرور پایگاه داده پیچیده در فاز پروتیوتایپ و تست، و امکان بارگذاری فوری تمام نقش‌های سازمانی و سناریوهای تایید بدون تأخیر شبکه.

**Impact:**
تمامی عملیات CRUD، مدیریت کاربران، نقش‌های دوگانه و کارتابل‌های تایید به‌صورت بلادرنگ در مرورگر کاربر اجرا و ذخیره می‌شوند.

---

### Date: 2026-08-02

**Decision:**
پیاده‌سازی موتور تایید متوالی (`Approval Chain`) به همراه مکانیزم «نقش دوگانه» (`isDualRole`) و «سرپرست ارشد خزانه‌داری» (`isSeniorTreasurySupervisor`).

**Reason:**
پوشش نیازهای پیچیده سازمانی که در آن برخی مدیران هم‌زمان درخواست‌کننده و تاییدکننده هستند و نیاز است درخواست‌های شخصی آن‌ها مسیر عادی را دور زده و مستقیماً به خزانه‌داری ارشد ارسال شود.

**Impact:**
انعطاف‌پذیری فوق‌العاده‌ای در کارتابل مدیران ایجاد کرده و از ایجاد بن‌بست در تایید درخواست‌های شخصی مدیران جلوگیری می‌کند.

---

### Date: 2026-08-02

**Decision:**
استفاده از Tailwind CSS v4 به همراه کامپوننت‌های ماژولار و آیکون‌های `lucide-react`.

**Reason:**
تمرکز بر طراحی مدرن، ریسپانسیو، سازگار با محیط‌های اداری، و تفکیک تمیز کدهای رابط کاربری بدون وابستگی به کتابخانه‌های سنگین و پیچیده UI.

**Impact:**
سهولت در نگهداری کدها، سرعت بارگذاری بالا و ارائه ظاهر کاملاً حرفه‌ای و متناسب با استانداردهای سازمانی ERP.

---

### Date: 2026-08-03

**Decision:**
۱. **تفکیک کامل کارتابل‌ها به دو بخش «باز (در انتظار اقدام)» و «بسته شده (نهایی‌شده)»**:
در تمامی کارتابل‌ها (درخواست‌های من، کارتابل ارجاع‌شده‌ها، و کارتابل تایید و پرداخت خزانه‌داری) دو زیرتب مجزای «باز» (مربوط به پرونده‌های جاری در دست جریان) و «بسته» (مربوط به پرونده‌های واریز شده، اتمام یافته یا رد شده) پیاده‌سازی شد.

۲. **قانون ارجاع اختصاصی (`Referral / Specific Approver Assignment Routing`)**:
اگر پرونده‌ای به صورت مستقیم به یک شخص خاص ارجاع داده شده باشد (`currentApproverId`)، پرونده فقط برای خود آن شخص (و مدیر ارشد سیستم) در کارتابل باز نمایش داده می‌شود و از دید سایر همکاران خارج می‌گردد. همچنین کاربرانی که خودشان قبلاً روی یک پرونده اقدامی انجام داده باشند، همواره در بخش بسته سوابق آن را مشاهده می‌کنند.

۳. **جستجوی سراسری پیشرفته (Full-Field Universal Form Search)**:
کادر جستجوی بالای تمام فرم‌ها ارتقا یافت تا بتواند بر اساس تمامی فیلدهای موجود در درخواست (کد پیگیری، عنوان، نام متقاضی، نام شرکت، مرکز هزینه/شعبه، نام ذینفع، شماره کارت، شماره شبا، بانک، مبلغ عددی، مبلغ به حروف، و شرح درخواست) جستجو کند.

۴. **طراحی نمای جدولی فشرده و باریک (`Compact Slim Table Layout`)**:
برای بالا بردن کارایی و ارگونومی رابط کاربری، نمای جدولی با ردیف‌های باریک، فونت یکدست و نمایش دائمی و خوانای شرح درخواست بدون نیاز به هاور شناور پیاده‌سازی شد و امکان سوئیچ بین نمای باریک جدولی و نمای کارت پرجزئیات فراهم گردید.

۵. **کنترل تفکیک‌شده و گرانولار دسترسی ثبت درخواست جدید (`Granular Create Request Permission Overrides`)**:
مجوز ایجاد و ثبت درخواست پرداخت جدید (`canCreateRequests`) به صورت کامل از نقش پایه کاربر مستقل شد. مدیر ارشد سیستم اکنون می‌تواند در فرم ویرایش کاربر، این دسترسی را برای هر کاربری (فارغ از این‌که نقش اصلی‌اش تاییدکننده مالی، مجری واریز، سرپرست شعبه یا پشتیبان است) به صورت صریح فعال یا غیرفعال کند. همچنین تمامی کاربران دارنده درخواست‌های عودت داده شده («نیازمند اصلاح») فارغ از وضعیت این مجوز، همواره دسترسی اصلاح و ارسال مجدد پرونده عودتی خود را دارا خواهند بود.

۶. **تفکیک دقیق دسترسی کارهای محوله و فیلترینگ لیست ارجاع (`Strict Task Directives Access & Assignee Filtering`)**:
بخش «کارهای محوله و دستورات» و منوی کناری آن صرفاً برای کاربرانی نمایش داده می‌شود که صراحتاً دارای دسترسی صدور (`canIssueTasks`) یا اجرا (`canExecuteTasks`) باشند. کاربران فاقد این دسترسی حتی گزینه مربوطه را در منوی خود مشاهده نخواهند کرد. همچنین در فرم ایجاد یا ویرایش کار محوله، لیست کشویی ارجاع به همکاران (`eligibleAssignees`) صرفاً پرسنلی را نمایش می‌دهد که دارای دسترسی اجرای کار (`canExecuteTasks`) باشند؛ در نتیجه کاربرانی که فقط دسترسی صدور دارند در لیست گیرندگان دستور نمایش داده نمی‌شوند.

---

### Date: 2026-08-04

**Decision:**
تکمیل قابلیت «تایید ردیف‌به‌ردیف» برای درخواست‌های پرداخت تجمیعی (`Batch Request Row-Level Approval`):
۱. فیلد اختیاری `batchItems?: RequestBatchItem[]` به اینترفیس `PaymentRequest` در `src/types.ts` اضافه شد (بدون تغییر یا تغییر نام هیچ فیلد دیگری از این اینترفیس).
۲. در `RequestDetailModal.tsx`، وقتی درخواست دارای `batchItems` باشد، جدول ردیف‌ها (عنوان، مبلغ، ذینفع، شماره کارت/شبا، وضعیت) نمایش داده می‌شود. مسئول فعلی درخواست (`isCurrentResponsibleParty` با نقش تاییدکننده/مدیر خزانه‌داری/مجری خزانه‌داری) می‌تواند هر ردیف `pending` را «تایید» یا (با ذکر دلیل اجباری) «رد» کند و ردیف‌های `approved`/`rejected` را با دکمه «بازگشت از تایید/رد» به حالت `pending` برگرداند.
۳. دکمه سراسری «تایید و ارجاع» تا زمانی که همه ردیف‌های `batchItems` از وضعیت `pending` خارج نشوند غیرفعال است و پیام راهنما نمایش می‌دهد؛ برای درخواست‌های بدون `batchItems` رفتار قبلی بدون هیچ تغییری حفظ شده است.

**Reason:**
درخواست‌های تجمیعی (چند فاکتور/ذینفع در یک درخواست) نیاز داشتند که تاییدکننده بتواند هر ردیف را جداگانه بررسی و تایید/رد کند (مثلاً برخی فاکتورهای یک تامین‌کننده تایید و برخی دیگر رد شوند) پیش از آنکه کل درخواست به مرحله بعد ارجاع داده شود؛ پیش از این تغییر، تایپ و state لازم برای این قابلیت در کد وجود داشت اما به هیچ UI یا منطقی متصل نشده بود.

**Impact:**
تاییدکنندگان اکنون کنترل دقیق‌تری روی درخواست‌های تجمیعی دارند و امکان ارجاع ناخواسته درخواستی با ردیف‌های تعیین‌تکلیف‌نشده وجود ندارد. این تغییر مستقل از گردش کار اصلی (`timeline`) است و هیچ رفتار موجودی در درخواست‌های غیرتجمیعی یا سایر بخش‌های سیستم را تغییر نمی‌دهد.

---

### Date: 2026-08-04

**Decision:**
رفع دو باگ در «کارتابل تایید و پرداخت»:
۱. **اصلاح مرتب‌سازی بر اساس تاریخ واقعی**: در `src/components/ApprovalInboxView.tsx`، مرتب‌سازی «جدیدترین»/«قدیمی‌ترین» که قبلاً با `localeCompare` روی `request.id` انجام می‌شد (نامعتبر، چون شناسه‌های داده نمونه لزوماً هم‌راستا با ترتیب زمانی نیستند)، با تابع کمکی جدید `jalaliDateToComparable` جایگزین شد که رشته شمسی `createdAt` (فرمت `YYYY/MM/DD - HH:MM`) را به یک مقدار عددی قابل‌مقایسه (سال × ۱۰۸ + ماه × ۱۰۶ + روز × ۱۰۴ + ساعت × ۱۰۲ + دقیقه) تبدیل می‌کند. مرتب‌سازی بر اساس مبلغ (`amount_desc`/`amount_asc`) بدون تغییر باقی ماند. بررسی شد که `ApprovalInboxView` تنها کامپوننت مشترک دسترسی‌های `approve_branch_request`/`approve_treasury`/`execute_payment` است و `AssignedTasksView.tsx` هیچ پیاده‌سازی یا مرتب‌سازی مجزایی برای همین کارتابل ندارد؛ در نتیجه اصلاح همین یک فایل برای هر سه سطح دسترسی کافی است. (یادداشت جانبی: باگ مشابه در `MyRequestsView.tsx` — ماژول «درخواست‌های من»، خارج از محدوده همین درخواست — نیز مشاهده شد و باید در تسکی جداگانه بررسی شود.)
۲. **نمایش کارتابل برای کاربر دورشغلی**: در `src/components/Sidebar.tsx`، تابع `hasAccess` اصلاح شد تا وقتی `required` شامل `approve_branch_request`/`approve_treasury`/`execute_payment` باشد و `currentUser.isDualRole === true` باشد، دسترسی به آیتم منوی «کارتابل تایید و پرداخت» صرف‌نظر از پرمیشن‌های نقش پایه کاربر مجاز شود. فیلد `isDualRole` در `types.ts` و ساختار `approvalChain`/`allowedApproverIds` بدون تغییر باقی ماندند؛ فقط نحوه چک‌شدن در `Sidebar.tsx` اصلاح شد.

**Reason:**
مرتب‌سازی بر اساس `id` رشته‌ای، ترتیب نمایش درخواست‌ها را در کارتابل تایید و پرداخت غیرقابل‌اعتماد می‌کرد. همچنین کاربران دورشغلی (`isDualRole = true`) با وجود نیاز احتمالی به بررسی درخواست‌های ارجاع‌شده به خودشان، به دلیل نداشتن پرمیشن نقش پایه، اصلاً آیتم منوی کارتابل تایید و پرداخت را نمی‌دیدند.

**Impact:**
ترتیب نمایش در هر سه زیرتب کارتابل (نیازمند اقدام من / در حال پیگیری سایرین / سوابق) اکنون واقعاً از جدیدترین به قدیمی‌ترین (یا برعکس) بر اساس تاریخ ثبت واقعی است. کاربران دورشغلی اکنون آیتم «کارتابل تایید و پرداخت» را در منو می‌بینند. هیچ منطق فیلترینگ داخلی موجود برای `isDualRole` در `ApprovalInboxView`/`DashboardView`/`ArchiveView` تغییر نکرده است.

---

### Date: 2026-08-04

**Decision:**
بازبینی کامل داده نمونه کاربران و نقش‌ها در `src/utils/storage.ts` (`DEFAULT_USERS`, `DEFAULT_ROLES`, `DEFAULT_ROLE_ID_MAP`, `DEFAULT_COST_CENTERS`) و اصلاح سه ناسازگاری واقعی که پیدا شد (بدون تغییر تعداد یا `id` کاربران/نقش‌ها):
۱. `user_admin_reza.allowedCostCenterIds` شامل سه شناسه نامعتبر بود (`cc_mokhberi1`، `cc_mokhberi2`، `cc_fechar`) که در `DEFAULT_COST_CENTERS` وجود نداشتند؛ به `cc_mokhberi_1`، `cc_mokhberi_4` و `cc_fakhar` (شناسه‌های واقعی موجود) اصلاح شد.
۲. `user_approver_sales.allowedCostCenterIds` همان دو شناسه نامعتبر (`cc_mokhberi1`، `cc_mokhberi2`) را داشت؛ به `cc_mokhberi_1` و `cc_mokhberi_4` اصلاح شد. این ناسازگاری عملاً باعث می‌شد مدیر فروش شعب به شعب مخبری هیچ دسترسی واقعی نداشته باشد چون شناسه‌ها هرگز match نمی‌شدند.
۳. `user_requestor_poonak.approvalChain` با `id` خودِ همین کاربر (`user_requestor_poonak`) شروع می‌شد. چون `NewRequestModal.tsx` مقدار `currentApproverId` درخواست تازه ثبت‌شده را مستقیماً از عنصر اول `approvalChain` می‌گیرد و نقش `requestor` اجازه «تایید و ارجاع» ندارد، هر درخواست تازه این کاربر برای همیشه در وضعیت بلاتکلیف باقی می‌ماند و اصلاً به کارتابل `user_approver_sales` (مدیر شعبه بالادستی) نمی‌رسید. عنصر اول حذف و به `['user_approver_sales', 'user_admin_reza', 'user_treasury_exec']` اصلاح شد — دقیقاً همان زنجیره پیش‌فرض «شعبه → مدیر شعبه → خزانه‌داری → اجرا» که در سایر جای‌های کد (`WorkflowChartView.tsx`, `AdminPanel.tsx`) به‌عنوان مقدار پیش‌فرض استفاده می‌شود.

موارد بررسی‌شده و **بدون نیاز به اصلاح** (تایید شد که سالم هستند): `roleId` هر ۶ کاربر به‌درستی روی `DEFAULT_ROLE_ID_MAP` یا یک `SystemRole` موجود resolve می‌شود؛ `allowedApproverIds` همه کاربران فقط به `id`های واقعی اشاره دارند؛ خودارجاعی `user_admin_reza.approvalChain[0]` و `user_approver_sales.approvalChain[0]` (پیش از اصلاح بالا) عمداً حفظ شد چون این دو نقش (`admin`/`approver`) اجازه «تایید و ارجاع» روی خودشان را دارند و داده نمونه `req_10002` همین الگوی خودتاییدی-سپس-ارجاع را برای ادمین به‌صراحت نشان می‌دهد؛ `companyId`/`costCenterId` هر ۶ کاربر با یکدیگر و با `DEFAULT_COMPANIES`/`DEFAULT_COST_CENTERS` سازگارند.

یافته خارج از محدوده (گزارش شد، اصلاح **نشد** چون به `DEFAULT_USERS` مربوط نیست): در `DEFAULT_TASKS`، دستور کار `task_1` به `assigneeId: 'user_approver_saadatabad'` اشاره دارد که اصلاً در `DEFAULT_USERS` وجود ندارد (یک کاربر شبح/phantom). این باید در یک تسک جداگانه بررسی و یا آن کاربر به `DEFAULT_USERS` اضافه شود یا `assigneeId` به یکی از کاربران واقعی اصلاح شود.

**Reason:**
شناسه‌های نامعتبر در `allowedCostCenterIds` به‌صورت خاموش (بدون خطا) باعث محدودشدن دسترسی واقعی کاربر می‌شدند و در `AdminPanel.tsx` به‌صورت شناسه خام به‌جای نام شعبه نمایش داده می‌شدند. خودارجاعی در ابتدای `approvalChain` یک `requestor` مسیر رسمی «شعبه → مدیر شعبه → خزانه‌داری» را می‌شکست و باعث گیرکردن دائمی درخواست در کارتابلی می‌شد که هیچ‌کس اجازه پردازش آن را نداشت.

**Impact:**
دسترسی مدیر فروش شعب (`user_approver_sales`) به شعب مخبری یک و چهار اکنون واقعی است. درخواست‌های تازه مسئول خرید شعبه پونک (`user_requestor_poonak`) اکنون درست به کارتابل مدیر فروش شعب می‌رسند، نه به کارتابل بلاتکلیف خودِ درخواست‌کننده. نمایش شعب مجاز ادمین در `AdminPanel.tsx` دیگر شناسه خام نشان نمی‌دهد. هیچ `id` کاربر/نقشی تغییر نکرد و ساختار `approvalChain`/`allowedApproverIds` بازطراحی نشد — فقط مقادیر داخل آن‌ها اصلاح شد.

---

### Date: 2026-08-04

**Decision:**
گسترش فرم ویرایش درخواست (`isEditing` در `src/components/RequestDetailModal.tsx`) برای پشتیبانی از ویرایش ردیفی درخواست‌های تجمیعی:
۱. یک state جدید `editBatchItems` (آرایه‌ای از `{id, title, amount, destinationName, destinationCard}`) و مقدار مشتق‌شده `isBatchEditMode = hasBatchItems && canEditOrDeleteInitial` اضافه شد. `canEditOrDeleteInitial` عیناً بدون تغییر باقی ماند؛ فقط به‌عنوان یکی از دو شرط `isBatchEditMode` استفاده شد.
۲. در JSX فرم ویرایش، وقتی `isBatchEditMode` باشد، به‌جای فرم تک‌فیلدی عنوان/مبلغ/کارت/صاحب‌حساب، یک فرم ردیفی رندر می‌شود که هر ردیف `batchItems` را با فیلدهای عنوان، مبلغ، نام ذینفع و شماره کارت/شبا به‌صورت مستقل قابل‌ویرایش نمایش می‌دهد.
۳. در `handleSaveEdit`، شاخه `isBatchEditMode` مبلغ کل و مبلغ‌به‌حروف را از مجموع ردیف‌های ویرایش‌شده بازمحاسبه می‌کند (با `numberToPersianWords`، مشابه منطق `batchTotalAmount`/`amountWords` در `NewRequestModal.tsx`) و فقط `amount`, `amountInWords`, `batchItems`, `status`, `updatedAt`, `timeline` را روی شیء درخواست به‌روزرسانی می‌کند؛ فیلدهای دیگر هر ردیف (`status`, `decidedByUserId`, `decidedByName`, `decidedAt`, `rejectionReason`) دست‌نخورده باقی می‌مانند. شاخه غیر-batch (فرم تک‌فیلدی قبلی) بدون کوچک‌ترین تغییری باقی ماند.
۴. برای درخواست تجمیعی در وضعیت `returned` (`canEditOrDeleteReturned` نه `canEditOrDeleteInitial`)، طبق درخواست صریح کاربر، فرم ردیفی نمایش داده نمی‌شود و همان فرم تک‌فیلدی قبلی استفاده می‌شود — یک محدودیت شناخته‌شده که در صورت نیاز باید در تسک جداگانه‌ای گسترش یابد.

**Reason:**
درخواست‌کننده باید بتواند پیش از هر اقدام تاییدکننده، جزئیات هر ردیف یک درخواست تجمیعی (نه فقط یک عنوان/مبلغ کلی) را اصلاح کند — مثلاً مبلغ یکی از فاکتورها یا شماره کارت یکی از ذینفعان اشتباه ثبت شده باشد — بدون آنکه مجبور شود کل درخواست را حذف و از نو با `NewRequestModal` ثبت کند.

**Impact:**
درخواست‌های تجمیعی پیش از بررسی تاییدکننده، اکنون ردیف‌به‌ردیف قابل اصلاح‌اند و مبلغ کل درخواست همیشه با مجموع واقعی ردیف‌ها همگام می‌ماند. `request.id` و `request.trackingCode` در هیچ مسیری تغییر نمی‌کنند (هر دو شاخه از `{...request, ...}` استفاده می‌کنند و هیچ‌کدام این دو فیلد را override نمی‌کند). `isDualRole`, `approvalChain`, `allowedApproverIds` و هیچ اینترفیسی در `types.ts` دست نخوردند؛ منطق `canEditOrDeleteInitial` هم بدون تغییر باقی ماند.

---

### Date: 2026-08-04

**Decision:**
افزودن قابلیت «اصلاح مبلغ توسط تاییدکننده هنگام تایید و ارجاع» در `src/components/RequestDetailModal.tsx`:
۱. فیلد اختیاری جدید `amountCorrectionNote?: string` به اینترفیس `RequestTimelineStep` در `src/types.ts` اضافه شد (بدون rename یا حذف هیچ فیلد دیگری از این اینترفیس یا هر اینترفیس دیگر).
۲. یک state جدید `correctedAmount` اضافه شد که هنگام باز شدن مودال/تغییر درخواست، همیشه با `request.amount` فعلی همگام می‌شود (مقدار پیش‌فرض = مبلغ فعلی). یک فیلد ورودی «اصلاح مبلغ (اختیاری)» داخل همان کارت «۱. ارجاع به همکار/مجری بعدی» — دقیقاً کنار دکمه «تایید و ارجاع» — اضافه شد و فقط داخل شرط `canApproveAndForward` رندر می‌شود (یعنی فقط تاییدکننده فعلی/مسئول فعلی درخواست آن را می‌بیند؛ درخواست‌کننده و نقش‌های دیگر اصلاً این فیلد را نمی‌بینند).
۳. `handleApproveAndForward` اکنون بررسی می‌کند آیا `correctedAmount` با `request.amount` فرق دارد؛ اگر بله و مقدار جدید معتبر (بزرگ‌تر از صفر) باشد، `amount` و `amountInWords` (با `numberToPersianWords`) روی درخواست به‌روزرسانی می‌شوند و همان گام `forwarded` که به `timeline` اضافه می‌شود، فیلد `amountCorrectionNote` را با متنی شامل مبلغ قبلی و مبلغ جدید پر می‌کند. اگر تاییدکننده فیلد را دست‌نخورده رها کند (شامل درخواست‌های `info_request` با `amount=0`)، هیچ اعتبارسنجی یا تغییری اعمال نمی‌شود و رفتار دقیقاً مثل قبل است. `commentText` (یادداشت آزاد) کاملاً مستقل و بدون تغییر باقی ماند.
۴. برای درخواست‌های تجمیعی (`request.batchItems` غیرخالی)، این اصلاح فقط `amount`/`amountInWords` سطح کل درخواست را تغییر می‌دهد؛ `batchItems` در این مسیر اصلاً spread/override نمی‌شود، پس هیچ تداخلی با قابلیت «تایید ردیف‌به‌ردیف» (وضعیت `pending`/`approved`/`rejected` هر ردیف) ایجاد نمی‌شود.
۵. در بخش «تاریخچه و سوابق گردش کار»، اگر گامی `amountCorrectionNote` داشته باشد، در یک کادر جداگانه کهربایی (زیر یادداشت معمولی `comment`، در صورت وجود) نمایش داده می‌شود.

**Reason:**
تاییدکننده هنگام بررسی درخواست ممکن است متوجه شود مبلغ ثبت‌شده توسط درخواست‌کننده اشتباه یا نیازمند اصلاح جزئی است (مثلاً گرد کردن، خطای تایپی، یا مبلغ نهایی فاکتور که کمی متفاوت است) و پیش از این قابلیت، تنها راه اصلاح، عودت کامل درخواست به درخواست‌کننده برای ویرایش و ارسال مجدد بود که فرایند تایید را کند می‌کرد. این قابلیت اجازه می‌دهد تاییدکننده مبلغ را همان لحظه، با ثبت شفاف مبلغ قبلی/جدید در تاریخچه، اصلاح و درخواست را ارجاع دهد.

**Impact:**
تاییدکنندگان اکنون می‌توانند بدون عودت درخواست، مبلغ را در لحظه تایید و ارجاع اصلاح کنند و این اصلاح به‌طور کامل و شفاف در تایم‌لاین درخواست (مبلغ قبل/بعد) ثبت می‌شود. این قابلیت فقط در `handleApproveAndForward` فعال است، نه در «تایید نهایی خزانه‌داری» یا «تایید واریز». `forwardTargetUsers`/`selectedForwardUserId` و منطق انتخاب نفر بعدی زنجیره کاملاً دست‌نخورده ماندند؛ `isDualRole`, `approvalChain`, `allowedApproverIds` نیز تغییر نکردند.

---

### Date: 2026-08-04

**Decision:**
تبدیل مدل ناوبری برنامه از یک متغیر تک‌مقصدی (`activeTab` + رندر شرطی `activeTab === 'x' && (<Component/>)` که با هر جابه‌جایی، View فعلی را کاملاً unmount و View جدید را از صفر mount می‌کرد) به یک **سیستم چندتبی شبیه مرورگر** (شاخه `feature/multi-tab-navigation`، مستقل از `feature/multi-role-permissions`):

۱. **مدل داده در `src/App.tsx`**: state `openTabs: { id: string; label: string }[]` و `activeTabId: string` جایگزین `activeTab` قدیمی شدند. تابع `openTab(tabId, label?)` اگر تب از قبل باز بود فقط آن را فعال می‌کند (بدون تکرار)، وگرنه به انتهای لیست اضافه و فعال می‌کند؛ اگر `label` داده نشود، از رجیستری مشترک `TAB_DEFINITIONS` resolve می‌شود. تابع `closeTab(tabId)` تب را حذف می‌کند و اگر تب فعال بسته شود، تب سمت چپش (یا تب بعدی اگر اولین بود) فعال می‌شود؛ اگر لیست خالی شود، `dashboard` دوباره باز می‌ماند. `dashboard` همیشه اولین تب و هرگز از طریق `closeTab` قابل‌بستن نیست.

۲. **الگوی mount/hide**: در بخش «Main Content View» در `App.tsx`، رندر شرطی سراسری با `openTabs.map(...)` جایگزین شد؛ هر View داخل `<div key={tab.id} style={{ display: activeTabId === tab.id ? 'block' : 'none' }}>` قرار گرفت. فقط Viewهایی که واقعاً در `openTabs` حضور دارند mount می‌شوند (نه هر ۱۸ تا از ابتدا)، ولی تا وقتی تبشان باز است، با تغییر تب فعال unmount نمی‌شوند — فقط با CSS مخفی می‌شوند. نتیجه: اسکرول، فیلترهای انتخاب‌شده (مثلاً در `ArchiveView`) و فرم‌های نیمه‌پرشده هر تب، هنگام سوییچ بین تب‌ها حفظ می‌شوند.

۳. **کامپوننت جدید `src/components/TabBar.tsx`**: نوار تب بالای محتوای اصلی (زیر `Navbar`)، هماهنگ با تم slate/emerald پروژه. هر تب آیکون (از رجیستری صادرشده `TAB_DEFINITIONS`، هم‌راستا با آیکون‌های همان شناسه در `Sidebar.tsx`) + عنوان کوتاه دارد؛ تب فعال با پس‌زمینه/بوردر emerald متمایز می‌شود؛ هر تب به‌جز `dashboard` یک دکمه × برای بستن دارد؛ نوار در صورت پرشدن، افقی اسکرول می‌شود (`overflow-x-auto`) نه اینکه بشکند.

۴. **مهاجرت همه‌ی نقاط ناوبری**: پراپ `setActiveTab` در `Sidebar.tsx` و `Navbar.tsx` با `onOpenTab(tabId, label?)` جایگزین شد و هر فراخوانی داخلی آن دو فایل (کلیک روی آیتم منو، لوگو، دفترچه، خدمات پس از فروش، نامه‌ها، کلیه مکاتبات، کاربران/همکاران، نقش‌ها و دسترسی‌ها) به `onOpenTab(id, label)` تبدیل شد؛ `label` از همان متن/`title` موجود در `Sidebar.tsx` گرفته شده. در `App.tsx`، `handleImpersonateUser`, `handleExitImpersonation`, `handleSelectNotificationColleague`, و `onNavigateTab` پاس‌شده به `DashboardView` هم به `openTab` تبدیل شدند (بعضی بدون `label` صریح، با اتکا به fallback رجیستری). منطق `hasAccess` و شرط نمایش هیچ آیتم منویی در `Sidebar.tsx` تغییر نکرد.

۵. **رفع یک نشتی دسترسی که خودِ این تغییر ایجاد می‌کرد**: چون تب‌ها mount شده باقی می‌مانند، اگر هویت کاربر عوض شود (شبیه‌سازی دسترسی ادمین، خروج از شبیه‌سازی، یا خروج/ورود مجدد) بدون خالی‌کردن `openTabs`، یک تب باقی‌مانده از هویت قبلی (مثلاً تب پنل ادمین که با `hasAccess` برای کاربر جدید اصلاً در منو دیده نمی‌شود) هنوز در نوار تب قابل‌کلیک می‌ماند — چون انتخاب یک تبِ ازقبل‌باز (`onSelectTab`) دوباره چک دسترسی انجام نمی‌دهد. برای همین یک تابع `resetTabsToDashboard()` اضافه شد که در تمام نقاط تغییر هویت (`handleImpersonateUser`, `handleExitImpersonation`, هر دو `onLoginSuccess` مودال ورود، و `onLogout`) پیش از باز کردن تب مقصد جدید، `openTabs` را به «فقط dashboard» برمی‌گرداند.

**Reason:**
مدل قدیمی با هر جابه‌جایی بین بخش‌ها، View فعلی را کامل نابود می‌کرد؛ در نتیجه اسکرول، فیلترهای جستجوی پیشرفته، مبلغ‌های نیمه‌واردشده در فرم درخواست جدید، و مثل آن، با هر کلیک روی سایدبار از بین می‌رفت. کاربران (به‌خصوص خزانه‌داران و تاییدکنندگانی که هم‌زمان چند بخش را زیر نظر دارند) نیاز داشتند بتوانند بین چند بخش سوییچ کنند بدون از دست دادن کاری که در هرکدام در حال انجام بودند — دقیقاً مثل تب‌های مرورگر.

**Impact:**
سوییچ بین تب‌های باز، state داخلی هر View (فیلتر، جستجو، اسکرول، فرم نیمه‌کاره) را کامل حفظ می‌کند؛ تایید شد با باز کردن چند تب هم‌زمان (مثل «جستجوی پیشرفته و خروجی» با فیلتر شرکت/جستجوی متنی تنظیم‌شده) و سوییچ به تب دیگر و بازگشت. `dashboard` همیشه حداقل به‌عنوان یک تب باز و بدون دکمه بستن باقی می‌ماند — تایید شد. یک نشتی دسترسی بالقوه (تب باقی‌مانده از هویت قبلی پس از شبیه‌سازی/خروج) شناسایی و در همین تغییر رفع شد. هیچ اینترفیسی در `types.ts` تغییر نکرد؛ `isDualRole`, `approvalChain`, `allowedApproverIds` و منطق `hasAccess` در `Sidebar.tsx` کاملاً دست‌نخورده ماندند.

---

### Date: 2026-08-04

**Decision:**
بازطراحی بخش «ویرایش کاربر و تعیین دسترسی» در `src/components/AdminPanel.tsx` به یک **مدل چندنقشی قابل‌تنظیم** (شاخه `feature/multi-role-permissions`):

۱. **دو فیلد اختیاری جدید روی `User`** در `src/types.ts` (بدون rename/حذف هیچ فیلد یا اینترفیس موجودی):
   - `additionalRoleIds?: string[]` — نقش‌های سیستمی اضافه‌ای که ادمین علاوه بر نقش پایه (`role`/`roleId`) برای کاربر فعال کرده.
   - `roleAccessOverrides?: { roleId: string; permissions: SystemPermission[] }[]` — برای یک `roleId` مشخص، لیست پرمیشن آن نقش را **فقط برای همین کاربر** به‌طور کامل جایگزین می‌کند (نه merge).

۲. **`src/utils/permissions.ts` (فایل جدید)**: تابع `getEffectiveUserPermissions(user, roles)` که پرمیشن‌های نقش پایه + همه `additionalRoleIds` را جمع می‌کند، `roleAccessOverrides` را per-role اعمال می‌کند (اگر برای آن `roleId` override ثبت شده باشد، جایگزین کامل؛ وگرنه `SystemRole.permissions` پیش‌فرض)، و در آخر `customPermissions` را هم اضافه می‌کند.

۳. **`AdminPanel.tsx`**: سه بخش قدیمی («تعیین نقش کاربر در ماژول دستورات اداری و کارهای محوله»، «دسترسی‌های تکمیلی (فراتر از نقش پایه)»، و تیک دستی «نقش دوگانه») با یک بخش یکپارچه «نقش‌های چندگانه و دسترسی‌های تفکیکی این کاربر» جایگزین شدند:
   - چک‌لیست تمام `roles` (نقش پایه همیشه تیک‌خورده و غیرقابل‌حذف؛ بقیه در `additionalRoleIds`).
   - برای هر نقش تیک‌خورده، پنل قابل‌بازشدنی با چک‌باکس تمام ۲۰ پرمیشن سیستم (`ALL_PERMISSIONS`، که از `RolesAndPermissionsView.tsx` export شد تا در هر دو فایل یک منبع واحد استفاده شود) که در `roleAccessOverrides` آن نقش ذخیره می‌شود.
   - دو چک‌باکس مستقل و فشرده `canIssueTasks`/`canExecuteTasks` (قابل override دستی) که با هر تغییر در نقش‌های انتخابی، مقدار پیشنهادی خودکار می‌گیرند (`deriveTaskAccessFromRoles`).
   - بخش «۲. تعیین مراحل تایید درخواست‌های ارسالی» (`approvalChain`/`allowedApproverIds`) و بخش «شعب و مراکز مجاز» (`allowedCostCenterIds`) کاملاً دست‌نخورده باقی ماندند.
   - چک‌باکس دستی `isSeniorTreasurySupervisor` به یک بخش مستقل و کوچک منتقل شد (رفتارش عوض نشد؛ فقط از داخل جعبه قدیمی «نقش دوگانه» بیرون کشیده شد چون آن جعبه حذف شد).
   - در `handleSaveUser`: اگر ترکیب نقش‌های انتخاب‌شده (`role`/`roleId` + `additionalRoleIds`) هم شامل یک نقش «درخواست‌کننده-مانند» (`role_purchaser` یا `role === 'requestor'`) و هم یک نقش «تاییدکننده-مانند» (`role_branch_approver`, `role_treasury_manager` یا `role === 'approver'`) باشد، `isDualRole` خودکار `true` ذخیره می‌شود (`deriveIsDualRoleFromRoles`)، وگرنه `false`. چک‌باکس دستی `isDualRole` حذف شد؛ یک نشان زنده («نقش دوگانه (خودکار)») در فرم مقدار محاسبه‌شده فعلی را نمایش می‌دهد.

۴. **`Sidebar.tsx`**: محاسبه دستی `effectivePermissions` (که مستقیماً `roleId` تنها را lookup می‌کرد) با فراخوانی `getEffectiveUserPermissions(currentUser, roles)` جایگزین شد؛ حالت bypass ادمین (`isAdmin → return null`) دقیقاً همان‌جا و همان‌طور باقی ماند. `ApprovalInboxView.tsx`, `DashboardView.tsx`, `ArchiveView.tsx` در این مرحله دست‌نخورده ماندند (طبق دستور صریح کاربر) — مهاجرت آن‌ها به `getEffectiveUserPermissions` یک تسک بعدی است.

**Reason:**
نیاز به این بود که یک کاربر بتواند هم‌زمان بیش از یک نقش سازمانی داشته باشد (مثلاً هم درخواست‌کننده هم تاییدکننده یک شعبه دیگر) و برای هرکدام از آن نقش‌ها، دسترسی‌های ریزدانه‌ای مستقل از تعریف پیش‌فرض نقش تنظیم شود — چیزی که مدل قدیمی تک‌نقشی + یک لیست کوچک ۵تایی `customPermissions` پوشش نمی‌داد. این تغییر به‌صراحت توسط کاربر مجاز شد که رفتار `isDualRole` را خودکار از روی نقش‌های چندگانه derive کند، به شرطی که فیلد `isDualRole` و تمام چک‌های موجودش در پروژه معتبر و دست‌نخورده بمانند.

**Impact:**
ادمین اکنون می‌تواند به یک کاربر چند نقش هم‌زمان بدهد و برای هرکدام پرمیشن‌های اختصاصی تعریف کند، بدون آنکه نقش پایه یا `SystemRole` مشترک بین کاربران دیگر تغییر کند. `isDualRole` دیگر منبع خطای انسانی (فراموشی تیک زدن) ندارد — همیشه با واقعیتِ نقش‌های انتخابی سینک است. هیچ کاربر نمونه‌ای در `DEFAULT_USERS` تغییر نکرد: چون هیچ‌کدام `additionalRoleIds`/`roleAccessOverrides` ندارند، `getEffectiveUserPermissions` برایشان دقیقاً همان مقدار قبلی را برمی‌گرداند و اگر دوباره از `AdminPanel` بدون تغییر نقش ذخیره شوند، `isDualRole` مشتق‌شده هم `false` (مطابق مقدار فعلی همه ۶ کاربر) خواهد بود. `approvalChain`, `allowedApproverIds` و ساختار داده‌شان، و همه اینترفیس‌های `types.ts` دست‌نخورده ماندند — فقط دو فیلد اختیاری جدید اضافه شد.

---

### Date: 2026-08-04

**Decision:**
افزودن ویجت «پرکاربردترین منوهای شما» به داشبورد، بر پایه تابع `openTab` که در تصمیم قبلی (ناوبری چندتبی) ساخته شد:

۱. **`src/utils/storage.ts`**: یک کلید جدید `TAB_USAGE: 'shavaz_treasury_tab_usage_v1'` به شیء `STORAGE_KEYS` اضافه شد (بدون تغییر هیچ‌کدام از ۱۶ کلید موجود). داده به شکل `TabUsageCounts = Record<string, Record<string, number>>` (`{ [userId]: { [tabId]: openCount } }`) ذخیره می‌شود — یک نوع export‌شده جدید، مستقل از `src/types.ts`، چون این داده تله‌متری مصرف UI است نه یک مدل داده اصلی. سه متد جدید به شیء `storage` اضافه شد: `getTabUsage()`, `saveTabUsage()`, و `recordTabUsage(userId, tabId)` (افزایش شمارنده و ذخیره فوری).
۲. **`src/App.tsx`**: داخل تابع `openTab(tabId, label?)`، بلافاصله بعد از `setActiveTabId(tabId)`، اگر `currentUser` وجود داشته باشد `storage.recordTabUsage(currentUser.id, tabId)` صدا زده می‌شود — یعنی هر بار `openTab` فراخوانی شود (چه تب جدید باز شود چه تب موجود فعال شود)، شمارنده (کاربر فعلی + tabId) یک واحد افزایش می‌یابد. چون `onSelectTab` در `TabBar` مستقیماً `setActiveTabId` است نه `openTab`، صرفاً سوییچ بین تب‌های ازقبل‌باز از طریق خودِ نوار تب شمارش نمی‌شود — فقط ورود واقعی به یک منو (از سایدبار/ناوبار/شورتکات) شمرده می‌شود.
۳. **`src/components/DashboardView.tsx`**: `storage.getTabUsage()[currentUser.id]` خوانده می‌شود، روی مقدارها نزولی مرتب و به `TAB_DEFINITIONS` (از `TabBar.tsx`) map می‌شود تا آیکون/عنوان هر تب مشخص شود؛ فقط `tabId`هایی که هنوز در `TAB_DEFINITIONS` وجود دارند نمایش داده می‌شوند (تا یک تب حذف/تغییرنام‌یافته باعث ورودی خراب نشود). حداکثر ۵ مورد نمایش داده می‌شود و ویجت فقط وقتی رندر می‌شود که کاربر حداقل ۳ تب متفاوت باز کرده باشد؛ کلیک روی هر مورد، همان `onNavigateTab` (که در `App.tsx` به `openTab` وصل است) را صدا می‌زند.

**Reason:**
کاربرانی که هر روز چند بخش مشخص از سیستم (مثلاً کارتابل تایید، آرشیو، و شعب) را باز می‌کنند، مجبور بودند هر بار از نو در سایدبار دنبال همان مسیرهای همیشگی بگردند. یک میان‌بر شخصی‌سازی‌شده و خودکار (بدون نیاز به تنظیم دستی favorite) این مسیر را کوتاه می‌کند.

**Impact:**
هر کاربر یک ویجت اختصاصی و شخصی‌سازی‌شده بر اساس رفتار واقعی خودش می‌بیند؛ داده‌ها per-user هستند (کاربران دیگر شمارنده همدیگر را نمی‌بینند). برای کاربر تازه یا کم‌سابقه (کمتر از ۳ تب متفاوت)، داشبورد کاملاً بدون خطا و بدون ویجت خالی/عجیب رندر می‌شود — با یک session ادمین بدون سابقه (`localStorage` خالی) تایید شد. `STORAGE_KEYS` موجود، `types.ts`، `isDualRole`، `approvalChain`، `allowedApproverIds` دست‌نخورده ماندند (با بررسی diff تایید شد).

---

### Date: 2026-08-04

**Decision:**
پیاده‌سازی گام اول ماژول فروش: موجودیت «مشتری» (`Customer`) با شناسایی یکتا بر اساس شماره‌تلفن، قفل مالکیت پویا، و دید سلسله‌مراتبی فروش (طبق تصمیمات مستندشده در `docs/SALES_ARCHITECTURE_DRAFT.md`):

۱. **`src/types.ts`**: اینترفیس جدید `Customer` (`id`, `fullName?`, `phone1?` به‌عنوان کلید شناسایی یکتا، `phone2?`, `address?`, `province?`, `city?`, `postalCode?`, `createdAt`, `activityLog?`) و `CustomerActivityLogEntry` (`salespersonId`, `invoiceId?`, `startedAt`, `status: 'active'|'completed'`). فیلد جدید اختیاری `User.salesSupervisorId` (زنجیره‌ی سرپرستی فروش، مستقل از `approvalChain`/`allowedApproverIds`). مقدار جدید `'sales_access'` به یونیون `SystemPermission` اضافه شد. هیچ اینترفیس/فیلد موجودی rename یا حذف نشد.
۲. **`src/utils/storage.ts`**: کلید مستقل `STORAGE_KEYS.CUSTOMERS`، ثابت `DEFAULT_CUSTOMERS` (خالی — سناریوی قفل مالکیت باید از طریق UI تست شود، نه داده‌ی از پیش‌ساخته)، و متدهای `getCustomers`/`saveCustomers`. سه کاربر نمونه‌ی جدید فروش (`user_sales_person_1` فروشنده، `user_sales_supervisor_1` سرپرست، `user_sales_manager_1` مدیر فروش) به انتهای `DEFAULT_USERS` اضافه شدند — همگی `role: 'requestor'` با `customPermissions: ['sales_access']` (بدون افزودن مقدار جدید به یونیون `UserRole`) و زنجیره‌ی `salesSupervisorId: فروشنده → سرپرست → مدیر`. هیچ‌کدام از ۶ کاربر خزانه‌داری موجود لمس نشدند.
۳. **`src/utils/salesHierarchy.ts` (فایل جدید)**: `getVisibleCustomerIds` (دید سلسله‌مراتبی بر پایه‌ی `salesSupervisorId`)، `findCustomerByPhone` (جستجوی سراسری، مستقل از دید سلسله‌مراتبی)، `getCurrentActiveSalespersonId` (محاسبه‌ی مالکیت فعلی از روی `activityLog` — بدون فیلد ذخیره‌شده)، `canStartNewSale`، `startNewSaleCycle`، و `closeSaleCycle` (بستن دستی/تستی چرخه).
۴. **`src/components/CustomersView.tsx` (فایل جدید)**: فرم جستجو/ثبت بر پایه‌ی شماره تماس با سه حالت (مشتری جدید / مشتری آزاد / مشتری قفل‌شده با پیام شفاف)، نمایش تاریخچه‌ی کامل `activityLog`، دکمه‌ی «شروع چرخه‌ی فروش جدید» و «بستن چرخه‌ی فروش» (فقط برای مالک فعلی)، و لیست «مشتریان قابل‌مشاهده» طبق `getVisibleCustomerIds`.
۵. **`Sidebar.tsx`/`App.tsx`**: آیتم منوی «مشتریان» با `requires: ['sales_access']` (بخش مستقل «گروه فروش»، چون هنوز فقط یک آیتم دارد)؛ `CustomersView` طبق همان الگوی رندر شرطی `activeTab === 'x'` موجود در `App.tsx` اضافه شد.

**Reason:**
اولین گام قابل‌اجرا از `docs/SALES_ARCHITECTURE_DRAFT.md` که در چند گفتگوی طراحی جمع‌آوری شده بود؛ مشتری باید یک رکورد دائمی و متمرکز باشد (بخش ۱۰) و فروشندگان مختلف باید بتوانند در طول زمان با او کار کنند، اما هرگز هم‌زمان دو نفر روی یک مشتری کار نکنند — نیازمند یک مکانیزم قفل صریح بین فروشندگان به‌جای اتکا به هماهنگی دستی.

**Impact:**
فروشنده‌ی B نمی‌تواند برای مشتری‌ای که فروشنده‌ی A چرخه‌ی `active` باز دارد، چرخه‌ی جدید ثبت کند (پیام قفل شفاف نمایش داده می‌شود)؛ پس از بستن چرخه توسط A، فروشنده‌ی B می‌تواند چرخه‌ی جدید ثبت کند و کل تاریخچه‌ی قبلی مشتری (شامل چرخه‌های A) برایش قابل‌مشاهده می‌ماند. هیچ‌کدام از ۶ کاربر نمونه‌ی خزانه‌داری تغییر نکردند؛ `isDualRole`, `approvalChain`, `allowedApproverIds` و هیچ اینترفیس موجودی در `types.ts` دست نخوردند — فقط موارد کاملاً جدید اضافه شدند.

---

### Date: 2026-08-05

**Decision:**
مرج نهایی دو شاخه‌ی آماده (`feature/multi-tab-navigation` و `feature/multi-role-permissions`) داخل `stable`، به ترتیب:

۱. **`feature/multi-tab-navigation` → `stable`**: fast-forward بدون conflict (چون `stable` از قبل هیچ کامیت جدیدی نداشت).
۲. **`feature/multi-role-permissions` → `stable`**: ۶ فایل conflict داشتند (`AGENTS.md`, `DECISION_LOG.md`, `docs/MODULES_DOCUMENTATION.md`, `src/App.tsx`, `src/components/Sidebar.tsx`, `src/utils/storage.ts`) — همگی با اصل «حفظ کامل هر دو فیچر» حل شدند:
   - `AGENTS.md`/`DECISION_LOG.md`: هر دو مجموعه قانون/تصمیم به‌صورت متوالی (نه جایگزین یکدیگر) نگه داشته شدند؛ بندهای `AGENTS.md` بازشماری شدند (۱۲-۱۳ چندتبی، ۱۴-۱۵ چندنقشی/مشتری).
   - `docs/MODULES_DOCUMENTATION.md`: دو بخش مجزا (۹ چندتبی، ۱۰ ماژول فروش) نگه داشته شدند.
   - `src/utils/storage.ts`: هر دو کلید (`TAB_USAGE` و `CUSTOMERS`) و هر دو مجموعه متد (`getTabUsage`/`saveTabUsage`/`recordTabUsage` و `getCustomers`/`saveCustomers`) نگه داشته شدند.
   - `src/components/Sidebar.tsx`: بلوک تکراری/قدیمی «خدمات پس از فروش» (نسخه‌ی pre-reorg از شاخه‌ی چندتبی) حذف و فقط نسخه‌ی گروه‌بندی‌شده‌ی نهایی نگه داشته شد؛ یک `setActiveTab` باقی‌مانده در همان بلوک به `onOpenTab` تبدیل شد.
   - `src/App.tsx`: بلوک `activeTab === 'customers'` (الگوی تک‌مقصدی قدیمی) به الگوی چندتبی `tab.id === 'customers'` تبدیل و کنار `vendor_categories` قرار گرفت؛ بلوک تکراری `activeTab === 'colleagues'` حذف شد چون نسخه‌ی `tab.id === 'colleagues'` از قبل در `App.tsx` وجود داشت.
۳. **رفع یک شکاف کشف‌شده حین حل conflict**: تب `customers` در رجیستری مشترک `TAB_DEFINITIONS` (`src/components/TabBar.tsx`) تعریف نشده بود (چون این رجیستری روی شاخه‌ی چندتبی ساخته شده بود، پیش از وجود ماژول فروش) — یک ورودی `{ label: 'مشتریان', icon: Contact }` اضافه شد تا نوار تب برای این View هم آیکون/عنوان صحیح نشان دهد.
۴. **مستندات**: `docs/DATABASE_DOCUMENTATION.md`/`docs/BUSINESS_RULES.md` بدون conflict merge شدند و بدون نیاز به تغییر محتوایی بودند (چون فقط شاخه‌ی چندنقشی/مشتری آن‌ها را لمس کرده بود). `docs/CODE_STRUCTURE.md` (بدون conflict merge شد) برای انعکاس مدل ناوبری چندتبی در بخش «نحوه ارتباط فایل‌ها» به‌روزرسانی شد. `docs/SALES_ARCHITECTURE_DRAFT.md` طبق دستور صریح دست‌نخورده ماند (سند طراحی در حال گفتگو، نه پیاده‌سازی نهایی).

**Reason:**
هر دو شاخه از نظر کاربر «آماده» بودند و باید هم‌زمان در `stable` (شاخه‌ی مرجع تولید) در دسترس باشند؛ merge متوالی (نه rebase یا cherry-pick) انتخاب شد تا تاریخچه‌ی کامل هر دو فیچر حفظ شود.

**Impact:**
`stable` اکنون شامل هر سه فیچر است: ناوبری چندتبی شبیه مرورگر + ویجت پرکاربردترین منوها، مدل چندنقشی کاربران (`getEffectiveUserPermissions`)، و ماژول فروش مشتری با قفل مالکیت پویا. تست دستی پس از merge (لاگین ادمین + شبیه‌سازی دو کاربر نمونه فروش) نشان داد داشبورد، سایدبار (شامل آیتم «مشتریان» و گروه «کاربران»)، و باز شدن/سوییچ تب‌ها بدون خطا کار می‌کنند. `npm run lint` (`tsc --noEmit`) بعد از هر مرحله (هر دو merge + رفع conflict + به‌روزرسانی مستندات) بدون خطا پاس شد. هیچ‌کدام از ۹ کاربر نمونه (۶ خزانه‌داری + ۳ فروش) و هیچ‌کدام از خط‌قرمزها (`isDualRole`, `approvalChain`, `allowedApproverIds`, rename اینترفیس) لمس نشدند.

---

### Date: 2026-08-11

**Title:** Sales domain formalization decisions after business discovery

**Context:**
پس از ممیزی دانش Sales، پنج موضوع پایه که برای مدل دامنه و جلوگیری از پرسش تکراری لازم بودند، با تصمیم صریح کسب‌وکار نهایی شدند. این تصمیم‌ها طراحی آینده‌اند و رفتار CURRENT یا implementation موجود را تغییر نمی‌دهند.

**Decision:**

1. `Person/Party`، `Prospect`، `Lead`، `Opportunity`، `Sale` و `Invoice` مفاهیم مستقل دامنه‌اند؛ UI همچنان ساده باقی می‌ماند.
2. Contract رابطه تجاری، طرف‌های مسئول، Invoice issuer، payment receiver، economic ownership، revenue share و حقوق اشتراک داده را تعیین می‌کند؛ `mother company` مفهوم hard-coded platform نیست.
3. Pricing به‌صورت Rule-based و با precedence، Discount stacking، margin protection و approval limitهای قابل تنظیم تعریف می‌شود.
4. هویت Customer می‌تواند سراسری شناخته شود، اما company isolation الزامی است و visibility/sharing فقط با permission، Contract و policy مجاز انجام می‌شود.
5. Tapra2، `Sales system of record` اصلی است؛ منابع قدیمی و بیرونی از مسیر `Import → Validate → Reconcile → Parallel verification → Retire old CRM` مهاجرت می‌کنند.

**Affected authority documents:**

- `docs/domains/sales/approved-design.md`
- `docs/domains/sales/open-questions.md`

**Impact:**
پنج موضوع پایه دیگر open محسوب نمی‌شوند و پرسش‌های موجود مرتبط از فهرست DRAFT حذف شدند؛ جزئیات مالی deferred، state machineها، reconciliation، rollout و تصمیم‌های اجرایی همچنان DRAFT باقی می‌مانند. هیچ application code، package configuration یا runtime behavior تغییر نکرد.

---

### Date: 2026-08-11

**Title:** Tapra2 cross-domain product principles after Sales formalization

**Context:**
Formalization دامنه Sales چند اصل مشترک درباره multi-company، identity، workflow، system of record، AI، UX و audit را روشن کرد که فقط متعلق به Sales نیستند. پراکنده‌ماندن این اصول در اسناد domain باعث تکرار سؤال و ناسازگاری طراحی domainهای آینده می‌شد.

**Decision:**
سند authoritative جدید `docs/architecture/product-principles.md` با وضعیت `APPROVED-FUTURE` ایجاد شد تا Vision و اصول cross-domain آینده Tapra2 را بدون تکرار قواعد جزئی domainها نگهداری کند. Sales همچنان authority جزئیات خود را در `docs/domains/sales/approved-design.md` حفظ می‌کند.

**Reason:**
عامل‌های AI، توسعه‌دهندگان و معماران آینده باید پیش از طراحی domain جدید بدانند Tapra2 به‌سمت platform منعطف چندشرکتی `ERP / Automation / AI` حرکت می‌کند و اصول data isolation، Contract/permission-based sharing، workflow versioning، policy-governed AI، UI ساده و history غیرقابل‌تخریب قبلاً پذیرفته شده‌اند.

**Impact:**
مالکیت اصول cross-domain در documentation index ثبت شد. این تصمیم implementation، معماری runtime، application code، package configuration یا رفتار CURRENT را تغییر نمی‌دهد.

---

### Date: 2026-08-11

**Title:** SaaS foundation architecture decision pack accepted

**Decision:**
هفت ADR بنیاد SaaS در `docs/decisions/adr/` پذیرفته شدند: مدل Hybrid Tenant/Workspace، Modular Monolith، PostgreSQL و tenancy enforcement، Identity/session/authorization، Audit/Outbox/reliability، مهاجرت تدریجی Prototype و مرزهای Data/AI/Security.

**Impact:**
این تصمیم‌ها جهت implementation آینده را تثبیت و از architectural drift جلوگیری می‌کنند، اما رفتار `CURRENT` نیستند و هیچ application code، package/config یا runtime behavior را تغییر نمی‌دهند. انتخاب‌های غیرضروری برای Foundation در ADRها صریحاً deferred شده‌اند.

---

### Date: 2026-08-11

**Title:** Foundation Sprint 1 vertical slice implemented

**Context:**
پس از پذیرش ADRهای Foundation، نخستین برش production-shaped برای اثبات مسیر end-to-end بدون مهاجرت یا حذف داده Prototype اجرا شد.

**Decision:**
Foundation فعلی از Express modular monolith، PostgreSQL، session opaque server-side، مدل Workspace/Company/Membership، permission سمت server، Customer create/read، RLS tenant isolation و AuditEntry تراکنشی استفاده می‌کند. Web client از مسیر متمرکز API به این Foundation متصل است و مسیر `Prototype / localStorage` را جدا و دست‌نخورده حفظ می‌کند. Docker Compose روش reproducible رسمی development است و PostgreSQL native فقط fallback محلی مبتنی بر environment باقی می‌ماند.

**Impact:**
این بخش‌های محدود اکنون `CURRENT` هستند و با integration test اعتبارسنجی می‌شوند. سایر domainهای Prototype، migration داده قدیمی، Outbox، MFA، backup production و طراحی کامل Sales/API همچنان خارج از این vertical slice و مطابق status اسناد خود باقی می‌مانند.

---

### Date: 2026-08-11

**Title:** Customer 360 identity foundation implemented

**Decision:**
Customer به‌عنوان profile والد حفظ شد و phone/address چندتایی، provenance، timeline server-generated و duplicate candidate deterministic به آن افزوده شد. merge فقط میان Customerهای قابل‌مشاهده در همان Workspace/Company انجام می‌شود، canonical با ترتیب `created_at` سپس UUID انتخاب می‌گردد و profile بازنده یا relationهای آن حذف نمی‌شوند. `customer_merge_operations` lineage و snapshot را نگه می‌دارد و unmerge واقعی profile مستقل را بازمی‌گرداند.

**Reason:**
هویت مشتری باید پیش از Lead، Invoice یا import انبوه، پایدار، قابل‌ردیابی و در برابر تطبیق اشتباه قابل‌بازیابی باشد.

**Impact:**
Customer 360 foundation اکنون `CURRENT` است و با PostgreSQL integration test پوشش دارد. fuzzy matching، cross-Workspace identity linking، AI resolution و import حجیم همچنان deferred هستند. Prototype و داده `localStorage` تغییری نکرده‌اند.

---

### Date: 2026-08-11

**Title:** PR #1 preserved without direct merge

**Context:**
PR #1 روی base قدیمی و موازی با مسیر canonical ساخته شده بود. کد امنیت/RBAC آن در canonical حفظ یا توسعه یافته، اما دو سند تحلیلی آن هنوز به‌صورت شاهد تاریخی مستقل در source-of-truth جدید وجود نداشتند.

**Decision:**
PR #1 مستقیماً merge نمی‌شود. دو سند یکتای آن در `docs/archive/pr-1/` با وضعیت `HISTORICAL` حفظ و نتیجه مقایسه کد در README همان پوشه ثبت شد. authorityهای فعلی و آینده در `docs/README.md` بدون تغییر مالکیت باقی می‌مانند.

**Reason:**
این روش دانش و rationale یکتا را حفظ می‌کند، ولی از بازگرداندن login محلی، اسناد legacy و مدل Prototype روی Foundation SaaS جلوگیری می‌کند.

**Impact:**
هیچ application code، package configuration یا runtime behavior تغییر نکرد. PR #1 پس از review انسانی می‌تواند بدون merge به‌عنوان superseded بسته شود؛ branch یا تاریخچه آن در این task حذف نمی‌شود.

---

### Date: 2026-08-11

**Title:** GitHub stable declared canonical source of truth

**Decision:**
پس از promotion مرحله‌ای PRهای #2 تا #6 و موفقیت fresh clone verification، branch `stable` در `https://github.com/rbayat2k-art/tapra2.git` تنها منبع رسمی کد و مستندات فعال Tapra2 است. همه کارهای آینده باید از آخرین `origin/stable` یا branch تأییدشده‌ای که مستقیماً بر آن مبتنی است آغاز شوند.

**Evidence:**
Fresh clone در `C:\Users\iLia\Documents\Tapra2\canonical` از `stable@fcc3523c` ساخته شد و install از lockfile، migration تکراری، typecheck، build، `416/416` test و visual validation کامل را گذراند.

**Impact:**
checkoutهای قدیمی و Codex workspaceهای قبلی source branch آینده نیستند. ZIP legacy و forensic extraction فقط archive/recovery evidence باقی می‌مانند. هیچ فایل محلی، branch یا داده PostgreSQL در این تصمیم حذف نشد.

---

### Date: 2026-08-11

**Title:** Legacy archive consolidation and support-refund safeguards recovered

**Context:**
پیش از cleanup checkoutهای قدیمی، پنج مسیر legacy و PR #1 با `origin/stable` مقایسه شدند. stash تاریخی `684c3a67` دو تصمیم ثبت‌نشده داشت: سخت‌سازی مالی عودت و پروتکل branch/approval. کد سخت‌سازی عودت از قبل در canonical وجود داشت، اما authority پشتیبانی همه invariantها را صریح ثبت نکرده بود.

**Decision:**
قواعد ضد پرداخت تکراری، منع reset پس از اتصال به خزانه، دلیل اجباری لغو تأیید، atomic بودن validation batch و منع بستن پرونده تا نتیجه نهایی همه ردیف‌ها به‌عنوان رفتار `CURRENT` در `docs/domains/support/business-rules.md` ثبت شدند. این ادعاها با `supportRefundWorkflow.ts`، تست‌های آن، `App.tsx` و `SupportCaseDetailModal.tsx` اعتبارسنجی شدند.

پروتکل branch قدیمی به‌عنوان تاریخچه حفظ شد، اما authority فعال آن `AGENTS.md` و `docs/engineering/source-of-truth.md` است. فایل مستقل `tapra_preview.jsx` نیز فقط به‌عنوان artifact تاریخی در `docs/archive/legacy-product/` نگهداری شد و وارد runtime نشد.

**Impact:**
دانش یکتای معتبر بدون بازگرداندن معماری localStorage یا تغییر Backend/PostgreSQL/Customer 360 حفظ شد. هیچ application code، package configuration، migration، database یا runtime behavior تغییر نکرد. مسیرهای legacy فقط پس از تأیید cleanup جداگانه قابل حذف‌اند.

---

### Date: 2026-08-11

**Title:** Sales Lead queue vertical slice implemented

**Context:**
UI معتبر Sales برای Lead، صف، تخصیص و ثبت تماس در Prototype وجود داشت، اما داده و permission آن server-backed نبود. Customer identity قبلاً در سطح Workspace و relationship عملیاتی آن در سطح Company تثبیت شده بود.

**Decision:**
برش `Customer 360 → Lead → Assignment → Sales Queue → Call Log` با PostgreSQL، `FORCE RLS`، permission سمت server، history و Audit اجرا شد. seller فقط صف membership خود را می‌بیند و امکان self-claim یا تماس روی Lead فروشنده دیگر ندارد. manager می‌تواند با reason و Audit بازتخصیص دهد. تماس ناموفق relationship/lock دائمی ایجاد نمی‌کند؛ تماس مؤثر طبق `sales_policies` قابل‌تنظیم relationship/lock ایجاد می‌کند و پایان شیفت به‌طور خودکار open work را منتقل نمی‌کند.

**Impact:**
این برش محدود اکنون `CURRENT` است و authority آن `docs/domains/sales/current-lead-operations.md` است. Full Campaign/Promotion engine، Invoice، Commission، AI Sales، تخصیص rule-based و migration خودکار داده Sales قدیمی همچنان Prototype، `APPROVED-FUTURE` یا `DRAFT` باقی می‌مانند. هیچ داده `localStorage` حذف یا خودکار migrate نشد.

---

### Date: 2026-08-11

**Title:** Sales Campaign/Promotion context linkage implemented

**Context:**
Lead و relationship فروش به context بازاریابی نیاز داشتند، ولی ساخت موتور کامل Campaign/Promotion، pricing یا eligibility خارج از این Run بود. تاریخچه تماس نیز نباید با تغییر context آینده بازنویسی شود.

**Decision:**
referenceهای typed از نوع `campaign` و `promotion` در `sales_lead_marketing_links` به Lead و relationship همان Company متصل می‌شوند. فقط manager دارای `sales.marketing.link` می‌تواند linkage جدید بسازد. هر Call Log snapshot مستقل linkهای موجود در لحظه تماس را نگه می‌دارد و اتصال بعدی، تماس قبلی را تغییر نمی‌دهد. همه عملیات زیر permission سمت server، `FORCE RLS`، Customer/relationship history و Audit اجرا می‌شوند.

**Impact:**
linkage و snapshot بازاریابی اکنون `CURRENT` هستند، اما مدیریت Campaign/Promotion، lead generation، eligibility، pricing و discount همچنان Prototype یا `APPROVED-FUTURE` باقی می‌مانند. هیچ Business Rule تازه‌ای برای قیمت یا صلاحیت فروش ایجاد نشد.

---

### Date: 2026-08-15

**Title:** Central Customer identity separated from Company relationship reconciliation

**Context:**
Customer 360 پیش از این Identity و normalized phone مشترک Workspace داشت، اما `customer_merge_operations` فقط profileهای همان Company را merge می‌کرد و lifecycle مستقل برای تشخیص اینکه دو Identity با شماره‌های متفاوت واقعاً یک شخص‌اند وجود نداشت.

**Decision:**
`identity_id` به‌عنوان lineage تاریخی و تغییرناپذیر relationship حفظ می‌شود و `canonical_identity_id` مرجع فعال برای اتصال‌های آینده است. merge رابطه Company-scoped و reconciliation هویت Workspace-scoped دو operation مستقل‌اند. reconciliation مرکزی فقط با permission اختصاصی و `WORKSPACE` Scope اجرا می‌شود، Identity بازنده را حذف نمی‌کند، canonical را deterministic انتخاب می‌کند و lineage، Audit، reason و reverse را در `customer_identity_merge_operations` نگه می‌دارد.

**Reason:**
یک شخص باید در Workspace یک هویت منطقی پایدار داشته باشد، بدون آن‌که داده عملیاتی Companyها مخلوط یا وجود رابطه Company دیگر افشا شود. حفظ alias به‌جای حذف یا بازنویسی ID همچنین referenceهای قبلی و recovery را ایمن نگه می‌دارد.

**Impact:**
referenceهای آینده مانند Lead و Invoice باید `canonical_identity_id` را نگه دارند و در صورت نیاز lineage ID اولیه را resolve کنند. PRهای قدیمی Sales که مستقیماً به `customers.identity_id` یا migration numbering قبلی وابسته‌اند، پیش از merge باید با migrationهای `0011` و `0012` تطبیق داده شوند. هیچ Sales/Invoice/Finance feature در این تصمیم پیاده‌سازی نشد.

---

### Date: 2026-08-15

**Title:** Sales Lead slice adapted to canonical Customer identity and Organization Scope

**Context:**
PR #10 پیش از migrationهای Organization/Identity ساخته شده بود و شماره‌های `0009`/`0010`، reference مستقیم هویت قدیمی و انتخاب context فقط بر پایه Membership داشت.

**Decision:**
migrationهای Sales به `0013` و `0014` منتقل شدند. Lead، Call Log و Sales relationship مقدار `canonical_identity_id` را نگه می‌دارند و `customer_id` برای relationship عملیاتی Company حفظ می‌شود. reconciliation مرکزی این referenceها را در merge/unmerge همراه lineage به‌روزرسانی می‌کند. Sales فقط در Context امن `COMPANY` یا `SELF` دارای Company اجرا می‌شود؛ Scopeهای واحد سازمانی تا زمان attribution صریح Lead fail-closed هستند.

**Impact:**
رفتار قبلی Lead، Queue، Assignment/Reassignment، Call Log، lock policy و Campaign/Promotion linkage حفظ شد، درحالی‌که RLS، Audit، Customer 360، Import و مدل Scope جدید تضعیف نشدند. هیچ Feature جدید Sales یا Business Rule تازه اضافه نشد.

---

### Date: 2026-08-15

**Title:** Sale entry modes, Customer Resolution and multi-Payment Invoice flow approved

**Context:**
برای طراحی ادامه Sales لازم بود تفاوت فروشنده واقعی با ثبت‌کننده سیستم، مسیر Customer Resolution و مرز اعلام واریز با تأیید مالی روشن شود. این تصمیم‌ها قواعد آینده‌اند؛ Backend Invoice/Payment و ثبت Sale هنوز پیاده‌سازی نشده‌اند.

**Decision:**

1. Sale می‌تواند `DIRECT` باشد که seller و actor همان فروشنده‌اند، یا `PAPER_ENTRY` که seller فروشنده واقعی و actor ثبات است. KPI/attribution در مسیر کاغذی برای seller حفظ می‌شود و نبود Call Log قبلی به‌تنهایی Sale را نامعتبر نمی‌کند.
2. پیش از ایجاد Customer، شماره بررسی می‌شود: تطبیق قطعی از Identity موجود استفاده می‌کند، نبود تطبیق profile جدید می‌سازد و مورد مشکوک به بررسی انسانی می‌رود؛ duplicate کورکورانه مجاز نیست.
3. یک Invoice می‌تواند چند Payment مستقل داشته باشد. اعلام واریز با تأیید مالی متفاوت است و مالی هر Payment را مستقل `APPROVED` یا `RETURNED / NEEDS_CORRECTION` می‌کند. بازگشت دلیل می‌خواهد و فقط همان Payment را متاثر می‌کند. وضعیت مالی Invoice از مجموع Paymentهای تأییدشده محاسبه می‌شود.

**Affected authority documents:**

- `docs/domains/sales/current-customer.md` برای Customer Resolution اجراشده؛
- `docs/domains/sales/approved-design.md` برای Sale/Invoice/Payment آینده؛
- `docs/domains/sales/open-questions.md` برای جزئیات state machine و policyهای حل‌نشده.

**Impact:**
دانش کسب‌وکار در source of truth ثبت شد، ولی هیچ application code، migration، API، database یا runtime behavior تغییر نکرد. Sale entry و Invoice/Payment تا زمان implementation و validation با وضعیت `APPROVED-FUTURE` باقی می‌مانند.

---

### Date: 2026-08-15

**Title:** Invoice release, fulfillment, cancellation and payment exception policies approved

**Context:**
پیش از Backend کردن Invoice و Fulfillment لازم بود مرز پرداخت کامل، Inventory reservation، اجرای مستقل Lineها، Warehouse چندشرکتی، Shipment جزئی، Service completion، لغو و exceptionهای مالی بدون اتکا به Prototype مشخص شود.

**Decision:**

1. تا مجموع Paymentهای `APPROVED` دقیقاً با مبلغ Invoice برابر نباشد هیچ Line وارد اجرا و هیچ Inventory رزرو نمی‌شود. اضافه‌پرداخت و Chargeback پرونده exception مستقل می‌سازند و تاریخچه را بازنویسی نمی‌کنند.
2. پس از Financial Approval، Lineهای کالا و خدمت مستقل اجرا می‌شوند؛ نبود موجودی فقط Line کالا را در انتظار نگه می‌دارد. ارسال جزئی پشتیبانی می‌شود ولی پیش‌فرض ارسال کامل است و ارسال جزئی Permission و تأیید Customer می‌خواهد.
3. Warehouse location، مالک اقتصادی، seller، fulfillment company و operator unit مستقل‌اند. در Single-company این پیچیدگی پشت‌صحنه به همان Company resolve می‌شود؛ در Multi-company، Contract و permission مرجع‌اند و Shared Service شرکت مصنوعی نیست.
4. `COD` در مدل حفظ ولی در Flow عادی غیرفعال است. Payment method، Financial Account و Payment Gateway قابل مدیریت Company-scoped هستند و UI همه statusها را فارسی نمایش می‌دهد.
5. روش Service از گزینه‌های مجاز Catalog/Contract هنگام Sale انتخاب و snapshot می‌شود. Evidence، manager review، Customer Confirmation و نقطه `BILLABLE` از policy همان Service به دست می‌آیند.
6. درخواست لغو در تمام مراحل ممکن است، ولی بعد از Financial Approval یا شروع اجرا از Support Case و تصمیم Line-level عبور می‌کند. Shipment/Service تکمیل‌شده حذف یا جعل معکوس نمی‌شود.
7. Invoice با تغییر مهم revision تازه و re-approval می‌گیرد؛ تغییر کم‌خطر فقط Audit می‌شود. Permissionهای edit/correct/amend مستقل و server-side هستند.

**Affected authority documents:**

- `docs/domains/sales/fulfillment-policy.md` برای قواعد تفصیلی پذیرفته‌شده؛
- `docs/domains/sales/approved-design.md` برای جهت کلی Sales؛
- `docs/domains/sales/open-questions.md` برای جزئیات واقعاً حل‌نشده implementation.

**Impact:**
این تصمیم‌ها `APPROVED-FUTURE` هستند. Implementation باید از vertical slice `Sale → Invoice → Payment → Financial Review` آغاز شود و قبل از code معتبر، هیچ قابلیت Invoice/Fulfillment به‌عنوان CURRENT معرفی نشود.

---

### Date: 2026-08-16

**Title:** Payment review safety and Company-scoped Sales configuration implemented

**Context:**
بازبینی پیش از merge PR #15 چهار gap اجرایی را نشان داد: استفاده از `JavaScript number` برای Rial، state مستقل و تصویب‌نشده `rejected`، نبود maker-checker کامل در Impersonation و وابستگی تنظیمات حساب وصول/تأیید سرپرست به seed. همچنین upgrade تاریخچه دقیق migrationهای قدیمی Sales باید به‌صورت خودکار اثبات می‌شد.

**Decision:**
مبلغ‌های API به رشته decimal صحیح Rial، محاسبه Backend به `bigint` و ذخیره PostgreSQL به `bigint` محدود شد. Payment پس از ثبت `submitted` است و review فقط `approved` یا `needs_correction` دارد؛ برگشت reason می‌خواهد و correction رکورد قبلی را `superseded` می‌کند. Financial Review در Impersonation ممنوع است و actor واقعی و user مؤثر سازنده Payment هیچ‌کدام reviewer همان Payment نمی‌شوند. overpayment هنگام approval fail-closed است.

الزام تأیید سرپرست policy قابل‌مدیریت Company است که پیش‌فرض روشن دارد و هنگام ساخت روی Invoice snapshot می‌شود. حساب وصول با reference پوشیده و Permission مستقل ایجاد/ویرایش/فعال‌غیرفعال می‌شود. Company تازه تمام policyهای لازم Sales را اتمیک دریافت می‌کند. Gateway اجرایی در این Slice ساخته نشد. Scopeهای `BRANCH`، `DEPARTMENT` و `TEAM` برای Sale/Invoice تا attribution صریح Line همچنان fail-closed هستند.

**Evidence:**
`server/migrations/0016_payment_review_safety.sql`، `server/migrations/0017_sales_collection_policy.sql`، `server/tests/sales.integration.test.ts` و `server/tests/sales-migration-compatibility.test.ts`.

**Impact:**
authority CURRENT این رفتار [فروش، فاکتور و پرداخت فعلی](../domains/sales/current-invoice-payment.md) است. migrationهای `0015` و تاریخچه قبلی بازنویسی نشدند؛ اصلاح‌ها فقط با migrationهای افزایشی اعمال شدند. Warehouse، Shipment، Service Fulfillment، Refund، accounting ledger و Payment Gateway اجرایی همچنان خارج از محدوده CURRENT هستند.

---

### Date: 2026-08-16

**Title:** Payment correction lineage separated from business status

**Context:**
بازبینی نهایی PR #15 نشان داد `superseded` نباید status چهارم Payment باشد. lifecycle مصوب Payment فقط `submitted`، `approved` و `needs_correction` است و در عین حال تاریخچه correction باید بدون حذف یا overwrite باقی بماند.

**Decision:**
Payment برگشتی پس از ساخته‌شدن correction همچنان `needs_correction` می‌ماند. رکورد جدید `submitted` است؛ `corrects_payment_id` روی revision جدید و `superseded_by_payment_id` روی رکورد قبلی lineage دوطرفه و current revision را مشخص می‌کنند. queryهای عملیاتی فقط revision فاقد `superseded_by_payment_id` را actionable می‌دانند. migration افزایشی `0018` داده‌های معتبر قبلی را تبدیل، constraint سه‌حالته را enforce و description مجوز `sales.payment.review` را با wording «Approve or return ... for correction» همسان می‌کند.

**Impact:**
هیچ history، review reason یا Audit حذف نمی‌شود؛ migrationهای `0015`، `0016` و `0017` بازنویسی نمی‌شوند. هر lineage ناقص در زمان migration fail-safe متوقف می‌شود تا تبدیل مبهم یا مخرب انجام نشود.

---

### Date: 2026-08-17

**Title:** Role and Permission Foundation approved as least-privilege CURRENT bundles

**Context:**
seed توسعه Roleهای `workspace_admin` و `customer_manager` را با permissionهای چند دامنه ترکیب می‌کرد و UI انبار با داشتن `warehouse.read` همه فرم‌های mutation را نشان می‌داد. این دادهٔ توسعه نباید طراحی Role تولیدی تلقی می‌شد و قرارداد maker-checker باید در packaging و presentation نیز روشن می‌ماند.

**Decision:**
authorization فقط از `Permission + Scope + Resource Policy` می‌آید و Role نام یک bundle convenience است. Workspace Admin فقط هفت permission سازمانی دارد. Seller، Sales Supervisor، Sales Manager و PAPER_ENTRY Operator جدا هستند؛ Payment Recorder از Financial Reviewer و Inventory Maker از Inventory Approver جداست. Senior Sales Supervisor و Sales Deputy با Role مدیریتی و Scope گسترده‌تر مدل می‌شوند و تا تصویب مسئولیت متمایز Role تازه نمی‌گیرند. Scope پشتیبانی‌نشده fail-closed و approval حساس در Impersonation ممنوع می‌ماند. ماژول‌های Legacy/Prototype صرفاً به‌عنوان دانش حفظ می‌شوند و با این foundation authority تولیدی نمی‌گیرند.

UI action فاقد permission را مخفی می‌کند؛ action مجاز با business precondition ناقص غیرفعال و همراه علت روشن فارسی است. seed bundleها را از catalog CURRENT همگام می‌کند و کاربر demo فقط برای پوشش integration چند bundle مستقل می‌گیرد.

**Impact:**
هیچ permission code یا migration تازه‌ای ساخته نشد. overgrant Roleهای seed حذف، bundleهای CURRENT قابل‌تست و actionهای Warehouse permission-aware شدند. maker-checker Backend و ممنوعیت Impersonation بدون تضعیف باقی ماندند؛ Treasury، Support، Chat، Letters، Communications، Catalog، Campaign، Coordination و Fulfillment ارتقا نیافتند.

---

### Date: 2026-08-17

**Title:** Product delivery is SINGLE-COMPANY-FIRST while multi-company architecture remains preserved

**Context:**
معماری Foundation از `Workspace → Company → Membership → Permission → Scope`، RLS و Company isolation پشتیبانی می‌کند، اما اولویت کوتاه‌مدت محصول باید تجربه عملیاتی ساده برای استقرار با یک Company فعال باشد. لازم بود این اولویت UX از حذف معماری یا تضعیف مرزهای امنیتی multi-company به‌روشنی تفکیک شود.

**Decision:**
Tapra2 فعلاً `SINGLE-COMPANY-FIRST` است. UI و Workflowهای جدید ابتدا برای یک Company فعال طراحی می‌شوند؛ در حالت تک‌شرکتی، Company تا حد ممکن خودکار انتخاب و پیچیدگی Workspace/Company از کاربر عملیاتی پنهان می‌شود. توسعه cross-company sales، inter-company settlement، Contract responsibility routing و multi-company operational workflows تا تصمیم صریح آینده Product Owner `DEFERRED` است.

این تصمیم فقط Product Scope و UX priority است. مدل Workspace/Company/Membership/Permission/Scope، تمام Company IDها، RLS، company isolation، تست‌های multi-company و مرزهای امنیتی بدون تغییر حفظ می‌شوند و multi-company از معماری حذف نمی‌شود.

**Impact:**
هیچ تغییر Backend، schema، migration یا authorization در این تصمیم انجام نمی‌شود. authority فعال این اولویت [Product Overview](../product/overview.md) است. توسعه‌دهندگان نباید قابلیت cross-company جدید بسازند مگر آن‌که Product Owner در تصمیمی صریح توسعه multi-company را دوباره فعال کند.
