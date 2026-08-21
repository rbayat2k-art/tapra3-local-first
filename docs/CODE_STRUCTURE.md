# 📁 ساختار کد و سازماندهی فایل‌ها (Code Structure & Organization)

> Migration classification: RETIRE_LATER
> Authority replacements: [current system](architecture/current-system.md) و [module catalog](product/module-catalog.md)

این محتوای legacy در Step 7 فقط برای review انتقالی نگهداری شده و authoritative نیست. بازنشستگی فیزیکی آن به تأیید جداگانه نیاز دارد.

## ۱. ساختار پوشه‌ها (Directory Tree)
ساختار پروژه به صورت ماژولار و تمیز در دایرکتوری اصلی سازماندهی شده است:

```text
/
├── .env.example              # نمونه متغیرهای محیطی
├── .gitignore                # فایل‌های نادیده‌گرفته شده در گیت
├── README.md                 # راهنمای عمومی پروژه
├── package.json              # وابستگی‌ها و اسکریپت‌های اجرایی
├── tsconfig.json             # تنظیمات تایپ‌اسکریپت
├── vite.config.ts            # تنظیمات بیلد و ویت
├── metadata.json             # متادیتای برنامک
├── docs/                     # مستندات جامع فنی ERP
│   ├── PROJECT_OVERVIEW.md
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── DATABASE_DOCUMENTATION.md
│   ├── MODULES_DOCUMENTATION.md
│   ├── CODE_STRUCTURE.md
│   ├── API_DOCUMENTATION.md
│   ├── BUSINESS_RULES.md
│   ├── DEVELOPMENT_GUIDE.md
│   └── AI_CONTEXT.md
└── src/
    ├── App.tsx               # کامپوننت اصلی و ریشه برنامک
    ├── main.tsx              # نقطه ورود React DOM
    ├── index.css             # استایل‌های سراسری Tailwind CSS
    ├── types.ts              # تعریف تمامی اینترفیس‌ها، تایپ‌ها و انام‌ها
    ├── components/           # کامپوننت‌های رابط کاربری و ویوها
    │   ├── AdminPanel.tsx              # پنل مدیریت پیشرفته ادمین
    │   ├── DashboardView.tsx           # داشبورد مدیریت و نمودارها
    │   ├── LettersView.tsx             # سامانه نامه‌نگاری و دبیرخانه
    │   ├── SupportView.tsx             # مدیریت خدمات پس از فروش و شکایات
    │   ├── VendorsView.tsx             # دفترچه تامین‌کنندگان
    │   ├── CustomersView.tsx           # ماژول فروش، گام اول: مشتریان (قفل مالکیت پویا + دید سلسله‌مراتبی)
    │   ├── CompaniesView.tsx           # مدیریت شرکت‌ها و بانک‌ها
    │   ├── CostCentersView.tsx         # مدیریت شعب و مراکز هزینه
    │   ├── MyRequestsView.tsx          # ثبت و پیگیری درخواست‌های کاربر
    │   ├── RequestTableView.tsx        # جدول کارتابل درخواست‌های سازمانی
    │   ├── WorkflowChartView.tsx       # نمودار گردش کار تاییدات
    │   ├── RolesAndPermissionsView.tsx # ماتریس نقش‌ها و دسترسی‌ها
    │   ├── Navbar.tsx                  # نوار بالایی و مشخصات کاربر
    │   ├── Sidebar.tsx                 # منوی ناوبری کناری
    │   ├── TabBar.tsx                  # نوار تب‌های باز (ناوبری چندتبی شبیه مرورگر) + رجیستری TAB_DEFINITIONS
    │   ├── StyleSettingsView.tsx       # تنظیمات ظاهری
    │   ├── NewRequestModal.tsx         # مودال ثبت درخواست جدید
    │   ├── RequestDetailModal.tsx      # مودال بررسی و تایید درخواست
    │   ├── LetterFormModal.tsx         # مودال ایجاد/ویرایش نامه
    │   ├── LetterDetailModal.tsx       # مودال جزئیات و ارجاع نامه
    │   ├── SupportCaseFormModal.tsx    # مودال ثبت پرونده پشتیبانی
    │   ├── SupportCaseDetailModal.tsx  # مودال بررسی پرونده پشتیبانی
    │   ├── BulkPaymentExportModal.tsx  # مودال خروجی پرداخت گروهی بانکی
    │   ├── PrintRequestModal.tsx       # مودال چاپ رسمی درخواست
    │   └── ... (سایر مودال‌ها و ویوها)
    └── utils/
        ├── storage.ts          # مدیریت حالت سراسری، LocalStorage و دیتای اولیه
        ├── permissions.ts      # محاسبه پرمیشن مؤثر کاربر در مدل چندنقشی (getEffectiveUserPermissions)
        ├── salesHierarchy.ts   # قفل مالکیت پویا و دید سلسله‌مراتبی مشتریان ماژول فروش
        ├── persianDate.ts      # توابع تبدیل و مدیریت تاریخ شمسی
        ├── numberToWords.ts    # تبدیل اعداد مالی به حروف فارسی
        └── bankFormats.ts      # اعتبارسنجی شماره شبا و حساب‌های بانکی
```

## ۲. مسئولیت هر پوشه و فایل (Responsibilities)
- **`src/types.ts`**: مرجع واحد و مرکزی تمام تایپ‌ها، مدل‌ها، پرمیشن‌ها (`SystemPermission`) و نقش‌های سیستم.
- **`src/utils/storage.ts`**: مدیریت دیتای اولیه غنی (کاربران، درخواست‌ها، شرکت‌ها، مراکز هزینه، نامه‌ها، تامین‌کنندگان) و هماهنگ‌سازی با `localStorage`.
- **`src/utils/permissions.ts`**: تابع `getEffectiveUserPermissions(user, roles)` که در مدل چندنقشی کاربران (`User.additionalRoleIds` + `User.roleAccessOverrides`)، پرمیشن مؤثر نهایی یک کاربر را از روی نقش پایه + نقش‌های اضافه + بازنویسی‌های اختصاصی + `customPermissions` محاسبه می‌کند؛ توسط `Sidebar.tsx` برای ساخت منو استفاده می‌شود.
- **`src/utils/salesHierarchy.ts`**: `getVisibleCustomerIds`, `findCustomerByPhone`, `canStartNewSale`, `getCurrentActiveSalespersonId`, `startNewSaleCycle`, `closeSaleCycle` — منطق قفل مالکیت پویا و دید سلسله‌مراتبی مشتریان ماژول فروش، بر پایه‌ی `User.salesSupervisorId` (مستقل از `approvalChain` خزانه‌داری).
- **`src/components/`**: حاوی ویوهای اصلی (Views) و مودال‌های تعاملی (Modals) که بر اساس وظیفه کسب‌وکاری جداسازی شده‌اند.
- **`src/utils/`**: توابع کمکی محاسباتی، تبدیل اعداد به حروف، اعتبارسنجی بانکی، تقویم و محاسبه دسترسی.

## ۳. نحوه ارتباط فایل‌ها (Communication Flow)
- فایل `App.tsx` به عنوان کنترلر اصلی، کاربر لاگین‌شده را می‌شناسد و ناوبری برنامه را بر پایه‌ی مدل **چندتبی شبیه مرورگر** (`openTabs`/`activeTabId` + `openTab`/`closeTab`) مدیریت می‌کند؛ `Sidebar.tsx`/`Navbar.tsx` با فراخوانی `onOpenTab(tabId, label?)` تب جدید باز می‌کنند و `src/components/TabBar.tsx` (به همراه رجیستری `TAB_DEFINITIONS`) نوار تب‌های باز را رندر می‌کند. هر View فقط وقتی تبش باز است mount می‌ماند؛ سوییچ بین تب‌ها فقط نمایش/عدم‌نمایش (`display`) را عوض می‌کند، نه mount/unmount را.
- کامپوننت‌ها به کمک توابع موجود در `src/utils/storage.ts` اطلاعات را خوانده و با ذخیره مجدد، تغییرات را در کل سیستم بازتاب می‌دهند.
